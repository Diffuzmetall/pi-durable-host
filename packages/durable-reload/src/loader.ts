// Adapted from the existing Durable durable-reload adapter loader (MIT).
import { existsSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createJiti } from 'jiti';
import * as durable from '@earendil-works/pi-durable';
import * as tools from '@earendil-works/pi-durable/tools';
import * as ai from '@earendil-works/pi-ai';
import type { RegistryAdapter } from './registry.js';
import type { NativeDocumentContract } from './compatibility.js';

const adapterDocuments = new WeakMap<RegistryAdapter, readonly NativeDocumentContract[]>();
export const adapterDocumentContracts = (adapter: RegistryAdapter) => adapterDocuments.get(adapter) ?? [];

function freshEvaluator(documents?: NativeDocumentContract[], sharedModules: Readonly<Record<string, unknown>> = {}) {
  const capture = <T extends { definition: NativeDocumentContract }>(token: T): T => {
    const { kind, version, scope, history, fork } = token.definition;
    documents?.push({ kind, version, scope, ...(history ? { history } : {}), ...(fork ? { fork } : {}) });
    return token;
  };
  const sdk = documents ? { ...durable,
    defineDoc: (...args: Parameters<typeof durable.defineDoc>) => capture(durable.defineDoc(...args)),
    defineDocFamily: (...args: Parameters<typeof durable.defineDocFamily>) => capture(durable.defineDocFamily(...args)),
  } : durable;
  const fixedModules: Record<string, unknown> = { '@earendil-works/pi-durable': sdk, '@earendil-works/pi-durable/tools': tools, '@earendil-works/pi-ai': ai };
  const virtualModules: Record<string, unknown> = {};
  for (const [path, namespace] of Object.entries(sharedModules)) {
    if (Object.hasOwn(fixedModules, path)) continue;
    if (!isAbsolute(path)) throw Error('DURABLE_SHARED_MODULE_ABSOLUTE_PATH_REQUIRED');
    virtualModules[realpathSync(path)] = namespace;
  }
  // Fixed SDK identities also win when a shared path/symlink resolves to their entry point.
  for (const [name, namespace] of Object.entries(fixedModules)) {
    virtualModules[name] = namespace;
    virtualModules[realpathSync(fileURLToPath(import.meta.resolve(name)))] = namespace;
  }
  const evaluator = createJiti(import.meta.url, {
    moduleCache: false, fsCache: false, tryNative: false, virtualModules,
  });
  // Jiti checks virtual IDs before resolving relative imports. Normalize only
  // imports of shared files, using its existing per-file Babel transform.
  const transform = evaluator.options.transform!;
  evaluator.options.transform = options => transform({ ...options, babel: {
    ...options.babel, plugins: [...options.babel?.plugins ?? [], () => ({ visitor: {
      StringLiteral(path: { node: { value: string }; parent: { type: string; source?: unknown; arguments?: unknown[]; callee?: { type: string; name?: string } } }) {
        const { node, parent } = path;
        const imported = parent.source === node || parent.type === 'CallExpression' && parent.arguments?.[0] === node
          && (parent.callee?.type === 'Import' || ['require', 'jitiImport'].includes(parent.callee?.name ?? ''));
        if (!imported || !options.filename || !(node.value.startsWith('.') || isAbsolute(node.value))) return;
        const absolute = resolve(dirname(options.filename), node.value);
        if (!existsSync(absolute)) return;
        const canonical = realpathSync(absolute);
        if (Object.hasOwn(virtualModules, canonical)) node.value = canonical;
      },
    } })],
  } });
  return evaluator;
}

/** Trusted resource-free modules; shared canonical file paths retain existing resource owners. */
export function loadFreshModule<T = unknown>(path: string, sharedModules?: Readonly<Record<string, unknown>>): T {
  return freshEvaluator(undefined, sharedModules)(resolve(path)) as T;
}

/** Trusted bootstrap configuration only. Fresh dependency graph on every reload, same SDK identities. */
export async function loadRegistryAdapters(paths: readonly string[], cwd: string): Promise<RegistryAdapter[]> {
  const documents: NativeDocumentContract[] = [];
  const jiti = freshEvaluator(documents);
  const adapters: RegistryAdapter[] = [];
  for (const path of [...new Set(paths.map(path => resolve(cwd, path)))]) {
    // Synchronous evaluation forces .mjs dependencies through the fresh evaluator too.
    // jiti.import can delegate them to Node's non-evictable ESM cache even with moduleCache:false.
    // Adapter modules must be resource-free (no top-level await); their factories may be async.
    const loaded = jiti(path) as RegistryAdapter | { default?: RegistryAdapter };
    const adapter = typeof loaded === 'function' ? loaded : loaded?.default;
    if (typeof adapter !== 'function') throw Error('DURABLE_NATIVE_ADAPTER_REQUIRED');
    adapterDocuments.set(adapter, [...documents]);
    adapters.push(adapter);
  }
  return adapters;
}
