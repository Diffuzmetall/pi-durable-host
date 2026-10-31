import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'node:http';
import {
  AuthStorage, loadMcpConfig, getMcpToolExposure,
  McpServerConnection, McpOAuthCredentialStore, createDefaultTransport,
  executeAntigravitySearch, generateAntigravityImageContent, antigravityApiKey, loadTracingConfig,
  createSessionTracing, resolveMemoryBinding,
} from './compiled/bindings.mjs';

const exec = promisify(execFile);
test('frozen native auth serializes across processes and preserves rotated credentials', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'host-auth-'));
  const path = join(directory, 'auth.json');
  const initial = { type: 'oauth', access: 'synthetic', refresh: 'r0', expires: Date.now() + 600_000, generation: 0 };
  await writeFile(path, JSON.stringify({ 'openai-codex': initial, other: { type: 'api_key', key: 'synthetic-other' } }), { mode: 0o600 });
  const source = `import {AuthStorage} from ${JSON.stringify(new URL('./compiled/bindings.mjs', import.meta.url).href)};
    const storage = AuthStorage.create(process.argv[1]);
    for (let i=0;i<6;i++) await storage.modify('openai-codex', async current => {
      await new Promise(resolve => setTimeout(resolve, 5));
      return {...current, generation: current.generation + 1, refresh: 'r' + (current.generation + 1)};
    });`;
  await Promise.all([1, 2].map(() => exec(process.execPath, ['--input-type=module', '-e', source, path])));
  const storage = AuthStorage.create(path);
  const value = await storage.read('openai-codex');
  assert.equal(value.generation, 12);
  assert.equal(value.refresh, 'r12');
  assert.equal((await storage.read('other')).key, 'synthetic-other');
  assert.equal((await stat(path)).mode & 0o077, 0);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(storage.modify('openai-codex', async () => { throw Error('must not enter'); }, { signal: controller.signal }), { name: 'AbortError' });
  assert.equal((await storage.read('openai-codex')).generation, 12);
});

test('native MCP config honors trust, disabled servers and per-tool exposure without rewriting', async () => {
  const root = await mkdtemp(join(tmpdir(), 'host-mcp-config-'));
  const agentDir = join(root, 'agent'), cwd = join(root, 'project');
  await mkdir(agentDir); await mkdir(join(cwd, '.pi'), { recursive: true });
  const global = { mcpServers: { fixture: { url: 'http://127.0.0.1:1/mcp', exposure: 'codemode', toolExposure: { visible: 'direct', hidden: 'hidden' } }, disabled: { command: 'must-not-start', enabled: false } } };
  const globalBytes = JSON.stringify(global);
  await writeFile(join(agentDir, 'mcp.json'), globalBytes);
  await writeFile(join(cwd, '.pi/mcp.json'), JSON.stringify({ mcpServers: { fixture: { enabled: false } } }));
  const untrusted = loadMcpConfig({ agentDir, cwd, projectTrusted: false });
  assert.deepEqual(untrusted.errors, []);
  const fixture = untrusted.servers.find(entry => entry.name === 'fixture');
  assert.notEqual(fixture.config.enabled, false);
  assert.equal(getMcpToolExposure(fixture.config, 'visible'), 'direct');
  assert.equal(getMcpToolExposure(fixture.config, 'hidden'), 'hidden');
  assert.equal(getMcpToolExposure(fixture.config, 'other'), 'codemode');
  assert.equal(untrusted.servers.find(entry => entry.name === 'disabled').config.enabled, false);
  assert.equal(loadMcpConfig({ agentDir, cwd, projectTrusted: true }).servers.find(entry => entry.name === 'fixture').config.enabled, false);
  assert.equal(await readFile(join(agentDir, 'mcp.json'), 'utf8'), globalBytes);
});

test('frozen native MCP connects, calls and closes an actual loopback transport', async t => {
  let calls = 0;
  const server = createServer(async (request, response) => {
    if (request.method !== 'POST') { response.writeHead(405).end(); return; }
    const chunks = []; for await (const chunk of request) chunks.push(chunk);
    const message = JSON.parse(Buffer.concat(chunks).toString());
    if (message.id === undefined) { response.writeHead(202).end(); return; }
    const results = {
      initialize: { protocolVersion: '2025-03-26', capabilities: { tools: {}, resources: {} }, serverInfo: { name: 'offline-fixture', version: '1' } },
      'tools/list': { tools: [{ name: 'echo', inputSchema: { type: 'object', properties: { value: { type: 'string' } }, required: ['value'] } }] },
      'resources/list': { resources: [] }, 'resources/templates/list': { resourceTemplates: [] },
    };
    if (message.method === 'tools/call') { calls++; results['tools/call'] = { content: [{ type: 'text', text: message.params.arguments.value }] }; }
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: results[message.method] ?? {} }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const connection = new McpServerConnection({
    entry: { name: 'fixture', config: { url: `http://127.0.0.1:${server.address().port}/mcp`, headers: { Authorization: 'Bearer synthetic' }, timeout: 2 }, source: 'fixture', scope: 'global' },
    cwd: tmpdir(), createTransport: createDefaultTransport, credentials: new McpOAuthCredentialStore(), onTools() {},
  });
  t.after(() => connection.close());
  await connection.getClient();
  assert.equal(connection.state, 'connected');
  assert.equal(connection.tools[0].name, 'echo');
  const result = await connection.callTool('echo', { value: 'native-transport-ok' }, {});
  assert.equal(result.content[0].text, 'native-transport-ok');
  assert.equal(calls, 1);
  await connection.close();
  await assert.rejects(connection.getClient(), /shut down/);
});

test('session tracing keeps exporters, parents and shutdown isolated without a global tracer', async () => {
  const before = globalThis[Symbol.for('langfuse')]?.isolatedTracerProvider;
  const exports = [[], []];
  const sdks = exports.map((records, index) => createSessionTracing({
    publicKey: `pk-synthetic-${index}`, secretKey: `sk-synthetic-${index}`, baseUrl: 'https://example.invalid', traceMode: 'all',
  }, { exporter: { export(spans, done) { records.push(...spans); done({ code: 0 }); }, async shutdown() {}, async forceFlush() {} } }));
  const A = sdks[0].start('A', 'agent', { metadata: { session_id: 'fixture-A' } });
  const B = sdks[1].start('B', 'agent', { metadata: { session_id: 'fixture-B' } });
  const childA = sdks[0].start('A-generation', 'generation', { model: 'fixture', metadata: { session_id: 'fixture-A' } }, A);
  childA.update({ usageDetails: { input: 2, output: 3 }, costDetails: { total: 0 } });
  childA.end(); A.end(); await sdks[0].close();
  const childB = sdks[1].start('B-tool', 'tool', { metadata: { session_id: 'fixture-B' } }, B);
  childB.end(); B.end(); await sdks[1].flush(); await sdks[1].close();
  assert.equal(globalThis[Symbol.for('langfuse')]?.isolatedTracerProvider, before);
  assert.deepEqual(exports.map(records => records.length), [2, 2]);
  for (const [index, records] of exports.entries()) {
    const session = index === 0 ? 'fixture-A' : 'fixture-B';
    assert(records.every(span => span.attributes['langfuse.session.id'] === session));
    assert.equal(new Set(records.map(span => span.spanContext().traceId)).size, 1);
  }
  assert.notEqual(exports[0][0].spanContext().traceId, exports[1][0].spanContext().traceId);
  assert.throws(() => sdks[0].start('closed', 'agent', { metadata: {} }), /CLOSED/);
});

test('pinned memory resolver accepts an explicit disabled fixture without resolving a bank', () => {
  const result = resolveMemoryBinding('/fixture-only', { raw: { disabled: true }, env: {} });
  assert.equal(result.cfg.disabled, true);
  assert.equal(result.bankId, '');
});

test('frozen tool bindings load without global installations or ambient credentials', () => {
  assert.equal(typeof executeAntigravitySearch, 'function');
  assert.equal(typeof generateAntigravityImageContent, 'function');
  assert.equal(typeof antigravityApiKey, 'function');
  assert.equal(loadTracingConfig({ env: { LANGFUSE_TRACING_ENABLED: 'false' }, path: '/absent/private.json' }), undefined);
});
