import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { chmod, copyFile, lstat, mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';
import { apply, type Op } from '@earendil-works/chord/delta';
import type { JsonValue } from '@earendil-works/chord';
import { AgentDoc, type DocumentRecord, type JsonObject, type RegistrySnapshot, type SubmissionRecord, type TaskRecord } from '@earendil-works/pi-durable';
import type { NativeModelReference } from './native-profile/models/index.js';
import type { RuntimeProfileFactory } from './runtime-profile.js';
import { initializeCatalog } from './catalog.js';

export interface VerifiedNativeCopy {
  /** An already coherent, privately protected copy; never an original/live session. */
  directory: string;
  database: string;
  /** Complete regular-file inventory of the normalized copy, including local artifacts. */
  files: Readonly<Record<string, string>>;
  sessionId: string;
  name: string;
  createdAt: number;
  sdkVersion: '1.4.0';
  sourceProfileId: string | null;
  bootstrapSha256: string;
  registrySha256: string;
}

export interface ImportDocumentContract {
  /** Actual public Doc token definition from the selected target composition. */
  definition: {
    kind: string;
    version: number;
    scope: 'session' | 'conversation' | 'task';
    family?: true;
    history?: 'latest' | 'rewindable';
    fork?: 'current' | 'initial' | 'asOf';
  };
  /** Required pure, profile-specific validation, including dormant external-effect queues. */
  assertCompatible(value: JsonObject, record: DocumentRecord): void | Promise<void>;
}

export interface NativeImportTarget {
  profile: RuntimeProfileFactory;
  /** Explicit source contract accepted by this trusted target composition, not SDK-version inference. */
  source: Pick<VerifiedNativeCopy, 'sdkVersion' | 'sourceProfileId' | 'bootstrapSha256' | 'registrySha256'>;
  registry: RegistrySnapshot;
  documents: readonly ImportDocumentContract[];
  /** Cache-only metadata lookup, not requireModel/auth resolution/provider invocation. */
  models: { getModel(provider: string, modelId: string): unknown };
}

/**
 * Trusted offline adoption only. Does not instantiate Store/Harness, call the profile,
 * migrate native records, authorize providers or resume work. Runtime/isolation/rollback
 * acceptance remains separate. The caller pins the source fingerprints from its verified backup.
 */
export async function adoptNativeCopy(source: VerifiedNativeCopy, target: NativeImportTarget, destination: { dataDir: string; cwd: string }) {
  const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
  const hash = /^[a-f0-9]{64}$/;
  assert.equal(source.sdkVersion, '1.4.0', 'Unsupported native source SDK');
  assert.ok(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,199}$/.test(source.sessionId), 'Invalid source session ID');
  assert.ok(typeof source.name === 'string' && source.name.trim(), 'Source name required');
  assert.ok(Number.isSafeInteger(source.createdAt) && source.createdAt >= 0, 'Invalid source creation time');
  assert.ok(source.sourceProfileId === null || (typeof source.sourceProfileId === 'string' && source.sourceProfileId.length > 0), 'Explicit source profile provenance required');
  assert.ok(hash.test(source.bootstrapSha256) && hash.test(source.registrySha256), 'Source fingerprints required');
  assert.ok(target.profile.id, 'Existing explicit target profile required');
  assert.deepEqual({ sdkVersion: source.sdkVersion, sourceProfileId: source.sourceProfileId, bootstrapSha256: source.bootstrapSha256, registrySha256: source.registrySha256 }, target.source, 'Unrecognized source contract');
  assert.equal(basename(source.database), source.database, 'Native database must be a copy-root file');
  const sourceRoot = await realpath(source.directory);
  assert.ok(!(await lstat(source.directory)).isSymbolicLink(), 'Copy root symlink refused');
  const actualFiles: string[] = [];
  async function inventory(directory: string) {
    for (const name of (await readdir(directory)).sort()) {
      const path = join(directory, name), info = await lstat(path);
      assert.ok(!info.isSymbolicLink(), 'Snapshot symlink refused');
      if (info.isDirectory()) await inventory(path);
      else {
        assert.ok(info.isFile(), 'Snapshot special file refused');
        actualFiles.push(relative(sourceRoot, path));
      }
    }
  }
  await inventory(sourceRoot);
  assert.deepEqual(actualFiles.sort(), Object.keys(source.files).sort(), 'Complete verified copy inventory required');
  assert.ok(hash.test(source.files[source.database] ?? ''), 'Native database digest required');
  for (const name of actualFiles) {
    assert.ok(!isAbsolute(name) && name !== '..' && !name.startsWith(`..${sep}`), 'Copy path escape');
    assert.ok(hash.test(source.files[name]!), 'Invalid copy digest');
    assert.equal(digest(await readFile(join(sourceRoot, name))), source.files[name], 'Copy digest mismatch');
  }
  const nativePath = join(sourceRoot, source.database);
  if (actualFiles.includes(`${source.database}-wal`))
    assert.equal((await lstat(`${nativePath}-wal`)).size, 0, 'Coherent backup required; immutable inspection cannot read WAL');
  const uri = pathToFileURL(nativePath); uri.search = 'mode=ro&immutable=1';
  const native = new DatabaseSync(uri.href, { readOnly: true });
  const contracts = new Map(target.documents.map(contract => [contract.definition.kind, contract]));
  assert.equal(contracts.size, target.documents.length, 'Duplicate document contracts');
  const models: Array<{ conversationId: number; model: NativeModelReference }> = [];
  let counts: Record<string, number>;
  try {
    assert.equal(Object.values(native.prepare('PRAGMA quick_check').get()!)[0], 'ok', 'Corrupt native copy');
    const conversations = native.prepare('SELECT id FROM conversations ORDER BY id').all() as { id: number }[];
    assert.ok(conversations.some(row => row.id === 1), 'Existing native root conversation required');
    const tasks = native.prepare('SELECT record FROM tasks ORDER BY id').all() as { record: string }[];
    const terminalTaskIds = new Set<number>();
    for (const row of tasks) {
      const task = JSON.parse(row.record) as TaskRecord<JsonValue, JsonValue, JsonValue>;
      const definition = target.registry.task(task.kind)?.definition;
      assert.ok(definition && definition.version === task.version, 'Unsupported saved task contract');
      assert.equal(task.state.status, 'terminal', 'Pending native task requires a separately verified recovery policy');
      assert.ok(Number.isSafeInteger(task.id), 'Invalid native task identity');
      terminalTaskIds.add(task.id);
    }
    const submissions = native.prepare('SELECT record FROM submissions ORDER BY id').all() as { record: string }[];
    for (const row of submissions) {
      const submission = JSON.parse(row.record) as SubmissionRecord;
      assert.ok(submission.status === 'done' || submission.status === 'unanswered', 'Pending native submission refused');
    }
    const documents = native.prepare('SELECT id,record FROM documents ORDER BY id').all() as { id: number; record: string }[];
    let retiredTaskTombstones = 0;
    for (const row of documents) {
      const record = JSON.parse(row.record) as DocumentRecord;
      const contract = contracts.get(record.kind);
      assert.ok(contract, `Unsupported saved document kind: ${record.kind}`);
      const definition = contract.definition;
      assert.equal(definition.scope, record.scope.kind, 'Saved document scope mismatch');
      assert.equal(!!definition.family, record.key !== undefined, 'Saved document family mismatch');
      if (record.scope.kind === 'conversation') {
        assert.equal(definition.history, record.history, 'Saved document history semantics mismatch');
        assert.equal(definition.fork, record.fork, 'Saved document fork semantics mismatch');
      }
      const revisions = native.prepare('SELECT kind,version,content FROM document_revisions WHERE document_id=? ORDER BY seq').all(row.id) as Array<{ kind: string; version: number; content: string }>;
      if (revisions.length === 0 && record.retiredAt !== undefined) {
        // SDK 1.4 retires task documents by deleting their content, not their incarnation records.
        assert.ok(record.scope.kind === 'task' && terminalTaskIds.has(record.scope.taskId), 'Empty retired document needs a terminal native task owner');
        assert.ok(Number.isSafeInteger(record.createdAt) && Number.isSafeInteger(record.retiredAt) && record.retiredAt >= record.createdAt, 'Invalid native retirement metadata');
        retiredTaskTombstones++;
        continue; // There is no value or stored version to invent, migrate or validate.
      }
      let value: JsonObject | undefined;
      for (const revision of revisions) {
        assert.equal(revision.version, definition.version, 'Unsupported saved document version; explicit tested migration required');
        if (revision.kind === 'base') value = JSON.parse(revision.content) as JsonObject;
        else {
          assert.ok(value, 'Document delta has no base');
          value = apply(value, JSON.parse(revision.content) as Op[]) as JsonObject;
        }
      }
      assert.ok(value && typeof value === 'object' && !Array.isArray(value), 'Invalid saved document value');
      // The trusted composition owns semantic/effect validation; never infer safety from task counts alone.
      await contract.assertCompatible(value, record);
      if (record.kind === AgentDoc.definition.kind && record.retiredAt === undefined) {
        const model = value.model;
        assert.ok(model && typeof model === 'object' && !Array.isArray(model), 'Saved model reference required');
        assert.ok(typeof model.provider === 'string' && typeof model.modelId === 'string', 'Invalid saved model reference');
        assert.ok(target.models.getModel(model.provider, model.modelId), 'Unsupported saved model reference');
        assert.ok(record.scope.kind === 'conversation', 'Invalid agent document scope');
        const extensions = value.extensions;
        if (extensions !== undefined) {
          assert.ok(Array.isArray(extensions), 'Invalid saved extension selection');
          for (const extension of extensions)
            assert.ok(typeof extension === 'string' && target.registry.extension(extension), 'Unsupported saved extension selection');
        }
        models.push({ conversationId: record.scope.conversationId, model: { provider: model.provider, modelId: model.modelId } });
      }
    }
    assert.deepEqual(models.map(row => row.conversationId).sort((a,b) => a-b), conversations.map(row => row.id), 'Every native conversation needs its unchanged saved model');
    counts = { conversations: conversations.length, entries: Number(native.prepare('SELECT count(*) AS n FROM entries').get()!.n), tasks: tasks.length, submissions: submissions.length, documents: documents.length, retiredTaskTombstones };
  } finally { native.close(); }

  const root = resolve(destination.dataDir);
  const parent = await realpath(dirname(root));
  assert.equal(join(parent, basename(root)), root, 'Destination parent must be canonical');
  const sourceSuffix = relative(sourceRoot, root);
  assert.ok(sourceSuffix === '..' || sourceSuffix.startsWith(`..${sep}`) || isAbsolute(sourceSuffix), 'Destination must be outside immutable copy');
  const cwd = await realpath(destination.cwd);
  assert.ok((await lstat(cwd)).isDirectory(), 'Candidate working directory required');
  assert.ok(!actualFiles.includes('agent.sqlite') || source.database === 'agent.sqlite', 'Native destination filename collision');
  assert.ok(!actualFiles.includes('IMPORT.json'), 'Import provenance filename collision');
  await mkdir(root, { mode: 0o700 }); // Exclusive: never merge with an owner, catalog or prior failed attempt.
  const sessionDirectory = join(root, 'sessions', source.sessionId);
  await mkdir(sessionDirectory, { recursive: true, mode: 0o700 });
  for (const name of actualFiles) {
    if (name === `${source.database}-wal` || name === `${source.database}-shm`) continue;
    const targetPath = name === source.database ? join(sessionDirectory, 'agent.sqlite') : join(sessionDirectory, name);
    await mkdir(dirname(targetPath), { recursive: true, mode: 0o700 });
    await copyFile(join(sourceRoot, name), targetPath, constants.COPYFILE_EXCL);
    await chmod(targetPath, 0o600);
    assert.equal(digest(await readFile(targetPath)), source.files[name], 'Copied bytes changed');
    assert.equal(digest(await readFile(join(sourceRoot, name))), source.files[name], 'Immutable source changed');
  }
  const rootModel = models.find(row => row.conversationId === 1)!.model;
  const provenance = {
    version: 1, sourceSessionId: source.sessionId, sourceProfileId: source.sourceProfileId,
    sourceSdkVersion: source.sdkVersion, sourceBootstrapSha256: source.bootstrapSha256,
    sourceRegistrySha256: source.registrySha256, sourceFiles: source.files,
    targetProfileId: target.profile.id, counts, models, runtimeContinuationChecked: false,
  };
  await writeFile(join(sessionDirectory, 'IMPORT.json'), JSON.stringify(provenance, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  const catalog = new DatabaseSync(join(root, 'catalog.sqlite'));
  try {
    await chmod(join(root, 'catalog.sqlite'), 0o600);
    initializeCatalog(catalog);
    catalog.exec('BEGIN IMMEDIATE');
    catalog.prepare('INSERT INTO sessions VALUES(?,?,?,?,?,?,?)').run(source.sessionId, source.name, cwd, join(sessionDirectory, 'agent.sqlite'), source.createdAt, rootModel.modelId, rootModel.provider);
    catalog.prepare('INSERT INTO session_profiles VALUES(?,?)').run(source.sessionId, target.profile.id);
    catalog.prepare('INSERT INTO meta(key,value) VALUES(?,?)').run(`native_import:${source.sessionId}`, JSON.stringify(provenance));
    catalog.exec('COMMIT');
  } finally { catalog.close(); }
  return { dataDir: root, sessionId: source.sessionId, dbPath: join(sessionDirectory, 'agent.sqlite'), ...provenance };
}
