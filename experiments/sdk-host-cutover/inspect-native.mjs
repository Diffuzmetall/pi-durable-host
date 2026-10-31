import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createNativeProfile } from 'dpi-backend/native-profile';
import { GrantPolicy } from 'dpi-backend/server';
import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context';
import { createSubscriptionProbeModels } from './probe-models.mjs';
import { savedModel } from './subscription-probe.mjs';

process.umask(0o077);
assert.equal(process.env.HOME, '/home/probe', 'ISOLATED_HOME_REQUIRED');
let networkAttempts = 0;
globalThis.fetch = async () => { networkAttempts++; throw Error('INSPECTION_NETWORK_DENIED'); };
const runtime = await createSubscriptionProbeModels({ authPath: '/credential/auth.json' });
await runtime.requireModel(savedModel);
assert.throws(() => runtime.models.streamSimple(runtime.models.getModel(savedModel.provider, savedModel.modelId), { messages: [] }), /INSPECTION_MUST_NOT_GENERATE/);
assert.throws(() => runtime.requireModel({ ...savedModel, modelId: 'unapproved' }), /EXACT_SAVED_MODEL_ONLY/);
const forbiddenOperations = ['stream', 'complete', 'completeSimple', 'streamDeferred', 'fetchDeferred', 'cancelDeferred', 'generateImages', 'classify'];
for (const method of forbiddenOperations) assert.throws(() => runtime.models[method](), /PROBE_ALLOWS_NATIVE_STREAM_SIMPLE_ONLY/);
const policy = new GrantPolicy([{ id: 'inspection', token: 'isolated-inspection-only', actor: 'inspection', source: 'terminal', authority: 'human', permissions: ['read', 'write', 'control', 'filesystem', 'human-accept'], binding: {} }]);
const profile = createNativeProfile({
  policy, owner: policy.authenticate('isolated-inspection-only'),
  models: { defaultModel: savedModel, catalogue: runtime.catalogue, create: async () => runtime },
  connectMcp: async () => ({ sources: [], close: async () => {} }),
  memory: () => ({
    resolveBinding: async () => ({ cfg: { disabled: true }, bankId: '' }),
    resolveClient: async () => { throw Error('PERSONAL_MEMORY_NOT_AUTHORIZED'); },
    lifecycleEffects: { env: {} },
  }),
  dcg: { binaryPath: '/unavailable-in-inspection/dcg', envSource: () => ({}) },
});
await mkdir('/output/composition', { mode: 0o700 });
const composition = await profile({ sessionId: 'composition-inspection-only', cwd: '/work', directory: '/output/composition', shellEnv: {}, offline: true, models: runtime,
  spawn: async () => { throw Error('INSPECTION_MUST_NOT_SPAWN'); } });
try {
  const snapshot = composition.registry.snapshot();
  const result = {
    status: 'NATIVE_COMPOSITION_AND_LOCAL_AUTH_CHECK_PASS', profileId: profile.id,
    reference: savedModel, modelMetadataAvailable: true, networkAttempts,
    nativeSessionOpened: false, realPilotOpened: false, modelGenerations: 0,
    forbiddenModelOperationsChecked: forbiddenOperations,
    memoryPolicy: 'registered for document compatibility; disabled; no personal bank resolved',
    dcgPolicy: 'registered fail-closed; evaluator execution not tested here',
    credentialPolicy: 'existing OAuth read-only, no refresh, no API-key/environment fallback',
    tools: snapshot.tools().map(({ tool }) => tool.name).sort(),
    extensions: snapshot.installed().map(extension => extension.name).sort(),
    inventory: composition.native.inventory,
    fullOperationalBootstrapReady: false, cutoverGo: false,
  };
  assert.equal(networkAttempts, 0);
  await writeFile(join('/output', 'native-inspection.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ status: result.status, tools: result.tools.length, networkAttempts, modelGenerations: 0, cutoverGo: false }));
} finally {
  await composition.shutdown(BACKGROUND_CONTEXT);
  await composition.cleanup(BACKGROUND_CONTEXT);
}
