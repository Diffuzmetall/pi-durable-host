import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { DpiClient } from "dpi-sdk";
import { nativeAttentionFixture } from "../../dpi-backend/tests/fixtures/terminal-native-attention.js";
import { until } from "../../dpi-backend/tests/helpers.js";
import { RemoteTerminal } from "../src/remote-controller.js";

async function observeUi(base: string, session: string, replyTo: string, home: string, token: string) {
  await mkdir(home, { recursive: true });
  const entry = process.env.TERMINAL_NATIVE_ENTRY;
  const child = spawn("python3", [fileURLToPath(new URL("./attention-ui-probe.py", import.meta.url)), base, session, replyTo, ...(entry ? [entry] : [])], {
    env: { PATH: process.env.PATH, LANG: "C.UTF-8", HOME: home, TERM: "xterm-256color", DPI_TOKEN: token, PI_CODING_AGENT_DIR: join(home, "agent") },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "", stderr = "";
  child.stdout.on("data", chunk => { stdout += chunk; });
  child.stderr.on("data", chunk => { stderr += chunk; });
  await new Promise<void>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", code => { if (code === 0) resolve(); else reject(Error(`Attention PTY failed: ${stderr}`)); });
  });
  const result = JSON.parse(stdout);
  assert.equal(result.pendingRowVisible, true);
  assert.equal(result.goalStatusRendered, true);
  assert.equal(result.guardedToolStream, true);
  assert.equal(result.skillSubmitted, true);
  assert.equal(result.answerSubmitted, false);
  assert.equal(result.replyTo, replyTo);
}

test("actual native attention survives all viewer detach and owner reopen, displays same request, never defaults an answer", { timeout: 45000 }, async () => {
  const host = await nativeAttentionFixture();
  let terminal: RemoteTerminal | undefined;
  try {
    const child = await host.ask();
    const original = (await host.requests()).find(request => request.child === child.conversationId);
    assert.ok(original);
    assert.equal(original.state, "pending");
    assert.deepEqual(original.interview?.questions[0].options, ["red", "blue"]);
    assert.equal((await host.goal())?.status, "draft", "Actual native Goal exists before the viewer; no model/control simulation");
    const client = new DpiClient(host.base, host.token);
    const detail = await client.agent(host.sessionId, "main").get();
    assert("documentKinds" in detail && Array.isArray(detail.documentKinds) && detail.documentKinds.includes("bb.subagent-supervisor"), "Actual profile document discovery must be exposed, not hardcoded by a client fixture");
    terminal = await RemoteTerminal.open(client, host.sessionId, join(host.root, "client"));
    await until(async () => terminal!.current().attention?.requests[0]?.id === original.id, 10000, "actual native attention SSE");
    await until(async () => terminal!.current().automation.nativeGoals?.goals[host.goalId]?.status === "draft", 10000, "actual native Goal header SSE");
    const originalGoal = await host.goal(); assert.ok(originalGoal);
    await terminal.close(); terminal = undefined;
    await observeUi(host.base, host.sessionId, original.id, join(host.root, "ui-before"), host.token);
    assert.deepEqual((await host.requests()).find(request => request.id === original.id), original);
    assert.equal(host.questionCalls, 1);
    await host.reopen();
    const reopenedClient = new DpiClient(host.base, host.token);
    terminal = await RemoteTerminal.open(reopenedClient, host.sessionId, join(host.root, "client"));
    await until(async () => terminal!.current().attention?.requests[0]?.id === original.id, 10000, "same request after native SQLite reopen");
    assert.deepEqual((await host.requests()).find(request => request.id === original.id), original);
    assert.equal(host.questionCalls, 1, "Native waiting tool, not another model request, resumes");
    await until(async () => terminal!.current().automation.nativeGoals?.goals[host.goalId]?.id === host.goalId, 10000, "same native Goal header after reopen");
    const reopenedGoal = await host.goal(); assert.ok(reopenedGoal);
    // Native Goal shutdown accrues updatedAt even for a draft; it is not a client approval.
    assert(reopenedGoal.updatedAt >= originalGoal.updatedAt);
    assert.deepEqual({ ...reopenedGoal, updatedAt: originalGoal.updatedAt }, originalGoal, "Human criteria/evidence, revision, limits and state survive observation/reopen unchanged");
    await terminal.close(); terminal = undefined;
    await observeUi(host.base, host.sessionId, original.id, join(host.root, "ui-after"), host.token);
    assert.deepEqual((await host.requests()).find(request => request.id === original.id), original);
    terminal = await RemoteTerminal.open(reopenedClient, host.sessionId, join(host.root, "client"));
    await until(async () => terminal!.current().attention?.requests.length === 1, 10000, "pending before explicit answer");
    await host.answer();
    await until(async () => terminal!.current().attention?.requests.length === 0, 10000, "native explicit answer removes pending row");
    const answered = (await host.requests()).find(request => request.id === original.id);
    assert.equal(answered?.state, "answered");
    assert.equal(answered.reply, '{"color":"blue"}');
  } finally {
    await terminal?.close();
    await host.close();
  }
});
