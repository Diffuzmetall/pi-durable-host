import { AGENT_HISTORY_LIMIT, type AgentObservationFrame, type MessageReceiptResult, type MessageReconciliationResult, type SendResult } from "./api.js";
import { DpiError } from "./errors.js";

type Check = (value: unknown) => boolean;
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const string: Check = value => typeof value === "string";
const number: Check = value => typeof value === "number" && Number.isFinite(value);
const id: Check = value => typeof value === "number" && Number.isSafeInteger(value) && value > 0;
const boolean: Check = value => typeof value === "boolean";
const array = (check: Check): Check => value => Array.isArray(value) && value.every(check);
const optional = (check: Check): Check => value => value === undefined || check(value);
const nullable = (check: Check): Check => value => value === null || check(value);
const oneOf = (...values: unknown[]): Check => value => values.includes(value);
const dictionary = (check: Check): Check => value => object(value) && Object.values(value).every(check);
/** Each observation object has a closed shape; arbitrary delta paths/unknown sections are refused. */
const shape = (fields: Record<string, Check>): Check => value => object(value) &&
  Object.keys(value).every(key => Object.hasOwn(fields, key)) &&
  Object.entries(fields).every(([key, check]) => check(value[key]));
const cost = shape({ input: number, output: number, cacheRead: number, cacheWrite: number, total: number });
const usage = shape({ input: number, output: number, cacheRead: number, cacheWrite: number, totalTokens: number, cost });
const text = shape({ type: oneOf("text"), text: string });
const image = shape({ type: oneOf("image"), data: string, mimeType: string });
const thinking = shape({ type: oneOf("thinking"), thinking: string, redacted: optional(boolean) });
const toolCall = shape({ type: oneOf("toolCall"), id: string, name: string, arguments: () => true });
const userBlock: Check = value => text(value) || image(value);
const assistantBlock: Check = value => text(value) || thinking(value) || toolCall(value);
const assistant = shape({
  role: oneOf("assistant"), content: array(assistantBlock), provider: string, model: string, usage,
  stopReason: string, errorMessage: optional(string), timestamp: optional(number),
});
const message: Check = value => {
  if (!object(value) || !string(value.role)) return false;
  if (value.role === "assistant") return assistant(value);
  if (value.role === "user") return shape({ role: oneOf("user"), content: value => string(value) || array(userBlock)(value), timestamp: optional(number) })(value);
  if (value.role === "toolResult") return shape({
    role: oneOf("toolResult"), toolCallId: string, toolName: string, content: array(userBlock),
    isError: boolean, details: optional(() => true), timestamp: optional(number),
  })(value);
  // Other committed roles remain opaque records, never assistant/renderer messages.
  return true;
};
const entry = shape({
  id, conversationId: id, kind: string, model: optional(array(message)), data: optional(() => true),
  head: optional(id), byTaskId: optional(id),
});
const tool = shape({
  callId: string, name: string, taskId: optional(id), status: oneOf("pending", "running", "done"),
  output: optional(string), droppedBytes: optional(number), droppedLines: optional(number), details: optional(() => true), entry: optional(id),
});
const retry = shape({ at: number, error: string });
const compaction = shape({ taskId: id, reason: string, blocking: boolean, attempt: number, retry: optional(retry) });
const config = shape({
  model: optional(shape({ provider: string, modelId: string })), thinkingLevel: optional(string),
  extensions: optional(() => true), tools: optional(() => true), instructions: optional(string), cwd: optional(string),
});
const sectionChecks: Record<string, Check> = {
  history: shape({ items: value => Array.isArray(value) && value.length <= AGENT_HISTORY_LIMIT && value.every(entry), next: optional(string) }),
  contextEntryIds: array(id),
  execution: shape({ busy: boolean, inputEntryIds: array(id) }),
  assistant: nullable(shape({ message: nullable(assistant), retry: nullable(shape({ at: number, message: string })), pollAt: nullable(number) })),
  tools: array(tool), compactions: array(compaction), config,
  usage: shape({ models: dictionary(usage), tools: dictionary(usage) }),
  inbox: array(shape({ id, mode: oneOf("steer", "followUp", "write"), content: optional(string) })),
  notices: array(string),
};
const fullState = shape(sectionChecks);
const changes: Check = value => object(value) && Object.entries(value).every(([key, item]) =>
  Object.hasOwn(sectionChecks, key) && sectionChecks[key](item));
const revision: Check = value => typeof value === "string" && value.length > 0;

/** Validate untrusted JSON once at the transport boundary. Reducers only receive typed owned frames. */
export function parseAgentObservationFrame(value: unknown): AgentObservationFrame {
  const scope = { sessionId: revision, conversationId: id };
  const valid = (candidate: unknown): candidate is AgentObservationFrame => object(candidate) && (
    shape({ ...scope, type: oneOf("agent.state"), revision, state: fullState })(candidate) ||
    shape({ ...scope, type: oneOf("agent.update"), revision, baseRevision: revision, changes })(candidate) ||
    shape({ ...scope, type: oneOf("agent.end"), reason: oneOf("closed", "resync", "revoked", "unavailable") })(candidate)
  );
  if (!valid(value)) throw new DpiError("unavailable", "Host returned an invalid public agent observation", 502);
  if (value.type !== "agent.end") {
    const history = value.type === "agent.state" ? value.state.history : value.changes.history;
    if (history) {
      const seen = new Set<number>();
      let previous = 0;
      for (const item of history.items) {
        if (item.conversationId !== value.conversationId || seen.has(item.id) || item.id <= previous)
          throw new DpiError("unavailable", "Host returned an invalid public history window", 502);
        seen.add(item.id); previous = item.id;
      }
    }
  }
  return value;
}

const receipt: Check = value => object(value) && id(value.submissionId) && (
  oneOf("queued", "pending", "done")(value.status) || (value.status === "unanswered" && string(value.reason))
);
export function parseSendResult(value: unknown): SendResult {
  const valid = (candidate: unknown): candidate is SendResult => receipt(candidate) && object(candidate) &&
    (candidate.status !== "done" || shape({ entryId: id, text: string })(candidate.answer));
  if (!valid(value)) throw new DpiError("unavailable", "Host returned an invalid message result; delivery is uncertain", 502);
  return value;
}
export function parseMessageReceipt(value: unknown): MessageReceiptResult {
  const valid = (candidate: unknown): candidate is MessageReceiptResult => receipt(candidate);
  if (!valid(value)) throw new DpiError("unavailable", "Host returned an invalid saved message receipt", 502);
  return value;
}
export function parseMessageReconciliation(value: unknown, conversationId: number, requestId: string): MessageReconciliationResult {
  const valid = (candidate: unknown): candidate is MessageReconciliationResult => object(candidate) &&
    candidate.conversationId === conversationId && candidate.requestId === requestId &&
    (candidate.accepted === true ? receipt(candidate) : candidate.accepted === false && !Object.hasOwn(candidate, "submissionId"));
  if (!valid(value)) throw new DpiError("unavailable", "Host returned an invalid message reconciliation; delivery is uncertain", 502);
  return value;
}
