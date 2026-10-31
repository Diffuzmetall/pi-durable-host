import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { BACKGROUND_CONTEXT as ctx } from "@earendil-works/chord/context";
import { Store } from "../src/store.js";
import { faux, tempStore } from "./helpers.js";

const identity = (actor = "fixture-human") => ({
  actor, source: "terminal", authority: "human", assertCurrent: () => {},
});

test("canonical create intent survives native-open/catalog gap, concurrent retries, expiry and archive", async () => {
  const t = await tempStore();
  let store = await t.open();
  const body = { name: "once", cwd: t.work, model: faux };
  try {
    await store.close();
    const marker = join(t.root, "reserved-id");
    const child = spawn(process.execPath, ["--import", "tsx", resolve(import.meta.dirname, "fixtures/receipt-crash.ts"), t.options.dataDir, t.work, marker], {
      cwd: resolve(import.meta.dirname, ".."), env: { ...process.env, HOME: t.root }, stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (data) => { stderr += data; });
    const [code, signal] = await once(child, "exit");
    assert.equal(code, null, stderr);
    assert.equal(signal, "SIGKILL", stderr);
    const intendedId = await readFile(marker, "utf8");
    assert.ok(intendedId);
    store = await t.open();
    const [first, second] = await Promise.all([
      store.createSessionRequest(body, "create-once", identity()),
      store.createSessionRequest(body, "create-once", identity()),
    ]);
    assert.equal(first.id, intendedId);
    assert.equal(second.id, first.id);
    assert.equal(store.list().length, 1);
    assert.equal((await store.createSessionRequest({ model: faux, cwd: t.work, name: "once" }, "create-once", identity())).id, first.id);
    await assert.rejects(() => store.createSessionRequest({ ...body, name: "changed" }, "create-once", identity()), /different payload/);
    store.catalog.prepare("DELETE FROM requests").run();
    await store.close();
    store = await t.open();
    assert.equal((await store.createSessionRequest(body, "create-once", identity())).id, first.id);
    await store.archive(store.row(first.id));
    await store.close();
    store = await t.open();
    await assert.rejects(() => store.createSessionRequest(body, "create-once", identity()), /result.gone/i);
    assert.equal(store.list().length, 0);
  } finally {
    await store.close();
    await t.cleanup();
  }
});

test("native actor receipts reconcile lost ACK after restart and reject changed payload", async () => {
  const t = await tempStore();
  let store = await t.open();
  try {
    const session = await store.create({ name: "receipts", cwd: t.work, model: faux });
    let { row, h, c } = await store.resolveAgent(session.id, "main");
    const body = { content: "!printf receipt-ok", requestId: "stable-1" };
    const [first, same] = await Promise.all([store.send(c, body, identity()), store.send(c, body, identity())]);
    assert.equal(first.id, same.id);
    assert.equal((await store.settled(h, first.id as number, 15000)).status, "done");
    await assert.rejects(() => store.send(c, { ...body, content: "different" }, identity()), /different payload/);
    await assert.rejects(() => store.send(c, { ...body, whenBusy: "steer" }, identity()), /different payload/);
    const receipt = await store.messageReceipt(row, c, body.requestId, identity());
    assert.equal(receipt.submissionId, first.id);
    store.catalog.prepare("DELETE FROM requests").run();
    await store.close();
    store = await t.open();
    ({ row, h, c } = await store.resolveAgent(session.id, "main"));
    const retry = await store.send(c, body, identity());
    assert.equal(retry.id, first.id);
    assert.equal((await store.messageReceipt(row, c, body.requestId, identity())).submissionId, first.id);
    const entries = (await store.entries(c, undefined, 100)).items;
    assert.equal(entries.filter((entry) => entry.kind === "pi.tool-result").length, 1);
    assert.ok(entries.some((entry) => entry.kind === "host.input" && JSON.stringify(entry.data).includes("fixture-human")));
    const other = await store.send(c, body, identity("other-actor"));
    assert.notEqual(other.id, first.id);
    const revoked = { ...identity(), assertCurrent: () => { throw Error("fixture revoked"); } };
    await assert.rejects(() => store.messageReceipt(row, c, body.requestId, revoked), /revoked/);
    await assert.rejects(() => store.send(c, { content: "no", requestId: "revoked" }, revoked), /revoked/);
  } finally {
    await store.close();
    await t.cleanup();
  }
});

test("queued native admission observes revoke signal before committing", async () => {
  const t = await tempStore();
  const store = await t.open();
  try {
    const session = await store.create({ name: "admission", cwd: t.work, model: faux });
    const { h, c } = await store.resolveAgent(session.id, "main");
    let release!: () => void;
    let entered!: () => void;
    const started = new Promise<void>((resolve) => { entered = resolve; });
    const submit = c.submit.bind(c);
    let block: Promise<void> | undefined;
    c.submit = (draft, context) => {
      // The fingerprint has committed; block the native submission's own queue slot.
      block = h.commit(async () => {
        entered();
        await new Promise<void>((resolve) => { release = resolve; });
      }, ctx);
      return submit(draft, context);
    };
    const controller = new AbortController();
    const send = store.send(c, { content: "must not run", requestId: "queued-revoke" }, { ...identity(), signal: controller.signal });
    const denied = assert.rejects(send);
    await started;
    controller.abort(Error("fixture revoked in native queue"));
    release();
    await block;
    await denied;
    assert.equal((await store.entries(c, undefined, 100)).items.length, 0);
  } finally {
    await store.close();
    await t.cleanup();
  }
});

test("native create and fork receipts retain one resource and parent under concurrent retry", async () => {
  const t = await tempStore();
  let store = await t.open();
  try {
    const session = await store.create({ name: "agents", cwd: t.work, model: faux });
    let { row, h, c } = await store.resolveAgent(session.id, "main");
    const request = { name: "created-once" };
    const [a, b] = await Promise.all([
      store.createAgentRequest(row, request, "agent-1", identity()),
      store.createAgentRequest(row, request, "agent-1", identity()),
    ]);
    assert.equal(a.id, b.id);
    await assert.rejects(() => store.createAgentRequest(row, { name: "other" }, "agent-1", identity()), /different payload/);
    const sent = await store.send(c, { content: "seed", requestId: "seed" });
    await store.settled(h, sent.id as number, 10000);
    const entryId = (await store.activeEntries(c)).at(-1)!.id;
    const [f, g] = await Promise.all([
      store.forkRequest(row, c, { entryId, name: "fork-once" }, "fork-1", identity()),
      store.forkRequest(row, c, { entryId, name: "fork-once" }, "fork-1", identity()),
    ]);
    assert.equal(f.id, g.id);
    assert.equal(f.parentId, c.id);
    await store.close();
    store = await t.open();
    ({ row, h, c } = await store.resolveAgent(session.id, "main"));
    assert.equal((await store.createAgentRequest(row, request, "agent-1", identity())).id, a.id);
    assert.equal((await store.forkRequest(row, c, { entryId, name: "fork-once" }, "fork-1", identity())).id, f.id);
    assert.equal((await store.agents(row)).length, 3);
  } finally {
    await store.close();
    await t.cleanup();
  }
});
