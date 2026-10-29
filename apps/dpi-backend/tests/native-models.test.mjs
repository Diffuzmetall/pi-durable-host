import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { InMemoryCredentialStore, InMemoryModelsStore, getSupportedThinkingLevels } from '@earendil-works/pi-ai';
import { fauxProvider, fauxAssistantMessage } from '@earendil-works/pi-ai/providers/faux';
import { BACKGROUND_CONTEXT as ctx, withAbortSignal } from '@earendil-works/chord/context';
import { Harness, createRegistry } from '@earendil-works/pi-durable';
import { NodeExecutionEnv } from '@earendil-works/pi-durable/env/node';
import { openNodeSqliteStorage } from '@earendil-works/pi-durable/storage/sqlite/node';
import { createNativeModels } from '../src/native-profile/models/index.ts';

const reference = { provider: 'same-provider', modelId: 'exact/model-id' };
function fixture() {
  const faux = fauxProvider({ provider: reference.provider, models: [{ id: reference.modelId, reasoning: true, contextWindow: 123456, maxTokens: 8192 }], tokensPerSecond: 100000 });
  faux.getModel().thinkingLevelMap = { max: 'max', xhigh: null };
  const provider = { ...faux.provider, auth: { apiKey: { name: 'explicit test credential', resolve: async ({ credential }) => credential?.key ? { auth: { apiKey: credential.key } } : undefined } } };
  return { faux, provider };
}
async function credentials(key) {
  const store = new InMemoryCredentialStore();
  await store.modify(reference.provider, async () => ({ type: 'api_key', key }));
  return store;
}

test('public native builtins retain IDs and thinking metadata, with closed ambient auth and no default substitution', async () => {
  const before = { fetch: globalThis.fetch, HOME: process.env.HOME, agent: process.env.PI_CODING_AGENT_DIR };
  await assert.rejects(createNativeModels(), /NATIVE_CREDENTIAL_STORE_REQUIRED/);
  const runtime = await createNativeModels({ credentials: new InMemoryCredentialStore() });
  assert.equal(runtime.defaultModel, undefined);
  assert.ok(runtime.models.getProviders().length > 10);
  const catalogue = await runtime.catalogue();
  assert.equal(catalogue.length, runtime.models.getModels().length);
  assert.ok(catalogue.length > 100);
  for (const entry of catalogue) {
    const native = runtime.models.getModel(entry.provider, entry.id);
    assert.ok(native);
    assert.equal(entry.name, native.name);
    assert.deepEqual(entry.supportedThinkingLevels, getSupportedThinkingLevels(native));
    assert.equal('headers' in entry, false);
    assert.equal('baseUrl' in entry, false);
    assert.equal('auth' in entry, false);
  }
  const openai = catalogue.find(model => model.provider === 'openai');
  assert.ok(openai); assert.equal(openai.available, false);
  assert.equal(await runtime.models.getAuth('openai'), undefined);
  await assert.rejects(runtime.requireModel({ provider: 'openai', modelId: openai.id }), /credentials or availability are missing/);
  await assert.rejects(runtime.requireModel({ provider: 'openai', modelId: 'DELETED_SAVED_MODEL' }), /unavailable.*DELETED_SAVED_MODEL/);
  await assert.rejects(runtime.requireModel({ provider: 'ABSENT_PROVIDER', modelId: openai.id }), /unavailable.*ABSENT_PROVIDER/);
  assert.equal(globalThis.fetch, before.fetch);
  assert.equal(process.env.HOME, before.HOME);
  assert.equal(process.env.PI_CODING_AGENT_DIR, before.agent);
});

test('two actual Harnesses keep identical native model IDs but independent credentials, transports and lifetime', { timeout: 20000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'dpi-native-models-'));
  const calls = [];
  const sessions = [];
  const endpoint = createServer(async (request, response) => {
    let body = ''; for await (const chunk of request) body += chunk;
    calls.push({ owner: request.url, authorization: request.headers.authorization, ...JSON.parse(body) });
    response.end(`native response ${request.url}`);
  }).listen(0, '127.0.0.1');
  await once(endpoint, 'listening');
  const base = `http://127.0.0.1:${endpoint.address().port}`;
  async function open(owner) {
    const work = join(root, owner); await mkdir(work);
    const { faux, provider } = fixture();
    const store = await credentials(`SYNTHETIC_KEY_${owner}`);
    const runtime = await createNativeModels({ credentials: store, providers: [provider], defaultModel: { ...reference, privateHint: 'SYNTHETIC_PRIVATE_HINT' } });
    const harness = await Harness.open(await openNodeSqliteStorage(join(work, 'native.sqlite')), {
      models: runtime.models, registry: createRegistry(), env: () => new NodeExecutionEnv({ cwd: work, env: { HOME: work } }),
    }, ctx);
    const conversation = await harness.root(ctx, { agent: { cwd: work, model: runtime.defaultModel } });
    let closed = false;
    const session = { runtime, store, faux,
      async run(requestId) {
        faux.setResponses([async (_context, options, _state, model) => {
          const result = await fetch(`${base}/${owner}`, { method: 'POST', headers: { authorization: `Bearer ${options.apiKey}` }, body: JSON.stringify({ provider: model.provider, modelId: model.id }) });
          return fauxAssistantMessage(await result.text());
        }]);
        const input = await conversation.submit({ type: 'input', content: `isolated ${owner}`, requestId }, ctx);
        assert.equal((await input.wait(withAbortSignal(AbortSignal.timeout(5000), ctx))).status, 'done');
      },
      async close() { if (!closed) { closed = true; await harness.close(ctx); } },
    };
    sessions.push(session); return session;
  }
  try {
    const a = await open('A'); const b = await open('B');
    assert.notEqual(a.runtime.models, b.runtime.models);
    assert.deepEqual(a.runtime.defaultModel, reference);
    assert.ok(Object.isFrozen(a.runtime.defaultModel));
    const metadata = await a.runtime.catalogue();
    assert.deepEqual(metadata[0].supportedThinkingLevels, ['off', 'minimal', 'low', 'medium', 'high', 'max']);
    assert.equal(metadata[0].id, reference.modelId);
    assert.equal(metadata[0].contextWindow, 123456);
    assert.equal(metadata[0].available, true);
    assert.ok(!JSON.stringify(metadata).includes('SYNTHETIC_KEY'));
    await Promise.all([a.run('native-a'), b.run('native-b')]);
    assert.deepEqual(calls.map(call => call.authorization).sort(), ['Bearer SYNTHETIC_KEY_A', 'Bearer SYNTHETIC_KEY_B']);
    assert.ok(calls.every(call => call.provider === reference.provider && call.modelId === reference.modelId));
    await a.store.delete(reference.provider);
    await assert.rejects(a.runtime.requireModel({ ...reference, apiKey: 'SPOOFED_CLIENT_KEY', headers: { authorization: 'spoof' } }), /credentials or availability/);
    assert.equal(await a.runtime.models.getAuth(reference.provider), undefined);
    assert.equal((await b.runtime.models.getAuth(reference.provider)).auth.apiKey, 'SYNTHETIC_KEY_B');
    await a.close(); await b.run('native-b-after-a-close');
    assert.equal(calls.at(-1).authorization, 'Bearer SYNTHETIC_KEY_B');
    assert.equal(calls.at(-1).owner, '/B');
    await assert.rejects(createNativeModels({ credentials: b.store, providers: [fixture().provider], defaultModel: { ...reference, modelId: 'DELETED_SAVED_MODEL' } }), /unavailable.*DELETED_SAVED_MODEL/);
    await assert.rejects(createNativeModels({ credentials: new InMemoryCredentialStore(), providers: [fixture().provider], defaultModel: reference }), /credentials or availability/);
    await assert.rejects(createNativeModels({ credentials: b.store, providers: [fixture().provider, fixture().provider] }), /Duplicate/);
    const aborted = AbortSignal.abort();
    await assert.rejects(b.runtime.requireModel(reference, { signal: aborted }), { name: 'AbortError' });
  } finally {
    await Promise.all(sessions.map(session => session.close()));
    endpoint.closeAllConnections(); await new Promise(resolve => endpoint.close(resolve));
    await rm(root, { recursive: true, force: true });
  }
});

test('cache-only startup preserves native refresh and OAuth credential locking without background login or refresh', async () => {
  let refreshes = 0; const phases = [];
  const { provider } = fixture();
  const store = new InMemoryCredentialStore();
  await store.modify(reference.provider, async () => ({ type: 'oauth', access: 'SYNTHETIC_EXPIRED', refresh: 'SYNTHETIC_REFRESH', expires: 0 }));
  const oauth = { ...provider,
    refreshModels: async context => { phases.push(context.allowNetwork); assert.equal(context.allowNetwork, false); },
    auth: { oauth: {
      name: 'explicit synthetic OAuth',
      login: async () => { throw new Error('interactive login must never run'); },
      refresh: async credential => { refreshes++; return { ...credential, access: 'SYNTHETIC_RENEWED', expires: Date.now() + 3600000 }; },
      toAuth: async credential => ({ apiKey: credential.access }),
    } },
  };
  const runtime = await createNativeModels({ credentials: store, modelsStore: new InMemoryModelsStore(), providers: [oauth], defaultModel: reference });
  assert.deepEqual(phases, [false]);
  assert.equal(refreshes, 0);
  await runtime.catalogue(); assert.equal(refreshes, 0);
  const values = await Promise.all([runtime.models.getAuth(reference.provider), runtime.models.getAuth(reference.provider)]);
  assert.equal(refreshes, 1);
  assert.ok(values.every(value => value.auth.apiKey === 'SYNTHETIC_RENEWED'));
  const missing = await createNativeModels({ credentials: new InMemoryCredentialStore(), providers: [{ ...oauth, refreshModels: undefined }] });
  assert.equal(await missing.models.getAuth(reference.provider), undefined);
  assert.equal((await missing.catalogue())[0].available, false);
  assert.equal(refreshes, 1);
});
