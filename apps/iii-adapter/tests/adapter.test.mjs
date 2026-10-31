import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { IiiAdapter } from '../src/worker.js';
import { fingerprint } from '../src/auth.js';

test('adapter constructs the real public SDK AgentHandle without a nonexistent SessionHandle.agent method', () => {
  const keys = generateKeyPairSync('ed25519');
  const config = { version: 2, optIn: true, contractVersion: 2, sessionId: 'fixture-binding', workspace: '/disposable/server',
    namespace: 'durable-pi-test-constructor', url: 'ws://127.0.0.1:45832', publicKey: keys.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    host: { baseUrl: 'http://127.0.0.1:45833', sessionId: 'native-fixture-session', agentId: 1, tokenEnv: 'III_FIXTURE_DPI_TOKEN' } };
  const adapter = new IiiAdapter(config, 'SYNTHETIC_DELEGATED_FIXTURE');
  assert.equal(adapter.configHash, fingerprint(config));
  assert.equal(adapter.workerId, fingerprint(config.publicKey));
  assert.equal(adapter.config.host.agentId, 1);
  assert.equal(Object.isFrozen(adapter.config), true);
  assert.equal(Object.isFrozen(adapter.config.host), true);
});
