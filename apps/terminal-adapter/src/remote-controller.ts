import { expandSkillInput } from './skill-input.mjs';
import { setTimeout as delay } from "node:timers/promises";
import { DpiClient } from "dpi-sdk";
import { DpiError } from "dpi-sdk/errors";
import { parseMessageReceipt, parseMessageReconciliation } from "dpi-sdk/observation-wire";
import { THINKING_LEVELS, type AgentSummary, type DeviceInfo, type Frame, type ModelInfo, type SkillInfo, type SessionSummary, type TaskNode, type ThinkingLevel } from "dpi-sdk/api";
import { TerminalProjection } from "./projection.js";
import { SubmissionJournal, type PendingSubmission } from "./submission-journal.js";
import { SubmitDeliveryError, type DurableController, type DurableView, type DurableViewSource, type Notice } from "./types.js";

/** Owns only client observation and delivery state. No session owner, Harness or native task queue. */
export class RemoteTerminal implements DurableController, DurableViewSource {
  private readonly stopped = new AbortController();
  private agentWatch = new AbortController();
  private projection = new TerminalProjection();
  private readonly listeners = new Set<() => void>();
  private readonly watching = new Set<Promise<void>>();
  private readonly notices: Notice[] = [];
  private agents: AgentSummary[] = [];
  private tasks: TaskNode[] = [];
  private conversationId = 1;
  private selectionEpoch = 0;
  private expanded = false;
  private agentOnline = false;
  private sessionOnline = false;
  private everConnected = false;
  private fatal = false;
  private reconciling?: Promise<Map<string, boolean>>;
  private models: ModelInfo[] = [];
  private skills: SkillInfo[] = [];

  private constructor(
    readonly client: DpiClient,
    private session: SessionSummary,
    private readonly device: DeviceInfo,
    private readonly journal: SubmissionJournal,
    private readonly cacheDirectory: string,
  ) { this.agents = session.agents; }

  static async open(client: DpiClient, sessionId: string, cacheDirectory: string, conversationId = 1): Promise<RemoteTerminal> {
    const [session, device, journal] = await Promise.all([client.session(sessionId).get(), client.device(), SubmissionJournal.open(cacheDirectory)]);
    const terminal = new RemoteTerminal(client, session, device, journal, cacheDirectory);
    const remote = client.session(sessionId);
    if (device.capabilities.includes('scoped-models.v1') && typeof remote.models !== 'function') throw new DpiError('unavailable', 'Installed SDK lacks scoped models; no global catalogue fallback was made');
    if (device.capabilities.includes('skills.v1') && (typeof remote.skills !== 'function' || typeof remote.skill !== 'function')) throw new DpiError('unavailable', 'Installed SDK lacks native skills; no local loader was started');
    [terminal.models, terminal.skills] = await Promise.all([
      device.capabilities.includes('scoped-models.v1') ? remote.models() : Promise.resolve(device.models),
      device.capabilities.includes('skills.v1') ? remote.skills() : Promise.resolve([]),
    ]);
    await terminal.selectConversation(conversationId);
    terminal.track(terminal.watchSession());
    return terminal;
  }

  current(): DurableView {
    const state = this.projection.snapshot;
    const live = { run: state.run, generation: state.generation, tools: state.tools, compactions: state.compactions };
    const lastAssistant = [...state.entries].reverse().find((entry) => entry.kind === "pi.assistant")?.model?.[0];
    const lastStop = lastAssistant && "stopReason" in lastAssistant && typeof lastAssistant.stopReason === "string" ? lastAssistant.stopReason : undefined;
    return {
      session: { id: this.session.id, directory: this.cacheDirectory, cwd: this.session.cwd, name: this.session.name },
      conversation: { conversation: { id: this.conversationId }, entries: this.projection.renderedEntries, docs: {
        ...this.projection.docs, "pi.agent": state.agent, "pi.live": live,
        "pi.inbox": { items: this.projection.inbox.map((item) => ({ ...item, entry: { kind: "write" } })) },
      } },
      conversations: this.agents.map((agent) => ({
        id: agent.id, label: agent.name, parentId: agent.parentId, ownerTaskId: agent.ownerTaskId,
        ...(agent.id === this.conversationId ? { live, lastStop } : agent.busy ? { live: { run: { inputs: [] } } } : {}),
      })),
      skills: this.skills,
      models: this.models.filter(model => model.available !== false).map((model) => ({ provider: model.provider, modelId: model.id, name: model.name, contextWindow: model.contextWindow })),
      notices: [...this.projection.model.state.notices.map((message, index) => ({ id: -(index + 1), level: "warning" as const, message })), ...this.notices],
      attention: this.projection.attention,
      agentMail: this.projection.agentMail,
      externalDirectories: this.projection.externalDirectories,
      tasks: { tasks: Object.fromEntries(this.tasks.map((task) => [task.id, { ...task, abortRequested: !!task.aborting, state: { ...task.state, on: task.state.on ?? [] } }])) },
      tasksExpanded: this.expanded,
      automation: this.projection.automation,
      delivery: { uncertainRequestIds: this.journal.uncertain.filter(item => item.kind === "message" && item.conversationId === this.conversationId).map(item => item.requestId) },
      connection: this.fatal || this.stopped.signal.aborted ? "offline" : this.agentOnline && this.sessionOnline ? "online" : this.everConnected ? "reconnecting" : "connecting",
    };
  }

  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  private emit() { if (!this.stopped.signal.aborted) for (const listener of this.listeners) listener(); }
  private notice(message: string, level: Notice["level"] = "warning", transient = false) {
    this.notices.push({ id: (this.notices.at(-1)?.id ?? 0) + 1, level, message, transient });
    if (this.notices.length > 10) this.notices.shift();
    this.emit();
  }
  private revokeObservation() {
    this.fatal = true;
    this.projection.apply({ type: "agent.end", sessionId: this.session.id, conversationId: this.conversationId, reason: "revoked" });
    this.agents = []; this.tasks = []; this.models = []; this.skills = [];
    this.session = { ...this.session, name: "Unavailable", cwd: "", agents: [] };
    this.notices.length = 0;
    this.notice("Host authorization is unavailable. Protected views cleared; native execution was not cancelled.", "error");
    this.stopped.abort();
  }
  private track(promise: Promise<void>) {
    this.watching.add(promise);
    void promise.finally(() => this.watching.delete(promise));
  }

  private async watchSession() {
    await this.observe(this.stopped.signal, () => this.client.session(this.session.id).events(this.stopped.signal), (frame) => {
      if (frame.type === "session" || frame.type === "agents") this.agents = frame.agents;
      if (frame.type === "session" || frame.type === "tasks") this.tasks = frame.tasks;
      if (frame.type === "session") this.sessionOnline = true;
      this.emit();
      if (frame.type === "session" || frame.type === "tasks") void this.reconcile();
    }, () => { this.sessionOnline = false; });
  }

  private async observe(signal: AbortSignal, stream: () => AsyncIterable<Frame>, apply: (frame: Frame) => void, disconnected: () => void) {
    while (!signal.aborted) {
      try {
        for await (const frame of stream()) {
          if (signal.aborted) return;
          if (frame.type === "fault") throw new DpiError(frame.error.code, "Host stream unavailable");
          apply(frame);
          if (frame.type === "agent.end") {
            if (frame.reason === "revoked") throw new DpiError("unauthorized", "Observation permission was revoked", 403);
            if (frame.reason === "closed") { disconnected(); this.emit(); return; }
          }
        }
      } catch (error) {
        if (signal.aborted) return;
        if (error instanceof DpiError && error.status === 426) {
          this.fatal = true;
          disconnected();
          this.notice("Host protocol is incompatible. Observation stopped; no request was replayed.", "error");
          return;
        }
        if (error instanceof DpiError && (error.status === 401 || error.status === 403)) {
          this.revokeObservation();
          return;
        }
      }
      if (signal.aborted) return;
      disconnected();
      this.emit();
      await delay(250, undefined, { signal }).catch(() => {});
    }
  }

  private async selectConversation(id: number): Promise<void> {
    const epoch = ++this.selectionEpoch;
    const [detail, entries] = await Promise.all([
      this.client.agent(this.session.id, id).get(),
      this.client.agent(this.session.id, id).entries({ scope: "all", limit: 100 }),
    ]);
    if (epoch !== this.selectionEpoch || this.stopped.signal.aborted) return;
    this.agentWatch.abort();
    this.agentWatch = new AbortController();
    const signal = AbortSignal.any([this.stopped.signal, this.agentWatch.signal]);
    const projection = new TerminalProjection({ sessionId: this.session.id, conversationId: detail.id });
    projection.addHistoryPage(entries);
    projection.model.state.agent = detail.config;
    this.projection = projection;
    this.conversationId = detail.id;
    this.agentOnline = false;
    this.emit();
    const wantedDocs = new Set(["pi.external-directories", "host.agent-mail", "bb.subagents", "bb.subagent-supervisor", "durable.schedules", "durable-goals.native-goals"]);
    // Optional discovery keeps older/minimal hosts usable without guessing registry names.
    const docs = "documentKinds" in detail && Array.isArray(detail.documentKinds)
      ? detail.documentKinds.filter((kind: unknown): kind is string => typeof kind === "string" && wantedDocs.has(kind)) : [];
    this.track(this.observe(signal, () => this.client.agent(this.session.id, id).events(signal, docs), (frame) => {
      if (this.projection !== projection) return;
      if (projection.apply(frame)) {
        if (frame.type === "agent.end" && frame.reason === "revoked") { this.revokeObservation(); return; }
        if (frame.type === "agent.state") {
          this.agentOnline = true;
          this.everConnected = true;
          void this.reconcile();
        }
        if (projection.needsResync || projection.end) this.agentOnline = false;
        this.emit();
      }
    }, () => { if (this.projection === projection) this.agentOnline = false; }));
  }

  async switchConversation(id: number): Promise<void> {
    await this.selectConversation(id).catch(() => this.notice("Conversation is unavailable or outside the grant. Selection was not changed.", "error"));
  }

  private reconcile(): Promise<Map<string, boolean>> {
    return this.reconciling ??= (async () => {
      const settled = new Map<string, boolean>();
      for (const item of this.journal.uncertain) {
        try {
          if (item.kind !== "message") { await this.goalReceipt(item, false); continue; }
          const path = `/v1/sessions/${encodeURIComponent(this.session.id)}/agents/${item.conversationId}/receipts/${encodeURIComponent(item.requestId)}`;
          let accepted = true;
          try { parseMessageReceipt(await this.client.request<unknown>("GET", path)); }
          catch (error) {
            if (!(error instanceof DpiError) || error.status !== 404) throw error;
            // A missing GET alone is not proof: fence a delayed admission before releasing the journal.
            const result = parseMessageReconciliation(await this.client.request<unknown>("POST", `${path}/reconcile`, {}), item.conversationId, item.requestId);
            accepted = result.accepted;
            if (!accepted) this.notice("Host did not accept the previous message. It was not replayed; you can send a new message.", "info", true);
          }
          if (this.journal.pending.has(item.requestId)) await this.journal.accepted(item.requestId);
          settled.set(item.requestId, accepted);
          this.emit();
        } catch {
          if (this.journal.pending.has(item.requestId)) this.notice("A previous request has uncertain delivery. Retry its unchanged text to use the saved key; nothing was replayed automatically.");
        }
      }
      return settled;
    })().finally(() => { this.reconciling = undefined; });
  }

  private async goalReceipt(item: PendingSubmission, submit: boolean) {
    const agent = this.client.agent(this.session.id, item.conversationId);
    const value: unknown = submit ? await agent.goalCommand(item.text, item.requestId) : await agent.goalReceipt(item.requestId);
    if (!value || typeof value !== "object" || !("conversationId" in value) || value.conversationId !== item.conversationId ||
        !("requestId" in value) || typeof value.requestId !== "string" || !value.requestId ||
        !("taskId" in value) || typeof value.taskId !== "number" || !Number.isSafeInteger(value.taskId) || value.taskId <= 0 ||
        !("status" in value) || typeof value.status !== "string" || !["queued", "started", "done", "failed", "uncertain"].includes(value.status)) throw Error("Unsupported native Goal receipt; no command was replayed.");
    const text = "text" in value ? value.text : undefined;
    if (text !== undefined && typeof text !== "string") throw Error("Unsupported native Goal result; no command was replayed.");
    if (!this.journal.pending.has(item.requestId)) return value.status;
    if (value.status === "done" || value.status === "failed") {
      await this.journal.accepted(item.requestId);
      if (value.status === "done") this.notice(text ?? "Native Goal command completed.", "info", true);
      else this.notice("Native Goal command was refused before its effect. Check current authority.", "error");
    } else {
      this.journal.markUncertain(item.requestId);
      if (value.status === "uncertain") this.notice("Native Goal effect is uncertain. Inspect saved Goal state; unchanged retries retain the same key and never replay the effect.", "error");
    }
    return value.status;
  }

  async submit(text: string, whenBusy: "steer" | "followUp"): Promise<void> {
    if (this.fatal || this.stopped.signal.aborted) throw Error("Terminal is detached or no longer authorized; no input was submitted");
    this.notices.splice(0, this.notices.length, ...this.notices.filter(item => !item.transient));
    this.emit();
    const input = text.trim();
    const newGoal = /^\/goal\s+new(?:\s+([\s\S]*))?$/.exec(input);
    if (newGoal && !newGoal[1]?.trimStart().startsWith("{")) {
      if (this.conversationId !== 1) await this.selectConversation(1);
      text = `Хочу запустить новую цель. ${newGoal[1]?.trim() ?? ""} Используй уже согласованные цель, критерии, скиллы, разрешения и лимиты. Если данных хватает — настрой и запусти через goal; иначе спроси только недостающее. JSON вручную от меня не требуй.`;
    } else if (/^\/goal(?:\s|$)/.test(input)) {
      if (!this.device.capabilities.includes("goal-operator.v1")) throw Error("The host has not exposed trusted Goal operator commands. No model input was submitted.");
      const operator = this.client.agent(this.session.id, 1);
      if (typeof operator.goalCommand !== "function" || typeof operator.goalReceipt !== "function") throw Error("Installed SDK lacks native Goal control. Update the SDK; no command or model input was submitted.");
      // Operator commands target the actual root, just like the selected TUI; they are never model input.
      const inspect = /^\/goal(?:\s+(?:status|list|help)(?:\s|$)|\s*$)/.test(input);
      const item = await this.journal.begin(1, input, "steer", inspect ? "goal-inspect" : "goal-command");
      try {
        const status = await this.goalReceipt(item, true);
        // Close the POST/SSE ordering race with one safe receipt read, not command polling/replay.
        if ((status === "queued" || status === "started") && this.journal.pending.has(item.requestId)) await this.goalReceipt(item, false);
      } catch (error) {
        if (!this.journal.pending.has(item.requestId)) return;
        this.journal.markUncertain(item.requestId);
        throw error;
      }
      return;
    }
    if (input === "/mcp off") { this.notice("MCP status hidden; this does not disconnect server tools.", "info"); return; }
    if (input === "/mcp" || input === "/mcp on") throw Error("Host MCP status projection is unavailable. No model input was submitted.");
    const inputEpoch = this.selectionEpoch;
    const target = this.conversationId;
    const retry = this.journal.uncertain.find(item => item.kind === 'message' && item.conversationId === target && item.text === text && item.whenBusy === whenBusy);
    // Preserve retry identity and selection across the reconnect wait, even if its journal is cleared.
    const settled = await this.reconciling;
    if (inputEpoch !== this.selectionEpoch) throw Error("Conversation changed while reconciling delivery; no input was submitted");
    if (retry && settled?.get(retry.requestId) === true) return;
    const pending = this.journal.uncertain.filter(item => item.kind === 'message' && item.conversationId === target);
    if (pending.length && !pending.some(item => item.text === text && item.whenBusy === whenBusy)) await this.reconcile();
    if (inputEpoch !== this.selectionEpoch) throw Error("Conversation changed while reconciling delivery; no input was submitted");
    let wireText: string | undefined;
    const skillCommand = /(?:^|\s)\/skill:([^\s]+)/.test(text);
    // An explicit retry uses the persisted body, even if the server skill changed since the lost ACK.
    const uncertain = this.journal.uncertain.some(item => item.kind === 'message' && item.conversationId === this.conversationId);
    if (skillCommand && !uncertain) {
      if (!this.device.capabilities.includes('skills.v1')) throw Error('Host skill body transport is unavailable; no model input was submitted');
      const selectedEpoch = this.selectionEpoch;
      wireText = await expandSkillInput(text, (name: string) => this.client.session(this.session.id).skill(name));
      if (this.selectionEpoch !== selectedEpoch) throw Error("Conversation changed while loading skills; no input was submitted");
    }
    const item = await this.journal.begin(this.conversationId, text, whenBusy, 'message', wireText);
    try {
      const result = await this.client.agent(this.session.id, item.conversationId).send(item.wireText ?? item.text, whenBusy, item.requestId);
      if (this.journal.pending.has(item.requestId)) await this.journal.accepted(item.requestId);
      if (result.status === "unanswered") this.notice(result.reason, "warning");
    } catch (error) {
      // A concurrent reconnect may already have reconciled this exact native receipt.
      if (!this.journal.pending.has(item.requestId)) return;
      this.journal.markUncertain(item.requestId);
      this.emit();
      // The POST can fail while both observation streams stay online.
      void this.reconcile();
      throw new SubmitDeliveryError(this.session.id, item.conversationId, item.requestId);
    }
  }
  async compact(instructions?: string) {
    await this.client.agent(this.session.id, this.conversationId).compact(instructions)
      .catch(() => this.notice("Host did not confirm compaction. Reconnect before retrying.", "error"));
  }
  async abort() {
    await this.client.agent(this.session.id, this.conversationId).abort()
      .catch((error: unknown) => {
        if (error instanceof DpiError && error.code === "conflict" && error.message.includes("Native Goal protects"))
          this.notice("Goal continues; use /goal stop to stop its execution.", "info");
        else this.notice("Host did not confirm interrupt. Check native state; no generic task abort was attempted.", "error");
      });
  }
  async reload(path?: string) {
    const remote = this.client.session(this.session.id);
    let result: Awaited<ReturnType<typeof remote.reload>>;
    try {
      if (path) throw new DpiError('invalid', "A remote terminal cannot admit an adapter path. Configure trusted profiles on the server.");
      if (!this.device.capabilities.includes('profile-reload.v1'))
        throw new DpiError('invalid', 'This Host does not expose Durable reload; no local runtime was opened.');
      result = await remote.reload();
    } catch (error) {
      const reason = error instanceof DpiError ? error.message : 'No receipt was received.';
      const status = error instanceof DpiError && /\bmaintenance-required\b/i.test(reason) ? 'maintenance-required' :
        error instanceof DpiError && (error.code === 'busy' || error.code === 'conflict') ? 'deferred (not queued)' :
        error instanceof DpiError && (error.code === 'invalid' || (error.code !== 'offline' && error.status !== 0)) ? 'rejected' : 'unconfirmed';
      this.notice(`Reload ${status}: ${reason} No automatic retry or model turn.`, 'warning');
      throw error;
    }
    const cleanupFailed = result.cleanup === 'failed';
    const applied = `Reload applied: ${result.models} models, ${result.extensions} extensions. Host was not restarted.` +
      (cleanupFailed ? ' Resource cleanup failed. No rollback was performed; no automatic retry.' : '');
    try {
      const [models, skills] = await Promise.all([
        this.device.capabilities.includes('scoped-models.v1') ? remote.models() : this.client.device().then(device => device.models),
        this.device.capabilities.includes('skills.v1') ? remote.skills() : Promise.resolve([]),
      ]);
      this.models = models;
      this.skills = skills;
      this.emit();
      this.notice(applied, cleanupFailed ? 'warning' : 'info', !cleanupFailed);
    } catch {
      this.notice(applied, cleanupFailed ? 'warning' : 'info', !cleanupFailed);
      // Publication is already confirmed. A failed read must not suggest repeating the mutation.
      this.notice('Reload applied, but terminal catalogue refresh failed. Previous menus retained; no automatic retry.', 'warning');
    }
  }
  async setModel(model: { provider: string; modelId: string }) {
    await this.client.agent(this.session.id, this.conversationId).configure({ model });
  }
  async cycleThinking() {
    const agent = this.projection.snapshot.agent;
    const model = this.models.find((model) => model.provider === agent.model?.provider && model.id === agent.model.modelId);
    if (!model) { this.notice("Current model metadata is unavailable; no thinking level was changed."); return; }
    if (model.available === false) { this.notice('Current model is unavailable; no thinking level was changed.'); return; }
    if (!model.reasoning) { this.notice("Current model does not support thinking."); return; }
    const levels = model.supportedThinkingLevels;
    if (!Array.isArray(levels) || !levels.length || !levels.every((level: unknown): level is ThinkingLevel => THINKING_LEVELS.some(known => known === level))) {
      this.notice("Supported thinking levels are unavailable or newer than this client; no level was inferred or dropped.");
      return;
    }
    const next = levels[(levels.findIndex(level => level === (agent.thinkingLevel ?? "off")) + 1) % levels.length];
    await this.client.agent(this.session.id, this.conversationId).configure({ thinkingLevel: next })
      .catch(() => this.notice("Thinking level was not confirmed. No fallback level was selected.", "error"));
  }
  async toggleTasks() { this.expanded = !this.expanded; this.emit(); }
  async listSessions() { return this.client.sessions(); }
  async renameSession(name: string): Promise<string> {
    this.session = await this.client.session(this.session.id).rename(name);
    this.emit();
    return this.session.name;
  }

  /** Detach only. Never abort a native task or close the server session on client exit. */
  async close(): Promise<void> {
    this.stopped.abort();
    this.agentWatch.abort();
    await Promise.allSettled([...this.watching]);
    this.listeners.clear();
  }
}
