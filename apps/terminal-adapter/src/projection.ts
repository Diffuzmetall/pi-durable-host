import type { AgentMailIdentity, AgentScope, Frame, InboxItem, Page, WireAgentState, WireCompaction, WireEntry, WireToolSlot, WireUsageState } from "dpi-sdk/api";
import { AgentModel } from "dpi-sdk/models";
import { isRenderableMessage, type AttentionView, type DurableView, type EntryRecord, type LiveState } from "./types.js";
import { externalDirectoriesView } from './external-directories.js';
import { nativeGoalsView, scheduleView } from "./automation-view.js";

/** Existing TUI presentation input, computed from the SDK model, never a native stream snapshot. */
interface TerminalPresentation extends LiveState {
  entries: readonly WireEntry[];
  tools: readonly WireToolSlot[];
  compactions: readonly WireCompaction[];
  agent: WireAgentState;
  usage: WireUsageState;
}
export class TerminalProjection {
  readonly model: AgentModel;
  docs: Record<string, unknown> = {};
  attention: AttentionView | undefined;
  agentMail: AgentMailIdentity | undefined;
  externalDirectories: DurableView['externalDirectories'];
  automation: DurableView["automation"] = { scheduled: 0, failed: 0 };
  private readonly automationErrors = new Set<string>();

  constructor(scope?: AgentScope) { this.model = new AgentModel(scope); }
  get inbox(): InboxItem[] { return this.model.state.inbox; }
  get needsResync() { return this.model.state.needsResync; }
  get end() { return this.model.state.end; }
  get snapshot(): TerminalPresentation {
    const state = this.model.state, publicState = this.model.observation?.state;
    const assistant = publicState?.assistant;
    return {
      entries: state.entries, agent: state.agent, usage: state.usage,
      tools: publicState?.tools ?? [], compactions: publicState?.compactions ?? [],
      ...(state.running ? { run: { inputs: state.inputEntryIds } } : {}),
      ...(assistant ? { generation: {
        ...(assistant.message ? { message: assistant.message } : {}),
        ...(assistant.retry ? { retry: { at: assistant.retry.at, error: assistant.retry.message } } : {}),
        ...(assistant.pollAt !== null ? { deferred: { pollAt: assistant.pollAt } } : {}),
      } } : {}),
    };
  }
  addHistoryPage(page: Page<WireEntry>) { this.model.addHistoryPage(page); }

  apply(frame: Frame): boolean {
    const changed = this.model.apply(frame);
    if (this.end === "revoked") {
      this.docs = {}; this.attention = undefined; this.agentMail = undefined; this.externalDirectories = undefined;
      this.automation = { scheduled: 0, failed: 0 }; this.automationErrors.clear();
      return changed;
    }
    if (frame.type !== "doc") return changed;
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
  /** Presentation only: native record IDs and authenticated actor metadata remain intact. */
  get renderedEntries(): EntryRecord[] {
    return this.snapshot.entries.map(entry => ({
      ...entry, kind: entry.kind === "host.input" && entry.model?.[0]?.role === "user" ? "pi.user" : entry.kind,
      model: entry.model?.filter(isRenderableMessage),
    }));
  }
}
