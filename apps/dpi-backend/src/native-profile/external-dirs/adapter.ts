import { createRegistry } from '@earendil-works/pi-durable';
import type { RegistryAdapter } from '@local/pi-durable-reload';
import { createExternalDirectories, type ExternalDirectoryOptions } from './index.js';

/** Trusted bootstrap supplies roots and CURRENT authorization. Preparation opens no resources.
 * Document access comes from each native tool/section invocation, not a captured Harness.
 */
export function createExternalDirectoryAdapter(options: ExternalDirectoryOptions): RegistryAdapter {
  return base => {
    const registry = createRegistry();
    for (const extension of base.snapshot().installed()) registry.install(extension);
    registry.install(createExternalDirectories(options).extension);
    return registry;
  };
}
