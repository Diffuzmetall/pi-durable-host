import type { ThinkingLevel } from 'dpi-sdk/api';
import { BbThreadSession, type BbCore, type BbRootOptions } from './session.js';
import type { BbChildSession } from './child-session.js';

interface PendingRequest { resolve(value: unknown): void; reject(error: Error): void; timeout: ReturnType<typeof setTimeout> }
interface View { child?: BbChildSession; controller?: AbortController; observer?: Promise<void> }
export interface BbBridgeOptions extends Omit<BbRootOptions, 'core'> {
  rootAttachment?: { enrollmentFingerprint: string; rootProfileFingerprint: string };
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Invalid BB request object');
  return value as Record<string, unknown>;
}
const pendingKey = (id: string | number) => `${typeof id}:${String(id)}`;
const levels = new Set(['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']);
// BB Core's transport routing fields are never native execution configuration.
const coreEnvKeys = new Set(['BB_CLI', 'BB_SERVER_URL', 'BB_HOST_DAEMON_PORT', 'BB_PROJECT_ID', 'BB_THREAD_STORAGE', 'BB_THREAD_ID', 'BB_ENVIRONMENT_ID']);

/** Selected provider JSON-RPC framing and method names; only its transport/ownership composition changes. */
export class BbProviderBridge {
  private readonly pendingRequests = new Map<string, PendingRequest>();
  private nextRequestId = 0;
  private readonly views = new Map<string, View>();
  private root?: Promise<BbThreadSession>;
  private selection?: { model: { provider: string; modelId: string }; thinkingLevel: ThinkingLevel };
  private closed = false;
  private readonly launchPath = process.env.PATH;
  private readonly core: BbCore;
  constructor(private readonly sendRaw: (json: string) => void, private readonly options: BbBridgeOptions) {
    this.core = {
      getOwnerScope: providerThreadId => this.reverseRequest('thread/getOwnerScope', { providerThreadId }),
      registerExisting: async request => {
        const result = record(await this.reverseRequest('thread/registerExisting', request));
        if (typeof result.threadId !== 'string' || !result.threadId.trim()) throw Error('Invalid Core native registration ACK');
        return { threadId: result.threadId };
      },
      reconcileExisting: (method, params) => {
        if (method !== 'thread/reconcileExisting') throw Error('Unsupported history request');
        return this.reverseRequest(method, params);
      },
      notify: (method, params) => this.notify(method, params),
    };
  }
  private send(value: unknown) { if (!this.closed) this.sendRaw(JSON.stringify(value) + '\n'); }
  private result(id: string | number, result: unknown) { this.send({ jsonrpc: '2.0', id, result }); }
  private error(id: string | number, code: number, message: string) { this.send({ jsonrpc: '2.0', id, error: { code, message } }); }
  private notify(method: string, params: Record<string, unknown>) { this.send({ jsonrpc: '2.0', method, params }); }
  private reverseRequest(method: string, params: object): Promise<unknown> {
    if (this.closed) return Promise.reject(Error('Provider bridge closed'));
    const id = `bb1-register-existing-${++this.nextRequestId}`;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { this.pendingRequests.delete(pendingKey(id)); reject(Error('Timed out waiting for authenticated Core response')); }, 10000);
      this.pendingRequests.set(pendingKey(id), { resolve, reject, timeout });
      this.send({ jsonrpc: '2.0', id, method, params });
    });
  }
  private async ensureRoot(bindFirst = false): Promise<BbThreadSession> {
    if (!this.root) {
      const pending = (async () => {
        if (bindFirst) {
          const native = await this.options.client.agent(this.options.sessionId, this.options.conversationId).get();
          if (native.sessionId !== this.options.sessionId || native.id !== this.options.conversationId || native.kind !== 'root' || native.ownerAgentId !== undefined || native.config.cwd !== this.options.cwd)
            throw Error('BB_OWNER_NATIVE_SESSION_MISMATCH');
          if (this.options.rootAttachment) {
            const receipt = record(await this.reverseRequest('thread/confirmRootAttachment', { providerThreadId: this.options.sessionId, ...this.options.rootAttachment }));
            if (Object.keys(receipt).length !== 1 || receipt.threadId !== this.options.threadId) throw Error('BB_OPERATOR_ROOT_CONFIRMATION_MISMATCH');
          }
          // Core can acknowledge owner scope only after admitting this native identity.
          // This is a locator, not authorization: bindRoot still checks Core scope and the server grant.
          this.notify('thread/identity', { threadId: this.options.threadId, providerThreadId: this.options.sessionId, sessionRestorable: true });
        }
        const options = { ...this.options, core: this.core };
        return bindFirst ? BbThreadSession.bindRoot(options) : BbThreadSession.open(options);
      })();
      this.root = pending;
      void pending.catch(() => { if (this.root === pending) this.root = undefined; });
    }
    return this.root;
  }
  private unavailable(threadId: string) {
    if (threadId !== this.options.threadId) {
      process.stderr.write('Native child connection unavailable; existing history retained; reconnect required.\n');
      return;
    }
    this.notify('thread/delta', { threadId, deltas: [{ kind: 'item.close', key: { channel: 'pi-durable-connection' }, status: 'pending', item: {
      type: 'backgroundTask', familyId: 'pi-durable-connection', taskType: 'pi-durable-connection', skipTranscript: true,
      description: 'Native connection', status: 'pending', taskStatus: 'pending', summary: 'Native connection is unavailable. Existing work was not replayed.',
    } }] });
  }
  private async observeView(threadId: string, view: View) {
    if (view.observer || view.child?.observing) return;
    const root = await this.ensureRoot();
    const controller = new AbortController(); view.controller = controller;
    const observer = view.child ? view.child.observe(controller.signal) : root.observe(controller.signal, state => {
      if (state === 'unauthorized' || state === 'gone') this.unavailable(threadId);
    });
    view.observer = observer.catch(() => { if (!controller.signal.aborted && !this.closed) this.unavailable(threadId); });
    const finished = () => { if (view.controller === controller) { view.observer = undefined; view.controller = undefined; } };
    void view.observer.then(finished, finished);
  }
  private async view(threadId: string, supplied: unknown, bindFirst = false): Promise<View> {
    if (threadId === this.options.threadId && supplied !== undefined && supplied !== this.options.sessionId) throw Error('BB_OWNER_PROVIDER_IDENTITY_MISMATCH');
    const root = await this.ensureRoot(bindFirst && threadId === this.options.threadId);
    let view = this.views.get(threadId);
    const binding = threadId === this.options.threadId ? undefined : await root.bindingForChild(threadId);
    const canonical = binding ? `${binding.sessionId}:${binding.conversationId}` : root.providerThreadId;
    if (supplied !== undefined && supplied !== canonical) throw Error('BB_OWNER_PROVIDER_IDENTITY_MISMATCH');
    const child = binding ? await root.openChild(threadId) : undefined;
    if (!view) { view = { child }; this.views.set(threadId, view); }
    this.notify('thread/identity', { threadId, providerThreadId: canonical, sessionRestorable: true });
    return view;
  }
  private async release(threadId: string) {
    const view = this.views.get(threadId); if (!view) return;
    view.controller?.abort(); await view.observer;
    this.views.delete(threadId);
    if (!this.views.size) { (await this.root)?.close(); this.root = undefined; return; }
    // A detached Root does not retire the native owner or its still-open child views.
    for (const [id, remaining] of this.views) await this.observeView(id, remaining);
  }
  private validateContext(params: Record<string, unknown>) {
    const options = params.options === undefined ? {} : record(params.options);
    for (const cwd of [params.cwd, options.cwd])
      if (cwd !== undefined && cwd !== this.options.cwd) throw Error('BB_OWNER_CWD_IMMUTABLE');
    if (params.shellEnvOverrides !== undefined && Object.keys(record(params.shellEnvOverrides)).length)
      throw Error('BB_SHARED_HOST_ENV_IMMUTABLE');
    if (options.envVars !== undefined) {
      for (const [key, value] of Object.entries(record(options.envVars))) {
        if (typeof value !== 'string' || (key === 'PATH' ? value !== this.launchPath : !coreEnvKeys.has(key)) ||
          (key === 'BB_THREAD_ID' && value !== params.threadId)) throw Error('BB_SHARED_HOST_ENV_IMMUTABLE');
      }
    }
    // Validated Core metadata is discarded, never forwarded to the native host or applied to process.env.
    return options;
  }
  private async readSelection(params: Record<string, unknown>) {
    const options = this.validateContext(params);
    const raw = params.model ?? options.model;
    const thinking = params.thinkingLevel ?? options.reasoningLevel ?? options.thinkingLevel;
    if (raw === undefined && thinking === undefined) return;
    const root = await this.ensureRoot(); const current = await root.native.config();
    let model = current.model;
    if (typeof raw === 'string') {
      const matches = (await root.native.models()).filter(item => `${item.provider}/${item.id}` === raw);
      if (matches.length !== 1) throw Error('BB_EXACT_MODEL_ID_REQUIRED');
      model = { provider: matches[0].provider, modelId: matches[0].id };
    } else if (raw !== undefined) {
      const value = record(raw);
      if (typeof value.provider !== 'string' || typeof value.id !== 'string') throw Error('BB_EXACT_MODEL_ID_REQUIRED');
      model = { provider: value.provider, modelId: value.id };
    }
    const level = thinking ?? current.thinkingLevel;
    if (!model || typeof level !== 'string' || !levels.has(level)) throw Error('BB_NATIVE_SELECTION_REQUIRED');
    this.selection = { model, thinkingLevel: level as ThinkingLevel }; // Deferred until explicit ROOT execution, never child attach.
  }
  async handleLine(line: string): Promise<void> {
    let message: Record<string, unknown>;
    try { message = record(JSON.parse(line)); }
    catch { this.error(0, -32700, 'Parse error: Invalid JSON request'); return; }
    const rawId = message.id;
    const id = typeof rawId === 'string' || typeof rawId === 'number' ? rawId : 0;
    if (message.method === undefined) {
      const pending = this.pendingRequests.get(pendingKey(id)); if (!pending) return;
      this.pendingRequests.delete(pendingKey(id)); clearTimeout(pending.timeout);
      if (message.error !== undefined) pending.reject(Error('Authenticated Core request rejected'));
      else pending.resolve(message.result);
      return;
    }
    try {
      const params = message.params === undefined ? {} : record(message.params);
      switch (message.method) {
        case 'initialize':
          this.result(id, { protocolVersion: 2, capabilities: { sessionRestore: true, threadArchive: false, threadRename: false, threadGoalClear: false,
            fork: 'none', approvalEnforcedBy: 'runtime', grammarVersions: [2, 3], steerMode: 'inject', skills: { configure: false } } }); return;
        case 'model/list': {
          const native = this.options.client.agent(this.options.sessionId, this.options.conversationId);
          const agent = await native.get();
          const models = await native.models();
          if (agent.config.model && !models.some(model => model.provider === agent.config.model!.provider && model.id === agent.config.model!.modelId)) throw Error('BB_SAVED_MODEL_UNAVAILABLE');
          this.result(id, { models: models.filter(model => model.available !== false || model.provider === agent.config.model?.provider && model.id === agent.config.model.modelId).map(model => ({
            id: `${model.provider}/${model.id}`, model: `${model.provider}/${model.id}`, displayName: `${model.name} (${model.provider})`, routeProviderId: model.provider,
            description: model.available === false ? 'Retained native selection is currently unavailable; no substitution was made.' : 'Native session model',
            supportedReasoningEfforts: (model.supportedThinkingLevels ?? []).map(reasoningEffort => ({ reasoningEffort, description: reasoningEffort })),
            ...(model.provider === agent.config.model?.provider && model.id === agent.config.model.modelId ? { isDefault: true, defaultReasoningEffort: agent.config.thinkingLevel } : {}),
          })), selectedOnlyModels: [] }); return;
        }
        case 'provider/health':
          await this.options.client.agent(this.options.sessionId, this.options.conversationId).get();
          this.result(id, { supported: true, health: { status: 'ready',
            statusMessage: 'Selected native host is reachable; thread attachment requires current Core and native binding authorization.',
            accountEmail: null, planLabel: null, installedVersion: null, minimumSupportedVersion: null,
            canInstall: false, canUpdate: false, loginCommand: null } }); return;
        case 'provider/usage': this.result(id, { supported: false }); return;
        case 'thread/start': case 'thread/resume': {
          if (typeof params.threadId !== 'string' || !params.threadId) throw Error('BB_THREAD_ID_REQUIRED');
          this.validateContext(params);
          const view = await this.view(params.threadId, params.providerThreadId, message.method === 'thread/start');
          if (!view.child) await this.readSelection(params);
          await this.observeView(params.threadId, view);
          this.result(id, { providerThreadId: view.child?.providerThreadId ?? this.options.sessionId, sessionRestorable: true }); return;
        }
        case 'turn/start': case 'turn/steer': {
          if (typeof params.threadId !== 'string') throw Error('BB_THREAD_ID_REQUIRED');
          this.validateContext(params);
          if (!Array.isArray(params.input) || params.input.some(chunk => !chunk || typeof chunk !== 'object' || chunk.type !== 'text' || typeof chunk.text !== 'string'))
            throw Error('Native BB controls require text input; attachments were not submitted');
          const text = params.input.map(chunk => chunk.text).join('\n').trim();
          if (!text || typeof params.clientRequestId !== 'string') throw Error('BB_INPUT_AND_CLIENT_REQUEST_ID_REQUIRED');
          // Native compact has no canonical request key; a lost Core ACK must not create another task.
          if (/(?:^|\n)\s*\/compact(?:\s|$)/m.test(text)) throw Error('BB_COMPACTION_UNSUPPORTED_IDEMPOTENCY');
          const view = await this.view(params.threadId, params.providerThreadId);
          const root = await this.ensureRoot();
          if (!view.child) { await this.readSelection(params); if (this.selection) await root.configureSelection(this.selection.model, this.selection.thinkingLevel); }
          if (message.method === 'turn/steer') await (view.child ?? root).steer(text, params.clientRequestId);
          else await (view.child ?? root).prompt(text, params.clientRequestId);
          await this.observeView(params.threadId, view);
          this.result(id, { threadId: params.threadId }); return;
        }
        case 'thread/stop': {
          if (typeof params.threadId !== 'string') throw Error('BB_THREAD_ID_REQUIRED');
          if (params.intent !== 'interrupt') { await this.release(params.threadId); this.result(id, { ok: true }); return; }
          const view = await this.view(params.threadId, params.providerThreadId); const root = await this.ensureRoot();
          if (view.child) {
            if (typeof params.activeTurnId === 'string' && params.activeTurnId) await view.child.interrupt(params.activeTurnId);
            else {
              const outcome = await root.native.bbOutcome(view.child.binding.bbThreadId);
              if (outcome.status === 'unknown' || outcome.status === 'working') throw Error('BB_NATIVE_INTERRUPT_TURN_ID_REQUIRED');
              // Authoritatively terminal already; do not invent an unstable control key from an RPC counter.
            }
          } else await root.interrupt();
          this.result(id, { ok: true, providerCheckpointId: view.child ? null : root.getLastCheckpointId() }); return;
        }
        case 'thread/discard':
          if (typeof params.threadId !== 'string') throw Error('BB_THREAD_ID_REQUIRED');
          await this.release(params.threadId); this.result(id, { ok: true }); return;
        default: this.error(id, -32601, `Method not found: ${String(message.method)}`); return;
      }
    } catch (error) {
      const known = new Set(['BB_NATIVE_SELECTION_UNAVAILABLE', 'BB_NATIVE_SELECTION_UNCONFIRMED', 'BB_EXACT_MODEL_ID_REQUIRED', 'BB_NATIVE_SELECTION_REQUIRED',
        'BB_COMPACTION_UNSUPPORTED_IDEMPOTENCY', 'BB_OWNER_CWD_IMMUTABLE', 'BB_SHARED_HOST_ENV_IMMUTABLE', 'BB_CLIENT_REQUEST_ID_INVALID', 'BB_NATIVE_RETRY_CONTEXT_UNAVAILABLE', 'BB_SAVED_MODEL_UNAVAILABLE', 'BB_NATIVE_INTERRUPT_TURN_ID_REQUIRED']);
      this.error(id, -32000, error instanceof Error && known.has(error.message) ? error.message : 'Native BB request refused or unconfirmed; existing work was not replaced or replayed');
    }
  }
  async shutdown(): Promise<void> {
    this.closed = true;
    for (const pending of this.pendingRequests.values()) { clearTimeout(pending.timeout); pending.reject(Error('Provider bridge closed')); }
    this.pendingRequests.clear();
    for (const view of this.views.values()) view.controller?.abort();
    (await this.root?.catch(() => undefined))?.close();
    await Promise.allSettled([...this.views.values()].map(view => view.observer));
    this.views.clear(); this.root = undefined;
  }
}
