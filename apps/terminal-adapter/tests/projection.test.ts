import assert from "node:assert/strict";
import test from "node:test";
import type { WireSnapshotEvent, WireUsage } from "dpi-sdk/api";
import { TerminalProjection } from "../src/projection.js";

const usage: WireUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
const snapshot = (): WireSnapshotEvent => ({ type: "snapshot", entries: [], tools: [], compactions: [], inbox: [], agent: {}, usage: { models: {}, tools: {} } });

test("remote raw projection retains generation/tool details and authenticated user rendering", () => {
  const p = new TerminalProjection();
  p.apply({ type: "snapshot", snapshot: snapshot(), inbox: [] });
  p.apply({ type: "batch", events: [
    { type: "entry_appended", entry: { id: 1, conversationId: 1, kind: "host.input", model: [{ role: "user", content: "hello" }], data: { actor: "verified-operator" } } },
    { type: "run_start", inputs: [1] },
    { type: "message_start", message: { role: "assistant", provider: "faux", model: "echo", usage, stopReason: "pending", content: [{ type: "text", text: "partial" }] } },
    { type: "message_update", usage, changes: [{ type: "text_delta", contentIndex: 0, delta: " one" }] },
    { type: "tool_execution_start", toolCallId: "call-1", toolName: "fixture", args: {} },
    { type: "tool_execution_update", toolCallId: "call-1", toolName: "fixture", output: { set: "old body" }, details: { conversationId: 2 } },
    { type: "tool_execution_update", toolCallId: "call-1", toolName: "fixture", output: { trimStart: 4, append: " next" } },
  ] });
  assert.deepEqual(p.snapshot.generation?.message?.content, [{ type: "text", text: "partial one" }]);
  assert.equal(p.snapshot.tools[0].output, "body next");
  assert.deepEqual(p.snapshot.tools[0].details, { conversationId: 2 });
  assert.equal(p.snapshot.entries[0].kind, "host.input");
  assert.equal(p.renderedEntries[0].kind, "pi.user");
  assert.deepEqual(p.renderedEntries[0].data, { actor: "verified-operator" });
  p.apply({ type: "batch", events: [{ type: "tool_execution_end", toolCallId: "call-1", toolName: "fixture", entry: { id: 2, conversationId: 1, kind: "pi.tool-result" } }, { type: "run_end", inputs: [1] }] });
  assert.equal(p.snapshot.tools.length, 0);
  assert.equal(p.snapshot.generation, undefined);
  assert.equal(p.snapshot.run, undefined);
  assert.deepEqual(p.snapshot.entries.map((entry) => entry.id), [1, 2]);
});

test("reconnect replaces entries without duplicates and preserves passive document/input data", () => {
  const p = new TerminalProjection();
  const initial = { ...snapshot(), entries: [{ id: 4, conversationId: 1, kind: "extension.unknown", data: { text: "safe fallback" } }] };
  const inbox = [{ id: 9, mode: "followUp" as const, content: "pending" }];
  p.apply({ type: "snapshot", snapshot: initial, inbox });
  p.apply({ type: "batch", events: [{ type: "entry_appended", entry: initial.entries[0] }] });
  p.apply({ type: "snapshot", snapshot: initial, inbox });
  assert.equal(p.snapshot.entries.length, 1);
  assert.equal(p.renderedEntries[0].kind, "extension.unknown");
  assert.deepEqual(p.inbox, inbox);
  p.apply({ type: "doc", kind: "fixture.passive-document", value: { state: "waiting", answer: null } });
  assert.deepEqual(p.docs["fixture.passive-document"], { state: "waiting", answer: null });
  p.apply({ type: "batch", events: [{ type: "entry_appended", entry: { id: 7, head: 7, conversationId: 1, kind: "pi.reset" } }] });
  assert.deepEqual(p.snapshot.entries.map((entry) => entry.id), [7]);
  assert.deepEqual(p.inbox, inbox);
});
