import { randomUUID, createHash } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { CallToolResult, Tool, Transport } from '@modelcontextprotocol/client';
import { createHeadlessMcpAdapter, HostManagedMcpError } from 'pi-mcp-adapter/host-managed';
import { McpCredentialError } from './auth.ts';
import { McpConfigCapabilityError } from './config.ts';
import { mcpToolName } from './names.ts';

type Adapter = ReturnType<typeof createHeadlessMcpAdapter>;
export interface McpTransportContext {
  server: string;
  signal: AbortSignal;
  /** Await after credential preparation, immediately before sending tools/call. Metadata is separate. */
  beforeRequest(): Promise<void>;
}
export interface McpServerSpec {
  name: string;
  /** Explicit configuration revision; no secrets are returned by status(). */
  revision: string;
  createTransport(context: McpTransportContext): Transport | Promise<Transport>;
  tools?: readonly string[];
  exposure?: 'direct' | 'deferred' | 'codemode' | 'hidden';
  toolExposure?: Readonly<Record<string, 'direct' | 'deferred' | 'codemode' | 'hidden'>>;
  disabled?: boolean;
  lifecycle?: 'keep-alive' | 'lazy';
  idleTimeoutMs?: number;
  timeoutMs?: number;
  source?: string;
}
export interface McpDescriptor {
  readonly server: string;
  readonly generation: string;
  readonly instructions?: string;
  readonly definition: Tool;
  readonly exposure: 'direct' | 'deferred' | 'codemode';
}
export interface McpAuthorization {
  server: string;
  tool: string;
  toolCallId: string;
  arguments: Readonly<Record<string, unknown>>;
  signal: AbortSignal;
}
export class McpFailure extends Error {
  constructor(readonly code: 'not_sent' | 'may_have_run' | 'server_error' | 'invalid_result' | 'needs_auth' | 'config_error' | 'timeout' | 'transport_error' | 'cleanup_failed',
    readonly delivery: 'not_sent' | 'may_have_run' | 'server_error' | 'invalid_result' = 'not_sent') {
    super(`MCP_${code.toUpperCase()}${delivery !== 'not_sent' && delivery !== code ? ` (${delivery})` : ''}`);
    this.name = 'McpFailure';
  }
}
function classifyFailure(error: unknown, fallback: 'not_sent' | 'transport_error'): McpFailure {
  const delivery = error instanceof HostManagedMcpError ? error.delivery : 'not_sent';
  let cause = error;
  for (let depth = 0; cause instanceof Error && depth < 6; depth++, cause = cause.cause) {
    if (cause instanceof McpFailure) return cause;
    if (cause instanceof McpCredentialError || cause instanceof McpConfigCapabilityError) {
      const code = cause instanceof McpCredentialError ? cause.code : cause.credentialCode;
      const configuration = ['command-not-trusted', 'executor-required', 'environment-required'].includes(code ?? '') ||
        cause instanceof McpConfigCapabilityError && ['server-not-ready', 'transport-context'].includes(cause.code);
      return new McpFailure(configuration ? 'config_error' : 'needs_auth', delivery);
    }
    if (('status' in cause && (cause.status === 401 || cause.status === 403)) || ('code' in cause && (cause.code === 401 || cause.code === 403))) return new McpFailure('needs_auth', delivery);
    if (cause.name === 'TimeoutError' || ('code' in cause && ['ETIMEDOUT', 'MCP_REQUEST_TIMEOUT', -32001].includes(cause.code as string))) return new McpFailure('timeout', delivery);
  }
  return new McpFailure(error instanceof HostManagedMcpError ? delivery : fallback, delivery);
}
interface Slot {
  spec: McpServerSpec;
  generation: string;
  adapter?: Adapter;
  descriptors: readonly McpDescriptor[];
  fingerprint?: string;
  state: 'connecting' | 'connected' | 'cached' | 'failed' | 'disabled';
  error?: McpFailure['code'];
  delivery?: McpFailure['delivery'];
  connecting?: Promise<void>;
  retired: boolean;
  invalidated: boolean;
  inFlight: number;
  idle?: ReturnType<typeof setTimeout>;
  closing?: Promise<void>;
  drained?: () => void;
}

export interface McpReloadPreparation {
  catalog(): readonly McpDescriptor[];
  status(): ReturnType<McpManager['status']>;
  /** Recheck the publication fence without mutating the active generation. */
  validate(): void;
  /** Synchronous publication after native validation. Does not close admitted calls. */
  publish(): void;
  discard(): Promise<void>;
  /** Wait for old admitted calls and transport cleanup after publication. */
  drain(): Promise<void>;
}

function exposure(spec: McpServerSpec, name: string) {
  const rules = spec.toolExposure ?? {};
  if (rules[name]) return rules[name];
  for (const [pattern, value] of Object.entries(rules)) {
    const expression = '^' + pattern.split('*').map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$';
    if (new RegExp(expression).test(name)) return value;
  }
  return spec.exposure ?? 'codemode';
}

/** Owns MCP connections only. Durable Host remains the sole Harness/SQLite owner. */
export class McpManager {
  private readonly slots = new Map<string, Slot>();
  private readonly invocation = new AsyncLocalStorage<{ call?: McpAuthorization }>();
  private readonly pending = new Set<Adapter>();
  private readonly draining = new Set<Adapter>();
  private readonly listeners = new Set<() => void>();
  private operation: Promise<void> = Promise.resolve();
  private closed = false;
  private started = false;
  private closePromise?: Promise<void>;
  private preparing = false;
  private prepared?: McpReloadPreparation;
  private revision = 0;
  private cleanupFailure?: McpFailure;

  constructor(private readonly options: {
    servers: readonly McpServerSpec[];
    canonicalize?: (call: McpAuthorization) => Record<string, unknown>;
    authorize: (call: McpAuthorization) => void | Promise<void>;
  }) {
    if (typeof options.authorize !== 'function') throw new McpFailure('config_error');
    this.validate(options.servers);
  }

  private validate(specs: readonly McpServerSpec[]) {
    const names = new Set<string>();
    for (const spec of specs) {
      const namespace = spec.name.replace(/-/g, '_');
      if (!/^[A-Za-z0-9_-]+$/.test(spec.name) || names.has(namespace) || !spec.revision ||
          (spec.timeoutMs !== undefined && (!Number.isSafeInteger(spec.timeoutMs) || spec.timeoutMs <= 0)) ||
          (spec.idleTimeoutMs !== undefined && (!Number.isSafeInteger(spec.idleTimeoutMs) || spec.idleTimeoutMs < 0))) throw new McpFailure('config_error');
      names.add(namespace);
    }
  }

  private changed() {
    for (const listener of this.listeners) {
      // Catalogue observers cannot veto a committed generation or skip other observers.
      try { listener(); } catch { /* Observation is not part of the publication transaction. */ }
    }
  }
  onChange(listener: () => void) { this.listeners.add(listener); return () => this.listeners.delete(listener); }

  ready() {
    if (!this.started) {
      this.started = true;
      this.operation = this.prepare(this.options.servers, true).then(async prepared => {
        prepared.publish();
        await prepared.drain();
      });
    }
    return this.operation;
  }

  async prepareReload(specs: readonly McpServerSpec[]): Promise<McpReloadPreparation> {
    await this.ready();
    return this.prepare(specs, false);
  }

  private armIdle(slot: Slot) {
    clearTimeout(slot.idle);
    if (slot.spec.lifecycle !== 'lazy' || slot.spec.idleTimeoutMs === 0 || slot.state !== 'connected' || !slot.adapter || slot.inFlight || slot.retired || this.closed) return;
    slot.idle = setTimeout(() => {
      if (slot.inFlight || slot.retired || this.closed) return;
      const adapter = slot.adapter!;
      this.draining.add(adapter);
      slot.closing = adapter.close().then(() => {
        slot.adapter = undefined;
        slot.state = 'cached';
        slot.closing = undefined;
        this.draining.delete(adapter);
      });
      void slot.closing.catch(() => { this.cleanupFailure = new McpFailure('cleanup_failed'); });
    }, slot.spec.idleTimeoutMs ?? 600_000);
    slot.idle.unref();
  }

  private connect(slot: Slot): Promise<void> {
    slot.connecting ??= (async () => {
      if (this.closed || slot.retired) throw new McpFailure('not_sent');
      slot.state = 'connecting';
      const authorize = async (call: McpAuthorization) => {
        if (this.closed || slot.retired || slot.invalidated || this.slots.get(slot.spec.name) !== slot) throw new McpFailure('not_sent');
        await this.options.authorize(call);
        if (this.closed || slot.retired || slot.invalidated || this.slots.get(slot.spec.name) !== slot) throw new McpFailure('not_sent');
        call.signal.throwIfAborted();
      };
      const adapter = createHeadlessMcpAdapter({
        servers: { [slot.spec.name]: { tools: slot.spec.tools, createTransport: context => slot.spec.createTransport({
          ...context,
          beforeRequest: async () => {
            if (this.closed || slot.retired) throw new McpFailure('not_sent');
            const call = this.invocation.getStore()?.call;
            if (!call) throw new McpFailure('not_sent');
            try { await authorize(call); }
            catch (error) { throw classifyFailure(error, 'not_sent'); }
          },
        }) } },
        requestTimeoutMs: slot.spec.timeoutMs ?? 30_000,
        authorize: async call => {
          const invocation = this.invocation.getStore();
          if (!invocation) throw new McpFailure('not_sent');
          invocation.call = call; // Exact producer-frozen values, shared only within this async invocation.
          await authorize(call);
        },
        onCatalogChanged: () => {
          slot.invalidated = true;
          this.revision++;
          if (this.slots.get(slot.spec.name) === slot && !this.closed) {
            void this.reconnect(slot.spec.name).catch(() => {});
          }
        },
      });
      slot.adapter = adapter;
      this.pending.add(adapter);
      let timedOut = false;
      const deadline = setTimeout(() => {
        timedOut = true;
        void adapter.close().catch(() => { this.cleanupFailure = new McpFailure('cleanup_failed'); });
      }, slot.spec.timeoutMs ?? 30_000);
      try {
        await adapter.ready();
        if (this.closed || slot.retired || slot.invalidated) throw new McpFailure('not_sent');
        const catalogue = adapter.catalog();
        const fingerprint = createHash('sha256').update(JSON.stringify(catalogue)).digest('hex');
        const changed = slot.fingerprint !== fingerprint;
        if (changed) {
          slot.generation = randomUUID();
          slot.descriptors = Object.freeze(catalogue.flatMap(server => server.tools.flatMap(definition => {
            const mode = exposure(slot.spec, definition.name);
            return mode === 'hidden' ? [] : [Object.freeze({ server: server.server, generation: slot.generation,
              instructions: server.instructions, definition, exposure: mode })];
          })));
          const names = slot.descriptors.map(descriptor => mcpToolName(descriptor.server, descriptor.definition.name));
          if (new Set(names).size !== names.length) throw new McpFailure('config_error');
          slot.fingerprint = fingerprint;
        }
        slot.adapter = adapter;
        slot.state = 'connected';
        slot.error = undefined;
        slot.delivery = undefined;
        if (this.slots.get(slot.spec.name) === slot) {
          this.armIdle(slot);
          if (changed) this.changed();
        }
      } catch (error) {
        slot.state = 'failed';
        const failure = timedOut ? new McpFailure('timeout') : classifyFailure(error, 'transport_error');
        slot.error = failure.code;
        slot.delivery = failure.delivery;
        slot.descriptors = [];
        if (this.slots.get(slot.spec.name) === slot) this.changed();
        throw failure;
      } finally { clearTimeout(deadline); this.pending.delete(adapter); }
    })().finally(() => { slot.connecting = undefined; });
    return slot.connecting;
  }

  private retire(slot: Slot): Promise<void> {
    slot.retired = true;
    clearTimeout(slot.idle);
    if (slot.closing) return slot.closing;
    const adapter = slot.adapter;
    if (!adapter) return Promise.resolve();
    this.draining.add(adapter);
    slot.closing = (async () => {
      if (slot.inFlight) await new Promise<void>(resolve => { slot.drained = resolve; });
      await adapter.close();
      this.draining.delete(adapter);
    })();
    void slot.closing.catch(() => { this.cleanupFailure = new McpFailure('cleanup_failed'); });
    return slot.closing;
  }

  private async prepare(specs: readonly McpServerSpec[], startup: boolean): Promise<McpReloadPreparation> {
    this.validate(specs);
    if (this.closed) throw new McpFailure('not_sent');
    if (this.cleanupFailure) throw this.cleanupFailure;
    if (this.preparing || this.prepared || this.draining.size) throw new McpFailure('config_error');
    this.preparing = true;
    const revision = this.revision;
    const next = new Map<string, Slot>();
    const created: Slot[] = [];
    try {
      // Sequential preparation means a failed candidate has no still-running sibling initializer.
      for (const spec of specs) {
        const old = this.slots.get(spec.name);
        if (old && !old.invalidated && (old.spec === spec ||
            (old.spec.revision === spec.revision && old.spec.disabled === spec.disabled))) {
          next.set(spec.name, old);
          continue;
        }
        const fresh: Slot = { spec, generation: randomUUID(), descriptors: [],
          state: spec.disabled || spec.exposure === 'hidden' ? 'disabled' : 'connecting',
          retired: false, invalidated: false, inFlight: 0 };
        created.push(fresh);
        next.set(spec.name, fresh);
        if (fresh.state === 'disabled') continue;
        try { await this.connect(fresh); }
        catch (error) {
          // Initial startup retains visible failed servers, as before. Reload is all-or-nothing.
          if (!startup) throw error;
          await this.retire(fresh);
          fresh.retired = false;
          fresh.adapter = undefined;
        }
      }
      const aliases = new Set<string>();
      for (const slot of next.values()) for (const descriptor of slot.descriptors) {
        const name = mcpToolName(descriptor.server, descriptor.definition.name);
        if (aliases.has(name)) throw new McpFailure('config_error');
        aliases.add(name);
      }
      if (this.closed || revision !== this.revision || created.some(slot => slot.invalidated))
        throw new McpFailure('not_sent');
      let state: 'prepared' | 'published' | 'discarded' = 'prepared';
      let cleanup: Promise<void> | undefined;
      const oldSlots = [...this.slots.values()].filter(slot => next.get(slot.spec.name) !== slot);
      const settle = (slots: Slot[]) => {
        const job = Promise.all(slots.map(slot => this.retire(slot))).then(() => {});
        void job.catch(() => {});
        return job;
      };
      const prepared: McpReloadPreparation = {
        catalog: () => [...next.values()].flatMap(slot => slot.descriptors),
        status: () => [...next.values()].map(slot => this.slotStatus(slot)),
        validate: () => {
          if (state !== 'prepared' || this.prepared !== prepared || this.closed ||
              this.cleanupFailure || revision !== this.revision || created.some(slot => slot.invalidated))
            throw new McpFailure('not_sent');
        },
        publish: () => {
          prepared.validate();
          // No await between native validation, slot publication and retirement admission fence.
          this.slots.clear();
          for (const [name, slot] of next) this.slots.set(name, slot);
          state = 'published';
          this.prepared = undefined;
          this.revision++;
          cleanup = settle(oldSlots);
          for (const slot of next.values()) this.armIdle(slot);
          this.changed();
        },
        discard: () => {
          if (state === 'published') return Promise.reject(new McpFailure('not_sent'));
          if (state === 'prepared') {
            state = 'discarded';
            this.prepared = undefined;
            cleanup = settle(created);
          }
          return cleanup!;
        },
        drain: () => state === 'published' ? cleanup! : Promise.reject(new McpFailure('not_sent')),
      };
      this.prepared = prepared;
      return prepared;
    } catch (error) {
      const cleanup = await Promise.allSettled(created.map(slot => this.retire(slot)));
      if (cleanup.some(result => result.status === 'rejected')) throw new McpFailure('cleanup_failed');
      throw error;
    } finally { this.preparing = false; }
  }

  async reload(specs: readonly McpServerSpec[]): Promise<void> {
    const prepared = await this.prepareReload(specs);
    try { prepared.publish(); }
    catch (error) { await prepared.discard(); throw error; }
    // Preserve legacy reload timing: publication may finish while old admitted
    // calls are running. The next prepare remains fenced by the retiring set.
  }

  reconnect(server: string) {
    const slot = this.slots.get(server);
    if (!slot || slot.spec.disabled) return Promise.reject(new McpFailure('not_sent'));
    slot.invalidated = true;
    this.changed();
    return this.reload([...this.slots.values()].map(value => value.spec));
  }

  catalog(): readonly McpDescriptor[] {
    return [...this.slots.values()].flatMap(slot => slot.retired || slot.invalidated || slot.state === 'failed' ? [] : slot.descriptors);
  }

  private slotStatus(slot: Slot) {
    return { server: slot.spec.name, state: slot.invalidated ? 'catalog_changed' : slot.state,
      generation: slot.generation, source: slot.spec.source?.split('+').every(source => ['global', 'adapter', 'project'].includes(source)) ? slot.spec.source : 'injected',
      tools: slot.descriptors.length,
      ...(this.cleanupFailure ? { error: this.cleanupFailure.code, delivery: 'not_sent' as const } :
        slot.error ? { error: slot.error, delivery: slot.delivery ?? 'not_sent' } : {}) };
  }

  status() { return [...this.slots.values()].map(slot => this.slotStatus(slot)); }

  async call(descriptor: McpDescriptor, args: Record<string, unknown>, request: { callId: string; signal?: AbortSignal }): Promise<CallToolResult> {
    const slot = this.slots.get(descriptor.server);
    if (this.closed || !slot || slot.retired || slot.invalidated || slot.closing || !slot.descriptors.includes(descriptor)) throw new McpFailure('not_sent');
    clearTimeout(slot.idle);
    slot.inFlight++;
    try {
      if (!slot.adapter) await this.connect(slot);
      if (this.closed || slot.retired || !slot.descriptors.includes(descriptor)) throw new McpFailure('not_sent');
      const canonical = this.options.canonicalize?.({ server: descriptor.server, tool: descriptor.definition.name,
        toolCallId: request.callId, arguments: args, signal: request.signal ?? new AbortController().signal }) ?? args;
      const result = await this.invocation.run({}, () => slot.adapter!.invoke({ server: descriptor.server, tool: descriptor.definition.name,
        toolCallId: request.callId, arguments: canonical, signal: request.signal }));
      slot.error = result.isError ? 'server_error' : undefined;
      slot.delivery = result.isError ? 'server_error' : undefined;
      return result;
    } catch (error) {
      const failure = classifyFailure(error, 'not_sent');
      slot.error = failure.code;
      slot.delivery = failure.delivery;
      throw failure;
    } finally {
      slot.inFlight--;
      if (slot.retired && !slot.inFlight) slot.drained?.();
      else this.armIdle(slot);
    }
  }

  close() {
    this.closePromise ??= (async () => {
      this.closed = true;
      const discarded = this.prepared?.discard();
      for (const slot of this.slots.values()) { slot.retired = true; clearTimeout(slot.idle); }
      const adapters = new Set([...this.slots.values()].flatMap(slot => slot.adapter ? [slot.adapter] : []).concat([...this.pending], [...this.draining]));
      const results = await Promise.allSettled([
        ...[...adapters].map(adapter => adapter.close()),
        ...(discarded ? [discarded] : []),
      ]);
      this.listeners.clear(); this.invocation.disable();
      if (results.some(result => result.status === 'rejected')) {
        this.cleanupFailure = new McpFailure('cleanup_failed');
        throw this.cleanupFailure;
      }
      this.slots.clear(); this.draining.clear();
    })();
    return this.closePromise;
  }
}

export function createMcpManager(options: ConstructorParameters<typeof McpManager>[0]) { return new McpManager(options); }
