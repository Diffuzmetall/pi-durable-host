import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, writeFileSync, existsSync, statSync, realpathSync, openSync, closeSync, fsyncSync, unlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { apply } from '@earendil-works/chord/delta';

// Rebind ONLY the approved candidate's catalog paths from its offline namespace.
// Native DB/history/IDs/profile/model and every original/backup remain untouched.
const release = '/home/ubuntu/.local/share/pi-durable-host/releases/c0019d7-dadd5534';
const root = '/var/tmp/bob-one-pilot.JRXGvk';
const receipt = JSON.parse(readFileSync(join(root, 'ADOPTED_PRIVATE.json'), 'utf8'));
assert.equal(receipt.dataDir, '/private/candidate');
const dataDir = realpathSync(join(root, 'candidate'));
const database = realpathSync(join(dataDir, 'sessions', receipt.sessionId, 'agent.sqlite'));
assert(database.startsWith(`${dataDir}/sessions/`));
const catalogPath = join(dataDir, 'catalog.sqlite');
for (const file of [database, catalogPath]) {
  assert(!existsSync(`${file}-wal`) || statSync(`${file}-wal`).size === 0, 'NONEMPTY_WAL_REFUSE');
  assert(!existsSync(`${file}.lock`), 'EXISTING_OWNER_REFUSE');
}
const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const before = hash(database);
assert.equal(before, receipt.sourceFiles['session.sqlite']);
const native = new DatabaseSync(`file:${database}?mode=ro&immutable=1`, { readOnly: true });
const document = native.prepare('SELECT id,record FROM documents').all().find(row => {
  const value = JSON.parse(row.record); return value.kind === 'pi.agent' && value.retiredAt === undefined && value.scope.conversationId === 1;
});
assert(document, 'ORIGINAL_ROOT_REQUIRED');
let state;
for (const revision of native.prepare('SELECT kind,content FROM document_revisions WHERE document_id=? ORDER BY seq').all(document.id))
  state = revision.kind === 'base' ? JSON.parse(revision.content) : apply(state, JSON.parse(revision.content));
assert.deepEqual(state.model, { provider: 'openai-codex', modelId: 'gpt-6.1-sol' });
assert(native.prepare('SELECT record FROM tasks').all().every(row => JSON.parse(row.record).state.status === 'terminal'), 'PENDING_NATIVE_WORK_REFUSE');
native.close();
const cwd = realpathSync(state.cwd);
assert.equal(JSON.parse(readFileSync(join(dirname(database), 'agent-mail-identity.json'), 'utf8')).project, cwd);
const locks = [];
try {
  for (const path of [catalogPath, database]) {
    const file = openSync(`${path}.lock`, 'wx', 0o600); writeFileSync(file, String(process.pid)); closeSync(file); locks.push(`${path}.lock`);
  }
  const catalog = new DatabaseSync(catalogPath);
  try {
    const row = catalog.prepare('SELECT * FROM sessions WHERE id=?').get(receipt.sessionId);
    assert.equal(row.dbPath, receipt.dbPath); assert.equal(row.cwd, '/private/work');
    assert.equal(catalog.prepare('SELECT profileId FROM session_profiles WHERE sessionId=?').get(receipt.sessionId).profileId, 'native@1');
    const recordPath = join(release, 'CANDIDATE-PATH-BINDING.json');
    const fd = openSync(recordPath, 'wx', 0o600);
    try { writeFileSync(fd, JSON.stringify({ before: row, dataDir, dbPath: database, cwd, nativeSha256: before, reason: 'offline namespace to admitted original native cwd; no import or native record changes' }, null, 2)); fsyncSync(fd); }
    finally { closeSync(fd); }
    catalog.exec('BEGIN IMMEDIATE');
    const changed = catalog.prepare('UPDATE sessions SET cwd=?,dbPath=? WHERE id=? AND cwd=? AND dbPath=?').run(cwd, database, row.id, row.cwd, row.dbPath);
    assert.equal(changed.changes, 1); catalog.exec('COMMIT');
  } finally { catalog.close(); }
  assert.equal(hash(database), before, 'NATIVE_DATA_CHANGED');
  console.log(JSON.stringify({ status: 'CANDIDATE_PATHS_BOUND', nativeDatabaseUnchanged: true, originalsOpened: false, modelChanged: false, importedAgain: false }));
} finally { for (const file of locks) if (readFileSync(file, 'utf8') === String(process.pid)) unlinkSync(file); }
