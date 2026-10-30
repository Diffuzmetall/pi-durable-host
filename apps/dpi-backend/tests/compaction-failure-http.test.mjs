import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { BACKGROUND_CONTEXT as context } from '@earendil-works/chord/context';
import { fauxProvider, fauxAssistantMessage } from '@earendil-works/pi-ai/providers/faux';
import { Store } from '../src/store.js';
import { minimalProfile } from '../src/runtime-profile.js';
import { createHttpServer } from '../src/http-server.js';
import { tempStore, faux } from './helpers.js';

test('real failed compaction is private on live SSE, reconnect and tasks without rewriting native history', { timeout: 25000 }, async () => {
  const temp = await tempStore();
  const cause = 'SYNTHETIC_RETAINED_COMPACTION_PRIVATE_CAUSE';
  const healthy = JSON.stringify({ error: { message: 'OPAQUE_BUSINESS_DATA' }, stopReason: 'error' });
  const abort = new AbortController(), reconnectAbort = new AbortController();
  let store, server, reader, reconnectReader, consume, live = '', reconnect = '';
  try {
    store = await Store.open({ ...temp.options, profile: minimalProfile });
    const provider = fauxProvider({ provider: 'faux', models: [{ id: 'echo', contextWindow: 128000, maxTokens: 8192 }] });
    store.models.setProvider(provider.provider);
    const session = await store.create({ name: 'private-compaction', cwd: temp.work, model: faux });
    const row = store.row(session.id), { h, c } = await store.resolveAgent(session.id, 'main');
    store.setCompaction(row, { enabled: false, keepRecentTokens: 500 });
    provider.setResponses(Array.from({ length: 4 }, () => fauxAssistantMessage(healthy)));
    for (let i = 0; i < 4; i++) {
      const submission = await c.submit({ type: 'input', content: `turn ${i} ${'ordinary context '.repeat(500)}` }, context);
      assert.equal((await submission.wait(context)).status, 'done');
    }
    server = createHttpServer(store, 'disposable-compaction-token').listen(0, '127.0.0.1');
    await once(server, 'listening');
    const base = `http://127.0.0.1:${server.address().port}/v1/sessions/${session.id}`;
    const agent = `${base}/agents/main`, headers = { authorization: 'Bearer disposable-compaction-token' };
    reader = (await fetch(`${agent}/events`, { headers, signal: abort.signal })).body.getReader();
    let firstFrame, endFrame;
    const snapshotSeen = new Promise(resolve => { firstFrame = resolve; });
    const compactionSeen = new Promise(resolve => { endFrame = resolve; });
    consume = (async () => {
      try {
        for (;;) {
          const chunk = await reader.read(); if (chunk.done) break;
          live += new TextDecoder().decode(chunk.value);
          if (live.includes('event: snapshot')) firstFrame();
          if (live.includes('"type":"compaction_end"')) endFrame();
        }
      } catch (error) { if (!abort.signal.aborted) throw error; }
    })();
    await snapshotSeen;
    provider.setResponses([fauxAssistantMessage('', { stopReason: 'error', errorMessage: `Provider rejected auth ${cause}` })]);
    const response = await fetch(`${agent}/compact`, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: '{}' });
    assert.equal(response.status, 200);
    const receipt = await response.json(), task = await h.waitForTask(receipt.taskId, context);
    assert.equal(task.state.outcome.status, 'failed', 'actual native task still fails, not a fabricated healthy receipt');
    const nativeState = JSON.stringify(task.state);
    assert.equal(nativeState.includes(cause), true, 'the private native failure must really contain the fixture cause');
    await compactionSeen;
    reconnectReader = (await fetch(`${agent}/events`, { headers, signal: reconnectAbort.signal })).body.getReader();
    while (!reconnect.includes('event: snapshot')) {
      const chunk = await reconnectReader.read(); if (chunk.done) break;
      reconnect += new TextDecoder().decode(chunk.value);
    }
    const taskResponse = await fetch(`${base}/tasks?status=terminal`, { headers });
    assert.equal(taskResponse.status, 200);
    const publicTasks = await taskResponse.json();
    const serializedTasks = JSON.stringify(publicTasks);
    assert.equal(live.includes(cause), false, 'live compaction_end/task_failed diagnostics are public-safe');
    assert.equal(reconnect.includes(cause), false, 'persisted reconnect compactionFailure is public-safe');
    assert.equal(serializedTasks.includes(cause), false, 'terminal task outcome diagnostics are public-safe');
    assert.ok(Array.isArray(publicTasks));
    const projected = publicTasks.find(item => item.id === receipt.taskId);
    assert.equal(projected.kind, 'pi.compaction');
    assert.equal(projected.conversationId, c.id);
    assert.equal(projected.state.status, task.state.status);
    assert.equal(projected.state.outcome.status, 'failed');
    assert.deepEqual(projected.state.outcome.error, { message: 'Task failed; details are private.' });
    const snapshot = reconnect.split('\n').filter(line => line.startsWith('data: ')).map(line => JSON.parse(line.slice(6)))
      .find(frame => frame.type === 'snapshot')?.snapshot;
    assert.ok(snapshot);
    assert.equal(snapshot.compactionFailure.taskId, receipt.taskId);
    assert.ok(snapshot.entries.some(entry => entry.model?.some(message => message.role === 'assistant'
      && message.content?.some(block => block.type === 'text' && block.text === healthy))), 'healthy opaque application JSON text is unchanged');
    assert.equal(JSON.stringify((await h.waitForTask(receipt.taskId, context)).state), nativeState, 'HTTP projection never rewrites persisted private task history');
  } finally {
    abort.abort(); reconnectAbort.abort(); await consume?.catch(() => {});
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    await store?.close(); await temp.cleanup();
  }
});
