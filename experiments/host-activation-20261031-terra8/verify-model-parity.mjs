#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createNativeModels } from './host/node_modules/dpi-backend/dist/dpi-backend/src/native-profile/profile.js';
import { InMemoryModelsStore } from './host/node_modules/@earendil-works/pi-ai/dist/index.js';
import { AuthStorage } from './host/compiled/bindings.mjs';
import { operationalModelOptions } from './host/operational-models.mjs';
import { ModelRuntime } from '/home/ubuntu/.nvm/versions/node/v24.19.0/lib/node_modules/@earendil-works/pi-coding-agent/dist/core/model-runtime.js';

const agentDir = '/home/ubuntu/.pi/agent';
const paths = ['models-store.json', 'auth.json', 'antigravity-accounts.json'].map(name => join(agentDir, name));
const before = await Promise.all(paths.map(path => readFile(path)));
let networkCalls = 0;
globalThis.fetch = async () => { networkCalls++; throw Error('NETWORK_DISABLED_FOR_MODEL_PARITY'); };
const credentials = AuthStorage.create(join(agentDir, 'auth.json'));
const native = await createNativeModels(() => operationalModelOptions({ agentDir, credentials }));
const modelsStore = new InMemoryModelsStore();
let savedCatalogue;
try { savedCatalogue = JSON.parse(before[0]); }
catch { throw Error('MODEL_CATALOGUE_INVALID'); }
for (const [id, entry] of Object.entries(savedCatalogue)) await modelsStore.write(id, entry);
const classic = await ModelRuntime.create({ credentials, modelsPath: null, modelsStore, allowModelNetwork: false });
const ids = models => models.getModels('openai-codex').map(model => model.id).sort();
assert.deepEqual(ids(native.models), ids(classic.models), 'Host Codex catalogue must match Pi upstream cache restoration');
const catalogue = await native.catalogue();
const terra = catalogue.find(model => model.provider === 'openai-codex' && model.id === 'gpt-6.1-terra');
const gemini = catalogue.find(model => model.provider === 'antigravity' && model.id === 'gemini-3.8-flash');
assert.equal(terra?.available, true);
assert.ok(terra.supportedThinkingLevels.includes('medium'));
assert.equal(gemini?.available, true);
assert.equal(networkCalls, 0);
for (let i = 0; i < paths.length; i++) assert.deepEqual(await readFile(paths[i]), before[i], 'Shared account/catalogue files must remain unchanged');
console.log(JSON.stringify({ status: 'MODEL_PARITY_PASS', codexModels: ids(native.models),
  selected: [terra, gemini].map(model => ({ provider: model.provider, id: model.id, available: model.available, supportedThinkingLevels: model.supportedThinkingLevels })),
  networkCalls, sharedFilesUnchanged: true }));
