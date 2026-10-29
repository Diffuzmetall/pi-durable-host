import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once, EventEmitter } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Store } from '../src/store.ts';
import { GrantPolicy, createHttpServer } from '../src/http-server.ts';

for (const plainObject of [false, true]) test(`real SSE update diagnostics hide ${plainObject ? 'non-Error causes' : 'Error messages'} and keep the viewer alive`, { timeout: 10000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'dpi-stream-error-'));
  const store = await Store.open({ dataDir: join(root, 'data'), startDirs: [root], provider: 'faux' });
  const policy = new GrantPolicy([{ id: 'viewer', token: 'SYNTHETIC_VIEWER', actor: 'viewer', source: 'viewer', authority: 'observer', permissions: ['read'], binding: {} }]);
  const tree = store.tree.bind(store), events = new EventEmitter(), diagnostic = [];
  const sentinel = 'SYNTHETIC_SSE_CREDENTIAL_PRIVATE';
  let fail = false, recovery = false;
  store.tree = async () => {
    if (fail) throw plainObject ? { privateCause: sentinel } : Error(sentinel);
    return { ...await tree(), fixtureOpaque: recovery ? 'opaque token=business-data' : 'initial' };
  };
  const server = createHttpServer(store, policy).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const originalError = console.error;
  console.error = (...args) => { diagnostic.push(args.map(arg => typeof arg === 'string' ? arg : JSON.stringify(arg)).join(' ')); events.emit('diagnostic'); };
  const controller = new AbortController(); let reader;
  const readTree = async () => {
    let text = '';
    while (true) {
      const part = await reader.read();
      assert.equal(part.done, false, 'SSE must remain open after an update failure');
      text += new TextDecoder().decode(part.value);
      const frames = text.split('\n\n'); text = frames.pop();
      for (const frame of frames) {
        const data = frame.split('\n').find(line => line.startsWith('data: '));
        if (data) { const value = JSON.parse(data.slice(6)); if (value.type === 'tree') return value; }
      }
    }
  };
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/v1/events`, { headers: { authorization: 'Bearer SYNTHETIC_VIEWER' }, signal: controller.signal });
    assert.equal(response.status, 200); reader = response.body.getReader();
    assert.equal((await readTree()).tree.fixtureOpaque, 'initial');
    const logged = once(events, 'diagnostic', { signal: AbortSignal.timeout(3000) });
    fail = true; store.notify(); await logged;
    assert.equal(diagnostic.join('\n').includes(sentinel), false, 'raw async SDK cause must not enter diagnostics');
    assert.ok(diagnostic.length > 0, 'failure must retain a useful safe diagnostic');
    const safe = JSON.parse(diagnostic[0].slice('[dpi-backend] '.length));
    assert.deepEqual(Object.keys(safe).sort(), ['event', 'id', 'kind', 'operation']);
    assert.equal(safe.event, 'operation_failed'); assert.equal(safe.operation, 'stream.update');
    assert.equal(safe.kind, plainObject ? 'non-error' : 'Error');
    assert.match(safe.id, /^[0-9a-f-]{36}$/);
    fail = false; recovery = true; store.notify();
    const recovered = await readTree();
    assert.equal(recovered.tree.fixtureOpaque, 'opaque token=business-data');
    assert.equal(JSON.stringify(recovered).includes(sentinel), false);
  } finally {
    console.error = originalError;
    controller.abort(); await reader?.cancel().catch(() => {});
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    await store.close(); await rm(root, { recursive: true, force: true });
  }
});
