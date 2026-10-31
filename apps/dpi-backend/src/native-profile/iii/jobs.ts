import { configure, defineDocFamily, ROOT_CONVERSATION_ID, type ConversationId, type SubmissionId, type RegistryReader, type Extension } from '@earendil-works/pi-durable';
import { withCancel } from '@earendil-works/chord/context';
import { fingerprint } from './auth.js';
import { input, requestKey, type Input, type NativePort, type Request, type EventKind, type Json } from './domain.js';
import { TOOLS, JobScope, LegacyRequests, type Host, type Controller } from './native.js';
import { ownedInventory } from './inventory.js';
import { readRequest } from './receipts.js';
import { createResultPages } from './result-pages.js';
import { canonicalCompletion } from './completion.js';
import type { ControlOwner } from './control-domain.js';
import { createChildControl } from './child-control.js';
import { createJobControl } from './job-control.js';

type Saved = { fingerprint: string; content: string; mode: Input['mode']; operation: string; jobId: string;
  conversationId: ConversationId; generation?: number; submissionId?: SubmissionId; stopRequested?: boolean };
type Journal = { workspace?: string; policyReference?: string;
  jobs: Record<string, { conversationId: ConversationId }>;
  requests: Record<string, Saved> };
/** Binding-keyed native admission journal, not another execution database or scheduler. */
export const JobJournal = defineDocFamily<Journal, null>({ kind: 'durable-pi.jobs', version: 2, scope: 'session', family: true,
  checkpointWhen: () => false, initial: () => ({ jobs: {}, requests: {} }) });
export const jobRequestKey = (binding: string, requestId: string) => `durable-pi:v2:${binding}:${requestId}`;

export async function jobPort(host: Host & ControlOwner, registry: RegistryReader, controller: Controller, sessionId: string, workspace: string, guard: Extension): Promise<NativePort> {
  const { session, context } = host;
  let closed = false;
  const check = () => { if (closed) throw Error('BRIDGE_CLOSED'); host.authorize('read'); };
  const policyReference = fingerprint({ contractVersion: 2, sessionId, workspace, tools: TOOLS, guard: guard.name, ownerPolicy: host.scope.policy });
  await session.commit(async tx => {
    const doc = await tx.doc(JobJournal, sessionId, null);
    if (doc.policyReference && (doc.policyReference !== policyReference || doc.workspace !== workspace)) throw Error('BINDING_POLICY_CONFLICT');
    doc.workspace = workspace;
    doc.policyReference = policyReference;
    check();
  }, context);
  const state = async () => { check(); return (await session.snapshot(JobJournal, sessionId, context))!; };
  const controls = createJobControl(session, context, sessionId, policyReference, async (tx, jobId) => {
    const doc = await tx.doc(JobJournal, sessionId, null);
    if (!Object.hasOwn(doc.jobs, jobId)) throw Error('JOB_NOT_FOUND');
    return doc.jobs[jobId].conversationId;
  }, () => host.authorize('control'));
  const childControl = createChildControl(host, registry, controller, sessionId, workspace,
    async tx => (await tx.doc(JobJournal, sessionId, null)).jobs, check);
  // Fence both command families before either public abort path resumes the shared scheduler.
  await childControl.reconcile();
  await controls.reconcile();
  const legacy = async () => {
    const saved = await session.snapshot(LegacyRequests, context);
    return saved?.binding?.sessionId === sessionId ? saved : undefined;
  };
  let roots = new Set(Object.values((await state()).jobs).map(j => j.conversationId));
  const inventory = ownedInventory(session, async () => Object.values((await state()).jobs).map(j => j.conversationId), context, check);
  let lane: Promise<unknown> = Promise.resolve();
  const waits = new Set<() => void>();
  const listeners = new Set<(kind: EventKind, data: Json) => void>();
  function serial<T>(operation: () => Promise<T>): Promise<T> {
    const next = lane.then(() => { check(); return operation(); });
    lane = next.catch(() => {});
    return next;
  }
  async function receipt(requestId: string, includeResult = true): Promise<Request | null> {
    requestId = requestKey(requestId);
    const requests = (await state()).requests;
    const saved = Object.hasOwn(requests, requestId) ? requests[requestId] : undefined;
    if (saved) return { ...await readRequest(session, context, saved.conversationId, requestId,
      jobRequestKey(sessionId, requestId), saved.fingerprint, includeResult),
      contractVersion: 2, jobId: saved.jobId, jobGeneration: saved.generation ?? 0, conversationId: saved.conversationId };
    const old = await legacy();
    if (!old?.binding || !Object.hasOwn(old.requests, requestId)) return null;
    return { ...await readRequest(session, context, old.binding.conversationId, requestId,
      `durable-pi:${sessionId}:${requestId}`, old.requests[requestId].fingerprint, includeResult), contractVersion: 1 };
  }
  async function deliver(requestId: string) {
    host.authorize('write');
    const saved = (await state()).requests[requestId];
    return controls.withJob(saved.jobId, async () => {
      check();
      const key = jobRequestKey(sessionId, requestId);
      let canonical = await session.commit(tx => tx.submissionByRequest(saved.conversationId, key), context);
      if (!canonical && (saved.stopRequested || !await controls.canDeliver(saved.jobId, saved.generation ?? 0))) return;
      if (!canonical) {
        const conversation = await session.conversation(saved.conversationId, context);
        if (!conversation) throw Error('JOB_CONVERSATION_MISSING');
        const scope = await session.snapshot(JobScope, saved.conversationId, context);
        const agent = await conversation.agent(context);
        if (scope?.sessionId !== sessionId || scope.workspace !== workspace || !agent.extensions.some(e => e.name === guard.name)) throw Error('BRIDGE_SCOPE_MISSING');
        await controller.admit(conversation, key, context);
        check();
        if (!await controls.canDeliver(saved.jobId, saved.generation ?? 0)) return;
        host.authorize('write');
        await conversation.submit({ type: 'input', content: saved.content, whenBusy: saved.mode, requestId: key,
          entry: { kind: 'durable-pi.delegated', data: { source: 'iii', authority: 'delegated', sessionId, jobId: saved.jobId,
            requestId, operation: saved.operation, fingerprint: saved.fingerprint, policyReference } } }, context);
        canonical = await session.commit(tx => tx.submissionByRequest(saved.conversationId, key), context);
      }
      if (canonical && saved.submissionId !== canonical.id) await session.commit(async tx => {
        (await tx.doc(JobJournal, sessionId, null)).requests[requestId].submissionId = canonical!.id;
      }, context);
      if (canonical && saved.stopRequested) await session.abortSubmission(canonical.id, context, saved.conversationId);
    });
  }
  const unsubscribe = session.subscribeCommits(publication => {
    if (closed) return;
    // No Session API call is made on the synchronous commit callback stack.
    for (const change of publication.changes) {
      if (change.type === 'submission' && roots.has(change.value.conversationId) && change.value.type === 'input'
        && (change.value.status === 'done' || change.value.status === 'unanswered')
        && change.value.requestId?.startsWith(jobRequestKey(sessionId, ''))) {
        const requestId = change.value.requestId.slice(jobRequestKey(sessionId, '').length);
        for (const listener of listeners) listener('request-completed', { requestId });
      } else if (change.type === 'entry' && roots.has(change.value.conversationId)) {
        for (const listener of listeners) listener('agent-event', { entryId: change.value.id, entryKind: change.value.kind });
      } else if (change.type === 'task' && roots.has(change.value.conversationId)) {
        for (const listener of listeners) listener('tasks-changed', { taskId: change.value.id });
      }
    }
  });
  const stopClose = session.subscribeClose(() => { closed = true; unsubscribe(); listeners.clear(); for (const cancel of waits) cancel(); });
  const port: NativePort = {
    contractVersion: 2, childControl,
    controls: { stop: value => { check(); return controls.stop(value); }, get: id => { check(); return controls.command(id); } },
    async info() { const doc = await state(); return { sessionId, authority: 'delegated', tools: TOOLS,
      contractVersion: 2, runtimeVersion: '1.4.0', jobCount: Object.keys(doc.jobs).length,
      capabilities: { isolatedJobs: true, legacyReadback: true, runningStop: true, resultPages: true, childControl: true, treeEvents: false, recovery: false } }; },
    tasks: inventory.tasks,
    subagents: inventory.subagents,
    submit(value) { return serial(async () => {
      host.authorize('write');
      const operation = value.operation ?? (value.mode === 'steer' ? 'steer' : value.jobId ? 'follow_up' : 'start');
      const parsed = input({ requestId: value.requestId, content: value.content, ...(value.jobId === undefined ? {} : { jobId: value.jobId }) }, value.mode, operation);
      if (operation === 'start' && parsed.jobId !== undefined) throw Error('INITIAL_REQUEST_CANNOT_TARGET_JOB');
      if (operation !== 'start' && parsed.jobId === undefined) throw Error('JOB_REQUIRED');
      const jobId = parsed.jobId ?? parsed.requestId;
      const digest = fingerprint({ operation, jobId, content: parsed.content, mode: parsed.mode, policyReference });
      const old = await legacy();
      if (old && Object.hasOwn(old.requests, parsed.requestId)) throw Error('LEGACY_REQUEST_REQUIRES_READBACK');
      const root = operation === 'start' ? await session.conversation(host.scope.anchor, context) : undefined;
      const parent = await root?.agent(context);
      await session.commit(async tx => {
        const doc = await tx.doc(JobJournal, sessionId, null);
        const previous = Object.hasOwn(doc.requests, parsed.requestId) ? doc.requests[parsed.requestId] : undefined;
        if (previous) {
          if (previous.fingerprint !== digest) throw Error('REQUEST_PAYLOAD_CONFLICT');
          host.authorize('write');
          return;
        }
        if (Object.keys(doc.requests).length >= 1000) throw Error('REQUEST_INDEX_FULL');
        if (operation !== 'start' && !Object.hasOwn(doc.jobs, jobId)) throw Error('JOB_NOT_FOUND');
        if (operation === 'start') {
          if (!parent?.model) throw Error('NATIVE_ROOT_MODEL_REQUIRED');
          const available = registry.snapshot().tools().map(({ tool }) => tool);
          const tools = TOOLS.map(name => {
            const tool = available.find(t => t.name === name);
            if (!tool) throw Error(`NATIVE_TOOL_MISSING:${name}`);
            if (!parent.tools.some(t => t.name === name)) throw Error(`NATIVE_TOOL_NOT_GRANTED:${name}`);
            return tool;
          });
          const conversation = await tx.createConversation({ ownership: { kind: 'ownerless' } });
          await configure(tx, conversation.id, { tools, extensions: [...parent.extensions.filter(e => e.name !== guard.name), guard],
            model: parent.model, thinkingLevel: parent.thinkingLevel, cwd: workspace,
            instructions: [parent.instructions, 'Machine-delegated isolated work. No human approvals or operator authority. Use only offered scoped tools.'].filter(Boolean).join('\n\n') });
          Object.assign(await tx.doc(JobScope, conversation.id), { sessionId, workspace, ...host.scope });
          doc.jobs[jobId] = { conversationId: conversation.id };
        }
        const generation = await controls.admit(tx, jobId, operation);
        doc.requests[parsed.requestId] = { fingerprint: digest, content: parsed.content, mode: parsed.mode,
          operation, jobId, generation, conversationId: doc.jobs[jobId].conversationId };
        host.authorize('write');
      }, context);
      roots = new Set(Object.values((await state()).jobs).map(j => j.conversationId));
      await deliver(parsed.requestId);
      return (await receipt(parsed.requestId))!;
    }); },
    async run(value, waitSignal) {
      const admitted = await port.submit(value);
      check();
      if (admitted.submissionId === undefined) throw Error('REQUEST_WITHDRAWN_BEFORE_ADMISSION');
      const scope = withCancel(context);
      // A disconnected HTTP waiter never aborts the admitted native conversation.
      if (waitSignal?.aborted) scope.cancel();
      else waitSignal?.addEventListener('abort', scope.cancel, { once: true });
      waits.add(scope.cancel);
      try {
        const submission = await session.submission(admitted.submissionId as SubmissionId, scope.context);
        if (!submission) throw Error('SUBMISSION_NOT_FOUND');
        await submission.wait(scope.context);
        return (await receipt(value.requestId))!;
      } finally { waitSignal?.removeEventListener('abort', scope.cancel); waits.delete(scope.cancel); scope.cancel(); }
    },
    request: receipt,
    resultPage: createResultPages(session, context, sessionId, receipt, revision => { check(); if (revision && revision !== policyReference) throw Error('READ_SCOPE_CHANGED'); return policyReference; }),
    async completion(id) { const value = await receipt(id, false); return value?.receipt ? canonicalCompletion(value, sessionId, value.receipt.conversationId) : null; },
    async requests() {
      const old = await legacy();
      const keys = new Set([...Object.keys(old?.requests ?? {}), ...Object.keys((await state()).requests)]);
      return Promise.all([...keys].map(async key => (await receipt(key, false))!));
    },
    async stop() { throw Error('V2_JOB_STOP_ENVELOPE_REQUIRED'); },
    listen(listener) { check(); listeners.add(listener); return () => { listeners.delete(listener); }; },
    async close() { closed = true; childControl.close(); unsubscribe(); stopClose(); listeners.clear(); for (const cancel of waits) cancel(); waits.clear(); await lane; },
  };
  try { for (const key of Object.keys((await state()).requests)) await serial(() => deliver(key)); }
  catch (error) { await port.close(); throw error; }
  return port;
}
