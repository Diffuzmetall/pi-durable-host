import { createRegistry, type Extension } from '@earendil-works/pi-durable';

type Registry = ReturnType<typeof createRegistry>;
type Reader = Pick<Registry, 'snapshot' | 'subscribe'>;
/** Trusted server code only. Like the previous Durable adapter contract, preparation must not start resources. */
export type RegistryAdapter = (base: Reader) => Reader | Promise<Reader>;

/** Stable Harness facade. All adapters are staged and checked before one synchronous publication. */
export class ReloadableRegistry implements Registry {
  private current: Reader;
  private listeners = new Set<() => void>();
  constructor(private readonly base: Registry) { this.current = base; }
  snapshot() { return this.current.snapshot(); }
  subscribe(listener: () => void) {
    this.listeners.add(listener);
    const unsubscribe = this.base.subscribe(listener);
    return () => { this.listeners.delete(listener); unsubscribe(); };
  }
  install(extension: Extension) { this.base.install(extension); }
  uninstall(extension: Extension) { this.base.uninstall(extension); }
  async prepare(adapters: readonly RegistryAdapter[], additions: readonly Extension[] = []) {
    // Server-owned late-bound services (e.g. DeLM) join the protected base only on publication.
    const staged = createRegistry();
    for (const extension of this.base.snapshot().installed()) staged.install(extension);
    for (const extension of additions) {
      if (staged.snapshot().extension(extension.name)) throw Error('DUPLICATE_NATIVE_BASE_EXTENSION');
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
    // Server-owned guards, lifecycle hooks, tasks and tools are never replaceable by an add-on.
    for (const extension of base.installed())
      if (snapshot.extension(extension.name) !== extension) throw Error('NATIVE_BASE_EXTENSION_CHANGED');
    for (const task of base.tasks())
      if (snapshot.task(task.definition.name) !== task) throw Error('NATIVE_BASE_TASK_CHANGED');
    return { extensions: [...snapshot.installed()], publish: () => {
      for (const extension of additions) this.base.install(extension);
      this.current = { snapshot: () => snapshot, subscribe: () => () => {} };
      for (const listener of this.listeners) {
        try { listener(); } catch { console.error('DURABLE_RELOAD_LISTENER_FAILED'); }
      }
    } };
  }
}
