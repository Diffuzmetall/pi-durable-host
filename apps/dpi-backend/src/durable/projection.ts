import type { AssistantMessage, Message } from "@earendil-works/pi-ai";
import type { AgentState, ConversationView, EntryRecord, InboxState, LiveState, UsageState } from "@earendil-works/pi-durable";
import type { AgentPublicState, WireAssistantMessage, WireEntry, WireMessage } from "../../../dpi-sdk/src/api.js";

const failure = "Provider request failed; details are private.";

/** Native model messages are schema-checked by Durable. Never serialize transport metadata or tool arguments. */
function message(value: Message): WireMessage {
  if (value.role === "user") return { role: "user", content: value.content, timestamp: value.timestamp };
  if (value.role === "toolResult") return {
    role: "toolResult", toolCallId: value.toolCallId, toolName: value.toolName,
    content: value.isError ? [{ type: "text", text: "Tool failed; details are private." }] : value.content,
    isError: value.isError, timestamp: value.timestamp,
  };
  return value.role === "assistant" ? assistant(value) : { role: value.role };
}

export function assistant(value: AssistantMessage): WireAssistantMessage {
  return {
    role: "assistant", provider: value.provider, model: value.model, usage: value.usage,
    stopReason: value.stopReason, timestamp: value.timestamp,
    content: value.stopReason === "error" ? [] : value.content.map(block => {
      switch (block.type) {
        case "text": return { type: "text", text: block.text };
        case "thinking": return { type: "thinking", thinking: block.thinking };
        case "toolCall": return { type: "toolCall", id: block.id, name: block.name, arguments: {} };
      }
    }),
    ...(value.errorMessage !== undefined ? { errorMessage: value.stopReason === "aborted" ? "Request interrupted" : failure } : {}),
  };
}

export function entry(value: EntryRecord): WireEntry {
  return {
    id: value.id, conversationId: value.conversationId, kind: value.kind,
    ...(value.model ? { model: value.model.map(message) } : {}),
    ...(value.head !== undefined ? { head: value.head } : {}),
    ...(value.byTaskId !== undefined ? { byTaskId: value.byTaskId } : {}),
  };
}

/** These four native built-ins are versioned and validated by the owning native runtime, not arbitrary documents. */
export function project(view: ConversationView, contextEntryIds: readonly number[], inputEntryIds: readonly number[], next?: string): AgentPublicState {
  const live = view.docs["pi.live"] as LiveState | undefined;
  const agent = view.docs["pi.agent"] as AgentState | undefined;
  const usage = view.docs["pi.usage"] as UsageState | undefined;
  const inbox = view.docs["pi.inbox"] as InboxState | undefined;
  const generation = live?.generation;
  return {
    history: { items: view.entries.map(entry), ...(next ? { next } : {}) },
    contextEntryIds, execution: { busy: live?.run !== undefined, inputEntryIds },
    assistant: generation ? {
      message: generation.message ? assistant(generation.message) : null,
      retry: generation.retry ? { at: generation.retry.at, message: failure } : null,
      pollAt: generation.deferred?.pollAt ?? null,
    } : null,
    tools: (live?.tools ?? []).map(slot => ({
      callId: slot.callId, name: slot.name, status: slot.status,
      ...(slot.taskId !== undefined ? { taskId: slot.taskId } : {}),
      ...(slot.output !== undefined ? { output: slot.output } : {}),
      ...(slot.droppedBytes !== undefined ? { droppedBytes: slot.droppedBytes } : {}),
      ...(slot.droppedLines !== undefined ? { droppedLines: slot.droppedLines } : {}),
      ...(slot.entry !== undefined ? { entry: slot.entry } : {}),
    })),
    compactions: (live?.compactions ?? []).map(value => ({
      taskId: value.taskId, reason: value.trigger, blocking: value.blocking, attempt: value.attempt,
      ...(value.retry ? { retry: { at: value.retry.at, error: failure } } : {}),
    })),
    config: {
      ...(agent?.model ? { model: agent.model } : {}),
      ...(agent?.thinkingLevel ? { thinkingLevel: agent.thinkingLevel } : {}),
      ...(agent?.instructions !== undefined ? { instructions: agent.instructions } : {}),
      ...(agent?.cwd !== undefined ? { cwd: agent.cwd } : {}),
    },
    usage: { models: usage?.models ?? {}, tools: usage?.tools ?? {} },
    inbox: (inbox?.items ?? []).map(value => ({ id: value.id, mode: value.mode })),
    notices: [
      ...(live?.runFailure ? [`Run ended: ${live.runFailure.reason}`] : []),
      ...(live?.compactionFailure ? ["Compaction failed; details are private."] : []),
    ],
  };
}
