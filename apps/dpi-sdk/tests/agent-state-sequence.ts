import type { AgentObservationFrame, AgentPublicState, AgentScope, WireAssistantMessage, WireEntry, WireUsage } from "../src/api.js";
export const scope: AgentScope = { sessionId: "fixture", conversationId: 1 };
export const usage: WireUsage = { input: 10, output: 5, cacheRead: 0, cacheWrite: 0, totalTokens: 15, cost: { input: 0.001, output: 0.002, cacheRead: 0, cacheWrite: 0, total: 0.003 } };
export const assistant = (content: WireAssistantMessage["content"], extra: Partial<WireAssistantMessage> = {}): WireAssistantMessage => ({
  role: "assistant", content, provider: "faux", model: "echo", usage, stopReason: "stop", ...extra,
});
export const user = (id: number, text: string): WireEntry => ({ id, conversationId: 1, kind: "pi.user", model: [{ role: "user", content: text }] });
export const publicState = (history: readonly WireEntry[] = [], extra: Partial<AgentPublicState> = {}): AgentPublicState => ({
  history: { items: history }, contextEntryIds: history.map(entry => entry.id), execution: { busy: false, inputEntryIds: [] },
  assistant: null, tools: [], compactions: [], config: { model: { provider: "faux", modelId: "echo" } },
  usage: { models: { "faux/echo": usage }, tools: {} }, inbox: [], notices: [], ...extra,
});
export const full = (revision: string, state: AgentPublicState): AgentObservationFrame => ({ type: "agent.state", ...scope, revision, state });
const input: WireEntry = { ...user(1, "hi"), kind: "host.input", data: { actor: "verified-operator" } };
const call = assistant([{ type: "text", text: "Let me look." }, { type: "toolCall", id: "c1", name: "bash", arguments: { command: "ls -la" } }]);
const committed: WireEntry = { id: 2, conversationId: 1, kind: "pi.assistant", model: [call] };
const result: WireEntry = { id: 3, conversationId: 1, kind: "pi.tool-result", model: [{ role: "toolResult", toolCallId: "c1", toolName: "bash", content: [{ type: "text", text: "a\nb\nc\n" }], isError: false }] };
const answer: WireEntry = { id: 4, conversationId: 1, kind: "pi.assistant", model: [assistant([{ type: "text", text: "Done." }])] };
/** One owned, typed sequence used unchanged by SDK and terminal tests. No upstream event interpreter. */
export const sequence: readonly AgentObservationFrame[] = [
  full("epoch:0", publicState([input])),
  { type: "agent.update", ...scope, baseRevision: "epoch:0", revision: "epoch:1", changes: {
    execution: { busy: true, inputEntryIds: [1] }, assistant: { message: call, retry: null, pollAt: null },
  } },
  { type: "agent.update", ...scope, baseRevision: "epoch:1", revision: "epoch:2", changes: {
    history: { items: [input, committed] }, assistant: null,
    tools: [{ callId: "c1", name: "bash", status: "running", output: "b\nc\n", details: { conversationId: 2 } }],
  } },
  // Answer committed does not mean idle: native work can remain busy.
  { type: "agent.update", ...scope, baseRevision: "epoch:2", revision: "epoch:3", changes: {
    history: { items: [input, committed, result, answer] }, tools: [],
  } },
  { type: "agent.update", ...scope, baseRevision: "epoch:3", revision: "epoch:4", changes: {
    execution: { busy: false, inputEntryIds: [] },
  } },
];
