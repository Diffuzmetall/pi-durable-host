import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import { DpiClient } from './host/node_modules/dpi-sdk/dist/client.js';
import { startHostService } from './terminal/host-bindings-v16/terminal-launcher.mjs';
const binary = new URL('./host/operational-service.mjs', import.meta.url).pathname;

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'host-final-fixture-'));
  const agentDir = join(root, 'home/.pi/agent');
  await mkdir(join(root, 'sessions'));
  await mkdir(agentDir, { recursive: true });
  await writeFile(join(agentDir, 'auth.json'), JSON.stringify({ 'openai-codex': {
    type: 'oauth', access: 'SYNTHETIC_OFFLINE_ACCESS', refresh: 'SYNTHETIC_OFFLINE_REFRESH', expires: Date.now() + 3_600_000,
  } }), { mode: 0o600 });
  const config = join(root, 'host.json');
  await writeFile(config, JSON.stringify({ dataDir: root, startDirs: [root], trustedWorkspaces: [], port: 49182,
    ownerGrantId: 'test', grants: [{ id: 'test', actor: 'test', token: 'synthetic-token', source: 'terminal', authority: 'human',
      permissions: ['read', 'write', 'control', 'filesystem', 'human-accept'], binding: {} }] }), { mode: 0o600 });
  return { root, config, env: { ...process.env, HOME: join(root, 'home'), PI_CODING_AGENT_DIR: agentDir, NOTIFY_SOCKET: '' } };
}

test('final service refuses a pre-existing owner lock without modifying it', { timeout: 10000 }, async () => {
  const { root, config, env } = await fixture();
  const lock = join(root, 'catalog.sqlite.lock');
  await writeFile(lock, '999999999', { mode: 0o600 });
  const child = spawn(process.execPath, [binary, config], { env });
  let stderr = ''; child.stderr.on('data', chunk => { stderr += chunk; });
  assert.equal((await once(child, 'exit'))[0], 1);
  assert.match(stderr, /EXISTING_OWNER_LOCK_REFUSED/);
  assert.equal(await readFile(lock, 'utf8'), '999999999');
});

test('final Host starts, serves SDK discovery, closes and reopens with disposable HOME', { timeout: 30000 }, async () => {
  const { config, env } = await fixture();
  for (let attempt = 0; attempt < 2; attempt++) {
    const child = spawn(process.execPath, ['--import', 'data:text/javascript,globalThis.fetch=()=>{throw Error("MODEL_NETWORK_FORBIDDEN")}', binary, config], { env });
    const exited = once(child, 'exit');
    let stderr = ''; child.stderr.on('data', chunk => { stderr += chunk; });
    try {
      const ready = (async () => {
        for await (const line of createInterface({ input: child.stdout })) if (line.includes('NATIVE_HOST_READY')) return JSON.parse(line);
        throw Error('No ready event: ' + stderr);
      })();
      const info = await Promise.race([ready, exited.then(() => { throw Error('Early exit: ' + stderr); })]);
      const client = new DpiClient(info.endpoint, 'synthetic-token');
      assert.deepEqual((await client.device()).defaultModelRef, { provider: 'openai-codex', modelId: 'gpt-6.1-sol' });
      assert.deepEqual(await client.sessions(), []);
      assert.ok((await client.protocol()).capabilities.includes('runtime-refresh.v1'));
    } finally { child.kill('SIGTERM'); assert.equal((await exited)[0], 0, stderr); }
  }
});

test('final terminal budget exceeds Host startup budget', async () => {
  await startHostService(async (binary, args, options) => {
    assert.equal(binary, '/usr/bin/systemctl');
    assert.deepEqual(args, ['--user', 'start', 'pi-durable-host.service']);
    assert.equal(options.timeout, 330_000);
  });
});
