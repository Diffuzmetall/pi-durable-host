import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, stat, symlink, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { BACKGROUND_CONTEXT as context } from '@earendil-works/chord/context';
import { fauxProvider, fauxAssistantMessage, fauxToolCall } from '@earendil-works/pi-ai';
import { createModels } from '@earendil-works/pi-ai/models';
import { createRegistry, Harness } from '@earendil-works/pi-durable';
import { openNodeSqliteStorage } from '@earendil-works/pi-durable/storage/sqlite/node';
import { NodeExecutionEnv } from '@earendil-works/pi-durable/env/node';
import createContext7 from '../src/native-profile/tools/context7/context7-mcp.js';
import createAntigravity from '../src/native-profile/tools/antigravity/index.js';
import { saveGeneratedImages } from '../src/native-profile/tools/antigravity/save.js';

const query = { libraryId: '/fixture/library/v1', query: 'fixture documentation' };
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+cXc8AAAAASUVORK5CYII=';
const text = result => result.output.filter(block => block.type === 'text').map(block => block.text).join('\n');
const call = (extension, args = query, signal) => extension.tools[1].execute(args, undefined, { ...context, abortSignal: signal });

async function recorder(t) {
  const trace = [];
  let mode = 'normal';
  let onTool;
  const server = createServer(async (req, res) => {
    let raw = '';
    for await (const bytes of req) raw += bytes;
    const body = raw ? JSON.parse(raw) : undefined;
    const key = (req.headers.authorization ?? '').replace(/^Bearer /, '');
    trace.push({ path: req.url, method: body?.method ?? req.method, key, body });
    if (req.url !== '/mcp') {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(req.url === '/image' ? { images: [{ data: png, mimeType: 'image/not-trusted' }], text: [`provider text ${key}`] } : { text: `grounded source ${key}` }));
      return;
    }
    if (req.method === 'DELETE' || body?.id === undefined) { res.writeHead(202).end(); return; }
    let result;
    if (body.method === 'initialize') {
      res.setHeader('Mcp-Session-Id', `fixture-${trace.length}`);
      result = { protocolVersion: '2025-11-25', capabilities: { tools: {} }, serverInfo: { name: 'recording-context7', version: '1' } };
    } else {
      onTool?.();
      if (mode === 'hold') return;
      if (mode === 'redirect') { res.writeHead(302, { location: 'https://example.invalid/never-follow' }).end(); return; }
      if (mode === 'auth') { res.writeHead(401).end(key); return; }
      if (mode === 'quota') { res.writeHead(429).end(key); return; }
      if (mode === 'malformed') { res.writeHead(200, { 'content-type': 'application/json' }).end('invalid JSON ' + key); return; }
      if (mode === 'remote-error') { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, error: { code: -32000, message: `timeout ${key}`, data: { status: 401 } } })); return; }
      result = { content: [{ type: 'text', text: `docs ${key}` + (mode === 'long' ? '\r\n🧪'.repeat(10000) : '') }] };
      if (mode === 'oversized') result.content[0].text = 'x'.repeat(1_048_577);
      if (mode === 'unsupported') result.content.push({ type: 'unknown', secret: key });
    }
    const payload = JSON.stringify({ jsonrpc: '2.0', id: body.id, result });
    res.setHeader('content-type', mode === 'sse' ? 'text/event-stream' : 'application/json');
    res.end(mode === 'sse' ? `event: message\ndata: ${payload}` : payload);
  }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  return { trace, base: `http://127.0.0.1:${server.address().port}`, setMode(value) { mode = value; }, onTool(callback) { onTool = callback; } };
}

test('factory contracts and missing/invalid credentials have no ambient auth or network fallback', async () => {
  let keyReads = 0, network = 0, modelAuth = 0;
  const c7 = createContext7({ resolveCredential: () => { keyReads++; return 'fake-only-key'; }, fetch: async () => { network++; throw Error('unexpected'); } });
  assert.deepEqual(c7.tools.map(tool => tool.name), ['context7_resolve_library_id', 'context7_query_docs']);
  assert.ok(c7.tools.every(tool => tool.replay === 'unsafe'));
  assert.equal(c7.tools[1].parameters.properties.query.maxLength, 8192);
  for (const args of [null, {}, { ...query, extra: 'forbidden' }, { ...query, query: '' }, { ...query, query: 'x'.repeat(8193) }]) assert.equal(text(await call(c7, args)), 'Context7 arguments are invalid');
  assert.equal(text(await call(c7, query, AbortSignal.abort())), 'Context7 request cancelled');
  assert.equal(keyReads, 0); assert.equal(network, 0);
  assert.equal(text(await call(createContext7())), 'Context7 credential is missing');
  assert.equal(text(await call(createContext7({ resolveCredential: () => 'bad\nkey' }))), 'Context7 credential is invalid');
  assert.equal(text(await call(createContext7({ resolveCredential: () => { throw Error('private sentinel'); } }))), 'Context7 credential is invalid');
  const ag = createAntigravity({ search: async () => { network++; }, image: async () => { network++; } });
  assert.deepEqual(ag.tools.map(tool => tool.name), ['google_search', 'generate_image']);
  assert.ok(ag.tools.every(tool => tool.replay === 'unsafe'));
  await assert.rejects(ag.tools[0].execute({ query: 'hello' }, { models: { getAuth() { modelAuth++; } } }, context), /credentials unavailable/);
  assert.equal(modelAuth, 0); assert.equal(network, 0);
});

test('actual Context7 MCP protocol preserves redaction, budgets, provenance, redirect/cancel and cleanup', { timeout: 10000 }, async t => {
  const service = await recorder(t);
  const key = 'synthetic-c7-private-key';
  let allowed = true;
  const extension = createContext7({ endpoint: service.base + '/mcp', resolveCredential: () => allowed ? key : undefined });
  const normal = await call(extension);
  assert.equal(normal.isError, false); assert.match(text(normal), /REDACTED/); assert.ok(!JSON.stringify(normal).includes(key));
  assert.ok(service.trace.some(item => item.method === 'DELETE'), 'native MCP session cleanup');
  for (const [mode, expected] of [['auth', 'authentication rejected'], ['quota', 'rate/quota'], ['remote-error', 'MCP/server-tool error'], ['malformed', 'invalid or unsupported'], ['oversized', 'exceeds byte limit'], ['unsupported', 'invalid or unsupported'], ['redirect', 'redirect refused']]) {
    service.setMode(mode);
    const result = await call(extension);
    assert.equal(result.isError, true, mode); assert.ok(text(result).includes(expected), `${mode}: ${text(result)}`); assert.ok(!JSON.stringify(result).includes(key));
  }
  service.setMode('long');
  const bounded = text(await call(extension));
  assert.ok(Buffer.byteLength(bounded) <= 6144); assert.ok(bounded.split('\n').length <= 512); assert.ok(bounded.endsWith('[Context7 output truncated]')); assert.ok(!bounded.includes('�'));
  service.setMode('sse'); assert.equal((await call(extension)).isError, false, 'native final unterminated SSE event is flushed');
  const before = service.trace.length; allowed = false;
  assert.equal(text(await call(extension)), 'Context7 credential is missing'); assert.equal(service.trace.length, before);
  allowed = true; service.setMode('hold');
  let reached; const waiting = new Promise(resolve => { reached = resolve; }); service.onTool(reached);
  const abort = new AbortController(); const pending = call(extension, query, abort.signal);
  await waiting; abort.abort(); assert.equal(text(await pending), 'Context7 request cancelled');
});

async function session(t, service, label) {
  const cwd = await mkdtemp(join(tmpdir(), `external-${label}-`));
  await mkdir(join(cwd, 'home'));
  const key = `fake-session-${label}-credential`;
  let allowed = true;
  const post = async (path, input, signal) => {
    const response = await fetch(service.base + path, { method: 'POST', signal, headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: JSON.stringify(input) });
    return response.json();
  };
  const registry = createRegistry();
  registry.install(createContext7({ endpoint: service.base + '/mcp', resolveCredential: () => allowed ? key : undefined }));
  registry.install(createAntigravity({
    resolveApiKey: async () => { if (!allowed) throw Error(key); return key; },
    search: async ({ query, signal }) => (await post('/search', { query }, signal)).text,
    image: async ({ prompt, path, cwd: actual, signal }) => {
      const remote = await post('/image', { prompt }, signal);
      return { ...await saveGeneratedImages(actual, path, remote.images), text: remote.text, model: 'fixture-image' };
    },
  }));
  const provider = fauxProvider({ tokensPerSecond: 100000 }); const models = createModels(); models.setProvider(provider.provider);
  const host = await Harness.open(await openNodeSqliteStorage(join(cwd, 'native.sqlite')), {
    registry, models, env: async () => new NodeExecutionEnv({ cwd, shellEnv: { HOME: join(cwd, 'home') } }), settings: { compaction: { enabled: false } },
  }, context);
  const model = provider.getModel(); const root = await host.root(context, { agent: { cwd, model: { provider: model.provider, modelId: model.id } } });
  let closed = false;
  const close = async () => { if (!closed) { closed = true; await host.close(context); } };
  t.after(async () => { await close(); await rm(cwd, { recursive: true, force: true }); });
  return { cwd, key, close, revoke() { allowed = false; },
    async run(name, args) {
      const tool = fauxToolCall(name, args);
      provider.setResponses([fauxAssistantMessage(tool, { stopReason: 'toolUse' }), fauxAssistantMessage('Fixture result observed.')]);
      await (await root.submit({ type: 'input', content: `Run ${name}` }, context)).wait(context);
      await root.waitForIdle(context);
      const entries = (await root.entries({}, 100, undefined, context)).items;
      assert.ok(!JSON.stringify(entries).includes(key), 'credential never enters persisted native transcript');
      const result = entries.find(entry => entry.kind === 'pi.tool-result' && entry.model?.some(message => message.role === 'toolResult' && message.toolCallId === tool.id));
      assert.ok(result, 'exact native tool-call identity has a result');
      return result;
    },
  };
}

test('four actual native tools keep two session credentials/cwd separate; revoke and close A leave B usable', { timeout: 15000 }, async t => {
  const service = await recorder(t);
  const a = await session(t, service, 'A'); const b = await session(t, service, 'B');
  assert.match(JSON.stringify(await a.run('context7_resolve_library_id', { libraryName: 'fixture', query: 'resolve fixture' })), /docs/);
  assert.match(JSON.stringify(await b.run('context7_query_docs', query)), /docs/);
  assert.match(JSON.stringify(await a.run('google_search', { query: 'local-only search' })), /grounded source/);
  const image = await b.run('generate_image', { prompt: 'fixture pixel', path: 'portrait.jpeg' });
  assert.match(JSON.stringify(image), /portrait\.png/);
  const saved = join(b.cwd, 'portrait.png');
  assert.deepEqual(await readFile(saved), Buffer.from(png, 'base64')); assert.equal((await stat(saved)).mode & 0o777, 0o600);
  const before = await readFile(saved);
  assert.match(JSON.stringify(await b.run('generate_image', { prompt: 'must not overwrite', path: 'portrait.jpeg' })), /generation failed/);
  assert.deepEqual(await readFile(saved), before);
  const calls = service.trace.length;
  assert.match(JSON.stringify(await b.run('generate_image', { prompt: 'escape rejected', path: '../outside.png' })), /remain within/);
  assert.equal(service.trace.length, calls, 'lexical escape denied before provider operation');
  a.revoke();
  assert.match(JSON.stringify(await a.run('google_search', { query: 'revoked' })), /credentials unavailable/);
  assert.match(JSON.stringify(await a.run('context7_query_docs', query)), /credential is missing/);
  assert.equal(service.trace.length, calls);
  await a.close();
  assert.match(JSON.stringify(await b.run('google_search', { query: 'still authorized B' })), /grounded source/);
  assert.ok(service.trace.some(item => item.key === a.key)); assert.ok(service.trace.some(item => item.key === b.key));
});

test('actual image save helper refuses symlink escape, overwrite, invalid bytes and counts', async t => {
  const root = await mkdtemp(join(tmpdir(), 'image-boundary-')); const outside = await mkdtemp(join(tmpdir(), 'image-outside-'));
  t.after(async () => { await rm(root, { recursive: true, force: true }); await rm(outside, { recursive: true, force: true }); });
  await symlink(outside, join(root, 'escape'));
  await assert.rejects(saveGeneratedImages(root, 'escape/new.png', [{ data: png, mimeType: 'image/png' }]), /outside workspace/);
  await assert.rejects(saveGeneratedImages(root, '../outside.png', [{ data: png, mimeType: 'image/png' }]), /escapes workspace/);
  await assert.rejects(saveGeneratedImages(root, undefined, []), /image count/);
  await assert.rejects(saveGeneratedImages(root, undefined, [{ data: 'not-base64', mimeType: 'image/png' }]), /encoding/);
  await assert.rejects(saveGeneratedImages(root, undefined, [{ data: Buffer.from('not image bytes').toString('base64'), mimeType: 'image/png' }]), /Unsupported/);
  const result = await saveGeneratedImages(root, 'new.jpg', [{ data: png, mimeType: 'image/jpeg' }]);
  assert.equal(result.images[0].mimeType, 'image/png'); assert.ok(result.savedPaths[0].endsWith('.png'));
  await assert.rejects(saveGeneratedImages(root, 'new.jpg', [{ data: png, mimeType: 'image/png' }]), /EEXIST/);
});
