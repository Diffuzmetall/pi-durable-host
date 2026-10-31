import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, cp, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { BACKGROUND_CONTEXT as ctx } from '@earendil-works/chord/context';
import { Type, fauxProvider, fauxAssistantMessage, fauxText, fauxToolCall } from '@earendil-works/pi-ai';
import { AgentDoc, Harness, createRegistry, defineExtension, defineTask, defineTool, type Task, type TaskId } from '@earendil-works/pi-durable';
import { createModels } from '@earendil-works/pi-ai/models';
import { openNodeSqliteStorage } from '@earendil-works/pi-durable/storage/sqlite/node';
import { Store } from '../src/store.js';
import { GrantPolicy, type GrantSpec } from '../src/grants.js';
import { createNativeProfile } from '../src/native-profile/profile.js';
import { SupervisorDoc, ChildBindingDoc } from '../src/native-profile/subagents/supervisor.js';
import { ScheduleDoc, createSchedules } from '../src/native-profile/automation/schedules.js';
import { faux, until } from './helpers.js';
import { assertFixtureTaskContracts, closedFixtureBackup, fixtureTree, rebindFixtureCopy } from './fixtures/offline-copy.js';

// Optional pinned, independently built PREVIOUS package. No source-data path is accepted.
const oldPackage = process.env.DPI_MIGRATION_SOURCE_PACKAGE;
const SourceStore: typeof Store = oldPackage
  ? (await import(pathToFileURL(join(oldPackage, 'dist/dpi-backend/src/store.js')).href)).Store
  : Store;
const oldNative: typeof createNativeProfile = oldPackage
  ? (await import(pathToFileURL(join(oldPackage, 'dist/dpi-backend/src/native-profile/profile.js')).href)).createNativeProfile
  : createNativeProfile;
const owner: GrantSpec = { id: 'fixture-owner', token: 'fixture-only', actor: 'operator', source: 'terminal',
  authority: 'human', permissions: ['read', 'write', 'control', 'filesystem', 'human-accept'], binding: {} };

async function environment() {
  const root = await mkdtemp(join(tmpdir(), 'dpi-migration-generated-'));
  await writeFile(join(root, 'GENERATED_FIXTURE_ONLY'), 'generated offline fixture\n');
  const source = join(root, 'source'), work = join(source, 'work');
  await mkdir(work, { recursive: true });
  const options = { dataDir: join(source, 'data'), startDirs: [work], name: 'migration-fixture', provider: 'faux' as const };
  const backup = join(root, 'master-backup');
  return { root, source, work, options, backup };
}

function profileFor(factory = createNativeProfile) {
  const policy = new GrantPolicy([owner]);
  const profile = factory({ policy, owner: policy.authenticate(owner.token),
    connectMcp: async () => ({ sources: [], close: async () => {} }),
    dcg: { binaryPath: '/deliberately-absent-fixture-dcg', envSource: () => ({}) },
  });
  let effects = 0;
  const compositions = new Map<string, Awaited<ReturnType<typeof profile>>>();
  const decorated = Object.assign(async (context: Parameters<typeof profile>[0]) => {
    const composition = await profile(context);
    const extension = defineExtension({ name: 'fixture-offline-effects', tools: [defineTool({
      name: 'fixture_unsafe', description: 'Generated local unsafe-effect recorder; never a live service.', parameters: Type.Object({}), replay: 'unsafe',
      execute: async (_args, _api, context) => {
        effects++;
        return await new Promise<never>((_resolve, reject) => {
          if (context.abortSignal?.aborted) reject(context.abortSignal.reason);
          else context.abortSignal?.addEventListener('abort', () => reject(context.abortSignal!.reason), { once: true });
        });
      },
    })] });
    composition.registry.install(extension);
    composition.extensions.push(extension);
    compositions.set(context.sessionId, composition);
    return composition;
  }, { id: profile.id, capabilities: profile.capabilities });
  return { profile: decorated, compositions, effects: () => effects };
}

function script(store: Store) {
  const provider = fauxProvider({ provider: 'faux', models: [{ id: 'echo', contextWindow: 128000, maxTokens: 8192 }], tokensPerSecond: 100000 });
  const requests: string[] = [];
  provider.setResponses(Array.from({ length: 64 }, () => transcript => {
    const user = transcript.messages.findLast(message => message.role === 'user');
    const text = typeof user?.content === 'string' ? user.content : '';
    requests.push(text);
    const hasResult = transcript.messages.slice(transcript.messages.lastIndexOf(user!)).some(message => message.role === 'toolResult');
    if (!hasResult && text === 'PENDING_UNSAFE_EFFECT')
      return fauxAssistantMessage(fauxToolCall('fixture_unsafe', {}), { stopReason: 'toolUse' });
    if (!hasResult && text === 'CHILD_NEEDS_DECISION')
      return fauxAssistantMessage(fauxToolCall('contact_supervisor', { reason: 'need_decision', message: 'Keep this pending across transition' }), { stopReason: 'toolUse' });
    if (!hasResult && text === 'FUTURE_SCHEDULE')
      return fauxAssistantMessage(fauxToolCall('schedule', { action: 'add', when: 'in 1h', message: 'FUTURE_ONLY' }), { stopReason: 'toolUse' });
    return fauxAssistantMessage(fauxText(`fixture answer: ${text}`));
  }));
  store.models.setProvider(provider.provider);
  return requests;
}

async function history(store: Store, id: string, conversation: string | number = 'main') {
  const { c } = await store.resolveAgent(id, String(conversation));
  return (await c.entries({}, 500, undefined, ctx)).items;
}

async function createSeed(f: Awaited<ReturnType<typeof environment>>, store: Store, native: ReturnType<typeof profileFor>) {
  const requests = script(store);
  const session = await store.create({ name: 'source-native', cwd: f.work, model: faux });
  const agent = await store.resolveAgent(session.id, 'main');
  const send = async (content: string) => {
    const receipt = await store.send(agent.c, { content, requestId: content });
    assert.equal((await store.settled(agent.h, Number(receipt.id), 5000)).status, 'done');
  };
  await send('ORIGINAL_HISTORY');
  await send('FUTURE_SCHEDULE');
  const parent = native.compositions.get(session.id)!.parentControl!(async () => ({ binding: 'fixture', policyReference: 'fixture-owner', tools: ['read'] }), ctx);
  const child = await parent.execute(agent.c.id, { controlId: 'child-before-copy', action: 'spawn', name: 'fixture-child',
    task: 'CHILD_NEEDS_DECISION', tools: ['read'], expectedRevision: (await parent.inspect(agent.c.id)).revision });
  assert.ok(child && typeof child === 'object' && !Array.isArray(child) && typeof child.conversationId === 'number', 'native parent receipt needs a concrete child ID');
  const childId = child.conversationId;
  await until(async () => Object.values((await agent.h.snapshot(SupervisorDoc, agent.c.id, ctx))?.requests ?? {}).some(request => request.state === 'pending'), 5000, 'pending child attention');
  const unsafe = await store.send(agent.c, { content: 'PENDING_UNSAFE_EFFECT', requestId: 'unsafe-before-copy' });
  await until(async () => native.effects() === 1, 5000, 'unsafe effect started once');
  await writeFile(join(f.options.dataDir, 'sessions', session.id, 'artifact.txt'), 'SOURCE_NATIVE_ARTIFACT');
  return { session, agent, child: { conversationId: childId }, unsafe, native, requests };
}

test('native fixture transition: prior package resumes IDs/child/attention/effects; original runtime restores immutable backup', { timeout: 30000 }, async t => {
  const f = await environment();
  let store: Store | undefined;
  try {
    const sourceProfile = profileFor(oldNative);
    store = await SourceStore.open({ ...f.options, profile: sourceProfile.profile });
    const seed = await createSeed(f, store, sourceProfile);
    await assert.rejects(closedFixtureBackup(f.root, f.source, f.backup), /already owned/, 'backup refuses a live sole owner');
    await store.close(); store = undefined;
    const sourceBeforeBackup = await fixtureTree(f.source);
    const before = await closedFixtureBackup(f.root, f.source, f.backup);
    const sourceDigest = await fixtureTree(f.source);
    assert.deepEqual(sourceDigest, sourceBeforeBackup, 'backup itself does not mutate source files or SQLite sidecars');
    assert.deepEqual(before, sourceDigest, 'backup covers every generated source file, directory and permission mode');
    const candidate = join(f.root, 'candidate');
    const mapping = await rebindFixtureCopy(f.root, f.source, f.backup, candidate);
    assert.equal(mapping.length, 1); assert.equal(mapping[0].id, seed.session.id);
    assert.equal(await readFile(join(candidate, 'data/sessions', seed.session.id, 'artifact.txt'), 'utf8'), 'SOURCE_NATIVE_ARTIFACT');
    const native = profileFor();
    store = await Store.open({ ...f.options, dataDir: join(candidate, 'data'), profile: native.profile });
    const requests = script(store);
    assert.equal(store.errors.size, 0);
    const resumed = await store.resolveAgent(seed.session.id, 'main');
    assert.equal(resumed.c.id, seed.agent.c.id);
    const child = await store.resolveAgent(seed.session.id, String(seed.child.conversationId));
    assert.equal(child.c.id, seed.child.conversationId);
    assert.deepEqual((await child.c.agent(ctx)).model, faux);
    assert.equal((await resumed.h.snapshot(ChildBindingDoc, child.c.id, ctx))?.binding?.parent, resumed.c.id);
    assert.ok(Object.values((await resumed.h.snapshot(SupervisorDoc, resumed.c.id, ctx))?.requests ?? {}).some(request => request.state === 'pending' && request.child === child.c.id));
    assert.equal(Object.keys((await resumed.h.snapshot(ScheduleDoc, resumed.c.id, ctx))?.items ?? {}).length, 1);
    await until(async () => (await store!.settled(resumed.h, Number(seed.unsafe.id), 100)).status === 'done', 5000, 'interrupted unsafe call settles without replay');
    assert.equal(native.effects(), 0, 'candidate must not replay the source unsafe effect');
    assert.ok(!requests.includes('ORIGINAL_HISTORY'), 'settled source history is not replayed');
    const entries = await history(store, seed.session.id);
    assert.ok(JSON.stringify(entries).includes('ORIGINAL_HISTORY'));
    assert.ok(JSON.stringify(entries).includes('interrupted'), 'native unsafe recovery result must stay visible');
    const appended = await store.send(resumed.c, { content: 'CANDIDATE_ONLY_HISTORY', requestId: 'candidate-only' });
    assert.equal((await store.settled(resumed.h, Number(appended.id), 5000)).status, 'done');
    await store.close(); store = undefined;
    assert.deepEqual(await fixtureTree(f.source), sourceDigest, 'candidate never opens/writes original source DBs');
    assert.deepEqual(await fixtureTree(f.backup), before);
    const restored = join(f.root, 'restored');
    await rebindFixtureCopy(f.root, f.source, f.backup, restored);
    const original = profileFor(oldNative);
    store = await SourceStore.open({ ...f.options, dataDir: join(restored, 'data'), profile: original.profile });
    script(store);
    const rollback = await store.resolveAgent(seed.session.id, 'main');
    assert.equal(rollback.c.id, seed.agent.c.id);
    assert.equal((await store.resolveAgent(seed.session.id, String(seed.child.conversationId))).c.id, seed.child.conversationId);
    assert.ok(!JSON.stringify(await history(store, seed.session.id)).includes('CANDIDATE_ONLY_HISTORY'));
    assert.ok(Object.values((await rollback.h.snapshot(SupervisorDoc, rollback.c.id, ctx))?.requests ?? {}).some(request => request.state === 'pending'));
    assert.equal(original.effects(), 0, 'old runtime restore also never retries uncertain unsafe effect');
    await store.close(); store = undefined;
    assert.deepEqual(await fixtureTree(f.backup), before);
    const hashes: Record<string, string> = {};
    if (oldPackage) {
      assert.equal(JSON.parse(await readFile(join(oldPackage, 'package.json'), 'utf8')).dependencies['@earendil-works/pi-durable'], '1.4.0');
      for (const path of ['package.json', 'dist/dpi-backend/src/store.js', 'dist/dpi-backend/src/native-profile/profile.js'])
        hashes[path] = createHash('sha256').update(await readFile(join(oldPackage, path))).digest('hex');
    }
    t.diagnostic(JSON.stringify({ sourcePackage: oldPackage ?? 'CURRENT_SOURCE_FIXTURE_ONLY', sourceHashes: hashes, sourceSdk: '1.4.0', targetSdk: '1.4.0', profile: 'native@1 + generated unsafe recorder', session: seed.session.id, child: seed.child.conversationId, unsafeSubmission: seed.unsafe.id, backupDigest: before.digest, mapping, realDataGO: false }));
  } finally { await store?.close(); await rm(f.root, { recursive: true, force: true }); }
});

test('unknown saved profile and child model refuse before recovery, without silent remapping', async () => {
  for (const mismatch of ['profile', 'child-model']) {
    const f = await environment(); let store: Store | undefined;
    try {
      const sourceProfile = profileFor(oldNative);
      store = await SourceStore.open({ ...f.options, profile: sourceProfile.profile });
      const session = await store.create({ name: mismatch, cwd: f.work, model: faux });
      if (mismatch === 'child-model') {
        const { row } = await store.resolveAgent(session.id, 'main');
        const created = await store.createAgent(row, { name: 'saved-unavailable-model' });
        const child = await store.resolveAgent(session.id, String(created.id));
        await child.h.commit(async tx => { (await tx.doc(AgentDoc, child.c.id)).model = { provider: 'unavailable-saved-provider', modelId: 'must-not-remap' }; }, ctx);
      }
      await store.close(); store = undefined;
      if (mismatch === 'profile') {
        const catalog = new DatabaseSync(join(f.options.dataDir, 'catalog.sqlite'));
        catalog.prepare('UPDATE session_profiles SET profileId=? WHERE sessionId=?').run('unknown-installed-profile', session.id); catalog.close();
      }
      const original = await closedFixtureBackup(f.root, f.source, f.backup);
      const candidate = join(f.root, 'candidate');
      await rebindFixtureCopy(f.root, f.source, f.backup, candidate);
      const target = profileFor();
      store = await Store.open({ ...f.options, dataDir: join(candidate, 'data'), profile: target.profile });
      assert.ok(store.errors.has(session.id), `${mismatch} must refuse, not start an empty substitute`);
      await assert.rejects(store.resolveAgent(session.id, 'main'));
      assert.equal(target.effects(), 0);
      if (mismatch === 'profile') assert.equal(target.compositions.size, 0, 'unknown profile refused before composition');
      await store.close(); store = undefined;
      assert.deepEqual(await fixtureTree(f.backup), original);
      const copyCatalog = new DatabaseSync(join(candidate, 'data/catalog.sqlite'), { readOnly: true });
      assert.equal((copyCatalog.prepare('SELECT profileId FROM session_profiles WHERE sessionId=?').get(session.id) as { profileId: string }).profileId,
        mismatch === 'profile' ? 'unknown-installed-profile' : 'native@1');
      copyCatalog.close();
      if (mismatch === 'child-model') {
        const db = new DatabaseSync(join(candidate, 'data/sessions', session.id, 'agent.sqlite'), { readOnly: true });
        const states = db.prepare('SELECT d.record,r.content FROM document_revisions r JOIN documents d ON d.id=r.document_id').all() as { record: string; content: string }[];
        assert.ok(states.some(row => JSON.parse(row.record).kind === 'pi.agent' && row.content.includes('unavailable-saved-provider') && row.content.includes('must-not-remap')), 'saved child model is retained verbatim after refusal');
        db.close();
      }
    } finally { await store?.close(); await rm(f.root, { recursive: true, force: true }); }
  }
});

test('saved schedule v1 contract migrates under native scheduler; untouched backup restores v1 definition', async () => {
  const f = await environment();
  let host: Awaited<ReturnType<typeof Harness.open>> | undefined;
  try {
    const provider = fauxProvider(), models = createModels(); models.setProvider(provider.provider);
    const admissions: string[] = [];
    const extension = createSchedules({ admitInput: async (_conversation, request) => { admissions.push(request); } });
    const task = extension.tasks!.find(task => task.definition.name === 'durable.schedule') as Task<{ scheduleId: string }, { phase: 'wait' } | { phase: 'send' }, null, object>;
    // Generated historical CONTRACT, not an assertion that a selected live runtime used it.
    const v1 = defineTask({ ...task.definition, version: 1, migrate: undefined });
    const oldRegistry = createRegistry(); oldRegistry.install(defineExtension({ ...extension, tasks: [v1] }));
    const sourcePath = join(f.source, 'session.sqlite');
    host = await Harness.open(await openNodeSqliteStorage(sourcePath), { registry: oldRegistry, models }, ctx);
    const root = await host.root(ctx, { agent: { model: { provider: provider.getModel().provider, modelId: provider.getModel().id } } });
    let taskId: TaskId;
    await host.commit(async tx => {
      taskId = await tx.createTask(v1, { scheduleId: 'saved-v1' }, { ownership: { kind: 'conversation' }, conversationId: root.id, background: true });
      (await tx.doc(ScheduleDoc, root.id)).items['saved-v1'] = { id: 'saved-v1', key: 'saved-key', text: 'EXACT_ONE_OCCURRENCE',
        next: 0, zone: 'UTC', taskId, createdAt: 0, runs: 0, status: 'active' };
      await tx.appendEntry(root.id, { kind: 'fixture.original-history', data: { text: 'PRESERVE_NATIVE_ENTRY_ID' } });
    }, ctx);
    assert.equal((await host.getTask(taskId!, ctx))?.state.status, 'pending', 'source has not scheduled/replayed pending work');
    assert.equal((await host.getTask(taskId!, ctx))?.version, 1);
    await host.close(ctx); host = undefined;
    await cp(f.source, f.backup, { recursive: true });
    const backup = await fixtureTree(f.backup);
    const targetRegistry = createRegistry(); targetRegistry.install(extension);
    await assert.rejects(assertFixtureTaskContracts(f.root, sourcePath, targetRegistry.snapshot()), /Untested saved task transition/);
    const supported = await assertFixtureTaskContracts(f.root, sourcePath, targetRegistry.snapshot(), new Set(['durable.schedule:1->2']));
    assert.deepEqual(supported.map(record => [record.id, record.kind, record.version]), [[taskId!, 'durable.schedule', 1]]);
    for (const [name, registry, version] of [['candidate', targetRegistry, 2], ['old-runtime-restore', oldRegistry, 1]] as const) {
      const destination = join(f.root, name); await cp(f.backup, destination, { recursive: true });
      host = await Harness.open(await openNodeSqliteStorage(join(destination, 'session.sqlite')), { registry, models }, ctx);
      host.resume();
      await until(async () => (await host!.getTask(taskId!, ctx))?.state.status === 'terminal', 5000, `${name} saved schedule terminal`);
      const saved = await host.getTask(taskId!, ctx);
      assert.equal(saved?.id, taskId!);
      assert.equal(saved?.state.status, 'terminal');
      assert.equal(saved?.state.status === 'terminal' ? saved.state.outcome.status : undefined, 'completed');
      assert.equal(saved?.version, version);
      const state = await host.snapshot(ScheduleDoc, root.id, ctx);
      assert.equal(state?.items['saved-v1'].runs, 1);
      assert.equal(state?.items['saved-v1'].taskId, taskId!);
      assert.equal(state?.items['saved-v1'].status, 'completed');
      assert.equal(admissions.filter(request => request === `schedule:${taskId!}:0`).length, name === 'candidate' ? 1 : 2);
      const entries = (await (await host.conversation(root.id, ctx))!.entries({}, 100, undefined, ctx)).items;
      assert.equal(entries.filter(entry => entry.kind === 'fixture.original-history').length, 1);
      await host.close(ctx); host = undefined;
      assert.deepEqual(await fixtureTree(f.backup), backup);
    }
  } finally { await host?.close(ctx); await rm(f.root, { recursive: true, force: true }); }
});

test('required legacy goal task is rejected read-only before any target resume', async () => {
  const f = await environment(); let host: Awaited<ReturnType<typeof Harness.open>> | undefined;
  try {
    const legacy = defineTask({ name: 'local-host.goal-check', version: 1, initial: () => ({ phase: 'saved' as const }),
      phases: { saved: async () => { throw Error('MUST_NOT_EXECUTE_UNSUPPORTED_PROFILE'); } },
      abort: async () => { throw Error('MUST_NOT_DROP_OR_ABORT_SAVED_WORK'); },
    });
    const sourceRegistry = createRegistry(); sourceRegistry.install(defineExtension({ name: 'fixture-legacy-contract', tasks: [legacy] }));
    const path = join(f.source, 'session.sqlite');
    host = await Harness.open(await openNodeSqliteStorage(path), { registry: sourceRegistry, models: createModels() }, ctx);
    const root = await host.root(ctx);
    await host.commit(tx => tx.createTask(legacy, {}, { conversationId: root.id, ownership: { kind: 'conversation' }, background: true }), ctx);
    await host.close(ctx); host = undefined;
    const before = await fixtureTree(f.source);
    await assert.rejects(assertFixtureTaskContracts(f.root, path, createRegistry().snapshot()), /Unsupported saved task local-host.goal-check@1/);
    assert.deepEqual(await fixtureTree(f.source), before, 'immutable read-only preflight preserves the complete source tree, including absence of sidecars');
    const writer = new DatabaseSync(path);
    try {
      writer.exec('PRAGMA journal_mode=WAL; CREATE TABLE fixture_pending(value TEXT); INSERT INTO fixture_pending VALUES(\'COMMITTED_WAL_PAYLOAD\')');
      const withWal = await fixtureTree(f.source);
      await assert.rejects(assertFixtureTaskContracts(f.root, path, createRegistry().snapshot()), /Uncheckpointed fixture WAL/);
      assert.deepEqual(await fixtureTree(f.source), withWal, 'uncheckpointed WAL is neither ignored nor mutated by inspection');
    } finally { writer.close(); }
  } finally { await host?.close(ctx); await rm(f.root, { recursive: true, force: true }); }
});

test('copied catalog must refuse original absolute DBs and symlink aliases before opening them', async () => {
  const f = await environment(); let store: Store | undefined;
  try {
    const native = profileFor();
    store = await Store.open({ ...f.options, profile: native.profile });
    const session = await store.create({ name: 'path-confined', cwd: f.work, model: faux });
    await store.close(); store = undefined;
    const before = await fixtureTree(f.source);
    const copied = join(f.root, 'copied-data');
    await cp(f.options.dataDir, copied, { recursive: true });
    store = await Store.open({ ...f.options, dataDir: copied, profile: native.profile });
    assert.ok(store.errors.has(session.id), 'unrebound copied catalog must fail closed');
    await store.close(); store = undefined;
    assert.deepEqual(await fixtureTree(f.source), before, 'refusal must precede source SQLite/lock writes');
    const aliasCopy = join(f.root, 'alias-data');
    await cp(f.options.dataDir, aliasCopy, { recursive: true });
    const alias = join(aliasCopy, 'sessions', 'escape.sqlite');
    await symlink(session.dbPath, alias);
    const catalog = new DatabaseSync(join(aliasCopy, 'catalog.sqlite'));
    catalog.prepare('UPDATE sessions SET dbPath=? WHERE id=?').run(alias, session.id); catalog.close();
    store = await Store.open({ ...f.options, dataDir: aliasCopy, profile: native.profile });
    assert.ok(store.errors.has(session.id), 'canonical alias outside copied data must fail closed');
    await store.close(); store = undefined;
    assert.deepEqual(await fixtureTree(f.source), before);
  } finally { await store?.close(); await rm(f.root, { recursive: true, force: true }); }
});
