import { createHash } from 'node:crypto';
import type { Context } from '@earendil-works/chord';
import { awaitWithContext } from '@earendil-works/chord/context';
import { Type } from '@earendil-works/pi-ai';
import {
  createRegistry, defineDoc, defineExtension, defineTask, defineTool, section,
  type ConversationHandle, type ConversationId, type RegistryReader, type TaskId, type Harness,
} from '@earendil-works/pi-durable';
import { knownZone, nextRepeat, parseWhen, WHEN_HELP, type Repeat } from './when.js';

export const SCHEDULES_CAPABILITY = Symbol.for('pi.durable.schedules.capability');
export const HINDSIGHT_CONTROLLER = Symbol.for('pi.durable.hindsight.controller');
export const SCHEDULES_EXTENSION = 'durable-schedules';
export const SCHEDULED_PREFIX = '[scheduled] ';

/** Trusted host code only. Must persistently deduplicate admission by conversation/requestId.
 * Must reject if the original session/binding is no longer authorized. No input identity is accepted.
 */
export interface SchedulesOptions {
  admitInput(conversation: ConversationHandle, requestId: string, context: Context): Promise<void>;
  /** Trusted host must verify exact task kind and conversation, then abort and join only that task. */
  cancelTask?(conversationId: ConversationId, taskId: TaskId, context: Context): Promise<void>;
  /** Default is UTC, never the machine's implicit local zone. */
  zone?: string;
}
export type Schedule = {
  id: string; key: string; text: string; next: number; zone: string; every?: Repeat;
  taskId: TaskId; createdAt: number; runs: number;
  status: 'active' | 'completed' | 'cancelled' | 'failed';
};
/** Tombstones preserve tool-call deduplication even after completion/cancellation; forks inherit none. */
export const ScheduleDoc = defineDoc<{ items: Record<string, Schedule> }>({ checkpointWhen: () => false,
  kind: 'durable.schedules', version: 1, scope: 'conversation', history: 'latest',
  fork: 'initial', initial: () => ({ items: {} }),
});
const finished = { status: 'terminal', outcome: { status: 'completed', result: null } } as const;
export const occurrenceRequestId = (taskId: TaskId, runs: number) => `schedule:${taskId}:${runs}`;

/** Host-side cancellation boundary. Never grants the tool arbitrary task control. */
export async function cancelScheduleTask(host: Harness, conversationId: ConversationId, taskId: TaskId, context: Context) {
  const task = await host.getTask(taskId, context);
  if (!task || task.kind !== 'durable.schedule' || task.conversationId !== conversationId || task.owner !== undefined)
    throw Error('SCHEDULE_CANCELLATION_NOT_OWNED');
  await host.abortTask(taskId, context);
  await host.waitForTask(taskId, context);
}

export function createSchedules(options: SchedulesOptions) {
  if (typeof options?.admitInput !== 'function') throw new Error('Schedules require trusted input admission');
  const zone = options.zone ?? 'UTC';
  if (!knownZone(zone)) throw new Error(`Unknown time zone: ${zone}`);
  const task = defineTask<{ scheduleId: string }, { phase: 'wait' } | { phase: 'send' }, null>({
    name: 'durable.schedule', version: 2, initial: () => ({ phase: 'wait' }),
    migrate(input, checkpoint, fromVersion) {
      if (fromVersion !== 1) throw Error('Unsupported durable.schedule version');
      return { input: input as { scheduleId: string }, checkpoint: checkpoint as { phase: 'wait' } | { phase: 'send' } };
    },
    phases: {
      wait: async (record, runtime, context) => {
        await runtime.commit(async tx => {
          const item = (await tx.doc(ScheduleDoc, runtime.conversationId)).items[record.input.scheduleId];
          // The native scheduler owns the timer; send rechecks the cancellation tombstone.
          return item?.status === 'active'
            ? { status: 'sleeping', until: item.next, checkpoint: { phase: 'send' } }
            : finished;
        }, context);
      },
      send: async (record, runtime, context) => {
        const id = record.input.scheduleId;
        const item = (await runtime.snapshot(ScheduleDoc, runtime.conversationId, context))?.items[id];
        const conversation = await runtime.conversation(runtime.conversationId, context);
        if (item?.status !== 'active' || !conversation) return runtime.commit(() => finished, context);
        const requestId = occurrenceRequestId(item.taskId, item.runs);
        // A receipt surviving send-before-checkpoint skips admission AND resubmission.
        let submitted = false;
        await runtime.commit(async tx => { submitted = !!await tx.submissionByRequest(runtime.conversationId, requestId); return undefined; }, context);
        if (!submitted) {
          try { await awaitWithContext(options.admitInput(conversation, requestId, context), context); }
          catch (error) {
            context.abortSignal?.throwIfAborted();
            await runtime.commit(async tx => {
              const current = (await tx.doc(ScheduleDoc, runtime.conversationId)).items[id];
              if (current?.status === 'active') current.status = 'failed';
              return { status: 'terminal', outcome: { status: 'failed', error: { message: 'Trusted input admission failed; no automatic retry' } } };
            }, context);
            return;
          }
          // Revocation/cancellation while admission was waiting must not start new work.
          const current = (await runtime.snapshot(ScheduleDoc, runtime.conversationId, context))?.items[id];
          if (current?.status !== 'active') return runtime.commit(() => finished, context);
          await conversation.submit({ type: 'input', content: SCHEDULED_PREFIX + item.text, whenBusy: 'followUp', requestId }, context);
        }
        await runtime.commit(async tx => {
          const current = (await tx.doc(ScheduleDoc, runtime.conversationId)).items[id];
          if (current?.status !== 'active') return finished;
          current.runs += 1;
          if (current.every === undefined) { current.status = 'completed'; return finished; }
          // Missed repeats coalesce to one delivery; no catch-up storm after downtime.
          current.next = nextRepeat(current.every, runtime.now(), current.zone);
          return { status: 'running', checkpoint: { phase: 'wait' } };
        }, context);
      },
    },
    abort: async (record, runtime, context) => runtime.commit(async tx => {
      const item = (await tx.doc(ScheduleDoc, runtime.conversationId)).items[record.input.scheduleId];
      if (item?.status === 'active') item.status = 'cancelled';
      return { status: 'terminal', outcome: { status: 'aborted' } };
    }, context),
  });
  const tool = defineTool({
    name: 'schedule',
    description: `Schedule a message in this same conversation. Actions: add (when,message, optional zone), list, cancel (id). ${WHEN_HELP} Default zone: ${zone}. Repeats at least 10 minutes apart. Cancellation cannot retract already admitted input.`,
    parameters: Type.Object({
      action: Type.Union([Type.Literal('add'), Type.Literal('list'), Type.Literal('cancel')]),
      when: Type.Optional(Type.String({ minLength: 1, maxLength: 256 })),
      message: Type.Optional(Type.String({ minLength: 1, maxLength: 4000 })),
      zone: Type.Optional(Type.String({ minLength: 1, maxLength: 128 })),
      id: Type.Optional(Type.String({ minLength: 1, maxLength: 128 })),
    }, { additionalProperties: false }),
    structuredOutputSchema: Type.Object({ schedules: Type.Array(Type.Any()) }),
    replay: 'safe',
    execute: async (args, api, context) => {
      if (args.action === 'cancel' && typeof options.cancelTask !== 'function')
        throw Error('SCHEDULE_CANCELLATION_UNAVAILABLE: trusted abort-and-join capability required');
      const result = await api.commit(async tx => {
        const doc = await tx.doc(ScheduleDoc, api.conversationId);
        if (args.action === 'list') return JSON.parse(JSON.stringify(Object.values(doc.items).filter(item => item.status === 'active' || item.status === 'failed').sort((a, b) => a.next - b.next))) as Schedule[];
        if (args.action === 'cancel') {
          if (!args.id) throw new Error('cancel needs id');
          if (!Object.hasOwn(doc.items, args.id)) return [];
          const item = doc.items[args.id];
          if (item.status === 'active' || item.status === 'failed') item.status = 'cancelled';
          return [JSON.parse(JSON.stringify(item)) as Schedule];
        }
        const key = `${api.taskId}:${api.callId}`;
        // Retained tombstones, not only active schedules, are the idempotency ledger.
        const id = createHash('sha256').update(key).digest('hex');
        if (doc.items[id]) return [JSON.parse(JSON.stringify(doc.items[id])) as Schedule];
        if (!args.when || !args.message?.trim()) throw new Error('add needs when and non-empty message');
        const selectedZone = args.zone ?? zone;
        if (!knownZone(selectedZone)) throw new Error(`Unknown time zone: ${selectedZone}`);
        const now = Date.now();
        const parsed = parseWhen(args.when, now, selectedZone);
        if (parsed.rest) throw new Error(`Unsupported trailing time syntax: ${parsed.rest}`);
        if (!Number.isFinite(parsed.next) || parsed.next <= now) throw new Error('Time must be finite and in the future');
        if (Object.values(doc.items).filter(item => item.status === 'active').length >= 50) throw new Error('At most 50 active schedules per conversation');
        const taskId = await tx.createTask(task, { scheduleId: id }, {
          conversationId: api.conversationId, ownership: { kind: 'conversation' }, background: true,
        });
        const item: Schedule = { id, key, text: args.message.trim(), next: parsed.next,
          zone: selectedZone, ...(parsed.every ? { every: parsed.every } : {}),
          taskId, createdAt: now, runs: 0, status: 'active' };
        doc.items[id] = item;
        return [item];
      }, context);
      // Reconcile cancelled tombstones too: a crash may have followed the tombstone commit.
      if (args.action === 'cancel') for (const item of result)
        if (item.status === 'cancelled') await options.cancelTask!(api.conversationId, item.taskId, context);
      const structuredOutput = { schedules: result };
      return { output: [{ type: 'text', text: JSON.stringify(structuredOutput) }], structuredOutput };
    },
  });
  return defineExtension({ name: SCHEDULES_EXTENSION, tasks: [task], tools: [tool], sections: [
    section('schedules', () => 'Messages marked [scheduled] were arranged earlier. Nobody may be watching: do the work, then leave a self-contained summary.'),
  ] });
}

/** Startup registry adapter: no Harness/storage/controller construction and no service startup. */
export default function installSchedules(base: RegistryReader): RegistryReader {
  const capability = (base as RegistryReader & { [SCHEDULES_CAPABILITY]?: SchedulesOptions })[SCHEDULES_CAPABILITY];
  const controller = (base as RegistryReader & { [HINDSIGHT_CONTROLLER]?: { admit: SchedulesOptions['admitInput'] } })[HINDSIGHT_CONTROLLER]
    ?? (base.snapshot().extension('hindsight') as unknown as { [HINDSIGHT_CONTROLLER]?: { admit: SchedulesOptions['admitInput'] } })?.[HINDSIGHT_CONTROLLER];
  if (!capability && typeof controller?.admit !== 'function') throw new Error('Schedules require host capability or an existing bound Hindsight controller');
  const registry = createRegistry();
  for (const extension of base.snapshot().installed()) registry.install(extension);
  registry.install(createSchedules(capability ?? { admitInput: (conversation, requestId, context) => controller!.admit(conversation, requestId, context) }));
  // Preserve host handoffs without taking ownership of them (including Hindsight bind/close).
  for (const symbol of Object.getOwnPropertySymbols(base)) {
    Object.defineProperty(registry, symbol, Object.getOwnPropertyDescriptor(base, symbol)!);
  }
  return registry;
}
