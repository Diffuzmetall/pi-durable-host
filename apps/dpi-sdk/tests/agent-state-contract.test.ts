import assert from "node:assert/strict";
import { test } from "node:test";
import { API_VERSION, AGENT_STATE_CAPABILITY, type AgentStateFrame, type AgentUpdateFrame, type AgentPublicState, type SendResult, type MessageReceiptResult, type MessageReconciliationResult } from "../src/api.js";
import { AgentStateReducer } from "../src/observation.js";
import { DpiClient } from "../src/client.js";

const scope = { sessionId: "fixture", conversationId: 1 };
const initial = (): AgentStateFrame => ({
  type: "agent.state", ...scope, revision: "connection-a:0",
  state: {
    history: { items: [{ id: 1, conversationId: 1, kind: "host.input", model: [{ role: "user", content: "hello" }] }] },
    contextEntryIds: [1], execution: { busy: false, inputEntryIds: [] }, assistant: null,
    tools: [], compactions: [], config: {}, usage: { models: {}, tools: {} }, inbox: [], notices: [],
  },
});
const update = (baseRevision: string, revision: string, changes: Partial<AgentPublicState>): AgentUpdateFrame => ({
  type: "agent.update", ...scope, baseRevision, revision, changes,
});

test("the public wire is versioned independently from Durable", () => {
  assert.equal(API_VERSION, 2);
  assert.equal(AGENT_STATE_CAPABILITY, "agent-state.v1");
});

test("incompatible version or missing state capability refuses before mutation", async (t) => {
  const calls: string[] = [];
  let protocol = { apiVersion: 1, capabilities: [AGENT_STATE_CAPABILITY] as string[] };
  t.mock.method(globalThis, "fetch", async (input: string, init?: RequestInit) => {
    calls.push(`${init?.method ?? "GET"} ${input}`);
    assert.ok(input.endsWith("/v1/protocol"));
    return Response.json(protocol);
  });
  const client = new DpiClient("http://fixture.invalid", undefined, { requiredCapabilities: [AGENT_STATE_CAPABILITY] });
  await assert.rejects(client.agent(scope.sessionId, 1).send("do not send", "reject", "stable-key"), /Unsupported host protocol/);
  protocol = { apiVersion: API_VERSION, capabilities: [] };
  await assert.rejects(client.agent(scope.sessionId, 1).send("do not send", "reject", "stable-key"), /missing required capabilities/);
  assert.deepEqual(calls, ["GET http://fixture.invalid/v1/protocol", "GET http://fixture.invalid/v1/protocol"]);
});

test("whole public sections replace state without interpreting upstream deltas", () => {
  const reducer = new AgentStateReducer(scope);
  assert.equal(reducer.apply(initial()), "applied");
  assert.equal(reducer.apply(update("connection-a:0", "connection-a:1", {
    execution: { busy: true, inputEntryIds: [1] },
    tools: [{ callId: "tool-1", name: "safe", status: "running", output: "public tool JSON", details: { ok: true } }],
    assistant: { message: null, retry: { at: 123, message: "Retry scheduled" }, pollAt: null },
  })), "applied");
  assert.equal(reducer.state?.execution.busy, true);
  assert.deepEqual(reducer.state?.tools[0]?.details, { ok: true });
  reducer.apply(update("connection-a:1", "connection-a:2", { assistant: null, tools: [] }));
  assert.equal(reducer.state?.assistant, null);
  assert.deepEqual(reducer.state?.tools, []);
  assert.equal(reducer.state?.execution.busy, true);
});

test("answered submission is not idle, and terminal execution changes are explicit", () => {
  const reducer = new AgentStateReducer(scope);
  reducer.apply(initial());
  reducer.apply(update("connection-a:0", "connection-a:1", { execution: { busy: true, inputEntryIds: [1] } }));
  const receipt: SendResult = { submissionId: 9, status: "done", answer: { entryId: 2, text: "answer" } };
  assert.equal(receipt.status, "done");
  assert.equal(reducer.state?.execution.busy, true);
  reducer.apply(update("connection-a:1", "connection-a:2", {
    execution: { busy: false, inputEntryIds: [] }, assistant: null, notices: ["interrupted"],
  }));
  assert.equal(reducer.state?.execution.busy, false);
});

test("canonical receipt and reconciled non-admission are separate public results", () => {
  const receipt: MessageReceiptResult = { submissionId: 9, status: "unanswered", reason: "restart_limit" };
  const accepted: MessageReconciliationResult = { conversationId: 1, requestId: "stable-key", accepted: true, ...receipt };
  const retired: MessageReconciliationResult = { conversationId: 1, requestId: "retired-key", accepted: false };
  assert.equal(accepted.accepted, true);
  assert.equal(accepted.status, "unanswered");
  assert.equal(accepted.reason, "restart_limit");
  assert.equal(retired.accepted, false);
  assert.equal("submissionId" in retired, false);
});

test("compaction/reset change model context without erasing public history", () => {
  const reducer = new AgentStateReducer(scope);
  reducer.apply(initial());
  const before = structuredClone(reducer.state?.history);
  reducer.apply(update("connection-a:0", "connection-a:1", { contextEntryIds: [], compactions: [] }));
  assert.deepEqual(reducer.state?.history, before);
  assert.deepEqual(reducer.state?.contextEntryIds, []);
  reducer.apply(update("connection-a:1", "connection-a:2", { history: { items: [], next: "older-page" } }));
  assert.equal(reducer.state?.history.next, "older-page");
});

test("a gap preserves display, blocks subsequent deltas, and converges only on a new state", () => {
  const reducer = new AgentStateReducer(scope);
  reducer.apply(initial());
  const before = structuredClone(reducer.state);
  assert.equal(reducer.apply(update("connection-a:8", "connection-a:9", { notices: ["must not apply"] })), "resync");
  assert.deepEqual(reducer.state, before);
  assert.equal(reducer.needsResync, true);
  assert.equal(reducer.apply(update("connection-a:0", "connection-a:1", { notices: ["late"] })), "resync");
  assert.deepEqual(reducer.state, before);
  const full = initial();
  full.revision = "connection-b:0";
  assert.equal(reducer.apply(full), "applied");
  assert.equal(reducer.needsResync, false);
  assert.equal(reducer.revision, "connection-b:0");
});

test("duplicates are idempotent and a delta without state requests resync", () => {
  const reducer = new AgentStateReducer(scope);
  assert.equal(reducer.apply(update("connection-a:0", "connection-a:1", {})), "resync");
  reducer.apply(initial());
  const frame = update("connection-a:0", "connection-a:1", { notices: ["once"] });
  assert.equal(reducer.apply(frame), "applied");
  assert.equal(reducer.apply(frame), "ignored");
  assert.deepEqual(reducer.state?.notices, ["once"]);
});

test("session/conversation scope mismatches cannot replace the selected state", () => {
  const reducer = new AgentStateReducer(scope);
  reducer.apply(initial());
  for (const foreign of [{ ...scope, sessionId: "other" }, { ...scope, conversationId: 2 }]) {
    assert.equal(reducer.apply({ ...initial(), ...foreign }), "ignored");
    assert.equal(reducer.apply({ ...update("connection-a:0", "connection-a:1", {}), ...foreign }), "ignored");
  }
  assert.equal(reducer.revision, "connection-a:0");
});

test("end reports observation state only; revoke clears protected display and does not retry", () => {
  const reducer = new AgentStateReducer(scope);
  reducer.apply(initial());
  assert.equal(reducer.apply({ ...scope, type: "agent.end", reason: "resync" }), "ended");
  assert.equal(reducer.needsResync, true);
  assert.equal(reducer.state?.execution.busy, false);
  reducer.apply(initial());
  assert.equal(reducer.apply({ ...scope, type: "agent.end", reason: "revoked" }), "ended");
  assert.equal(reducer.state, undefined);
  assert.equal(reducer.end, "revoked");
  assert.equal(reducer.needsResync, false);
});

test("state ownership does not mutate input fixtures and clear drops the previous selection", () => {
  const reducer = new AgentStateReducer(scope);
  const frame = initial();
  reducer.apply(frame);
  const change = update("connection-a:0", "connection-a:1", { notices: ["safe"] });
  reducer.apply(change);
  if (change.type === "agent.update") change.changes.notices = ["changed elsewhere"];
  assert.deepEqual(reducer.state?.notices, ["safe"]);
  assert.deepEqual(frame, initial());
  reducer.clear();
  assert.equal(reducer.state, undefined);
  assert.equal(reducer.revision, undefined);
  assert.equal(reducer.needsResync, false);
});
