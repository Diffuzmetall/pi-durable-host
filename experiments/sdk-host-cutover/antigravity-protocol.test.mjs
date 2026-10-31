import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryCredentialStore } from '@earendil-works/pi-ai';
import { createNativeModels } from 'dpi-backend/native-profile';
import { createAntigravityProvider } from './provider.mjs';
import { streamAntigravity, getCurrentAntigravityModels } from './compiled/antigravity.mjs';

test('frozen upstream transport builds native tool/system request and decodes SSE without external calls', async t => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  const requests = [];
  globalThis.fetch = async (url, options) => {
    if (options.method === 'HEAD') return new Response(null, { status: 200 });
    requests.push({ url, options });
    assert.match(url, /v1internal:streamGenerateContent/);
    const body = JSON.parse(options.body);
    assert(JSON.stringify(body).includes('fixture-system'));
    assert(JSON.stringify(body).includes('fixture_tool'));
    assert.equal(body.project, 'fixture-project');
    return new Response('data: ' + JSON.stringify({ response: { candidates: [{ content: { role: 'model', parts: [{ text: 'upstream-fixture-ok' }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 8, candidatesTokenCount: 4, totalTokenCount: 12 } } }) + '\n\n', { headers: { 'content-type': 'text/event-stream' } });
  };
  const provider = createAntigravityProvider({ models: getCurrentAntigravityModels(), stream: streamAntigravity,
    access: { available: async () => true, resolveApiKey: async () => JSON.stringify({ token: 'synthetic-token', projectId: 'fixture-project' }) } });
  const runtime = await createNativeModels({ credentials: new InMemoryCredentialStore(), providers: [provider] });
  const model = await runtime.requireModel({ provider: 'antigravity', modelId: 'claude-opus-4-6' });
  const stream = runtime.models.streamSimple(model, { systemPrompt: 'fixture-system', messages: [{ role: 'user', content: 'fixture-input', timestamp: Date.now() }],
    tools: [{ name: 'fixture_tool', description: 'fixture', parameters: { type: 'object', properties: {} } }] }, { reasoning: 'high' });
  const events = []; for await (const event of stream) events.push(event.type);
  const result = await stream.result();
  assert.equal(result.stopReason, 'stop', result.errorMessage);
  assert(result.content.some(x => x.type === 'text' && x.text === 'upstream-fixture-ok'));
  assert(events.includes('done')); assert.equal(requests.length, 1);
});
