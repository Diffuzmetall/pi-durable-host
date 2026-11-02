import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, mkdir, copyFile, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { BACKGROUND_CONTEXT as ctx } from '@earendil-works/chord/context';
import { InMemoryCredentialStore } from '@earendil-works/pi-ai';
import { fauxProvider, fauxAssistantMessage } from '@earendil-works/pi-ai/providers/faux';
import { createNativeModels } from '../../../packages/durable-reload/src/models.ts';
import { createNativeProfile } from '../src/native-profile/profile.ts';
import { Store } from '../src/store.ts';
import { GrantPolicy } from '../src/grants.ts';
import { createHttpServer } from '../src/http-server.ts';
import { DpiClient } from '../../dpi-sdk/src/client.ts';

const selected = { provider: 'hot-provider-fixture', modelId: 'exact/saved-choice' };
const owner = { id: 'owner', token: 'synthetic-provider-owner', actor: 'operator', source: 'terminal', authority: 'human',
  permissions: ['read', 'write', 'control', 'filesystem'], binding: {} };
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
async function sourceFixture() {
  const credentials = new InMemoryCredentialStore();
  await credentials.modify(selected.provider, async () => ({ type: 'api_key', key: 'synthetic-v1' }));
  const state = { version: 1, missing: false, invalid: false, heldStream: undefined, heldAuth: undefined, seen: [] };
  const source = () => {
    if (state.invalid) throw Error('synthetic-private-prepare-fault');
    const version = state.version;
    const faux = fauxProvider({ provider: selected.provider, tokensPerSecond: 100000, models: [
      { id: state.missing ? 'not-the-saved-model' : selected.modelId, name: `Metadata v${version}`, contextWindow: 100000 + version, maxTokens: 4096 },
      { id: `catalogue-${version}`, contextWindow: 100000, maxTokens: 4096 },
    ] });
    faux.setResponses([async () => {
      state.seen.push({ version, stage: 'stream' });
      const held = state.heldStream;
      if (held) { held.started.resolve(); await held.release.promise; }
      return fauxAssistantMessage(`provider-v${version}`);
    }]);
    const provider = { ...faux.provider, auth: { apiKey: { name: 'synthetic', resolve: async ({ credential }) => {
      const held = state.heldAuth;
      if (held && version === 1) { held.started.resolve(); await held.release.promise; }
      return credential?.key ? { auth: { apiKey: credential.key } } : undefined;
    } } }, streamSimple(model, context, options) {
      state.seen.push({ version, stage: 'request', credential: options.apiKey, contextWindow: model.contextWindow });
      return faux.provider.streamSimple(model, context, options);
    } };
    return { credentials, providers: [provider] };
  };
  return { state, source, credentials };
}

test('catalogue read stays in one generation while asynchronous credential lookup overlaps publication', async () => {
  const f = await sourceFixture();
  const models = await createNativeModels(f.source);
  const held = { started: deferred(), release: deferred() };
  f.state.heldAuth = held;
  const reading = models.catalogue();
  await held.started.promise;
  try {
    f.state.version = 2;
    const prepared = await models.prepareReload();
    prepared.publish();
  } finally { held.release.resolve(); }
  const before = await reading;
  assert.ok(before.some(model => model.id === 'catalogue-1' && model.available));
  assert.ok(!before.some(model => model.id === 'catalogue-2'));
  const after = await models.catalogue();
  assert.ok(after.some(model => model.id === 'catalogue-2' && model.available));
});

test('existing Models facade pins in-flight stream/auth and publishes new metadata, credentials and provider for future requests', async () => {
  const f = await sourceFixture();
  const models = await createNativeModels(f.source);
  const facade = models.models;
  const held = { started: deferred(), release: deferred() };
  f.state.heldStream = held;
  const old = facade.streamSimple(await models.requireModel(selected), { messages: [] });
  const oldResult = old.result();
  await held.started.promise;
  try {
    f.state.version = 2;
    await f.credentials.modify(selected.provider, async () => ({ type: 'api_key', key: 'synthetic-v2' }));
    const prepared = await models.prepareReload();
    assert.equal((await models.requireModel(selected)).contextWindow, 100001);
    prepared.publish();
    assert.equal(models.models, facade);
    assert.equal((await models.requireModel(selected)).contextWindow, 100002);
  } finally { f.state.heldStream = undefined; held.release.resolve(); }
  assert.equal((await oldResult).content[0].text, 'provider-v1');
  assert.equal((await facade.completeSimple(await models.requireModel(selected), { messages: [] })).content[0].text, 'provider-v2');
  assert.deepEqual(f.state.seen.filter(event => event.stage === 'request'), [
    { version: 1, stage: 'request', credential: 'synthetic-v1', contextWindow: 100001 },
    { version: 2, stage: 'request', credential: 'synthetic-v2', contextWindow: 100002 },
  ]);
  f.state.invalid = true;
  await assert.rejects(models.prepareReload(), /synthetic-private-prepare-fault/);
  assert.equal((await models.requireModel(selected)).contextWindow, 100002);
  f.state.invalid = false; f.state.missing = true;
  const removed = await models.prepareReload();
  await assert.rejects(removed.requireModel(selected), /unavailable/);
  assert.equal((await models.requireModel(selected)).id, selected.modelId);
  f.state.missing = false; f.state.version = 1;
  (await models.prepareReload()).publish();
  assert.equal((await facade.completeSimple(await models.requireModel(selected), { messages: [] })).content[0].text, 'provider-v1');
});

test('operational model source refreshes provider and transitive implementation but retains the credential owner', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'operational-model-code-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await mkdir(join(directory, 'compiled'));
  await symlink(fileURLToPath(new URL('../node_modules', import.meta.url)), join(directory, 'node_modules'), 'dir');
  await copyFile(new URL('../../../experiments/sdk-host-cutover/operational-models.mjs', import.meta.url), join(directory, 'operational-models.mjs'));
  await writeFile(join(directory, 'compiled/bindings.mjs'), `export const antigravityApiKey = () => 'original-credential-owner'; export const refreshAntigravityToken = () => {};`);
  const writeVersion = async version => {
    await writeFile(join(directory, 'version.mjs'), `export const version = ${version};`);
    await writeFile(join(directory, 'provider.mjs'), `import {version} from './version.mjs';
      export const createAntigravityAccess = options => options;
      export const createAntigravityProvider = options => ({id:'antigravity',version,...options});`);
    await writeFile(join(directory, 'compiled/antigravity.mjs'), `import {version} from '../version.mjs';
      export const getCurrentAntigravityModels = () => [{id:'exact/model',name:'version'+version}];
      export const hydrateAntigravityCatalog = () => {};
      export const streamAntigravity = () => version;
      export const DEFAULT_ENDPOINT = 'https://fixture.invalid/v'+version;`);
  };
  await writeVersion(1);
  const { operationalModelOptions } = await import(pathToFileURL(join(directory, 'operational-models.mjs')).href);
  const credentials = new InMemoryCredentialStore();
  const options = { agentDir: directory, credentials };
  const v1 = (await operationalModelOptions(options)).providers.at(-1);
  await writeVersion(2);
  await writeFile(join(directory, 'compiled/bindings.mjs'), `throw Error('credential owner must not be reimported');`);
  const v2 = (await operationalModelOptions(options)).providers.at(-1);
  assert.equal(v1.version, 1); assert.equal(v2.version, 2);
  assert.equal(v1.stream(), 1); assert.equal(v2.stream(), 2);
  assert.equal(v1.models[0].name, 'version1'); assert.equal(v2.models[0].name, 'version2');
  assert.equal(v2.baseUrl, 'https://fixture.invalid/v2');
  assert.equal(v1.access.getApiKey, v2.access.getApiKey);
  assert.equal(v2.access.getApiKey(), 'original-credential-owner');
  await writeFile(join(directory, 'version.mjs'), 'this is not valid JavaScript');
  await assert.rejects(operationalModelOptions(options));
  assert.equal(v2.stream(), 2);
  await writeVersion(1);
  assert.equal((await operationalModelOptions(options)).providers.at(-1).stream(), 1);
});

test('real Host/SDK reload updates providers during a busy stream, refuses saved-model removal and preserves exact choices on reopen', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'provider-hot-host-'));
  const work = join(directory, 'work'); await mkdir(work);
  const f = await sourceFixture();
  const discovery = await createNativeModels(f.source);
  const policy = new GrantPolicy([owner]);
  const profile = createNativeProfile({ policy, owner: policy.authenticate(owner.token),
    models: { defaultModel: selected, catalogue: discovery.catalogue, create: () => createNativeModels(f.source) },
    dcg: { binaryPath: join(directory, 'absent-dcg'), envSource: () => ({}) },
    connectMcp: async () => ({ sources: [], close: async () => {} }),
  });
  const options = { dataDir: join(directory, 'data'), startDirs: [work], name: 'providers', provider: 'faux', profile };
  let store = await Store.open(options);
  const server = createHttpServer(store, policy).listen(0, '127.0.0.1'); await once(server, 'listening');
  const client = new DpiClient(`http://127.0.0.1:${server.address().port}`, owner.token);
  let held, pending;
  try {
    const session = await client.createSession({ name: 'provider-reload', cwd: work, model: selected });
    const opened = store.opened.get(session.id), harness = opened.harness, facade = opened.models.models;
    held = { started: deferred(), release: deferred() }; f.state.heldStream = held;
    const old = pending = client.agent(session.id, 'main').send('old request', 'followUp', 'provider-old', 10000);
    await held.started.promise;
    f.state.version = 2;
    await f.credentials.modify(selected.provider, async () => ({ type: 'api_key', key: 'synthetic-v2' }));
    const reloaded = await client.session(session.id).reload();
    assert.equal(reloaded.sessionId, session.id);
    assert.equal(store.opened.get(session.id).harness, harness);
    assert.equal(opened.models.models, facade);
    assert.equal((await client.session(session.id).models()).find(model => model.id === selected.modelId).contextWindow, 100002);
    f.state.heldStream = undefined; held.release.resolve();
    assert.equal((await old).status, 'done');
    assert.equal((await client.agent(session.id, 'main').send('new request', 'followUp', 'provider-new', 10000)).status, 'done');
    assert.deepEqual(f.state.seen.filter(event => event.stage === 'request').map(({ version, credential }) => [version, credential]), [[1, 'synthetic-v1'], [2, 'synthetic-v2']]);
    f.state.missing = true;
    await assert.rejects(client.session(session.id).reload(), error => error.status === 503);
    assert.equal((await opened.models.requireModel(selected)).id, selected.modelId);
    assert.deepEqual((await (await harness.root(ctx)).agent(ctx)).model, selected);
    f.state.missing = false; f.state.invalid = true;
    await assert.rejects(client.session(session.id).reload(), error => error.status === 503 && !error.message.includes('synthetic-private-prepare-fault'));
    f.state.invalid = false; f.state.version = 1;
    await client.session(session.id).reload();
    assert.equal((await client.agent(session.id, 'main').send('rollback request', 'followUp', 'provider-rollback', 10000)).status, 'done');
    const requests = f.state.seen.filter(event => event.stage === 'request');
    assert.deepEqual(requests.map(event => event.version), [1, 2, 1]);
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    await store.close(); store = await Store.open(options);
    const reopened = store.opened.get(session.id);
    assert.deepEqual((await (await reopened.harness.root(ctx)).agent(ctx)).model, selected);
    assert.equal((await reopened.harness.root(ctx)).id, 1);
  } finally {
    held?.release.resolve();
    await pending?.catch(() => {});
    server.closeAllConnections(); if (server.listening) await new Promise(resolve => server.close(resolve));
    await store.close();
  }
});
