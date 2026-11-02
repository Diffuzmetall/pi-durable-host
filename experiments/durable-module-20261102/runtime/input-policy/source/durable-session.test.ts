import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { createModels } from "@earendil-works/pi-ai/models";
import { BACKGROUND_CONTEXT as ctx } from "@earendil-works/chord/context";
import { createRegistry, defineDoc, defineExtension, defineTool, hook, GenerationTask, type ConversationId, type Id, type Storage } from "@earendil-works/pi-durable";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
import { obj, str } from "@earendil-works/pi-schema";
import { API_VERSION, AGENT_STATE_CAPABILITY } from "../../dpi-sdk/src/api.js";
import { installFaux } from "../src/faux.js";
import { openNativeSession, SessionFault } from "../src/durable/native-session.js";
import type { SessionAccess } from "../src/durable/session.js";
import type { NativeInputBinding } from "../src/durable/input-binding.js";
import { nativeRequestKey } from "../src/idempotency.js";
import { assistant } from "../src/durable/projection.js";
import { fauxAssistantMessage, fauxText, fauxToolCall } from "@earendil-works/pi-ai/providers/faux";
import { ApiFault as HttpApiFault } from "../src/errors.js";

const TEST_POLICY_KIND = "test.input-policy";
const TestPolicy = defineDoc<{ actor: string; request: string }>({
  kind: TEST_POLICY_KIND, version: 1, scope: "conversation", history: "latest", fork: "initial",
  checkpointWhen: () => true, initial: () => ({ actor: "", request: "" }),
});

async function fixture(transform?: (storage: Storage) => Storage, afterRun?: () => Promise<void>, inputBinding?: NativeInputBinding) {
  const directory = await mkdtemp(join(process.cwd(), "session-test-"));
  const storage = await openNodeSqliteStorage(join(directory, "session.db"));
  const models = createModels();
  installFaux(models);
  const registry = createRegistry();
  const extension = defineExtension({
    name: "test.tools", ...(afterRun ? { hooks: [hook(GenerationTask, { afterRun: async () => { await afterRun(); return undefined; } })] } : {}), tools: [defineTool({
      name: "bash", description: "A deterministic tool fixture; does not execute a shell",
      parameters: obj({ command: str() }), replay: "safe",
      async execute(args) { return { output: [{ type: "text", text: `Fixture: ${args.command}` }] }; },
    })],
  });
  registry.install(extension);
  const session = await openNativeSession("test-session", transform ? transform(storage) : storage,
    { models, registry, settings: { extensions: [extension] } },
    { agent: { model: { provider: "faux", modelId: "echo" }, cwd: directory } }, inputBinding);
  let revoked = false;
  const controller = new AbortController();
  const access: SessionAccess = {
    actor: "operator", source: "test", authority: "operator", signal: controller.signal,
    client: { apiVersion: API_VERSION, capabilities: [AGENT_STATE_CAPABILITY] },
    assertCurrent(_action, target) {
      assert.equal(target.sessionId, session.sessionId);
      if (target.conversationId !== undefined) assert.equal(target.conversationId, session.rootConversationId);
      if (revoked) throw new Error("PRIVATE_REVOKED");
    },
  };
  return { session, access, id: session.rootConversationId, storage, directory,
    revoke() { revoked = true; controller.abort(); } };
}

test("real SQLite/faux admission, answer, tool, history and context", { timeout: 20_000 }, async () => {
  const f = await fixture();
  try {
    for (const key of ["harness", "conversation", "mutationContext", "h", "c"])
      assert.equal(key in f.session, false, `Native escape hatch: ${key}`);
    const result = await f.session.send(f.access, f.id, { content: "!hello", requestId: "tool", waitMs: 10_000 });
    assert.equal(result.status, "done");
    if (result.status === "done") assert.match(result.answer.text, /Fixture: hello/);
    const history = await f.session.history(f.access, f.id, { limit: 100 });
    assert.ok(history.items.some(value => value.kind === "pi.tool-result"));
    assert.ok(history.items.some(value => value.kind === "host.input"));
    const context = await f.session.context(f.access, f.id);
    assert.ok(context.entryIds.length > 0);
    assert.ok(context.entryIds.every(id => history.items.some(value => value.id === id)));
  } finally { await f.session.close(); }
});

test("lost ACK uses the original native ID; reconciliation retires an unaccepted key", { timeout: 20_000 }, async () => {
  const f = await fixture();
  try {
    const body = { content: "hello", requestId: "ack", waitMs: 10_000 };
    const first = await f.session.send(f.access, f.id, body);
    const duplicate = await f.session.send(f.access, f.id, body);
    assert.equal(first.submissionId, duplicate.submissionId);
    assert.equal((await f.session.receipt(f.access, f.id, "ack")).submissionId, first.submissionId);
    const accepted = await f.session.reconcile(f.access, f.id, "ack");
    assert.equal(accepted.accepted, true);
    assert.deepEqual(await f.session.reconcile(f.access, f.id, "never"), { conversationId: f.id, requestId: "never", accepted: false });
    await assert.rejects(f.session.send(f.access, f.id, { ...body, requestId: "never" }), { code: "conflict" });
    await assert.rejects(f.session.send(f.access, f.id, { ...body, content: "changed" }), { code: "conflict" });
  } finally { await f.session.close(); }
});

test("concurrent retries admit once and preserve payload conflicts", { timeout: 20_000 }, async () => {
  const f = await fixture();
  try {
    const results = await Promise.all(Array.from({ length: 8 }, () => f.session.send(f.access, f.id,
      { content: "concurrent", requestId: "same", waitMs: 10_000 })));
    assert.equal(new Set(results.map(value => value.submissionId)).size, 1);
    assert.equal((await f.session.history(f.access, f.id, {})).items.filter(value => value.kind === "host.input").length, 1);
  } finally { await f.session.close(); }
});

test("revoke during awaited native admission rolls back submission, receipt and task", { timeout: 20_000 }, async () => {
  let revoke: (() => void) | undefined;
  let armed = false;
  let allocated = 0;
  let revokedAtAllocation = 0;
  const f = await fixture(storage => {
    const mint = storage.mintId.bind(storage);
    storage.mintId = async <I extends Id<string>>() => {
      const id = await mint<I>();
      // The first ID creates the receipt draft; the second is allocated inside Conversation.submit().
      if (armed && ++allocated === 2) { armed = false; revokedAtAllocation = allocated; revoke?.(); }
      return id;
    };
    return storage;
  });
  revoke = f.revoke;
  try {
    armed = true;
    await assert.rejects(f.session.send(f.access, f.id, { content: "must not run", requestId: "revoked" }));
    assert.equal(revokedAtAllocation, 2);
    const fresh = { ...f.access, signal: undefined, assertCurrent() {} };
    await assert.rejects(f.session.receipt(fresh, f.id, "revoked"), { code: "not_found" });
    assert.equal((await f.session.history(fresh, f.id, {})).items.length, 0);
    assert.equal((await f.storage.scanTasks({}, 100, undefined, ctx)).items.length, 0);
    assert.equal((await f.session.reconcile(fresh, f.id, "revoked")).accepted, false);
    // A failed authorized transaction did not poison the real Session.
    assert.equal((await f.session.send(fresh, f.id, { content: "still healthy", requestId: "fresh", waitMs: 10_000 })).status, "done");
  } finally { await f.session.close(); }
});

test("version and scope refusal precede admission", { timeout: 20_000 }, async () => {
  const f = await fixture();
  try {
    const badVersion = { ...f.access, client: { ...f.access.client, apiVersion: 1 as typeof API_VERSION } };
    await assert.rejects(f.session.send(badVersion, f.id, { content: "no", requestId: "version" }), { code: "conflict" });
    const denied = { ...f.access, assertCurrent() { throw new Error("PRIVATE_DENIED"); } };
    await assert.rejects(f.session.send(denied, f.id, { content: "no", requestId: "scope" }));
    assert.equal((await f.session.history(f.access, f.id, {})).items.length, 0);
  } finally { await f.session.close(); }
});

test("delegated input requires both a policy binding and a current policy reference", { timeout: 20_000 }, async () => {
  const unbound = await fixture();
  const bound = await fixture(undefined, undefined, { async prepareInput() {} });
  try {
    await assert.rejects(unbound.session.send({ ...unbound.access, authority: "delegated", policyReference: "policy/current" },
      unbound.id, { content: "denied", requestId: "no-binding" }), { code: "unavailable" });
    await assert.rejects(bound.session.send({ ...bound.access, authority: "delegated" }, bound.id,
      { content: "denied", requestId: "no-reference" }), { code: "unavailable" });
    for (const f of [unbound, bound]) {
      assert.equal((await f.storage.scanSubmissions({}, 100, undefined, ctx)).items.length, 0);
      assert.equal((await f.storage.scanTasks({}, 100, undefined, ctx)).items.length, 0);
      assert.equal((await f.session.history(f.access, f.id, {})).items.length, 0);
    }
  } finally { await unbound.session.close(); await bound.session.close(); }
});

test("policy preparation follows native admission and retries preserve the same policy and native ID", { timeout: 20_000 }, async () => {
  let preparations = 0;
  const f = await fixture(undefined, undefined, {
    async prepareInput(tx, conversation, request, identity) {
      // A table read is refused only after native submit has staged its table writes.
      await assert.rejects(async () => tx.conversation(conversation), { name: "ReadAfterWrite" });
      identity.assertCurrent();
      assert.equal(identity.policyReference, "policy/current");
      assert.equal(request, nativeRequestKey(identity.actor, "message", "bound"));
      Object.assign(await tx.doc(TestPolicy, conversation), { actor: identity.actor, request });
      preparations++;
    },
  });
  try {
    const access = { ...f.access, authority: "delegated", policyReference: "policy/current" };
    const body = { content: "one admitted policy", requestId: "bound", waitMs: 10_000 };
    const results = await Promise.all(Array.from({ length: 4 }, () => f.session.send(access, f.id, body)));
    assert.equal(new Set(results.map(value => value.submissionId)).size, 1);
    assert.equal(preparations, 1);
    assert.equal((await f.session.receipt(access, f.id, "bound")).submissionId, results[0]!.submissionId);
    const policy = await f.storage.findDocument({ kind: TEST_POLICY_KIND,
      scope: { kind: "conversation", conversationId: f.id as ConversationId } }, "current", ctx);
    assert.ok(policy);
    assert.equal((await f.session.history(access, f.id, {})).items.filter(value => value.kind === "host.input").length, 1);
  } finally { await f.session.close(); }
});

test("policy failure and revoke roll back policy, entry, receipt, submission and scheduled task together", { timeout: 20_000 }, async () => {
  for (const failure of ["throw", "revoke"]) {
    let armed = true;
    let revoke: (() => void) | undefined;
    const f = await fixture(undefined, undefined, {
      async prepareInput(tx, conversation, request, identity) {
        Object.assign(await tx.doc(TestPolicy, conversation), { actor: identity.actor, request });
        await Promise.resolve();
        if (!armed) return;
        armed = false;
        if (failure === "revoke") revoke!();
        else throw new Error("PRIVATE_POLICY_FAILURE");
      },
    });
    revoke = f.revoke;
    try {
      const access = { ...f.access, authority: "delegated", policyReference: "policy/current" };
      await assert.rejects(f.session.send(access, f.id, { content: "must roll back", requestId: "failed-policy" }));
      const fresh = { ...access, signal: undefined, assertCurrent() {} };
      assert.equal((await f.storage.scanSubmissions({}, 100, undefined, ctx)).items.length, 0);
      assert.equal((await f.storage.scanTasks({}, 100, undefined, ctx)).items.length, 0);
      assert.equal((await f.session.history(fresh, f.id, {})).items.length, 0);
      await assert.rejects(f.session.receipt(fresh, f.id, "failed-policy"), { code: "not_found" });
      assert.equal(await f.storage.findDocument({ kind: TEST_POLICY_KIND,
        scope: { kind: "conversation", conversationId: f.id as ConversationId } }, "current", ctx), undefined);
      assert.equal((await f.session.send(fresh, f.id,
        { content: "healthy after rollback", requestId: "healthy-policy", waitMs: 10_000 })).status, "done");
    } finally { await f.session.close(); }
  }
});

test("state-first observation, scoped cursor, disconnect and reconnect", { timeout: 20_000 }, async () => {
  const f = await fixture();
  try {
    const observation = await f.session.observe(f.access, f.id, {});
    const iterator = observation.frames[Symbol.asyncIterator]();
    const first = await iterator.next();
    assert.equal(first.value?.type, "agent.state");
    await observation.close();
    assert.equal((await iterator.next()).done, true);
    assert.equal((await f.session.send(f.access, f.id, { content: "after disconnect", requestId: "disconnect", waitMs: 10_000 })).status, "done");
    const next = await f.session.observe(f.access, f.id, {});
    const nextIterator = next.frames[Symbol.asyncIterator]();
    const frame = (await nextIterator.next()).value;
    assert.equal(frame?.type, "agent.state");
    if (frame?.type === "agent.state" && first.value?.type === "agent.state") {
      assert.notEqual(frame.revision.split(":")[0], first.value.revision.split(":")[0]);
      assert.ok(frame.state.history.items.length > 0);
    }
    await next.close();
    const page = await f.session.history(f.access, f.id, { limit: 1 });
    assert.ok(page.next);
    const older = await f.session.history(f.access, f.id, { limit: 1, cursor: page.next });
    assert.ok(older.items[0]!.id < page.items[0]!.id);
    const wrong = Buffer.from(JSON.stringify({ sessionId: "another", conversationId: f.id, before: page.items[0]!.id })).toString("base64url");
    await assert.rejects(f.session.history(f.access, f.id, { cursor: wrong }), { code: "invalid" });
  } finally { await f.session.close(); }
});

test("an answered submission remains busy during native afterRun work", { timeout: 20_000 }, async () => {
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const f = await fixture(undefined, () => held);
  try {
    const result = await f.session.send(f.access, f.id, { content: "answer before idle", requestId: "after-run", waitMs: 10_000 });
    assert.equal(result.status, "done");
    const observation = await f.session.observe(f.access, f.id, {});
    const frame = (await observation.frames[Symbol.asyncIterator]().next()).value;
    assert.equal(frame?.type, "agent.state");
    if (frame?.type === "agent.state") assert.equal(frame.state.execution.busy, true);
    await observation.close();
  } finally { release(); await f.session.close(); }
});

test("interrupt reaches a terminal native outcome without resubmitting", { timeout: 20_000 }, async () => {
  const f = await fixture();
  try {
    const result = await f.session.send(f.access, f.id, { content: `slow: ${"wait ".repeat(1000)}`, requestId: "interrupt" });
    await f.session.interrupt(f.access, f.id, false);
    const settled = await f.session.submission(f.access, result.submissionId, 10_000);
    assert.equal(settled.status, "unanswered");
    assert.equal((await f.session.receipt(f.access, f.id, "interrupt")).submissionId, result.submissionId);
  } finally { await f.session.close(); }
});

test("revoke during native interrupt preparation cannot publish abort marks", { timeout: 20_000 }, async () => {
  let armed = false;
  let reached = false;
  let revoke: (() => void) | undefined;
  const f = await fixture(storage => {
    const scan = storage.scanSubmissions.bind(storage);
    storage.scanSubmissions = async (...args) => {
      const result = await scan(...args);
      if (armed && args[0].status === "queued") {
        armed = false; reached = true; revoke?.();
      }
      return result;
    };
    return storage;
  });
  revoke = f.revoke;
  const fresh = { ...f.access, signal: undefined, assertCurrent() {} };
  try {
    const result = await f.session.send(f.access, f.id, { content: `slow: ${"wait ".repeat(1000)}`, requestId: "revoke-interrupt" });
    armed = true;
    await assert.rejects(f.session.interrupt(f.access, f.id, false));
    assert.equal(reached, true, "revocation happened inside the native interrupt transaction, not before entry");
    const tasks = await f.storage.scanTasks({}, 100, undefined, ctx);
    assert.equal(tasks.items.some(task => task.abortRequested ||
      task.state.status === "terminal" && task.state.outcome.status === "aborted"), false,
      "unauthorized interrupt must not persist an abort mark or an aborted outcome");
    const settled = await f.session.submission(fresh, result.submissionId, 0);
    assert.notEqual(settled.status, "unanswered", "unauthorized abort must not settle the input");
  } finally { await f.session.interrupt(fresh, f.id, false); await f.session.close(); }
});

test("provider diagnostics and secret-bearing model arguments are excluded from public messages", () => {
  const projected = assistant(fauxAssistantMessage(fauxText("PRIVATE_PROVIDER_BODY"), {
    stopReason: "error", errorMessage: "PRIVATE_PROVIDER_URL_KEY",
  }));
  assert.equal(JSON.stringify(projected).includes("PRIVATE_"), false);
  assert.deepEqual(projected.content, []);
  const tool = assistant(fauxAssistantMessage(fauxToolCall("private_tool", { token: "PRIVATE_TOOL_KEY" })));
  assert.equal(JSON.stringify(tool).includes("PRIVATE_TOOL_KEY"), false);
  assert.equal(new SessionFault("conflict", "Safe explanation") instanceof HttpApiFault, true);
  assert.equal(new SessionFault("conflict", "Safe explanation").status, 409);
});

test("oversized public state ends with resync instead of an unbounded frame", { timeout: 20_000 }, async () => {
  const f = await fixture();
  try {
    for (let i = 0; i < 21; i++) {
      await f.session.send(f.access, f.id, { content: "x".repeat(99_999), requestId: `large-${i}` });
      await f.session.interrupt(f.access, f.id, false);
    }
    const observation = await f.session.observe(f.access, f.id, {});
    const iterator = observation.frames[Symbol.asyncIterator]();
    assert.deepEqual((await iterator.next()).value, { type: "agent.end", sessionId: f.session.sessionId, conversationId: f.id, reason: "resync" });
    assert.equal((await iterator.next()).done, true);
  } finally { await f.session.close(); }
});

test("document refusal happens before native attachment; revoke emits only a safe end", { timeout: 20_000 }, async () => {
  const f = await fixture();
  try {
    await assert.rejects(f.session.observe(f.access, f.id, { documents: ["pi.provider"] }), SessionFault);
    const observation = await f.session.observe(f.access, f.id, {});
    const iterator = observation.frames[Symbol.asyncIterator]();
    assert.equal((await iterator.next()).value?.type, "agent.state");
    f.revoke();
    assert.deepEqual((await iterator.next()).value, { type: "agent.end", sessionId: f.session.sessionId, conversationId: f.id, reason: "revoked" });
    assert.equal((await iterator.next()).done, true);
    await observation.close();
    await observation.close();
  } finally { await f.session.close(); }
});
