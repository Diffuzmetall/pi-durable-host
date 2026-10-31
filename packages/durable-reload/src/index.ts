import type { Context } from '@earendil-works/chord';
import type { Harness } from '@earendil-works/pi-durable';
import type { createNativeModels } from './models.js';
export { createNativeModels, type NativeModelsOptions, type NativeModelDescriptor, type NativeModelReference } from './models.js';
export { loadRegistryAdapters } from './loader.js';
export { ReloadableRegistry, type RegistryAdapter } from './registry.js';

type Models = Awaited<ReturnType<typeof createNativeModels>>;
/** Trusted staged native service update. apply may update native selection after all preparation
 * succeeds; it must not publish registry/providers. publish is synchronous and nonthrowing. */
export interface DurableReloadPreparation {
  apply?(): Promise<void>;
  publish(): void;
}
export class DurableReloadError extends Error {
  constructor(readonly reason: 'busy' | 'unsupported', message: string) { super(message); }
}
const reloading = new WeakSet<Harness>();
export const isDurableReloading = (harness: Harness) => reloading.has(harness);

/** Transport-independent Durable operation. Never opens storage, closes/resumes Harness,
 * executes remote module paths, changes saved models or persists credentials.
 * A trusted apply hook may select a late-bound native service after preparation succeeds.
 * Callers must use a trusted, resource-free extension preparer with a nonthrowing publisher.
 */
export async function reloadDurable(options: {
  harness: Harness;
  context: Context;
  models?: Models;
  prepareExtensions?: () => Promise<DurableReloadPreparation>;
  assertCurrent(): unknown;
}) {
  const { harness, context, models, prepareExtensions, assertCurrent } = options;
  if (reloading.has(harness)) throw new DurableReloadError('busy', 'Durable reload is already in progress');
  if (!models && !prepareExtensions) throw new DurableReloadError('unsupported', 'Durable reload is unconfigured');
  reloading.add(harness);
  const assertIdle = async () => {
    assertCurrent();
    // Read all persisted native tasks, including background/scheduled tasks beyond UI page limits.
    await harness.commit(async tx => {
      let page = await tx.scanTasks({}, 500);
      for (;;) {
        if (page.items.some(task => task.state.status !== 'terminal'))
          throw new DurableReloadError('busy', 'Cannot reload while Durable tasks are active');
        if (!page.next) break;
        page = await tx.scanTasks({}, 500, page.next);
      }
    }, context);
    assertCurrent();
  };
  try {
    await assertIdle();
    const candidateModels = await models?.prepareReload();
    const candidateExtensions = await prepareExtensions?.();
    if (candidateModels) {
      const records = await harness.commit(async tx => {
        let page = await tx.scanConversations({}, 1000);
        const records = [...page.items];
        while (page.next) {
          page = await tx.scanConversations({}, 1000, page.next);
          records.push(...page.items);
        }
        return records;
      }, context);
      // Validate every root/fork/child's exact saved selection, not merely the device default.
      for (const record of records) {
        const conversation = (await harness.conversation(record.id, context))!;
        const reference = (await conversation.agent(context)).model;
        if (!reference) throw Error('DURABLE_SAVED_MODEL_REQUIRED');
        await candidateModels.requireModel(reference);
      }
    }
    const catalogue = await candidateModels?.catalogue();
    await assertIdle();
    await candidateExtensions?.apply?.();
    await assertIdle();
    // No awaits between publications; the running Harness and all agent IDs are retained.
    candidateModels?.publish();
    candidateExtensions?.publish();
    return { models: catalogue };
  } finally { reloading.delete(harness); }
}
