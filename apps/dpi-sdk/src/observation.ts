import type { AgentEndFrame, AgentObservationFrame, AgentPublicState, AgentScope } from "./api.js";

/** Shared state applicator for SDK models and terminal presentation. Never interprets native events. */
export class AgentStateReducer {
  state: AgentPublicState | undefined;
  revision: string | undefined;
  needsResync = false;
  end: AgentEndFrame["reason"] | undefined;

  constructor(readonly scope: AgentScope) {}

  /** A resync means reconnect observation for a fresh state, never repeat the submitted command. */
  apply(frame: AgentObservationFrame): "applied" | "ignored" | "resync" | "ended" {
    if (frame.sessionId !== this.scope.sessionId || frame.conversationId !== this.scope.conversationId)
      return "ignored";
    if (this.end === "revoked") return "ignored";
    if (frame.type === "agent.end") {
      if (frame.reason === "revoked") this.clear();
      this.end = frame.reason;
      this.needsResync = frame.reason === "resync" || frame.reason === "unavailable";
      return "ended";
    }
    if (frame.type === "agent.state") {
      this.state = structuredClone(frame.state);
      this.revision = frame.revision;
      this.needsResync = false;
      this.end = undefined;
      return "applied";
    }
    if (!this.end && !this.needsResync && this.revision === frame.revision) return "ignored";
    if (!this.state || this.end || this.needsResync || frame.baseRevision !== this.revision) {
      this.needsResync = true;
      return "resync";
    }
    const current = this.state;
    const change = frame.changes;
    this.state = structuredClone({
      history: change.history ?? current.history,
      contextEntryIds: change.contextEntryIds ?? current.contextEntryIds,
      execution: change.execution ?? current.execution,
      assistant: change.assistant === undefined ? current.assistant : change.assistant,
      tools: change.tools ?? current.tools,
      compactions: change.compactions ?? current.compactions,
      config: change.config ?? current.config,
      usage: change.usage ?? current.usage,
      inbox: change.inbox ?? current.inbox,
      notices: change.notices ?? current.notices,
    });
    this.revision = frame.revision;
    return "applied";
  }

  clear() {
    this.state = undefined;
    this.revision = undefined;
    this.needsResync = false;
    this.end = undefined;
  }
}
