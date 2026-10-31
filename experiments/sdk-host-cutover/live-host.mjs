import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, lstatSync, openSync, closeSync, fsyncSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID, createHash } from 'node:crypto';
import { once } from 'node:events';
import { Store } from 'dpi-backend/store';
import { GrantPolicy, createHttpServer } from 'dpi-backend/server';
import { DpiClient } from 'dpi-sdk';
import { createOperationalProfile } from '../host-bindings-v15/operational-profile.mjs';
import { AuthStorage } from '../host-bindings-v15/compiled/bindings.mjs';
import { createNativeModels } from 'dpi-backend/native-profile';
import { createSubscriptionProbeModels } from '../acceptance-native-v4/probe-models.mjs';
import { probeStages, savedModel } from '../acceptance-native-v4/subscription-probe.mjs';

process.umask(0o077);
const release = '/home/ubuntu/.local/share/pi-durable-host/releases/c0019d7-dadd5534';
const directory = join(release, 'live-control');
const ledgerDirectory = join(release, 'live-acceptance-ledger');
const binding = JSON.parse(readFileSync(join(release, 'CANDIDATE-PATH-BINDING.json'), 'utf8'));
const authPath = join(process.env.PI_CODING_AGENT_DIR || join(homedir(), '.pi/agent'), 'auth.json');
const statePath = join(directory, 'host-state.json');
function persist(path, value, exclusive = false) {
  const target = exclusive ? path : `${path}.next`;
  const fd = openSync(target, 'wx', 0o600);
  try { writeFileSync(fd, JSON.stringify(value, null, 2)); fsyncSync(fd); } finally { closeSync(fd); }
  if (!exclusive) renameSync(target, path);
  const parent = openSync(directory, 'r'); try { fsyncSync(parent); } finally { closeSync(parent); }
}
if (!existsSync(statePath)) persist(statePath, { ownerToken: randomUUID(), createKey: randomUUID(), createBody: {
  cwd: '/home/ubuntu/Projects/pi-durable-host', name: 'pi-durable live terminal', model: savedModel,
}, memoryAuthorized: true }, true);
const state = JSON.parse(readFileSync(statePath, 'utf8'));
assert.equal(state.memoryAuthorized, true);
const ownerGrant = { id: 'cutover-operator', actor: 'cutover-operator', token: state.ownerToken, source: 'terminal', authority: 'human',
  permissions: ['read', 'write', 'control', 'filesystem', 'human-accept'], binding: {} };
const policy = new GrantPolicy([ownerGrant, ...(state.iiiGrant ? [state.iiiGrant] : [])]);
const discovery = await createSubscriptionProbeModels({ authPath, ledgerDirectory });
await discovery.requireModel(savedModel);
const models = { defaultModel: savedModel, catalogue: discovery.catalogue, create: async context => {
  const capabilities = Object.fromEntries(await Promise.all(probeStages.map(async stage => [stage,
    await createSubscriptionProbeModels({ authPath, ledgerDirectory, stage })])));
  const capability = await createSubscriptionProbeModels({ authPath, ledgerDirectory });
  // Generation stays exclusively on the bounded subscription capability.
  // MCP's existing provider-auth (e.g. Radius OAuth) is not a model dispatch.
  const mcpAuth = await createNativeModels({ credentials: AuthStorage.create(authPath),
    authContext: { env: async () => undefined, fileExists: async () => false } });
  const subscriptionAuth = capability.models.getAuth.bind(capability.models);
  capability.models.getAuth = (provider, ...args) => provider === savedModel.provider
    ? subscriptionAuth(provider, ...args) : mcpAuth.models.getAuth(provider, ...args);
  capability.models.streamSimple = (model, transcript, options) => {
    const path = join(directory, 'active-permit.json');
    const info = lstatSync(path);
    assert(info.isFile() && !info.isSymbolicLink() && !(info.mode & 0o077), 'PRIVATE_OPERATOR_PERMIT_REQUIRED');
    const permit = JSON.parse(readFileSync(path, 'utf8'));
    assert(probeStages.includes(permit.stage), 'UNAPPROVED_STAGE');
    assert.equal(permit.sessionId, context.sessionId, 'WRONG_SESSION');
    const message = transcript.messages.findLast(message => message.role === 'user');
    const text = typeof message?.content === 'string' ? message.content : (message?.content ?? []).filter(item => item.type === 'text').map(item => item.text).join('');
    assert.equal(createHash('sha256').update(text).digest('hex'), permit.promptSha256, 'ONLY_EXPLICIT_OPERATOR_PROBE_MAY_GENERATE');
    return capabilities[permit.stage].models.streamSimple(model, transcript, { ...options, maxTokens: 512 });
  };
  return capability;
} };
const nativeProfile = await createOperationalProfile({ policy, owner: policy.authenticate(ownerGrant.token), models });
const profile = Object.assign(async context => {
  const composition = await nativeProfile(context);
  persist(join(directory, `inventory-${context.sessionId}.json`), composition.native.inventory);
  return composition;
}, nativeProfile);
const store = await Store.open({ dataDir: binding.dataDir, startDirs: [binding.cwd, state.createBody.cwd], name: 'pi-durable cutover', profile });
const server = createHttpServer(store, policy);
let closing;
const close = () => closing ??= (async () => { server.closeAllConnections(); server.close(); await store.close(); })();
process.once('SIGINT', close); process.once('SIGTERM', close);
try {
  server.listen(state.port ?? 0, '127.0.0.1'); await once(server, 'listening');
  state.port = server.address().port;
  persist(statePath, state);
  const endpoint = `http://127.0.0.1:${state.port}`;
  const client = new DpiClient(endpoint, state.ownerToken);
  const selected = await client.session(binding.before.id).get();
  assert(!selected.error, 'SELECTED_SESSION_NOT_READY');
  if (!state.newSessionId) {
    const created = await client.createSession(state.createBody, state.createKey);
    assert(!created.error, 'NEW_SESSION_NOT_READY');
    state.newSessionId = created.id; persist(statePath, state);
  }
  persist(join(directory, 'connection.json'), { endpoint, token: state.ownerToken, selectedSessionId: binding.before.id, newSessionId: state.newSessionId, pid: process.pid });
  console.log(JSON.stringify({ status: 'LIVE_NATIVE_HOST_READY', endpoint, profile: profile.id, selectedReady: true, newReady: true,
    providerAttempts: probeStages.filter(stage => existsSync(join(ledgerDirectory, `${stage}.json`))).length, pid: process.pid }));
} catch (error) {
  await close();
  console.error(error.stack);
  process.exitCode = 1;
}
