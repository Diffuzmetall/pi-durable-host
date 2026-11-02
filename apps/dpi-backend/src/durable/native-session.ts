import { randomUUID } from "node:crypto";
import { clampThinkingLevel } from "@earendil-works/pi-ai/models";
import { BACKGROUND_CONTEXT as ctx, createContextKey, withContextValue, withAbortSignal } from "@earendil-works/chord/context";
import {
  COMMIT_AUTHORIZATION_REVISION, ConversationBusy, ConversationIdle, Harness, defineDocFamily,
  type Conversation, type ConversationId, type ConversationView, type EntryId,
  type HarnessOptions, type Observation, type Storage, type SubmissionId,
} from "@earendil-works/pi-durable";
import {
  AGENT_HISTORY_LIMIT, AGENT_STATE_CAPABILITY, API_VERSION, THINKING_LEVELS,
  type AgentConfig, type AgentObservationFrame, type AgentPublicState, type AgentSummary, type MessageReceiptResult,
  type SendMessageBody, type SendResult, type TaskNode,
} from "../../../dpi-sdk/src/api.js";
import type { DurableSession, HistoryQuery, ObservationQuery, SessionAccess, SessionAction, SessionObservation } from "./session.js";
import { entry, project } from "./projection.js";
import { fingerprint, nativeRequestKey } from "../idempotency.js";
import { ApiFault } from "../fault.js";
import type { NativeInputBinding } from "./input-binding.js";
import { WRITE_TOOLS } from "./tool-policy.js";
import { closeNativeResources, type NativeSessionLifecycle } from "./lifecycle.js";

/** Trusted native composition inputs. Host supplies approved directory/model services, not native objects. */
export interface NativeSessionConfiguration {
  readonly readOnlyTools?: readonly string[];
  readonly lifecycle?: NativeSessionLifecycle;
  resolveDirectory?(path: string): Promise<string>;
  requireModel?(model: NonNullable<AgentConfig["model"]>): Promise<void>;
}

const commitAuthorization = createContextKey<() => void>("host.mutation-authorization");


/** The historical document identity and native request key remain unchanged across the upgrade. */
const MessageReceipts = defineDocFamily<{ fingerprint: string; retired?: boolean }, null>({
  kind: "host.message-receipts", version: 1, scope: "conversation", family: true,
  history: "latest", fork: "initial", checkpointWhen: () => true,
  initial: () => ({ fingerprint: "" }),
});

export class SessionFault extends ApiFault {}

function encodeCursor(sessionId: string, conversationId: number, before: number): string {
  return Buffer.from(JSON.stringify({ sessionId, conversationId, before })).toString("base64url");
}

function decodeCursor(cursor: string, sessionId: string, conversationId: number): number {
  let value: unknown;
  try { value = JSON.parse(Buffer.from(cursor, "base64url").toString()); }
  catch { throw new SessionFault("invalid", "Invalid history cursor"); }
  if (!value || typeof value !== "object" || !("sessionId" in value) || value.sessionId !== sessionId ||
      !("conversationId" in value) || value.conversationId !== conversationId ||
      !("before" in value) || typeof value.before !== "number" || !Number.isSafeInteger(value.before) || value.before < 1)
    throw new SessionFault("invalid", "History cursor does not belong to this conversation");
  return value.before;
}

/** Internal composition entry. HTTP/Store consumers use the semantic factory, never these native inputs. */
export async function openNativeSession(sessionId: string, storage: Storage, native: HarnessOptions,
  initial?: Parameters<Harness["root"]>[1], inputBinding?: NativeInputBinding, configuration: NativeSessionConfiguration = {}) {
  if (COMMIT_AUTHORIZATION_REVISION !== "host-commit-authorization-v1")
    throw new SessionFault("unavailable", "Native commit authorization is unavailable");
  // Harness.open can close storage itself before rejecting without returning its handle.
  // Transfer sole ownership with one physical close, including that early-failure path.
  const closeStorage = storage.close.bind(storage);
  let storageClosing: Promise<void> | undefined;
  storage.close = context => storageClosing ??= closeStorage(context);
  const settings = native.settings;
  let harness: Harness | undefined;
  let session: NativeSession | undefined;
  try {
    harness = await Harness.open(storage, {
      ...native,
      beforeCommit(context) {
        native.beforeCommit?.(context);
        context.value(commitAuthorization)?.();
      },
      settings: () => ({ ...(typeof settings === "function" ? settings() : settings), progress: {
        ...(typeof settings === "function" ? settings()?.progress : settings?.progress), persistWithinMs: 0,
      } }),
    }, ctx);
    const root = await harness.root(ctx, initial);
    session = new NativeSession(sessionId, harness, storage, root.id, native.models, inputBinding, configuration);
    await configuration.lifecycle?.bind?.(harness, storage);
    harness.resume();
    return session;
  } catch (error) {
    try {
      if (session) await session.close();
      else await closeNativeResources(harness, storage, configuration.lifecycle);
    } catch (cleanup) { throw new AggregateError([error, cleanup], "Runtime open and cleanup failed"); }
    throw error;
  }
}

/** One Harness, one owner. This object never exports native objects to its caller. */
class NativeSession implements Pick<DurableSession, "agents" | "liveTasks" | "send" | "receipt" | "reconcile" | "submission" | "history" | "context" | "observe" | "configure" | "interrupt" | "close"> {
  #closed = false;
  #closing?: Promise<void>;
  #observations = new Set<() => Promise<void>>();
  readonly #harness: Harness;
  readonly #storage: Storage;
  readonly #inputBinding?: NativeInputBinding;
  readonly #models: HarnessOptions["models"];
  readonly #configuration: NativeSessionConfiguration;
  constructor(readonly sessionId: string, harness: Harness, storage: Storage, readonly rootConversationId: number,
    models: HarnessOptions["models"], inputBinding: NativeInputBinding | undefined, configuration: NativeSessionConfiguration) {
    this.#harness = harness;
    this.#storage = storage;
    this.#models = models;
    this.#inputBinding = inputBinding;
    this.#configuration = configuration;
  }

  private guard(access: SessionAccess, action: SessionAction, conversationId?: number): void {
    if (this.#closed) throw new SessionFault("unavailable", "Session is closed");
    if (access.client.apiVersion !== API_VERSION) throw new SessionFault("conflict", "Unsupported API version");
    access.signal?.throwIfAborted();
    access.assertCurrent(action, { sessionId: this.sessionId, ...(conversationId === undefined ? {} : { conversationId }) });
  }

  #mutationContext(access: SessionAccess, action: SessionAction, conversationId?: number) {
    const context = access.signal ? withAbortSignal(access.signal, ctx) : ctx;
    return withContextValue(commitAuthorization, () => this.guard(access, action, conversationId), context);
  }

  async #conversation(access: SessionAccess, action: SessionAction, id: number): Promise<Conversation> {
    this.guard(access, action, id);
    if (!Number.isSafeInteger(id) || id < 1) throw new SessionFault("invalid", "Invalid conversation ID");
    const conversation = await this.#harness.conversation(id as ConversationId, ctx);
    this.guard(access, action, id);
    if (!conversation) throw new SessionFault("not_found", "Conversation not found");
    return conversation;
  }

  async liveTasks(access: SessionAccess): Promise<TaskNode[]> {
    this.guard(access, "tasks");
    const observation = await this.#harness.observeTaskGraph({ advance() {}, end() {} }, ctx);
    try {
      this.guard(access, "tasks");
      return Object.values(observation.value.tasks).map(task => {
        this.guard(access, "tasks", task.conversationId);
        return {
          id: task.id, kind: task.kind, conversationId: task.conversationId,
          ...(task.owner !== undefined ? { owner: task.owner } : {}),
          background: task.background, ...(task.abortRequested ? { aborting: true } : {}),
          state: {
            status: task.state.status,
            ...("phase" in task.state ? { phase: task.state.phase } : {}),
            ...("on" in task.state ? { on: [...task.state.on], policy: task.state.policy } : {}),
          },
          conversations: [...task.conversations],
        };
      });
    } finally { observation.detach(); }
  }

  async agents(access: SessionAccess): Promise<AgentSummary[]> {
    this.guard(access, "agents");
    const records = await this.#harness.commit(async tx => {
      let page = await tx.scanConversations({}, 1000);
      const records = [...page.items];
      while (page.next) {
        page = await tx.scanConversations({}, 1000, page.next);
        records.push(...page.items);
      }
      return records;
    }, ctx);
    this.guard(access, "agents");
    const tasks = await this.liveTasks(access);
    this.guard(access, "agents");
    return records.map(record => {
      this.guard(access, "agents", record.id);
      const kind = record.parent ? "fork" : record.owner ? "subagent" : "root";
      const own = tasks.filter(task => task.conversationId === record.id);
      return {
        id: record.id, kind, named: false,
        name: record.id === this.rootConversationId ? "Main" : `${kind === "fork" ? "Fork" : kind === "subagent" ? "Subagent" : "Root"} #${record.id}`,
        ...(record.parent ? { parentId: record.parent.conversationId, forkedAt: record.parent.at } : {}),
        ...(record.owner ? { ownerAgentId: record.owner.conversationId, ownerTaskId: record.owner.taskId } : {}),
        busy: own.some(task => !task.background), background: own.filter(task => task.background).length,
      };
    });
  }

  async send(access: SessionAccess, id: number, body: SendMessageBody): Promise<SendResult> {
    const conversation = await this.#conversation(access, "send", id);
    if (typeof body.requestId !== "string" || !body.requestId || body.requestId.length > 128 ||
        typeof body.content !== "string" || !body.content.trim() || body.content.length > 100000 ||
        body.whenBusy !== undefined && !["followUp", "steer", "reject"].includes(body.whenBusy))
      throw new SessionFault("invalid", "Invalid message");
    if (access.authority === "delegated" && (!this.#inputBinding?.prepareInput || !access.policyReference))
      throw new SessionFault("unavailable", "Selected profile has no native delegated input policy");
    const key = nativeRequestKey(access.actor, "message", body.requestId);
    const hash = fingerprint({ content: body.content, whenBusy: body.whenBusy ?? "followUp", source: access.source, authority: access.authority });
    let submissionId: number;
    try {
      submissionId = await conversation.commit(async tx => {
        const receipt = await tx.doc(MessageReceipts, id as ConversationId, key, null);
        const prior = await tx.submissionByRequest(id as ConversationId, key);
        this.guard(access, "send", id);
        if (receipt.retired || receipt.fingerprint && receipt.fingerprint !== hash)
          throw new SessionFault("conflict", "Request key is retired or has different content");
        if (prior) return prior.id;
        // 1.5 admission awaits reads and ID allocation. All writes remain provisional until this callback succeeds.
        const result = await conversation.submit(tx, {
          type: "input", content: body.content, requestId: key,
          whenBusy: body.whenBusy ?? "followUp",
          entry: { kind: "host.input", data: { actor: access.actor, source: access.source, authority: access.authority, requestId: body.requestId } },
        });
        this.guard(access, "send", id);
        // Native 1.5 submit must finish its table reads before a policy binding writes documents.
        // The binding belongs to this same commit; a retry of an accepted key never repeats it.
        await this.#inputBinding?.prepareInput?.(tx, id as ConversationId, key, {
          actor: access.actor, source: access.source, authority: access.authority,
          policyReference: access.policyReference, signal: access.signal,
          assertCurrent: () => this.guard(access, "send", id),
        });
        // A revoke during preparation rolls back policy, receipt, submission, entry and task together.
        this.guard(access, "send", id);
        receipt.fingerprint = hash;
        return result;
      }, this.#mutationContext(access, "send", id));
    } catch (error) {
      if (error instanceof ConversationBusy || error instanceof ConversationIdle) throw new SessionFault("busy", "The conversation cannot accept this input now");
      throw error;
    }
    this.guard(access, "send", id);
    return this.submission(access, submissionId, body.waitMs ?? 0);
  }

  async receipt(access: SessionAccess, id: number, requestId: string): Promise<MessageReceiptResult> {
    await this.#conversation(access, "receipt", id);
    const key = nativeRequestKey(access.actor, "message", requestId);
    const record = await this.#harness.commit(tx => tx.submissionByRequest(id as ConversationId, key), ctx);
    this.guard(access, "receipt", id);
    if (!record) throw new SessionFault("not_found", "Receipt not found; acceptance remains unknown");
    return this.submission(access, record.id, 0);
  }

  async reconcile(access: SessionAccess, id: number, requestId: string) {
    const conversation = await this.#conversation(access, "reconcile", id);
    const key = nativeRequestKey(access.actor, "message", requestId);
    const found = await conversation.commit(async tx => {
      const receipt = await tx.doc(MessageReceipts, id as ConversationId, key, null);
      const record = await tx.submissionByRequest(id as ConversationId, key);
      this.guard(access, "reconcile", id);
      if (!record) receipt.retired = true;
      return record?.id;
    }, this.#mutationContext(access, "reconcile", id));
    this.guard(access, "reconcile", id);
    return found === undefined ? { conversationId: id, requestId, accepted: false as const } : {
      conversationId: id, requestId, accepted: true as const, ...await this.submission(access, found, 0),
    };
  }

  async submission(access: SessionAccess, id: number, waitMs: number): Promise<SendResult> {
    this.guard(access, "submission");
    const submission = await this.#harness.submission(id as SubmissionId, ctx);
    if (!submission) throw new SessionFault("not_found", "Submission not found");
    let record = await submission.status(ctx);
    this.guard(access, "submission", record.conversationId);
    if (waitMs > 0 && record.status !== "done" && record.status !== "unanswered") {
      const timeout = AbortSignal.timeout(Math.min(waitMs, 300_000));
      const stop = access.signal ? AbortSignal.any([timeout, access.signal]) : timeout;
      try { record = await submission.wait(withAbortSignal(stop, ctx)); }
      catch (error) { if (!stop.aborted) throw error; }
      this.guard(access, "submission", record.conversationId);
    }
    if (record.status === "done" && record.answer !== undefined) {
      const answer = await this.#harness.commit(tx => tx.entry(record.answer as EntryId), ctx);
      this.guard(access, "submission", record.conversationId);
      const projected = answer ? entry(answer) : undefined;
      const text = projected?.model?.flatMap(message => "content" in message && Array.isArray(message.content)
        ? message.content.filter(block => block.type === "text").map(block => block.text) : []).join("") ?? "";
      return { submissionId: id, status: "done", answer: { entryId: record.answer, text } };
    }
    if (record.status === "unanswered") return { submissionId: id, status: "unanswered", reason:
      ["model_error", "no_model", "aborted", "reset", "faulted", "orphaned", "interrupted", "restart_limit",
        "nothing_to_answer", "turn_limit", "withdrawn", "stale"].includes(record.reason) ? record.reason : "unavailable" };
    if (record.status === "done") return { submissionId: id, status: "unanswered", reason: "nothing_to_answer" };
    return { submissionId: id, status: record.status === "queued" ? "queued" : "pending" };
  }

  async configure(access: SessionAccess, id: number, patch: Partial<AgentConfig>): Promise<AgentConfig> {
    const conversation = await this.#conversation(access, "configure", id);
    if (!patch || typeof patch !== "object" || Array.isArray(patch) ||
        Object.keys(patch).some(key => !["model", "thinkingLevel", "instructions", "cwd", "readOnly"].includes(key)) ||
        patch.thinkingLevel !== undefined && !THINKING_LEVELS.includes(patch.thinkingLevel) ||
        patch.instructions !== undefined && typeof patch.instructions !== "string" ||
        patch.cwd !== undefined && typeof patch.cwd !== "string" ||
        patch.readOnly !== undefined && typeof patch.readOnly !== "boolean")
      throw new SessionFault("invalid", "Invalid agent configuration");
    if (patch.model !== undefined && (!patch.model || typeof patch.model !== "object" ||
        typeof patch.model.provider !== "string" || typeof patch.model.modelId !== "string"))
      throw new SessionFault("invalid", "Invalid model reference");
    const modelChange = patch.model ? { provider: patch.model.provider, modelId: patch.model.modelId } : undefined;
    if (modelChange) {
      try { await this.#configuration.requireModel?.(modelChange); }
      catch { this.guard(access, "configure", id); throw new SessionFault("unavailable", "Selected model is unavailable"); }
      this.guard(access, "configure", id);
    }
    let cwd: string | undefined;
    if (patch.cwd !== undefined) {
      if (!this.#configuration.resolveDirectory) throw new SessionFault("unavailable", "Working directory approval is unavailable");
      try { cwd = await this.#configuration.resolveDirectory(patch.cwd); }
      catch { this.guard(access, "configure", id); throw new SessionFault("invalid", "Working directory is unavailable"); }
      this.guard(access, "configure", id);
    }
    const agent = await conversation.agent(ctx);
    this.guard(access, "configure", id);
    const models = typeof this.#models === "function" ? this.#models() : this.#models;
    const model = modelChange ?? agent.model;
    const nativeModel = model && models.getModel(model.provider, model.modelId);
    if ((modelChange || patch.thinkingLevel !== undefined) && !nativeModel)
      throw new SessionFault("unavailable", "Selected model is not registered");
    const thinking = nativeModel && (modelChange || patch.thinkingLevel !== undefined)
      ? clampThinkingLevel(nativeModel, patch.thinkingLevel ?? agent.thinkingLevel) : undefined;
    const all = [...new Map(agent.extensions.flatMap(extension => extension.tools ?? []).map(tool => [tool.name, tool])).values()];
    const writes = (name: string) => this.#configuration.readOnlyTools ? !this.#configuration.readOnlyTools.includes(name) : WRITE_TOOLS.has(name);
    await conversation.configure({
      ...(modelChange ? { model: modelChange } : {}),
      ...(thinking !== undefined ? { thinkingLevel: thinking } : {}),
      ...(patch.instructions !== undefined ? { instructions: patch.instructions.slice(0, 12000) } : {}),
      ...(cwd !== undefined ? { cwd } : {}),
      ...(patch.readOnly === true ? { tools: { remove: all.filter(tool => writes(tool.name)) } } : patch.readOnly === false ? { tools: null } : {}),
    }, this.#mutationContext(access, "configure", id));
    const updated = await conversation.agent(ctx);
    this.guard(access, "configure", id);
    const offered = new Set(updated.tools.map(tool => tool.name));
    const writers = all.filter(tool => writes(tool.name));
    return {
      ...(updated.model ? { model: updated.model } : {}), thinkingLevel: updated.thinkingLevel,
      ...(updated.instructions !== undefined ? { instructions: updated.instructions } : {}),
      ...(updated.cwd !== undefined ? { cwd: updated.cwd } : {}),
      readOnly: writers.length > 0 && writers.every(tool => !offered.has(tool.name)),
    };
  }

  async interrupt(access: SessionAccess, id: number, background: boolean) {
    const conversation = await this.#conversation(access, "interrupt", id);
    this.guard(access, "interrupt", id);
    await conversation.abort(this.#mutationContext(access, "interrupt", id), { background });
    this.guard(access, "interrupt", id);
    return { ok: true as const };
  }

  async history(access: SessionAccess, id: number, query: HistoryQuery) {
    const conversation = await this.#conversation(access, "history", id);
    const before = query.cursor ? decodeCursor(query.cursor, this.sessionId, id) : undefined;
    const page = await conversation.entries({ ...(before ? { maxEntryId: (before - 1) as EntryId } : {}) },
      Math.min(Math.max(query.limit ?? AGENT_HISTORY_LIMIT, 1), 2000), undefined, ctx);
    this.guard(access, "history", id);
    const items = [...page.items].reverse().map(entry);
    return { items, ...(page.next && items.length ? { next: encodeCursor(this.sessionId, id, items[0]!.id) } : {}) };
  }

  async context(access: SessionAccess, id: number) {
    const conversation = await this.#conversation(access, "context", id);
    const view = await conversation.context(ctx);
    this.guard(access, "context", id);
    return { entryIds: view.entries.map(value => value.id as number) };
  }

  async observe(access: SessionAccess, id: number, query: ObservationQuery): Promise<SessionObservation> {
    const conversation = await this.#conversation(access, "observe", id);
    if (!access.client.capabilities.includes(AGENT_STATE_CAPABILITY)) throw new SessionFault("conflict", "Agent state capability required");
    // Built-in documents are projected above, not an arbitrary document endpoint. Profile readers attach at their owning seam.
    if (query.documents?.length) throw new SessionFault("invalid", "Document kind is not public");
    let native: Observation<ConversationView> | undefined;
    let ended = false;
    let wake: (() => void) | undefined;
    const frames: AgentObservationFrame[] = [];
    let bufferedBytes = 0;
    let pending: ConversationView | undefined;
    let projecting = false;
    let initial = true;
    let previous: AgentPublicState | undefined;
    const epoch = randomUUID();
    let revision = 0;
    const scope = { sessionId: this.sessionId, conversationId: id };
    const finish = (reason?: "closed" | "resync" | "revoked" | "unavailable") => {
      if (ended) return;
      ended = true;
      pending = undefined;
      frames.length = 0;
      bufferedBytes = 0;
      if (reason) frames.push({ ...scope, type: "agent.end", reason });
      native?.detach();
      access.signal?.removeEventListener("abort", revoked);
      this.#observations.delete(close);
      wake?.();
    };
    const close = async () => finish();
    const revoked = () => finish("revoked");
    const emit = (frame: AgentObservationFrame) => {
      if (ended) return;
      this.guard(access, "observe", id);
      // Backpressure is a resync, never a silent dropped revision. No native observer waits for an HTTP consumer.
      const bytes = Buffer.byteLength(JSON.stringify(frame));
      if (frames.length >= 32 || bufferedBytes + bytes > 2_000_000) return finish("resync");
      bufferedBytes += bytes;
      frames.push(frame);
      wake?.();
    };
    const drain = async () => {
      if (projecting || initial || ended) return;
      projecting = true;
      try {
        while (pending && !ended) {
          const value = pending;
          pending = undefined;
          this.guard(access, "observe", id);
          const tail = value.entries.at(-1)?.id;
          // Native context at an immutable entry pins the context to this exact view, even if newer commits arrive.
          const context = tail === undefined ? undefined : await conversation.context(ctx, { at: tail });
          const runInputs = (value.docs["pi.live"]?.run as { inputs?: number[] } | undefined)?.inputs ?? [];
          const records = await Promise.all(runInputs.map(async input => {
            const submission = await this.#harness.submission(input as SubmissionId, ctx);
            return submission?.status(ctx);
          }));
          const inputEntryIds = records.flatMap(record => record?.entry === undefined ? [] : [record.entry as number]);
          this.guard(access, "observe", id);
          if (ended) break;
          const state = project(value, context?.entries.map(value => value.id as number) ?? [], inputEntryIds,
            value.before !== undefined && value.entries.length ? encodeCursor(this.sessionId, id, value.entries[0]!.id) : undefined);
          const baseRevision = `${epoch}:${revision}`;
          const next = `${epoch}:${++revision}`;
          if (!previous) emit({ ...scope, type: "agent.state", revision: next, state });
          else {
            const changes: Partial<AgentPublicState> = {};
            // Named replacement sections are our protocol, not a copy of native deltas.
            for (const key of Object.keys(state) as (keyof AgentPublicState)[]) {
              if (JSON.stringify(state[key]) !== JSON.stringify(previous[key])) Object.assign(changes, { [key]: state[key] });
            }
            emit({ ...scope, type: "agent.update", baseRevision, revision: next, changes });
          }
          previous = state;
        }
      } catch {
        let reason: "revoked" | "unavailable" = "unavailable";
        try { this.guard(access, "observe", id); } catch { reason = "revoked"; }
        finish(reason);
      } finally { projecting = false; }
    };
    native = await this.#harness.observeConversation(id as ConversationId, {
      advance: call => {
        if (call.kind === "failed") return finish("unavailable");
        pending = call.value;
        // The native callback records only. Projection begins outside the Session line.
        queueMicrotask(() => { void drain(); });
      },
      end: () => finish("unavailable"),
    }, ctx, { min: AGENT_HISTORY_LIMIT, max: AGENT_HISTORY_LIMIT });
    if (ended) native.detach();
    else {
      pending ??= native.value;
      initial = false;
      this.#observations.add(close);
      access.signal?.addEventListener("abort", revoked, { once: true });
      if (access.signal?.aborted) revoked();
      else void drain();
    }
    const iterator = async function* () {
      try {
        while (!ended || frames.length) {
          if (!frames.length) await new Promise<void>(resolve => { wake = resolve; });
          wake = undefined;
          const frame = frames.shift();
          if (frame) {
            bufferedBytes = Math.max(0, bufferedBytes - Buffer.byteLength(JSON.stringify(frame)));
            yield frame;
          }
        }
      } finally { await close(); }
    };
    return { frames: iterator(), close };
  }

  close(): Promise<void> {
    return this.#closing ??= (async () => {
      this.#closed = true;
      await Promise.all([...this.#observations].map(close => close()));
      await closeNativeResources(this.#harness, this.#storage, this.#configuration.lifecycle);
    })();
  }
}
