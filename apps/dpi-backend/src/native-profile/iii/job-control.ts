import { defineDocFamily, type ConversationId, type Harness, type Tx } from '@earendil-works/pi-durable';
import type { Context } from '@earendil-works/chord';
import { fingerprint } from './auth.js';
import { record, requestKey } from './domain.js';
import { MachineCommands } from './control-domain.js';

export type JobStopInput = { jobId: string; controlId: string; expectedGeneration: number };
export type JobStopReceipt = JobStopInput & { conversationId: number; stopRequested: boolean; stopped: boolean; outcome: 'pending' | 'stopped' };
type Command = JobStopInput & { fingerprint: string; conversationId: ConversationId; stopped: boolean };
type Controls = { jobs: Record<string, { generation: number; phase: 'open' | 'requested' | 'stopped' }>;
  commands: Record<string, Command> };
export const JobControls = defineDocFamily<Controls, null>({ kind: 'durable-pi.job-controls', version: 1,
  scope: 'session', family: true, checkpointWhen: () => false, initial: () => ({ jobs: {}, commands: {} }) });

// Shared only by attachments to the SAME native owner. Durable intents, not this lane, survive reopen.
const lanes = new WeakMap<Harness, Map<string, Promise<void>>>();
export function jobStopInput(value: unknown): JobStopInput {
  const v = record(value);
  if (Object.keys(v).sort().join(',') !== 'controlId,expectedGeneration,jobId') throw Error('INVALID_JOB_STOP_FIELDS');
  if (!Number.isSafeInteger(v.expectedGeneration) || (v.expectedGeneration as number) < 0) throw Error('INVALID_JOB_GENERATION');
  return { jobId: requestKey(v.jobId), controlId: requestKey(v.controlId), expectedGeneration: v.expectedGeneration as number };
}
function receipt(command: Readonly<Command>): JobStopReceipt {
  return { jobId: command.jobId, controlId: command.controlId, expectedGeneration: command.expectedGeneration,
    conversationId: command.conversationId, stopRequested: command.stopped, stopped: command.stopped,
    outcome: command.stopped ? 'stopped' : 'pending' };
}

/** Controls one already-authorized binding; lookup must validate its native job mapping inside tx. */
export function createJobControl(session: Harness, context: Context, binding: string, policyReference: string,
  lookup: (tx: Tx, jobId: string) => Promise<ConversationId>, authorize: () => void) {
  let ownerLanes = lanes.get(session);
  if (!ownerLanes) { ownerLanes = new Map(); lanes.set(session, ownerLanes); }
  const owner = ownerLanes;
  function withJob<T>(jobId: string, operation: () => Promise<T>): Promise<T> {
    const key = JSON.stringify([binding, requestKey(jobId)]);
    const next = (owner.get(key) ?? Promise.resolve()).then(operation);
    const settled = next.then(() => {}, () => {});
    owner.set(key, settled);
    void settled.then(() => { if (owner.get(key) === settled) owner.delete(key); });
    return next;
  }
  async function finish(controlId: string): Promise<JobStopReceipt> {
    const state = await session.snapshot(JobControls, binding, context);
    const command = state?.commands[controlId];
    if (!command || !Object.hasOwn(state!.commands, controlId)) throw Error('CONTROL_NOT_FOUND');
    if (command.stopped) return receipt(command);
    const conversation = await session.conversation(command.conversationId, context);
    if (!conversation) throw Error('JOB_CONVERSATION_MISSING');
    // Native commit marks the complete owned tree, rejects late task commits/submits, then waits for idle.
    // Intent readback stays pending (stopRequested:false) until the native fence AND owned-tree idle are proven.
    // Never acknowledge stopRequested/stopped merely because the intent was saved.
    await conversation.abort(context, { background: true });
    return acknowledge(controlId);
  }
  async function acknowledge(controlId: string): Promise<JobStopReceipt> {
    return session.commit(async tx => {
      const doc = await tx.doc(JobControls, binding, null);
      const current = doc.commands[controlId];
      const job = doc.jobs[current.jobId];
      if (job.generation !== current.expectedGeneration || await lookup(tx, current.jobId) !== current.conversationId) throw Error('CONTROL_TARGET_CONFLICT');
      job.phase = 'stopped';
      for (const entry of Object.values(doc.commands)) {
        if (entry.jobId === current.jobId && entry.expectedGeneration === current.expectedGeneration) entry.stopped = true;
      }
      return receipt(current);
    }, context);
  }
  return {
    withJob,
    /** Invoke only for a NEW request in the SAME transaction that persists its admission intent. */
    async admit(tx: Tx, jobId: string, operation: string): Promise<number> {
      await lookup(tx, jobId);
      const doc = await tx.doc(JobControls, binding, null);
      if (!Object.hasOwn(doc.jobs, jobId)) doc.jobs[jobId] = { generation: 0, phase: 'open' };
      const job = doc.jobs[jobId];
      if (job.phase === 'requested') throw Error('JOB_STOP_IN_PROGRESS');
      if (job.phase === 'stopped') {
        if (operation !== 'follow_up') throw Error('JOB_STOPPED_EXPLICIT_FOLLOW_UP_REQUIRED');
        if (!Number.isSafeInteger(job.generation + 1)) throw Error('JOB_GENERATION_EXHAUSTED');
        job.generation++;
        job.phase = 'open';
      }
      return job.generation;
    },
    async canDeliver(jobId: string, generation: number): Promise<boolean> {
      const doc = await session.snapshot(JobControls, binding, context);
      const job = doc && Object.hasOwn(doc.jobs, jobId) ? doc.jobs[jobId] : undefined;
      return job === undefined ? generation === 0 : job.generation === generation && job.phase === 'open';
    },
    async generation(jobId: string): Promise<number> {
      const doc = await session.snapshot(JobControls, binding, context);
      return doc && Object.hasOwn(doc.jobs, jobId) ? doc.jobs[jobId].generation : 0;
    },
    async command(controlId: string): Promise<JobStopReceipt | null> {
      controlId = requestKey(controlId);
      const doc = await session.snapshot(JobControls, binding, context);
      return doc && Object.hasOwn(doc.commands, controlId) ? receipt(doc.commands[controlId]) : null;
    },
    async stop(value: unknown): Promise<JobStopReceipt> {
      authorize();
      const parsed = jobStopInput(value);
      const digest = fingerprint({ action: 'stop', ...parsed, policyReference });
      const saved = await session.commit(async tx => {
        const conversationId = await lookup(tx, parsed.jobId);
        if (Object.hasOwn((await tx.doc(MachineCommands, binding, null)).commands, parsed.controlId)) throw Error('CONTROL_ID_CONFLICT');
        const doc = await tx.doc(JobControls, binding, null);
        const previous = Object.hasOwn(doc.commands, parsed.controlId) ? doc.commands[parsed.controlId] : undefined;
        if (previous) {
          if (previous.fingerprint !== digest) throw Error('CONTROL_PAYLOAD_CONFLICT');
          authorize();
          return { ...previous };
        }
        if (!Object.hasOwn(doc.jobs, parsed.jobId)) doc.jobs[parsed.jobId] = { generation: 0, phase: 'open' };
        const job = doc.jobs[parsed.jobId];
        if (parsed.expectedGeneration !== job.generation) throw Error('CONTROL_TARGET_CONFLICT');
        if (Object.keys(doc.commands).length >= 1000) throw Error('CONTROL_INDEX_FULL');
        const command: Command = { ...parsed, fingerprint: digest, conversationId, stopped: job.phase === 'stopped' };
        doc.commands[parsed.controlId] = command;
        if (!command.stopped) job.phase = 'requested';
        authorize();
        return { ...command };
      }, context);
      // Persist/close NEW admission immediately. Wait for any already-running bridge admission lane before aborting.
      return saved.stopped ? receipt(saved) : withJob(parsed.jobId, () => finish(parsed.controlId));
    },
    async reconcile(): Promise<void> {
      const doc = await session.snapshot(JobControls, binding, context);
      const jobs = [...new Set(Object.values(doc?.commands ?? {}).filter(c => !c.stopped).map(c => c.jobId))].sort();
      async function recover(): Promise<void> {
        const current = await session.snapshot(JobControls, binding, context);
        const commands = [...new Map(Object.values(current?.commands ?? {})
          .filter(c => !c.stopped && jobs.includes(c.jobId)).map(c => [c.jobId, c])).values()];
        const conversations = await Promise.all(commands.map(async c => {
          const conversation = await session.conversation(c.conversationId, context);
          if (!conversation) throw Error('JOB_CONVERSATION_MISSING');
          return conversation;
        }));
        // abort() resumes the shared scheduler. Queue ALL native marks synchronously before any reservation can run.
        await Promise.all(conversations.map(conversation => conversation.abort(context, { background: true })));
        for (const command of commands) await acknowledge(command.controlId);
      }
      async function lock(index: number): Promise<void> {
        if (index === jobs.length) return recover();
        return withJob(jobs[index], () => lock(index + 1));
      }
      if (jobs.length) await lock(0);
    },
  };
}
