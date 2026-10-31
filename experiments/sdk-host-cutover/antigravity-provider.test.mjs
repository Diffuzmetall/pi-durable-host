import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createNativeModels } from 'dpi-backend/native-profile';
import { InMemoryCredentialStore, createAssistantMessageEventStream } from '@earendil-works/pi-ai';
import { createAntigravityAccess, createAntigravityProvider } from './provider.mjs';

const model = { id: 'gemini-test', name: 'Fixture', reasoning: true, input: ['text'], contextWindow: 10000,
  maxTokens: 1000, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, thinkingLevelMap: { off: null, minimal: null, low: 'low', medium: null, high: 'high' } };
const message = { role: 'assistant', api: 'antigravity-api', provider: 'antigravity', model: model.id,
  content: [{ type: 'text', text: 'fixture-ok' }], stopReason: 'stop', timestamp: Date.now(),
  usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } };

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'antigravity-provider-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = join(directory, 'antigravity-accounts.json');
  const account = { access: 'fixture-access', refresh: 'fixture-refresh', expires: Date.now() + 3600000, projectId: 'fixture-project' };
  let refreshes = 0;
  const access = createAntigravityAccess({ agentDir: directory,
    getApiKey: a => JSON.stringify({ token: a.access, projectId: a.projectId }),
    refreshToken: async () => { refreshes++; return { access: 'fixture-renewed', expires: Date.now() + 3600000 }; } });
  const save = async (a = account, active = 'one') => writeFile(file, JSON.stringify({ activeAccountId: active, accounts: { [active]: a } }), { mode: 0o600 });
  return { access, save, file, account, refreshes: () => refreshes };
}

test('regression: native session catalogue includes the exact Antigravity IDs without refreshing OAuth', async t => {
  const f = await fixture(t); await f.save({ ...f.account, expires: 1 });
  const provider = createAntigravityProvider({ models: [model], stream: () => assert.fail('discovery must not generate'), access: f.access });
  const runtime = await createNativeModels({ credentials: new InMemoryCredentialStore(), providers: [provider] });
  const catalogue = await runtime.catalogue();
  assert.equal(catalogue[0].provider, 'antigravity'); assert.equal(catalogue[0].id, model.id);
  assert.equal(catalogue[0].available, true); assert.equal(f.refreshes(), 0);
  assert.deepEqual(catalogue[0].supportedThinkingLevels, ['low', 'high']);
  assert(!JSON.stringify(catalogue).includes('fixture-refresh'));
});

test('missing accounts leave models unavailable rather than crashing unrelated providers', async t => {
  const f = await fixture(t);
  const provider = createAntigravityProvider({ models: [model], stream: () => assert.fail(), access: f.access });
  const runtime = await createNativeModels({ credentials: new InMemoryCredentialStore(), providers: [provider] });
  assert.equal((await runtime.catalogue())[0].available, false);
  await assert.rejects(runtime.requireModel({ provider: 'antigravity', modelId: model.id }));
});

test('real native Models dispatch preserves system/tools, reasoning, abort signal and final events', async t => {
  const f = await fixture(t); await f.save(); let called = 0;
  const controller = new AbortController();
  const provider = createAntigravityProvider({ models: [model], access: f.access, stream: (m, context, options) => {
    called++; assert.equal(m.provider, 'antigravity'); assert.equal(m.api, 'antigravity-api');
    assert(context.messages.some(x => x.role === 'system'));
    assert.equal(options.reasoning, 'high'); assert.equal(options.signal, controller.signal);
    assert.equal(JSON.parse(options.apiKey).token, 'fixture-access');
    const stream = createAssistantMessageEventStream();
    stream.push({ type: 'start', partial: message }); stream.push({ type: 'done', reason: 'stop', message }); stream.end(); return stream;
  } });
  const runtime = await createNativeModels({ credentials: new InMemoryCredentialStore(), providers: [provider] });
  const selected = await runtime.requireModel({ provider: 'antigravity', modelId: model.id });
  const stream = runtime.models.streamSimple(selected, { systemPrompt: 'fixture system', tools: [], messages: [{ role: 'user', content: 'test', timestamp: Date.now() }] }, { reasoning: 'high', signal: controller.signal });
  const events = []; for await (const event of stream) events.push(event.type);
  assert.deepEqual(events, ['start', 'done']); assert.equal((await stream.result()).content[0].text, 'fixture-ok'); assert.equal(called, 1);
});

test('OAuth refresh is request-time, memory-only and follows the selected account', async t => {
  const f = await fixture(t); await f.save({ ...f.account, expires: 1 });
  const before = await readFile(f.file, 'utf8');
  assert.equal(await f.access.available(), true); assert.equal(f.refreshes(), 0);
  assert.equal(JSON.parse(await f.access.resolveApiKey()).token, 'fixture-renewed');
  await f.access.resolveApiKey(); assert.equal(f.refreshes(), 1);
  assert.equal(await readFile(f.file, 'utf8'), before);
  await f.save({ ...f.account, access: 'fixture-second' }, 'two');
  assert.equal(JSON.parse(await f.access.resolveApiKey()).token, 'fixture-second');
});

test('malformed account fails closed without reflecting credential text', async t => {
  const f = await fixture(t); await writeFile(f.file, '{fixture-sensitive-invalid-json', { mode: 0o600 });
  assert.equal(await f.access.available(), false);
  await assert.rejects(f.access.resolveApiKey(), { message: 'ANTIGRAVITY_ACCOUNT_UNAVAILABLE' });
});

test('cancelled auth never refreshes or streams', async t => {
  const f = await fixture(t); await f.save({ ...f.account, expires: 1 });
  const controller = new AbortController(); controller.abort();
  await assert.rejects(f.access.resolveApiKey({ abortSignal: controller.signal }), { name: 'AbortError' });
  assert.equal(f.refreshes(), 0);
});
