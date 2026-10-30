import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { Store } from '../src/store.js';
import { minimalProfile } from '../src/runtime-profile.js';
import { createHttpServer } from '../src/http-server.js';
import { BACKGROUND_CONTEXT as context } from '@earendil-works/chord/context';
import { fauxProvider, fauxAssistantMessage } from '@earendil-works/pi-ai/providers/faux';

test('HTTP inspect must not expose provider overflow checkpoint while real compaction is pending', { timeout: 15000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'astra-inspect-')), cwd = join(dir, 'work');
  let store, server, release;
  const held = new Promise(resolve => { release = resolve; });
  let entered; const reached = new Promise(resolve => { entered = resolve; });
  const sentinel = 'SYNTHETIC_ASTRA_OVERFLOW_CREDENTIAL';
  try {
    await mkdir(cwd);
    store = await Store.open({ dataDir: join(dir, 'data'), startDirs: [cwd], name: 'review', provider: 'faux', profile: minimalProfile });
    const faux = fauxProvider({ provider: 'faux', models: [{ id: 'echo', contextWindow: 128000, maxTokens: 8192 }] });
    store.models.setProvider(faux.provider);
    const session = await store.create({ name: 'overflow', cwd, model: { provider: 'faux', modelId: 'echo' } });
    const row = store.row(session.id), { c } = await store.resolveAgent(session.id, 'main');
    store.setCompaction(row, { enabled: true, keepRecentTokens: 500 });
    faux.setResponses(Array.from({ length: 4 }, () => fauxAssistantMessage('ordinary answer')));
    for (let i = 0; i < 4; i++) assert.equal((await (await c.submit({ type: 'input', content: `turn ${i} ${'ordinary context '.repeat(500)}` }, context)).wait(context)).status, 'done');
    faux.setResponses([
      fauxAssistantMessage('', { stopReason: 'error', errorMessage: `prompt too long ${sentinel}` }),
      async () => { entered(); await held; return fauxAssistantMessage('summary'); },
      fauxAssistantMessage('recovered answer'),
    ]);
    const submission = await c.submit({ type: 'input', content: 'trigger actual overflow recovery' }, context);
    await reached;
    server = createHttpServer(store, 'disposable-review-token').listen(0, '127.0.0.1');
    await once(server, 'listening');
    const url = `http://127.0.0.1:${server.address().port}/v1/sessions/${session.id}`;
    const headers = { authorization: 'Bearer disposable-review-token' };
    const inspectResponse = await fetch(`${url}/inspect`, { headers });
    assert.equal(inspectResponse.status, 200);
    const inspect = await inspectResponse.json();
    const activeResponse = await fetch(`${url}/tasks?status=live`, { headers });
    assert.equal(activeResponse.status, 200);
    const active = await activeResponse.text();
    const leaks = { inspectLeak: JSON.stringify(inspect).includes(sentinel), activeTasksLeak: active.includes(sentinel),
      pendingGenerationCheckpoint: inspect.tasks.some(t => t.record.kind === 'pi.generation' && t.record.state.checkpoint?.phase === 'prepare') };
    console.log('OVERFLOW_INSPECT_PROBE', JSON.stringify(leaks));
    assert.equal(leaks.pendingGenerationCheckpoint, true, 'actual persisted generation checkpoint must be waiting for compaction');
    release(); await submission.wait(context);
    assert.equal(leaks.inspectLeak, false);
    assert.equal(leaks.activeTasksLeak, false);
  } finally {
    release();
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    await store?.close(); await rm(dir, { recursive: true, force: true });
  }
});
