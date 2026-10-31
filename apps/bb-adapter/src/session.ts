import { createHash } from 'node:crypto';
import { follow, type AgentHandle, type DpiClient, type ConnectionState } from 'dpi-sdk/client';
import type { NativeBbBinding, NativeParentCommand, NativeParentReceipt, NativeParentTarget, ThinkingLevel, Frame } from 'dpi-sdk/api';
import type { HistoryRequester } from './history-sink.js';
import { projectNativeChildInBb, nativeChildKey, nativeChildRegistrationRequestId, type RegisterExistingPort } from './native-child-binding.js';
import { BbChildSession } from './child-session.js';
import { RootDeltas } from './root-deltas.js';
import { bbInputRequestId } from './request-key.js';
import { childLocators } from './child-locators.js';

export interface ProviderOwnerScope {
  providerId: string; threadId: string; providerThreadId: string; parentThreadId: string | null;
}
// Same strict four-field Core receipt as the selected B/bootstrap/provider-grant.ts.
export function ownerScopeFrom(value: unknown): Readonly<ProviderOwnerScope> {
  const text = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('BB_OWNER_SCOPE_UNCONFIRMED');
  const v = value as Record<string, unknown>;
  if (Object.keys(v).length !== 4 || !text(v.providerId) || !text(v.threadId) || !text(v.providerThreadId) || (v.parentThreadId !== null && !text(v.parentThreadId)))
    throw Error('BB_OWNER_SCOPE_UNCONFIRMED');
  return Object.freeze({ providerId: v.providerId, threadId: v.threadId, providerThreadId: v.providerThreadId, parentThreadId: v.parentThreadId });
}
export interface BbCore extends Partial<RegisterExistingPort> {
  getOwnerScope(providerThreadId: string): Promise<unknown>;
  reconcileExisting: HistoryRequester;
  notify(method: 'thread/delta' | 'thread/identity', params: Record<string, unknown>): void;
}
export interface BbRootOptions {
  client: DpiClient;
  core: BbCore;
  providerId: string;
  sessionId: string;
  conversationId: number;
  threadId: string;
  cwd: string;
  providerOptions?: Record<string, unknown>;
}
/** Attach only: no session creation, replacement runtime, token provisioning or generic abort. */
export class BbThreadSession {
  readonly native: AgentHandle;
  readonly providerThreadId: string;
  readonly options: Readonly<BbRootOptions>;
  private readonly deltas: RootDeltas;
  private closed = false;
  private readonly lifetime = new AbortController();
  private readonly registrations = new Map<string, Promise<{ threadId: string }>>();
  private readonly children = new Map<string, Promise<BbChildSession>>();
  private readonly childObservers = new Map<string, Promise<void>>();
  private readonly discovered = new Set<number>();
  private observing = false;
  private constructor(options: BbRootOptions) {
    this.options = Object.freeze({ ...options });
    this.native = options.client.agent(options.sessionId, options.conversationId);
    this.providerThreadId = options.sessionId;
    this.deltas = new RootDeltas(options.cwd, options.providerOptions);
  }
  /** Explicit authorized first binding; never run as a fallback after failed attachment. */
  static async bindRoot(options: BbRootOptions): Promise<BbThreadSession> {
    const session = new BbThreadSession(options);
    await session.checkRoot(false);
    await session.native.bindBbThread(options.threadId, { kind: 'root' });
    await session.checkRoot();
    return session;
  }
  static async open(options: BbRootOptions): Promise<BbThreadSession> {
    const session = new BbThreadSession(options);
    await session.checkRoot();
    return session;
  }
  private async coreScope(threadId: string, providerThreadId: string, parentThreadId: string | null) {
    if (this.closed) throw Error('BB_SESSION_DETACHED');
    const proof = ownerScopeFrom(await this.options.core.getOwnerScope(providerThreadId));
    if (proof.providerId !== this.options.providerId || proof.threadId !== threadId || proof.providerThreadId !== providerThreadId || proof.parentThreadId !== parentThreadId)
      throw Error('BB_OWNER_SCOPE_MISMATCH');
    return proof;
  }
  private async checkRoot(requireBinding = true): Promise<NativeBbBinding | null> {
    const { sessionId, conversationId, threadId, cwd } = this.options;
    if (!sessionId || !threadId || !cwd || !Number.isSafeInteger(conversationId) || conversationId < 1) throw Error('BB_OWNER_NATIVE_SESSION_MISMATCH');
    await this.coreScope(threadId, this.providerThreadId, null);
    const actual = await this.native.get();
    if (actual.sessionId !== sessionId || actual.id !== conversationId || actual.kind !== 'root' || actual.ownerAgentId !== undefined || actual.config.cwd !== cwd)
      throw Error('BB_OWNER_NATIVE_SESSION_MISMATCH');
    const binding = await this.native.bbBinding(threadId); // Server current grant, native ownership and selected provider/thread proof.
    if (requireBinding && !binding) throw Error('BB_OWNER_BINDING_REQUIRED');
    if (binding && (binding.providerId !== this.options.providerId || binding.sessionId !== sessionId || binding.conversationId !== conversationId || binding.bbThreadId !== threadId || binding.parentThreadId !== undefined))
      throw Error('BB_OWNER_BINDING_MISMATCH');
    if (this.closed) throw Error('BB_SESSION_DETACHED');
    return binding;
  }
  async prompt(text: string, clientRequestId: string) {
    const key = bbInputRequestId(clientRequestId, 'root');
    await this.checkRoot();
    const receipt = await this.native.send(text, 'followUp', key);
    if (!this.closed) this.options.core.notify('thread/delta', { threadId: this.options.threadId, deltas: [{ kind: 'input.accepted', clientRequestId }] });
    return receipt;
  }
  async steer(text: string, clientRequestId: string) {
    const key = bbInputRequestId(clientRequestId, 'root');
    await this.checkRoot();
    const receipt = await this.native.send(text, 'steer', key);
    if (!this.closed) this.options.core.notify('thread/delta', { threadId: this.options.threadId, deltas: [{ kind: 'input.accepted', clientRequestId }] });
    return receipt;
  }
  async configureSelection(model: { provider: string; modelId: string }, thinkingLevel: ThinkingLevel) {
    await this.checkRoot();
    const catalogue = await this.native.models();
    const selected = catalogue.find(item => item.provider === model.provider && item.id === model.modelId);
    if (!selected || selected.available === false || !selected.supportedThinkingLevels?.includes(thinkingLevel)) throw Error('BB_NATIVE_SELECTION_UNAVAILABLE');
    const current = await this.native.config();
    if (current.model?.provider !== model.provider || current.model.modelId !== model.modelId || current.thinkingLevel !== thinkingLevel)
      await this.native.configure({ model, thinkingLevel });
    const actual = await this.native.config();
    if (actual.model?.provider !== model.provider || actual.model.modelId !== model.modelId || actual.thinkingLevel !== thinkingLevel) throw Error('BB_NATIVE_SELECTION_UNCONFIRMED');
  }
  async interrupt() { await this.checkRoot(); return this.native.abort(); } // ROOT only; children use native parent stop(child-tree).
  getLastCheckpointId(): string | null { return this.deltas.checkpointId ?? null; }
  async parentState(target?: Required<NativeParentTarget>) { await this.checkRoot(); return this.native.parentControl(target); }

  async bindingForChild(threadId: string): Promise<NativeBbBinding> {
    await this.checkRoot();
    const binding = await this.native.bbBinding(threadId);
    if (!binding || binding.providerId !== this.options.providerId || binding.sessionId !== this.options.sessionId || binding.bbThreadId !== threadId ||
      binding.parentThreadId !== this.options.threadId || binding.conversationId === this.options.conversationId)
      throw Error('BB_OWNER_CHILD_SCOPE_UNCONFIRMED');
    await this.coreScope(threadId, `${binding.sessionId}:${binding.conversationId}`, this.options.threadId);
    return binding;
  }
  async openChild(threadId: string): Promise<BbChildSession> {
    await this.bindingForChild(threadId);
    const previous = this.children.get(threadId);
    if (previous) {
      const child = await previous;
      const current = this.children.get(threadId);
      if (current && current !== previous) return current; // Join a recovery installed while this caller awaited the old cache.
      if (!child.closed) {
        if (!child.historyRetryReady) return child;
        // Reopening retries the ORIGINAL uncertain attempt before any fresh capture.
        // Cache the recovery promise so concurrent attaches do not race that retry.
        const recovery = child.retryHistory().then(() => child);
        this.children.set(threadId, recovery);
        try { return await recovery; }
        finally {
          // Retain the same child and pending attempt even when the retry fails.
          if (this.children.get(threadId) === recovery) this.children.set(threadId, previous);
        }
      }
      if (this.children.get(threadId) === previous) this.children.delete(threadId);
      return this.openChild(threadId);
    }
    const pending = BbChildSession.open(this, threadId);
    this.children.set(threadId, pending);
    void pending.catch(() => { if (this.children.get(threadId) === pending) this.children.delete(threadId); });
    return pending;
  }
  async locateChildren(): Promise<Required<NativeParentTarget>[]> {
    await this.checkRoot();
    const [agents, team] = await Promise.all([this.native.doc('bb.subagents'), this.native.doc('bb.subagent-team')]);
    const byChild = new Map<number, Required<NativeParentTarget>>();
    for (const target of childLocators(agents.value, team.value)) byChild.set(target.conversationId, target);
    return [...byChild.values()]; // Locators are NOT permission; inspect(target) is mandatory before effects.
  }
  async childControlContext(conversationId: number) {
    const target = (await this.locateChildren()).find(candidate => candidate.conversationId === conversationId);
    if (!target) throw Error('BB_NATIVE_CHILD_EXECUTION_UNAVAILABLE');
    const state = await this.native.parentControl(target);
    return { expectedRevision: state.revision, target };
  }
  private projectionUnavailable(conversationId?: number) {
    if (this.closed) return;
    const channel = `pi-durable-child-projection:${conversationId ?? 'discovery'}`;
    this.options.core.notify('thread/delta', { threadId: this.options.threadId, deltas: [{
      kind: 'item.close', key: { channel }, status: 'pending', item: {
        type: 'backgroundTask', familyId: channel, taskType: 'pi-durable-child-projection', skipTranscript: true,
        description: 'BB child projection', status: 'pending', taskStatus: 'pending',
        summary: 'BB projection is unavailable or unconfirmed. Native work continues; no child or command was resubmitted.',
      },
    }] });
  }
  private async discoverChildren(signal: AbortSignal) {
    for (const target of await this.locateChildren()) {
      if (signal.aborted) return;
      if (this.discovered.has(target.conversationId)) continue;
      this.discovered.add(target.conversationId); // Failed attempts wait for explicit/native transport reconnect, never a doc loop.
      try {
        const projection = await this.registerChild(target);
        if (projection.status !== 'registered') { this.projectionUnavailable(target.conversationId); continue; }
        const child = await this.openChild(projection.binding.bbThreadId);
        if (!child.observing && !this.childObservers.has(child.binding.bbThreadId)) {
          const observer = child.observe(signal).catch(() => { if (!signal.aborted) this.projectionUnavailable(target.conversationId); });
          this.childObservers.set(child.binding.bbThreadId, observer);
          const cleanup = () => { if (this.childObservers.get(child.binding.bbThreadId) === observer) this.childObservers.delete(child.binding.bbThreadId); };
          void observer.then(cleanup, cleanup);
        }
      } catch { this.projectionUnavailable(target.conversationId); }
    }
  }

  /** Native ownership proof precedes the real Core effect; only its ACK can be persisted as a binding. */
  async registerChild(target: Required<NativeParentTarget>, title?: string) {
    const exact = structuredClone(target);
    await this.parentState(exact);
    const { providerId, sessionId, threadId } = this.options;
    const child = { providerId, sessionId, conversationId: String(exact.conversationId), parentProviderThreadId: this.providerThreadId, parentThreadId: threadId, title };
    const owner = { providerId, sessionId, parentProviderThreadId: this.providerThreadId, parentThreadId: threadId };
    const projection = await projectNativeChildInBb(child, owner, this.options.core.registerExisting ? {
      registerExisting: request => {
        const key = nativeChildKey(child);
        let pending = this.registrations.get(key);
        if (!pending) {
          // Original session registerExistingDeduplicated namespace: stable across reconnect/process restart.
          const requestId = `pi-durable:native:${createHash('sha256').update(JSON.stringify([
            sessionId, this.providerThreadId, child.conversationId, nativeChildRegistrationRequestId(child),
          ])).digest('hex')}`;
          pending = Promise.resolve().then(() => this.options.core.registerExisting!({ ...request, requestId }));
          this.registrations.set(key, pending);
          const attempt = pending;
          void pending.catch(() => { if (this.registrations.get(key) === attempt) this.registrations.delete(key); });
        }
        return pending;
      },
    } : undefined);
    if (projection.status === 'registered') {
      await this.checkRoot();
      await this.native.bindBbThread(projection.binding.bbThreadId, { kind: 'child', target: exact });
      // Publish the acknowledged locator before asking Core for its current owner scope.
      this.options.core.notify('thread/identity', { threadId: projection.binding.bbThreadId,
        providerThreadId: `${sessionId}:${exact.conversationId}`, sessionRestorable: true });
    } else this.registrations.delete(nativeChildKey(child));
    return projection;
  }
  /** Keep this exact native envelope across ambiguous HTTP results, including expectedRevision. */
  async control(command: NativeParentCommand): Promise<NativeParentReceipt> {
    const envelope = structuredClone(command);
    if (envelope.action === 'spawn' || !envelope.target.executionId || !envelope.target.requestId) throw Error('BB_EXACT_EXISTING_CHILD_REQUIRED');
    await this.checkRoot();
    return this.native.parentCommand(envelope);
  }
  async controlReceipt(controlId: string) { await this.checkRoot(); return this.native.parentReceipt(controlId); }
  async reconcileParent() { await this.checkRoot(); return this.native.reconcileParent(); }

  /** Every fresh transport connection rechecks real Core + host ownership BEFORE yielding native frames. */
  async observe(signal: AbortSignal, onState: (state: ConnectionState) => void = () => {}, onFrame?: (frame: Frame) => void): Promise<void> {
    if (this.observing) throw Error('BB_OBSERVATION_ALREADY_OPEN');
    this.observing = true;
    const observation = new AbortController();
    const combined = AbortSignal.any([signal, this.lifetime.signal, observation.signal]);
    const self = this;
    try { await follow(async function* (connectionSignal) {
      await self.checkRoot();
      self.discovered.clear();
      for await (const frame of self.native.events(connectionSignal, ['bb.subagents', 'bb.subagent-team'])) {
        if (frame.type === 'snapshot' || frame.type === 'doc' && (frame.kind === 'bb.subagents' || frame.kind === 'bb.subagent-team')) {
          await self.discoverChildren(connectionSignal).catch(() => self.projectionUnavailable());
        }
        yield frame;
      }
    }, frame => {
      if (this.closed || combined.aborted) return;
      const deltas = this.deltas.apply(frame);
      if (deltas.length) this.options.core.notify('thread/delta', { threadId: this.options.threadId, deltas });
      onFrame?.(frame);
    }, state => onState(state), combined);
    } finally {
      observation.abort();
      await Promise.allSettled([...this.childObservers.values()]);
      this.observing = false;
    }
  }
  get signal(): AbortSignal { return this.lifetime.signal; }
  /** Detach closes client observation only; running native work remains owned by the host. */
  close(): void { this.closed = true; this.lifetime.abort(); }
}
