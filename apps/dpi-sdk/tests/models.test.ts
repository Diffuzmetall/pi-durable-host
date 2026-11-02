import { test } from "node:test";
import assert from "node:assert/strict";
import { AgentModel, SessionModel, networkTree, lineage } from "../src/models.js";
import { toMarkdown, toTranscript, sumUsage } from "../src/transcript.js";
import type { AgentSummary, NetworkDevice, WireEntry } from "../src/api.js";
import { assistant, full, publicState, scope, sequence, usage, user } from "./agent-state-sequence.js";

test("owned section sequence renders live text, tool details, result, answer and idle separately", () => {
  const model = new AgentModel(scope);
  let renders = 0;
  model.subscribe(() => renders++);
  model.apply(sequence[0]);
  assert.equal(model.state.ready, true);
  assert.deepEqual(model.state.items.map(item => item.kind), ["user"]);
  model.apply(sequence[1]);
  const live = model.state.items.at(-1)!;
  assert.equal(live.kind === "assistant" && live.streaming, true);
  assert.deepEqual(live.kind === "assistant" && live.blocks[0], { type: "text", text: "Let me look." });
  assert.deepEqual(live.kind === "assistant" && live.blocks[1].type === "tool" && live.blocks[1].call.args, { command: "ls -la" });
  assert.equal(model.state.running, true);
  model.apply(sequence[2]);
  assert.equal(model.apply(sequence[2]), false);
  const running = model.state.items[1];
  const call = running.kind === "assistant" && running.blocks[1].type === "tool" ? running.blocks[1].call : undefined;
  assert.equal(call?.status, "running");
  assert.equal(call?.output, "b\nc\n");
  model.apply(sequence[3]);
  assert.equal(model.state.running, true, "answer is not idle");
  model.apply(sequence[4]);
  assert.deepEqual(model.state.items.map(item => item.kind), ["user", "assistant", "assistant"]);
  const done = model.state.items[1];
  const doneCall = done.kind === "assistant" && done.blocks[1].type === "tool" ? done.blocks[1].call : undefined;
  assert.equal(doneCall?.status, "done");
  assert.equal(doneCall?.result, "a\nb\nc\n");
  assert.equal(doneCall?.resultEntryId, 3);
  assert.equal(model.state.running, false);
  assert.equal(renders, 5);
  assert.match(toMarkdown(model.state.items), /### You \(#1\)\n\nhi/);
});

test("reconnect convergence, inbox and passive documents remain independent", () => {
  const model = new AgentModel(scope);
  for (const frame of sequence) model.apply(frame);
  const final = structuredClone(model.state);
  const latest = model.observation!.state!;
  model.apply(full("new-epoch:0", latest));
  assert.deepEqual(model.state, final);
  model.apply({ type: "inbox", items: [{ id: 7, mode: "steer", content: "use pnpm" }] });
  model.apply({ type: "doc", kind: "demo.jobs", value: { items: {} } });
  assert.equal(model.state.inbox[0].content, "use pnpm");
  assert.deepEqual(model.state.docs["demo.jobs"], { items: {} });
  model.clear();
  assert.equal(model.state.ready, false);
  assert.deepEqual(model.state.entries, []);
});

test("reset/compaction changes context, not visible or explicitly paged history", () => {
  const model = new AgentModel(scope);
  model.apply(full("a:0", publicState([user(10, "visible")], { history: { items: [user(10, "visible")], next: "older-page" } })));
  model.addHistoryPage({ items: [user(1, "older")], next: "oldest-page" });
  const reset: WireEntry = { id: 11, conversationId: 1, kind: "pi.reset", head: 11 };
  model.apply({ type: "agent.update", ...scope, baseRevision: "a:0", revision: "a:1", changes: {
    history: { items: [user(10, "visible"), reset] }, contextEntryIds: [11],
  } });
  assert.deepEqual(model.state.entries.map(entry => entry.id), [1, 10, 11]);
  assert.deepEqual(model.state.contextEntryIds, [11]);
  model.apply({ type: "agent.update", ...scope, baseRevision: "a:1", revision: "a:2", changes: {
    history: { items: [{ id: 12, conversationId: 1, kind: "pi.compaction", head: 12 }] }, contextEntryIds: [12],
  } });
  assert.deepEqual(model.state.entries.map(entry => entry.id), [1, 12]);
  assert.deepEqual(model.state.contextEntryIds, [12]);
  // A page received during a gap must not falsely heal observation or resurrect an old revision.
  model.apply({ type: "agent.update", ...scope, baseRevision: "missing", revision: "a:4", changes: {} });
  model.addHistoryPage({ items: [user(2, "another page")] });
  assert.equal(model.state.needsResync, true);
  assert.equal(model.state.ready, false);
  model.apply(full("b:0", publicState([user(20, "resynced")])));
  assert.deepEqual(model.state.entries.map(entry => entry.id), [1, 2, 20]);
  assert.equal(model.state.needsResync, false);
});

test("scope changes are ignored; revoke clears protected state and rejects late state/docs/pages", () => {
  const model = new AgentModel(scope);
  model.apply(sequence[0]);
  model.apply({ type: "doc", kind: "host.agent-mail", value: { name: "fixture", project: "fixture" } });
  assert.equal(model.apply({ ...full("alien", publicState([user(2, "wrong")])), conversationId: 2 }), false);
  model.apply({ type: "agent.end", ...scope, reason: "revoked" });
  assert.deepEqual(model.state.entries, []);
  assert.deepEqual(model.state.docs, {});
  assert.equal(model.state.ready, false);
  assert.equal(model.state.end, "revoked");
  assert.equal(model.apply(full("late", publicState([user(3, "late")]))), false);
  assert.equal(model.apply({ type: "doc", kind: "private", value: "late" }), false);
  model.addHistoryPage({ items: [user(4, "late page")] });
  assert.deepEqual(model.state.entries, []);
});

test("aborted partials, unmatched results and extension records preserve rendering", () => {
  const items = toTranscript([
    { id: 1, conversationId: 1, kind: "pi.assistant", model: [assistant([{ type: "text", text: "part" }], { stopReason: "aborted" })] },
    { id: 2, conversationId: 1, kind: "pi.tool-result", model: [{ role: "toolResult", toolCallId: "gone", toolName: "read", content: [{ type: "text", text: "x" }], isError: true }] },
    { id: 3, conversationId: 1, kind: "pi.system", model: [] },
    { id: 4, conversationId: 1, kind: "demo.event", data: { text: "Job done" } },
  ]);
  assert.deepEqual(items.map(item => item.kind), ["assistant", "tool-result", "event"]);
  assert.equal(items[0].kind === "assistant" && items[0].error, "Interrupted. Partial response preserved.");
  assert.equal(items[2].kind === "event" && items[2].text, "Job done");
  assert.equal(sumUsage({ models: { a: usage, b: usage } }).tokens, 30);
});

test("session lineage and network tree nest forks and subagents", () => {
  const agents: AgentSummary[] = [
    { id: 1, name: "Main", named: false, kind: "root", busy: true, background: 0 },
    { id: 4, name: "alt", named: true, kind: "fork", parentId: 1, forkedAt: 3, busy: false, background: 0 },
    { id: 6, name: "Subagent #6", named: false, kind: "subagent", ownerAgentId: 4, ownerTaskId: 9, busy: true, background: 0 },
    { id: 7, name: "Root #7", named: false, kind: "root", busy: false, background: 1 },
  ];
  assert.deepEqual(lineage(agents, 4).map(a => a.id), [1, 4]);
  const session = new SessionModel();
  session.apply({ type: "session", agents, tasks: [{ id: 1, kind: "pi.generation", conversationId: 1, background: false, state: { status: "running" }, conversations: [] }], usage: { models: {}, tools: {} } });
  assert.equal(session.foregroundBusy(1), true); assert.equal(session.foregroundBusy(7), false);
  const device: NetworkDevice = { id: "box", name: "Box", kind: "ssh", url: "http://box:4780", source: "config", hasToken: true, status: "online",
    tree: { uid: "u", name: "box", at: 1, sessions: [{ id: "s1", name: "S", cwd: "/w", model: "m", createdAt: 1, dbPath: "/d", busy: true, agents }] } };
  const [root] = networkTree([device]);
  const node = root.children[0];
  assert.equal(node.key, "box/s/s1");
  assert.deepEqual(node.children.map(n => n.type === "agent" && n.agent.id), [1, 7]);
  assert.deepEqual(node.children[0].children.map(n => n.type === "agent" && n.agent.id), [4]);
  assert.deepEqual(node.children[0].children[0].children.map(n => n.type === "agent" && n.agent.id), [6]);
  assert.equal(networkTree([{ ...device, status: "offline" }])[0].stale, true);
});

test("historical real committed records still render to the frozen transcript (not a native observation test)", async () => {
  const { readFileSync } = await import("node:fs");
  const fixture = JSON.parse(readFileSync(new URL("./fixtures/agent-tool-turn.json", import.meta.url), "utf8"));
  const records = new Map<number, WireEntry>();
  // Extract only committed records from the immutable 1.4 evidence. Never reduce its native deltas.
  for (const frame of fixture.frames) {
    if (frame.type === "snapshot") for (const entry of frame.snapshot.entries) records.set(entry.id, entry);
    for (const event of frame.events ?? []) {
      if (event.entry) records.set(event.entry.id, event.entry);
    }
  }
  const actual = toTranscript([...records.values()].sort((a, b) => a.id - b.id));
  assert.deepEqual(JSON.parse(JSON.stringify(actual)), fixture.transcript);
});
