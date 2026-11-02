import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BACKGROUND_CONTEXT as ctx } from '@earendil-works/chord/context';
import { fauxProvider, fauxAssistantMessage, fauxToolCall } from '@earendil-works/pi-ai/providers/faux';
import { createModels } from '@earendil-works/pi-ai/models';
import { Harness, createRegistry, UsageDoc } from '@earendil-works/pi-durable';
import { openNodeSqliteStorage } from '@earendil-works/pi-durable/storage/sqlite/node';
import { NodeExecutionEnv } from '@earendil-works/pi-durable/env/node';
import { createAutomation } from '../../../apps/dpi-backend/src/native-profile/automation/automation.ts';
import { NativeGoalsDoc } from '../../../apps/dpi-backend/src/native-profile/automation/native-contract.ts';
import { createTriggersExtension, WatchesDoc } from '../../../apps/dpi-backend/src/native-profile/automation/triggers.mjs';

const until = async (probe, message) => {
  const end = Date.now() + 6000;
  while (Date.now() < end) { if (await probe()) return; await new Promise(r => setTimeout(r, 10)); }
  throw Error(message);
};
const contract = { objective: 'Fixture summary preserves checked state', criteria: [{ id: 'checked', text: 'Check fixture' }],
  skills: [], permissions: { scope: ['Disposable sandbox'] }, limits: { maxCalls: 4 } };

// Actual Harness/SQLite and scheduler, but explicit faux models and no Host/Store imports.
test('native 1.5 preserves distinct fork model/thinking and per-model compaction budgets', { timeout: 15000 }, async t => {
  const cwd = await mkdtemp(join(tmpdir(), 'dm1-models-'));
  const provider = fauxProvider({ provider: 'dm1-faux', models: [
    { id: 'root', reasoning: true, contextWindow: 128000, maxTokens: 8192 },
    { id: 'child', reasoning: true, contextWindow: 64000, maxTokens: 4096 },
  ], tokensPerSecond: 100000 });
  const models = createModels(); models.setProvider(provider.provider);
  const registry = createRegistry();
  const automation = createAutomation({ authorize: id => id === 1, tools: [],
    resolveSkill: async () => { throw Error('No skill'); }, admit: async () => {} });
  for (const extension of automation.extensions) registry.install(extension);
  const h = await Harness.open(await openNodeSqliteStorage(join(cwd, 'session.sqlite')), { registry, models,
    env: async () => new NodeExecutionEnv({ cwd }), settings: { progress: { persistWithinMs: 0 }, compaction: { enabled: false, reserveTokens: 2000,
      keepRecentTokens: 0, modelOverrides: { 'dm1-faux/root': { reserveTokens: 1000 }, 'dm1-faux/child': { reserveTokens: 500 } } } } }, ctx);
  t.after(async () => { await automation.shutdown(ctx); await h.close(ctx); await rm(cwd, { recursive: true, force: true }); });
  const root = await h.root(ctx, { agent: { cwd, model: { provider: 'dm1-faux', modelId: 'root' }, thinkingLevel: 'high' } });
  await automation.bind(h);
  provider.setResponses(Array.from({ length: 4 }, () => fauxAssistantMessage('warmup '.repeat(1000))));
  let done;
  for (let n = 0; n < 4; n++) done = await (await root.submit({ type: 'input', content: `warmup ${n}` }, ctx)).wait(ctx);
  assert.equal(done.status, 'done');
  const child = await root.fork(done.answer, { ownership: { kind: 'ownerless' },
    agent: { model: { provider: 'dm1-faux', modelId: 'child' }, thinkingLevel: 'low' } }, ctx);
  assert.equal((await root.agent(ctx)).model.modelId, 'root');
  assert.equal((await root.agent(ctx)).thinkingLevel, 'high');
  assert.equal((await child.agent(ctx)).model.modelId, 'child');
  assert.equal((await child.agent(ctx)).thinkingLevel, 'low');
  await assert.rejects(automation.goals.create(child.id, contract, ctx), /AUTHORITY_REQUIRED/);
  const goal = await automation.goals.create(root.id, contract, ctx);
  // Seed an active persisted companion without admitting another generation. The
  // real native CompactionTask must invoke the companion's guarded summary hook.
  await h.commit(async tx => { const d = await tx.doc(NativeGoalsDoc); d.active = goal.id; d.goals[goal.id].status = 'running'; }, ctx);
  const calls = [];
  provider.setResponses(Array.from({ length: 2 }, () => (_transcript, options, _state, model) => {
    calls.push({ model: model.id, maxTokens: options.maxTokens, reasoning: options.reasoning });
    const message = fauxAssistantMessage('A factual bounded fixture summary.');
    message.usage.cost.totalFromProvider = true;
    return message;
  }));
  await root.compact(undefined, ctx); await root.waitForIdle(ctx);
  await child.compact(undefined, ctx); await child.waitForIdle(ctx);
  assert.deepEqual(calls, [{ model: 'root', maxTokens: 800, reasoning: 'high' }, { model: 'child', maxTokens: 400, reasoning: 'low' }]);
  const costs = (await h.snapshot(UsageDoc, root.id, ctx)).models['dm1-faux/root'].cost;
  assert.equal(costs.totalFromProvider, false, 'mixed catalog/billed provenance is boolean, never numeric accumulation');
  for (const key of ['input', 'output', 'cacheRead', 'cacheWrite', 'total']) assert.ok(Number.isFinite(costs[key]));
  console.log(JSON.stringify({ nativeRoot: root.id, nativeFork: child.id, calls, costs }));
});

test('native trigger reopen preserves IDs, screens duplicate occurrence and denies child/revoked authority', { timeout: 15000 }, async t => {
  const cwd = await mkdtemp(join(tmpdir(), 'dm1-triggers-'));
  const database = join(cwd, 'session.sqlite');
  const provider = fauxProvider({ tokensPerSecond: 100000 });
  const models = createModels(); models.setProvider(provider.provider);
  let h, root, authorized = true, reads = 0, eventAt;
  const admissions = [];
  const open = async () => {
    const registry = createRegistry();
    registry.install(createTriggersExtension({ requester: () => 'fixture-operator',
      authorize: ({ conversationId }) => authorized && conversationId === 1,
      provider: { poll: async () => { reads++; return { cursor: 'fixture-cursor', events: [
        { id: 'same-event', kind: 'issues', repo: 'fixture/project', at: eventAt ?? Date.now(), text: 'Untrusted fixture event' },
      ] }; } }, acceptEvent: () => true, admission: { admit: async (_c, requestId) => { admissions.push(requestId); } } }));
    h = await Harness.open(await openNodeSqliteStorage(database), { registry, models,
      env: async () => new NodeExecutionEnv({ cwd }), settings: { progress: { persistWithinMs: 0 }, compaction: { enabled: false } } }, ctx);
    root = await h.root(ctx, { agent: { cwd, model: { provider: provider.getModel().provider, modelId: provider.getModel().id } } });
  };
  await open();
  t.after(async () => { await h.close(ctx); await rm(cwd, { recursive: true, force: true }); });
  provider.setResponses([fauxAssistantMessage(fauxToolCall('repo_watch', { action: 'add', repo: 'fixture/project', events: ['issues'],
    instructions: 'Report fixture only', intervalMs: 1000, lifetimeMs: 20000, maxWakes: 10, maxMessages: 3 }), { stopReason: 'toolUse' }),
    ...Array.from({ length: 20 }, () => fauxAssistantMessage('fixture response'))]);
  const done = await (await root.submit({ type: 'input', content: 'Admit fixture watch' }, ctx)).wait(ctx);
  let watch;
  const current = async () => Object.values((await h.snapshot(WatchesDoc, root.id, ctx))?.items ?? {})[0];
  await until(async () => { watch = await current(); return watch?.sent === 1; }, 'first occurrence');
  eventAt = watch.since;
  const ids = { id: watch.id, taskId: watch.taskId };
  const child = await root.fork(done.answer, { ownership: { kind: 'ownerless' } }, ctx);
  provider.setResponses([fauxAssistantMessage(fauxToolCall('repo_watch', { action: 'add', repo: 'fixture/other', events: ['issues'], instructions: 'Denied child' }), { stopReason: 'toolUse' }),
    ...Array.from({ length: 20 }, () => fauxAssistantMessage('fixture response'))]);
  await (await child.submit({ type: 'input', content: 'Denied child fixture' }, ctx)).wait(ctx);
  assert.deepEqual((await h.snapshot(WatchesDoc, child.id, ctx))?.items ?? {}, {});
  await h.close(ctx); await open();
  h.resume();
  const before = reads;
  await until(() => reads > before, 'reopened poll');
  watch = await current();
  assert.equal(watch.id, ids.id); assert.equal(watch.taskId, ids.taskId);
  assert.equal(watch.sent, 1); assert.equal(admissions.length, 1);
  authorized = false;
  const readsAtRevoke = reads;
  await until(async () => (await current()).note !== null, 'revoked poll fails closed');
  assert.equal(reads, readsAtRevoke); assert.equal((await current()).sent, 1);
  console.log(JSON.stringify({ watch: ids, admissions, readsAtRevoke, sent: 1 }));
});
