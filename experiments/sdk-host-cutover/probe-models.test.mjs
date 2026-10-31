import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { zstdDecompressSync } from 'node:zlib';
import { createSubscriptionProbeModels } from './probe-models.mjs';
import { savedModel } from './subscription-probe.mjs';

test('installed provider honors forced SSE, no tools, no retries and durable admission', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'installed-codex-probe-'));
  const authPath = join(directory, 'synthetic-auth.json');
  const payload = Buffer.from(JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: 'synthetic-account' } })).toString('base64url');
  await writeFile(authPath, JSON.stringify({ 'openai-codex': {
    type: 'oauth', access: `eyJhbGciOiJub25lIn0.${payload}.synthetic`, refresh: 'synthetic-refresh', expires: Date.now() + 600_000,
  } }), { mode: 0o600 });
  let calls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls++;
    assert.equal(url, 'https://chatgpt.com/backend-api/codex/responses');
    const serialized = new Headers(init.headers).get('content-encoding') === 'zstd'
      ? zstdDecompressSync(init.body).toString('utf8') : init.body;
    const body = JSON.parse(serialized);
    assert.equal(body.model, savedModel.modelId);
    assert.equal(body.tool_choice, 'none');
    assert.equal(init.redirect, 'error');
    return new Response('synthetic unavailable', { status: 503 });
  };
  try {
    const capability = await createSubscriptionProbeModels({ authPath, ledgerDirectory: directory, stage: 'terminal' });
    const model = await capability.requireModel(savedModel);
    const context = { messages: [{ role: 'user', content: 'Synthetic bounded transport check.', timestamp: Date.now() }] };
    const options = { transport: 'websocket', maxRetries: 10, toolChoice: 'required' };
    const first = await capability.models.streamSimple(model, context, options).result();
    assert.equal(first.stopReason, 'error');
    assert.equal(calls, 1, `Expected exactly one synthetic dispatch; provider result: ${first.errorMessage}`);
    const second = await capability.models.streamSimple(model, context, options).result();
    assert.equal(second.stopReason, 'error');
    assert.equal(calls, 1, 'An uncertain dispatch must not be resent');
    assert.deepEqual((await readdir(directory)).sort(), ['synthetic-auth.json', 'terminal.json']);
    for (const method of ['stream', 'complete', 'completeSimple', 'streamDeferred', 'fetchDeferred', 'cancelDeferred', 'generateImages', 'classify']) {
      assert.throws(() => capability.models[method](), /PROBE_ALLOWS_NATIVE_STREAM_SIMPLE_ONLY/);
    }
  } finally { globalThis.fetch = originalFetch; }
});
