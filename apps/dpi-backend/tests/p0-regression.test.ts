import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { DatabaseSync } from "node:sqlite";
import { join, resolve } from "node:path";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { DpiClient } from "../../dpi-sdk/src/client.js";
import { bootServer, faux, newToken, tempStore } from "./helpers.js";
import type { SessionRow } from "../src/store.js";

test("P0: competing catalogs cannot resume the same session owner; SIGKILL releases stale ownership", async () => {
  const t = await tempStore();
  const children: ChildProcess[] = [];
  const stop = async (child: ChildProcess) => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const exited = once(child, "exit");
    child.kill("SIGKILL");
    await exited;
  };
  const launch = async (index: number, row: SessionRow) => {
    const child = spawn(process.execPath, ["--import", "tsx", resolve(import.meta.dirname, "fixtures/p0-owner.ts"), join(t.root, `owner-${index}`), t.work, JSON.stringify(row)], {
      env: { ...process.env, HOME: join(t.root, `home-${index}`) },
      stdio: ["ignore", "ignore", "pipe", "ipc"],
    });
    children.push(child);
    let errors = "";
    child.stderr?.on("data", (chunk) => { errors += chunk; });
    const [ready] = await once(child, "message", { signal: AbortSignal.timeout(20000) });
    assert.equal(ready.phase, "ready", errors);
    return child;
  };
  try {
    const store = await t.open();
    let row: SessionRow;
    try {
      const session = await store.create({ name: "Shared owner", cwd: t.work, model: faux });
      row = store.row(session.id);
    } finally {
      await store.close();
    }
    const first = await launch(1, row);
    const second = await launch(2, row);
    const results = [first, second].map((child) => once(child, "message", { signal: AbortSignal.timeout(20000) }));
    first.send("open");
    second.send("open");
    const outcomes = (await Promise.all(results)).map(([message]) => message);
    assert.deepEqual(outcomes.map((message) => message.phase).sort(), ["acquired", "rejected"]);
    assert.match(outcomes.find((message) => message.phase === "rejected").error, /already owned/);
    const winner = outcomes.findIndex((message) => message.phase === "acquired");
    assert.equal(outcomes[winner].conversationId, 1);
    await stop([first, second][winner]);
    const replacement = await launch(3, row);
    const acquired = once(replacement, "message", { signal: AbortSignal.timeout(20000) });
    replacement.send("open");
    const [message] = await acquired;
    assert.equal(message.phase, "acquired");
    assert.equal(message.conversationId, 1, "recovery opens the existing native conversation");
  } finally {
    await Promise.all(children.map(stop));
    await t.cleanup();
  }
});

test("P0: unavailable persisted model is rejected before resume, never remapped to faux echo", async () => {
  const t = await tempStore();
  let store = await t.open();
  try {
    const session = await store.create({ name: "Missing model", cwd: t.work, model: faux });
    const { c } = await store.resolveAgent(session.id, "main");
    await c.configure({ model: { provider: "faux", modelId: "removed-model-sentinel" } }, BACKGROUND_CONTEXT);
    await store.close();
    store = await t.open();
    assert.equal(store.opened.has(session.id), false, "an unavailable model must not reach the set of Harness instances resumed by Store.open");
    assert.equal(store.errors.get(session.id), "Internal error", "cached public failures must not expose native initialization causes");
    await assert.rejects(() => store.resolveAgent(session.id, "main"), { code: "unavailable", status: 503 });
    const native = new DatabaseSync(store.resolveSession(session.id).dbPath, { readOnly: true });
    try {
      const saved = native.prepare("SELECT r.kind,r.content FROM document_revisions r JOIN documents d ON d.id=r.document_id WHERE d.kind=? AND d.owner_id=? ORDER BY r.seq DESC LIMIT 1").get(JSON.stringify("pi.agent"), c.id) as { kind: string; content: string };
      assert.equal(saved.kind, "base");
      assert.deepEqual(JSON.parse(saved.content).model, { provider: "faux", modelId: "removed-model-sentinel" }, "refusal preserves the actual native model identity; it is not rewritten to faux echo");
    } finally { native.close(); }
  } finally {
    await store.close();
    await t.cleanup();
  }
});

test("P0: native submission identity and tool result survive SIGKILL and identical HTTP retry", async () => {
  const t = await tempStore();
  const token = newToken();
  const server = await bootServer({ home: join(t.root, "home"), startDirs: t.work, token });
  try {
    const client = new DpiClient(server.base, token);
    const session = await client.createSession({ name: "Receipt recovery", cwd: t.work, model: faux });
    const main = client.agent(session.id, "main");
    const content = "!printf p0-tool-result-sentinel";
    const sent = await main.send(content, "followUp", "p0-stable-request", 15000);
    assert.equal(sent.status, "done");
    assert.ok(sent.submissionId);
    const before = await main.entries({ scope: "all" });
    const toolResults = before.items.filter((entry) => entry.kind === "pi.tool-result");
    assert.equal(toolResults.length, 1);
    await server.stop("SIGKILL");
    await server.start();
    const retry = await main.send(content, "followUp", "p0-stable-request", 15000);
    assert.equal(retry.submissionId, sent.submissionId);
    assert.equal(retry.status, "done");
    if (retry.status === "done") assert.match(retry.answer.text, /p0-tool-result-sentinel/);
    const after = await main.entries({ scope: "all" });
    assert.deepEqual(after.items.filter((entry) => entry.kind === "pi.tool-result").map((entry) => entry.id), toolResults.map((entry) => entry.id));
    assert.equal(after.items.filter((entry) => entry.kind === "pi.user").length, before.items.filter((entry) => entry.kind === "pi.user").length);
  } finally {
    await server.stop();
    await t.cleanup();
  }
});
