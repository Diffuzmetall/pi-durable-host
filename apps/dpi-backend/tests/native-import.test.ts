import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { chmod, mkdir, readFile, readdir, stat, writeFile, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { BACKGROUND_CONTEXT as ctx } from '@earendil-works/chord/context';
import { createModels } from '@earendil-works/pi-ai/models';
import { AgentDoc, InboxDoc, LiveDoc, ProviderDoc, UsageDoc, NestedCallDoc, Harness, createRegistry, defineTask, defineExtension } from '@earendil-works/pi-durable';
import { CodingTools } from '@earendil-works/pi-durable/tools';
import { openNodeSqliteStorage } from '@earendil-works/pi-durable/storage/sqlite/node';
import { adoptNativeCopy, type NativeImportTarget, type VerifiedNativeCopy } from '../src/native-import.js';
import { minimalProfile } from '../src/runtime-profile.js';
import { installFaux } from '../src/faux.js';
import { Store } from '../src/store.js';
import { tempStore, faux } from './helpers.js';

const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

async function fixture(retiredTaskDocument = false) {
  const f = await tempStore();
  const directory = join(f.root, 'verified-native-copy');
  await mkdir(directory);
  const database = join(directory, 'session.sqlite');
  const registry = createRegistry(); registry.install(CodingTools);
  let settled!: () => void;
  const retired = new Promise<void>(resolve => { settled = resolve; });
  const retirement = defineTask<null, { phase: 'run' }, null>({
    name: 'fixture.native-retirement', version: 1, initial: () => ({ phase: 'run' }),
    phases: { run: async (_record, runtime, context) => {
      try {
        await runtime.commit(async tx => {
          const doc = await tx.doc(NestedCallDoc, runtime.taskId, 'retired-native', null);
          doc.result = { taskId: runtime.taskId, isError: false, diagnostics: [], structuredOutput: null };
          return undefined;
        }, context);
        await runtime.commit(() => ({ status: 'terminal', outcome: { status: 'completed', result: null } }), context);
      } finally { settled(); }
    } },
    abort: async (_record, runtime, context) => {
      await runtime.commit(() => ({ status: 'terminal', outcome: { status: 'aborted' } }), context);
      settled();
    },
  });
  const retirementExtension = defineExtension({ name: 'fixture.native-retirement', tasks: [retirement] });
  if (retiredTaskDocument) registry.install(retirementExtension);
  const models = createModels(); installFaux(models);
  const h = await Harness.open(await openNodeSqliteStorage(database), { models, registry, settings: { extensions: [CodingTools] } }, ctx);
  try {
    const root = await h.root(ctx, { agent: { cwd: f.work, model: faux } });
    h.resume();
    const submission = await root.submit({ type: 'input', content: 'native history must survive import', requestId: 'native-source-request' }, ctx);
    await submission.wait(ctx);
    if (retiredTaskDocument) {
      const owner = await h.commit(tx => tx.createTask(retirement, null, { conversationId: root.id, ownership: { kind: 'conversation' }, background: true }), ctx);
      await retired;
      const record = (await h.commit(tx => tx.task(owner), ctx))!;
      assert.equal(record.state.status, 'terminal');
      if (record.state.status === 'terminal') assert.equal(record.state.outcome.status, 'completed', JSON.stringify(record.state.outcome));
    }
  } finally { await h.close(ctx); }
  await writeFile(join(directory, 'artifact.txt'), 'preserved local native artifact\n');
  const files: Record<string, string> = {};
  for (const name of (await readdir(directory)).sort()) files[name] = sha(await readFile(join(directory, name)));
  await chmod(database, 0o400);
  const source: VerifiedNativeCopy = {
    directory, database: 'session.sqlite', files, sessionId: randomUUID(), name: 'native-only fixture', createdAt: 1700000000000,
    sdkVersion: '1.4.0', sourceProfileId: null,
    bootstrapSha256: sha(await readFile(new URL(import.meta.url))),
    registrySha256: sha(Buffer.from(JSON.stringify(registry.snapshot().tasks().map(t => ({ kind: t.definition.name, version: t.definition.version }))))),
  };
  const target: NativeImportTarget = {
    profile: retiredTaskDocument ? Object.assign((context: Parameters<typeof minimalProfile>[0]) => {
      const composition = minimalProfile(context); composition.registry.install(retirementExtension); return composition;
    }, { id: 'fixture.native-retirement@1' }) : minimalProfile, source: { sdkVersion: source.sdkVersion, sourceProfileId: null, bootstrapSha256: source.bootstrapSha256, registrySha256: source.registrySha256 },
    registry: registry.snapshot(), models,
    documents: [AgentDoc, InboxDoc, LiveDoc, ProviderDoc, UsageDoc, NestedCallDoc].map(token => ({
      definition: token.definition,
      assertCompatible(value) {
        if (token.definition.kind === InboxDoc.definition.kind) assert.deepEqual(value.items, []);
        if (token.definition.kind === LiveDoc.definition.kind) {
          assert.equal(value.run, undefined); assert.equal(value.generation, undefined);
          assert.equal(value.compactions, undefined); assert.equal(value.nestedTools, undefined);
        }
      },
    })),
  };
  return { ...f, source, target, database, destination: { dataDir: join(f.root, 'candidate'), cwd: f.work } };
}

test('offline native adoption preserves SQLite/native IDs/history/models and permits actual passive continuation', async () => {
  const f = await fixture(); let store: Store | undefined;
  try {
    const beforeFiles = await readdir(f.source.directory);
    const imported = await adoptNativeCopy(f.source, f.target, f.destination);
    assert.equal(imported.sourceProfileId, null);
    assert.equal(imported.targetProfileId, minimalProfile.id);
    assert.equal(imported.sessionId, f.source.sessionId);
    assert.equal(imported.runtimeContinuationChecked, false);
    assert.ok(imported.counts.entries >= 2);
    assert.ok(imported.counts.tasks > 0);
    assert.equal(sha(await readFile(imported.dbPath)), f.source.files['session.sqlite']);
    assert.equal(await readFile(join(imported.dataDir, 'sessions', imported.sessionId, 'artifact.txt'), 'utf8'), 'preserved local native artifact\n');
    assert.equal((await stat(imported.dbPath)).mode & 0o777, 0o600);
    assert.equal((await stat(imported.dataDir)).mode & 0o777, 0o700);
    assert.equal((await stat(join(imported.dataDir, 'catalog.sqlite'))).mode & 0o777, 0o600);
    const catalog = new DatabaseSync(join(imported.dataDir, 'catalog.sqlite'), { readOnly: true });
    try {
      assert.equal(catalog.prepare('SELECT profileId FROM session_profiles WHERE sessionId=?').get(imported.sessionId)!.profileId, minimalProfile.id);
      const provenance = JSON.parse(catalog.prepare('SELECT value FROM meta WHERE key=?').get(`native_import:${imported.sessionId}`)!.value as string);
      assert.equal(provenance.sourceProfileId, null);
    } finally { catalog.close(); }
    store = await Store.open({ ...f.options, dataDir: imported.dataDir, profile: minimalProfile });
    assert.equal(store.errors.size, 0);
    const native = await store.resolveAgent(imported.sessionId, 'main');
    assert.equal(native.c.id, 1);
    const continued = await native.c.submit({ type: 'write', entry: { kind: 'fixture.after-import', data: { preserved: true } }, requestId: 'passive-continuation' }, ctx);
    await continued.wait(ctx);
    await store.close(); store = undefined;
    assert.equal(sha(await readFile(f.database)), f.source.files['session.sqlite']);
    assert.deepEqual(await readdir(f.source.directory), beforeFiles, 'immutable preflight must not create source sidecars');
  } finally { await store?.close(); await f.cleanup(); }
});

test('native SDK retired task tombstones with no revisions survive adoption without fabricated values', async () => {
  const f = await fixture(true);
  try {
    const uri = pathToFileURL(f.database); uri.search = 'mode=ro&immutable=1';
    const original = new DatabaseSync(uri.href, { readOnly: true });
    try {
      const row = original.prepare("SELECT id,retired_at FROM documents WHERE json_extract(record,'$.kind')=?").get(NestedCallDoc.definition.kind)!;
      assert.equal(typeof row.retired_at, 'number');
      assert.equal(original.prepare('SELECT count(*) AS n FROM document_revisions WHERE document_id=?').get(row.id)!.n, 0);
    } finally { original.close(); }
    f.target.documents = f.target.documents.map(c => c.definition.kind === NestedCallDoc.definition.kind
      ? { ...c, assertCompatible() { throw Error('retired document has no value to validate'); } } : c);
    const imported = await adoptNativeCopy(f.source, f.target, f.destination);
    assert.equal(imported.counts.retiredTaskTombstones, 1);
    assert.equal(sha(await readFile(imported.dbPath)), f.source.files['session.sqlite']);
    assert.equal(sha(await readFile(f.database)), f.source.files['session.sqlite']);
  } finally { await f.cleanup(); }
});

for (const state of ['active without content', 'missing owner', 'unknown retired kind']) {
  test(`native tombstone preflight refuses ${state}`, async () => {
    const f = await fixture(true);
    try {
      await chmod(f.database, 0o600);
      const db = new DatabaseSync(f.database);
      try {
        const id = db.prepare("SELECT id FROM documents WHERE json_extract(record,'$.kind')=?").get(NestedCallDoc.definition.kind)!.id;
        if (state === 'active without content') db.prepare("UPDATE documents SET record=json_remove(record,'$.retiredAt'),retired_at=NULL WHERE id=?").run(id);
        if (state === 'missing owner') db.prepare("UPDATE documents SET record=json_set(record,'$.scope.taskId',9999999) WHERE id=?").run(id);
        if (state === 'unknown retired kind') db.prepare("UPDATE documents SET record=json_set(record,'$.kind','unsupported.retired-document') WHERE id=?").run(id);
      } finally { db.close(); }
      await chmod(f.database, 0o400);
      f.source.files = { ...f.source.files, 'session.sqlite': sha(await readFile(f.database)) };
      await assert.rejects(adoptNativeCopy(f.source, f.target, f.destination));
      await assert.rejects(stat(f.destination.dataDir), { code: 'ENOENT' });
    } finally { await f.cleanup(); }
  });
}

for (const refusal of ['source fingerprint', 'unknown document', 'unknown model', 'unsafe document', 'async unsafe document', 'unknown task', 'inventory', 'existing destination', 'nonempty WAL', 'symlink', 'destination inside source']) {
  test(`native adoption refuses ${refusal} before publishing a catalog`, async () => {
    const f = await fixture();
    try {
      if (refusal === 'source fingerprint') f.target.source = { ...f.target.source, bootstrapSha256: '0'.repeat(64) };
      if (refusal === 'unknown document') f.target.documents = [];
      if (refusal === 'unknown model') f.target.models = { getModel: () => undefined };
      if (refusal === 'unsafe document') f.target.documents = f.target.documents.map(c => ({ ...c, assertCompatible() { throw Error('unsafe saved effect'); } }));
      if (refusal === 'async unsafe document') f.target.documents = f.target.documents.map(c => ({ ...c, async assertCompatible() { throw Error('async unsafe saved effect'); } }));
      if (refusal === 'unknown task') {
        await chmod(f.database, 0o600);
        const db = new DatabaseSync(f.database);
        try { db.exec("UPDATE tasks SET record=json_set(record,'$.kind','unknown.required-handler')"); }
        finally { db.close(); }
        await chmod(f.database, 0o400);
        f.source.files = { ...f.source.files, 'session.sqlite': sha(await readFile(f.database)) };
      }
      if (refusal === 'inventory') await writeFile(join(f.source.directory, 'unapproved.txt'), 'not selected');
      if (refusal === 'existing destination') await mkdir(f.destination.dataDir);
      if (refusal === 'nonempty WAL') {
        const name = `${f.source.database}-wal`;
        await writeFile(join(f.source.directory, name), 'uncheckpointed WAL must not be ignored');
        f.source.files = { ...f.source.files, [name]: sha(await readFile(join(f.source.directory, name))) };
      }
      if (refusal === 'symlink') await symlink(f.database, join(f.source.directory, 'alias.sqlite'));
      if (refusal === 'destination inside source') f.destination.dataDir = join(f.source.directory, 'forbidden-destination');
      const digest = sha(await readFile(f.database));
      await assert.rejects(adoptNativeCopy(f.source, f.target, f.destination));
      await assert.rejects(stat(join(f.destination.dataDir, 'catalog.sqlite')), { code: 'ENOENT' });
      assert.equal(sha(await readFile(f.database)), digest);
    } finally { await f.cleanup(); }
  });
}
