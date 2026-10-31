import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { workerConfig } from '../node_modules/dpi-iii-adapter/dist/config.js';
import { fingerprint } from '../node_modules/dpi-iii-adapter/dist/auth.js';
process.umask(0o077);
const release = '/home/ubuntu/.local/share/pi-durable-host/releases/c0019d7-dadd5534';
const root = join(release, 'live-control');
const statePath = join(root, 'host-state.json');
const state = JSON.parse(readFileSync(statePath, 'utf8'));
const binding = JSON.parse(readFileSync(join(release, 'CANDIDATE-PATH-BINDING.json'), 'utf8'));
assert(!existsSync(join(binding.dataDir, 'catalog.sqlite.lock')), 'CLOSE_OWN_HOST_FIRST');
assert(!state.iiiGrant, 'PRESERVE_EXISTING_III_BINDING');
const socket = createServer().listen(0, '127.0.0.1'); await once(socket, 'listening');
const port = socket.address().port; await new Promise(resolve => socket.close(resolve));
const keys = generateKeyPairSync('ed25519');
const publicKey = keys.publicKey.export({ type: 'spki', format: 'pem' }).toString();
const config = workerConfig({ version: 2, optIn: true, contractVersion: 2, sessionId: 'pi-durable-cutover-iii',
  workspace: state.createBody.cwd, namespace: 'durable-pi-test-cutover', url: `ws://127.0.0.1:${port}`, publicKey,
  host: { baseUrl: `http://127.0.0.1:${state.port}`, sessionId: state.newSessionId, agentId: 1, tokenEnv: 'PI_DURABLE_III_TOKEN' } }).value;
assert(config, 'VALID_III_CONFIG_REQUIRED');
state.iiiGrant = { id: 'cutover-iii', actor: 'cutover-iii', source: 'iii', authority: 'delegated', token: randomUUID(),
  permissions: ['read', 'write', 'control', 'filesystem'], binding: { sessionId: state.newSessionId, conversationId: 1,
    iii: { bindingId: config.sessionId, namespace: config.namespace, configHash: fingerprint(config), workerId: fingerprint(publicKey) } } };
for (const [name, content] of [['iii-worker.json', JSON.stringify(config)], ['iii-private.pem', keys.privateKey.export({ type: 'pkcs8', format: 'pem' })],
  ['iii-engine.yaml', `workers:\n  - name: iii-worker-manager\n    config:\n      host: 127.0.0.1\n      port: ${port}\n`]])
  writeFileSync(join(root, name), content, { flag: 'wx', mode: 0o600 });
mkdirSync(join(root, 'iii-home'), { mode: 0o700 });
writeFileSync(`${statePath}.next`, JSON.stringify(state), { flag: 'wx', mode: 0o600 }); renameSync(`${statePath}.next`, statePath);
console.log(JSON.stringify({ status: 'SIGNED_III_BINDING_PREPARED', loopbackPort: port, authority: 'delegated', nativeSessionReused: true }));
