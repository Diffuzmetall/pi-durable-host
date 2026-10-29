import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { InMemoryCredentialStore } from '@earendil-works/pi-ai';
import { fauxProvider, fauxAssistantMessage } from '@earendil-works/pi-ai/providers/faux';
import { Store } from '../src/store.ts';
import { minimalProfile } from '../src/runtime-profile.ts';
import { createHttpServer } from '../src/http-server.ts';

const key = 'SYNTHETIC_PROVIDER_ONLY_CREDENTIAL_SENTINEL_8F26';
const ownerToken = 'dpi_fixture_owner_token_abcdefghijklmnopqrstuvwxyz0123456789';

if (process.argv.includes('--provider-secret-fixture')) {
  const directory = process.argv.at(-1);
  const work = join(directory, 'work'); await mkdir(work, { recursive: true });
  const credentials = new InMemoryCredentialStore();
  await credentials.modify('faux', async () => ({ type: 'api_key', key }));
  const native = fauxProvider({ provider: 'faux', models: [{ id: 'echo' }], tokensPerSecond: 100000 });
  const reply = async (_context, options, state) => {
    process.send?.({ type: 'model-auth', correct: options.apiKey === key });
    return state.callCount === 1
      ? fauxAssistantMessage('SAFE_PROVIDER_RESPONSE')
      : fauxAssistantMessage('', { stopReason: 'error', errorMessage: `Remote API rejected credential ${options.apiKey}` });
  };
  native.setResponses([reply, reply]);
  const store = await Store.open({ dataDir: join(directory, 'data'), startDirs: [work], name: 'provider-secret-fixture', provider: 'faux', profile: minimalProfile });
  // The existing public native container stays authoritative. Only this disposable test provider changes.
  store.models.setProvider({ ...native.provider, auth: { apiKey: {
    name: 'explicit synthetic credential',
    resolve: async () => ({ auth: { apiKey: (await credentials.read('faux')).key } }),
  } } });
  const server = createHttpServer(store, ownerToken).listen(0, '127.0.0.1');
  await once(server, 'listening');
  process.send?.({ type: 'ready', base: `http://127.0.0.1:${server.address().port}`, work });
  process.on('SIGTERM', async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await store.close(); process.exit(0); });
} else {
  test('ISC2 provider credential does not cross public HTTP/SSE/error/diagnostic boundaries', { timeout: 20000 }, async () => {
    const directory = await mkdtemp(join(tmpdir(), 'dpi-provider-secret-'));
    const messages = []; const output = { stdout: '', stderr: '', sse: '', reconnectSnapshot: '' }; const responses = [];
    const controller = new AbortController();
    const reconnect = new AbortController();
    const child = spawn(process.execPath, ['--import', 'tsx', fileURLToPath(import.meta.url), '--provider-secret-fixture', directory], {
      cwd: fileURLToPath(new URL('..', import.meta.url)), env: { PATH: process.env.PATH, HOME: directory, TMPDIR: tmpdir() },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });
    child.stdout.on('data', data => { output.stdout += data; });
    child.stderr.on('data', data => { output.stderr += data; });
    child.on('message', message => { messages.push(message); });
    let stream;
    try {
      const ready = await new Promise((resolve, reject) => {
        child.on('message', message => { if (message.type === 'ready') resolve(message); });
        child.on('exit', code => reject(new Error(`Fixture exited before ready: ${code}`)));
        child.on('error', reject);
      });
      const http = async (path, body) => {
        const response = await fetch(`${ready.base}/v1${path}`, { method: body ? 'POST' : 'GET', headers: { authorization: `Bearer ${ownerToken}`, 'content-type': 'application/json', 'idempotency-key': `provider-secret-${responses.length}` }, ...(body ? { body: JSON.stringify(body) } : {}) });
        const text = await response.text(); responses.push({ path, status: response.status, text });
        return JSON.parse(text);
      };
      const session = await http('/sessions', { name: 'credential boundary', cwd: ready.work, model: { provider: 'faux', modelId: 'echo' } });
      assert.ok(session.id, `session creation failed: ${JSON.stringify(session)}`);
      const prefix = `/sessions/${session.id}/agents/main`;
      const events = await fetch(`${ready.base}/v1${prefix}/events`, { headers: { authorization: `Bearer ${ownerToken}` }, signal: controller.signal });
      assert.equal(events.status, 200);
      const reader = events.body.getReader();
      stream = (async () => { try { for (;;) { const next = await reader.read(); if (next.done) break; output.sse += new TextDecoder().decode(next.value); } } catch (error) { if (!controller.signal.aborted) throw error; } })();
      const success = await http(`${prefix}/messages`, { content: 'ordinary success', whenBusy: 'followUp', requestId: 'provider-safe', waitMs: 5000 });
      assert.equal(success.status, 'done'); assert.equal(success.answer.text, 'SAFE_PROVIDER_RESPONSE');
      await http(`${prefix}/messages`, { content: 'provider failure', whenBusy: 'followUp', requestId: 'provider-error', waitMs: 5000 });
      await http(`${prefix}/entries?scope=all`);
      await http(`${prefix}/entries?scope=active`);
      await http(`${prefix}/transcript?format=json`);
      await http(`${prefix}/transcript?format=markdown`);
      await http(`/sessions/${session.id}/inspect`);
      controller.abort(); await stream;
      const reopened = await fetch(`${ready.base}/v1${prefix}/events`, { headers: { authorization: `Bearer ${ownerToken}` }, signal: AbortSignal.any([reconnect.signal, AbortSignal.timeout(5000)]) });
      const reopenedReader = reopened.body.getReader();
      for (;;) {
        const next = await reopenedReader.read(); if (next.done) break;
        output.reconnectSnapshot += new TextDecoder().decode(next.value);
        if (output.reconnectSnapshot.includes('event: snapshot') && output.reconnectSnapshot.endsWith('\n\n')) break;
      }
      assert.match(output.reconnectSnapshot, /event: snapshot/); reconnect.abort();
      assert.equal(messages.filter(message => message.type === 'model-auth' && message.correct).length, 2, 'both actual native requests use server-owned auth, absent from inputs');
      assert.match(output.sse, /SAFE_PROVIDER_RESPONSE/);
      const leaked = responses.filter(response => response.text.includes(key)).map(response => `HTTP ${response.path}`);
      for (const [name, text] of Object.entries(output)) if (text.includes(key)) leaked.push(name);
      assert.deepEqual(leaked, [], `Provider credential crossed public surfaces: ${leaked.join(', ')}`);
    } finally {
      controller.abort(); reconnect.abort(); if (stream) await stream;
      if (child.exitCode === null) { const exit = once(child, 'exit'); child.kill('SIGTERM'); await exit; }
      await rm(directory, { recursive: true, force: true });
    }
  });
}
