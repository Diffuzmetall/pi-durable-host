// Adapted from the existing Durable durable-reload adapter loader (MIT).
import { resolve } from 'node:path';
import { createJiti } from 'jiti';
import * as durable from '@earendil-works/pi-durable';
import * as tools from '@earendil-works/pi-durable/tools';
import type { RegistryAdapter } from './registry.js';

/** Trusted bootstrap configuration only. Fresh dependency graph on every reload, same SDK identities. */
export async function loadRegistryAdapters(paths: readonly string[], cwd: string): Promise<RegistryAdapter[]> {
  const jiti = createJiti(import.meta.url, {
    moduleCache: false, fsCache: false, tryNative: false,
    virtualModules: { '@earendil-works/pi-durable': durable, '@earendil-works/pi-durable/tools': tools },
  });
  const adapters: RegistryAdapter[] = [];
  for (const path of [...new Set(paths.map(path => resolve(cwd, path)))]) {
    // Synchronous evaluation forces .mjs dependencies through the fresh evaluator too.
    // jiti.import can delegate them to Node's non-evictable ESM cache even with moduleCache:false.
    // Adapter modules must be resource-free (no top-level await); their factories may be async.
    const loaded = jiti(path) as RegistryAdapter | { default?: RegistryAdapter };
    const adapter = typeof loaded === 'function' ? loaded : loaded?.default;
    if (typeof adapter !== 'function') throw Error('DURABLE_NATIVE_ADAPTER_REQUIRED');
    adapters.push(adapter);
  }
  return adapters;
}
