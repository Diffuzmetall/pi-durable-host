import { isDeepStrictEqual } from 'node:util';
import type { Context } from '@earendil-works/chord';
import type { RegistrySnapshot, Storage, Tx } from '@earendil-works/pi-durable';

export class DurableReloadError extends Error {
  constructor(readonly reason: 'busy' | 'unsupported' | 'maintenance-required', message: string) { super(message); }
}
export interface NativeDocumentContract {
  kind: string;
  version: number;
  scope: 'session' | 'conversation' | 'task';
  history?: 'latest' | 'rewindable';
  fork?: 'asOf' | 'current' | 'initial';
}

/** Native schemas are JSON. Only annotations and new optional root properties may differ.
 * This deliberately does not claim to prove arbitrary JSON-schema subsumption. */
export function compatibleToolSchema(previous: unknown, next: unknown) {
  const maps = new Set(['properties', 'patternProperties', '$defs', 'definitions', 'dependentSchemas', 'dependencies']);
  const schemas = new Set(['items', 'prefixItems', 'allOf', 'anyOf', 'oneOf', 'not', 'if', 'then', 'else', 'contains',
    'additionalProperties', 'unevaluatedProperties', 'propertyNames', 'additionalItems', 'unevaluatedItems', 'contentSchema']);
  const clean = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(clean);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
      .filter(([key]) => !['description', 'title', 'examples', '$comment'].includes(key))
      .map(([key, value]) => [key, maps.has(key) && value && typeof value === 'object' && !Array.isArray(value)
        ? Object.fromEntries(Object.entries(value).map(([name, schema]) => [name, clean(schema)]))
        : schemas.has(key) ? clean(value) : value]));
    return value;
  };
  const old = clean(previous) as Record<string, unknown>;
  const candidate = clean(next) as Record<string, unknown>;
  if (isDeepStrictEqual(old, candidate)) return true;
  if (old?.type !== 'object' || candidate?.type !== 'object') return false;
  const { properties: oldProperties = {}, required: oldRequired = [], ...oldRest } = old;
  const { properties: newProperties = {}, required: newRequired = [], ...newRest } = candidate;
  if (!isDeepStrictEqual(oldRest, newRest)) return false;
  if (!(newRequired as string[]).every(name => (oldRequired as string[]).includes(name))) return false;
  return Object.entries(oldProperties as object).every(([name, schema]) =>
    isDeepStrictEqual(schema, (newProperties as Record<string, unknown>)[name]));
}

/** Read-only native task contracts. Terminal history may outlive an uninstalled extension. */
export async function assertNativeTaskContracts(reader: Pick<Tx, 'scanTasks'>, snapshot: RegistrySnapshot,
  removedTools = false) {
  let page = await reader.scanTasks({}, 500);
  for (;;) {
    for (const record of page.items) {
      const task = snapshot.task(record.kind);
      if (record.state.status === 'terminal') {
        if (task && record.version > task.definition.version)
          throw new DurableReloadError('maintenance-required', 'maintenance-required: rollback cannot read saved task version');
        continue;
      }
      if (removedTools && (record.kind === 'pi.generation' || record.kind === 'pi.tool'))
        throw new DurableReloadError('busy', 'Tool removal deferred while an accepted generation or tool is active');
      let checkpoint = 'checkpoint' in record.state ? record.state.checkpoint : undefined;
      let compatibleVersion = task?.definition.version === record.version;
      // Native migrations are pure and run at reservation. Validate the same supported
      // older checkpoint before open, without persisting or replacing native migration.
      if (task && record.version < task.definition.version && typeof task.definition.migrate === 'function') {
        try {
          if (record.state.status !== 'completing')
            checkpoint = task.definition.migrate(record.input, checkpoint ?? null, record.version).checkpoint;
          compatibleVersion = true;
        } catch { /* Report the safe maintenance reason below, never module payloads. */ }
      }
      const phase = checkpoint && typeof checkpoint === 'object' && !Array.isArray(checkpoint) ? checkpoint.phase : undefined;
      if (!task || !compatibleVersion ||
        (record.state.status !== 'completing' && (typeof phase !== 'string' || !(phase in task.definition.phases))))
        throw new DurableReloadError('maintenance-required', 'maintenance-required: installed task/checkpoint contract is incompatible');
    }
    if (!page.next) break;
    page = await reader.scanTasks({}, 500, page.next);
  }
}

/** Check document declarations captured by the existing fresh module evaluator.
 * Native base documents keep their existing owners; no second schema/revision journal. */
export async function assertNativeDocumentContracts(storage: Storage, contracts: readonly NativeDocumentContract[], context: Context) {
  if (!contracts.length) return;
  const byKind = new Map(contracts.map(contract => [contract.kind, contract]));
  const scopes: Parameters<Storage['scanDocuments']>[0]['scope'][] = [{ kind: 'session' }];
  let conversations = await storage.scanConversations({}, 500, undefined, context);
  for (;;) {
    for (const record of conversations.items) scopes.push({ kind: 'conversation', conversationId: record.id });
    if (!conversations.next) break;
    conversations = await storage.scanConversations({}, 500, conversations.next, context);
  }
  let tasks = await storage.scanTasks({}, 500, undefined, context);
  for (;;) {
    for (const record of tasks.items) scopes.push({ kind: 'task', taskId: record.id });
    if (!tasks.next) break;
    tasks = await storage.scanTasks({}, 500, tasks.next, context);
  }
  for (const scope of scopes) {
    let documents = await storage.scanDocuments({ scope, at: 'current' }, 500, undefined, context);
    for (;;) {
      for (const record of documents.items) {
        const contract = byKind.get(record.kind);
        if (!contract) continue;
        const stored = await storage.document(record.id, 'current', context);
        if (stored && (stored.version !== contract.version || record.scope.kind !== contract.scope ||
          record.history !== contract.history || record.fork !== contract.fork))
          throw new DurableReloadError('maintenance-required', 'maintenance-required: installed document contract is incompatible');
      }
      if (!documents.next) break;
      documents = await storage.scanDocuments({ scope, at: 'current' }, 500, documents.next, context);
    }
  }
}
