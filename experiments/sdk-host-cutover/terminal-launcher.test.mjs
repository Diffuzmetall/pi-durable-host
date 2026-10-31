import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parseLaunchArgs, selectHostSession } from './terminal-launcher.mjs';

// Unit fixtures for selection and receipts, not substitutes for installed TUI/provider acceptance.
test('CLI never silently forwards legacy extension/MCP/headless options or SQLite locators', async () => {
  assert.deepEqual({ ...parseLaunchArgs(['-c']) }, { continue: true });
  for (const args of [['--extension', '/tmp/untrusted.mjs'], ['-e', '/tmp/untrusted.mjs'], ['--no-mcp'],
    ['--mcp-server', 'mail'], ['--mcp-tools', 'anything'], ['--mcp-agent', 'someone'], ['--listen', '/tmp/socket'],
    ['--print'], ['--json'], ['initial prompt'], ['--session', '/tmp/session.sqlite'], ['--session', 'abc', '-c']])
    assert.throws(() => parseLaunchArgs(args));
  const result = await promisify(execFile)(process.execPath, [new URL('./terminal-launcher.mjs', import.meta.url).pathname, '--help']);
  assert.match(result.stdout, /newest Host session/);
  assert.match(result.stdout, /no automatic fallback/);
});

test('continue means newest server-owned session in exact cwd; aliases and foreign cwd are refused', async () => {
  const rows = [{ id: 'older', cwd: '/work', createdAt: 1 }, { id: 'newer', cwd: '/work', createdAt: 2 },
    { id: 'foreign', cwd: '/other', createdAt: 9 }];
  const client = { sessions: async () => rows, session: id => ({ get: async () => rows.find(row => row.id.startsWith(id)) }) };
  assert.equal(await selectHostSession(client, { continue: true }, '/work'), 'newer');
  await assert.rejects(selectHostSession(client, { continue: true }, '/missing'), /No Host session/);
  await assert.rejects(selectHostSession(client, { session: 'new' }, '/work'), /Exact Host session/);
  await assert.rejects(selectHostSession(client, { session: 'foreign' }, '/work'), /Exact Host session/);
});

test('uncertain creation keeps exact body/key and requires explicit retry; unavailable model is never replaced', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'terminal-intent-'));
  const calls = [];
  const model = { provider: 'faux', modelId: 'exact' };
  const client = {
    device: async () => ({ defaultModelRef: model, models: [{ provider: 'faux', id: 'exact', available: true }] }),
    createSession: async (body, key) => {
      calls.push({ body, key });
      if (calls.length === 1) throw Error('synthetic lost acknowledgement');
      return { id: 'created' };
    },
  };
  await assert.rejects(selectHostSession(client, {}, '/work', directory), /lost acknowledgement/);
  const receipt = await readFile(join(directory, 'launcher-new-session.json'), 'utf8');
  await assert.rejects(selectHostSession(client, {}, '/work', directory), { code: 'EEXIST' });
  assert.equal(calls.length, 1);
  await assert.rejects(selectHostSession(client, { 'retry-new': true }, '/different', directory), /does not match/);
  assert.equal(await selectHostSession(client, { 'retry-new': true }, '/work', directory), 'created');
  assert.deepEqual(calls[1], calls[0]);
  assert.equal(JSON.parse(receipt).key, calls[1].key);
  await assert.rejects(access(join(directory, 'launcher-new-session.json')), { code: 'ENOENT' });
  client.device = async () => ({ defaultModelRef: model, models: [{ provider: 'other', id: 'exact', available: true }] });
  await assert.rejects(selectHostSession(client, {}, '/work', directory), /unavailable/);
  assert.equal(calls.length, 2);
});
