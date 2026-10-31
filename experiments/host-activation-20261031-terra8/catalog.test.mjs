import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createNativeModels } from './host/node_modules/dpi-backend/dist/dpi-backend/src/native-profile/profile.js';
import { getBuiltinModel, getBuiltinModelDataGeneratedAt } from './host/node_modules/@earendil-works/pi-ai/dist/providers/all.js';
import { operationalModelOptions } from './host/operational-models.mjs';

const baseline = getBuiltinModel('openai-codex', 'gpt-6.1-sol');
const terra = { ...baseline, id: 'gpt-6.1-terra', name: 'GPT-6.1 Terra', contextWindow: 1_234_567 };
const credentials = {
  read: async id => id === 'openai-codex' ? { type: 'oauth', access: 'synthetic-access', refresh: 'synthetic-refresh', expires: Date.now() + 600_000 } : undefined,
  list: async () => [],
  modify: async () => { throw Error('CREDENTIAL_WRITES_FORBIDDEN'); },
  delete: async () => { throw Error('CREDENTIAL_WRITES_FORBIDDEN'); },
};

for (const newer of [true, false]) test(`native catalogue ${newer ? 'restores newer' : 'ignores older'} upstream cache without network or source writes`, async () => {
  const agentDir = await mkdtemp(join(tmpdir(), 'host-catalog-fixture-'));
  const path = join(agentDir, 'models-store.json');
  const bytes = JSON.stringify({ 'openai-codex': {
    models: [terra, { ...terra, id: 'other-provider-model', provider: 'not-openai-codex' }],
    lastModified: getBuiltinModelDataGeneratedAt() + (newer ? 1000 : -1000), checkedAt: Date.now(),
  } });
  await writeFile(path, bytes, { mode: 0o600 });
  const originalFetch = globalThis.fetch;
  let networkCalls = 0;
  globalThis.fetch = async () => { networkCalls++; throw Error('NETWORK_FORBIDDEN'); };
  try {
    const capability = await createNativeModels(() => operationalModelOptions({ agentDir, credentials }));
    const catalogue = await capability.catalogue();
    const selected = catalogue.find(model => model.provider === 'openai-codex' && model.id === terra.id);
    assert.equal(Boolean(selected), newer);
    assert.ok(catalogue.some(model => model.provider === 'openai-codex' && model.id === baseline.id), 'existing model must remain');
    assert.ok(!catalogue.some(model => model.id === 'other-provider-model'), 'provider ownership must remain exact');
    if (newer) {
      assert.equal(selected.available, true);
      assert.equal(selected.contextWindow, terra.contextWindow);
      assert.ok(selected.supportedThinkingLevels.includes('medium'));
      assert.equal((await capability.requireModel({ provider: 'openai-codex', modelId: terra.id })).id, terra.id);
    }
    assert.equal(networkCalls, 0);
    assert.equal(await readFile(path, 'utf8'), bytes);
  } finally { globalThis.fetch = originalFetch; }
});

test('absent cache preserves builtins without inventing Terra 6.1', async () => {
  const agentDir = await mkdtemp(join(tmpdir(), 'host-catalog-no-cache-'));
  const capability = await createNativeModels(() => operationalModelOptions({ agentDir, credentials }));
  assert.ok(capability.models.getModel('openai-codex', baseline.id));
  assert.equal(capability.models.getModel('openai-codex', terra.id), undefined);
});

test('runtime reload re-reads the catalogue without changing saved model identifiers', async () => {
  const agentDir = await mkdtemp(join(tmpdir(), 'host-catalog-reload-'));
  const capability = await createNativeModels(() => operationalModelOptions({ agentDir, credentials }));
  const facade = capability.models;
  await writeFile(join(agentDir, 'models-store.json'), JSON.stringify({ 'openai-codex': {
    models: [terra], lastModified: getBuiltinModelDataGeneratedAt() + 1000,
  } }), { mode: 0o600 });
  const candidate = await capability.prepareReload();
  assert.equal(facade.getModel('openai-codex', terra.id), undefined, 'candidate is not publication');
  candidate.publish();
  assert.equal(capability.models, facade);
  assert.equal(facade.getModel('openai-codex', terra.id).id, terra.id);
  assert.ok(facade.getModel('openai-codex', baseline.id));
});
