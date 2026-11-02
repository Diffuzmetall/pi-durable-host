import { createRegistry, type Extension, type Storage, type Tx } from '@earendil-works/pi-durable';
import type { Context } from '@earendil-works/chord';
import { isDeepStrictEqual } from 'node:util';
import { adapterDocumentContracts } from './loader.js';
import { assertNativeTaskContracts, assertNativeDocumentContracts, compatibleToolSchema, DurableReloadError,
  type NativeDocumentContract } from './compatibility.js';

type Registry = ReturnType<typeof createRegistry>;
type Reader = Pick<Registry, 'snapshot' | 'subscribe'>;
/** Trusted server code only. Like the previous Durable adapter contract, preparation must not start resources. */
export type RegistryAdapter = (base: Reader) => Reader | Promise<Reader>;
/** Trusted handler-only replacement. Definitions come directly from native DocToken.definition. */
export interface NativeExtensionReplacement {
  extension: Extension;
  documents: readonly NativeDocumentContract[];
}

/** Stable Harness facade. Native registries own every immutable phase snapshot. */
export class ReloadableRegistry implements Registry {
  private current: Registry;
  private overlays: readonly Extension[] = [];
  private documents: readonly NativeDocumentContract[] = [];
  private replacementDocuments = new Map<string, readonly NativeDocumentContract[]>();
  private readonly replaceable: ReadonlySet<string>;
  private listeners = new Set<() => void>();
  private publishing = false;
  constructor(private readonly base: Registry, replaceable: readonly string[] = []) {
    this.replaceable = new Set(replaceable);
    this.current = base;
    // Controllers may install directly into the original base (e.g. memory reload).
    // Keep those changes visible after adapter publication, with one subscription.
    base.subscribe(() => {
      if (this.publishing) return;
      const next = createRegistry();
      for (const extension of base.snapshot().installed()) next.install(extension);
      for (const extension of this.overlays)
        if (!base.snapshot().extension(extension.name)) next.install(extension);
      this.current = next;
      this.notify();
    });
  }
  snapshot() { return this.current.snapshot(); }
  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }
  private notify() {
    for (const listener of this.listeners) {
      try { listener(); } catch { console.error('DURABLE_RELOAD_LISTENER_FAILED'); }
    }
  }
  install(extension: Extension) { this.base.install(extension); }
  uninstall(extension: Extension) { this.base.uninstall(extension); }
  async assertCompatibleState(storage: Storage, context: Context) {
    await assertNativeTaskContracts({ scanTasks: (query, limit, cursor) => storage.scanTasks(query, limit, cursor, context) }, this.snapshot());
    await assertNativeDocumentContracts(storage, this.documents, context);
  }
  async prepare(adapters: readonly RegistryAdapter[], additions: readonly Extension[] = [],
    replacements: readonly NativeExtensionReplacement[] = []) {
    const originalBase = this.base.snapshot();
    const originalCurrent = this.snapshot();
    // Server-owned late-bound services join the protected base only on publication.
    const staged = createRegistry();
    for (const extension of originalBase.installed()) staged.install(extension);
    for (const extension of additions) {
      if (staged.snapshot().extension(extension.name)) throw Error('DUPLICATE_NATIVE_BASE_EXTENSION');
      staged.install(extension);
    }
    const replacementDocuments = new Map(this.replacementDocuments);
    const namesToReplace = new Set<string>();
    for (const { extension, documents } of replacements) {
      const previous = originalBase.extension(extension.name);
      if (!this.replaceable.has(extension.name) || !previous || namesToReplace.has(extension.name))
        throw Error('NATIVE_HANDLER_REPLACEMENT_DENIED');
      const toolNames = (value: Extension) => (value.tools ?? []).map(tool => tool.name).sort();
      const taskNames = (value: Extension) => (value.tasks ?? []).map(task => task.definition.name).sort();
      if (!isDeepStrictEqual(toolNames(previous), toolNames(extension)) || !isDeepStrictEqual(taskNames(previous), taskNames(extension)))
        throw new DurableReloadError('maintenance-required', 'maintenance-required: handler replacement changes native surface');
      if (this.replacementDocuments.get(extension.name)?.some(previous => !documents.some(document => document.kind === previous.kind)))
        throw new DurableReloadError('maintenance-required', 'maintenance-required: handler replacement drops native document declarations');
      namesToReplace.add(extension.name);
      replacementDocuments.set(extension.name, documents.map(({ kind, version, scope, history, fork }) =>
        ({ kind, version, scope, ...(history ? { history } : {}), ...(fork ? { fork } : {}) })));
      staged.install(extension);
    }
    const base = staged.snapshot();
    let candidate: Reader = { snapshot: () => base, subscribe: () => () => {} };
    for (const adapter of adapters) {
      candidate = await adapter(candidate);
      if (!candidate || typeof candidate.snapshot !== 'function' || typeof candidate.subscribe !== 'function')
        throw Error('INVALID_NATIVE_REGISTRY_ADAPTER');
    }
    const snapshot = candidate.snapshot();
    const names = new Set<string>();
    for (const { tool } of snapshot.tools()) {
      if (names.has(tool.name)) throw Error('DUPLICATE_NATIVE_TOOL');
      names.add(tool.name);
    }
    // Server-owned guards/lifecycle stay immutable. Ordinary adapter code can change.
    for (const extension of base.installed())
      if (snapshot.extension(extension.name) !== extension) throw Error('NATIVE_BASE_EXTENSION_CHANGED');
    for (const task of base.tasks())
      if (snapshot.task(task.definition.name) !== task) throw Error('NATIVE_BASE_TASK_CHANGED');
    const next = createRegistry();
    for (const extension of snapshot.installed()) next.install(extension);
    const extensions = [...next.snapshot().installed()];
    const documents = [...adapters.flatMap(adapter => [...adapterDocumentContracts(adapter)]),
      ...[...replacementDocuments.values()].flat()];
    const knownDocuments = new Map<string, NativeDocumentContract>();
    for (const document of documents) {
      const prior = knownDocuments.get(document.kind);
      if (prior && !isDeepStrictEqual(prior, document)) throw Error('NATIVE_DOCUMENT_CONTRACT_CONFLICT');
      knownDocuments.set(document.kind, document);
    }
    const nextTools = new Map(next.snapshot().tools().map(({ tool }) => [tool.name, tool]));
    let removedTools = false;
    for (const { tool } of originalCurrent.tools()) {
      const replacement = nextTools.get(tool.name);
      if (!replacement) { removedTools = true; continue; }
      if (!compatibleToolSchema(tool.parameters, replacement.parameters) ||
        (tool.replay ?? 'unsafe') !== (replacement.replay ?? 'unsafe') || !isDeepStrictEqual(tool.callers, replacement.callers))
        throw new DurableReloadError('maintenance-required', 'maintenance-required: incompatible tool schema or replay policy');
    }
    for (const task of originalCurrent.tasks()) {
      const replacement = next.snapshot().task(task.definition.name);
      if (replacement && (replacement.definition.version !== task.definition.version ||
        Object.keys(task.definition.phases).some(phase => !(phase in replacement.definition.phases))))
        throw new DurableReloadError('maintenance-required', 'maintenance-required: incompatible task version or phases');
    }
    return { extensions,
      validateState: async (reader: Pick<Tx, 'scanTasks'>, storage?: Storage, context?: Context) => {
        await assertNativeTaskContracts(reader, next.snapshot(), removedTools);
        if (storage && context) await assertNativeDocumentContracts(storage, documents, context);
      },
      validate: () => {
        if (this.base.snapshot() !== originalBase || this.snapshot() !== originalCurrent)
          throw Error('NATIVE_REGISTRY_CHANGED_DURING_PREPARATION');
      },
      publish: () => {
        this.publishing = true;
        try {
          for (const extension of additions) this.base.install(extension);
          for (const { extension } of replacements) this.base.install(extension);
        }
        finally { this.publishing = false; }
        this.replacementDocuments = replacementDocuments;
        this.documents = [...knownDocuments.values()];
        this.overlays = extensions.filter(extension => !base.extension(extension.name));
        this.current = next;
        this.notify();
      },
    };
  }
}
