import assert from 'node:assert/strict';
import { test } from 'node:test';
import { once } from 'node:events';
import { BACKGROUND_CONTEXT as ctx } from '@earendil-works/chord/context';
import { Store } from '../src/store.js';
import type { ConversationId } from '@earendil-works/pi-durable';
import { createHttpServer } from '../src/http-server.js';
import { GrantPolicy, type GrantSpec } from '../src/grants.js';
import { createNativeProfile } from '../src/native-profile/profile.js';
import { createDurableBindingReader } from '../src/native-profile/bb-binding/binding-store.js';
import { DpiClient } from '../../dpi-sdk/src/client.js';
import type { NativeParentReceipt } from '../../dpi-sdk/src/api.js';
import { tempStore, faux } from './helpers.js';

const owner: GrantSpec = { id: 'owner', token: 'fixture-bb-owner', actor: 'owner', source: 'terminal', authority: 'human',
  permissions: ['read', 'write', 'control', 'filesystem', 'human-accept'], binding: {} };
const exact = (receipt: NativeParentReceipt) => ({ key: receipt.childKey!, conversationId: receipt.conversationId!, executionId: receipt.executionId!, requestId: receipt.requestId! });

test('BB HTTP/SDK uses genuine native owner Tx, server provider/thread scope, exact native child ownership and immutable CAS', { timeout: 40000 }, async () => {
  const temporary = await tempStore();
  let policy = new GrantPolicy([owner]);
  const build = () => createNativeProfile({ policy, owner: policy.authenticate(owner.token),
    resolveSkill: async () => { throw Error('No fixture skills'); }, connectMcp: async () => ({ sources: [], close: async () => {} }) });
  let store = await Store.open({ ...temporary.options, profile: build() });
  let server: ReturnType<typeof createHttpServer> | undefined;
  const start = async () => {
    server = createHttpServer(store, policy).listen(0, '127.0.0.1'); await once(server, 'listening');
    const address = server.address(); assert.ok(address && typeof address === 'object');
    return `http://127.0.0.1:${address.port}`;
  };
  const stop = async () => {
    if (server) { server.closeAllConnections(); await new Promise<void>(resolve => server!.close(() => resolve())); server = undefined; }
    await store.close();
  };
  try {
    const A = await store.create({ name: 'A', cwd: temporary.work, model: faux });
    const B = await store.create({ name: 'B', cwd: temporary.work, model: faux });
    await store.close();
    const bb = (id: string, sessionId: string, threadId: string, conversationId = 1, providerId = 'provider-one'): GrantSpec => ({
      id, token: `fixture-${id}`, actor: id, source: 'bb', authority: 'delegated', permissions: ['read', 'write', 'control'],
      binding: { sessionId, conversationId, bb: { providerId, threadId } },
    });
    const specs: GrantSpec[] = [owner, bb('root-a', A.id, 'root-a'), bb('root-b', B.id, 'root-b'), bb('other-provider', A.id, 'root-a', 1, 'provider-two'),
      { id: 'unconfigured', token: 'fixture-unconfigured', actor: 'unconfigured', source: 'bb', authority: 'delegated',
        permissions: ['read', 'write', 'control'], binding: { sessionId: A.id, conversationId: 1 } }];
    policy = new GrantPolicy(specs); store = await Store.open({ ...temporary.options, profile: build() });
    let base = await start();
    let a = new DpiClient(base, 'fixture-root-a').agent(A.id, 'main');
    const b = new DpiClient(base, 'fixture-root-b').agent(B.id, 'main');
    assert.equal(await a.bbBinding('root-a'), null);
    const root = await a.bindBbThread('root-a', { kind: 'root' });
    assert.deepEqual(root, { providerId: 'provider-one', sessionId: A.id, conversationId: 1, bbThreadId: 'root-a' });
    assert.deepEqual(await a.bindBbThread('root-a', { kind: 'root' }), root);
    assert.deepEqual(await a.bbBinding('root-a'), root);
    await b.bindBbThread('root-b', { kind: 'root' });
    await assert.rejects(a.bindBbThread('wrong-root', { kind: 'root' }), { status: 403 });
    await assert.rejects(a.bindBbThread('root-a', { kind: 'root', providerId: 'forged-provider', authority: 'human' } as never), { status: 400 });
    await assert.rejects(new DpiClient(base, owner.token).agent(A.id, 'main').bbBinding('root-a'), { status: 403 });
    await assert.rejects(new DpiClient(base, 'fixture-unconfigured').agent(A.id, 'main').bbBinding('root-a'), { status: 503 });
    const other = new DpiClient(base, 'fixture-other-provider').agent(A.id, 'main');
    assert.equal(await other.bbBinding('root-a'), null, 'provider is selected by server grant, never by requested thread text');
    await assert.rejects(other.bindBbThread('root-a', { kind: 'root' }), { status: 409 });
    assert.deepEqual(await a.bbBinding('root-a'), root);
    const receipt = await a.parentCommand({ action: 'spawn', controlId: 'child-a', expectedRevision: (await a.parentControl()).revision,
      name: 'worker-a', task: 'Answer A without tools.' });
    const childCommand = { kind: 'child' as const, target: exact(receipt) };
    const childBinding = await a.bindBbThread('child-a', childCommand);
    assert.deepEqual(childBinding, { providerId: 'provider-one', sessionId: A.id, conversationId: receipt.conversationId, bbThreadId: 'child-a', parentThreadId: 'root-a' });
    assert.deepEqual(await a.bindBbThread('child-a', childCommand), childBinding);
    assert.deepEqual(await a.bbBinding('child-a'), childBinding);
    await assert.rejects(a.bindBbThread('another-thread', childCommand), { status: 409 });
    await assert.rejects(a.bindBbThread('child-a', { kind: 'child', target: { ...exact(receipt), executionId: 'forged-execution' } }), { status: 403 });
    await assert.rejects(a.bindBbThread('child-a', { kind: 'child', target: { ...exact(receipt), requestId: 'forged-request' } }), { status: 403 });
    await assert.rejects(b.bindBbThread('child-a', childCommand), { status: 403 });
    await assert.rejects(a.bbBinding('foreign-or-missing-thread'), { status: 403 });
    await assert.rejects(new DpiClient(base, 'fixture-root-a').agent(B.id, 'main').bbBinding('root-b'), { status: 403 });
    // A child BB credential can only open its existing exact native binding, not claim a new root/parent.
    await stop(); specs.push(bb('child-a', A.id, 'child-a', receipt.conversationId));
    policy = new GrantPolicy(specs); store = await Store.open({ ...temporary.options, profile: build() }); base = await start();
    a = new DpiClient(base, 'fixture-root-a').agent(A.id, 'main');
    const child = new DpiClient(base, 'fixture-child-a').agent(A.id, receipt.conversationId!);
    assert.deepEqual(await child.bbBinding('child-a'), childBinding);
    assert.deepEqual(await a.bbBinding('child-a'), childBinding);
    assert.deepEqual(await a.bindBbThread('child-a', childCommand), childBinding);
    await assert.rejects(child.bbBinding('root-a'), { status: 403 });
    await assert.rejects(child.bindBbThread('child-a', { kind: 'root' }), { status: 403 });
    await assert.rejects(child.parentControl(), { status: 403 });
    const h = store.harness(store.resolveSession(A.id));
    const reader = createDurableBindingReader(h, ctx);
    assert.equal(await reader.findByThread({ providerId: 'provider-two', sessionId: A.id, bbThreadId: 'root-a' }), undefined, 'losing CAS never changes the native identity index');
    assert.equal(await reader.findByThread({ providerId: 'provider-one', sessionId: A.id, bbThreadId: 'another-thread' }), undefined);
    const fresh = await a.parentCommand({ action: 'spawn', controlId: 'fresh-unbound', expectedRevision: (await a.parentControl()).revision,
      name: 'fresh-unbound', task: 'New unbound child for late authorization rollback.' });
    const freshCommand = { kind: 'child' as const, target: exact(fresh) };
    assert.equal(await reader.get(fresh.conversationId! as ConversationId), undefined);
    const authorize = policy.assert.bind(policy); let armed = true;
    policy.assert = (handle, action, scope) => {
      const identity = authorize(handle, action, scope);
      if (armed && handle.id === 'root-a' && action === 'control') { armed = false; policy.revoke('root-a'); }
      return identity;
    };
    try { await assert.rejects(a.bindBbThread('revoked-thread', freshCommand), { status: 401 }); assert.equal(armed, false); }
    finally { policy.assert = authorize; }
    assert.equal(await reader.findByThread({ providerId: 'provider-one', sessionId: A.id, bbThreadId: 'revoked-thread' }), undefined);
    assert.equal(await reader.get(fresh.conversationId! as ConversationId), undefined, 'late revocation rolls back the native conversation binding too');
  } finally { await stop(); await temporary.cleanup(); }
});
