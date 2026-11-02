import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { Store } from '../src/store.js';
import { createHttpServer } from '../src/http-server.js';
import { minimalProfile, type RuntimeProfileFactory, type RuntimeProfileContext } from '../src/runtime-profile.js';
import { DpiClient } from '../../dpi-sdk/src/client.js';
import { faux, tempStore, until } from './helpers.js';

test('failed restoration keeps HTTP live but rejects legacy metadata mutations without changing catalog', async () => {
  const temp = await tempStore();
  let store = await Store.open({ ...temp.options, profile: minimalProfile });
  const session = await store.create({ name: 'failed-session', cwd: temp.work, model: faux });
  await store.close();
  const broken: RuntimeProfileFactory = Object.assign(() => {
    throw new Error('private-initializer-sentinel');
  }, { id: minimalProfile.id });
  store = await Store.open({ ...temp.options, profile: broken });
  const server = createHttpServer(store, 'readiness-test-token').listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  const client = new DpiClient(base, 'readiness-test-token');
  try {
    assert.equal((await fetch(`${base}/healthz`)).status, 200);
    assert.equal((await client.session(session.id).get()).id, session.id);
    // An old v1 client need not understand readiness to remain safe.
    for (const [method, suffix, body] of [
      ['PATCH', '', { name: 'must-not-rename' }],
      ['PATCH', '/compaction', { enabled: false }],
      ['DELETE', '', undefined],
    ] as const) {
      const response = await fetch(`${base}/v1/sessions/${session.id}${suffix}`, {
        method,
        headers: { authorization: 'Bearer readiness-test-token', 'content-type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      assert.equal(response.status, 503, `${method} ${suffix}`);
      const value = await response.json();
      assert.equal(value.error.code, 'unavailable');
      assert.ok(!JSON.stringify(value).includes('private-initializer-sentinel'));
    }
    assert.equal(store.row(session.id).name, 'failed-session');
    assert.equal(store.list().find(row => row.id === session.id)?.name, 'failed-session');
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await store.close();
    await temp.cleanup();
  }
});

test('HTTP and SDK expose ready sessions while another runtime is restoring or failed', async () => {
  const temp = await tempStore();
  let store = await Store.open({ ...temp.options, profile: minimalProfile });
  const slow = await store.create({ name: 'slow-session', cwd: temp.work, model: faux });
  const fast = await store.create({ name: 'fast-session', cwd: temp.work, model: faux });
  const broken = await store.create({ name: 'broken-session', cwd: temp.work, model: faux });
  await store.close();
  let release!: () => void;
  const blocked = new Promise<void>(resolve => { release = resolve; });
  const profile: RuntimeProfileFactory = Object.assign(async (context: RuntimeProfileContext) => {
    if (context.sessionId === slow.id) await blocked;
    if (context.sessionId === broken.id) throw new Error('private-recovery-sentinel');
    return minimalProfile(context);
  }, { id: minimalProfile.id });
  store = await Store.openCatalog({ ...temp.options, profile });
  const server = createHttpServer(store, 'readiness-test-token').listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  const client = new DpiClient(base, 'readiness-test-token');
  try {
    await until(async () => (await client.session(fast.id).get()).readiness === 'ready', 3000, 'fast session ready');
    await until(async () => (await client.session(broken.id).get()).readiness === 'failed', 3000, 'broken session failed');
    assert.deepEqual(await (await fetch(`${base}/healthz`)).json(), { ok: true });
    assert.equal((await client.protocol()).apiVersion, 1);
    assert.equal((await client.session(slow.id).get()).readiness, 'restoring');
    const summaries = await client.sessions();
    assert.equal(summaries.length, 3);
    assert.ok(!JSON.stringify(summaries).includes('private-recovery-sentinel'));
    await assert.rejects(client.session(slow.id).rename('not-ready'), { code: 'unavailable', status: 503 });
    await assert.rejects(client.agent(slow.id, 'main').get(), { code: 'unavailable', status: 503 });
    await assert.rejects(client.agent(broken.id, 'main').get(), { code: 'unavailable', status: 503 });
    assert.equal((await client.agent(fast.id, 'main').get()).id, 1);
    assert.equal((await client.session(fast.id).rename('fast-renamed')).name, 'fast-renamed');
    const result = await client.agent(fast.id, 'main').send('!printf fast-ready', 'followUp', 'fast-ready-request', 5000);
    assert.equal(result.status, 'done');
    const unauthenticated = await fetch(`${base}/v1/sessions`);
    assert.equal(unauthenticated.status, 401);
    release();
    await store.whenRestored();
    assert.equal((await client.session(slow.id).get()).readiness, 'ready');
    assert.equal((await client.agent(slow.id, 'main').get()).id, 1);
  } finally {
    release();
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await store.close();
    await temp.cleanup();
  }
});
