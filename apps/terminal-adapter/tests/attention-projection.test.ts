import assert from "node:assert/strict";
import test from "node:test";
import { TerminalProjection } from "../src/projection.js";

test("native supervisor presentation preserves pending identity without changing raw requests or answering", () => {
  const p = new TerminalProjection();
  const request = { id: "question-1", child: 2, name: "child", reason: "interview_request", message: "Choose a color", state: "pending", interview: { questions: [{ id: "color", question: "Color?", options: ["red", "blue"] }] } };
  const doc = { requests: { "question-1": request }, progress: {} };
  const before = structuredClone(doc);
  p.apply({ type: "doc", kind: "bb.subagent-supervisor", value: doc });
  assert.deepEqual(p.attention?.requests, [{ id: request.id, child: 2, name: "child", reason: "interview_request", message: "Choose a color" }]);
  assert.deepEqual(p.docs["bb.subagent-supervisor"], before);
  assert.deepEqual(doc, before);
  p.apply({ type: "doc", kind: "bb.subagent-supervisor", value: { ...doc, requests: { "question-1": { ...request, state: "answered", reply: '{"color":"blue"}' } } } });
  assert.deepEqual(p.attention?.requests, []);
  p.apply({ type: "doc", kind: "bb.subagent-supervisor", value: null });
  assert.equal(p.attention, undefined);
});

test("malformed native attention is explicitly unavailable, never a fabricated pending request", () => {
  const p = new TerminalProjection();
  for (const value of [[], { requests: [] }, { requests: { mismatch: { id: "other", state: "pending" } } }, { requests: { request: { state: "future-state" } } }]) {
    p.apply({ type: "doc", kind: "bb.subagent-supervisor", value });
    assert.deepEqual(p.attention, { requests: [], unavailable: true });
  }
});
