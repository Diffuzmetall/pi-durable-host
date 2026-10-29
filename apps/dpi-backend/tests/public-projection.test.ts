import { test } from 'node:test';
import assert from 'node:assert/strict';
import { publicProjection } from '../src/public-projection.js';

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
