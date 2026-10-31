import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Harness, createRegistry, defineExtension } from '@earendil-works/pi-durable';
import { openNodeSqliteStorage } from '@earendil-works/pi-durable/storage/sqlite/node';
import { NodeExecutionEnv } from '@earendil-works/pi-durable/env/node';
import { InMemoryCredentialStore } from '@earendil-works/pi-ai';
import { fauxProvider } from '@earendil-works/pi-ai/providers/faux';
import { BACKGROUND_CONTEXT as context } from '@earendil-works/chord/context';
import { createNativeModels, ReloadableRegistry, reloadDurable, loadRegistryAdapters, isDurableReloading } from './dist/index.js';

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'durable-reload-safety-'));
  const reference = { provider: 'reload-safety', modelId: 'exact-saved-model' };
  let revision = 1, missing = false;
  const models = await createNativeModels(() => {
    const faux = fauxProvider({ provider: reference.provider, models: [
      { id: missing ? 'not-the-saved-model' : reference.modelId, contextWindow: 10000, maxTokens: 1000 },
      { id: `revision-${revision}`, contextWindow: 10000, maxTokens: 1000 },
    ] });
    return { credentials: new InMemoryCredentialStore(), providers: [{ ...faux.provider,
      auth: { apiKey: { name: 'fixture', resolve: async () => ({ auth: { apiKey: 'fixture-only' } }) } },
    }] };
  });
  const registry = new ReloadableRegistry(createRegistry());
  const harness = await Harness.open(await openNodeSqliteStorage(join(directory, 'native.sqlite')), {
    models: models.models, registry, env: () => new NodeExecutionEnv({ cwd: directory, env: { HOME: directory } }),
  }, context);
  const root = await harness.root(context, { agent: { model: reference, cwd: directory } });
  return { harness, root, models, registry, reference,
    next(value = false) { revision++; missing = value; },
    close: () => harness.close(context),
  };
}

test('Durable rejects concurrent reload and revoked preparation without publishing either candidate', async () => {
  const f = await fixture();
  let release;
  try {
    const facade = f.models.models, snapshot = f.registry.snapshot();
    let entered;
    const started = new Promise(resolve => { entered = resolve; });
    const gate = new Promise(resolve => { release = resolve; });
    let authorized = true;
    f.next();
    const pending = reloadDurable({ harness: f.harness, context, models: f.models,
      assertCurrent() { if (!authorized) throw Error('FIXTURE_REVOKED'); },
      prepareExtensions: async () => { entered(); await gate; return f.registry.prepare([]); },
    });
    await started;
    assert.equal(isDurableReloading(f.harness), true);
    await assert.rejects(reloadDurable({ harness: f.harness, context, models: f.models, assertCurrent() {} }), { reason: 'busy' });
    authorized = false; release();
    await assert.rejects(pending, /FIXTURE_REVOKED/);
    assert.equal(isDurableReloading(f.harness), false);
    assert.equal(f.models.models, facade);
    assert.equal(f.registry.snapshot(), snapshot);
    assert.ok(!(await f.models.catalogue()).some(model => model.id === 'revision-2'));
    assert.deepEqual((await f.root.agent(context)).model, f.reference);
    await reloadDurable({ harness: f.harness, context, models: f.models, assertCurrent() {} });
    assert.ok((await f.models.catalogue()).some(model => model.id === 'revision-2'));
  } finally { release?.(); await f.close(); }
});

test('missing exact saved selection and failed extension preparation retain the current registry and catalogue', async () => {
  const f = await fixture();
  try {
    const snapshot = f.registry.snapshot(), catalogue = await f.models.catalogue();
    f.next(true);
    await assert.rejects(reloadDurable({ harness: f.harness, context, models: f.models, assertCurrent() {} }));
    assert.deepEqual(await f.models.catalogue(), catalogue);
    f.next();
    await assert.rejects(reloadDurable({ harness: f.harness, context, models: f.models, assertCurrent() {},
      prepareExtensions: async () => { throw Error('FIXTURE_PREPARATION_FAILED'); },
    }), /FIXTURE_PREPARATION_FAILED/);
    assert.equal(f.registry.snapshot(), snapshot);
    assert.deepEqual(await f.models.catalogue(), catalogue);
    assert.deepEqual((await f.root.agent(context)).model, f.reference);
  } finally { await f.close(); }
});

test('native adapter reload re-evaluates nested mjs imports', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'durable-reload-imports-'));
  await writeFile(join(directory, 'nested.mjs'), 'export const revision = 1;');
  await writeFile(join(directory, 'adapter.mjs'), "import { revision } from './nested.mjs'; export default base => ({ ...base, revision });");
  const base = { snapshot() {}, subscribe() {} };
  assert.equal((await (await loadRegistryAdapters(['adapter.mjs'], directory))[0](base)).revision, 1);
  await writeFile(join(directory, 'nested.mjs'), 'export const revision = 2;');
  assert.equal((await (await loadRegistryAdapters(['adapter.mjs'], directory))[0](base)).revision, 2);
});

test('late-bound native base additions are staged, preserved across reload and protected from adapters', async () => {
  const registry = new ReloadableRegistry(createRegistry());
  const service = defineExtension({ name: 'late-native-service' });
  const candidate = await registry.prepare([], [service]);
  assert.equal(registry.snapshot().extension(service.name), undefined);
  await assert.rejects(registry.prepare([() => { throw Error('prepare-failed'); }], [service]), /prepare-failed/);
  assert.equal(registry.snapshot().extension(service.name), undefined);
  candidate.publish();
  assert.equal(registry.snapshot().extension(service.name), service);
  (await registry.prepare([])).publish();
  assert.equal(registry.snapshot().extension(service.name), service);
  await assert.rejects(registry.prepare([() => createRegistry()]), /NATIVE_BASE_EXTENSION_CHANGED/);
});
