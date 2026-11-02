import assert from 'node:assert/strict';
import test from 'node:test';
import { join } from 'node:path';
import { DpiClient } from '../../dpi-sdk/src/client.js';
import { DpiError } from '../../dpi-sdk/src/errors.js';
import { bootServer, faux, newToken, tempStore, until } from './helpers.js';

test('receipt reconciliation retires only missing inputs, fences late arrival across restart and never replays', async () => {
  const t = await tempStore();
  const token = newToken();
  const backend = await bootServer({ home: join(t.root, 'host'), startDirs: t.work, token });
  const client = new DpiClient(backend.base, token);
  try {
    const session = await client.createSession({ name: 'reconcile', cwd: t.work, model: faux }, 'reconcile-session');
    const agent = client.agent(session.id, 'main');
    const base = `/v1/sessions/${session.id}/agents/1`;
    const before = await agent.entries({ scope: 'active' });
    const result = await client.request('POST', `${base}/receipts/missing/reconcile`, {});
    assert.deepEqual(result, { conversationId: 1, requestId: 'missing', accepted: false });
    assert.deepEqual((await agent.entries({ scope: 'active' })).items, before.items);
    const retired = (error: unknown) => error instanceof DpiError && error.status === 409;
    await assert.rejects(() => agent.send('must never execute', 'steer', 'missing'), retired);
    await backend.stop(); await backend.start();
    await assert.rejects(() => agent.send('must never execute', 'steer', 'missing'), retired);
    await agent.send('accepted once', 'steer', 'accepted');
    const accepted = await client.request<{ accepted: boolean; submissionId: number }>('POST', `${base}/receipts/accepted/reconcile`, {});
    assert.equal(accepted.accepted, true);
    assert.ok(accepted.submissionId > 0);
    // Racing reconciliation must either observe the accepted input or retire its key before admission.
    for (let i = 0; i < 8; i++) {
      const key = `race-${i}`;
      const [send, receipt] = await Promise.allSettled([
        agent.send(`race input ${i}`, 'followUp', key),
        client.request<{ accepted: boolean }>('POST', `${base}/receipts/${key}/reconcile`, {}),
      ]);
      assert.equal(receipt.status, 'fulfilled');
      if (receipt.status !== 'fulfilled') continue;
      if (receipt.value.accepted) assert.equal(send.status, 'fulfilled');
      else {
        assert.equal(send.status, 'rejected');
        await assert.rejects(() => agent.send(`race input ${i}`, 'followUp', key), retired);
      }
    }
    await agent.send('new input still works', 'followUp', 'fresh');
    await until(async () => JSON.stringify((await agent.entries({ scope: 'active' })).items).includes('new input still works'), 10000, 'new input');
    const entries = JSON.stringify((await agent.entries({ scope: 'active' })).items);
    assert.ok(!entries.includes('must never execute'));
  } finally { await backend.stop(); await t.cleanup(); }
});
