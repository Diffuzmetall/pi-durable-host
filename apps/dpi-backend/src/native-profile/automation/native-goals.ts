import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { mkdir, open, lstat, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import type { Context } from '@earendil-works/chord';
import type { Usage } from '@earendil-works/pi-ai';
import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context';
import { defineDoc, defineExtension, defineTask, section,
  type ConversationId, type Harness, type RunningTask, type TaskId, type TaskRuntime, ToolTask, type Cursor, type Tx } from '@earendil-works/pi-durable';
import { NativeGoalsDoc, validateContract, renderGoalContext, renderGoalReport, resultAccepted,
  type NativeGoal, type NativeGoalEvidence, type NativeGoalLimits } from './native-contract.js';
import { createGoalRunner, type GoalRun } from './goal-run.js';
import type { GoalSkillSource } from './goal-skills.js';

export const NATIVE_GOALS = Symbol.for('pi.durable.native-goals');
type RuntimeRecord = {
  epoch: number; round: number; taskId?: TaskId; monitor?: TaskId; notifier?: TaskId; lastEvent: number;
  liveSince?: number; tokensUsed: number; lastOutput?: string; lastNotice?: string; pendingReport?: boolean; unresolvedUnsafe?: boolean; spendUncertain?: boolean;
  skillText: Record<string, string>;
  /** Session companion mode; legacy fields above remain readable for archived runs. */
  execution?: 'session';
  summary?: string;
};
const RuntimeDoc = defineDoc<{ goals: Record<string, RuntimeRecord>; links: Record<string, string> }>({ checkpointWhen: () => false,
  kind: 'durable-goals.runtime', version: 1, scope: 'session', initial: () => ({ goals: {}, links: {} }),
});
export { RuntimeDoc as NativeGoalRuntime };
type Contract = Pick<NativeGoal, 'objective' | 'criteria' | 'skills' | 'permissions'> & { limits?: NativeGoalLimits; deadline?: number };
type CoordinateInput = { id: string; first?: 'work' | 'check' | 'report' };
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
type Step = { phase: 'work' } | { phase: 'check' } | { phase: 'report' } |
  { phase: 'afterWork'; requestId: string } | { phase: 'afterCheck'; requestId: string } |
  { phase: 'wait'; until: number };
const executing = (goal: NativeGoal) => ['running', 'checking', 'reporting'].includes(goal.status);
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const verifierChecks = new Set(['read', 'grep', 'find', 'ls', 'bash', 'web_search', 'web_fetch', 'batch_web_fetch',
  'context7_resolve_library_id', 'context7_query_docs', 'google_search', 'search_history',
  'hindsight_search_knowledge_pages', 'hindsight_read_knowledge_page', 'hindsight_list_knowledge_pages']);

/** Native documents/tasks own scheduling; this service owns no second Harness or subagent registry.
 * The API is an operator capability; the root assistant uses the separately authorized control adapter.
 * Human acceptance remains exclusive to the trusted operator command, never the model tool.
 */
export function createNativeGoalService(options: {
  authorize(owner: ConversationId, context: Context): boolean | Promise<boolean>;
  tools: readonly string[];
  verifierTools?: readonly string[];
  resolveSkill(name: string, context: Context, catalogue?: readonly GoalSkillSource[]): Promise<string>;
  admit?: Parameters<typeof createGoalRunner>[0]['admit'];
  now?: () => number;
}) {
  let host: Harness | undefined;
  let binding: Promise<void> = Promise.resolve();
  let skillCatalogue: readonly GoalSkillSource[] | undefined;
  const now = options.now ?? Date.now;
  const bound = () => { if (!host) throw Error('NATIVE_GOALS_NOT_BOUND'); return host; };
  const authorize = async (owner: ConversationId, context: Context) => {
    if (!await options.authorize(owner, context)) throw Error('NATIVE_GOAL_AUTHORITY_REQUIRED');
  };
  const get = async (owner: ConversationId, id: string, context: Context) => {
    const goal = (await bound().snapshot(NativeGoalsDoc, context))?.goals[id];
    if (!goal || goal.ownerConversationId !== owner) throw Error('NATIVE_GOAL_NOT_OWNED');
    return goal;
  };
  const accrue = (goal: NativeGoal, state: RuntimeRecord) => {
    const at = now();
    if (state.liveSince !== undefined) {
      goal.activeMsUsed += Math.max(0, at - state.liveSince); state.liveSince = at;
    }
    goal.updatedAt = Math.max(goal.createdAt, at);
  };
  const exhausted = (goal: NativeGoal, state: RuntimeRecord) => goal.limits !== 'none' && (
    goal.limits.maxCalls !== undefined && goal.callsUsed >= goal.limits.maxCalls ||
    goal.limits.activeMs !== undefined && goal.activeMsUsed >= goal.limits.activeMs ||
    goal.limits.tokens !== undefined && state.tokensUsed >= goal.limits.tokens);
  const pauseInTx = async (tx: Tx, id: string, reason: string) => {
    const doc = await tx.doc(NativeGoalsDoc); const goal = doc.goals[id];
    const state = (await tx.doc(RuntimeDoc)).goals[id];
    if (['completed', 'cancelled'].includes(goal.status)) return;
    accrue(goal, state); delete state.liveSince;
    goal.status = 'paused'; goal.reason = reason;
    // Keep the session slot until runtime work is joined; status alone is not quiescence.
  };
  const contextFor = async (run: GoalRun, context: Context, purpose: 'execution' | 'compaction' = 'execution') => {
    const ledger = await bound().snapshot(RuntimeDoc, context); const id = ledger?.links[run.requestId];
    const goal = id === undefined ? undefined : (await bound().snapshot(NativeGoalsDoc, context))?.goals[id];
    if (!goal) return '';
    const used = ledger!.goals[id!].tokensUsed;
    const remaining = goal.limits === 'none' || goal.limits.tokens === undefined ? 'none' : Math.max(0, goal.limits.tokens - used);
    return renderGoalContext(goal) + `\nRuntime token accounting: ${used} used; ${remaining} remaining. In-flight usage is learned after a response.\n` + Object.entries(ledger!.goals[id!].skillText)
      .map(([name, body]) => `Skill ${name}:\n${body}`).join('\n') +
      '\nInternal durable Goal execution, not a user-facing final answer. The host owns user-facing status and reports. Do not add ordinary digest or response-format wrappers. ' +
      (purpose === 'compaction' ? 'This request only summarizes memory; output a factual summary, not a verdict or actions.' :
        run.requestId.endsWith(':check') ? 'You are the independent verifier. Output only the requested strict JSON verdict, without Markdown or a preamble.' :
        'You are the worker. Give a factual candidate with artifact references, or the requested strict JSON wait object when blocked.');
  };
  const charge = (run: GoalRun, usage: Usage, context: Context) => bound().commit(async tx => {
    const ledger = await tx.doc(RuntimeDoc); const id = ledger.links[run.requestId];
    if (!id) return;
    const goal = (await tx.doc(NativeGoalsDoc)).goals[id]; const state = ledger.goals[id];
    state.tokensUsed += usage.totalTokens; state.lastEvent = now();
    if (state.taskId === run.parentTask) accrue(goal, state);
  }, context);
  const markUnsafe = (run: GoalRun, sources: readonly string[], context: Context) => bound().commit(async tx => {
    const ledger = await tx.doc(RuntimeDoc); const id = ledger.links[run.requestId];
    if (!id || ledger.goals[id].taskId !== run.parentTask) return;
    const goal = (await tx.doc(NativeGoalsDoc)).goals[id]; ledger.goals[id].unresolvedUnsafe = true;
    const note = `Unsafe outcome is uncertain: ${sources.join(', ')}. Inspect before continuing; never blindly repeat the action.`;
    if (!goal.steps.includes(note)) goal.steps.push(note);
    if (executing(goal)) await pauseInTx(tx, id, 'unsafe_outcome_uncertain');
  }, context);
  const runner = createGoalRunner({ authorize: options.authorize, tools: options.tools, admit: options.admit, systemContext: contextFor,
    admitTool: async (run, _tool, context) => {
      const ledger = await bound().snapshot(RuntimeDoc, context); const id = ledger?.links[run.requestId];
      const goal = id === undefined ? undefined : (await bound().snapshot(NativeGoalsDoc, context))?.goals[id];
      return goal !== undefined && executing(goal) && ledger!.goals[id!].taskId === run.parentTask;
    },
    afterTool: charge,
    interrupted: markUnsafe,
    admitRun: async (input, tx) => {
      const ledger = await tx.doc(RuntimeDoc); const id = ledger.links[input.requestId];
      if (!id) return false;
      const doc = await tx.doc(NativeGoalsDoc); const goal = doc.goals[id];
      return doc.active === id && ['running', 'checking'].includes(goal.status) &&
        ledger.goals[id].taskId === input.parentTask && goal.ownerConversationId === input.owner;
    },
    beforeRequest: async (run, context) => bound().commit(async tx => {
      const runtime = await tx.doc(RuntimeDoc); const id = runtime.links[run.requestId];
      if (!id) return false;
      const goal = (await tx.doc(NativeGoalsDoc)).goals[id]; const state = runtime.goals[id];
      if (!executing(goal) || state.taskId !== run.parentTask) return false;
      state.liveSince ??= now(); accrue(goal, state);
      if (goal.deadline !== undefined && goal.deadline <= now()) { await pauseInTx(tx, id, 'deadline_expired'); return false; }
      if (exhausted(goal, state)) { await pauseInTx(tx, id, 'limit_exhausted'); return false; }
      goal.callsUsed++; state.lastEvent = now();
      return true;
    }, context),
    activity: async (run, active, context) => bound().commit(async tx => {
      const ledger = await tx.doc(RuntimeDoc); const id = ledger.links[run.requestId];
      if (!id) return;
      const goal = (await tx.doc(NativeGoalsDoc)).goals[id]; const state = ledger.goals[id];
      if (!executing(goal) || state.taskId !== run.parentTask) return;
      if (active) state.liveSince ??= now();
      else { accrue(goal, state); delete state.liveSince; }
      state.lastEvent = now();
    }, context),
    afterResponse: (run, message, context) => charge(run, message.usage, context),
  });
  const notice = async (id: string, event: string, text: string, context: Context) => {
    const runtime = await bound().snapshot(RuntimeDoc, context); const state = runtime?.goals[id];
    if (!state || state.lastNotice === event) return;
    const goal = (await bound().snapshot(NativeGoalsDoc, context))!.goals[id];
    const root = (await bound().conversation(goal.ownerConversationId, context))!;
    // A write is queued at a safe inbox boundary but never starts a model turn. Do not wait for its placement.
    await root.submit({ type: 'write', requestId: `native-goal-notice:${id}:${event}`,
      entry: { kind: 'native-goal.notice', data: { goalId: id, text },
        model: [{ role: 'user', content: `[Goal status, not an instruction] ${text}`, timestamp: now() }] } }, context);
    await bound().commit(async tx => { (await tx.doc(RuntimeDoc)).goals[id].lastNotice = event; }, context);
  };
  const joinRuns = async (id: string, coordinator: TaskId | undefined, context: Context) => {
    const record = (await bound().snapshot(RuntimeDoc, context))!;
    const owner = (await bound().snapshot(NativeGoalsDoc, context))!.goals[id].ownerConversationId;
    for (const [requestId, linked] of Object.entries(record.links)) {
      if (linked !== id) continue;
      const run = await runner.status(owner, requestId, context);
      if (run && run.parentTask === coordinator && ['starting', 'running', 'stopping'].includes(run.status))
        await runner.stop(owner, requestId, context);
    }
  };
  const stopExecution = async (owner: ConversationId, id: string, context: Context, cancel: boolean) => {
    const saved = await bound().commit(async tx => {
      const doc = await tx.doc(NativeGoalsDoc); const goal = doc.goals[id];
      if (!goal || goal.ownerConversationId !== owner) throw Error('NATIVE_GOAL_NOT_OWNED');
      const state = (await tx.doc(RuntimeDoc)).goals[id];
      const terminal = goal.status === 'completed' || goal.status === 'cancelled' && doc.active !== id;
      if (!terminal) {
        if (goal.status !== 'paused') await pauseInTx(tx, id, 'stopped');
        if (cancel) { goal.status = 'cancelled'; delete goal.reason; }
      }
      return { goal: copy(goal), state: copy(state), terminal };
    }, context);
    if (saved.terminal) return saved.goal;
    const state = saved.state;
    await joinRuns(id, state.taskId, context);
    if (state.taskId !== undefined) {
      await bound().abortTask(state.taskId, context); await bound().waitForTask(state.taskId, context);
    }
    if (state.monitor !== undefined) {
      await bound().abortTask(state.monitor, context); await bound().waitForTask(state.monitor, context);
    }
    const currentExecution = await bound().commit(async tx => {
      const doc = await tx.doc(NativeGoalsDoc); const current = (await tx.doc(RuntimeDoc)).goals[id];
      if (current.taskId !== state.taskId || current.epoch !== state.epoch) return false;
      if (doc.active === id) delete doc.active;
      return true;
    }, context);
    const goal = await get(owner, id, context);
    if (currentExecution) await notice(id, `${goal.status}:${goal.reason ?? ''}:${goal.revision}:${state.epoch}`,
      `Goal ${id}: ${goal.status}${goal.reason ? ` (${goal.reason})` : ''}`, context);
    return goal;
  };
  const finish = async (id: string, context: Context) => {
    const state = (await bound().snapshot(RuntimeDoc, context))!.goals[id];
    await joinRuns(id, state.taskId, context);
    if (state.monitor !== undefined) {
      await bound().abortTask(state.monitor, context);
      await bound().waitForTask(state.monitor, context);
    }
  };
  const Notify = defineTask<{ id: string; epoch: number }, { phase: 'deliver' }, null>({
    name: 'native-goal.notify', version: 1, initial: () => ({ phase: 'deliver' }),
    phases: { deliver: async (task, runtime, context) => {
      const state = (await runtime.snapshot(RuntimeDoc, context))!.goals[task.input.id];
      if (state.epoch === task.input.epoch) {
        const goal = (await runtime.snapshot(NativeGoalsDoc, context))!.goals[task.input.id];
        await notice(goal.id, `${goal.status}:${goal.reason ?? ''}:${goal.revision}:${state.epoch}`,
          `Goal ${goal.id}: ${goal.status}${goal.reason ? ` (${goal.reason})` : ''}${goal.reportPath ? ` — ${goal.reportPath}` : ''}`, context);
      }
      await runtime.commit(() => ({ status: 'terminal', outcome: { status: 'completed', result: null } }), context);
    } },
    abort: (_task, runtime, context) => runtime.commit(() => ({ status: 'terminal', outcome: { status: 'aborted' } }), context),
  });
  const Monitor = defineTask<{ id: string }, { phase: 'tick'; at: number } | { phase: 'stop' }, null>({
    name: 'native-goal.monitor', version: 2, initial: () => ({ phase: 'tick', at: 0 }),
    migrate(input, checkpoint, fromVersion) {
      if (fromVersion !== 1) throw Error('Unsupported native-goal.monitor version');
      return { input: input as { id: string }, checkpoint: checkpoint as { phase: 'tick'; at: number } | { phase: 'stop' } };
    },
    phases: { tick: async (task, runtime, context) => {
      if (task.state.checkpoint.at > runtime.now())
        return runtime.sleepUntil(task.state.checkpoint.at, task.state.checkpoint, context);

      await runtime.commit(async tx => {
        const goal = (await tx.doc(NativeGoalsDoc)).goals[task.input.id];
        const current = (await tx.doc(RuntimeDoc)).goals[task.input.id];
        const doc = await tx.doc(NativeGoalsDoc);
        if (!executing(goal) && goal.status !== 'waiting') return doc.active === goal.id
          ? { status: 'running', checkpoint: { phase: 'stop' } }
          : { status: 'terminal', outcome: { status: 'completed', result: null } };
        if (goal.status === 'waiting' && goal.deadline === undefined)
          return { status: 'terminal', outcome: { status: 'completed', result: null } };
        const coordinator = current.taskId === undefined ? undefined : await tx.task(current.taskId);
        if (coordinator && !coordinator.abortRequested && (coordinator.restarts ?? 0) >= runtime.settings.restartLimit) {
          await pauseInTx(tx, goal.id, 'execution_restart_limit');
          return { status: 'running', checkpoint: { phase: 'stop' } };
        }
        if (coordinator?.state.status === 'terminal' && coordinator.state.outcome.status !== 'completed') {
          delete current.liveSince;
          await pauseInTx(tx, goal.id, 'execution_failed');
          return { status: 'running', checkpoint: { phase: 'stop' } };
        }
        // Fifteen minutes is a lost-continuation detector, never a routine model timer.
        // Only a safely completed producer with a persisted candidate can be rechecked.
        if (executing(goal) && current.liveSince === undefined && now() - current.lastEvent >= 15 * 60_000 &&
            coordinator?.state.status === 'terminal' && coordinator.state.outcome.status === 'completed' && current.lastOutput) {
          current.epoch++; current.lastEvent = now();
          current.taskId = await tx.createTask(Coordinator, { id: goal.id, first: 'check' },
            { conversationId: goal.ownerConversationId, ownership: { kind: 'conversation' }, background: true });
        }
        accrue(goal, current);
        if (goal.deadline !== undefined && goal.deadline <= now() ||
            goal.limits !== 'none' && goal.limits.activeMs !== undefined && goal.activeMsUsed >= goal.limits.activeMs) {
          await pauseInTx(tx, task.input.id, goal.deadline !== undefined && goal.deadline <= now() ? 'deadline_expired' : 'limit_exhausted');
          return { status: 'running', checkpoint: { phase: 'stop' } };
        }
        const remaining = Math.min(goal.deadline === undefined ? 1000 : goal.deadline - now(),
          goal.limits === 'none' || goal.limits.activeMs === undefined ? 1000 : goal.limits.activeMs - goal.activeMsUsed);
        return { status: 'running', checkpoint: { phase: 'tick', at: runtime.now() + Math.max(1, Math.min(1000, remaining)) } };
      }, context);
    }, stop: async (task, runtime, context) => {
      const state = (await runtime.snapshot(RuntimeDoc, context))!.goals[task.input.id];
      await joinRuns(task.input.id, state.taskId, context);
      // The monitor is a native background sibling: cancelling the coordinator cannot self-join it.
      if (state.taskId !== undefined) {
        await bound().abortTask(state.taskId, context);
        await bound().waitForTask(state.taskId, context);
      }
      await runtime.commit(async tx => {
        const doc = await tx.doc(NativeGoalsDoc); const current = (await tx.doc(RuntimeDoc)).goals[task.input.id];
        if (doc.active === task.input.id && current.taskId === state.taskId) delete doc.active;
        current.notifier = await tx.createTask(Notify, { id: task.input.id, epoch: current.epoch },
          { conversationId: doc.goals[task.input.id].ownerConversationId, ownership: { kind: 'conversation' }, background: true });
        return { status: 'terminal', outcome: { status: 'completed', result: null } };
      }, context);
    } },
    abort: (_task, runtime, context) => runtime.commit(() => ({ status: 'terminal', outcome: { status: 'aborted' } }), context),
  });
  const Coordinator = defineTask<CoordinateInput, Step, null>({
    name: 'native-goal.coordinate', version: 2, initial: input => ({ phase: input.first ?? 'work' }),
    migrate(input, checkpoint, fromVersion) {
      if (fromVersion !== 1) throw Error('Unsupported native-goal.coordinate version');
      return { input: input as CoordinateInput, checkpoint: checkpoint as Step };
    },
    phases: {
      work: (task, runtime, context) => startLeaf(task, runtime, context, false),
      check: (task, runtime, context) => startLeaf(task, runtime, context, true),
      afterWork: async (task, runtime, context) => {
        const goal = (await runtime.snapshot(NativeGoalsDoc, context))!.goals[task.input.id];
        const run = await runner.wait(goal.ownerConversationId, task.state.checkpoint.requestId!, context);
        await runtime.commit(async tx => {
          const current = (await tx.doc(NativeGoalsDoc)).goals[goal.id];
          const state = (await tx.doc(RuntimeDoc)).goals[goal.id];
          accrue(current, state); delete state.liveSince;
          if (!executing(current)) return { status: 'running', checkpoint: { phase: 'report' } };
          if (run?.status !== 'done') {
            await pauseInTx(tx, goal.id, 'execution_failed');
            return { status: 'running', checkpoint: { phase: 'report' } };
          }
          if (state.round && state.lastOutput === run.text && !current.steps.includes('Repeated candidate without verified progress; use a different approach.'))
            current.steps.push('Repeated candidate without verified progress; use a different approach.');
          state.lastOutput = run.text ?? ''; state.lastEvent = now();
          let output: unknown; try { output = JSON.parse(state.lastOutput); } catch { /* Ordinary prose is a valid worker result. */ }
          if (record(output) && record(output.wait) && typeof output.wait.reason === 'string' && output.wait.reason.trim()) {
            current.status = 'waiting'; current.reason = output.wait.reason.trim();
            if (output.wait.until === undefined) return { status: 'running', checkpoint: { phase: 'report' } };
            if (typeof output.wait.until === 'number' && Number.isSafeInteger(output.wait.until) && output.wait.until > now())
              return { status: 'running', checkpoint: { phase: 'wait', until: output.wait.until } };
            await pauseInTx(tx, goal.id, 'wait_deadline_invalid_or_expired');
            return { status: 'running', checkpoint: { phase: 'report' } };
          }
          current.status = 'checking';
          return { status: 'running', checkpoint: { phase: 'check' } };
        }, context);
      },
      afterCheck: async (task, runtime, context) => {
        const goal = (await runtime.snapshot(NativeGoalsDoc, context))!.goals[task.input.id];
        const run = await runner.wait(goal.ownerConversationId, task.state.checkpoint.requestId!, context);
        await runtime.commit(async tx => {
          const current = (await tx.doc(NativeGoalsDoc)).goals[goal.id]; const state = (await tx.doc(RuntimeDoc)).goals[goal.id];
          accrue(current, state); delete state.liveSince;
          if (!executing(current)) return { status: 'running', checkpoint: { phase: 'report' } };
          let evidence: NativeGoalEvidence[];
          try {
            const result: unknown = JSON.parse(run?.text ?? '');
            if (!record(result) || !Array.isArray(result.evidence)) throw Error('evidence missing');
            const entries = result.evidence.map((entry: unknown) => {
              if (!record(entry)) throw Error('invalid evidence');
              return { criterionId: entry.criterionId, revision: current.revision,
                check: entry.check, proof: entry.proof, outcome: entry.outcome, humanApproved: false };
            });
            const candidate: unknown = { ...copy(current), evidence: [...copy(current.evidence), ...entries] };
            validateContract(candidate); evidence = candidate.evidence.slice(current.evidence.length);
            const missing = current.skills.filter(skill => !Array.isArray(result.skillsApplied) || !result.skillsApplied.includes(skill));
            if (missing.length) throw Error(`skills_unverified:${missing.join(',')}`);
          } catch (error) {
            await pauseInTx(tx, goal.id, error instanceof Error && error.message.startsWith('skills_unverified:') ? error.message : 'verification_unavailable');
            return { status: 'running', checkpoint: { phase: 'report' } };
          }
          current.evidence.push(...evidence); state.lastEvent = now();
          const humanPending = current.criteria.some(c => c.human) && current.criteria.filter(c => !c.human).every(c =>
            current.evidence.findLast(e => e.criterionId === c.id && e.revision === current.revision)?.outcome === 'pass');
          if (state.unresolvedUnsafe) {
            const inspected = current.criteria.every(c => {
              const entry = current.evidence.findLast(e => e.criterionId === c.id && e.revision === current.revision);
              return entry && entry.outcome !== 'unknown' && entry.check.trim() && entry.proof.trim();
            });
            if (inspected) delete state.unresolvedUnsafe;
            else if (!humanPending) {
              await pauseInTx(tx, goal.id, 'unsafe_outcome_uncertain');
              return { status: 'running', checkpoint: { phase: 'report' } };
            }
          }
          if (resultAccepted(copy(current))) {
            current.status = 'reporting'; state.pendingReport = true;
            return { status: 'running', checkpoint: { phase: 'report' } };
          }
          if (humanPending) {
            current.status = 'waiting'; current.reason = 'human_acceptance_required';
            return { status: 'running', checkpoint: { phase: 'report' } };
          }
          state.round++; current.status = 'running';
          return { status: 'running', checkpoint: { phase: 'work' } };
        }, context);
      },
      wait: async (task, runtime, context) => {
        await notice(task.input.id, `waiting:${task.state.checkpoint.until}`, 'Goal waiting for an external event', context);
        if (task.state.checkpoint.until > runtime.now())
          return runtime.sleepUntil(task.state.checkpoint.until, task.state.checkpoint, context);
        await runtime.commit(async tx => {
          const current = (await tx.doc(NativeGoalsDoc)).goals[task.input.id];
          if (current.status !== 'waiting') return { status: 'terminal', outcome: { status: 'completed', result: null } };
          if (current.deadline !== undefined && current.deadline <= now()) {
            await pauseInTx(tx, current.id, 'deadline_expired');
            return { status: 'running', checkpoint: { phase: 'report' } };
          }
          current.status = 'running'; delete current.reason;
          (await tx.doc(RuntimeDoc)).goals[current.id].round++;
          return { status: 'running', checkpoint: { phase: 'work' } };
        }, context);
      },
      report: async (task, runtime, context) => {
        const goal = (await runtime.snapshot(NativeGoalsDoc, context))!.goals[task.input.id];
        if (goal.status === 'reporting') {
          try {
            const root = (await bound().conversation(goal.ownerConversationId, context))!;
            const cwd = (await root.agent(context)).cwd;
            if (!cwd) throw Error('No trusted project directory');
            const file = await writeReport(cwd, goal.id, goal.revision, renderGoalReport({ ...goal, status: 'completed' }));
            await runtime.commit(async tx => {
              const doc = await tx.doc(NativeGoalsDoc); const current = doc.goals[goal.id];
              if (current.status !== 'reporting' || current.revision !== goal.revision) return undefined;
              current.reportPath = file; current.updatedAt = now();
              return undefined;
            }, context);
          } catch {
            await bound().commit(tx => pauseInTx(tx, goal.id, 'report_write_failed'), context);
          }
        }
        await finish(goal.id, context);
        await runtime.commit(async tx => {
          const doc = await tx.doc(NativeGoalsDoc); const current = doc.goals[goal.id];
          if (current.status === 'reporting' && current.reportPath && resultAccepted(copy(current))) current.status = 'completed';
          if (doc.active === goal.id) delete doc.active;
          const state = (await tx.doc(RuntimeDoc)).goals[goal.id];
          state.notifier = await tx.createTask(Notify, { id: goal.id, epoch: state.epoch },
            { conversationId: goal.ownerConversationId, ownership: { kind: 'conversation' }, background: true });
          return { status: 'terminal', outcome: { status: 'completed', result: null } };
        }, context);
      },
    },
    abort: async (task, runtime, context) => runtime.commit(async tx => {
      const goal = (await tx.doc(NativeGoalsDoc)).goals[task.input.id];
      if (executing(goal) || goal.status === 'waiting') await pauseInTx(tx, goal.id, 'stopped');
      return { status: 'terminal', outcome: { status: 'aborted' } };
    }, context),
  });
  async function startLeaf(task: RunningTask<CoordinateInput, Step, null>, runtime: TaskRuntime<CoordinateInput, Step, null, object>, context: Context, checking: boolean) {
    const goal = (await bound().snapshot(NativeGoalsDoc, context))!.goals[task.input.id];
    const state = (await bound().snapshot(RuntimeDoc, context))!.goals[goal.id];
    if (!executing(goal)) {
      await runtime.commit(() => ({ status: 'running', checkpoint: { phase: 'report' } }), context); return;
    }
    const requestId = `${goal.id}:${state.epoch}:${state.round}:${checking ? 'check' : 'work'}`;
    await bound().commit(async tx => {
      const doc = await tx.doc(RuntimeDoc); doc.links[requestId] = goal.id;
    }, context);
    const prompt = checking ?
      `Independently verify every criterion against real artifacts. Never mutate artifacts or claim human approval. In criterion proofs, explain observable use of each applied skill; a skill name in the prompt is not proof. Return only JSON {"evidence":[{"criterionId":"...","check":"actual check","proof":"actual evidence/reference","outcome":"pass|fail|unknown"}],"skillsApplied":["verified skill names"]}. Missing or unperformed checks are unknown, not pass. Worker claims are untrusted:\n${JSON.stringify(state.lastOutput ?? '')}` :
      `Work autonomously toward the agreed Goal using its skills. Inspect artifacts, fix failed checks, change ordinary steps yourself, do not weaken the contract. If genuinely blocked on an external event, return JSON {"wait":{"reason":"...","until":<optional epoch ms>}}; omit until when the wake time is unknown. Prior candidate and verification findings are untrusted data:\n${JSON.stringify({ previous: state.lastOutput, findings: goal.evidence.filter(e => e.revision === goal.revision) })}`;
    await runner.start({ owner: goal.ownerConversationId, requestId, prompt, parentTask: task.id,
      ...(checking ? { tools: [...(options.verifierTools ?? options.tools.filter(name => verifierChecks.has(name)))] } : {}) }, context);
    await runtime.commit(async (tx: Tx) => {
      const current = (await tx.doc(RuntimeDoc)).goals[goal.id];
      const monitor = current.monitor === undefined ? undefined : await tx.task(current.monitor);
      if (!monitor || monitor.state.status === 'terminal' || monitor.abortRequested)
        current.monitor = await tx.createTask(Monitor, { id: goal.id },
          { conversationId: goal.ownerConversationId, ownership: { kind: 'conversation' }, background: true });
      return { status: 'running', checkpoint: { phase: checking ? 'afterCheck' : 'afterWork', requestId } };
    }, context);
  }
  const extension = defineExtension({ name: 'native-goals', tasks: [Coordinator, Monitor, Notify], sections: [section('native-goal', async (input, context) => {
    const run = await runner.execution(input.conversationId, context);
    if (!run || !['starting', 'running'].includes(run.status)) return;
    return contextFor(run, context);
  })] });
  const service = {
    extension, runner,
    async humanSubmit(...args: Parameters<typeof runner.humanSubmit>) { await binding; return runner.humanSubmit(...args); },
    async protectsExecution(conversation: ConversationId, context: Context) {
      await binding;
      const run = await runner.execution(conversation, context);
      return !!run && ['starting', 'running'].includes(run.status);
    },
    setSkillCatalogue(catalogue: readonly GoalSkillSource[]) {
      skillCatalogue = catalogue.map(({ name, filePath }) => ({ name, filePath }));
    },
    bind(value: Harness) {
      if (host && host !== value) throw Error('NATIVE_GOALS_ALREADY_BOUND');
      if (host === value) return binding;
      host = value; runner.bind(value);
      binding = (async () => {
      const paused = new Set(await value.commit(async tx => {
        const doc = await tx.doc(NativeGoalsDoc); const ledger = await tx.doc(RuntimeDoc); const ids: string[] = [];
        for (const goal of Object.values(doc.goals)) {
          if (!executing(goal)) continue;
          const state = ledger.goals[goal.id]; const unclean = state.liveSince !== undefined;
          delete state.liveSince; state.lastEvent = now();
          if (unclean && goal.limits !== 'none' && (goal.limits.activeMs !== undefined || goal.limits.tokens !== undefined)) {
            state.spendUncertain = true;
            goal.steps.push('Unmeasured pre-crash spend: offline time was not charged; limits require explicit operator review.');
            await pauseInTx(tx, goal.id, 'unmeasured_spend_after_restart'); ids.push(goal.id);
          }
        }
        return ids;
      }, BACKGROUND_CONTEXT));
      // Inspect native intent BEFORE cancelling/recovering it; unsafe effects are never blindly replayed.
      for (const status of ['pending', 'running', 'waiting', 'sleeping'] as const) {
        let cursor: Cursor | undefined;
        do {
        const page = await value.commit(tx => tx.scanTasks({ kind: ToolTask.definition.name, status }, 100, cursor), BACKGROUND_CONTEXT);
        for (const task of page.items) {
          if (task.state.status === 'terminal' || task.state.status === 'completing' || !record(task.state.checkpoint) ||
              task.state.checkpoint.phase !== 'execute' || task.state.checkpoint.replay !== 'unsafe') continue;
          const run = await runner.execution(task.conversationId, BACKGROUND_CONTEXT, task.id);
          if (!run || !['starting', 'running'].includes(run.status)) continue;
          await markUnsafe(run, [`durable-task:${task.id}`], BACKGROUND_CONTEXT);
          const id = (await value.snapshot(RuntimeDoc, BACKGROUND_CONTEXT))!.links[run.requestId];
          if (id) paused.add(id);
        }
        cursor = page.next;
        } while (cursor);
      }
      for (const id of paused) {
        const goal = (await value.snapshot(NativeGoalsDoc, BACKGROUND_CONTEXT))!.goals[id];
        await stopExecution(goal.ownerConversationId, id, BACKGROUND_CONTEXT, false);
      }
      })();
      void binding.catch(() => {}); // The awaited bind/operator APIs propagate initialization failures.
      return binding;
    },
    async create(owner: ConversationId, input: Contract, context: Context) {
      await binding;
      await authorize(owner, context);
      if (input.limits === undefined) throw Error('GOAL_LIMITS_QUESTION_REQUIRED: choose none or explicit limits before saving');
      const at = now(); const goal: NativeGoal = { ...copy(input), limits: input.limits, id: randomUUID(),
        ownerConversationId: owner, revision: 1, callsUsed: 0, activeMsUsed: 0,
        evidence: [], status: 'draft', steps: [], createdAt: at, updatedAt: at };
      validateContract(goal);
      const skillText: Record<string, string> = {};
      for (const skill of goal.skills) { const body = await options.resolveSkill(skill, context, skillCatalogue); if (!body.trim()) throw Error(`GOAL_SKILL_UNAVAILABLE: ${skill}`); skillText[skill] = body; }
      await bound().commit(async tx => {
        (await tx.doc(NativeGoalsDoc)).goals[goal.id] = goal;
        (await tx.doc(RuntimeDoc)).goals[goal.id] = { epoch: 0, round: 0, lastEvent: at, tokensUsed: 0, skillText };
      }, context);
      return goal;
    },
    async resume(owner: ConversationId, id: string, context: Context, first?: 'check') {
      await binding;
      await authorize(owner, context);
      const goal = await get(owner, id, context);
      if (['cancelled', 'completed'].includes(goal.status)) throw Error('GOAL_TERMINAL');
      const taskId = await bound().commit(async tx => {
        const doc = await tx.doc(NativeGoalsDoc); const current = doc.goals[id]; const state = (await tx.doc(RuntimeDoc)).goals[id];
        if (['cancelled', 'completed'].includes(current.status)) throw Error('GOAL_TERMINAL');
        if (doc.active) throw Error('GOAL_ALREADY_EXECUTING');
        if (current.deadline !== undefined && current.deadline <= now()) throw Error('GOAL_DEADLINE_EXPIRED: use /goal edit');
        if (state.spendUncertain) throw Error('GOAL_SPEND_UNCERTAIN: explicitly review /goal limits before resuming');
        if (state.unresolvedUnsafe && !first) throw Error('GOAL_UNSAFE_OUTCOME_UNCERTAIN: use /goal check before resuming');
        const reportOnly = !first && (state.pendingReport || ['report_write_failed', 'acceptance_ready'].includes(current.reason ?? '')) && resultAccepted(copy(current));
        if (!reportOnly && exhausted(current, state)) throw Error('GOAL_LIMIT_EXHAUSTED: use /goal limits');
        current.status = reportOnly ? 'reporting' : first === 'check' ? 'checking' : 'running';
        delete current.reason; state.epoch++;
        state.round = 0; delete state.monitor; delete state.liveSince;
        doc.active = id;
        state.taskId = await tx.createTask(Coordinator, { id, first: reportOnly ? 'report' : first ?? 'work' }, { conversationId: owner, ownership: { kind: 'conversation' }, background: true });
        state.monitor = await tx.createTask(Monitor, { id }, { conversationId: owner, ownership: { kind: 'conversation' }, background: true });
        return state.taskId;
      }, context);
      bound().resume(); return taskId;
    },
    async status(owner: ConversationId, id: string, context: Context) { await binding; return get(owner, id, context); },
    async list(owner: ConversationId, archive: boolean, context: Context) {
      await binding;
      return Object.values((await bound().snapshot(NativeGoalsDoc, context))?.goals ?? {}).filter(goal =>
        goal.ownerConversationId === owner && (archive || !['completed', 'cancelled'].includes(goal.status)));
    },
    async stop(owner: ConversationId, id: string, context: Context) { await binding; return stopExecution(owner, id, context, false); },
    async cancel(owner: ConversationId, id: string, confirmed: boolean, context: Context) {
      await binding;
      if (!confirmed) throw Error('GOAL_CONFIRM_CANCEL_REQUIRED');
      return stopExecution(owner, id, context, true);
    },
    async limits(owner: ConversationId, id: string, limits: NativeGoalLimits, context: Context) {
      await binding;
      const goal = await get(owner, id, context); validateContract({ ...goal, limits });
      if (['completed', 'cancelled'].includes(goal.status)) throw Error('GOAL_TERMINAL');
      await service.stop(owner, id, context);
      await bound().commit(async tx => {
        const doc = await tx.doc(NativeGoalsDoc); const current = doc.goals[id];
        if (['completed', 'cancelled'].includes(current.status)) throw Error('GOAL_TERMINAL');
        if (doc.active === id) throw Error('GOAL_CONCURRENT_RESUME');
        current.limits = limits;
        const state = (await tx.doc(RuntimeDoc)).goals[id];
        if (state.spendUncertain) {
          current.steps.push('Operator explicitly reviewed limits after an unmeasured crash interval; accounted spend was preserved.');
          delete state.spendUncertain;
        }
      }, context);
      return get(owner, id, context);
    },
    async edit(owner: ConversationId, id: string, patch: Partial<Omit<Contract, 'limits'>>, context: Context) {
      await binding;
      if (!patch || Object.keys(patch).some(key => !['objective', 'criteria', 'skills', 'permissions', 'deadline'].includes(key)))
        throw Error('GOAL_INVALID_EDIT_FIELDS');
      const goal = await get(owner, id, context);
      const next = { ...copy(goal), ...copy(patch), revision: goal.revision + 1 };
      validateContract(next);
      if (['completed', 'cancelled'].includes(goal.status)) throw Error('GOAL_TERMINAL');
      const skillText: Record<string, string> = {};
      const approved = (await bound().snapshot(RuntimeDoc, context))!.goals[id].skillText;
      for (const skill of next.skills) {
        const text = approved[skill] ?? await options.resolveSkill(skill, context, skillCatalogue);
        if (!text.trim()) throw Error('GOAL_SKILL_UNAVAILABLE'); skillText[skill] = text;
      }
      await service.stop(owner, id, context);
      await bound().commit(async tx => {
        const doc = await tx.doc(NativeGoalsDoc); const current = doc.goals[id];
        if (['completed', 'cancelled'].includes(current.status)) throw Error('GOAL_TERMINAL');
        if (doc.active === id) throw Error('GOAL_CONCURRENT_RESUME');
        if (current.revision !== goal.revision) throw Error('GOAL_REVISION_CHANGED');
        doc.goals[id] = { ...copy(current), ...copy(patch), revision: next.revision, updatedAt: now() };
        (await tx.doc(RuntimeDoc)).goals[id].skillText = skillText;
      }, context);
      return get(owner, id, context);
    },
    async check(owner: ConversationId, id: string, context: Context) {
      await binding;
      await service.stop(owner, id, context);
      return service.resume(owner, id, context, 'check');
    },
    async approve(owner: ConversationId, id: string, criterionId: string, context: Context) {
      await binding;
      const goal = await get(owner, id, context);
      if (goal.status !== 'waiting' || goal.reason !== 'human_acceptance_required') throw Error('GOAL_NOT_WAITING_FOR_HUMAN');
      if (!goal.criteria.some(c => c.id === criterionId && c.human)) throw Error('GOAL_NOT_A_HUMAN_CRITERION');
      await bound().commit(async tx => {
        const current = (await tx.doc(NativeGoalsDoc)).goals[id];
        if (current.revision !== goal.revision || current.status !== 'waiting' || current.reason !== 'human_acceptance_required')
          throw Error('GOAL_HUMAN_APPROVAL_STALE');
        const state = (await tx.doc(RuntimeDoc)).goals[id];
        const approval = await tx.appendEntry(owner, { kind: 'native-goal.approval',
          data: { goalId: id, revision: current.revision, criterionId, at: now() } });
        current.evidence.push({ criterionId, revision: current.revision, check: 'Actual session operator acceptance',
          proof: `durable:${owner}:${approval.id}`, outcome: 'pass', humanApproved: true });
        if (resultAccepted(copy(current))) { current.status = 'paused'; current.reason = 'acceptance_ready'; state.pendingReport = true; delete state.unresolvedUnsafe; }
      }, context);
      const updated = await get(owner, id, context);
      if (resultAccepted(updated)) return service.resume(owner, id, context);
    },
    async command(owner: ConversationId, line: string, context: Context): Promise<string> {
      await binding;
      const text = line.trim().replace(/^\/goal(?:\s|$)/, '').trim();
      const [, verb = 'status', args = ''] = /^(\S+)(?:\s+([\s\S]*))?$/.exec(text) ?? [];
      const words = args.split(/\s+/).filter(Boolean);
      if (verb === 'help') return 'Новая цель: /goal new или напишите «Запусти цель: …». Статус: /goal status; список: list; пауза: stop; продолжить: resume; проверить: check; личная приёмка: approve; отменить: cancel --confirm. Выберите подкоманду в меню /goal.';
      if (verb === 'take') throw Error('GOAL_TAKE_DEFERRED');
      if (verb === 'list') return JSON.stringify((await service.list(owner, words.includes('--archive'), context)).map(g =>
        ({ id: g.id, objective: g.objective, status: g.status, callsUsed: g.callsUsed, activeMsUsed: g.activeMsUsed })), null, 2);
      if (verb === 'new') {
        if (!args.startsWith('{')) return 'Напишите агенту «Запусти цель: …». Он сам соберёт настройки и спросит только недостающее; JSON вручную не нужен.';
        const goal = await service.create(owner, JSON.parse(args), context);
        await service.resume(owner, goal.id, context);
        return `Goal ${goal.id} started. /goal status ${goal.id}`;
      }
      const doc = await bound().snapshot(NativeGoalsDoc, context);
      let id = words[0]; let payload = id === undefined ? '' : args.slice(id.length).trimStart();
      if (!id || id.startsWith('{') || id === 'none' || id.startsWith('--')) {
        payload = args;
        const candidates = Object.values(doc?.goals ?? {}).filter(g => g.ownerConversationId === owner && !['cancelled', 'completed'].includes(g.status));
        id = doc?.active ?? (candidates.length === 1 ? candidates[0].id : undefined)!;
        if (!id) return candidates.length ? 'GOAL_AMBIGUOUS: specify an id from /goal list' : 'Цель ещё не запущена. Напишите «Запусти цель: …» или выберите /goal new.';
      }
      if (verb === 'status') return JSON.stringify({ ...await get(owner, id, context),
        accounting: { tokensUsed: (await bound().snapshot(RuntimeDoc, context))!.goals[id].tokensUsed } }, null, 2);
      if (verb === 'limits' && !payload) {
        const goal = await get(owner, id, context);
        return JSON.stringify({ limits: goal.limits, callsUsed: goal.callsUsed, activeMsUsed: goal.activeMsUsed });
      }
      if (verb === 'stop') return JSON.stringify(await service.stop(owner, id, context));
      if (verb === 'resume') return `Goal execution ${await service.resume(owner, id, context)} resumed`;
      if (verb === 'check') return `Goal check ${await service.check(owner, id, context)} requested`;
      if (verb === 'cancel') return JSON.stringify(await service.cancel(owner, id, words.includes('--confirm'), context));
      if (verb === 'approve') { await service.approve(owner, id, payload, context); return 'Human approval recorded'; }
      if (verb === 'limits') return JSON.stringify(await service.limits(owner, id, payload === 'none' ? 'none' : JSON.parse(payload), context));
      if (verb === 'edit') return JSON.stringify(await service.edit(owner, id, JSON.parse(payload), context));
      throw Error('GOAL_UNKNOWN_COMMAND: /goal help');
    },
    async wait(owner: ConversationId, id: string, context: Context) {
      await binding;
      await get(owner, id, context);
      const state = (await bound().snapshot(RuntimeDoc, context))!.goals[id];
      if (state.taskId !== undefined) await bound().waitForTask(state.taskId, context);
      if (state.monitor !== undefined) await bound().waitForTask(state.monitor, context);
      const current = (await bound().snapshot(RuntimeDoc, context))!.goals[id];
      if (current.epoch === state.epoch && current.notifier !== undefined) await bound().waitForTask(current.notifier, context);
      return get(owner, id, context);
    },
    async shutdown(context: Context) {
      await binding;
      if (!host) return;
      await host.commit(async tx => {
        const doc = await tx.doc(NativeGoalsDoc); const runtime = await tx.doc(RuntimeDoc);
        for (const goal of Object.values(doc.goals)) { accrue(goal, runtime.goals[goal.id]); delete runtime.goals[goal.id].liveSince; }
      }, context);
    },
  };
  Object.defineProperty(extension, NATIVE_GOALS, { value: service });
  return service;
}

export async function writeReport(cwd: string, id: string, revision: number, content: string) {
  const root = await realpath(cwd); let directory = root;
  for (const part of ['docs', 'goals', 'results']) {
    directory = join(directory, part);
    try { await mkdir(directory); } catch (error: any) { if (error.code !== 'EEXIST') throw error; }
    const info = await lstat(directory);
    if (!info.isDirectory() || info.isSymbolicLink()) throw Error('Unsafe report directory');
  }
  const expected = Buffer.from(content, 'utf8');
  const digest = createHash('sha256').update(expected).digest('hex').slice(0, 16);
  const file = join(directory, `${id}-r${revision}-${digest}.md`);
  let handle;
  try { handle = await open(file, 'wx+', 0o600); }
  catch (error: any) {
    if (error.code !== 'EEXIST') throw error;
    // No symlinks/devices, no truncation, and no overwriting an unrelated existing report.
    handle = await open(file, constants.O_RDWR | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  }
  try {
    if (!(await handle.stat()).isFile()) throw Error('Unsafe report file');
    const existing = await handle.readFile();
    if (!existing.equals(expected.subarray(0, existing.length))) throw Error('Report content conflict');
    // Resume only a byte-identical prefix left by our interrupted write, including partial UTF-8.
    if (existing.length < expected.length) await handle.writeFile(expected.subarray(existing.length));
    await handle.sync();
  } finally { await handle.close(); }
  const parent = await open(directory, 'r');
  try { await parent.sync(); } finally { await parent.close(); }
  return file;
}
