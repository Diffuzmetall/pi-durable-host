import assert from 'node:assert/strict';
import { test } from 'node:test';
import { once } from 'node:events';
import { createServer as createProxy, request as proxyRequest } from 'node:http';
import { BACKGROUND_CONTEXT as ctx } from '@earendil-works/chord/context';
import type { ConversationId } from '@earendil-works/pi-durable';
import { Store } from '../src/store.js';
import { createHttpServer } from '../src/http-server.js';
import { GrantPolicy, type GrantSpec } from '../src/grants.js';
import { createNativeProfile } from '../src/native-profile/profile.js';
import { JobJournal, JobScope } from '../src/native-profile/iii/index.js';
import { DpiClient } from '../../dpi-sdk/src/client.js';
import { tempStore, faux, until } from './helpers.js';

const owner: GrantSpec = { id: 'owner', token: 'fixture-iii-owner', actor: 'owner', source: 'terminal', authority: 'human',
  permissions: ['read','write','control','filesystem','human-accept'], binding: {} };

test('actual native iii isolated journal, canonical SDK retry/result/control and current delegated scope survive owner reopen', { timeout: 50000 }, async () => {
  const temp = await tempStore();
  let policy = new GrantPolicy([owner]);
  const profile = () => createNativeProfile({ policy, owner: policy.authenticate(owner.token),
    connectMcp: async () => ({ sources: [], close: async () => {} }), resolveSkill: async () => { throw Error('No fixture skills'); } });
  let store = await Store.open({ ...temp.options, profile: profile() });
  let server: ReturnType<typeof createHttpServer> | undefined;
  const start = async () => {
    server = createHttpServer(store, policy).listen(0, '127.0.0.1'); await once(server, 'listening');
    const address = server.address(); assert.ok(address && typeof address === 'object'); return `http://127.0.0.1:${address.port}`;
  };
  const closedStores = new WeakSet<Store>();
  const stop = async () => { if (server) { server.closeAllConnections(); await new Promise<void>(resolve => server!.close(() => resolve())); server = undefined; } if (!closedStores.has(store)) { closedStores.add(store); await store.close(); } };
  try {
    const A = await store.create({ name: 'iii-A', cwd: temp.work, model: faux });
    const B = await store.create({ name: 'iii-B', cwd: temp.work, model: faux });
    await store.close();
    const iii = (id: string, sessionId: string, bindingId: string): GrantSpec => ({ id, token: `fixture-iii-${id}`, actor: id, source: 'iii', authority: 'delegated',
      permissions: ['read','write','control'], binding: { sessionId, conversationId: 1,
        iii: { bindingId, namespace: 'durable-pi-test-http', configHash: 'a'.repeat(64), workerId: `verified-${id}` } } });
    const specs = [owner, iii('a', A.id, 'binding-a'), iii('b', B.id, 'binding-b'), iii('late', A.id, 'binding-late')];
    policy = new GrantPolicy(specs); store = await Store.open({ ...temp.options, profile: profile() });
    let base = await start(), client = new DpiClient(base, 'fixture-iii-a'), a = client.agent(A.id, 1);
    const b = new DpiClient(base, 'fixture-iii-b').agent(B.id, 1);
    const info = await a.iiiInfo();
    assert.equal(info.sessionId, 'binding-a'); assert.equal(info.nativeSessionId, A.id); assert.equal(info.ownerConversationId, 1);
    assert.equal(info.namespace, 'durable-pi-test-http'); assert.equal(info.configHash, 'a'.repeat(64)); assert.equal(info.workerId, 'verified-a');
    assert.equal(info.source, 'iii'); assert.equal(info.workspace, temp.work);
    assert.equal(info.authority, 'delegated'); assert.equal(info.jobCount, 0); assert.equal(info.capabilities.isolatedJobs, true);
    assert.equal(info.capabilities.treeEvents, false); assert.equal(info.capabilities.recovery, false);
    await assert.rejects(client.agent(B.id, 1).iiiInfo(), { status: 403 });
    await assert.rejects(new DpiClient(base, owner.token).agent(A.id, 1).iiiInfo(), { status: 403 });
    const input = { requestId: 'first', content: 'immutable native iii answer 😀' };
    const receipts = await Promise.all([a.iiiSubmit(input), a.iiiSubmit(input), a.iiiSubmit(input)]);
    assert.equal(new Set(receipts.map(value => value.submissionId)).size, 1);
    assert.equal(new Set(receipts.map(value => value.conversationId)).size, 1); assert.ok(receipts[0].conversationId! > 1);
    await until(async () => (await a.iiiRequest('first'))?.receipt?.status === 'done', 15000, 'real native iii answer');
    const first = (await a.iiiRequest('first'))!; assert.ok(first.result?.includes('immutable native iii answer'));
    const run = await a.iiiRun({ requestId: 'native-run', content: 'canonical submission wait, not admission' });
    assert.equal(run.receipt?.status, 'done'); assert.ok(run.resultInfo?.answerRef);
    const cancel = new AbortController();
    const disconnected = assert.rejects(a.iiiRun({ requestId: 'run-disconnect', content: 'slow: ' + 'native-wait-only-'.repeat(80) }, { signal: cancel.signal }));
    await until(async () => !!(await a.iiiRequest('run-disconnect'))?.submissionId, 10000, 'run accepted before caller disconnect');
    assert.notEqual((await a.iiiRequest('run-disconnect'))!.receipt!.status, 'done');
    cancel.abort(); await disconnected;
    await until(async () => (await a.iiiRequest('run-disconnect'))?.receipt?.status === 'done', 15000, 'native work completes after run waiter disconnect');
    assert.ok((await a.iiiRequest('run-disconnect'))!.result?.includes('native-wait-only'));
    // Actual loopback ACK loss after the owner has accepted and returned its canonical receipt.
    let dropped = false;
    const proxy = createProxy((req, res) => {
      const upstream = proxyRequest(base + req.url, { method: req.method, headers: req.headers }, reply => {
        if (!dropped && req.method === 'POST' && req.url?.endsWith('/iii/requests')) {
          dropped = true; reply.resume(); reply.once('end', () => res.destroy());
        } else { res.writeHead(reply.statusCode!, reply.headers); reply.pipe(res); }
      });
      upstream.on('error', error => res.destroy(error)); req.pipe(upstream);
    }).listen(0, '127.0.0.1'); await once(proxy, 'listening');
    try {
      const address = proxy.address(); assert.ok(address && typeof address === 'object');
      const lost = new DpiClient(`http://127.0.0.1:${address.port}`, 'fixture-iii-a').agent(A.id, 1);
      const intent = { requestId: 'lost-ack', content: 'one native input after actual ACK loss' };
      await assert.rejects(lost.iiiSubmit(intent)); assert.equal(dropped, true);
      const saved = (await a.iiiRequest('lost-ack'))!;
      assert.equal((await a.iiiSubmit(intent)).submissionId, saved.submissionId);
    } finally { proxy.closeAllConnections(); await new Promise<void>(resolve => proxy.close(() => resolve())); }
    assert.match(first.resultInfo!.answerRef, /^durable:\d+:\d+$/); assert.equal(first.jobId, 'first'); assert.equal(first.jobGeneration, 0);
    await assert.rejects(a.iiiSubmit({ ...input, content: 'changed' }), { status: 409 });
    await assert.rejects(a.iiiSubmit({ ...input, authority: 'human', _caller_worker_id: 'owner' } as never), { status: 400 });
    await assert.rejects(client.agent(A.id, first.conversationId!).iiiRequest('first'), { status: 403 }, 'job identity is not a client authority grant');
    const h = store.harness(store.resolveSession(A.id));
    const scope = await h.snapshot(JobScope, first.conversationId as ConversationId, ctx);
    assert.equal(scope!.sessionId, 'binding-a'); assert.equal(scope!.workspace, temp.work); assert.ok(scope!.policy?.startsWith('policy:'));
    const native = await h.commit(tx => tx.conversation(first.conversationId as ConversationId), ctx); assert.ok(native && !native.owner, 'original isolated ownerless job root');
    const handle = await h.conversation(first.conversationId as ConversationId, ctx);
    assert.deepEqual((await handle!.agent(ctx)).tools.map(tool => tool.name).sort(), [...info.tools].sort());
    const page = await a.iiiResult({ requestId: 'first', answerRef: first.resultInfo!.answerRef, limit: 3 });
    assert.equal(page.answerRef, first.resultInfo!.answerRef); assert.equal(page.sha256, first.resultInfo!.sha256); assert.ok(page.cursor);
    await assert.rejects(a.iiiResult({ requestId: 'first', answerRef: 'durable:1:99999' }), { status: 409 });
    const second = await a.iiiSubmit({ requestId: 'follow', jobId: 'first', operation: 'follow_up', content: 'follow up native iii' });
    assert.equal(second.conversationId, first.conversationId);
    await until(async () => (await a.iiiRequest('follow'))?.receipt?.status === 'done', 15000, 'native follow-up');
    assert.equal((await a.iiiRequest('first'))!.resultInfo!.answerRef, first.resultInfo!.answerRef, 'reference is the saved answer, never current tail/tree cursor');
    const target = { binding: 'binding-a', session: 'binding-a', type: 'conversation' as const, conversationId: first.conversationId! };
    const state = await a.iiiControl('controls::inspect', { target }) as { revision: string };
    assert.match(state.revision, /^[a-f0-9]{64}$/);
    const child = await a.iiiControl('subagents::spawn', { target, controlId: 'spawn-child', expectedRevision: state.revision, name: 'reader', task: 'answer without tools' }) as { childKey: string; conversationId: number; executionId: string; requestId: string };
    assert.ok(child.conversationId > 1); assert.ok(child.childKey); assert.ok(child.executionId);
    await assert.rejects(a.iiiControl('subagents::spawn', { target, controlId: 'stale-new', expectedRevision: state.revision, name: 'stale', task: 'must not run' }), { status: 409 });
    await b.iiiSubmit({ requestId: 'other', content: 'other native session' });
    const other = await new DpiClient(base, 'fixture-iii-late').agent(A.id, 1).iiiSubmit({ requestId: 'foreign-binding', content: 'other binding in SAME native session' });
    await assert.rejects(a.iiiControl('controls::inspect', { target: { ...target, conversationId: other.conversationId! } }), { status: 403 });
    const stopped = await a.iiiJobStop({ jobId: 'first', controlId: 'stop-job', expectedGeneration: 0 });
    assert.equal(stopped.stopped, true); assert.equal(stopped.outcome, 'stopped');
    assert.deepEqual(await a.iiiJobStop({ jobId: 'first', controlId: 'stop-job', expectedGeneration: 0 }), stopped);
    await assert.rejects(a.iiiSubmit({ requestId: 'no-steer-after-stop', jobId: 'first', operation: 'steer', content: 'not admitted' }), { status: 409 });
    assert.equal(await a.iiiRequest('no-steer-after-stop'), null);
    const generation = await a.iiiSubmit({ requestId: 'resume-job', jobId: 'first', operation: 'follow_up', content: 'explicit resume' });
    assert.equal(generation.jobGeneration, 1);
    await until(async () => (await a.iiiRequest('resume-job'))?.receipt?.status === 'done', 15000, 'generation1 native answer');
    const pendingStopJob = await a.iiiSubmit({ requestId: 'pending-stop-job', content: 'slow: ' + 'pending-stop-native-'.repeat(80) });
    const conversation = h.conversation.bind(h); let interruptedStop = false;
    h.conversation = async (id, context) => {
      if (id === pendingStopJob.conversationId && !interruptedStop) { interruptedStop = true; throw Error('Fixture after native job-stop intent, before abort'); }
      return conversation(id, context);
    };
    try { await assert.rejects(a.iiiJobStop({ jobId: 'pending-stop-job', controlId: 'pending-stop-control', expectedGeneration: 0 }), { status: 500 }); }
    finally { h.conversation = conversation; }
    assert.equal(interruptedStop, true);
    assert.equal((await a.iiiJobStopReceipt('pending-stop-control'))!.stopped, false, 'accepted intent is NOT an idle/fence acknowledgement');
    const lateInput = { requestId: 'slow-pending', content: 'slow: ' + 'late-native-result-'.repeat(80) };
    const acceptedLate = await a.iiiSubmit(lateInput);
    assert.notEqual((await a.iiiRequest('slow-pending'))!.receipt!.status, 'done', 'close after actual acceptance, before terminal answer');
    const ids = await h.commit(async tx => (await tx.scanConversations({}, 1000)).items.map(value => value.id), ctx);
    await stop(); store = await Store.open({ ...temp.options, profile: profile() }); base = await start();
    client = new DpiClient(base, 'fixture-iii-a'); a = client.agent(A.id, 1);
    assert.deepEqual(await a.iiiSubmit(input), first, 'native retry after full owner reopen is the SAME saved receipt/result');
    assert.deepEqual(await a.iiiJobStopReceipt('stop-job'), stopped);
    const settledStop = (await a.iiiJobStopReceipt('pending-stop-control'))!;
    assert.equal(settledStop.stopped, true); assert.equal(settledStop.controlId, 'pending-stop-control'); assert.equal(settledStop.expectedGeneration, 0);
    assert.deepEqual(await a.iiiJobStop({ jobId: 'pending-stop-job', controlId: 'pending-stop-control', expectedGeneration: 0 }), settledStop, 'accepted pending stop reconciles SAME intent/generation');
    await until(async () => (await a.iiiRequest('slow-pending'))?.receipt?.status === 'done', 15000, 'accepted job completes after native owner reopen');
    const lateAnswer = (await a.iiiRequest('slow-pending'))!;
    assert.equal(lateAnswer.submissionId, acceptedLate.submissionId); assert.equal(lateAnswer.conversationId, acceptedLate.conversationId);
    assert.ok(lateAnswer.resultInfo?.answerRef); assert.ok(lateAnswer.result?.includes('late-native-result'));
    assert.deepEqual(await a.iiiSubmit(lateInput), lateAnswer, 'same accepted job never replays/remaps after restart');
    const reset = await a.iiiResult({ requestId: 'first', answerRef: first.resultInfo!.answerRef, limit: 3 });
    assert.equal(reset.sha256, page.sha256); assert.equal(reset.text, page.text);
    await assert.rejects(a.iiiResult({ requestId: 'first', answerRef: first.resultInfo!.answerRef, limit: 3, cursor: page.cursor! }), { status: 409 }, 'ephemeral page cursor resets, immutable answerRef survives');
    const reopened = store.harness(store.resolveSession(A.id));
    assert.deepEqual(await reopened.commit(async tx => (await tx.scanConversations({}, 1000)).items.map(value => value.id), ctx), ids);
    // Revoke during a genuine awaited native creation, before the final in-Tx authorization checkpoint.
    const commit = reopened.commit.bind(reopened); let armed = true;
    reopened.commit = (fn, context) => commit(async tx => fn(new Proxy(tx, { get(t, key) {
      if (key === 'createConversation') return async (options: Parameters<typeof t.createConversation>[0]) => { const value = await t.createConversation(options); if (armed) { armed = false; policy.revoke('late'); } return value; };
      const value = Reflect.get(t, key); return typeof value === 'function' ? value.bind(t) : value;
    } })), context);
    try { await assert.rejects(new DpiClient(base, 'fixture-iii-late').agent(A.id, 1).iiiSubmit({ requestId: 'late-denied', content: 'no committed job' }), { status: 401 }); }
    finally { reopened.commit = commit; }
    assert.equal(armed, false);
    assert.deepEqual(await reopened.commit(async tx => (await tx.scanConversations({}, 1000)).items.map(value => value.id), ctx), ids);
    assert.equal((await reopened.snapshot(JobJournal, 'binding-late', ctx))!.requests['late-denied'], undefined);
    policy.revoke('a'); await assert.rejects(a.iiiRequest('first'), { status: 401 });
    await stop();
    for (const change of [{ configHash: 'b'.repeat(64) }, { namespace: 'durable-pi-test-other' }, { workerId: 'different-verified-worker' }]) {
      policy = new GrantPolicy(specs.map(spec => spec.id === 'a' ? { ...spec, binding: { ...spec.binding, iii: { ...spec.binding.iii!, ...change } } } : spec));
      let mismatch: Store | undefined;
      try {
        await assert.rejects(async () => { mismatch = await Store.open({ ...temp.options, profile: profile() }); await mismatch.resolveAgent(A.id, 'main'); }, { code: 'unavailable' }, 'changed trusted config/namespace/worker cannot reinterpret the saved journal before native resume; cached native cause is intentionally not public');
        assert.equal(mismatch!.errors.get(A.id), 'Internal error');
      } finally { await mismatch?.close(); }
    }
    policy = new GrantPolicy(specs); store = await Store.open({ ...temp.options, profile: profile() }); base = await start();
    a = new DpiClient(base, 'fixture-iii-a').agent(A.id, 1);
    assert.equal((await a.iiiRequest('first'))!.resultInfo!.answerRef, first.resultInfo!.answerRef, 'original configured identity can reopen unchanged durable result');
  } finally { await stop(); await temp.cleanup(); }
});
