import assert from 'node:assert/strict';
import { createNativeModels } from 'dpi-backend/native-profile';
import { openaiCodexProvider } from '@earendil-works/pi-ai/providers/openai-codex';
import { savedModel, subscriptionCredentials, subscriptionProbeFetch } from './subscription-probe.mjs';

/** Text-only acceptance capability. Not the operational bootstrap or OAuth refresh owner. */
export async function createSubscriptionProbeModels({ authPath, ledgerDirectory, stage }) {
  const capability = await createNativeModels({
    credentials: subscriptionCredentials(authPath),
    providers: [openaiCodexProvider()],
    authContext: { env: async () => undefined, fileExists: async () => false },
  });
  const requireModel = capability.requireModel;
  capability.requireModel = (reference, options) => {
    assert.deepEqual(reference, savedModel, 'EXACT_SAVED_MODEL_ONLY');
    return requireModel(reference, options);
  };
  const stream = capability.models.streamSimple.bind(capability.models);
  for (const method of ['stream', 'complete', 'completeSimple', 'streamDeferred', 'fetchDeferred', 'cancelDeferred', 'generateImages', 'classify']) {
    capability.models[method] = () => { throw Error('PROBE_ALLOWS_NATIVE_STREAM_SIMPLE_ONLY'); };
  }
  const fetch = stage === undefined ? undefined : subscriptionProbeFetch(ledgerDirectory, stage);
  capability.models.streamSimple = (model, context, options) => {
    assert.equal(model.provider, savedModel.provider, 'EXACT_SAVED_PROVIDER_ONLY');
    assert.equal(model.id, savedModel.modelId, 'EXACT_SAVED_MODEL_ONLY');
    assert(fetch, 'INSPECTION_MUST_NOT_GENERATE');
    return stream(model, context, { ...options, transport: 'sse', maxRetries: 0, toolChoice: 'none', fetch });
  };
  return capability;
}
