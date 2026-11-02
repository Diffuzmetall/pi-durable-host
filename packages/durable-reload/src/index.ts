import type { Context } from '@earendil-works/chord';
import type { Harness, Tx } from '@earendil-works/pi-durable';
import type { createNativeModels } from './models.js';
export { createNativeModels, type NativeModelsOptions, type NativeModelDescriptor, type NativeModelReference } from './models.js';
export { loadRegistryAdapters, loadFreshModule } from './loader.js';
export { ReloadableRegistry, type RegistryAdapter, type NativeExtensionReplacement } from './registry.js';

import { DurableReloadError } from './compatibility.js';
export { DurableReloadError } from './compatibility.js';

type Models = Awaited<ReturnType<typeof createNativeModels>>;
/** Trusted staged native service update. apply may update native selection after all preparation
 * succeeds; it must not publish registry/providers. publish is synchronous and nonthrowing. */
export interface DurableReloadPreparation {
  apply?(): Promise<void>;
  /** Synchronous final validation; runs after authority checks and before any publication. */
  validate?(): void;
  /** Read-only state checks, on the native mutation line. Never stage writes here. */
  validateState?(reader: Pick<Tx, 'scanTasks'>): Promise<void>;
  publish(): void;
  /** Close only unpublished candidate resources after rejection. Preparation owns its own failures. */
  discard?(): Promise<void>;
  /** Retire old resources after publication, outside the native commit. Never undo publication. */
  drain?(): Promise<void>;
}
const reloading = new WeakSet<Harness>();
export const isDurableReloading = (harness: Harness) => reloading.has(harness);

/** Transport-independent Durable operation. Never opens storage, closes/resumes Harness,
 * executes remote module paths, changes saved models or persists credentials.
 * A trusted apply hook may select a late-bound native service after preparation succeeds.
 * Callers supply a trusted preparer with a nonthrowing publisher and cleanup for staged resources.
 * A returned cleanupError means publication applied but retirement failed; never expose its raw
 * contents to an HTTP client or describe this outcome as retaining the previous runtime.
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
  let candidateExtensions: DurableReloadPreparation | undefined;
  let published = false;
  try {
    assertCurrent();
    const candidateModels = await models?.prepareReload();
    candidateExtensions = await prepareExtensions?.();
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
    // Pure native definitions and provider snapshots do not require a session-wide idle.
    // Existing resource/selection handoffs retain their conservative barrier until their
    // controller can supply a narrower safe boundary.
    const validatePrepared = async (tx: Tx) => {
      await candidateExtensions?.validateState?.(tx);
      assertCurrent();
      candidateExtensions?.validate?.();
    };
    if (candidateExtensions?.apply) {
      await assertIdle();
      // An incompatible checkpoint/document must fail before a native selection
      // handoff writes. Recheck after it because other native commits can run.
      await harness.commit(validatePrepared, context);
      await candidateExtensions.apply();
      await assertIdle();
    }
    // Reuse the native mutation line, not a second revision/selection journal.
    // The callback is read-only: native settlement has no storage writes to fail
    // after publication. Scheduler/admission commits cannot slip into this window.
    await harness.commit(async tx => {
      await validatePrepared(tx);
      // No awaits between publications; all Harness/agent IDs are retained.
      candidateModels?.publish();
      candidateExtensions?.publish();
      published = true;
    }, context);
    let cleanupError: unknown;
    try { await candidateExtensions?.drain?.(); }
    catch (error) { cleanupError = error; }
    return { models: catalogue, cleanupError };
  } catch (error) {
    if (!published) {
      try { await candidateExtensions?.discard?.(); }
      catch (cleanupError) { throw new AggregateError([error, cleanupError], 'DURABLE_RELOAD_DISCARD_FAILED'); }
    }
    throw error;
  } finally { reloading.delete(harness); }
}
