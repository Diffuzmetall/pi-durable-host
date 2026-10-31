import { createHash } from 'node:crypto';
import type { Context } from '@earendil-works/chord';
import { defineDocFamily, defineExtension, defineTask, type ConversationId, type Harness, type TaskId } from '@earendil-works/pi-durable';

export type OperatorIdentity = { conversationId: ConversationId; policyRef: string };
export type OperatorRequest = OperatorIdentity & { requestId: string; line: string };
export type OperatorReceipt = {
  requestId: string;
  conversationId: ConversationId;
  taskId: TaskId;
  status: 'queued' | 'started' | 'done' | 'failed' | 'uncertain';
  text?: string;
  error?: string;
};
type StoredReceipt = OperatorReceipt & { fingerprint: string };
interface GoalService {
  command(conversationId: ConversationId, line: string, context: Context): Promise<string>;
  protectsExecution(conversationId: ConversationId, context: Context): Promise<boolean>;
}
const Receipts = defineDocFamily<{ value?: StoredReceipt }, null>({
  kind: 'host.goal-operator.receipt', version: 1, family: true, scope: 'session',
  checkpointWhen: () => true, initial: () => ({}),
});
const keyOf = (conversationId: ConversationId, requestId: string) => JSON.stringify([conversationId, requestId]);
const publicReceipt = ({ fingerprint: _, ...value }: StoredReceipt): OperatorReceipt => value;
const finish = (value: StoredReceipt) => value.status === 'done'
  ? { status: 'terminal', outcome: { status: 'completed', result: publicReceipt(value) } } as const
  : { status: 'terminal', outcome: { status: 'failed', error: { message: value.error ?? 'GOAL_OPERATOR_OUTCOME_UNCERTAIN' } } } as const;

/** Admission only: the actual session Goal service still owns all Goal parsing/state/effects. */
export function createGoalOperator(options: {
  authorize(identity: OperatorIdentity, context: Context): boolean | Promise<boolean>;
}) {
  if (typeof options?.authorize !== 'function') throw Error('GOAL_OPERATOR_AUTHORIZATION_REQUIRED');
  let host: Harness | undefined;
  let service: GoalService | undefined;
  let root: ConversationId | undefined;
  let closed = false;
  const bound = () => {
    if (!host || !service || closed) throw Error('GOAL_OPERATOR_UNAVAILABLE');
    return { host, service };
  };
  const authorize = async (identity: OperatorIdentity, context: Context) => {
    bound();
    if (identity.conversationId !== root || await options.authorize(identity, context) !== true || closed)
      throw Error('GOAL_OPERATOR_HUMAN_AUTHORITY_REQUIRED');
  };
  const validate = (request: OperatorIdentity & { requestId: string }) => {
    if (typeof request.policyRef !== 'string' || !request.policyRef.trim() || request.policyRef.length > 1024 ||
      typeof request.requestId !== 'string' || !request.requestId.trim() || request.requestId.length > 1024)
      throw Error('GOAL_OPERATOR_INVALID_REQUEST');
  };
  const Task = defineTask<OperatorRequest, { phase: 'execute' }, OperatorReceipt>({
    name: 'host.goal-operator', version: 1, initial: () => ({ phase: 'execute' }),
    phases: { execute: async (record, runtime, context) => {
      const request = record.input;
      const key = keyOf(runtime.conversationId, request.requestId);
      // A durable marker fences all re-invocations, including crash after effect but before ACK.
      let invoke = false;
      await runtime.commit(async tx => {
        const value = (await tx.doc(Receipts, key, null)).value;
        if (!value || value.taskId !== record.id) throw Error('GOAL_OPERATOR_RECEIPT_MISMATCH');
        if (value.status === 'queued') { value.status = 'started'; invoke = true; }
        else if (value.status === 'started') { value.status = 'uncertain'; value.error = 'GOAL_OPERATOR_OUTCOME_UNCERTAIN'; }
        return undefined;
      }, context);
      if (!invoke) return runtime.commit(async tx => finish((await tx.doc(Receipts, key, null)).value!), context);
      let invoked = false;
      let text: string | undefined;
      let error: string | undefined;
      try {
        await authorize(request, context);
        context.abortSignal?.throwIfAborted();
        invoked = true;
        text = await bound().service.command(runtime.conversationId, request.line, context);
      } catch (cause) {
        context.abortSignal?.throwIfAborted();
        error = invoked ? 'GOAL_OPERATOR_OUTCOME_UNCERTAIN' : 'GOAL_OPERATOR_HUMAN_AUTHORITY_REQUIRED';
      }
      await runtime.commit(async tx => {
        const value = (await tx.doc(Receipts, key, null)).value!;
        value.status = error ? invoked ? 'uncertain' : 'failed' : 'done';
        if (error) value.error = error;
        else value.text = text!;
        return finish(value);
      }, context);
    } },
    abort: async (record, runtime, context) => runtime.commit(async tx => {
      const value = (await tx.doc(Receipts, keyOf(runtime.conversationId, record.input.requestId), null)).value;
      if (value && value.status !== 'done') {
        value.status = value.status === 'queued' ? 'failed' : 'uncertain';
        value.error = value.status === 'failed' ? 'GOAL_OPERATOR_ABORTED_BEFORE_EFFECT' : 'GOAL_OPERATOR_OUTCOME_UNCERTAIN';
      }
      return { status: 'terminal', outcome: { status: 'aborted' } };
    }, context),
  });
  return {
    extension: defineExtension({ name: 'host-goal-operator', tasks: [Task] }),
    bind(value: Harness, actualGoalService: GoalService, rootConversationId: ConversationId) {
      if (host || closed || typeof actualGoalService?.command !== 'function' || typeof actualGoalService?.protectsExecution !== 'function')
        throw Error('GOAL_OPERATOR_INVALID_BIND');
      host = value; service = actualGoalService; root = rootConversationId;
    },
    async command(request: OperatorRequest, context: Context): Promise<OperatorReceipt> {
      validate(request);
      if (typeof request.line !== 'string' || !/^\/goal(?:\s|$)/u.test(request.line) || request.line.length > 100000)
        throw Error('GOAL_OPERATOR_INVALID_COMMAND');
      // Own the request before any await; caller mutation must not change its identity or effect.
      const input = { conversationId: request.conversationId, requestId: request.requestId, line: request.line, policyRef: request.policyRef };
      await authorize(input, context);
      const fingerprint = createHash('sha256').update(JSON.stringify(input)).digest('hex');
      return bound().host.commit(async tx => {
        await authorize(input, context);
        const doc = await tx.doc(Receipts, keyOf(input.conversationId, input.requestId), null);
        if (doc.value) {
          if (doc.value.fingerprint !== fingerprint) throw Error('GOAL_OPERATOR_REQUEST_CONFLICT');
          return publicReceipt(doc.value);
        }
        const taskId = await tx.createTask(Task, input, { conversationId: input.conversationId, ownership: { kind: 'conversation' }, background: true });
        doc.value = { requestId: input.requestId, conversationId: input.conversationId, fingerprint, taskId, status: 'queued' };
        return publicReceipt(doc.value);
      }, context);
    },
    async receipt(request: OperatorIdentity & { requestId: string }, context: Context): Promise<OperatorReceipt | undefined> {
      validate(request);
      const input = { ...request };
      await authorize(input, context);
      const value = (await bound().host.snapshot(Receipts, keyOf(input.conversationId, input.requestId), context))?.value;
      return value ? publicReceipt(value) : undefined;
    },
    async protectsExecution(conversationId: ConversationId, context: Context) {
      return bound().service.protectsExecution(conversationId, context);
    },
    shutdown() { closed = true; },
  };
}
