import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { InMemoryCredentialStore } from '@earendil-works/pi-ai';
import { fauxProvider } from '@earendil-works/pi-ai/providers/faux';
import { Store } from '../src/store.ts';
import { GrantPolicy, createHttpServer } from '../src/http-server.ts';
import { createNativeProfile, createNativeModels } from '../src/native-profile/profile.ts';
import { DpiClient } from '../../dpi-sdk/src/client.ts';
import { tempStore } from './helpers.ts';

test('conversation-bound BB grant reads exact native agent Models without broadening session or foreign read scope', { timeout: 30000 }, async () => {
  const temporary = await tempStore();
  const workA = join(temporary.work, 'A'), workB = join(temporary.work, 'B'); await mkdir(workA); await mkdir(workB);
  const reference = { provider: 'native-agent-menu', modelId: 'exact/scoped-model' };
  const owner = { id: 'owner', token: 'fixture-agent-model-owner', actor: 'owner', source: 'terminal', authority: 'human',
    permissions: ['read', 'write', 'control', 'filesystem', 'human-accept'], binding: {} };
  let policy = new GrantPolicy([owner]);
  async function configured(scope) {
    const credentials = new InMemoryCredentialStore();
    await credentials.modify(reference.provider, async () => ({ type: 'api_key', key: `SYNTHETIC_MODEL_KEY_${scope}` }));
    const fake = fauxProvider({ provider: reference.provider, models: [{ id: reference.modelId, reasoning: true,
      contextWindow: scope === 'B' ? 65536 : 131072, maxTokens: 8192 }], tokensPerSecond: 100000 });
    fake.getModel().thinkingLevelMap = { max: 'max', xhigh: null };
    return createNativeModels({ credentials, providers: [{ ...fake.provider, auth: { apiKey: { name: 'fixture scoped auth',
      resolve: async ({ credential }) => credential?.key ? { auth: { apiKey: credential.key } } : undefined } } }] });
  }
  const menu = await configured('MENU');
  const build = () => createNativeProfile({ policy, owner: policy.authenticate(owner.token),
    models: { defaultModel: reference, catalogue: menu.catalogue, create: context => configured(context.cwd === workA ? 'A' : 'B') },
    resolveSkill: async () => { throw Error('No fixture skills'); }, connectMcp: async () => ({ sources: [], close: async () => {} }) });
  const options = { ...temporary.options, startDirs: [workA, workB] };
  let store = await Store.open({ ...options, profile: build() }), server;
  try {
    const A = await store.create({ name: 'A', cwd: workA, model: reference });
    const B = await store.create({ name: 'B', cwd: workB, model: reference });
    const other = await store.createAgent(store.resolveSession(A.id), { name: 'real-other-conversation' });
    await store.close();
    policy = new GrantPolicy([owner, { id: 'bb-root', token: 'fixture-agent-model-bb', actor: 'bb-root', source: 'bb', authority: 'human',
      permissions: ['read', 'write', 'control'], binding: { sessionId: A.id, conversationId: 1, bb: { providerId: 'fixture-provider', threadId: 'fixture-thread' } } }]);
    store = await Store.open({ ...options, profile: build() });
    let reads = 0; const original = store.sessionModels.bind(store);
    store.sessionModels = async row => { reads++; return original(row); };
    server = createHttpServer(store, policy).listen(0, '127.0.0.1'); await once(server, 'listening');
    const base = `http://127.0.0.1:${server.address().port}`;
    const bb = new DpiClient(base, 'fixture-agent-model-bb'), human = new DpiClient(base, owner.token);
    assert.ok((await bb.protocol()).capabilities.includes('agent-models.v1'));
    const aModels = await bb.agent(A.id, 'main').models();
    assert.equal(aModels[0].provider, reference.provider); assert.equal(aModels[0].id, reference.modelId);
    assert.equal(aModels[0].contextWindow, 131072); assert.equal(aModels[0].available, true);
    assert.deepEqual(aModels[0].supportedThinkingLevels, ['off', 'minimal', 'low', 'medium', 'high', 'max']);
    assert.equal((await human.agent(B.id, 'main').models())[0].contextWindow, 65536);
    assert.deepEqual(await human.session(A.id).models(), aModels, 'original session metadata API remains unchanged');
    const configuredAgent = await bb.agent(A.id, 'main').configure({ model: reference, thinkingLevel: 'max' });
    assert.equal(configuredAgent.thinkingLevel, 'max'); assert.deepEqual(configuredAgent.model, reference);
    assert.doesNotMatch(JSON.stringify(aModels), /SYNTHETIC_MODEL_KEY|apiKey|credential|authorization/);
    const beforeDenied = reads;
    await assert.rejects(bb.session(A.id).models(), { status: 403 });
    await assert.rejects(bb.agent(B.id, 'main').models(), { status: 403 });
    await assert.rejects(bb.agent(A.id, other.id).models(), { status: 403 });
    assert.equal(reads, beforeDenied, 'grant denies before model lookup, including a real foreign conversation');
    policy.revoke('bb-root'); await assert.rejects(bb.agent(A.id, 'main').models(), { status: 401 });
    assert.equal(reads, beforeDenied);
    assert.equal(store.models.getModels().length, 0, 'native metadata never falls back to the legacy global provider catalogue');
  } finally {
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    await store.close(); await temporary.cleanup();
  }
});
