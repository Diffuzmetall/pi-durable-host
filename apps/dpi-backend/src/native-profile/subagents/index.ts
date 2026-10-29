import { clampThinkingLevel, Type } from '@earendil-works/pi-ai';
import type { Context } from '@earendil-works/chord';
import {
  AgentDoc, configure, defineExtension, defineTool, LiveDoc,
  type Extension, type ModelRef, type ToolExecutionApi, type ToolExecutionResult, type Tx,
} from '@earendil-works/pi-durable';
import { SubagentsDoc, type SubagentRecord } from './documents.js';
import { RequestsDoc, type RequestReceipt } from './requests.js';
import { courierFor, type SubagentOrigin } from './delivery.js';
import { Anchor, BACKGROUND, answerText, reporterFor, type SubagentAdmission } from './tasks.js';
import { TeamDoc, ChildBindingDoc, SupervisorDoc, foregroundFor, attentionFor, contactSupervisor, supervisorTool, requireParent, cancelRequests, childGuide } from './supervisor.js';
import { multicastTool } from './multicast.js';
import { savedAnswerText } from './reports.js';
import { admitChild, selectChildTools, ownedChild, childAdmission, createParentControl, PARENT_CONTROL, type ParentControlOwner } from './parent-control.js';
export { bindParentControl, PARENT_CONTROL_VERSION, validateParentCommand } from './parent-control.js';
export type { ParentControl, ParentAuthorize, ParentCommand, ParentTarget } from './parent-control.js';
export { TeamDoc, ChildBindingDoc, SupervisorDoc } from './supervisor.js';
export { SubagentsDoc } from './documents.js';
export type { SubagentRecord, PendingSubagentReport } from './documents.js';
export type { SubagentAdmission } from './tasks.js';
export { default } from './registry.js';
export { resolveAvailableModel } from './model-policy.js';

export type SubagentOptions = {
  maxActive?: number;
  /** Optional native host causal attribution; does not alter delegation permissions. */
  origin?: SubagentOrigin;
  /** Host-owned allowlists; explicit tools can only narrow these and the parent's callable tools. */
  roles?: Record<string, readonly string[] | 'inherit'>;
  /** Host policy must authorize the choice; membership in a catalog alone is not authorization. */
  resolveModel?: (selection: string, api: ToolExecutionApi, context: Context) => ModelRef | Promise<ModelRef>;
};
const text = (value: string) => ({ output: [{ type: 'text' as const, text: value }] });
const nullableString = Type.Union([Type.String(), Type.Null()]);
const StatusSchema = Type.Object({
  action: Type.Literal('status'), truncated: Type.Boolean(),
  agents: Type.Array(Type.Object({
    name: Type.String(), conversationId: Type.Number(), role: Type.String(),
    executionId: nullableString, requestId: nullableString, workState: Type.String(),
    pendingReplyTo: Type.Array(Type.String()),
    progress: Type.Union([Type.Null(), Type.Object({ executionId: Type.String(), message: Type.String(), stale: Type.Boolean() })]),
    result: Type.Union([Type.Null(), Type.Object({ text: Type.String(), answerRef: nullableString,
      correlation: Type.Union([Type.Literal('exact'), Type.Literal('legacy-unscoped')]) })]),
  })),
});
// Every successful subagent action shares the SDK contract, including foreground attention and stop.
const SubagentOutputSchema = Type.Union([StatusSchema,
  Type.Object({ action: Type.Union([Type.Literal('spawn'), Type.Literal('send')]), name: Type.String(),
    conversationId: Type.Number(), executionId: nullableString, requestId: Type.String(),
    status: Type.Union([Type.Literal('started'), Type.Literal('sent'), Type.Literal('done'), Type.Literal('needs_attention')]),
    replyTo: Type.Optional(Type.String()) }),
  Type.Object({ action: Type.Literal('stop'), name: Type.String() }),
]);

async function active(tx: Tx, record: SubagentRecord, requests: Record<string, RequestReceipt>): Promise<boolean> {
  if ((await tx.doc(LiveDoc, record.conversationId)).run !== undefined) return true;
  const ids = new Set([record.reporter ?? record.ownerTaskId,
    ...Object.values(requests).map(r => r.reporter ?? r.ownerTaskId)]);
  for (const id of ids) {
    const task = await tx.task(id);
    if (task !== undefined && task.state.status !== 'terminal') return true;
  }
  return false;
}

export function createSubagent(admit?: SubagentAdmission, options: SubagentOptions = {}): Extension {
  const maxActive = options.maxActive ?? 20;
  if (!Number.isSafeInteger(maxActive) || maxActive < 1) throw new Error('Invalid subagent admission limit');
  const Courier = courierFor(admit, options.origin);
  const admission = childAdmission();
  const Reporter = reporterFor(Courier, admit, options.origin, admission);
  const Attention = attentionFor(admit);
  const Contact = contactSupervisor(Attention);
  const Foreground = foregroundFor(Attention, admit, options.origin);
  const stop = async (name: string, api: ToolExecutionApi, context: Context) => {
    await requireParent(api, context);
    const record = await api.commit(async tx => {
      const state = await tx.doc(SubagentsDoc, api.conversationId);
      const found = Object.entries(state.agents).find(([, a]) => a.name === name);
      if (!found) throw new Error(`No subagent named ${name}`);
      await ownedChild(tx, api.conversationId, found[0]);
      const requests = await tx.doc(RequestsDoc, api.conversationId);
      await cancelRequests(tx, api.conversationId, found[1].conversationId);
      requests.stopped[found[1].requestId] = true;
      for (const receipt of Object.values(requests.requests)) {
        if (receipt.key === found[0]) { receipt.stopped = true; requests.stopped[receipt.requestId] = true; }
      }
      return { ...found[1] };
    }, context);
    const child = await api.conversation(record.conversationId, context);
    if (!child) throw new Error(`Subagent conversation unavailable: ${name}`);
    await child.abort(context, { background: true });
    return text(`Stopped ${name}.`);
  };
  const extension: Extension = defineExtension({
    name: 'subagent', tasks: [Anchor, Reporter, Courier, Attention, Foreground], sections: [childGuide],
    tools: [Contact, supervisorTool, multicastTool, defineTool({
      name: 'subagent_models', description: 'List current authenticated available child models, optionally for one provider. Use the exact provider/modelId with subagent.model. No login, catalog refresh or model execution.',
      parameters: Type.Object({ provider: Type.Optional(Type.String({ minLength: 1 })) }), replay: 'safe',
      execute: async (args, api, context) => {
        await requireParent(api, context);
        const models = await api.models.getAvailable(args.provider, { signal: context.abortSignal });
        return text(JSON.stringify(models.map(model => ({ provider: model.provider, modelId: model.id, name: model.name }))));
      },
    }), defineTool({
      name: 'subagent',
      description: 'Persistent isolated children: spawn (default; task or message), send (name, task/message; followUp queues, otherwise steers), status (one name or bounded all; name + exact native requestId selects a saved execution), stop (one name). Background by default; completion reports directly steer the parent at its next native processing boundary. Children cannot delegate.',
      parameters: Type.Object({
        action: Type.Optional(Type.Union([Type.Literal('spawn'), Type.Literal('send'), Type.Literal('status'), Type.Literal('stop')])),
        task: Type.Optional(Type.String({ minLength: 1 })),
        message: Type.Optional(Type.String({ minLength: 1 })),
        name: Type.Optional(Type.String({ minLength: 1, description: 'spawn: kebab-case, at most 64 characters; other actions also accept legacy generated names.' })),
        requestId: Type.Optional(Type.String({ minLength: 1, maxLength: 256, description: 'spawn/send: idempotency key (max 200 characters); status: exact native requestId from machine receipt, requires name.' })),
        background: Type.Optional(Type.Boolean()), role: Type.Optional(Type.String()),
        followUp: Type.Optional(Type.Boolean()), model: Type.Optional(Type.String({ minLength: 1, description: 'Exact provider/modelId from subagent_models; any authenticated available provider is admitted. Omit to inherit.' })),
        thinking: Type.Optional(Type.Union([Type.Literal('off'), Type.Literal('minimal'), Type.Literal('low'), Type.Literal('medium'), Type.Literal('high'), Type.Literal('xhigh')])),
        tools: Type.Optional(Type.Array(Type.String(), { uniqueItems: true })),
        beadIds: Type.Optional(Type.Array(Type.String({ minLength: 1, maxLength: 200 }), { maxItems: 100, uniqueItems: true })),
      }),
      structuredOutputSchema: SubagentOutputSchema,
      // One SDK replay policy covers every action: never replay a stop against newer work.
      replay: 'unsafe',
      execute: async (args, api, context): Promise<ToolExecutionResult> => {
        await requireParent(api, context);
        const action = args.action ?? 'spawn';
        if (action !== 'status' && args.requestId && args.requestId.length > 200) throw new Error('Subagent requestId exceeds 200 characters');
        if (action === 'stop') {
          if (!args.name) throw new Error('stop needs a name');
          return { ...await stop(args.name, api, context), structuredOutput: { action: 'stop', name: args.name } };
        }
        if (action === 'status') {
          if (args.requestId && !args.name) throw new Error('status requestId requires a name');
          const snapshot = await api.commit(async tx => {
            const state = await tx.doc(SubagentsDoc, api.conversationId);
            const requests = await tx.doc(RequestsDoc, api.conversationId);
            const team = await tx.doc(TeamDoc, api.conversationId);
            const supervisor = await tx.doc(SupervisorDoc, api.conversationId);
            const entries = Object.entries(state.agents).filter(([, r]) => args.name === undefined || args.name === r.name);
            let truncated = args.name === undefined && entries.length > 50;
            const rows = [];
            for (const [key, record] of entries.slice(0, args.name ? 1 : 50)) {
              const exists = await tx.conversation(record.conversationId);
              const binding = exists ? (await tx.doc(ChildBindingDoc, record.conversationId)).binding : undefined;
              if (exists && (exists.owner?.conversationId !== api.conversationId || exists.owner.taskId !== record.ownerTaskId ||
                  (binding && (binding.parent !== api.conversationId || binding.key !== key || binding.anchor !== record.ownerTaskId))))
                throw new Error('Subagent parent binding is stale');
              const executions = Object.entries(team.executions).filter(([, e]) => e.key === key && e.child === record.conversationId);
              const receipts = Object.entries(requests.requests).filter(([, r]) => r.key === key);
              // Task IDs are native numeric allocation identities. Reporter admission, not caller key
              // ordering or report arrival, selects the newest request (including a still-queued one).
              const latest = receipts.reduce<typeof receipts[number] | undefined>((best, item) =>
                !best || (item[1].reporter ?? item[1].ownerTaskId) > (best[1].reporter ?? best[1].ownerTaskId) ? item : best, undefined);
              const selected = args.requestId === undefined ? executions.find(([id]) => id === latest?.[0]) :
                executions.find(([, e]) => e.requestId === args.requestId);
              const legacy = executions.length === 0 && receipts.length === 0;
              if (args.requestId && !selected && !(legacy && args.requestId === record.requestId))
                throw new Error('Unknown or foreign subagent requestId');
              const [executionId, run] = selected ?? [null, undefined];
              if (run) {
                const receipt = requests.requests[executionId!];
                if (receipt && (receipt.key !== key || receipt.requestId !== run.requestId))
                  throw new Error('Subagent execution binding is stale');
              }
              const pending = Object.values(supervisor.requests).filter(r => r.child === record.conversationId && r.state === 'pending' &&
                r.execution === executionId && r.requestId === run?.requestId);
              const update = supervisor.progress[key];
              const submission = exists && (run || legacy) ? await tx.submissionByRequest(record.conversationId, run?.requestId ?? record.requestId) : undefined;
              const receipt = executionId === null ? undefined : requests.requests[executionId];
              const workState = !exists ? 'unknown' : run?.done || (legacy && submission?.status === 'done') ? 'settled' : pending.length ? 'awaiting_supervisor' :
                receipt?.stopped || (run && requests.stopped[run.requestId]) ? 'stopped' :
                submission?.status === 'unanswered' ? 'unanswered' : submission?.status === 'done' ? 'reporting' :
                submission?.status === 'placed' ? 'working' : run ? 'pending' : legacy ?
                  await active(tx, record, {}) ? 'working' : 'idle' : 'unknown';
              const saved = run?.done ?? (legacy && submission?.status === 'done' && submission.type === 'input' ?
                { answerRef: `durable:${record.conversationId}:${submission.answer}` } :
                legacy && record.report !== undefined ? { text: record.report } : undefined);
              // Inventory stays bounded. Named results resolve the actual canonical entry,
              // including legacy formatted executions with a real answer reference.
              const result = exists && args.name && saved ? { text: await savedAnswerText(tx, record.conversationId, saved),
                answerRef: ('answerRef' in saved ? saved.answerRef : undefined) ?? null,
                correlation: run ? 'exact' as const : 'legacy-unscoped' as const } : null;
              const maxPending = args.name ? pending.length : 100;
              if (pending.length > maxPending ||
                  (!args.name && update && update.message.length > 256)) truncated = true;
              rows.push({ name: record.name, conversationId: record.conversationId, role: record.role,
                executionId, requestId: run?.requestId ?? (legacy ? record.requestId : null), workState,
                pendingReplyTo: pending.slice(0, maxPending).map(r => r.id),
                label: workState === 'settled' ? 'idle' : workState === 'pending' &&
                  await active(tx, record, Object.fromEntries(receipts)) ? 'working' : workState,
                progress: update ? { executionId: update.execution, message: args.name ? update.message : update.message.slice(0, 256),
                  stale: update.execution !== executionId } : null, result });
            }
            return { action: 'status' as const, agents: rows, truncated };
          }, context);
          if (args.name && snapshot.agents.length === 0) throw new Error(`No subagent named ${args.name}`);
          const lines = [];
          for (const row of snapshot.agents) {
            const agent = await api.snapshot(AgentDoc, row.conversationId, context);
            const model = agent?.model ? `${agent.model.provider}/${agent.model.modelId}` : 'unknown';
            // Keep the concise human inventory; structured workState is per execution, not Courier activity.
            const label = row.label;
            lines.push(`${row.name}: ${label} (${row.role}, ${row.conversationId}) model=${model} thinking=${agent?.thinkingLevel ?? 'unknown'}${row.pendingReplyTo.length ? ` replyTo=${row.pendingReplyTo.join(',')}` : ''}${row.progress ? ` progress=${row.progress.stale ? '[stale] ' : ''}${row.progress.message}` : ''}`);
          }
          const answerRef = args.name ? snapshot.agents[0]?.result?.answerRef : undefined;
          return { ...text(args.name && snapshot.agents[0]?.result ? snapshot.agents[0].result.text : lines.length ? lines.join('\n') : 'No subagents.'),
            ...(answerRef ? { diagnostics: [{ severity: 'info' as const, message: `Canonical answer: ${answerRef}` }] } : {}), structuredOutput: { ...snapshot, agents: snapshot.agents.map(({ label: _label, ...row }) => row) } };
        }
        if (args.task !== undefined && args.message !== undefined && args.task !== args.message) throw new Error('task and message disagree');
        const task = args.task ?? args.message;
        if (!task?.trim()) throw new Error(`${action} needs task or message`);
        if (action === 'send' && !args.name) throw new Error('send needs a name');
        if (action === 'spawn' && args.name !== undefined && !/^[a-z][a-z0-9-]{0,63}$/.test(args.name))
          throw new Error('spawn name must be kebab-case, at most 64 characters');
        if (action === 'send' && (args.role !== undefined || args.model !== undefined || args.thinking !== undefined || args.tools !== undefined))
          throw new Error('role/model/thinking/tools are spawn-only');
        const key = `subagent:${args.requestId ?? api.taskId}`;
        const background = args.background !== false;
        const name = args.name ?? `child-${key}`;
        const role = args.role ?? 'worker';
        const followUp = action === 'send' && args.followUp === true;
        const parent = await api.agent(context);
        const tools = action === 'send' ? [] : selectChildTools(parent, role, args.tools, options.roles);
        let model: ModelRef | undefined;
        if (args.model !== undefined) {
          if (!options.resolveModel) throw new Error('Model selection requires a host resolveModel policy');
          model = await options.resolveModel(args.model, api, context);
          if (!api.models.getModel(model.provider, model.modelId)) throw new Error('Host-selected model is unavailable');
        }
        const ref = model ?? parent.model;
        const selected = ref && api.models.getModel(ref.provider, ref.modelId);
        if (args.thinking !== undefined && !selected) throw new Error('Thinking selection requires an available model');
        const thinkingLevel = selected && (args.thinking !== undefined || model !== undefined)
          ? clampThinkingLevel(selected, args.thinking ?? parent.thinkingLevel) : undefined;
        const beadIds = args.beadIds === undefined ? undefined : [...args.beadIds].sort();
        const selection = JSON.stringify({ model: args.model, thinking: args.thinking, tools: args.tools, beadIds });
        const admitted = await api.commit(tx => admitChild(tx, api.conversationId, api.taskId, {
          action, key, name, task, role, background, followUp, selection, tools, model: ref,
          thinkingLevel: thinkingLevel ?? parent.thinkingLevel, beadIds,
          requestId: `subagent-send:${args.requestId ?? api.taskId}`,
        }, { Reporter, Foreground, Contact }, maxActive), context);
        const record = admitted.record;
        const childConfig = await api.snapshot(AgentDoc, record.conversationId, context);
        const effectiveModel = childConfig?.model;
        const effectiveThinking = childConfig?.thinkingLevel;
        const receiptExecution = (await api.snapshot(TeamDoc, api.conversationId, context))?.executions[key];
        const machine = { action, name: record.name, conversationId: record.conversationId,
          executionId: receiptExecution ? key : null, requestId: admitted.requestId };
        await api.details({ conversationId: record.conversationId, name: record.name, background: admitted.background,
          executionId: machine.executionId, requestId: machine.requestId,
          ...(effectiveModel ? { effectiveModel } : {}), ...(effectiveThinking ? { effectiveThinking } : {}) }, context);
        if (admitted.background) return { structuredOutput: { ...machine, status: action === 'spawn' ? 'started' : 'sent' }, ...text(`${action === 'spawn' ? 'Started' : 'Sent to'} ${record.name}. model=${effectiveModel ? `${effectiveModel.provider}/${effectiveModel.modelId}` : 'unknown'} thinking=${effectiveThinking ?? 'unknown'}`) };
        const execution = (await api.snapshot(TeamDoc, api.conversationId, context))?.executions[key];
        if (execution) {
          const guard = execution.foreground!;
          const outcome = (await api.waitForTask(guard, context)).state.outcome;
          if (outcome.status !== 'completed') throw new Error(`Foreground wait ended: ${outcome.status}`);
          if (outcome.result.status === 'needs_attention') {
            await api.details({ conversationId: record.conversationId, name: record.name, status: 'needs_attention', replyTo: outcome.result.replyTo }, context);
            return { ...text(JSON.stringify({ status: 'needs_attention', name: record.name, conversationId: record.conversationId, replyTo: outcome.result.replyTo })),
              structuredOutput: { ...machine, status: 'needs_attention', replyTo: outcome.result.replyTo } };
          }
          // A pre-upgrade guard may already be terminal with formatted text. Resolve
          // the authoritative saved entry at the consumer, not by rerunning that guard.
          const fallback = outcome.result.text;
          const answer = await api.commit(async tx => {
            const saved = (await tx.doc(TeamDoc, api.conversationId)).executions[key]?.done;
            return saved?.answerRef === undefined ? { text: fallback } :
              { text: await savedAnswerText(tx, record.conversationId, saved), answerRef: saved.answerRef };
          }, context);
          return { ...text(answer.text), ...(answer.answerRef ? { diagnostics: [{ severity: 'info' as const, message: `Canonical answer: ${answer.answerRef}` }] } : {}),
            structuredOutput: { ...machine, status: 'done' } };
        }
        // Historical pre-team foreground receipt retains its original submission identity and output.
        const child = await api.conversation(record.conversationId, context);
        if (!child) throw new Error(`Subagent conversation unavailable: ${record.name}`);
        await admit?.(child, admitted.requestId, context);
        const stopped = await api.snapshot(RequestsDoc, api.conversationId, context);
        if (stopped?.stopped[admitted.requestId]) throw new Error('Subagent request stopped before submission');
        const submission = await child.submit({ type: 'input', content: task, requestId: admitted.requestId,
          ...(action === 'send' ? { whenBusy: followUp ? 'followUp' as const : 'steer' as const } : {}) }, context);
        const settled = await submission.wait(context);
        if (settled.status !== 'done' || settled.type !== 'input') throw new Error(`Subagent failed: ${settled.status}`);
        const answer = await answerText(api, settled.answer, context);
        if (action === 'spawn') await api.commit(async tx => { (await tx.doc(SubagentsDoc, api.conversationId)).agents[key]!.settled = true; }, context);
        return { ...text(answer), diagnostics: [{ severity: 'info', message: `Canonical answer: durable:${child.id}:${settled.answer}` }], structuredOutput: { ...machine, status: 'done' } };
      },
    }), defineTool({
      name: 'subagent_stop', description: 'Stop only the named child owned by this conversation, not its siblings.',
      parameters: Type.Object({ name: Type.String() }), replay: 'unsafe',
      execute: (args, api, context) => stop(args.name, api, context),
    }), defineTool({
      name: 'subagent_release_hold', description: 'Explicitly release an admission-held report batch; uncertain outcomes cannot be released.',
      parameters: Type.Object({}), replay: 'unsafe',
      execute: async (_args, api, context) => {
        await requireParent(api, context);
        const hold = await api.commit(async tx => {
          const state = await tx.doc(SubagentsDoc, api.conversationId);
          const held = state.deliveryHold;
          if (!held) throw new Error('No subagent delivery hold is active');
          if (held.kind !== 'admission') throw new Error(`Delivery outcome is uncertain; inspect the parent transcript before retrying: ${held.reason}`);
          const result = { ...held }; delete state.deliveryHold; return result;
        }, context);
        return text(`Released batch ${hold.requestId}; previous hold: ${hold.reason}`);
      },
    })],
  });
  Object.defineProperty(extension, PARENT_CONTROL, { value: ((session, context, authorize) => {
    if (!admit) throw new Error('Machine parent control requires the host admission callback');
    return createParentControl(session, context, authorize, extension, { Reporter, Foreground, Contact }, admission, admit, { maxActive, roles: options.roles });
  }) satisfies NonNullable<ParentControlOwner[typeof PARENT_CONTROL]> });
  return extension;
}
export const Subagent: Extension = createSubagent();
