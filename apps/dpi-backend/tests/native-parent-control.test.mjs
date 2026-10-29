import test from 'node:test';
import assert from 'node:assert/strict';
import { bindParentControl, PARENT_CONTROL_VERSION, TeamDoc, SubagentsDoc } from '../src/native-profile/subagents/index.js';
import installSubagents from '../src/native-profile/subagents/registry.js';
import { createRegistry, defineExtension } from '@earendil-works/pi-durable';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fixture, context, until } from './fixtures/native-subagents.mjs';

function controller(f, tools = ['read']) {
  let active = true;
  const api = bindParentControl(f.registry.snapshot().extension('subagent'), f.harness, context, async (_tx, parent) => {
    if (!active || parent !== f.root.id) throw Error('OWNER_DENIED');
    return { binding: 'fixture', policyReference: 'policy-1', tools };
  });
  return { api, revoke() { active = false; } };
}
test('local composition requires explicit admission without coupling authority to Hindsight', () => {
  const base = createRegistry();
  const guard = defineExtension({ name: 'retained-guard' });
  base.install(guard);
  assert.throws(() => installSubagents(base), /trusted host admission/);
  const result = installSubagents(base, async () => {});
  assert.equal(result.snapshot().extension('retained-guard'), guard);
  assert.ok(result.snapshot().extension('subagent'));
  assert.equal(result.snapshot().extension('hindsight'), undefined);
});

const target = (spawn, run = spawn) => ({ key: spawn.executionId, conversationId: spawn.conversationId, executionId: run.executionId, requestId: run.requestId });
const command = async (api, parent, fields) => api.execute(parent, { expectedRevision: (await api.inspect(parent)).revision, ...fields });

test('owner capability is exact, atomic, idempotent and preserves child/execution lineage without a parent model command', { timeout: 15000 }, async () => {
  const f = await fixture({ admit: async () => {} });
  try {
    const { api, revoke } = controller(f);
    assert.equal(api.version, PARENT_CONTROL_VERSION);
    assert.throws(() => bindParentControl({ name: 'not-the-owner' }, f.harness, context, async () => {}), /missing/);
    const first = { controlId: 'one', action: 'spawn', name: 'one', task: 'job:done:one', tools: ['read'], expectedRevision: (await api.inspect(f.root.id)).revision };
    const [a, b] = await Promise.all([api.execute(f.root.id, first), api.execute(f.root.id, first)]);
    assert.deepEqual(a, b);
    assert.equal(Object.keys((await f.state()).agents).length, 1);
    assert.equal(f.parentInputs.some(s => s.startsWith('{"tool"')), false, 'No parent model tool prompt dispatch');
    await until(async () => (await f.harness.snapshot(TeamDoc, f.root.id, context)).executions[a.executionId]?.done);
    const before = f.childInputs.length;
    assert.deepEqual(await api.execute(f.root.id, first), a);
    await assert.rejects(api.execute(f.root.id, { ...first, task: 'changed' }), /conflicts/);
    await assert.rejects(api.execute(f.root.id, { ...first, controlId: 'stale' }), /revision conflict/);
    const next = await command(api, f.root.id, { controlId: 'two', action: 'send', target: target(a), task: 'job:done:two', followUp: true });
    assert.equal(next.conversationId, a.conversationId);
    assert.notEqual(next.executionId, a.executionId);
    assert.notEqual(next.requestId, a.requestId);
    assert.equal(next.priorExecutionId, a.executionId);
    await until(async () => (await f.harness.snapshot(TeamDoc, f.root.id, context)).executions[next.executionId]?.done);
    assert.equal(f.childInputs.length, before + 1);
    const child = await f.harness.conversation(a.conversationId, context);
    assert.deepEqual((await child.agent(context)).tools.map(t => t.name).sort(), ['contact_supervisor', 'read']);
    await assert.rejects(command(api, f.root.id, { controlId: 'forged', action: 'send', target: { ...target(a), conversationId: a.conversationId + 100 }, task: 'job:done:bad' }), /identity conflict/);
    await assert.rejects(command(api, f.root.id, { controlId: 'forged-human', action: 'spawn', name: 'bad', task: 'job:done:bad', humanApproved: true }), /Invalid parent command/);
    await assert.rejects(command(api, f.root.id, { controlId: 'write', action: 'spawn', name: 'bad', task: 'job:done:bad', tools: ['gate'] }), /tool denied/);
    revoke();
    await assert.rejects(api.get(f.root.id, 'one'), /OWNER_DENIED/);
  } finally { await f.close(); }
});

test('current server policy revision is checked inside native parent-control commit', { timeout: 15000 }, async () => {
  const f = await fixture({ admit: async () => {} });
  let policyReference = 'policy-before';
  let allowed = true;
  const api = bindParentControl(f.registry.snapshot().extension('subagent'), f.harness, context, async (_tx, parent) => {
    if (!allowed || parent !== f.root.id) throw Error('OWNER_DENIED');
    return { binding: 'delegated-fixture', policyReference, tools: ['read'] };
  });
  try {
    const expectedRevision = (await api.inspect(f.root.id)).revision;
    policyReference = 'policy-after';
    await assert.rejects(api.execute(f.root.id, { controlId: 'policy-race', action: 'spawn', name: 'denied', task: 'job:done:denied', expectedRevision }), /revision conflict/);
    const fresh = (await api.inspect(f.root.id)).revision;
    allowed = false;
    await assert.rejects(api.execute(f.root.id, { controlId: 'revoked', action: 'spawn', name: 'revoked', task: 'job:done:revoked', expectedRevision: fresh }), /OWNER_DENIED/);
    assert.equal(Object.keys((await f.state())?.agents ?? {}).length, 0);
    assert.equal(f.childInputs.length, 0);
  } finally { await f.close(); }
});

test('copied native definitions reopen existing child, task and canonical receipt identities', { timeout: 15000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dpi-native-subagents-'));
  const path = join(directory, 'session.sqlite');
  let f;
  try {
    f = await fixture({ path, admit: async () => {} });
    const { api } = controller(f);
    const receipt = await command(api, f.root.id, { controlId: 'persisted', action: 'spawn', name: 'persisted', task: 'job:done:persisted' });
    await until(async () => (await f.harness.snapshot(TeamDoc, f.root.id, context)).executions[receipt.executionId]?.done);
    const before = (await f.state()).agents[receipt.childKey];
    const anchor = await f.harness.getTask(before.ownerTaskId, context);
    assert.ok(anchor);
    await f.close();
    f = await fixture({ path, admit: async () => {} });
    const reopened = controller(f).api;
    assert.deepEqual(await reopened.get(f.root.id, 'persisted'), receipt);
    const after = (await f.state()).agents[receipt.childKey];
    assert.equal(after.conversationId, before.conversationId);
    assert.equal(after.ownerTaskId, before.ownerTaskId);
    assert.equal(after.reporter, before.reporter);
    assert.equal(after.requestId, before.requestId);
    assert.equal((await f.harness.getTask(after.ownerTaskId, context)).id, anchor.id);
    const child = await f.harness.conversation(after.conversationId, context);
    assert.equal((await child.agent(context)).model.modelId, f.provider.getModel().id);
    assert.equal(f.childInputs.length, 0, 'Opening a completed child did not rerun the faux model');
  } finally { await f?.close(); await rm(directory, { recursive: true, force: true }); }
});

test('machine supervisor replies use exact child/question/schema and canonical answered/cancelled semantics', { timeout: 15000 }, async () => {
  const f = await fixture({ admit: async () => {} });
  try {
    const { api } = controller(f);
    const child = await command(api, f.root.id, { controlId: 'question', action: 'spawn', name: 'question', task: 'job:interview:question' });
    const question = await until(async () => (await f.requests()).find(r => r.child === child.conversationId));
    const base = { controlId: 'reply', action: 'reply', target: target(child), replyTo: question.id, message: '{"color":"blue"}', expectedRevision: (await api.inspect(f.root.id)).revision };
    await assert.rejects(api.execute(f.root.id, { ...base, message: '{"color":"green"}' }), /permitted/);
    await assert.rejects(api.execute(f.root.id, { ...base, replyTo: 'foreign' }), /Foreign/);
    const answer = await api.execute(f.root.id, base);
    assert.deepEqual(await api.execute(f.root.id, base), answer);
    await assert.rejects(api.execute(f.root.id, { ...base, message: '{"color":"red"}' }), /conflicts/);
    await until(async () => (await f.harness.snapshot(TeamDoc, f.root.id, context)).executions[child.executionId]?.done);
    assert.equal((await f.requests()).find(r => r.id === question.id).state, 'answered');
    const other = await command(api, f.root.id, { controlId: 'cancel', action: 'spawn', name: 'cancel', task: 'job:decision:cancel' });
    const pending = await until(async () => (await f.requests()).find(r => r.child === other.conversationId));
    await command(api, f.root.id, { controlId: 'stop', action: 'stop', scope: 'child-tree', target: target(other) });
    await assert.rejects(command(api, f.root.id, { controlId: 'late', action: 'reply', target: target(other), replyTo: pending.id, message: 'late' }), /cancelled/);
  } finally { await f.close(); }
});

test('child-tree stop covers two admitted executions while real native parent and sibling stay live', { timeout: 15000 }, async () => {
  // Gate is a non-mutating, pre-existing fixture tool. No delegation or grandchild privilege is added.
  const f = await fixture({ admit: async () => {} });
  try {
    const { api } = controller(f, ['read', 'gate']);
    const a = await command(api, f.root.id, { controlId: 'a', action: 'spawn', name: 'one', task: 'job:progress:a' });
    const b = await command(api, f.root.id, { controlId: 'b', action: 'spawn', name: 'two', task: 'job:progress:b' });
    await until(() => f.blocked.includes(a.conversationId) && f.blocked.includes(b.conversationId));
    const next = await command(api, f.root.id, { controlId: 'a2', action: 'send', target: target(a), task: 'job:done:queued', followUp: true });
    await f.root.submit({ type: 'input', requestId: 'parent-live', content: JSON.stringify({ tool: 'gate', args: {} }) }, context);
    await until(() => f.blocked.includes(f.root.id));
    const stale = (await api.inspect(f.root.id)).revision;
    const a3 = await command(api, f.root.id, { controlId: 'a3', action: 'send', target: target(a, next), task: 'job:done:queued3', followUp: true });
    await assert.rejects(api.execute(f.root.id, { controlId: 'stale-stop', action: 'stop', scope: 'child-tree', target: target(a, next), expectedRevision: stale }), /revision conflict/);
    const stop = { controlId: 'stop', action: 'stop', scope: 'child-tree', target: target(a, a3), expectedRevision: (await api.inspect(f.root.id)).revision };
    const receipt = await api.execute(f.root.id, stop);
    assert.equal(receipt.stopped, true);
    assert.equal(receipt.scope, 'child-tree');
    const tasks = (await f.harness.inspect(context)).tasks;
    assert.equal(tasks.filter(t => t.record.conversationId === a.conversationId).length, 0);
    for (const id of [f.root.id, b.conversationId]) assert.ok(tasks.some(t => t.record.conversationId === id && !t.record.abortRequested));
    assert.deepEqual(await api.execute(f.root.id, stop), receipt);
    const resumed = await command(api, f.root.id, { controlId: 'new', action: 'send', target: target(a, a3), task: 'job:done:explicit-new' });
    assert.equal(resumed.conversationId, a.conversationId);
    assert.notEqual(resumed.executionId, a3.executionId);
    await until(async () => (await f.harness.snapshot(TeamDoc, f.root.id, context)).executions[resumed.executionId]?.done);
  } finally { await f.close(); }
});

test('a Reporter delayed after stopped-check cannot submit after the owner child fence', { timeout: 15000 }, async () => {
  let release, entered;
  const held = new Promise(resolve => { release = resolve; });
  const ready = new Promise(resolve => { entered = resolve; });
  const f = await fixture({ admit: async () => {}, options: { origin: { async submit(_child, _tasks, send, _ctx, key) {
    if (key?.startsWith('subagent:')) { entered(); await held; }
    return send();
  } } } });
  try {
    const { api } = controller(f);
    const child = await command(api, f.root.id, { controlId: 'late', action: 'spawn', name: 'late', task: 'job:done:late' });
    await ready;
    const stopped = await command(api, f.root.id, { controlId: 'stop', action: 'stop', scope: 'child-tree', target: target(child) });
    assert.equal(stopped.stopped, true);
    release();
    const receipts = await f.harness.snapshot(SubagentsDoc, f.root.id, context);
    const record = Object.values(receipts.agents)[0];
    await until(async () => (await f.harness.getTask(record.reporter, context))?.state.status === 'terminal');
    assert.equal(await f.harness.commit(tx => tx.submissionByRequest(child.conversationId, child.requestId), context), undefined);
    assert.equal(f.childInputs.length, 0);
  } finally { release(); await f.close(); }
});
