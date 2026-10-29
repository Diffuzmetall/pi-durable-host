import type { ConversationId, Harness } from '@earendil-works/pi-durable';
import type { Context } from '@earendil-works/chord';
import { SubagentsDoc } from '../subagents/documents.js';
import { TeamDoc, SupervisorDoc, ChildBindingDoc } from '../subagents/supervisor.js';
import type { RuntimeTask, Subagent } from './domain.js';

/** Inventory uses native ownership, never caller-provided child names or task IDs. */
export function ownedInventory(session: Harness, roots: () => Promise<ConversationId[]>, context: Context, check: () => void) {
  async function owned(candidate: ConversationId, allowed: Set<ConversationId>, cache: Map<ConversationId, boolean>, seen = new Set<ConversationId>()): Promise<boolean> {
    if (allowed.has(candidate)) return true;
    if (cache.has(candidate)) return cache.get(candidate)!;
    if (seen.has(candidate)) return false;
    seen.add(candidate);
    const binding = (await session.snapshot(ChildBindingDoc, candidate, context))?.binding;
    let valid = false;
    if (binding) {
      const actual = await session.commit(tx => tx.conversation(candidate), context);
      const parent = await session.snapshot(SubagentsDoc, binding.parent, context);
      const record = parent?.agents[binding.key];
      valid = actual?.owner?.conversationId === binding.parent && actual.owner.taskId === binding.anchor
        && record?.conversationId === candidate && record.ownerTaskId === binding.anchor
        && await owned(binding.parent, allowed, cache, seen);
    }
    cache.set(candidate, valid);
    return valid;
  }
  return {
    async tasks(): Promise<RuntimeTask[]> {
      check();
      const allowed = new Set(await roots()), cache = new Map<ConversationId, boolean>();
      const inspection = await session.inspect(context);
      const result: RuntimeTask[] = [];
      for (const { record: r, state } of inspection.tasks) {
        if (!await owned(r.conversationId, allowed, cache)) continue;
        let owner = r.owner;
        if (owner !== undefined) {
          const task = await session.getTask(owner, context);
          if (!task || !await owned(task.conversationId, allowed, cache)) owner = undefined;
        }
        result.push({ id: r.id, conversationId: r.conversationId, kind: r.kind, status: r.state.status, scheduling: state.kind,
          ...(owner === undefined ? {} : { owner }), background: r.background, abortRequested: r.abortRequested });
        if (result.length === 512) break;
      }
      return result;
    },
    async subagents(): Promise<Subagent[]> {
      check();
      const active = new Set((await session.inspect(context)).tasks.map(t => t.record.conversationId));
      const result: Subagent[] = [];
      for (const id of await roots()) {
        const [agents, team, supervisor] = await Promise.all([
          session.snapshot(SubagentsDoc, id, context), session.snapshot(TeamDoc, id, context), session.snapshot(SupervisorDoc, id, context),
        ]);
        for (const [key, agent] of Object.entries(agents?.agents ?? {})) {
          result.push({ key, name: agent.name, conversationId: agent.conversationId, role: agent.role, background: agent.background, settled: agent.settled === true,
            activity: Object.values(supervisor?.requests ?? {}).some(r => r.child === agent.conversationId && r.state === 'pending') ? 'waiting'
              : active.has(agent.conversationId) ? 'active' : 'idle',
            hasReport: !!agent.report, hasProgress: !!supervisor?.progress[String(agent.conversationId)],
            executions: Object.entries(team?.executions ?? {}).filter(([, e]) => e.key === key).slice(-64).map(([key, e]) => ({ key,
              requestId: e.requestId, answered: !!e.done, ...(e.done?.answerRef === undefined ? {} : { answerRef: e.done.answerRef }) })),
            waiting: Object.values(supervisor?.requests ?? {}).filter(r => r.child === agent.conversationId).slice(-64).map(r => ({ id: r.id, reason: r.reason, state: r.state })),
            updates: Object.values(supervisor?.updates ?? {}).filter(u => u.child === agent.conversationId).slice(-64).map(u => ({ id: u.id, state: u.state })),
          });
          if (result.length === 256) return result;
        }
      }
      return result;
    },
  };
}
