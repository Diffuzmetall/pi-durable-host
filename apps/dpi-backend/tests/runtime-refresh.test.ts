import assert from 'node:assert/strict';
import { test } from 'node:test';
import { once } from 'node:events';
import { BACKGROUND_CONTEXT as ctx } from '@earendil-works/chord/context';
import { defineExtension, defineTool, defineTask } from '@earendil-works/pi-durable';
import { Type } from '@earendil-works/pi-ai';
import { Store } from '../src/store.js';
import { minimalProfile, type RuntimeProfileFactory, type RuntimeProfileContext, type RuntimeComposition } from '../src/runtime-profile.js';
import { createHttpServer } from '../src/http-server.js';
import { GrantPolicy, type GrantSpec } from '../src/grants.js';
import { DpiClient } from '../../dpi-sdk/src/client.js';
import { tempStore, faux, until } from './helpers.js';

const grant = (id: string, permissions: GrantSpec['permissions'] = ['read', 'write', 'control', 'filesystem']): GrantSpec => ({
  id, token: `fixture-refresh-${id}`, actor: id, source: 'terminal', authority: 'human', permissions, binding: {},
});
const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; };

async function fixture(hook?: (composition: RuntimeComposition, context: RuntimeProfileContext) => RuntimeComposition['prepareReload']) {
  const temporary = await tempStore();
  const policy = new GrantPolicy([grant('owner'), grant('viewer', ['read']), grant('revocable'), grant('queued'),
    { ...grant('foreign'), binding: { sessionId: 'not-this-session' } }]);
  let constructions = 0;
  const profile: RuntimeProfileFactory = Object.assign((context: RuntimeProfileContext) => {
    constructions++;
    const composition = minimalProfile(context);
    const prepare = hook?.(composition, context);
    // Bootstrap keeps this transport fixture's initial registry; exercise changes only on explicit reload.
    let initial = true;
    if (prepare) composition.prepareReload = async () => {
      if (initial) { initial = false; return { publish() {} }; }
      return prepare();
    };
    return composition;
  }, { id: 'fixture-runtime-refresh@1' });
  const store = await Store.open({ ...temporary.options, profile });
  const server = createHttpServer(store, policy).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address(); assert.ok(address && typeof address === 'object');
  const base = `http://127.0.0.1:${address.port}`;
  const client = new DpiClient(base, grant('owner').token);
  return { store, policy, client, temporary, constructions: () => constructions,
    request: (path: string, body: unknown = {}, token = grant('owner').token, method = 'POST') => fetch(`${base}/v1${path}`, {
      method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      ...(method === 'GET' ? {} : { body: JSON.stringify(body) }),
    }),
    async close() { server.closeAllConnections(); await new Promise<void>(done => server.close(() => done())); await store.close(); await temporary.cleanup(); },
  };
}

test('HTTP/SDK refresh preserves exact runtime/history/models while unrelated session remains busy; GET never refreshes', { timeout: 20000 }, async () => {
  let calls = 0;
  const f = await fixture(composition => async () => {
    calls++;
    const extra = defineExtension({ name: 'fixture-hot-refresh', tools: [defineTool({ name: 'refresh_probe', description: 'Fixture',
      parameters: Type.Object({}), replay: 'safe', execute: async () => ({ output: [{ type: 'text', text: 'hot' }] }),
    })] });
    return { publish() { composition.registry.install(extra); composition.extensions.push(extra); } };
  });
  try {
    const A = await f.client.createSession({ name: 'A', cwd: f.temporary.work, model: faux });
    const B = await f.client.createSession({ name: 'B', cwd: f.temporary.work, model: faux });
    const a = await f.store.resolveAgent(A.id, 'main'), b = await f.store.resolveAgent(B.id, 'main');
    const seed = await f.store.send(b.c, { content: 'saved history', requestId: 'refresh-history' });
    assert.equal((await f.store.settled(b.h, seed.id as number, 5000)).status, 'done');
    const history = await f.store.entries(b.c, undefined, 100), before = await b.c.agent(ctx);
    await f.store.send(a.c, { content: '!sleep 30', requestId: 'unrelated-busy' });
    await until(async () => (await f.store.liveTasks(a.h)).length > 0);
    assert.ok((await f.client.protocol()).capabilities.includes('runtime-refresh.v1'));
    await f.client.session(B.id).get(); await f.client.agent(B.id, 1).get();
    assert.equal(calls, 0, 'metadata GET must not attach');
    await assert.rejects(f.client.session(A.id).refreshRuntime(), { status: 409 });
    assert.deepEqual(await f.client.session('B').refreshRuntime(), { sessionId: B.id, refreshed: true });
    assert.equal(calls, 1); assert.equal(f.constructions(), 2);
    assert.equal(f.store.harness(f.store.resolveSession(B.id)), b.h);
    assert.equal((await b.h.root(ctx)).id, b.c.id);
    assert.deepEqual(await f.store.entries(b.c, undefined, 100), history);
    assert.deepEqual((await b.c.agent(ctx)).model, before.model);
    assert.equal((await b.c.agent(ctx)).cwd, before.cwd);
    assert.ok((await f.client.agent(B.id, 1).get()).tools.some(tool => tool.name === 'refresh_probe' && tool.offered));
    assert.equal(f.store.harness(f.store.resolveSession(A.id)), a.h);
    assert.ok((await f.store.liveTasks(a.h)).length > 0, 'A was not interrupted');
    await a.c.abort(ctx, { background: true });
  } finally { await f.close(); }
});

test('refresh rejects unsupported hooks, unknown payloads, arrays/null, unauthorized and scoped foreign sessions', async () => {
  let calls = 0;
  const f = await fixture((_composition, context) => context.cwd ? async () => { calls++; return { publish() {} }; } : undefined);
  try {
    const B = await f.client.createSession({ name: 'B', cwd: f.temporary.work, model: faux });
    const path = `/sessions/${B.id}/runtime/refresh`;
    for (const body of [{ module: '/tmp/untrusted.mjs' }, { path: '/tmp/untrusted' }, { enabled: true }, [], null, 'code']) {
      assert.equal((await f.request(path, body)).status, 400);
    }
    assert.equal((await f.request(path, {}, 'wrong-token')).status, 401);
    assert.equal((await f.request(path, {}, grant('viewer').token)).status, 403);
    assert.equal((await f.request(path, {}, grant('foreign').token)).status, 403);
    assert.equal(calls, 0);
  } finally { await f.close(); }
  const unsupported = await fixture();
  try {
    const B = await unsupported.client.createSession({ name: 'B', cwd: unsupported.temporary.work, model: faux });
    await assert.rejects(unsupported.client.session(B.id).refreshRuntime(), { status: 503, code: 'unavailable' });
  } finally { await unsupported.close(); }
});

test('refresh and reload share fail-fast fencing, revoke before publication, sanitize failure and release the fence', { timeout: 15000 }, async () => {
  let entered = deferred(), release = deferred(), count = 0, published = 0, fail = false;
  const f = await fixture(() => async () => {
    count++; entered.resolve();
    await release.promise;
    if (fail) throw Error('SECRET_REFRESH_ERROR /private/module.mjs');
    return { publish() { published++; } };
  });
  try {
    const B = await f.client.createSession({ name: 'B', cwd: f.temporary.work, model: faux });
    const path = `/sessions/${B.id}/runtime/refresh`;
    const first = f.request(path); await entered.promise;
    assert.equal((await f.request('/sessions/B/runtime/refresh')).status, 409);
    assert.equal((await f.request(`/sessions/${B.id}/reload`)).status, 409);
    assert.equal(count, 1, 'aliases must not run a second preparer concurrently');
    release.resolve(); assert.equal((await first).status, 200); assert.equal(published, 1);
    f.policy.revoke('queued');
    assert.equal((await f.request(path, {}, grant('queued').token)).status, 401);
    assert.equal(count, 1, 'revoked request must not enter preparation');
    entered = deferred(); release = deferred();
    const revokedDuring = f.request(path, {}, grant('revocable').token); await entered.promise;
    f.policy.revoke('revocable'); release.resolve();
    assert.equal((await revokedDuring).status, 401);
    assert.equal(published, 1, 'revocation before publication must leave active services untouched');
    fail = true;
    const failure = await f.request(path), text = await failure.text();
    assert.equal(failure.status, 503); assert.doesNotMatch(text, /SECRET_REFRESH_ERROR|private\/module/);
    fail = false;
    assert.equal((await f.request(path)).status, 200, 'failed reload must not poison subsequent refresh');
  } finally { release.resolve(); await f.close(); }
});

test('refresh scans beyond first task page and rejects a lone background sleeper after 505 terminal tasks', { timeout: 30000 }, async () => {
  let calls = 0;
  const task = defineTask<{ hold: boolean }, { phase: 'run' }, void>({
    name: 'fixture.refresh-pagination', version: 1, initial: () => ({ phase: 'run' }),
    phases: { run: async (record, runtime, context) => {
      if (record.input.hold) await runtime.sleepUntil(runtime.now() + 86400000, { phase: 'run' }, context);
      else await runtime.commit(() => ({ status: 'terminal', outcome: { status: 'completed', result: undefined } }), context);
    } },
    abort: async (_record, runtime, context) => { await runtime.commit(() => ({ status: 'terminal', outcome: { status: 'aborted' } }), context); },
  });
  const f = await fixture(composition => {
    composition.registry.install(defineExtension({ name: 'fixture-pagination', tasks: [task] }));
    return async () => { calls++; return { publish() {} }; };
  });
  try {
    const B = await f.client.createSession({ name: 'B', cwd: f.temporary.work, model: faux });
    const { h, c } = await f.store.resolveAgent(B.id, 'main');
    await h.commit(async tx => {
      for (let i = 0; i < 505; i++) await tx.createTask(task, { hold: false }, { conversationId: c.id, ownership: { kind: 'conversation' }, background: true });
    }, ctx);
    await until(async () => (await f.store.liveTasks(h)).length === 0, 20000, '505 native tasks settle');
    const sleeper = await h.commit(tx => tx.createTask(task, { hold: true }, { conversationId: c.id, ownership: { kind: 'conversation' }, background: true }), ctx);
    await until(async () => (await f.store.liveTasks(h)).some(node => node.id === sleeper));
    const firstPage = await h.commit(tx => tx.scanTasks({}, 500), ctx);
    assert.equal(firstPage.items.length, 500); assert.ok(firstPage.next);
    assert.ok(firstPage.items.every(record => record.state.status === 'terminal'));
    assert.ok((await f.store.liveTasks(h)).every(node => node.background));
    await assert.rejects(f.client.session(B.id).refreshRuntime(), { status: 409 });
    assert.equal(calls, 0, 'background task beyond page one must block refresh');
    await c.abort(ctx, { background: true });
    await until(async () => (await f.store.liveTasks(h)).length === 0);
    assert.deepEqual(await f.client.session(B.id).refreshRuntime(), { sessionId: B.id, refreshed: true });
    assert.equal(calls, 1);
  } finally { await f.close(); }
});
