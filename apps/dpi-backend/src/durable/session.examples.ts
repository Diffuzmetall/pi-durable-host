import type {
  AgentEndFrame,
  AgentPublicState,
  AgentStateFrame,
  AgentUpdateFrame,
  SendMessageBody,
  SendResult,
} from "../../../dpi-sdk/src/api.js";
import type { DurableSession, SessionAccess, SessionOpenRequest } from "./session.js";

type Require<T extends true> = T;
export type SessionHasNoNativeEscape = Require<
  Extract<keyof DurableSession, "harness" | "conversation" | "commit" | "doc" | "watchEvents" | "execute" | "storage"> extends never ? true : false
>;
export type ObserveUsesServerCapability = Require<
  Parameters<DurableSession["observe"]>[0] extends SessionAccess ? true : false
>;
export type SendUsesPublicBody = Require<
  Parameters<DurableSession["send"]>[2] extends SendMessageBody ? true : false
>;

const state: AgentPublicState = {
  history: {
    items: [
      { id: 44, conversationId: 7, kind: "pi.message", model: [{ role: "user", content: "Public fixture" }] },
      {
        id: 45, conversationId: 7, kind: "pi.message", model: [{
          role: "assistant", content: [{ type: "text", text: "Public fixture answer" }],
          provider: "fixture", model: "local-faux", stopReason: "stop",
          usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
        }],
      },
    ],
    next: "opaque-page-for-fixture-session-conversation-7",
  },
  contextEntryIds: [44, 45],
  execution: { busy: true, inputEntryIds: [44] },
  assistant: null,
  tools: [],
  compactions: [],
  config: {},
  usage: { models: {}, tools: {} },
  inbox: [],
  notices: [],
};

export const d0ContractExamples = {
  create: {
    sessionId: "fixture-session", directory: "/isolated-fixture/session",
    mode: "create", initial: { cwd: "/isolated-fixture/workspace", model: { provider: "fixture", modelId: "local-faux" } },
  } satisfies SessionOpenRequest,
  resume: {
    sessionId: "fixture-session", directory: "/isolated-fixture/session", mode: "resume",
  } satisfies SessionOpenRequest,
  send: { content: "Public fixture", requestId: "r-1", whenBusy: "followUp", waitMs: 0 } satisfies SendMessageBody,
  answeredWhileBusy: {
    submissionId: 41, status: "done", answer: { entryId: 45, text: "Public fixture answer" },
  } satisfies SendResult,
  initial: {
    type: "agent.state", sessionId: "fixture-session", conversationId: 7, revision: "epoch-A:1", state,
  } satisfies AgentStateFrame,
  gap: {
    type: "agent.update", sessionId: "fixture-session", conversationId: 7,
    baseRevision: "epoch-A:2", revision: "epoch-A:3", changes: { execution: { busy: false, inputEntryIds: [] } },
  } satisfies AgentUpdateFrame,
  resync: {
    type: "agent.state", sessionId: "fixture-session", conversationId: 7, revision: "epoch-B:1", state,
  } satisfies AgentStateFrame,
  contextReset: {
    type: "agent.update", sessionId: "fixture-session", conversationId: 7,
    baseRevision: "epoch-B:1", revision: "epoch-B:2", changes: { contextEntryIds: [], assistant: null },
  } satisfies AgentUpdateFrame,
  revoked: {
    type: "agent.end", sessionId: "fixture-session", conversationId: 7, reason: "revoked",
  } satisfies AgentEndFrame,
};
