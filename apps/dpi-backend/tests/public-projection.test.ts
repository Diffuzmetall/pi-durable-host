import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ConversationId, HarnessInspection, TaskId } from '@earendil-works/pi-durable';
import type { JsonValue } from '@earendil-works/chord';
import * as projection from '../src/public-projection.js';
const { publicProjection } = projection;

const document = { role: 'assistant', stopReason: 'error', content: [{ type: 'text', text: 'BENIGN_BUSINESS_DATA' }], errorMessage: 'business diagnostic' };
const failed = { role: 'assistant', stopReason: 'error', provider: 'fixture', model: 'exact-id', content: [{ type: 'text', text: 'PRIVATE_FAILED_BODY' }], errorMessage: 'PRIVATE_OLD_CREDENTIAL' };
const healthy = { role: 'assistant', stopReason: 'toolUse', content: [{ type: 'toolCall', id: 'real-call', name: 'fixture_json_consumer', arguments: { document } }] };
const result = { role: 'toolResult', toolCallId: 'real-call', toolName: 'fixture_json_consumer', content: [{ type: 'text', text: 'useful result' }], details: { document } };
const entries = [
  { id: 42, conversationId: 1, kind: 'pi.assistant', model: [failed] },
  { id: 43, conversationId: 1, kind: 'pi.assistant', model: [healthy] },
  { id: 44, conversationId: 1, kind: 'pi.tool-result', model: [result], data: { document } },
  { id: 45, conversationId: 1, kind: 'application.example', data: { document } },
] as const;

test('entry projection masks only native failures and preserves benign structured arguments/results/application data', () => {
  const projected = publicProjection(entries, 'entries');
  assert.doesNotMatch(JSON.stringify(projected), /PRIVATE_/);
  assert.deepEqual(projected.slice(1), entries.slice(1));
  assert.deepEqual(projected.map(entry => entry.id), [42, 43, 44, 45]);
  assert.equal(projected[0].model?.[0].model, 'exact-id');
  assert.equal(entries[0].model?.[0].errorMessage, 'PRIVATE_OLD_CREDENTIAL');
  assert.equal(entries[1].model?.[0].content[0].arguments.document, document);
});

test('native event envelopes mask errors without recursively changing tool blocks or application details', () => {
  const events = [
    { type: 'snapshot', entries, compactions: [{ retry: { at: 1, error: 'PRIVATE_RETRY' } }], generation: { message: failed, retry: { at: 1, error: 'PRIVATE_RETRY' } } },
    { type: 'message_start', message: failed },
    { type: 'message_update', changes: [{ type: 'message', message: failed }, { type: 'block', block: healthy.content[0] }] },
    { type: 'message_end', entry: entries[0] },
    { type: 'entry_appended', entry: entries[0] },
    { type: 'tool_execution_end', entry: entries[2] },
    { type: 'tool_execution_update', details: { document } },
    { type: 'auto_retry_start', attempt: 2, at: 99, errorMessage: 'PRIVATE_RETRY' },
    { type: 'submission', record: { id: 7, status: 'failed', detail: 'PRIVATE_SUBMISSION' } },
  ] as const;
  const projected = publicProjection(events, 'events');
  assert.doesNotMatch(JSON.stringify(projected), /PRIVATE_/);
  assert.deepEqual(projected[2].changes?.[1], events[2].changes?.[1]);
  assert.deepEqual(projected[5], events[5]); assert.deepEqual(projected[6], events[6]);
  assert.deepEqual(projected[8].record, { id: 7, status: 'failed' });
  assert.equal(events[8].record?.detail, 'PRIVATE_SUBMISSION');
});

test('native compaction and task diagnostics are private on live events and reconnect snapshots', () => {
  const cause = 'SYNTHETIC_PRIVATE_COMPACTION_CAUSE';
  const failure = { taskId: 81, reason: 'manual', error: cause };
  const summary = { isError: true, durationMs: 12, usage: { tokens: 3 }, error: cause };
  const opaque = { type: 'compaction_end', error: 'application-owned error', summary: { error: 'opaque tool data' } };
  const events = [
    { type: 'compaction_end', ...failure },
    { type: 'snapshot', entries, compactions: [], compactionFailure: failure,
      nestedTools: [{ taskId: 82, callId: 'native/nested', parentCallId: 'native', parentTaskId: 80, arguments: opaque, summary }] },
    { type: 'task_failed', taskId: 83, kind: 'pi.compaction', message: cause },
    { type: 'compaction_end', taskId: 84, reason: 'background' },
    { type: 'tool_execution_update', details: opaque },
  ] as const;
  const original = JSON.stringify(events), projected = publicProjection(events, 'events');
  assert.equal(JSON.stringify(projected).includes(cause), false);
  assert.deepEqual(projected[0], { ...events[0], error: 'Provider request failed; details are private.' });
  assert.deepEqual(projected[1].compactionFailure, { ...failure, error: projected[0].error });
  assert.deepEqual(projected[1].nestedTools?.[0].summary, { ...summary, error: 'Task failed; details are private.' });
  assert.deepEqual(projected[1].nestedTools?.[0].arguments, opaque);
  assert.deepEqual(projected[2], { ...events[2], message: 'Task failed; details are private.' });
  assert.deepEqual(projected.slice(3), events.slice(3));
  assert.equal(JSON.stringify(events), original, 'native persisted history and event inputs are not rewritten');
  assert.deepEqual(publicProjection(events[1], 'events'), projected[1], 'single reconnect snapshot uses the same typed boundary');
});

test('typed task state hides failure causes but keeps status, scheduling and opaque results', () => {
  const cause = 'SYNTHETIC_PRIVATE_TASK_CAUSE';
  const opaque = { status: 'failed', error: { message: cause, detail: { application: true } }, checkpoint: { overflow: cause } };
  const checkpoint = { phase: 'prepare', overflow: cause, application: opaque };
  const completed = { status: 'terminal', outcome: { status: 'completed', result: opaque } } as const;
  const extension = { status: 'sleeping', until: 123, checkpoint } as const;
  assert.deepEqual(projection.publicTaskState(completed, 'pi.tool'), completed, 'tool/application results remain opaque');
  assert.deepEqual(projection.publicTaskState(extension, 'application.example'), extension, 'extension checkpoints are not recursively scrubbed');
  for (const status of ['terminal', 'completing'] as const) {
    for (const outcome of [
      { status: 'failed', error: { message: cause, detail: { cause, stack: cause } }, result: { healthy: true } },
      { status: 'faulted', error: { message: cause, detail: { cause, stack: cause } } },
    ] as const) {
      const state = { status, outcome };
      const original = JSON.stringify(state), projected = projection.publicTaskState(state, 'pi.compaction');
      assert.equal(JSON.stringify(projected).includes(cause), false);
      assert.deepEqual(projected, { status, outcome: { ...outcome, error: { message: 'Task failed; details are private.' } } });
      assert.equal(JSON.stringify(state), original);
    }
    for (const outcomeStatus of ['aborted', 'orphaned'] as const) {
      const state = { status, outcome: { status: outcomeStatus, reason: cause } };
      const projected = projection.publicTaskState(state, 'pi.compaction');
      assert.equal(JSON.stringify(projected).includes(cause), false);
      assert.equal(projected.status, status);
      assert.equal(projected.outcome?.status, outcomeStatus);
    }
  }
  const native = projection.publicTaskState(extension, 'pi.generation');
  assert.deepEqual(native, { ...extension, checkpoint: { ...checkpoint, overflow: 'Provider request failed; details are private.' } });
  assert.equal(extension.checkpoint.overflow, cause);
});

test('scheduler inspection projects only native diagnostic slots and preserves input, memos and scheduling', () => {
  const cause = 'SYNTHETIC_PRIVATE_INSPECTION_CAUSE';
  const opaque = { error: { message: 'OPAQUE_APPLICATION_MESSAGE' }, phase: 'prepare', overflow: 'application value' };
  const base = { id: 91 as TaskId<JsonValue>, conversationId: 1 as ConversationId, kind: 'pi.generation', version: 1,
    input: opaque, background: false, abortRequested: false };
  const inspection: HarnessInspection = {
    scheduling: 'paused', submissions: [], tasks: [
      { record: { ...base, memos: { application: opaque }, state: { status: 'pending', checkpoint: { phase: 'prepare', attempt: 1, overflow: cause } } },
        state: { kind: 'blocked', reason: 'migration_failed', error: { message: cause, stack: cause } } },
      { record: { ...base, id: 92 as TaskId<JsonValue>, kind: 'application.example', memos: { application: opaque },
        state: { status: 'pending', checkpoint: opaque } }, state: { kind: 'ready', migrates: false } },
      { record: { ...base, id: 93 as TaskId<JsonValue>, state: { status: 'completing', outcome: { status: 'failed', error: { message: cause, detail: { cause } } } } },
        state: { kind: 'completing' } },
    ],
  };
  const original = JSON.stringify(inspection), projected = projection.publicInspection(inspection);
  assert.equal(JSON.stringify(projected).includes(cause), false);
  assert.equal(projected.scheduling, inspection.scheduling);
  assert.deepEqual(projected.submissions, inspection.submissions);
  assert.deepEqual(projected.tasks.map(item => [item.record.id, item.record.conversationId]), [[91, 1], [92, 1], [93, 1]]);
  assert.deepEqual(projected.tasks[0].record.input, opaque);
  assert.deepEqual(projected.tasks[0].record.memos, { application: opaque });
  assert.deepEqual(projected.tasks[0].state, { kind: 'blocked', reason: 'migration_failed', error: 'Task failed; details are private.' });
  assert.deepEqual(projected.tasks[1], inspection.tasks[1], 'extension checkpoint/input/memos are not diagnostic fields');
  assert.deepEqual(projected.tasks[2].state, inspection.tasks[2].state);
  assert.equal(JSON.stringify(inspection), original);
});
