// Disposable-fixture support only. No CLI accepts existing/live user data.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cp, lstat, readFile, readdir, realpath } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { existsSync, statSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { lockFile } from '../../src/store.js';
import type { RegistrySnapshot, TaskRecord } from '@earendil-works/pi-durable';
import type { JsonValue } from '@earendil-works/chord';

export async function fixtureTree(root: string) {
  const files: Record<string, string> = {};
  async function walk(directory: string) {
    for (const name of (await readdir(directory)).sort()) {
      const path = join(directory, name), info = await lstat(path);
      assert.ok(!info.isSymbolicLink(), `Snapshot symlink refused: ${path}`);
      if (info.isDirectory()) {
        files[`${relative(root, path)}/`] = `directory:${info.mode & 0o777}`;
        await walk(path);
      }
      else {
        assert.ok(info.isFile(), `Snapshot special file refused: ${path}`);
        files[relative(root, path)] = `${info.mode & 0o777}:${createHash('sha256').update(await readFile(path)).digest('hex')}`;
      }
    }
  }
  await walk(root);
  return { files, digest: createHash('sha256').update(JSON.stringify(files)).digest('hex') };
}

export function inside(root: string, path: string) {
  const suffix = relative(resolve(root), resolve(path));
  assert.ok(suffix && suffix !== '..' && !suffix.startsWith('../') && !isAbsolute(suffix), 'Path outside fixture tree');
  return suffix;
}

function readCheckpointedFixture(path: string) {
  // immutable avoids SQLite creating -wal/-shm beside even a readOnly connection.
  // It ignores WAL, so refuse any uncheckpointed payload instead of silently losing committed data.
  if (existsSync(`${path}-wal`)) assert.equal(statSync(`${path}-wal`).size, 0, 'Uncheckpointed fixture WAL requires a coherent SQLite backup; immutable inspection refused');
  const uri = pathToFileURL(path); uri.search = 'mode=ro&immutable=1';
  return new DatabaseSync(uri.href, { readOnly: true });
}

/** Normal Store owners share these locks. Refuse an open owner, never infer quiescence from TTL. */
export async function closedFixtureBackup(root: string, source: string, backup: string) {
  inside(root, source); inside(root, backup);
  assert.equal(await readFile(join(root, 'GENERATED_FIXTURE_ONLY'), 'utf8'), 'generated offline fixture\n');
  const data = join(source, 'data'), unlock: Array<() => void> = [];
  try {
    unlock.push(lockFile(join(data, 'catalog.sqlite.lock')));
    unlock.push(lockFile(join(data, 'app-state.sqlite.lock')));
    const catalog = readCheckpointedFixture(join(data, 'catalog.sqlite'));
    let paths: string[];
    try { paths = (catalog.prepare('SELECT dbPath FROM sessions').all() as { dbPath: string }[]).map(row => row.dbPath); }
    finally { catalog.close(); }
    for (const path of paths) {
      inside(data, path);
      inside(await realpath(data), await realpath(path));
      unlock.push(lockFile(`${await realpath(path)}.lock`));
    }
    // Do not put this operation's temporary ownership markers into the immutable payload.
    const locks = new Set([join(data, 'catalog.sqlite.lock'), join(data, 'app-state.sqlite.lock'), ...paths.map(path => `${path}.lock`)]);
    await fixtureTree(source); // reject symlinks/special files before following any directory
    await cp(source, backup, { recursive: true, errorOnExist: true, force: false, filter: path => !locks.has(path) });
    return await fixtureTree(backup);
  } finally { for (const release of unlock.reverse()) release(); }
}

/** Read-only preflight of required native handlers; this is NOT a universal profile/schema importer. */
export async function assertFixtureTaskContracts(root: string, path: string, target: RegistrySnapshot, testedMigrations = new Set<string>()) {
  inside(await realpath(root), await realpath(path));
  assert.equal(await readFile(join(root, 'GENERATED_FIXTURE_ONLY'), 'utf8'), 'generated offline fixture\n');
  const db = readCheckpointedFixture(path);
  try {
    const records = (db.prepare('SELECT record FROM tasks ORDER BY id').all() as { record: string }[])
      .map(row => JSON.parse(row.record) as TaskRecord<JsonValue, JsonValue, JsonValue>);
    const required = records.filter(record => record.state.status !== 'terminal');
    for (const record of required) {
      const definition = target.task(record.kind)?.definition;
      assert.ok(definition, `Unsupported saved task ${record.kind}@${record.version}; resume refused`);
      assert.ok(definition.version === record.version || (definition.migrate && testedMigrations.has(`${record.kind}:${record.version}->${definition.version}`)),
        `Untested saved task transition ${record.kind}:${record.version}->${definition.version}; resume refused`);
    }
    return required.map(record => ({ id: record.id, kind: record.kind, version: record.version, status: record.state.status }));
  } finally { db.close(); }
}

/** Rebind only the generated catalog's explicit DB columns, never a native record/model/profile ID. */
export async function rebindFixtureCopy(root: string, source: string, backup: string, destination: string) {
  inside(root, source); inside(root, backup); inside(root, destination);
  assert.equal(await readFile(join(root, 'GENERATED_FIXTURE_ONLY'), 'utf8'), 'generated offline fixture\n');
  const before = await fixtureTree(backup);
  await cp(backup, destination, { recursive: true, errorOnExist: true, force: false });
  const copiedData = join(destination, 'data'), sourceData = join(source, 'data');
  const catalog = new DatabaseSync(join(copiedData, 'catalog.sqlite'));
  const mapping: Array<{ id: string; from: string; to: string }> = [];
  try {
    const rows = catalog.prepare('SELECT id,dbPath FROM sessions').all() as Array<{ id: string; dbPath: string }>;
    // Validate ALL rows before the first rewrite; no best-effort partial conversion.
    for (const row of rows) {
      const suffix = inside(sourceData, row.dbPath), target = join(copiedData, suffix);
      inside(await realpath(copiedData), await realpath(target));
      mapping.push({ id: row.id, from: row.dbPath, to: target });
    }
    catalog.exec('BEGIN IMMEDIATE');
    for (const row of mapping) catalog.prepare('UPDATE sessions SET dbPath=? WHERE id=?').run(row.to, row.id);
    catalog.exec('COMMIT');
  } finally { catalog.close(); }
  assert.deepEqual(await fixtureTree(backup), before, 'Rebinding must leave master backup immutable');
  return mapping;
}
