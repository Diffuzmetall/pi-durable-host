import { AgentDoc, LiveDoc, type ConversationId, type RegistryReader, type Tx } from '@earendil-works/pi-durable';
import { bindParentControl, PARENT_CONTROL_VERSION, SupervisorDoc, validateParentCommand, type ParentCommand, type ParentTarget } from '../subagents/index.js';
import { ParentControlsDoc, parentRevision } from '../subagents/parent-control.js';
import { JobScope, GUARD_NAME, type Host, type Controller } from './native.js';
import { JobControls } from './job-control.js';
import { ExistingInputs } from './input-policy.js';
import { fingerprint } from './auth.js';
import { record, requestKey, string, type Json } from './domain.js';
import { MachineCommands, controlFormat, parseControlPolicy, type ChildControlPort, type ControlOperation, type ControlOwner } from './control-domain.js';
import type { TargetRef } from './read-domain.js';

type Jobs = (tx: Tx) => Promise<Readonly<Record<string, { conversationId: ConversationId }>>>;
export function createChildControl(host: Host & ControlOwner, registry: RegistryReader, controller: Controller, binding: string, workspace: string, jobs: Jobs, check: () => void): ChildControlPort {
  const { session, context } = host;
  const extension = registry.snapshot().extension('subagent');
  if (!extension || PARENT_CONTROL_VERSION !== 'native-parent-control/v1') throw Error('NATIVE_PARENT_CONTROL_OWNER_REQUIRED');
  async function authorize(tx: Tx, parent: ConversationId, action: string) {
    check();
    host.authorize(action === 'read' ? 'read' : action === 'input' ? 'write' : 'control');
    const policy = host.controlPolicy ? parseControlPolicy(host.controlPolicy()) : { revision: 'jobs-only-v1', active: true, existing: [] };
    if (!policy.active) throw Error('CONTROL_SCOPE_REVOKED');
    const own = Object.entries(await jobs(tx)).find(([, job]) => job.conversationId === parent);
    if (!own && !policy.existing.includes(parent)) throw Error('PARENT_CONTROL_DENIED');
    if (own && action !== 'read') {
      const job = (await tx.doc(JobControls, binding, null)).jobs[own[0]];
      if (job && job.phase !== 'open') throw Error('JOB_CONTROL_FENCED');
    }
    const policyReference = fingerprint({ binding, workspace, parent, revision: policy.revision, tools: ['read'] });
    return { binding, policyReference, jobId: own?.[0], tools: ['read'], assertCurrent: () => host.authorize(action === 'read' ? 'read' : action === 'input' ? 'write' : 'control'), prepareChild: async (inner: Tx, child: ConversationId, input: { requestId: string; created: boolean }) => {
      if (input.created) {
        Object.assign(await inner.doc(JobScope, child), { sessionId: binding, workspace, ...host.scope });
        const agent = await inner.doc(AgentDoc, child), selected = agent.extensions;
        if (Array.isArray(selected)) { if (!selected.includes(GUARD_NAME)) selected.push(GUARD_NAME); }
        else agent.extensions = { ...selected, add: [...new Set([...(selected?.add ?? []), GUARD_NAME])], remove: selected?.remove?.filter(name => name !== GUARD_NAME) ?? [] };
      } else {
        const scope = await inner.doc(JobScope, child);
        if (scope.sessionId !== binding || scope.workspace !== workspace) throw Error('BRIDGE_SCOPE_MISSING');
        // These isolated job children already carry the persistent current-policy/read-only guard.
      }
    } };
  }
  const native = bindParentControl(extension, session, context, authorize);
  function target(value: unknown): TargetRef {
    const t = record(value);
    const fields = t.type === 'conversation' ? ['binding','session','type','conversationId'] : t.type === 'child' ? ['binding','session','type','conversationId','parentConversationId','childKey'] : t.type === 'execution' ? ['binding','session','type','conversationId','parentConversationId','childKey','executionId','childRequestId'] : [];
    if (!fields.length || Object.keys(t).sort().join(',') !== fields.sort().join(',') || t.binding !== binding || t.session !== binding || !Number.isSafeInteger(t.conversationId) || (t.conversationId as number) < 1) throw Error('CONTROL_TARGET_DENIED');
    if (t.type !== 'conversation' && (!Number.isSafeInteger(t.parentConversationId) || (t.parentConversationId as number) < 1 || typeof t.childKey !== 'string' || !t.childKey)) throw Error('INVALID_CHILD_TARGET');
    if (t.type === 'execution' && (typeof t.executionId !== 'string' || !t.executionId || typeof t.childRequestId !== 'string' || !t.childRequestId)) throw Error('INVALID_EXECUTION_TARGET');
    return t as TargetRef;
  }
  const parentId = (t: TargetRef) => ('parentConversationId' in t ? t.parentConversationId : t.conversationId) as ConversationId;
  const childTarget = (t: TargetRef): ParentTarget | undefined => 'childKey' in t ? { key: t.childKey, conversationId: t.conversationId,
    ...('executionId' in t ? { executionId: t.executionId, requestId: t.childRequestId } : {}) } : undefined;
  async function inputRevision(tx: Tx, parent: ConversationId, nativeRevision: string) {
    const head = (await tx.scanEntries({ conversationId: parent, order: 'descending' }, 1)).items[0]?.id ?? null;
    return fingerprint({ parent, nativeRevision, run: (await tx.doc(LiveDoc, parent)).run ?? null, head });
  }
  const keyFor = (id: string) => `durable-pi:existing:${binding}:${id}`;
  async function protection(id: ConversationId) {
    const handle = await session.conversation(id, context); if (!handle) throw Error('CONTROL_TARGET_DENIED');
    const agent = await handle.agent(context), scope = await session.snapshot(JobScope, id, context);
    return { existing: agent.extensions.some(e => e.name === 'durable-pi.existing-input-policy'),
      scoped: scope?.sessionId === binding && scope.workspace === workspace && agent.extensions.some(e => e.name === GUARD_NAME),
      config: fingerprint(await session.snapshot(AgentDoc, id, context) ?? {}) };
  }
  async function inputReceipt(parent: ConversationId, id: string) {
    await session.commit(tx => authorize(tx, parent, 'read'), context);
    const value = await session.commit(tx => tx.submissionByRequest(parent, keyFor(id)), context);
    return { version: 2, controlId: id, action: 'existing-input', parentId: parent, requestId: keyFor(id), authority: 'delegated', source: 'iii',
      ...(value ? { submissionId: value.id, status: value.status, ...(value.status === 'done' ? { answerRef: `durable:${parent}:${value.answer}` } : {}) } : { status: 'admission-pending' }) };
  }
  async function execute(operation: ControlOperation, value: Json): Promise<unknown> {
    check(); const p = record(value), format = controlFormat(operation);
    if (Object.keys(p).some(k => !Object.hasOwn(format.properties, k)) || format.required.some(k => !Object.hasOwn(p, k))) throw Error('INVALID_CONTROL_FIELDS');
    const t = target(p.target), parent = parentId(t);
    if (operation === 'controls::inspect') {
      const inspected = await native.inspect(parent, childTarget(t));
      const run = (await session.snapshot(LiveDoc, parent, context))?.run ?? null;
      const head = await session.commit(async tx => (await tx.scanEntries({ conversationId: parent, order: 'descending' }, 1)).items[0]?.id ?? null, context);
      return { ...inspected, target: t, continuationRevision: fingerprint({ parent, nativeRevision: inspected.revision, run, head }), capabilities: {
        childControl: true, existingContinuation: t.type === 'conversation' && (host.controlPolicy?.().existing ?? []).includes(parent), scope: 'child-tree', humanAuthority: false } };
    }
    const id = requestKey(p.controlId), expectedRevision = string(p.expectedRevision, 64);
    const isInput = operation.startsWith('conversations::');
    if ((operation === 'subagents::spawn' || isInput) && t.type !== 'conversation') throw Error('CONVERSATION_TARGET_REQUIRED');
    if (['subagents::send','supervisor::reply'].includes(operation) && t.type !== 'execution') throw Error('EXACT_EXECUTION_REQUIRED');
    if (operation === 'subagents::stop' && t.type === 'conversation') throw Error('CHILD_TARGET_REQUIRED');
    let command: ParentCommand | undefined;
    if (!isInput) {
      const action = operation === 'subagents::spawn' ? 'spawn' : operation === 'subagents::send' ? 'send' : operation === 'subagents::stop' ? 'stop' : 'reply';
      command = { controlId: id, action, expectedRevision, ...(childTarget(t) ? { target: childTarget(t) } : {}),
        ...(action === 'spawn' ? { name: p.name as string, task: p.task as string, ...(p.tools === undefined ? {} : { tools: p.tools as string[] }) } : {}),
        ...(action === 'send' ? { task: p.task as string, followUp: p.mode === 'followUp' } : {}),
        ...(action === 'stop' ? { scope: p.scope as 'child-tree' } : {}),
        ...(action === 'reply' ? { replyTo: p.replyTo as string, message: p.message as string } : {}) };
      if (action === 'send' && p.mode !== 'followUp' && p.mode !== 'steer') throw Error('INVALID_INPUT_MODE');
      validateParentCommand(command);
    } else string(p.content, 32768);
    const grant = await session.commit(tx => authorize(tx, parent, isInput ? 'input' : command!.action), context);
    const digest = fingerprint({ operation, payload: value, policyReference: grant.policyReference });
    const existing = await session.snapshot(MachineCommands, binding, context);
    const previous = existing && Object.hasOwn(existing.commands, id) ? existing.commands[id] : undefined;
    if (previous && previous.fingerprint !== digest) throw Error('CONTROL_PAYLOAD_CONFLICT');
    if (isInput) {
      if (!previous && await session.commit(async tx => Object.values(await jobs(tx)).some(job => job.conversationId === parent), context)) throw Error('USE_JOB_FOLLOW_UP_OR_STEER');
      if (!await session.commit(tx => tx.submissionByRequest(parent, keyFor(id)), context) && !(await protection(parent)).existing) throw Error('EXISTING_INPUT_GUARD_REQUIRED');
    }
    let childConfig: string | undefined;
    if ((command?.action === 'send' || command?.action === 'reply') && !previous) {
      const guarded = await protection(t.conversationId as ConversationId);
      if (!guarded.existing && !guarded.scoped) throw Error('EXISTING_INPUT_GUARD_REQUIRED');
      childConfig = guarded.config;
    }
    const reserve = async (tx: Tx) => {
      if (childConfig && fingerprint(await tx.doc(AgentDoc, t.conversationId as ConversationId)) !== childConfig) throw Error('CONTROL_TARGET_CONFLICT');
      const current = await authorize(tx, parent, isInput ? 'input' : command!.action);
      if (current.policyReference !== grant.policyReference) throw Error('CONTROL_SCOPE_CHANGED');
      if (Object.hasOwn((await tx.doc(JobControls, binding, null)).commands, id)) throw Error('CONTROL_ID_CONFLICT');
      const index = await tx.doc(MachineCommands, binding, null);
      if (isInput && !await tx.submissionByRequest(parent, keyFor(id)) && await inputRevision(tx, parent, await parentRevision(tx, parent, current.policyReference)) !== expectedRevision) throw Error('CONTROL_TARGET_CONFLICT');
      if (Object.hasOwn(index.commands, id)) { if (index.commands[id].fingerprint !== digest) throw Error('CONTROL_PAYLOAD_CONFLICT'); return; }
      if (Object.keys(index.commands).length >= 1000) throw Error('CONTROL_INDEX_FULL');
      index.commands[id] = { parentId: parent, fingerprint: digest, kind: isInput ? 'input' : 'child', operation, payload: value };
      if (isInput) (await tx.doc(ExistingInputs, parent)).inputs[keyFor(id)] = { workspace, policy: grant.policyReference, tools: ['read'] };
      host.authorize(isInput ? 'write' : 'control');
    };
    if (!isInput) return native.execute(parent, command!, reserve);
    await session.commit(reserve, context);
    const canonical = await session.commit(tx => tx.submissionByRequest(parent, keyFor(id)), context);
    if (!canonical) {
      const conversation = await session.conversation(parent, context);
      if (!conversation) throw Error('EXISTING_CONVERSATION_MISSING');
      await controller.admit(conversation, keyFor(id), context);
      await session.commit(tx => authorize(tx, parent, 'input'), context);
      await conversation.submit({ type: 'input', content: p.content as string, requestId: keyFor(id), whenBusy: operation === 'conversations::steer' ? 'steer' : 'followUp',
        entry: { kind: 'durable-pi.delegated-existing', data: { source: 'iii', authority: 'delegated', binding, controlId: id, policyReference: grant.policyReference, fingerprint: digest } } }, context);
    }
    return inputReceipt(parent, id);
  }
  return {
    execute,
    async capabilities(value) {
      check(); const t = target(value), parent = parentId(t);
      try {
        const inspected = await native.inspect(parent, childTarget(t));
        const grant = await session.commit(tx => authorize(tx, parent, 'read'), context);
        const actions = t.type === 'conversation' && grant.jobId ? ['follow_up', 'steer', 'stop'] : [];
        let reason: string | undefined;
        try {
          await session.commit(tx => authorize(tx, parent, 'spawn'), context);
          if (t.type === 'conversation') {
            actions.push('subagents::spawn');
            if (!grant.jobId) {
              if ((await protection(parent)).existing) actions.push('conversations::follow_up', 'conversations::steer');
              else reason = 'EXISTING_INPUT_GUARD_REQUIRED';
            }
          } else {
            actions.push('subagents::stop');
            if (t.type === 'execution') {
              const guarded = await protection(t.conversationId as ConversationId);
              if (guarded.existing || guarded.scoped) {
                actions.push('subagents::send');
                const pending = Object.values((await session.snapshot(SupervisorDoc, parent, context))?.requests ?? {}).some(r => r.child === t.conversationId && r.execution === t.executionId && r.state === 'pending');
                if (pending) actions.push('supervisor::reply');
              } else reason = 'EXISTING_INPUT_GUARD_REQUIRED';
            }
          }
        } catch (error) { if (String(error).includes('JOB_CONTROL_FENCED')) reason = 'JOB_CONTROL_FENCED'; else throw error; }
        return { read: true, control: actions.length > 0, actions, scope: t.type === 'conversation' ? (grant.jobId ? 'job-tree' : 'owner-granted-conversation') : 'child-tree', revision: inspected.revision,
          ...(grant.jobId ? { jobId: grant.jobId } : {}), ...(reason ? { reason } : {}) };
      } catch (error) {
        const reason = String(error).replace(/^Error: /, '');
        if (['PARENT_CONTROL_DENIED', 'CONTROL_SCOPE_REVOKED', 'Subagent controls are parent-only', 'Parent control execution conflict', 'Parent control child identity conflict', 'Subagent parent binding is stale', 'Unknown or foreign child key'].includes(reason))
          return { read: true, control: false, actions: [], reason };
        throw error;
      }
    },
    async get(controlId) { check(); const id = requestKey(controlId), index = await session.snapshot(MachineCommands, binding, context);
      const command = index && Object.hasOwn(index.commands, id) ? index.commands[id] : undefined;
      if (!command || command.kind === 'recovery') return null;
      return command.kind === 'input' ? inputReceipt(command.parentId as ConversationId, id) : native.get(command.parentId as ConversationId, id);
    },
    async reconcile() {
      // Fence ALL accepted child/job stops before either public abort path can resume the native scheduler.
      const index = await session.snapshot(MachineCommands, binding, context);
      const parents = [...new Set(Object.values(index?.commands ?? {}).filter(c => c.kind !== 'recovery').map(c => c.parentId as ConversationId))];
      const pending = [] as ConversationId[];
      for (const parent of parents) for (const command of Object.values((await session.snapshot(ParentControlsDoc, parent, context))?.commands ?? {})) if (command.phase === 'pending' && command.target) pending.push(command.target.conversationId as ConversationId);
      const stops = await session.snapshot(JobControls, binding, context);
      pending.push(...Object.values(stops?.commands ?? {}).filter(c => !c.stopped).map(c => c.conversationId));
      const handles = await Promise.all([...new Set(pending)].map(async id => { const handle = await session.conversation(id, context); if (!handle) throw Error('CONTROL_RECOVERY_TARGET_MISSING'); return handle; }));
      await Promise.all(handles.map(handle => handle.abort(context, { background: true })));
      for (const parent of parents) await native.reconcile(parent);
    },
    close() {},
  };
}
