import { setTimeout as delay } from "node:timers/promises";
import { DpiClient } from "dpi-sdk";
import { DpiError } from "dpi-sdk/errors";
import { THINKING_LEVELS, type AgentSummary, type DeviceInfo, type Frame, type ModelInfo, type SkillInfo, type SessionSummary, type TaskNode, type ThinkingLevel } from "dpi-sdk/api";
import { TerminalProjection } from "./projection.js";
import { SubmissionJournal, type PendingSubmission } from "./submission-journal.js";
import type { DurableController, DurableView, DurableViewSource, Notice } from "./types.js";

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
  private reconciling = false;
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
      notices: this.notices,
      attention: this.projection.attention,
      tasks: { tasks: Object.fromEntries(this.tasks.map((task) => [task.id, { ...task, abortRequested: !!task.aborting, state: { ...task.state, on: task.state.on ?? [] } }])) },
      tasksExpanded: this.expanded,
      automation: this.projection.automation,
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
        }
      } catch (error) {
        if (signal.aborted) return;
        if (error instanceof DpiError && (error.status === 401 || error.status === 403)) {
          this.fatal = true;
          this.notice("Host authorization is unavailable. Observation stopped; native execution was not cancelled.", "error");
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
      this.client.agent(this.session.id, id).entries({ scope: "active" }),
    ]);
    if (epoch !== this.selectionEpoch || this.stopped.signal.aborted) return;
    this.agentWatch.abort();
    this.agentWatch = new AbortController();
    const signal = AbortSignal.any([this.stopped.signal, this.agentWatch.signal]);
    const projection = new TerminalProjection();
    projection.apply({ type: "snapshot", snapshot: { ...projection.snapshot, entries: entries.items, agent: detail.config }, inbox: [] });
    this.projection = projection;
    this.conversationId = detail.id;
    this.agentOnline = false;
    this.emit();
    const wantedDocs = new Set(["bb.subagents", "bb.subagent-supervisor", "durable.schedules", "durable-goals.native-goals"]);
    // Optional discovery keeps older/minimal hosts usable without guessing registry names.
    const docs = "documentKinds" in detail && Array.isArray(detail.documentKinds)
      ? detail.documentKinds.filter((kind: unknown): kind is string => typeof kind === "string" && wantedDocs.has(kind)) : [];
    this.track(this.observe(signal, () => this.client.agent(this.session.id, id).events(signal, docs), (frame) => {
      if (this.projection !== projection) return;
      if (projection.apply(frame)) {
        if (frame.type === "snapshot") {
          this.agentOnline = true;
          this.everConnected = true;
          void this.reconcile();
        }
        this.emit();
      }
    }, () => { if (this.projection === projection) this.agentOnline = false; }));
  }

  async switchConversation(id: number): Promise<void> {
    await this.selectConversation(id).catch(() => this.notice("Conversation is unavailable or outside the grant. Selection was not changed.", "error"));
  }

  private async reconcile() {
    if (this.reconciling) return;
    this.reconciling = true;
    try {
      for (const item of this.journal.uncertain) {
        try {
          if (item.kind !== "message") { await this.goalReceipt(item, false); continue; }
          await this.client.request("GET", `/v1/sessions/${encodeURIComponent(this.session.id)}/agents/${item.conversationId}/receipts/${encodeURIComponent(item.requestId)}`);
          if (this.journal.pending.has(item.requestId)) await this.journal.accepted(item.requestId);
        } catch {
          if (this.journal.pending.has(item.requestId)) this.notice("A previous request has uncertain delivery. Retry its unchanged text to use the saved key; nothing was replayed automatically.");
        }
      }
    } finally { this.reconciling = false; }
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
    let wireText: string | undefined;
    const skillCommand = /^\/skill:([^\s]+)(?:\s+([\s\S]*))?$/.exec(text);
    // An explicit retry uses the persisted body, even if the server skill changed since the lost ACK.
    const uncertain = this.journal.uncertain.some(item => item.kind === 'message' && item.conversationId === this.conversationId);
    if (skillCommand && !uncertain) {
      if (!this.device.capabilities.includes('skills.v1')) throw Error('Host skill body transport is unavailable; no model input was submitted');
      const skill: unknown = await this.client.session(this.session.id).skill(skillCommand[1]);
      if (!skill || typeof skill !== 'object' || !('name' in skill) || skill.name !== skillCommand[1] ||
          !('content' in skill) || typeof skill.content !== 'string' || !('filePath' in skill) || typeof skill.filePath !== 'string' ||
          !('baseDir' in skill) || typeof skill.baseDir !== 'string') throw Error('Invalid host skill body; no model input was submitted');
      const block = `<skill name="${skill.name}" location="${skill.filePath}">\nReferences are relative to ${skill.baseDir}.\n\n${skill.content.trim()}\n</skill>`;
      wireText = skillCommand[2]?.trim() ? `${block}\n\n${skillCommand[2].trim()}` : block;
    }
    const item = await this.journal.begin(this.conversationId, text, whenBusy, 'message', wireText);
    try {
      await this.client.agent(this.session.id, this.conversationId).send(item.wireText ?? item.text, whenBusy, item.requestId);
      if (this.journal.pending.has(item.requestId)) await this.journal.accepted(item.requestId);
    } catch (error) {
      // A concurrent reconnect may already have reconciled this exact native receipt.
      if (!this.journal.pending.has(item.requestId)) return;
      this.journal.markUncertain(item.requestId);
      throw error;
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
    if (path) throw Error("A remote terminal cannot admit an adapter path. Configure trusted profiles on the server.");
    throw Error("This host has not advertised remote profile reload; no local runtime was opened.");
  }
  async setModel(model: { provider: string; modelId: string }) {
    await this.client.agent(this.session.id, this.conversationId).configure({ model })
      .catch(() => this.notice("Model selection was not confirmed. No fallback model was selected.", "error"));
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
