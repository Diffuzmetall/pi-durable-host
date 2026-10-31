// Owner seam native-parent-control/v1. Keep the upgrade contract in the iii worker documentation.
import { createHash } from 'node:crypto';
import { copyJson, type Context, type JsonValue } from '@earendil-works/chord';
import { AgentDoc, configure, defineDoc, type Agent, type ConversationId, type Extension, type Harness,
  type ModelRef, type TaskId, type Tx } from '@earendil-works/pi-durable';
import { SubagentsDoc, type SubagentRecord } from './documents.js';
import { RequestsDoc, type RequestReceipt } from './requests.js';
import { Anchor, BACKGROUND, type reporterFor, type SubagentAdmission } from './tasks.js';
import { TeamDoc, ChildBindingDoc, SupervisorDoc, cancelRequests, answerSupervisor,
  type foregroundFor, type contactSupervisor } from './supervisor.js';

export const PARENT_CONTROL_VERSION = 'native-parent-control/v1';
export const PARENT_CONTROL = Symbol.for('pi.durable.subagents.parent-control.v1');
const controlTools = new Set(['subagent', 'subagent_stop', 'subagent_release_hold', 'subagent_supervisor', 'subagent_send_many', 'contact_supervisor', 'subagent_models']);
export type Roles = Record<string, readonly string[] | 'inherit'>;
export type ChildDefinitions = { Reporter: ReturnType<typeof reporterFor>; Foreground: ReturnType<typeof foregroundFor>; Contact: ReturnType<typeof contactSupervisor> };
export type ChildPlan = { action: 'spawn' | 'send'; key: string; targetKey?: string; name: string; task: string; role: string; background: boolean; followUp: boolean;
  selection: string; tools: Agent['tools']; model?: ModelRef; thinkingLevel: Agent['thinkingLevel']; beadIds?: string[]; requestId: string };
export type ParentTarget = { key: string; conversationId: number; executionId?: string; requestId?: string };
export type ParentAction = 'spawn' | 'send' | 'stop' | 'reply';
export type ParentGrant = { binding: string; policyReference: string; tools: readonly string[];
  /** Synchronous owner checkpoint after awaited admission work, before the native transaction commits. */
  assertCurrent?: () => void;
  /** Trusted owner selection for NEW sends only; canonical prior receipts always win. */
  inputRequestId?: (controlId: string) => string | undefined;
  /** Trusted owner hook for each delegated input. May configure docs, not read tables after task/child creation. */
  prepareChild?: (tx: Tx, child: ConversationId, input: { requestId: string; created: boolean }) => Promise<void> };
/** Trusted host callback. Evaluate grants and canonical job mapping through THIS transaction, never Session reads. */
export type ParentAuthorize = (tx: Tx, parent: ConversationId, action: ParentAction | 'read') => Promise<ParentGrant>;
export type ParentCommand = { controlId: string; action: ParentAction; expectedRevision: string; target?: ParentTarget;
  name?: string; task?: string; tools?: string[]; followUp?: boolean; replyTo?: string; message?: string; scope?: 'child-tree' };
type SavedCommand = { fingerprint: string; phase: 'admitted' | 'pending' | 'stopped'; target?: ParentTarget; barrier?: TaskId; receipt: JsonValue };
export const ParentControlsDoc = defineDoc<{ fences: Record<string, { barrier: TaskId; phase: 'requested' | 'stopped' | 'open' }>;
  commands: Record<string, SavedCommand> }>({ kind: 'bb.subagent-parent-controls', version: 1, scope: 'conversation', history: 'latest', fork: 'initial', checkpointWhen: () => false,
  initial: () => ({ fences: {}, commands: {} }) });
const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)])) : value;
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');

export function selectChildTools(parent: Agent, role: string, requested?: readonly string[], roles?: Roles): Agent['tools'] {
  if (role === 'general') throw Error('New general spawns are disabled; use worker');
  const available = [...new Map([...parent.tools, ...parent.callable].filter(t => !controlTools.has(t.name)).map(t => [t.name, t])).values()];
  const policy = roles ?? { worker: 'inherit', reviewer: ['read'].filter(n => available.some(t => t.name === n)) };
  const allowed = Object.hasOwn(policy, role) ? policy[role] : undefined;
  if (allowed === undefined) throw Error(`Role not allowed: ${role}`);
  return (requested ?? (allowed === 'inherit' ? available.map(t => t.name) : allowed)).map(name => {
    const tool = available.find(t => t.name === name);
    if (!tool || (allowed !== 'inherit' && !allowed.includes(name))) throw Error(`Role tool unavailable: ${name}`);
    return tool;
  });
}
export async function ownedChild(tx: Tx, parent: ConversationId, key: string): Promise<SubagentRecord> {
  const agents = await tx.doc(SubagentsDoc, parent);
  const record = Object.hasOwn(agents.agents, key) ? agents.agents[key] : undefined;
  if (!record) throw Error('Unknown or foreign child key');
  const actual = await tx.conversation(record.conversationId);
  const binding = (await tx.doc(ChildBindingDoc, record.conversationId)).binding;
  if (!actual || actual.owner?.conversationId !== parent || actual.owner.taskId !== record.ownerTaskId ||
      binding?.parent !== parent || binding.key !== key || binding.anchor !== record.ownerTaskId) throw Error('Subagent parent binding is stale');
  return { ...record };
}
async function exactChild(tx: Tx, parent: ConversationId, target: ParentTarget): Promise<SubagentRecord> {
  const record = await ownedChild(tx, parent, target.key);
  if (record.conversationId !== target.conversationId) throw Error('Parent control child identity conflict');
  if (target.executionId) {
    const run = (await tx.doc(TeamDoc, parent)).executions[target.executionId];
    if (!run || run.key !== target.key || run.child !== target.conversationId || run.requestId !== target.requestId) throw Error('Parent control execution conflict');
  }
  return record;
}
async function active(tx: Tx, record: SubagentRecord, requests: Record<string, RequestReceipt>): Promise<boolean> {
  // Reporter/anchor activity includes queued input before the child has a live run.
  const { LiveDoc } = await import('@earendil-works/pi-durable');
  if ((await tx.doc(LiveDoc, record.conversationId)).run !== undefined) return true;
  for (const id of new Set([record.reporter ?? record.ownerTaskId, ...Object.values(requests).map(r => r.reporter ?? r.ownerTaskId)])) {
    const task = await tx.task(id); if (task && task.state.status !== 'terminal') return true;
  }
  return false;
}
/** Same native admission transaction for model tools and the owner capability. No ToolExecutionApi is fabricated. */
export async function admitChild(tx: Tx, parent: ConversationId, originTask: TaskId | undefined, plan: ChildPlan, definitions: ChildDefinitions, maxActive: number, prepareChild?: ParentGrant['prepareChild']) {
  if ((await tx.doc(ChildBindingDoc, parent)).binding) throw Error('Subagent controls are parent-only');
  const state = await tx.doc(SubagentsDoc, parent), receipts = await tx.doc(RequestsDoc, parent);
  const previous = Object.hasOwn(receipts.requests, plan.key) ? receipts.requests[plan.key] : undefined;
  const entry = plan.action === 'spawn' ? (Object.hasOwn(state.agents, plan.key) ? [plan.key, state.agents[plan.key]] as const : undefined)
    : plan.targetKey === undefined ? Object.entries(state.agents).find(([, a]) => a.name === plan.name)
    : Object.hasOwn(state.agents, plan.targetKey) ? [plan.targetKey, state.agents[plan.targetKey]] as const : undefined;
  if (plan.action === 'send' && !entry) throw Error(`No subagent named ${plan.name}`);
  if (previous && (previous.action !== plan.action || previous.task !== plan.task || previous.background !== plan.background || previous.followUp !== plan.followUp || previous.selection !== plan.selection || previous.key !== entry?.[0])) throw Error('Subagent requestId conflicts with its original admission');
  if (plan.action === 'spawn' && entry) {
    const existing = entry[1];
    if (existing.name !== plan.name || existing.task !== plan.task || existing.role !== plan.role || existing.background !== plan.background || (!previous && plan.selection !== '{}')) throw Error('Subagent requestId conflicts with its original admission');
    return { key: entry[0], record: { ...existing }, requestId: existing.requestId, background: existing.background };
  }
  if (previous && entry) return { key: entry[0], record: { ...entry[1] }, requestId: previous.requestId, background: previous.background };
  if (plan.action === 'spawn' && Object.values(state.agents).some(a => a.name === plan.name)) throw Error(`Subagent name already exists: ${plan.name}; use send`);
  if (entry) {
    await ownedChild(tx, parent, entry[0]);
    const fences = (await tx.doc(ParentControlsDoc, parent)).fences;
    const fence = Object.hasOwn(fences, entry[0]) ? fences[entry[0]] : undefined;
    if (fence && (fence.phase === 'requested' || (originTask !== undefined && originTask <= fence.barrier))) throw Error('Child admission fenced by stop');
    if (fence?.phase === 'stopped') fence.phase = 'open';
  }
  let count = 0;
  for (const [key, record] of Object.entries(state.agents)) if (await active(tx, record, Object.fromEntries(Object.entries(receipts.requests).filter(([, r]) => r.key === key)))) count++;
  const targetActive = entry && await active(tx, entry[1], Object.fromEntries(Object.entries(receipts.requests).filter(([, r]) => r.key === entry[0])));
  if (!targetActive && count >= maxActive) throw Error('Subagent admission limit reached');
  // Native table reads must precede the first table write in this transaction.
  const commandTask = originTask ?? await tx.createTask(Anchor, null, BACKGROUND);
  let record: SubagentRecord;
  if (entry) record = { ...entry[1] };
  else {
    const owner = await tx.createTask(Anchor, null, BACKGROUND);
    const child = await tx.createConversation({ ownership: { kind: 'task', taskId: owner } });
    await configure(tx, child.id, { tools: [...plan.tools, definitions.Contact], ...(plan.model ? { model: plan.model } : {}), thinkingLevel: plan.thinkingLevel });
    record = { name: plan.name, conversationId: child.id, requestId: `subagent:${owner}`, task: plan.task, role: plan.role, ownerTaskId: owner, background: plan.background };
    state.agents[plan.key] = record;
    (await tx.doc(ChildBindingDoc, child.id)).binding = { parent, key: plan.key, anchor: owner };
    (await tx.doc(TeamDoc, parent)).members.push(plan.key);
  }
  const key = entry?.[0] ?? plan.key;
  const requestId = plan.action === 'spawn' ? record.requestId : plan.requestId;
  await prepareChild?.(tx, record.conversationId, { requestId, created: !entry });
  const receipt: RequestReceipt = { action: plan.action, key, task: plan.task, background: plan.background, followUp: plan.followUp, selection: plan.selection, requestId, ownerTaskId: commandTask };
  const team = await tx.doc(TeamDoc, parent);
  team.executions[plan.key] = { child: record.conversationId, key, requestId, background: plan.background, ...(plan.beadIds === undefined ? {} : { beadIds: plan.beadIds }) };
  if (!plan.background) team.executions[plan.key].foreground = await tx.createTask(definitions.Foreground, { execution: plan.key, child: record.conversationId }, { ownership: { kind: 'task', taskId: commandTask }, abandonOnRestart: true });
  receipt.reporter = await tx.createTask(definitions.Reporter, { key, execution: plan.key, conversationId: record.conversationId, requestId, task: plan.task,
    ...(plan.action === 'send' ? { whenBusy: plan.followUp ? 'followUp' as const : 'steer' as const } : {}) }, BACKGROUND);
  if (plan.action === 'spawn') state.agents[plan.key].reporter = receipt.reporter;
  receipts.requests[plan.key] = receipt;
  return { key, record, requestId, background: plan.background };
}

/** Per-extension admission lane, not a scheduler/store. The durable fence is always checked INSIDE it. */
export function childAdmission() {
  const lanes = new Map<string, Promise<unknown>>();
  function withChild<T>(parent: ConversationId, key: string, fn: () => Promise<T>): Promise<T> {
    const id = JSON.stringify([parent, key]);
    const next = (lanes.get(id) ?? Promise.resolve()).then(fn);
    const settled = next.then(() => {}, () => {}); lanes.set(id, settled);
    void settled.then(() => { if (lanes.get(id) === settled) lanes.delete(id); });
    return next;
  }
  return { withChild, async submit<T>(parent: ConversationId, key: string, task: TaskId, snapshot: () => Promise<Readonly<{ fences: Record<string, { barrier: TaskId; phase: string }> }> | null | undefined>, send: () => Promise<T>): Promise<T> {
    return withChild(parent, key, async () => {
      const state = await snapshot();
      const fence = state && Object.hasOwn(state.fences, key) ? state.fences[key] : undefined;
      if (fence && (fence.phase !== 'open' || task <= fence.barrier)) throw Error('Subagent request fenced before submission');
      return send();
    });
  } };
}
function revision(parent: ConversationId, agents: Readonly<Record<string, Pick<SubagentRecord, 'conversationId' | 'ownerTaskId'>>>,
  executions: Readonly<Record<string, { key: string; child: ConversationId; requestId: string }>>, fences: unknown) {
  return digest({ parent, agents: Object.entries(agents).map(([key, r]) => [key, r.conversationId, r.ownerTaskId]),
    executions: Object.entries(executions).map(([key, r]) => [key, r.key, r.child, r.requestId]), fences });
}
export async function parentRevision(tx: Tx, parent: ConversationId, policyReference: string): Promise<string> {
  return digest({ native: revision(parent, (await tx.doc(SubagentsDoc, parent)).agents, (await tx.doc(TeamDoc, parent)).executions, (await tx.doc(ParentControlsDoc, parent)).fences),
    agent: await tx.doc(AgentDoc, parent), policy: policyReference });
}
export function validateParentTarget(value: unknown, requireExecution = false): asserts value is ParentTarget {
  const t = value as ParentTarget;
  if (!t || typeof t !== 'object' || Array.isArray(t) || Object.keys(t).some(k => !['key','conversationId','executionId','requestId'].includes(k)) || typeof t.key !== 'string' || !t.key || t.key.length > 512 || !Number.isSafeInteger(t.conversationId) || t.conversationId < 1) throw Error('Exact child target required');
  if ((t.executionId !== undefined || t.requestId !== undefined || requireExecution) &&
    (typeof t.executionId !== 'string' || !t.executionId || t.executionId.length > 512 || typeof t.requestId !== 'string' || !t.requestId || t.requestId.length > 512)) throw Error('Exact child execution required');
}
export function validateParentCommand(value: ParentCommand): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Invalid parent command');
  if (!['spawn','send','stop','reply'].includes(value.action) || typeof value.controlId !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,199}$/.test(value.controlId) || typeof value.expectedRevision !== 'string' || !/^[a-f0-9]{64}$/.test(value.expectedRevision)) throw Error('Invalid parent command identity');
  const fields = { spawn: ['name','task','tools'], send: ['target','task','followUp'], stop: ['target','scope'], reply: ['target','replyTo','message'] }[value.action];
  if (Object.keys(value).some(k => !['controlId','action','expectedRevision',...fields].includes(k))) throw Error('Invalid parent command fields');
  if (value.followUp !== undefined && typeof value.followUp !== 'boolean') throw Error('Invalid followUp');
  if ((value.action === 'spawn' || value.action === 'send') && (typeof value.task !== 'string' || !value.task.trim() || value.task.length > 65536)) throw Error('Invalid child task');
  if (value.action === 'spawn' && (typeof value.name !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(value.name))) throw Error('Invalid child name');
  if (value.action !== 'spawn') validateParentTarget(value.target, value.action !== 'stop');
  if (value.tools !== undefined && (!Array.isArray(value.tools) || value.tools.some(t => typeof t !== 'string') || new Set(value.tools).size !== value.tools.length)) throw Error('Invalid child tools');
  if (value.action === 'stop' && value.scope !== 'child-tree') throw Error('Explicit child-tree stop scope required');
  if (value.action === 'reply' && (typeof value.replyTo !== 'string' || !value.replyTo || typeof value.message !== 'string' || !value.message.trim() || value.message.length > 32768)) throw Error('Invalid supervisor reply');
}

export function createParentControl(session: Harness, context: Context, authorize: ParentAuthorize, extension: Extension,
  definitions: ChildDefinitions, admission: ReturnType<typeof childAdmission>, admit: SubagentAdmission, options: { maxActive: number; roles?: Roles }) {
  async function parent(id: ConversationId) {
    const handle = await session.conversation(id, context);
    if (!handle || !(await handle.agent(context)).extensions.includes(extension)) throw Error('Parent control owner mismatch');
    return handle;
  }
  async function granted(tx: Tx, id: ConversationId, action: ParentAction | 'read') {
    if ((await tx.doc(ChildBindingDoc, id)).binding || !await tx.conversation(id)) throw Error('Subagent controls are parent-only');
    const grant = await authorize(tx, id, action);
    if (!grant?.binding || !grant.policyReference || !Array.isArray(grant.tools)) throw Error('Parent control denied');
    return grant;
  }
  async function finishStops(id: ConversationId, commandKeys: string[]): Promise<void> {
    const handle = await parent(id);
    const initial = await session.snapshot(ParentControlsDoc, id, context);
    const childKeys = [...new Set(commandKeys.map(key => initial?.commands[key]?.target?.key).filter((key): key is string => key !== undefined))].sort();
    async function finish() {
      // A duplicate finisher must reread AFTER acquiring the lane, never abort a newer execution on stale intent.
      const commands = await handle.commit(async tx => {
        const doc = await tx.doc(ParentControlsDoc, id), rows = [];
        for (const key of commandKeys) {
          const command = doc.commands[key];
          if (!command || command.phase !== 'pending') continue;
          const target = command.target!, record = await ownedChild(tx, id, target.key);
          if (record.conversationId !== target.conversationId || doc.fences[target.key]?.barrier !== command.barrier) throw Error('Stop target generation conflict');
          rows.push({ key, target: { ...target }, barrier: command.barrier });
        }
        return rows;
      }, context);
      const children = await Promise.all(commands.map(async command => {
        const child = await session.conversation(command.target.conversationId as ConversationId, context);
        if (!child) throw Error('Child unavailable'); return child;
      }));
      // Native abort resumes scheduling. Queue ALL accepted recovery marks before awaiting any of them (U4 invariant).
      await Promise.all(children.map(child => child.abort(context, { background: true })));
      await handle.commit(async tx => {
        const doc = await tx.doc(ParentControlsDoc, id);
        for (const { key, target, barrier } of commands) {
          await ownedChild(tx, id, target.key);
          if (doc.fences[target.key]?.barrier !== barrier) throw Error('Stop target generation conflict');
          doc.fences[target.key].phase = 'stopped'; doc.commands[key].phase = 'stopped';
          doc.commands[key].receipt = { ...(doc.commands[key].receipt as object), stopped: true } as JsonValue;
        }
      }, context);
    }
    async function lock(index: number): Promise<void> {
      if (index === childKeys.length) return finish();
      return admission.withChild(id, childKeys[index], () => lock(index + 1));
    }
    await lock(0);
  }
  return {
    version: PARENT_CONTROL_VERSION,
    async inspect(id: ConversationId, target?: ParentTarget) {
      const handle = await parent(id);
      if ((await session.snapshot(ChildBindingDoc, id, context))?.binding) throw Error('Subagent controls are parent-only');
      const grant = await handle.commit(async tx => { const scope = await authorize(tx, id, 'read'); if (target) await exactChild(tx, id, target); return scope; }, context);
      if (!grant?.binding || !grant.policyReference || !Array.isArray(grant.tools)) throw Error('Parent control denied');
      // Discovery never materializes empty per-parent documents. Mutations recompute this revision transactionally.
      const agents = await session.snapshot(SubagentsDoc, id, context), team = await session.snapshot(TeamDoc, id, context);
      const controls = await session.snapshot(ParentControlsDoc, id, context), agent = await session.snapshot(AgentDoc, id, context);
      return { parentId: id, revision: digest({ native: revision(id, agents?.agents ?? {}, team?.executions ?? {}, controls?.fences ?? {}), agent: agent ?? {}, policy: grant.policyReference }) };
    },
    async execute(id: ConversationId, value: ParentCommand, beforeAdmission?: (tx: Tx) => Promise<void>): Promise<JsonValue> {
      validateParentCommand(value); const handle = await parent(id);
      const agent = await handle.agent(context), config = await session.snapshot(AgentDoc, id, context);
      const result = await handle.commit(async tx => {
        const grant = await granted(tx, id, value.action), commandKey = JSON.stringify([grant.binding, value.controlId]);
        const doc = await tx.doc(ParentControlsDoc, id), fingerprint = digest({ value, policyReference: grant.policyReference });
        const previous = Object.hasOwn(doc.commands, commandKey) ? doc.commands[commandKey] : undefined;
        if (previous) { if (previous.fingerprint !== fingerprint) throw Error('Parent control payload conflicts'); await beforeAdmission?.(tx); grant.assertCurrent?.(); return { key: commandKey, phase: previous.phase, receipt: copyJson(previous.receipt) }; }
        if (await parentRevision(tx, id, grant.policyReference) !== value.expectedRevision || digest(await tx.doc(AgentDoc, id)) !== digest(config)) throw Error('Parent control target revision conflict');
        let target = value.target;
        let record: SubagentRecord | undefined;
        if (target) record = await exactChild(tx, id, target);
        if (Object.keys(doc.commands).length >= 1000) throw Error('Parent control index full');
        await beforeAdmission?.(tx);
        let receipt: JsonValue;
        if (value.action === 'spawn' || value.action === 'send') {
          const tools = value.tools ?? [...grant.tools];
          if (tools.some(t => !grant.tools.includes(t))) throw Error('Parent control tool denied');
          const key = `subagent:control:${grant.binding}:${value.controlId}`;
          const selectedRequestId = value.action === 'send' ? grant.inputRequestId?.(value.controlId) : undefined;
          const requestId = selectedRequestId ?? `subagent-send:control:${grant.binding}:${value.controlId}`;
          const admitted = await admitChild(tx, id, undefined, { action: value.action, key, ...(target ? { targetKey: target.key } : {}), name: record?.name ?? value.name!, task: value.task!, role: 'worker', background: true,
            followUp: value.followUp === true, selection: JSON.stringify({ tools }), tools: selectChildTools(agent, 'worker', tools, options.roles), model: agent.model,
            thinkingLevel: agent.thinkingLevel, requestId }, definitions, options.maxActive, grant.prepareChild);
          receipt = { version: PARENT_CONTROL_VERSION, controlId: value.controlId, action: value.action, parentId: id, conversationId: admitted.record.conversationId,
            childKey: admitted.key, executionId: key, requestId: admitted.requestId, ...(target?.executionId ? { priorExecutionId: target.executionId } : {}), admitted: true,
            ...(selectedRequestId !== undefined ? { retryContext: { expectedRevision: value.expectedRevision,
              target: { key: target!.key, conversationId: target!.conversationId, executionId: target!.executionId!, requestId: target!.requestId! } } } : {}) };
        } else if (value.action === 'reply') {
          const question = (await tx.doc(SupervisorDoc, id)).requests[value.replyTo!];
          if (!question || question.child !== target!.conversationId || (target!.executionId && question.execution !== target!.executionId)) throw Error('Foreign supervisor replyTo');
          await grant.prepareChild?.(tx, target!.conversationId as ConversationId, { requestId: target!.requestId!, created: false });
          await answerSupervisor(tx, id, value.replyTo!, value.message!);
          receipt = { version: PARENT_CONTROL_VERSION, controlId: value.controlId, action: 'reply', parentId: id, replyTo: value.replyTo!, admitted: true };
        } else {
          const fences = doc.fences;
          if (Object.hasOwn(fences, target!.key) && fences[target!.key].phase === 'requested') throw Error('Child stop in progress');
          const barrier = await tx.createTask(Anchor, null, BACKGROUND);
          fences[target!.key] = { barrier, phase: 'requested' };
          await cancelRequests(tx, id, record!.conversationId);
          const requests = await tx.doc(RequestsDoc, id);
          requests.stopped[record!.requestId] = true;
          for (const r of Object.values(requests.requests)) if (r.key === target!.key) { r.stopped = true; requests.stopped[r.requestId] = true; }
          receipt = { version: PARENT_CONTROL_VERSION, controlId: value.controlId, action: 'stop', parentId: id, conversationId: record!.conversationId, scope: 'child-tree', stopped: false };
        }
        doc.commands[commandKey] = { fingerprint, phase: value.action === 'stop' ? 'pending' : 'admitted', ...(target ? { target } : {}),
          ...(value.action === 'stop' ? { barrier: doc.fences[target!.key].barrier } : {}), receipt };
        grant.assertCurrent?.();
        return { key: commandKey, phase: doc.commands[commandKey].phase, receipt: copyJson(doc.commands[commandKey].receipt) };
      }, context);
      // Progress enables native scheduling only AFTER atomic admission/receipt commit. Reporter uses the real host callback.
      if (result.phase === 'pending') {
        await finishStops(id, [result.key]);
        return handle.commit(async tx => { await granted(tx, id, value.action); return copyJson((await tx.doc(ParentControlsDoc, id)).commands[result.key].receipt); }, context);
      }
      session.resume(); return result.receipt;
    },
    async get(id: ConversationId, controlId: string) { const handle = await parent(id); return handle.commit(async tx => { const grant = await granted(tx, id, 'read');
      const key = JSON.stringify([grant.binding, controlId]), doc = await tx.doc(ParentControlsDoc, id);
      return Object.hasOwn(doc.commands, key) ? copyJson(doc.commands[key].receipt) : null; }, context); },
    async reconcile(id: ConversationId) { const doc = await session.snapshot(ParentControlsDoc, id, context);
      await finishStops(id, Object.entries(doc?.commands ?? {}).filter(([, command]) => command.phase === 'pending').map(([key]) => key));
    },
  };
}
export type ParentControl = ReturnType<typeof createParentControl>;
export type ParentControlOwner = Extension & { [PARENT_CONTROL]?: (session: Harness, context: Context, authorize: ParentAuthorize) => ParentControl };
export function bindParentControl(extension: Extension, session: Harness, context: Context, authorize: ParentAuthorize): ParentControl {
  const bind = (extension as ParentControlOwner)[PARENT_CONTROL];
  if (!bind) throw Error('Native parent control capability missing/incompatible');
  return bind(session, context, authorize);
}
