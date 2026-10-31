import assert from 'node:assert/strict';
import { test } from 'node:test';
import { once } from 'node:events';
import { BACKGROUND_CONTEXT as ctx } from '@earendil-works/chord/context';
import type { ConversationId } from '@earendil-works/pi-durable';
import { Store } from '/tmp/dpi-packed-ngdj7Z/install/node_modules/dpi-backend/dist/dpi-backend/src/store.js';
import { createHttpServer } from '/tmp/dpi-packed-ngdj7Z/install/node_modules/dpi-backend/dist/dpi-backend/src/http-server.js';
import { GrantPolicy, type GrantSpec } from '/tmp/dpi-packed-ngdj7Z/install/node_modules/dpi-backend/dist/dpi-backend/src/grants.js';
import { createNativeProfile } from '/tmp/dpi-packed-ngdj7Z/install/node_modules/dpi-backend/dist/dpi-backend/src/native-profile/profile.js';
import { ExistingInputs } from '/tmp/dpi-packed-ngdj7Z/install/node_modules/dpi-backend/dist/dpi-backend/src/native-profile/admission/input-policy.js';
import { ParentControlsDoc } from '/tmp/dpi-packed-ngdj7Z/install/node_modules/dpi-backend/dist/dpi-backend/src/native-profile/subagents/parent-control.js';
import { DpiClient } from '/tmp/dpi-packed-ngdj7Z/install/node_modules/dpi-sdk/dist/client.js';
import type { NativeParentReceipt, NativeParentTarget } from '/tmp/dpi-packed-ngdj7Z/install/node_modules/dpi-sdk/dist/api.js';
import { tempStore, faux } from './helpers.js';

const owner: GrantSpec = { id: 'owner', token: 'fixture-parent-owner', actor: 'owner', source: 'terminal', authority: 'human',
  permissions: ['read', 'write', 'control', 'filesystem', 'human-accept'], binding: {} };
const target = (receipt: NativeParentReceipt): NativeParentTarget => ({ key: receipt.childKey!, conversationId: receipt.conversationId!,
  executionId: receipt.executionId!, requestId: receipt.requestId! });

test('Independent: parent late delegated prepareChild revocation cannot commit a new child', { timeout: 40000 }, async () => {
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
    const machine = (name: string, sessionId: string): GrantSpec => ({ id: name, token: `fixture-parent-${name}`, actor: name,
      source: 'iii', authority: 'delegated', permissions: ['read', 'write', 'control'], binding: { sessionId, conversationId: 1 } });
    policy = new GrantPolicy([owner, machine('machine-a', A.id), machine('machine-b', B.id),
      { id: 'viewer', token: 'fixture-parent-viewer', actor: 'viewer', source: 'terminal', authority: 'observer', permissions: ['read'], binding: {} }]);
    store = await Store.open({ ...temporary.options, profile: build() });
    let base = await start();
    let client = new DpiClient(base, 'fixture-parent-machine-a');
    let a = client.agent(A.id, 'main');
    const b = new DpiClient(base, 'fixture-parent-machine-b').agent(B.id, 'main');
    assert.ok((await client.protocol()).capabilities.includes('native-parent-control.v1'));
    const before = await a.parentControl();
    const command = { controlId: 'spawn-a', expectedRevision: before.revision, action: 'spawn' as const, name: 'worker-a', task: 'Answer briefly without tools.' };
    const receipt = await a.parentCommand(command);
    assert.equal(receipt.parentId, 1); assert.equal(receipt.version, 'native-parent-control/v1');
    assert.ok(receipt.conversationId! > 1); assert.ok(receipt.executionId); assert.ok(receipt.requestId);
    assert.deepEqual(await a.parentCommand(command), receipt);
    assert.deepEqual(await a.parentReceipt(command.controlId), receipt);
    assert.equal(await a.parentReceipt('not-yet'), null);
    const h = store.harness(store.resolveSession(A.id));
    const child = await h.conversation(receipt.conversationId as ConversationId, ctx); assert.ok(child);
    assert.deepEqual((await child.agent(ctx)).tools.map(tool => tool.name).sort(), ['contact_supervisor', 'read']);
    const admission = await h.snapshot(ExistingInputs, child.id, ctx);
    assert.equal(admission!.inputs[receipt.requestId!].parent, 1);
    assert.equal(admission!.inputs[receipt.requestId!].policy.startsWith('policy:'), true);
    await assert.rejects(a.parentCommand({ ...command, task: 'Conflicting retry' }), { status: 409 });
    await assert.rejects(a.parentCommand({ ...command, controlId: 'stale-new' }), { status: 409 });
    const current = await a.parentControl();
    await assert.rejects(a.parentCommand({ ...command, controlId: 'forged-tools', expectedRevision: current.revision, tools: ['write'] }), { status: 403 });
    await assert.rejects(a.parentCommand({ ...command, controlId: 'body-authority', expectedRevision: current.revision,
      grant: { authority: 'human', tools: ['write'] } } as never), { status: 400 });
    await assert.rejects(client.agent(B.id, 'main').parentControl(), { status: 403 });
    await assert.rejects(new DpiClient(base, 'fixture-parent-viewer').agent(A.id, 'main').parentCommand(command), { status: 403 });
    await assert.rejects(new DpiClient(base, owner.token).agent(A.id, child.id).parentControl(), { status: 403 });
    const bState = await b.parentControl();
    const bReceipt = await b.parentCommand({ controlId: 'spawn-b', expectedRevision: bState.revision, action: 'spawn', name: 'worker-b', task: 'Answer B.' });
    await assert.rejects(a.parentCommand({ controlId: 'foreign-child', expectedRevision: (await a.parentControl()).revision,
      action: 'stop', target: target(bReceipt), scope: 'child-tree' }), { status: 403 });
    await assert.rejects(a.parentCommand({ controlId: 'wrong-execution', expectedRevision: (await a.parentControl()).revision,
      action: 'stop', target: { ...target(receipt), executionId: 'not-this-execution' }, scope: 'child-tree' }), { status: 409 });
    const stopped = await a.parentCommand({ controlId: 'stop-a', expectedRevision: (await a.parentControl()).revision,
      action: 'stop', target: target(receipt), scope: 'child-tree' });
    assert.equal(stopped.stopped, true); assert.equal(stopped.scope, 'child-tree');
    assert.deepEqual(await a.reconcileParent(), { reconciled: true });
    // Interrupt only the post-admission native lookup: the real accepted stop intent must remain recoverable.
    const conversation = h.conversation.bind(h);
    let interrupted = false;
    h.conversation = async (id, context) => {
      if (id === child.id && !interrupted) { interrupted = true; throw Error('Fixture post-admission child lookup interruption'); }
      return conversation(id, context);
    };
    try {
      await assert.rejects(a.parentCommand({ controlId: 'pending-stop', expectedRevision: (await a.parentControl()).revision,
        action: 'stop', target: target(receipt), scope: 'child-tree' }), { status: 500 });
    } finally { h.conversation = conversation; }
    assert.equal(interrupted, true);
    assert.equal((await a.parentReceipt('pending-stop'))!.stopped, false);
    const pending = await h.snapshot(ParentControlsDoc, 1 as ConversationId, ctx);
    const accepted = Object.values(pending!.commands).find(command => (command.receipt as { controlId: string }).controlId === 'pending-stop')!;
    assert.equal(accepted.phase, 'pending');
    const barrier = accepted.barrier;
    const agentIds = await h.commit(async tx => (await tx.scanConversations({}, 1000)).items.map(conversation => conversation.id), ctx);
    await stop();
    store = await Store.open({ ...temporary.options, profile: build() }); base = await start();
    client = new DpiClient(base, 'fixture-parent-machine-a'); a = client.agent(A.id, 'main');
    assert.deepEqual(await a.parentCommand(command), receipt);
    assert.deepEqual(await a.parentReceipt('stop-a'), stopped);
    assert.equal((await a.parentReceipt('pending-stop'))!.stopped, false);
    assert.deepEqual(await a.reconcileParent(), { reconciled: true });
    assert.equal((await a.parentReceipt('pending-stop'))!.stopped, true);
    const reconciled = await store.harness(store.resolveSession(A.id)).snapshot(ParentControlsDoc, 1 as ConversationId, ctx);
    const settled = Object.values(reconciled!.commands).find(command => (command.receipt as { controlId: string }).controlId === 'pending-stop')!;
    assert.equal(settled.phase, 'stopped'); assert.equal(settled.barrier, barrier);
    assert.deepEqual(await store.harness(store.resolveSession(A.id)).commit(async tx => (await tx.scanConversations({}, 1000)).items.map(conversation => conversation.id), ctx), agentIds);
    // Revoke after HTTP authorization but before the actual native transaction; no new child may commit.
    const reopened = store.harness(store.resolveSession(A.id)), authorize = policy.assertReference.bind(policy);
    const revision = (await a.parentControl()).revision;
    let armed = true;
    policy.assertReference = (handle, action, scope) => {
      const identity = authorize(handle, action, scope);
      if (armed && identity.actor === 'machine-a' && action === 'control') { armed = false; policy.revoke('machine-a'); }
      return identity;
    };
    try {
      await assert.rejects(a.parentCommand({ ...command, name: 'revoked-worker', controlId: 'revoke-before-native', expectedRevision: revision }), { status: 401 });
      assert.equal(armed, false, 'revoke hook ran inside actual native parent authorization');
    } finally { policy.assertReference = authorize; }
    assert.deepEqual(await reopened.commit(async tx => (await tx.scanConversations({}, 1000)).items.map(conversation => conversation.id), ctx), agentIds);
  } finally { await stop(); await temporary.cleanup(); }
});
