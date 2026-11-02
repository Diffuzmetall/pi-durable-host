import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { request } from 'node:https';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { BACKGROUND_CONTEXT as ctx } from '@earendil-works/chord/context';
import { createModels } from '@earendil-works/pi-ai/models';
import { fauxProvider, fauxAssistantMessage } from '@earendil-works/pi-ai/providers/faux';
import { createRegistry, Harness } from '@earendil-works/pi-durable';
import { NodeExecutionEnv } from '@earendil-works/pi-durable/env/node';
import { openNodeSqliteStorage } from '@earendil-works/pi-durable/storage/sqlite/node';
import { attachGippity, createAudioLease } from './integration.mjs';

// Match native composition: registry publication owns the selected extension array.
function compositionFor(registry, env) {
  const extensions = [];
  registry.subscribe(() => extensions.splice(0, extensions.length, ...registry.snapshot().installed()));
  return { registry, extensions, env: () => env };
}

function http(port, host, path, body, origin = `https://${host}`) {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path, rejectUnauthorized: false,
      method: body === undefined ? 'GET' : 'POST',
      headers: { host, origin, 'content-type': 'application/json' } }, res => {
      let text = ''; res.on('data', chunk => text += chunk);
      res.on('end', () => resolve({ status: res.statusCode, text, headers: res.headers }));
    });
    req.on('error', reject);
    req.end(body === undefined ? undefined : JSON.stringify(body));
  });
}

test('audio lease rejects conflicts and aborted waiters cannot release its owner', async () => {
  const lease = createAudioLease();
  const signal = new AbortController().signal;
  const first = await lease.acquire({ owner: 'first', mode: 'dictation' }, signal);
  await assert.rejects(lease.acquire({ owner: 'second', mode: 'voice' }, signal), /already owned/);
  await assert.rejects(lease.acquire({ owner: 'aborted', mode: 'voice' }, AbortSignal.abort()));
  await assert.rejects(lease.acquire({ owner: 'second', mode: 'voice' }, signal), /already owned/);
  await first.release(); await first.release();
  const second = await lease.acquire({ owner: 'second', mode: 'voice' }, signal);
  await first.release();
  await assert.rejects(lease.acquire({ owner: 'third', mode: 'voice' }, signal), /already owned/);
  await second.release();
});

test('official SDK binds GipPity to one real Harness; browser send reaches faux; HTTPS confines Host and Origin; shutdown releases listener', { timeout: 30000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'gippity-integration-'));
  const keyFile = join(directory, 'key.pem'), certFile = join(directory, 'cert.pem');
  execFileSync('openssl', ['req', '-config', '/dev/null', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
    '-subj', '/CN=voice-fixture.ts.net', '-keyout', keyFile, '-out', certFile], { stdio: 'ignore' });
  const reserved = createServer().listen(0, '127.0.0.1'); await once(reserved, 'listening');
  const port = reserved.address().port;
  await new Promise(resolve => reserved.close(resolve));
  const host = `voice-fixture.ts.net:${port}`;
  const config = { sessionId: 'voice-fixture', conversationId: 1, bind: '127.0.0.1', port,
    origin: `https://${host}`, keyFile, certFile, audioHome: directory, statusFile: join(directory, 'status.json') };
  const models = createModels();
  const faux = fauxProvider(); faux.setResponses([fauxAssistantMessage('VOICE_BROWSER_ACK')]);
  models.setProvider(faux.provider);
  const env = new NodeExecutionEnv({ cwd: directory });
  const registry = createRegistry();
  const composition = compositionFor(registry, env);
  const untouched = { registry: createRegistry(), extensions: [] };
  assert.equal(await attachGippity(untouched, { sessionId: 'other' }, config), untouched);
  assert.equal(untouched.extensions.length, 0);
  await attachGippity(composition, { sessionId: config.sessionId, cwd: directory, directory, models: { models } }, config);
  assert.deepEqual(composition.extensions.map(x => x.name), ['howaboua.gippity-voice']);
  const storage = await openNodeSqliteStorage(join(directory, 'agent.sqlite'));
  const harness = await Harness.open(storage, { registry, models, env: () => env, settings: { extensions: composition.extensions } }, ctx);
  const root = await harness.root(ctx, { agent: { model: { provider: 'faux', modelId: 'faux-1' }, extensions: composition.extensions } });
  try {
    await composition.bind(harness, ctx, storage);
    const state = JSON.parse(await readFile(config.statusFile, 'utf8'));
    assert.equal(state.sdk, 'bound'); assert.equal(state.running, true);
    assert.equal(state.readiness.ready, false); // No OAuth, no provider network connection.
    const page = await http(port, host, '/');
    assert.equal(page.status, 200);
    assert.equal(page.headers['content-security-policy'], "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; worker-src 'self' blob:; media-src 'self' blob:; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'");
    const client = await http(port, host, '/_gippity/client.js');
    assert.equal(client.status, 200);
    assert.doesNotMatch(client.text, /URL.createObjectURL|revokeObjectURL/);
    for (const [name, processor] of [['audio', 'pi-lan-voice'], ['microphone', 'pi-lan-microphone-buffer']]) {
      const path = `/_gippity/worklets/${name}.js`;
      assert.ok(client.text.includes(path));
      const module = await http(port, host, path);
      assert.equal(module.status, 200);
      assert.match(module.headers['content-type'], /^text\/javascript/);
      assert.match(module.text, new RegExp(`registerProcessor\\(['"]${processor}['"]`));
      assert.equal((await http(port, 'attacker.example', path)).status, 403);
      assert.equal((await http(port, host, path, undefined, 'https://attacker.example')).status, 403);
    }
    assert.equal((await http(port, host, '/_gippity/worklets/unknown.js')).status, 404);
    assert.equal((await http(port, 'attacker.example', '/api/discovery')).status, 403);
    assert.equal((await http(port, host, '/api/send', { clientId: 'test', text: 'wrong', revision: 0 }, 'https://attacker.example')).status, 403);
    const result = await http(port, host, '/api/send', { clientId: 'test', text: 'VOICE_BROWSER_INPUT', revision: 0 });
    assert.equal(result.status, 200, result.text);
    let text = '';
    for (let i = 0; i < 100; i++) {
      text = JSON.stringify(await root.entries({}, 100, undefined, ctx));
      if (text.includes('VOICE_BROWSER_ACK')) break;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.match(text, /VOICE_BROWSER_INPUT/);
    assert.match(text, /VOICE_BROWSER_ACK/);
    assert.doesNotMatch((await http(port, host, '/api/settings')).text, /access_token|refresh_token|Bearer /);
    const savedSettings = await http(port, host, '/api/settings', {
      v3Voice: 'sol', v3AlternateVoice: 'sol',
      contextModel: { provider: 'faux', modelId: 'faux-1' },
    });
    assert.equal(savedSettings.status, 200, savedSettings.text);
    const persisted = JSON.parse(await readFile(join(directory, 'components/gippity-voice/settings.json'), 'utf8'));
    assert.equal(persisted.voice.v3Voice, 'sol');
    assert.deepEqual(persisted.voice.contextModel, { provider: 'faux', modelId: 'faux-1' });
  } finally {
    await composition.shutdown(ctx);
    await harness.close(ctx);
    await composition.cleanup(ctx);
    await storage.close();
    await env.cleanup(ctx);
  }
  assert.equal(JSON.parse(await readFile(config.statusFile, 'utf8')).sdk, 'closed');
  await assert.rejects(http(port, host, '/'));

  // Reconstruct the real component and Harness, not just its in-memory controller.
  const nextEnv = new NodeExecutionEnv({ cwd: directory });
  const nextRegistry = createRegistry();
  const next = compositionFor(nextRegistry, nextEnv);
  await attachGippity(next, { sessionId: config.sessionId, cwd: directory, directory, models: { models } }, config);
  const nextStorage = await openNodeSqliteStorage(join(directory, 'agent.sqlite'));
  const nextHarness = await Harness.open(nextStorage, { registry: nextRegistry, models, env: () => nextEnv,
    settings: { extensions: next.extensions } }, ctx);
  try {
    await next.bind(nextHarness, ctx, nextStorage);
    const response = await http(port, host, '/api/settings');
    assert.equal(response.status, 200);
    const restored = JSON.parse(response.text).config;
    assert.equal(restored.v3Voice, 'sol');
    assert.equal(restored.v3AlternateVoice, 'sol');
    assert.deepEqual(restored.contextModel, { provider: 'faux', modelId: 'faux-1' });
  } finally {
    await next.shutdown(ctx);
    await nextHarness.close(ctx);
    await next.cleanup(ctx);
    await nextStorage.close();
    await nextEnv.cleanup(ctx);
  }
});
