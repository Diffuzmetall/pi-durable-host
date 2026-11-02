import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { AgentDoc } from '@earendil-works/pi-durable';
import { loadFreshModule } from '@local/pi-durable-reload';
import * as loggingScope from '../src/native-profile/memory/logging-scope.mjs';

const loggingPath = fileURLToPath(new URL('../src/native-profile/memory/logging-scope.mjs', import.meta.url));

test('fresh transitive graphs share the existing memory log owner, not behavior caches', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'shared-memory-scope-'));
  try {
    const entry = join(directory, 'entry.mjs');
    const reader = join(directory, 'reader.mjs');
    const alias = join(directory, 'logging-alias.mjs');
    symlinkSync(loggingPath, alias);
    writeFileSync(entry, "export { capture, version } from './reader.mjs';\n");
    for (const version of [1, 2]) {
      writeFileSync(reader, `import { sessionLogPaths } from ${JSON.stringify(relative(directory, loggingPath))};
export const version = ${version};
export async function capture() { await Promise.resolve(); return sessionLogPaths(); }
`);
      const fresh = loadFreshModule(entry, { [alias]: loggingScope });
      assert.equal(fresh.version, version);
      const scopes = ['one', 'two'].map(id => ({ log: `${id}.log`, diag: `${id}.diag`, usage: `${id}.usage` }));
      assert.deepEqual(await Promise.all(scopes.map(scope => loggingScope.withSessionLogs(scope, fresh.capture))), scopes);
      await assert.rejects(fresh.capture, /SESSION_MEMORY_LOG_SCOPE_REQUIRED/);
    }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('shared namespaces cannot replace fixed SDK identities by name or canonical path', () => {
  const directory = mkdtempSync(join(tmpdir(), 'shared-sdk-identity-'));
  try {
    const sdkPath = realpathSync(fileURLToPath(import.meta.resolve('@earendil-works/pi-durable')));
    const sdkAlias = join(directory, 'sdk-alias.mjs');
    symlinkSync(sdkPath, sdkAlias);
    const entry = join(directory, 'entry.mjs');
    writeFileSync(entry, `export { AgentDoc as bare } from '@earendil-works/pi-durable';
export { AgentDoc as absolute } from ${JSON.stringify(sdkPath)};
`);
    const fake = { AgentDoc: 'not the native SDK' };
    const fresh = loadFreshModule(entry, { '@earendil-works/pi-durable': fake, [sdkAlias]: fake });
    assert.equal(fresh.bare, AgentDoc);
    assert.equal(fresh.absolute, AgentDoc);
    assert.throws(() => loadFreshModule(entry, { './relative.mjs': {} }), /DURABLE_SHARED_MODULE_ABSOLUTE_PATH_REQUIRED/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
