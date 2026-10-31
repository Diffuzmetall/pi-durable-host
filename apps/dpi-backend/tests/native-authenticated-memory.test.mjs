import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { join } from 'node:path';
import { BACKGROUND_CONTEXT as ctx, withAbortSignal } from '@earendil-works/chord/context';
import { createModels } from '@earendil-works/pi-ai/models';
import { fauxProvider, fauxAssistantMessage, fauxText } from '@earendil-works/pi-ai/providers/faux';
import { Harness, UserEntry, createRegistry } from '@earendil-works/pi-durable';
import { NodeExecutionEnv } from '@earendil-works/pi-durable/env/node';
import { openNodeSqliteStorage } from '@earendil-works/pi-durable/storage/sqlite/node';
import { Store } from '../src/store.js';
import { minimalProfile } from '../src/runtime-profile.js';
import { nativeRequestKey } from '../src/idempotency.js';
import { createSessionMemory, HindsightClient, resolveConfig } from '../src/native-profile/memory/session-memory.mjs';
import { tempStore } from './helpers.js';

test('authenticated actual Store.send retains admitted user turns without treating passive entries as inputs', { timeout: 30000 }, async () => {
  const temp = await tempStore();
  const calls = [];
  const endpoint = createServer(async (request, response) => {
    let raw = '';
    for await (const bytes of request) raw += bytes;
    const path = new URL(request.url, 'http://127.0.0.1').pathname;
    assert.equal(request.headers.authorization, 'Bearer memory-regression-fixture');
    calls.push({ method: request.method, path, body: raw ? JSON.parse(raw) : undefined });
    response.setHeader('content-type', 'application/json');
    if (path.endsWith('/memories/recall')) response.end(JSON.stringify({ results: [{ text: 'FIXTURE_CONTEXT_ONLY' }] }));
    else if (path.endsWith('/knowledge-base/tree')) response.end(JSON.stringify({ roots: [] }));
    else if (path.endsWith('/memories') && request.method === 'POST') response.end(JSON.stringify({ operation_id: `fixture-retain-${calls.length}` }));
    else response.end('{}');
  }).listen(0, '127.0.0.1');
  await once(endpoint, 'listening');
  const base = `http://127.0.0.1:${endpoint.address().port}/memory`;
  let store, memory, harness;
  try {
    // Real Store method owner with an EMPTY catalog: it opens no second Harness.
    // Explicit storage stays with the sole native owner below. Full profile/HTTP is a separate gate.
    store = await Store.open({ ...temp.options, profile: minimalProfile });
    assert.equal(store.opened.size, 0);
    const registry = createRegistry();
    const directory = join(temp.root, 'memory-state');
    const cfg = resolveConfig({ apiUrl: base, apiToken: 'memory-regression-fixture', serverMode: 'remote', autoInject: 'recall',
      autoSeed: false, autoUpdate: false, codebaseSurvey: false, gitIngest: 'none', manageBankConfig: false, retainSessions: true });
    const client = new HindsightClient({ apiUrl: base, apiToken: cfg.apiToken, bank: 'regression-bank', project: temp.work, log() {} });
    memory = await createSessionMemory(registry, {
      directory,
      resolveBinding: cwd => { assert.equal(cwd, temp.work); return { cfg, bankId: 'regression-bank' }; },
      resolveClient: binding => { assert.equal(binding.cwd, temp.work); return client; },
      lifecycleEffects: { env: {}, hasGit: () => false, startSeed() { throw Error('NO_SEED'); }, startSurvey() { throw Error('NO_SURVEY'); } },
    });
    const provider = fauxProvider({ provider: 'authenticated-memory-fixture', models: [{ id: 'echo', contextWindow: 128000, maxTokens: 4096 }], tokensPerSecond: 100000 });
    const models = createModels();
    models.setProvider(provider.provider);
    const storage = await openNodeSqliteStorage(join(directory, 'native.sqlite'));
    harness = await Harness.open(storage, { models, registry, env: () => new NodeExecutionEnv({ cwd: temp.work }) }, ctx);
    const conversation = await harness.root(ctx, { agent: { cwd: temp.work, model: { provider: 'authenticated-memory-fixture', modelId: 'echo' } } });
    await memory.bind({ session: harness, storage, context: ctx });
    const identity = { actor: 'server-authenticated-fixture', source: 'bb', authority: 'human', assertCurrent() {} };
    const body = { content: 'AUTHENTICATED_USER_TURN_SENTINEL', requestId: 'bb-stable-regression', whenBusy: 'followUp' };
    const nativeKey = nativeRequestKey(identity.actor, 'message', body.requestId);
    await memory.controller.admit(conversation, nativeKey, ctx);
    provider.setResponses([fauxAssistantMessage(fauxText('AUTHENTICATED_ASSISTANT_TURN_SENTINEL'))]);
    const accepted = await store.send(conversation, body, identity);
    const result = await accepted.wait(withAbortSignal(AbortSignal.timeout(10000), ctx));
    assert.equal(result.status, 'done');
    const entry = await harness.commit(async tx => {
      const receipt = await tx.submissionByRequest(conversation.id, nativeKey);
      assert.equal(receipt.id, accepted.id);
      return tx.entry(receipt.entry);
    }, ctx);
    assert.deepEqual(entry.data, { actor: identity.actor, source: identity.source, authority: identity.authority, requestId: body.requestId });
    await memory.drain(5000);
    const retained = () => calls.filter(call => call.method === 'POST' && call.path.endsWith('/memories'));
    const payload = JSON.stringify(retained().map(call => call.body));
    assert.ok(payload.includes(body.content), 'actual Hindsight retention must include the authenticated USER turn, not assistant-only history');
    assert.ok(payload.includes('AUTHENTICATED_ASSISTANT_TURN_SENTINEL'));
    assert.equal(entry.kind, 'host.input', 'supported application input preserves trusted metadata');
    assert.equal(UserEntry.is(entry), false, 'SDK UserEntry token intentionally covers pi.user only; native receipt owns input identity');
    const count = retained().length;
    const retry = await store.send(conversation, body, identity);
    assert.equal(retry.id, accepted.id, 'same actor/key preserves native submission identity');
    await assert.rejects(store.send(conversation, { ...body, content: 'changed-body' }, identity), /different payload/);
    await memory.drain(2000);
    assert.equal(retained().length, count, 'accepted retry cannot produce another retained turn');
    const history = (await conversation.entries({}, 200, undefined, ctx)).items;
    const nativeInputs = (await storage.scanSubmissions({}, 100, undefined, ctx)).items.filter(record => record.type === 'input');
    assert.equal(nativeInputs.length, 1, 'same key has one native input receipt, regardless of application entry kind');
    assert.equal(nativeInputs[0].id, accepted.id);
    assert.equal(store.opened.size, 0, 'Store method did not create a competing native owner');
    const revoked = { ...identity, assertCurrent() { throw Error('CURRENT_GRANT_REVOKED'); } };
    await assert.rejects(store.send(conversation, { ...body, requestId: 'revoked' }, revoked), /CURRENT_GRANT_REVOKED/);
    assert.equal((await conversation.entries({}, 200, undefined, ctx)).items.length, history.length);
    // A passive entry can look like a user message without being an admitted input.
    await harness.commit(tx => tx.appendEntry(conversation.id, {
      kind: 'fixture.passive', model: [{ role: 'user', content: 'PASSIVE_FAKE_USER_SENTINEL', timestamp: Date.now() }],
    }), ctx);
    const otherKey = 'other-application-native-key';
    await memory.controller.admit(conversation, otherKey, ctx);
    provider.setResponses([fauxAssistantMessage(fauxText('OTHER_APPLICATION_ANSWER_SENTINEL'))]);
    const other = await conversation.submit({ type: 'input', requestId: otherKey, whenBusy: 'followUp',
      content: 'OTHER_APPLICATION_USER_SENTINEL', entry: { kind: 'fixture.other-application', data: { label: 'supported SDK custom input' } },
    }, ctx);
    assert.equal((await other.wait(withAbortSignal(AbortSignal.timeout(10000), ctx))).status, 'done');
    await memory.drain(5000);
    const latest = JSON.stringify(retained().at(-1)?.body);
    assert.ok(latest.includes(body.content), 'same retention epoch still spans the earlier user turn');
    assert.ok(latest.includes('OTHER_APPLICATION_USER_SENTINEL'), 'native receipt classifier must not be a literal host.input alias');
    assert.ok(latest.includes('OTHER_APPLICATION_ANSWER_SENTINEL'));
    assert.ok(!latest.includes('PASSIVE_FAKE_USER_SENTINEL'), 'model.role alone is not proof of an admitted input');
  } finally {
    await memory?.close();
    await harness?.close(ctx);
    await store?.close();
    endpoint.closeAllConnections();
    await new Promise(resolve => endpoint.close(resolve));
    await temp.cleanup();
  }
});
