import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fingerprint } from '../src/auth.js';
import { registrationNamespace, readWorkerConfig, workerConfig, type WorkerConfig } from '../src/config.js';

export function fixtureConfig(): WorkerConfig {
  const keys = generateKeyPairSync('ed25519');
  return { version: 2, optIn: true, contractVersion: 2, sessionId: 'fixture-worker-binding', workspace: '/disposable/native-workspace',
    namespace: 'durable-pi-test-fixture', url: 'ws://127.0.0.1:45832', publicKey: keys.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    host: { baseUrl: 'http://127.0.0.1:45833', sessionId: 'native-fixture-session', agentId: 1, tokenEnv: 'III_FIXTURE_DPI_TOKEN' } };
}

test('original namespace and complete config hash bind explicit remote native identity, not a local runtime', () => {
  const value = fixtureConfig(), parsed = workerConfig(value);
  assert.deepEqual(parsed.value, value);
  assert.equal(parsed.configHash, fingerprint(value));
  assert.deepEqual(Object.keys(parsed).sort(), ['configHash', 'value']);
  for (const name of ['default', 'durable-pi-test-A1']) assert.equal(registrationNamespace(name), name);
  for (const name of ['', 'human', 'root', 'durable-pi-test-', 'durable-pi-test-X::default']) assert.throws(() => registrationNamespace(name));
  for (const changed of [ { ...value, namespace: 'default' }, { ...value, workspace: '/different/server' },
    { ...value, sessionId: 'foreign-worker-binding' }, { ...value, host: { ...value.host, agentId: 2 } } ]) {
    assert.notEqual(workerConfig(changed).configHash, parsed.configHash);
  }
  assert.equal(JSON.stringify(value).includes('bearer'), false);
});

test('configuration cannot select a launcher, database, unsigned ingress or payload authority', () => {
  const value = fixtureConfig();
  for (const invalid of [ { ...value, version: 1 }, { ...value, optIn: false }, { ...value, contractVersion: 1 },
    { ...value, directory: '/foreign/session.sqlite' }, { ...value, ingressMode: 'local-iii' },
    { ...value, authority: 'human' }, { ...value, source: 'terminal' }, { ...value, tools: ['bash'] },
    { ...value, _caller_worker_id: 'root' }, { ...value, workspace: 'relative' }, { ...value, namespace: 'root' },
    { ...value, host: { ...value.host, agentId: 0 } }, { ...value, host: { ...value.host, agentId: 1.5 } },
    { ...value, host: { ...value.host, token: 'must-not-serialize-secrets' } },
    { ...value, host: { ...value.host, tokenEnv: 'FOO=bar' } },
    { ...value, host: { ...value.host, baseUrl: 'http://example.invalid' } },
    { ...value, host: { ...value.host, baseUrl: 'https://user:secret@example.invalid' } },
    { ...value, url: 'ws://127.0.0.1:45832?namespace=default' }, { ...value, url: 'http://127.0.0.1' },
    { ...value, publicKey: generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' }).toString() } ]) {
    assert.throws(() => workerConfig(invalid));
  }
});

test('only owner-private operator config is loaded; original config bytes are not mutated or used as session storage', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'dpi-iii-config-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = join(directory, 'worker.json'), value = fixtureConfig();
  await writeFile(file, JSON.stringify(value), { mode: 0o600 });
  assert.deepEqual((await readWorkerConfig(file)).value, value);
  await chmod(file, 0o644);
  await assert.rejects(readWorkerConfig(file), /OWNER_PRIVATE_CONFIG_REQUIRED/);
});
