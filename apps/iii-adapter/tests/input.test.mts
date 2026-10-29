import { test } from 'node:test';
import assert from 'node:assert/strict';
import { input, requestKey } from '../src/domain.js';

test('original I job input grammar preserves exact stable request/job identity and operation/mode', () => {
  assert.deepEqual(input({ requestId: 'stable:1', content: 'original' }, 'followUp', 'start'),
    { requestId: 'stable:1', content: 'original', mode: 'followUp', operation: 'start' });
  assert.deepEqual(input({ requestId: 'next.2', jobId: 'stable:1', content: 'followup' }, 'steer', 'steer'),
    { requestId: 'next.2', jobId: 'stable:1', content: 'followup', mode: 'steer', operation: 'steer' });
  for (const id of ['stable:1', '0', 'job_2', 'x'.repeat(128)]) assert.equal(requestKey(id), id);
  for (const id of ['', '__proto__', 'constructor', 'prototype', '../foreign', 'contains space', 'x'.repeat(129), 1, null]) assert.throws(() => requestKey(id));
});

test('signed business fields cannot select identity, tools, source, mode or native targets', () => {
  const body = { requestId: 'stable', content: 'delegated fixture' };
  for (const extra of [{ source: 'terminal' }, { authority: 'human' }, { human: true }, { mode: 'local-iii' },
    { tools: ['bash'] }, { module: 'operator' }, { conversationId: 1 }, { policyRef: 'stolen' }, { _caller_worker_id: 'root' }]) {
    assert.throws(() => input({ ...body, ...extra }), /UNKNOWN_INPUT_FIELD/);
  }
  assert.throws(() => input(body, 'replace' as never), /INVALID_INPUT_MODE/);
  assert.throws(() => input(body, 'followUp', 'human' as never), /INVALID_INPUT_OPERATION/);
  assert.throws(() => input({ ...body, content: '' }));
  assert.throws(() => input({ ...body, content: 'x'.repeat(32769) }));
});
