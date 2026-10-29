import assert from "node:assert/strict";
import test from "node:test";
import { GrantPolicy, GrantDenied, type GrantSpec } from "../src/grants.js";

const observer: GrantSpec = {
  id: "observe-A", token: "fixture-secret-observer", actor: "viewer", source: "terminal", authority: "observer",
  permissions: ["read", "write", "control", "filesystem", "human-accept"], binding: { sessionId: "A", conversationId: 1 },
};
const machine: GrantSpec = {
  id: "iii-A", token: "fixture-secret-machine", actor: "verified-iii", source: "iii", authority: "delegated",
  permissions: ["read", "write", "control", "human-accept"], binding: { sessionId: "A", conversationId: 1 },
};
const target = { sessionId: "A", conversationId: 1 };

test("observer cannot mutate and a conversation grant cannot read another binding or host metadata", () => {
  const policy = new GrantPolicy([observer]);
  const handle = policy.authenticate(observer.token);
  assert.deepEqual(policy.assert(handle, "read", target), { actor: "viewer", source: "terminal", authority: "observer" });
  for (const action of ["write", "control", "filesystem", "human-accept"] as const)
    assert.throws(() => policy.assert(handle, action, target), GrantDenied);
  for (const other of [{ sessionId: "B", conversationId: 1 }, { sessionId: "A", conversationId: 2 }, { sessionId: "A" }, {}])
    assert.throws(() => policy.assert(handle, "read", other), GrantDenied);
});

test("delegated authority is server-derived and cannot accept human criteria", () => {
  const policy = new GrantPolicy([machine]);
  const handle = policy.authenticate(machine.token);
  const identity = policy.assert(handle, "write", target);
  assert.deepEqual(identity, { actor: "verified-iii", source: "iii", authority: "delegated" });
  assert.throws(() => policy.assert(handle, "human-accept", target), GrantDenied);
  assert.throws(() => new GrantPolicy([{ ...machine, authority: "human" }]), /iii.*delegated/);
  assert.throws(() => policy.assert({ ...handle }, "write", target), GrantDenied);
});

test("revocation closes observation and rejects cached handles before new native admission", () => {
  const policy = new GrantPolicy([machine, observer]);
  const handle = policy.authenticate(machine.token);
  const other = policy.authenticate(observer.token);
  const events: string[] = [];
  let closed = false;
  policy.signal(handle).addEventListener("abort", () => { closed = true; }, { once: true });
  const emit = (value: string) => { if (!closed) events.push(value); };
  emit("before");
  assert.equal(policy.revoke(machine.id), true);
  emit("after-revoke-sentinel");
  assert.equal(closed, true);
  assert.deepEqual(events, ["before"]);
  assert.throws(() => policy.authenticate(machine.token), GrantDenied);
  assert.throws(() => policy.assert(handle, "write", target), GrantDenied);
  assert.equal(policy.signal(handle).aborted, true);
  assert.equal(policy.signal(other).aborted, false);
  assert.equal(policy.revoke(machine.id), false);
  assert.equal(policy.revoke("absent"), false);
});

test("tokens and handle identities cannot be substituted; config is copied and errors contain no secret", () => {
  const supplied: GrantSpec = { ...machine, permissions: ["read"], binding: { ...target } };
  const policy = new GrantPolicy([supplied]);
  const handle = policy.authenticate(machine.token);
  supplied.permissions = ["read", "write"];
  supplied.binding = {};
  supplied.actor = "spoofed";
  assert.throws(() => policy.assert(handle, "write", target), GrantDenied);
  assert.throws(() => policy.assert(handle, "read", { sessionId: "B" }), GrantDenied);
  assert.equal(policy.assert(handle, "read", target).actor, machine.actor);
  const unrelated = new GrantPolicy([machine]);
  assert.throws(() => unrelated.assert(handle, "read", target), GrantDenied);
  for (const token of ["", "wrong-fixture-secret", machine.token + "x"]) {
    assert.throws(() => policy.authenticate(token), (error: unknown) =>
      error instanceof GrantDenied && error.status === 401 && !error.message.includes("fixture-secret"));
  }
  assert.ok(!JSON.stringify(handle).includes(machine.token));
  assert.throws(() => new GrantPolicy([machine, { ...machine, id: "different" }]), /Duplicate/);
  assert.throws(() => new GrantPolicy([machine, { ...observer, id: machine.id }]), /Duplicate/);
  assert.throws(() => new GrantPolicy([{ ...machine, binding: { conversationId: 1 } }]), /session/);
});

test("native policy references survive equivalent reload but are not credentials or permission widening", () => {
  const policy = new GrantPolicy([machine]);
  const handle = policy.authenticate(machine.token);
  const reference = policy.reference(handle);
  assert.match(reference, /^policy:[a-f0-9]{64}$/);
  assert.ok(!reference.includes(machine.token));
  assert.throws(() => policy.authenticate(reference), GrantDenied);
  assert.deepEqual(policy.assertReference(reference, "write", target), policy.assert(handle, "write", target));
  assert.throws(() => policy.reference({ ...handle }), GrantDenied);
  assert.throws(() => policy.assertReference(reference, "write", { sessionId: "B", conversationId: 1 }), GrantDenied);
  const same = new GrantPolicy([{ ...machine, token: "rotated-fixture-secret", permissions: [...machine.permissions].reverse() }]);
  assert.equal(same.reference(same.authenticate("rotated-fixture-secret")), reference);
  assert.equal(same.assertReference(reference, "write", target).authority, "delegated");
  for (const changed of [new GrantPolicy([]), new GrantPolicy([{ ...machine, permissions: ["read"] }]), new GrantPolicy([{ ...machine, binding: { sessionId: "B", conversationId: 1 } }])])
    assert.throws(() => changed.assertReference(reference, "write", target), GrantDenied);
  policy.revoke(machine.id);
  assert.throws(() => policy.assertReference(reference, "write", target), GrantDenied);
});

test("unbound server human grant may operate on host and session; permissions still apply", () => {
  const policy = new GrantPolicy([{ id: "human", token: "fixture-human", actor: "operator", source: "terminal", authority: "human", permissions: ["read", "human-accept"], binding: {} }]);
  const handle = policy.authenticate("fixture-human");
  policy.assert(handle, "read", {});
  policy.assert(handle, "read", target);
  policy.assert(handle, "human-accept", target);
  assert.throws(() => policy.assert(handle, "write", target), GrantDenied);
});
