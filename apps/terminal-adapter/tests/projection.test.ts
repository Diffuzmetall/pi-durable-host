import assert from "node:assert/strict";
import test from "node:test";
import { AgentModel } from "dpi-sdk/models";
import { TerminalProjection } from "../src/projection.js";
import { full, publicState, scope, sequence, user } from "../../dpi-sdk/tests/agent-state-sequence.js";

test("SDK and terminal consume one identical state sequence; presentation retains safe tool and actor details", () => {
  const p = new TerminalProjection(scope), sdk = new AgentModel(scope);
  for (let index = 0; index < sequence.length; index++) {
    p.apply(sequence[index]); sdk.apply(sequence[index]);
    assert.deepEqual(p.snapshot.entries, sdk.state.entries);
    assert.equal(!!p.snapshot.run, sdk.state.running);
    assert.equal(!!p.snapshot.generation?.message, sdk.state.generating);
    if (index === 1) assert.deepEqual(p.snapshot.generation?.message?.content[0], { type: "text", text: "Let me look." });
    if (index === 2) {
      assert.equal(p.snapshot.tools[0].output, "b\nc\n");
      assert.deepEqual(p.snapshot.tools[0].details, { conversationId: 2 });
    }
    if (index === 3) assert(p.snapshot.run, "answer does not imply idle");
  }
  assert.equal(p.snapshot.entries[0].kind, "host.input");
  assert.equal(p.renderedEntries[0].kind, "pi.user");
  assert.deepEqual(p.renderedEntries[0].data, { actor: "verified-operator" });
  assert.equal(p.snapshot.run, undefined);
  assert.equal(p.snapshot.generation, undefined);
  assert.deepEqual(p.snapshot.tools, []);
  assert.deepEqual(p.snapshot.entries.map(entry => entry.id), [1, 2, 3, 4]);
});

test("fresh state converges without duplicates; reset preserves history, passive docs and paged entries", () => {
  const p = new TerminalProjection(scope);
  const record = { id: 4, conversationId: 1, kind: "extension.unknown", data: { text: "safe fallback" } };
  const inbox = [{ id: 9, mode: "followUp" as const, content: "pending" }];
  p.apply(full("a:0", publicState([record], { inbox })));
  p.addHistoryPage({ items: [user(1, "old page")] });
  p.apply(full("b:0", publicState([record], { inbox })));
  assert.equal(p.snapshot.entries.length, 2);
  assert.equal(p.renderedEntries[1].kind, "extension.unknown");
  p.apply({ type: "doc", kind: "fixture.passive-document", value: { state: "waiting", answer: null } });
  p.apply({ type: "agent.update", ...scope, baseRevision: "b:0", revision: "b:1", changes: {
    history: { items: [record, { id: 7, head: 7, conversationId: 1, kind: "pi.reset" }] }, contextEntryIds: [7],
  } });
  assert.deepEqual(p.snapshot.entries.map(entry => entry.id), [1, 4, 7]);
  assert.deepEqual(p.model.state.contextEntryIds, [7]);
  assert.deepEqual(p.docs["fixture.passive-document"], { state: "waiting", answer: null });
  assert.deepEqual(p.inbox, inbox);
});

test("revoked projection clears entries, passive documents, Mail and attention and rejects late frames", () => {
  const p = new TerminalProjection(scope);
  p.apply(sequence[0]);
  p.apply({ type: "doc", kind: "host.agent-mail", value: { name: "fixture", project: "fixture" } });
  p.apply({ type: "doc", kind: "bb.subagent-supervisor", value: { requests: {} } });
  assert(p.agentMail); assert(p.attention);
  p.apply({ type: "agent.end", ...scope, reason: "revoked" });
  assert.deepEqual(p.renderedEntries, []); assert.deepEqual(p.docs, {});
  assert.equal(p.agentMail, undefined); assert.equal(p.attention, undefined);
  assert.equal(p.apply(sequence[0]), false);
  assert.equal(p.apply({ type: "doc", kind: "host.agent-mail", value: { name: "late", project: "late" } }), false);
  assert.equal(p.agentMail, undefined);
});
