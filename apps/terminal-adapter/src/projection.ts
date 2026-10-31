import type { AgentMailIdentity, Frame, InboxItem, WireAgentEvent, WireEntry, WireSnapshotEvent, WireToolSlot } from "dpi-sdk/api";
import { applyMessageChange } from "dpi-sdk/models";
import { isRenderableMessage, type AttentionView, type DurableView, type EntryRecord } from "./types.js";
import { externalDirectoriesView } from './external-directories.js';
import { nativeGoalsView, scheduleView } from "./automation-view.js";

/** Raw view projection for the existing TUI; unlike normalized transcript items, retains tool details. */
export class TerminalProjection {
  snapshot: WireSnapshotEvent = {
    type: "snapshot", entries: [], tools: [], compactions: [], inbox: [], agent: {}, usage: { models: {}, tools: {} },
  };
  inbox: InboxItem[] = [];
  docs: Record<string, unknown> = {};
  attention: AttentionView | undefined;
  agentMail: AgentMailIdentity | undefined;
  externalDirectories: DurableView['externalDirectories'];
  automation: DurableView["automation"] = { scheduled: 0, failed: 0 };
  private readonly automationErrors = new Set<string>();
  private entries = new Map<number, WireEntry>();

  apply(frame: Frame): boolean {
    switch (frame.type) {
      case "snapshot":
        this.reset(frame.snapshot);
        this.inbox = frame.inbox;
        return true;
      case "batch":
        for (const event of frame.events) this.event(event);
        this.snapshot.entries = [...this.entries.values()].sort((a, b) => a.id - b.id);
        return true;
      case "inbox": this.inbox = frame.items; return true;
      case "doc": {
        this.docs = { ...this.docs, [frame.kind]: frame.value };
        if (frame.kind === 'pi.external-directories') {
          this.externalDirectories = externalDirectoriesView(frame.value);
          return true;
        }
        if (frame.kind === "host.agent-mail") {
          const value = frame.value;
          this.agentMail = value && typeof value === "object" &&
            "name" in value && typeof value.name === "string" && value.name.trim() &&
            "project" in value && typeof value.project === "string" && value.project.trim()
            ? { name: value.name, project: value.project } : undefined;
          return true;
        }
        if (frame.kind === "durable-goals.native-goals" || frame.kind === "durable.schedules") {
          const value = frame.kind === "durable-goals.native-goals" ? nativeGoalsView(frame.value) : scheduleView(frame.value);
          if (value) this.automationErrors.delete(frame.kind); else this.automationErrors.add(frame.kind);
          if (frame.kind === "durable-goals.native-goals") this.automation = { ...this.automation, nativeGoals: value && "goals" in value ? value : undefined };
          else if (value && "scheduled" in value) this.automation = { ...this.automation, ...value };
          this.automation = { ...this.automation, unavailable: this.automationErrors.size > 0 };
          return true;
        }
        if (frame.kind !== "bb.subagent-supervisor") return true;
        const doc = frame.value;
        this.attention = undefined;
        if (doc === null || doc === undefined) return true;
        const pending: AttentionView["requests"][number][] = [];
        const invalid = () => { this.attention = { requests: [], unavailable: true }; return true; };
        if (typeof doc !== "object" || !("requests" in doc) || !doc.requests || typeof doc.requests !== "object" || Array.isArray(doc.requests)) return invalid();
        for (const [id, raw] of Object.entries(doc.requests)) {
          const request: unknown = raw;
          if (!request || typeof request !== "object" || !("state" in request)) return invalid();
          if (request.state === "answered" || request.state === "cancelled") continue;
          if (request.state !== "pending" || !id || !("id" in request) || request.id !== id ||
              !("child" in request) || typeof request.child !== "number" || !Number.isSafeInteger(request.child) || request.child <= 0 ||
              !("name" in request) || typeof request.name !== "string" || !("message" in request) || typeof request.message !== "string" ||
              !("reason" in request) || (request.reason !== "need_decision" && request.reason !== "interview_request")) return invalid();
          pending.push({ id, child: request.child, name: request.name, reason: request.reason, message: request.message });
        }
        this.attention = { requests: pending };
        return true;
      }
      default: return false;
    }
  }

  /** Only presentation changes: retain the native ID and authenticated actor metadata. */
  get renderedEntries(): EntryRecord[] {
    return this.snapshot.entries.map((entry) => ({
      ...entry,
      kind: entry.kind === "host.input" && entry.model?.[0]?.role === "user" ? "pi.user" : entry.kind,
      model: entry.model?.filter(isRenderableMessage),
    }));
  }

  private reset(snapshot: WireSnapshotEvent) {
    this.snapshot = structuredClone(snapshot);
    this.entries = new Map(this.snapshot.entries.map((entry) => [entry.id, entry]));
    this.snapshot.entries = [...this.entries.values()].sort((a, b) => a.id - b.id);
  }

  private commit(entry: WireEntry) {
    this.entries.set(entry.id, entry);
    if (entry.kind === "pi.reset" || entry.kind === "pi.compaction") {
      const head = entry.head ?? entry.id;
      for (const id of this.entries.keys()) if (id < head) this.entries.delete(id);
    }
  }

  private event(event: WireAgentEvent) {
    const state = this.snapshot;
    switch (event.type) {
      case "snapshot": this.reset(event); return;
      case "run_start": state.run = { inputs: event.inputs }; return;
      case "run_end": state.run = undefined; state.generation = undefined; return;
      case "message_start":
        if (event.message.role === "assistant") state.generation = { attempt: 0, message: structuredClone(event.message as NonNullable<WireSnapshotEvent["generation"]>["message"]) };
        return;
      case "message_update": {
        let message = state.generation?.message ?? { role: "assistant" as const, content: [], provider: "", model: "", usage: event.usage, stopReason: "pending" };
        for (const change of event.changes) message = applyMessageChange(message, change);
        state.generation = { attempt: state.generation?.attempt ?? 0, ...state.generation, message: { ...message, usage: event.usage } };
        return;
      }
      case "message_end": state.generation = undefined; this.commit(event.entry); return;
      case "entry_appended": this.commit(event.entry); return;
      case "tool_execution_start":
        state.tools = [...state.tools.filter((slot) => slot.callId !== event.toolCallId), { callId: event.toolCallId, name: event.toolName, status: "running" }];
        return;
      case "tool_execution_update": {
        const slot: WireToolSlot = { ...(state.tools.find((slot) => slot.callId === event.toolCallId) ?? { callId: event.toolCallId, name: event.toolName }), status: "running" };
        if (event.output && "set" in event.output) slot.output = event.output.set;
        else if (event.output) slot.output = (slot.output ?? "").slice(event.output.trimStart ?? 0) + (event.output.append ?? "");
        if (event.details !== undefined) slot.details = event.details;
        state.tools = [...state.tools.filter((item) => item.callId !== slot.callId), slot];
        return;
      }
      case "tool_execution_end":
        state.tools = state.tools.filter((slot) => slot.callId !== event.toolCallId);
        if (event.entry) this.commit(event.entry);
        return;
      case "agent_changed": state.agent = event.agent; return;
      case "usage_changed": state.usage = event.usage; return;
      case "inbox_update": state.inbox = event.items; return;
      case "auto_retry_start": state.generation = { ...state.generation, attempt: event.attempt, retry: { at: event.at, error: event.errorMessage } }; return;
      case "auto_retry_end": if (state.generation) state.generation.retry = undefined; return;
      case "deferred_poll": state.generation = { attempt: state.generation?.attempt ?? 0, ...state.generation, deferred: { pollAt: event.pollAt } }; return;
      case "compaction_start":
        state.compactions = [...state.compactions.filter((item) => item.taskId !== event.taskId), { taskId: event.taskId, reason: event.reason, blocking: event.blocking, attempt: 0 }];
        return;
      case "compaction_end": state.compactions = state.compactions.filter((item) => item.taskId !== event.taskId); return;
      default: return;
    }
  }
}
