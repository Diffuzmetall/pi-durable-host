import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, stat, symlink, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { crc32, deflateSync } from 'node:zlib';
import { Check } from 'typebox/value';
import { BACKGROUND_CONTEXT as context } from '@earendil-works/chord/context';
import { fauxProvider, fauxAssistantMessage, fauxToolCall } from '@earendil-works/pi-ai';
import { createModels } from '@earendil-works/pi-ai/models';
import { createRegistry, Harness } from '@earendil-works/pi-durable';
import { openNodeSqliteStorage } from '@earendil-works/pi-durable/storage/sqlite/node';
import { NodeExecutionEnv } from '@earendil-works/pi-durable/env/node';
import createCodex, { makeRuntime } from '../src/native-profile/tools/codex/index.js';
import { decodePng, normalizeCodexImageSize, savePng } from '../src/native-profile/tools/codex/image.js';
import { SearchSession } from '../src/native-profile/tools/codex/search.js';

function pngFixture() {
  const chunk = (name, bytes) => {
    const kind = Buffer.from(name); const size = Buffer.alloc(4); size.writeUInt32BE(bytes.length);
    const sum = Buffer.alloc(4); sum.writeUInt32BE(crc32(Buffer.concat([kind, bytes])));
    return Buffer.concat([size, kind, bytes, sum]);
  };
  const header = Buffer.alloc(13); header.writeUInt32BE(1); header.writeUInt32BE(1, 4); header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header), chunk('IDAT', deflateSync(Buffer.from([0, 255, 0, 0, 255]))), chunk('IEND', Buffer.alloc(0))]);
}
const png = pngFixture();
const token = label => `synthetic.${Buffer.from(JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: `fake-account-${label}` } })).toString('base64url')}.fake`;

async function recorder(t) {
  const trace = []; let afterImage; let hold = false;
  const server = createServer(async (req, res) => {
    let raw = ''; for await (const bytes of req) raw += bytes;
    const body = raw ? JSON.parse(raw) : undefined;
    const key = (req.headers.authorization ?? '').replace(/^Bearer /, '');
    trace.push({ path: req.url, method: req.method, key, account: req.headers['chatgpt-account-id'], body });
    if (hold) return;
    const value = req.url.includes('/usage') ? { account_id: 'PRIVATE-ACCOUNT-NOT-OUTPUT', email: 'private@example.invalid', rate_limit: { primary_window: { used_percent: 12, reset_after_seconds: 30 } } }
      : req.url.includes('/images/') ? { data: [{ b64_json: png.toString('base64') }] }
      : { output: { [`source-${key}`]: `Fixture search result ${key}` }, results: [{ ref_id: 'turn0search0', title: 'Fixture source', url: 'https://example.invalid/source' }] };
    if (req.url.includes('/images/')) afterImage?.();
    const json = JSON.stringify(value);
    const escaped = key ? key.split('').map(char => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`).join('') : '';
    res.setHeader('content-type', 'application/json'); res.end(key ? json.split(key).join(escaped) : json);
  }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  return { trace, onImage(callback) { afterImage = callback; }, hold() { hold = true; },
    fetch: async (input, init) => {
      const url = new URL(String(input)); assert.equal(url.origin, 'https://chatgpt.com'); assert.equal(init.redirect, 'error');
      return fetch(base + url.pathname, init);
    },
  };
}

async function fixture(t, service, label) {
  const cwd = await mkdtemp(join(tmpdir(), `native-codex-${label}-`)); await mkdir(join(cwd, 'home'));
  const codexInputs = [];
  const key = token(label); const rootProvider = fauxProvider({ tokensPerSecond: 100000 });
  // All providers and OAuth callbacks here are synthetic, memory-only and never contact Codex.
  const codex = fauxProvider({ provider: 'openai-codex', api: 'openai-codex-responses', tokensPerSecond: 100000,
    models: [{ id: `fixture-codex-${label}`, reasoning: true, input: ['text', 'image'] }, { id: `fixture-text-${label}`, reasoning: false, input: ['text'] }] });
  const credential = { type: 'oauth', access: key, refresh: 'fake-refresh-never-used', expires: Date.now() + 3600000 };
  const models = createModels(); models.setProvider(rootProvider.provider);
  models.setProvider({ ...codex.provider, auth: { oauth: { name: 'Synthetic test capability', login: async () => credential,
    refresh: async () => { throw Error('Unexpected synthetic refresh'); }, toAuth: async value => ({ apiKey: value.access }) } } });
  await models.login('openai-codex', 'oauth', {});
  let allowed = true, closed = false, root;
  const hostCapability = { authorize: request => allowed && !closed && request.conversationId === root?.id,
    runtimeOptions: { fetch: service.fetch, deadlineMs: 5000 } };
  const registry = createRegistry(); registry.install(createCodex(hostCapability));
  const h = await Harness.open(await openNodeSqliteStorage(join(cwd, 'session.sqlite')), {
    registry, models, env: async () => new NodeExecutionEnv({ cwd, shellEnv: { HOME: join(cwd, 'home') } }), settings: { compaction: { enabled: false } },
  }, context);
  const model = rootProvider.getModel(); root = await h.root(context, { agent: { cwd, model: { provider: model.provider, modelId: model.id } } });
  const close = async () => { if (!closed) { closed = true; await h.close(context); } };
  t.after(async () => { await close(); await rm(cwd, { recursive: true, force: true }); });
  return { cwd, key, codex, codexInputs, root, h, models, hostCapability, close, revoke() { allowed = false; }, allow() { allowed = true; },
    async run(name, args) {
      const tool = fauxToolCall(name, args);
      rootProvider.setResponses([fauxAssistantMessage(tool, { stopReason: 'toolUse' }), fauxAssistantMessage('Observed local fixture.')]);
      if (name === 'codex_ask') codex.setResponses([input => { codexInputs.push(input); return fauxAssistantMessage(`Synthetic answer ${key}`); }]);
      await (await root.submit({ type: 'input', content: `Run ${name}` }, context)).wait(context); await root.waitForIdle(context);
      const entries = (await root.entries({}, 150, undefined, context)).items;
      assert.ok(!JSON.stringify(entries).includes(key), 'provider credential never persists in transcript');
      const result = entries.find(entry => entry.kind === 'pi.tool-result' && entry.model?.some(message => message.role === 'toolResult' && message.toolCallId === tool.id));
      assert.ok(result, 'canonical native tool call has one matching result'); return result;
    },
  };
}

const shown = result => JSON.stringify(result);
test('exact native schemas and absent/denied Host reject before model/auth/path access', async () => {
  const extension = createCodex(undefined);
  assert.deepEqual(extension.tools.map(tool => tool.name), ['codex_ask', 'codex_search', 'codex_image', 'codex_usage']);
  assert.ok(extension.tools.every(tool => tool.replay === 'unsafe'));
  assert.equal(Check(extension.tools[0].parameters, { prompt: 'fixture', apiKey: 'caller-token' }), false);
  assert.equal(Check(extension.tools[3].parameters, { token: 'caller-token' }), false);
  const api = { conversationId: 999, agent() { throw Error('must not read agent'); }, models: {} };
  await assert.rejects(extension.tools[0].execute({ prompt: 'fixture' }, api, context), /trusted host authorization/);
  await assert.rejects(makeRuntime(api, context, { authorize: () => false }), /trusted host authorization/);
  await assert.rejects(extension.tools[0].execute({ prompt: 'fixture', max_output_tokens: 1 }, api, context), /unsupported/);
});

test('actual native Codex four tools use fake Models+loopback only, preserve model/ref IDs and quota masking', { timeout: 15000 }, async t => {
  const service = await recorder(t); const a = await fixture(t, service, 'A'); const b = await fixture(t, service, 'B');
  const ask = await a.run('codex_ask', { prompt: 'Synthetic standalone request', model: 'fixture-codex-A', reasoning: 'off' });
  assert.match(shown(ask), /Synthetic answer/); assert.match(shown(ask), /REDACTED/); assert.equal(a.codex.state.callCount, 1);
  assert.match(shown(await a.run('codex_search', { search_query: [{ q: 'local fixture' }] })), /Fixture source/);
  const searchId = (await a.h.snapshot(SearchSession, a.root.id, context)).id;
  assert.ok(searchId); assert.equal(service.trace.at(-1).body.id, searchId); assert.equal(service.trace.at(-1).body.model, 'fixture-codex-A');
  const quota = await b.run('codex_usage', {});
  assert.match(shown(quota), /12% used/); assert.ok(!shown(quota).includes('PRIVATE-ACCOUNT-NOT-OUTPUT')); assert.ok(!shown(quota).includes('private@example.invalid'));
  assert.equal((await b.h.snapshot(SearchSession, b.root.id, context))?.id, undefined);
  const beforeCallerToken = service.trace.length;
  const rejectedToken = await b.run('codex_usage', { token: 'caller-controlled-not-auth' });
  assert.equal(rejectedToken.model[0].isError, true); assert.equal(service.trace.length, beforeCallerToken, 'caller auth field is rejected before effect');
  const image = await a.run('codex_image', { prompt: 'Synthetic pixel', output_path: 'output/pixel.png', image_model: 'gpt-image-2.5-flare' });
  assert.match(shown(image), /Generated/); assert.equal(service.trace.at(-1).body.model, 'gpt-image-2.5-flare');
  assert.deepEqual(await readFile(join(a.cwd, 'output/pixel.png')), png); assert.equal((await stat(join(a.cwd, 'output/pixel.png'))).mode & 0o777, 0o600);
  assert.match(shown(await a.run('codex_ask', { prompt: 'Only this explicit prompt', num_last_images_to_include: 1 })), /Synthetic answer/);
  const standalone = JSON.stringify(a.codexInputs.at(-1));
  assert.ok(standalone.includes(png.toString('base64'))); assert.ok(standalone.includes('Only this explicit prompt')); assert.ok(!standalone.includes('Run codex_ask'));
  assert.ok(service.trace.some(value => value.key === a.key && value.account === 'fake-account-A'));
  assert.ok(service.trace.some(value => value.key === b.key && value.account === 'fake-account-B'));
  const before = service.trace.length; const inferred = a.codex.state.callCount;
  assert.match(shown(await a.run('codex_ask', { prompt: 'no fallback', model: 'unavailable-model' })), /not in the native catalog/);
  assert.equal(a.codex.state.callCount, inferred); assert.equal(service.trace.length, before);
  assert.match(shown(await a.run('codex_image', { prompt: 'no overwrite', output_path: 'output/pixel.png' })), /overwrite/);
  assert.match(shown(await a.run('codex_image', { prompt: 'no escape', output_path: '../escape.png' })), /inside the workspace/);
  assert.equal(service.trace.length, before);
  assert.match(shown(await b.run('codex_ask', { prompt: 'no foreign file', image_paths: [join(a.cwd, 'output/pixel.png')] })), /inside cwd/);
  assert.equal(b.codex.state.callCount, 0);
  a.revoke(); assert.match(shown(await a.run('codex_usage', {})), /trusted host authorization/); assert.equal(service.trace.length, before);
  await a.close(); assert.match(shown(await b.run('codex_usage', {})), /quota/);
  const reopenedRegistry = createRegistry(); reopenedRegistry.install(createCodex({ authorize: () => false }));
  const reopened = await Harness.open(await openNodeSqliteStorage(join(a.cwd, 'session.sqlite')), {
    registry: reopenedRegistry, models: a.models, env: async () => new NodeExecutionEnv({ cwd: a.cwd }),
  }, context);
  try { assert.equal((await reopened.snapshot(SearchSession, a.root.id, context)).id, searchId, 'canonical search backend ID survives actual owner reopen'); }
  finally { await reopened.close(context); }
});

test('current Host authority is rechecked after image generation before local write', { timeout: 10000 }, async t => {
  const service = await recorder(t); const f = await fixture(t, service, 'revoked');
  service.onImage(() => f.revoke());
  const result = await f.run('codex_image', { prompt: 'remote already finished', output_path: 'must-not-save.png' });
  assert.match(shown(result), /trusted host authorization/);
  assert.equal(service.trace.filter(value => value.path.includes('/images/')).length, 1, 'no retry of an ambiguous remote effect');
  await assert.rejects(stat(join(f.cwd, 'must-not-save.png')), /ENOENT/);
});

test('original fixed-route/no-retry transport guards and deadline run on recording fetch', { timeout: 10000 }, async t => {
  const service = await recorder(t); const key = token('transport'); let allowed = true;
  const api = { conversationId: 1, agent: async () => ({ cwd: tmpdir() }), models: {
    checkAuth: async () => ({ type: 'oauth' }), getAuth: async () => ({ auth: { apiKey: key } }), getAvailable: async () => [],
  } };
  const host = { authorize: () => allowed, runtimeOptions: { fetch: service.fetch, deadlineMs: 500 } };
  const runtime = await makeRuntime(api, context, host);
  try {
    await assert.rejects(runtime.request('credit-redemption', {}), /not allowed/);
    await assert.rejects(runtime.request('../wham/usage', {}), /not allowed/);
    await assert.rejects(runtime.fetch('https://example.invalid/responses', { method: 'POST' }), /not allowed/);
    await runtime.fetch('https://chatgpt.com/backend-api/codex/responses', { method: 'POST', body: '{}' });
    const count = service.trace.length;
    await assert.rejects(runtime.fetch('https://chatgpt.com/backend-api/codex/responses', { method: 'POST' }), /retry is not allowed/);
    allowed = false; await assert.rejects(runtime.request('../wham/usage'), /trusted host authorization/); assert.equal(service.trace.length, count);
  } finally { runtime.close(); }
  allowed = true; service.hold();
  const expired = await makeRuntime(api, context, { ...host, runtimeOptions: { fetch: service.fetch, deadlineMs: 30 } });
  try { await assert.rejects(expired.request('../wham/usage'), /cancelled or timed out/); } finally { expired.close(); }
});

test('unchanged PNG decoder/preflight/saver reject corrupt bytes, symlinks and overwrites', async t => {
  const cwd = await mkdtemp(join(tmpdir(), 'codex-image-')); const outside = await mkdtemp(join(tmpdir(), 'codex-outside-'));
  t.after(async () => { await rm(cwd, { recursive: true, force: true }); await rm(outside, { recursive: true, force: true }); });
  assert.deepEqual(await decodePng(png.toString('base64')), png);
  const damaged = Buffer.from(png); damaged[40] ^= 1; await assert.rejects(decodePng(damaged.toString('base64')), /checksum/);
  assert.throws(() => normalizeCodexImageSize('11x12'), /edges/);
  assert.equal(normalizeCodexImageSize('1024x1024'), '1024x1024');
  await symlink(outside, join(cwd, 'escape'));
  await assert.rejects(savePng(cwd, 'escape/forbidden.png', png, new AbortController().signal), /save failed/);
  const file = await savePng(cwd, 'new.png', png, new AbortController().signal);
  await assert.rejects(savePng(cwd, 'new.png', png, new AbortController().signal), /save failed/);
  assert.deepEqual(await readFile(file), png);
});
