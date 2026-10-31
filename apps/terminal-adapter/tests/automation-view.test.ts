import assert from "node:assert/strict";
import test from "node:test";
import { nativeGoalsView, scheduleView } from "../src/automation-view.js";
import { TerminalProjection } from "../src/projection.js";

const goal = { id: "native-goal", objective: "Saved objective", status: "waiting", createdAt: 1, updatedAt: 2, revision: 1, callsUsed: 3, activeMsUsed: 4,
  limits: { maxCalls: 8 }, criteria: [{ id: "human", text: "Operator acceptance", human: true }], evidence: [] };

test("native automation view uses saved header/counters without fabricating acceptance or changing raw documents", () => {
  const doc = { active: goal.id, goals: { [goal.id]: goal } };
  const before = structuredClone(doc);
  const header = nativeGoalsView(doc);
  assert.equal(header?.active, goal.id);
  assert.equal(header?.goals[goal.id].status, "waiting");
  assert.equal(header?.goals[goal.id].callsUsed, 3);
  assert.equal(header?.goals[goal.id].criteria, undefined, "Only presentation header is projected, not a replacement Goal contract");
  assert.deepEqual(doc, before);
  assert.deepEqual(scheduleView({ items: { a: { status: "active" }, b: { status: "failed" }, c: { status: "completed" }, d: { status: "cancelled" } } }), { scheduled: 1, failed: 1 });
});

test("unsupported native automation stays explicitly unavailable until every invalid document is corrected", () => {
  assert.equal(nativeGoalsView({ goals: { [goal.id]: { ...goal, status: "future-status" } } }), undefined);
  assert.equal(nativeGoalsView({ active: "foreign", goals: { [goal.id]: goal } }), undefined);
  assert.equal(nativeGoalsView({ goals: { [goal.id]: { ...goal, limits: { maxCalls: -1 } } } }), undefined);
  assert.equal(scheduleView({ items: { item: { status: "future-status" } } }), undefined);
  const p = new TerminalProjection();
  p.apply({ type: "doc", kind: "durable-goals.native-goals", value: [] });
  p.apply({ type: "doc", kind: "durable.schedules", value: [] });
  assert.equal(p.automation.unavailable, true);
  p.apply({ type: "doc", kind: "durable-goals.native-goals", value: { goals: { [goal.id]: goal } } });
  assert.equal(p.automation.unavailable, true);
  p.apply({ type: "doc", kind: "durable.schedules", value: { items: {} } });
  assert.equal(p.automation.unavailable, false);
  assert.equal(p.automation.nativeGoals?.goals[goal.id].id, goal.id);
});
