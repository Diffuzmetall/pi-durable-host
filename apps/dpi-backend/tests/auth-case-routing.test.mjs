import assert from 'node:assert/strict';
import { test } from 'node:test';
import { once } from 'node:events';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { Store } from '../src/store.js';
import { createHttpServer } from '../src/http-server.js';
import { GrantPolicy } from '../src/grants.js';
import { minimalProfile } from '../src/runtime-profile.js';
import { createNativeProfile } from '../src/native-profile/profile.js';
import { DpiClient } from '../../dpi-sdk/src/client.js';
import { tempStore, faux, until } from './helpers.js';

async function fixture() {
  const temporary = await tempStore();
  const store = await Store.open({ ...temporary.options, profile: minimalProfile });
  const session = await store.create({ name: 'CaseFixture', cwd: temporary.work, model: faux });
  const marker = 'TemporaryCasePermissionMarker';
  await mkdir(join(temporary.work, marker));
  const grant = (id, permissions, binding = {}, authority = 'human', source = 'terminal') =>
    ({ id, token: `fixture-case-${id}`, actor: id, source, authority, permissions, binding });
  const policy = new GrantPolicy([
    grant('owner', ['read', 'write', 'control', 'filesystem', 'human-accept']),
    grant('viewer', ['read'], {}, 'observer', 'bb'),
    grant('editor', ['read', 'write', 'control']),
    grant('scoped', ['read'], { sessionId: session.id, conversationId: 1 }),
    grant('worker', ['read', 'write', 'control'], { sessionId: session.id, conversationId: 1 }, 'delegated', 'iii'),
  ]);
  let browseCalls = 0, resolves = 0;
  const resolveSession = store.resolveSession.bind(store);
  store.resolveSession = (...args) => { resolves++; return resolveSession(...args); };
  const browse = store.browse.bind(store);
  store.browse = (...args) => { browseCalls++; return browse(...args); };
  const server = createHttpServer(store, policy).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const base = `http://127.0.0.1:${address.port}/v1`;
  const request = (path, id = 'viewer', method = 'GET', body) => fetch(base + path, {
    method, headers: { authorization: `Bearer fixture-case-${id}`, 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { store, policy, temporary, session, marker, request, browseCalls: () => browseCalls, resolves: () => resolves,
    agent: `/sessions/${session.id}/agents/main`,
    async close() {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
      await store.close();
      await temporary.cleanup();
    },
  };
}

test('real HTTP observer cannot gain filesystem access through route case', async () => {
  const f = await fixture();
  try {
    const query = `?path=${encodeURIComponent(f.temporary.work)}`;
    assert.equal((await f.request('/fs/dirs' + query)).status, 403);
    for (const path of ['/FS/dirs', '/fs/DIRS', '/Fs/DiRs']) {
      const response = await f.request(path + query);
      const text = await response.text();
      assert.ok([403, 404].includes(response.status), `${path}: expected 403/404, received ${response.status}`);
      assert.ok(!text.includes(f.marker), `${path}: filesystem name escaped`);
    }
    assert.equal(f.browseCalls(), 0, 'denied/case-varied requests never enter filesystem reader');
    const owner = await f.request('/fs/dirs' + query, 'owner');
    assert.equal(owner.status, 200);
    assert.ok((await owner.text()).includes(f.marker), 'canonical authorized filesystem access remains functional');
    assert.equal(f.browseCalls(), 1);
  } finally { await f.close(); }
});

test('special route case variants cannot enter the matched handler', async () => {
  const f = await fixture();
  try {
    const a = f.agent, s = `/sessions/${f.session.id}`;
    const cases = [
      ['GET', `${s}/Skills/BodyCase`], ['GET', `/Sessions/${f.session.id}/skills/BodyCase`],
      ['POST', `${a}/Goal/commands`], ['POST', `${a}/goal/Commands`],
      ['POST', `${a}/Messages`], ['POST', `/sessions/${f.session.id}/Agents/main/messages`],
      ['PUT', `${a}/BB-bindings/ThreadCase`], ['GET', `${a}/bb-bindings/ThreadCase/Outcome`],
      ['GET', `${a}/Parent-control`], ['POST', `${a}/parent-control/Commands`],
      ['POST', `${a}/parent-control/Reconcile`],
      ['GET', `${a}/III`], ['POST', `${a}/iii/Requests`], ['POST', `${a}/iii/Run`], ['POST', `${a}/Iii/result`],
      ['POST', `${a}/iii/Controls`], ['POST', `${a}/iii/Job-stop`],
    ];
    const before = f.resolves();
    for (const [method, path] of cases) {
      const response = await f.request(path, 'owner', method, method === 'GET' ? undefined : {});
      await response.arrayBuffer();
      assert.equal(response.status, 404, `${method} ${path}: literal route names must be canonical`);
    }
    for (const [method, path] of cases) {
      const response = await f.request(path, 'worker', method, method === 'GET' ? undefined : {});
      await response.arrayBuffer();
      assert.ok([403, 404].includes(response.status), `${method} ${path}: delegated case variation must not expand authority`);
    }
    assert.equal(f.resolves(), before, 'noncanonical literals never enter parameter resolution or native handlers');
    assert.equal((await f.request(`${s}/skills/BodyCase`, 'editor')).status, 403, 'canonical skill body still requires filesystem');
    assert.equal((await f.request(`${a}/goal/commands`, 'editor', 'POST', {})).status, 403, 'canonical Goal still requires human-accept');
    assert.equal((await f.request(`${a}/messages`, 'worker', 'POST', {})).status, 403, 'minimal profile does not advertise delegated admission');
  } finally { await f.close(); }
});

test('canonical scoped reads, protocol, revoke and opaque request IDs retain their semantics', async () => {
  const f = await fixture();
  try {
    const protocol = await f.request('/protocol', 'scoped');
    assert.equal(protocol.status, 200);
    assert.deepEqual(await protocol.json(), { apiVersion: 1, capabilities: ['events', 'docs', 'runtime-refresh.v1'] });
    assert.equal((await f.request(`${f.agent}/entries`, 'scoped')).status, 200);
    assert.equal((await f.request('/sessions/not-this-session/agents/main/entries', 'scoped')).status, 403);
    assert.equal((await f.request(`/sessions/${f.session.id}/agents/2/entries`, 'scoped')).status, 403);
    const requestId = 'MixedCase_Request:AaB9';
    const sent = await f.request(`${f.agent}/messages`, 'owner', 'POST', { content: 'Case-preservation fixture', requestId });
    assert.equal(sent.status, 202);
    const receipt = await f.request(`${f.agent}/receipts/${encodeURIComponent(requestId)}`, 'owner');
    assert.equal(receipt.status, 200);
    const native = await receipt.json();
    const lower = await f.request(`${f.agent}/receipts/${encodeURIComponent(requestId.toLowerCase())}`, 'owner');
    assert.equal(lower.status, 404, 'opaque request keys must not be lowercased with static route literals');
    const repeated = await f.request(`${f.agent}/messages`, 'owner', 'POST', { content: 'Case-preservation fixture', requestId });
    assert.equal(repeated.status, 202);
    assert.equal((await repeated.json()).submissionId, native.submissionId, 'canonical retry preserves the native submission');
    assert.equal(f.policy.revoke('scoped'), true);
    assert.equal((await f.request('/protocol', 'scoped')).status, 401);
    assert.equal((await f.request(`${f.agent}/entries`, 'scoped')).status, 401);
  } finally { await f.close(); }
});

test('canonical iii run uses native delegated write and disconnect cancels only its wait', { timeout: 30000 }, async () => {
  const temporary = await tempStore();
  const owner = { id: 'owner', token: 'fixture-case-run-owner', actor: 'owner', source: 'terminal', authority: 'human',
    permissions: ['read', 'write', 'control', 'filesystem', 'human-accept'], binding: {} };
  let policy = new GrantPolicy([owner]);
  const profile = () => createNativeProfile({ policy, owner: policy.authenticate(owner.token),
    connectMcp: async () => ({ sources: [], close: async () => {} }), resolveSkill: async () => { throw Error('No fixture skills'); } });
  let store = await Store.open({ ...temporary.options, profile: profile() });
  let server;
  try {
    const session = await store.create({ name: 'case-run', cwd: temporary.work, model: faux });
    await store.close();
    policy = new GrantPolicy([owner, { id: 'worker', token: 'fixture-case-run-worker', actor: 'worker', source: 'iii', authority: 'delegated',
      permissions: ['read', 'write', 'control'], binding: { sessionId: session.id, conversationId: 1,
        iii: { bindingId: 'case-run-binding', namespace: 'durable-pi-test-case', configHash: 'b'.repeat(64), workerId: 'verified-case-worker' } } }]);
    store = await Store.open({ ...temporary.options, profile: profile() });
    server = createHttpServer(store, policy).listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const base = `http://127.0.0.1:${address.port}`;
    const agent = new DpiClient(base, 'fixture-case-run-worker').agent(session.id, 'main');
    const input = { requestId: 'case-native-run', content: 'Canonical native run waits for the actual answer.' };
    const before = (await agent.iiiInfo()).jobCount;
    const wrongCase = await fetch(`${base}/v1/sessions/${session.id}/agents/main/iii/Run`, {
      method: 'POST', headers: { authorization: 'Bearer fixture-case-run-worker', 'content-type': 'application/json' }, body: JSON.stringify(input),
    });
    assert.ok([403, 404].includes(wrongCase.status));
    await wrongCase.arrayBuffer();
    assert.equal((await agent.iiiInfo()).jobCount, before, 'noncanonical run has no job effect');
    const result = await agent.iiiRun(input);
    assert.equal(result.receipt?.status, 'done');
    assert.ok(result.resultInfo?.answerRef, 'run returns a canonical completed answer, not an admission ACK');
    const controller = new AbortController();
    const requestId = 'case-run-disconnect';
    const rejected = assert.rejects(agent.iiiRun({ requestId, content: 'slow: ' + 'native-wait-only-'.repeat(80) }, { signal: controller.signal }));
    await until(async () => !!(await agent.iiiRequest(requestId))?.submissionId, 10000, 'native run admission');
    const accepted = await agent.iiiRequest(requestId);
    assert.notEqual(accepted.receipt.status, 'done');
    controller.abort();
    await rejected;
    await until(async () => (await agent.iiiRequest(requestId))?.receipt?.status === 'done', 15000, 'native result after run HTTP disconnect');
    const finished = await agent.iiiRequest(requestId);
    assert.equal(finished.submissionId, accepted.submissionId);
    assert.ok(finished.result?.includes('native-wait-only'));
  } finally {
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    await store.close();
    await temporary.cleanup();
  }
});
