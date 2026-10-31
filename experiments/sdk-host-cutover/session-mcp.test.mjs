import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { connectSessionMcp } from './session-mcp.mjs';

test('configured MCP is session-owned, hidden tools stay hidden, live policy changes deny', async t => {
  let opens = 0, calls = 0;
  const server = createServer(async (request, response) => {
    if (request.method !== 'POST') { response.writeHead(405).end(); return; }
    const chunks = []; for await (const chunk of request) chunks.push(chunk);
    const message = JSON.parse(Buffer.concat(chunks).toString());
    if (message.id === undefined) { response.writeHead(202).end(); return; }
    let result = {};
    if (message.method === 'initialize') { opens++; result = { protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'fixture', version: '1' } }; }
    if (message.method === 'tools/list') result = { tools: ['echo', 'hidden'].map(name => ({ name, inputSchema: { type: 'object', properties: {} } })) };
    if (message.method === 'resources/list') result = { resources: [] };
    if (message.method === 'resources/templates/list') result = { resourceTemplates: [] };
    if (message.method === 'tools/call') { calls++; result = { content: [{ type: 'text', text: 'fixture-ok' }] }; }
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const root = await mkdtemp(join(tmpdir(), 'session-mcp-'));
  const agentDir = join(root, 'agent'); await mkdir(agentDir);
  const configPath = join(agentDir, 'mcp.json');
  const config = { mcpServers: { fixture: { url: `http://127.0.0.1:${server.address().port}/mcp`, exposure: 'codemode', toolExposure: { hidden: 'hidden' } },
    unavailable: { command: '/no-such-mcp-fixture' }, disabled: { command: 'must-not-spawn', enabled: false } } };
  await writeFile(configPath, JSON.stringify(config));
  const make = sessionId => connectSessionMcp({ sessionId, cwd: root, directory: join(root, sessionId) }, {
    agentDir, projectTrusted: false, authorize: async () => {},
  });
  const A = await make('A'), B = await make('B');
  t.after(() => A.close()); t.after(() => B.close());
  assert.equal(opens, 2);
  assert.equal(A.status().servers.find(server => server.server === 'fixture').state, 'connected');
  assert.equal(A.status().servers.find(server => server.server === 'unavailable').state, 'failed');
  assert(!A.status().servers.some(server => server.server === 'disabled'));
  assert.deepEqual(A.sources[0].allowedTools, ['echo']);
  assert.deepEqual(A.sources[0].directTools, []);
  assert.notEqual(A.sources[0].client, B.sources[0].client);
  await A.close();
  await assert.rejects(A.sources[0].authorize({ name: 'echo' }, {}), /CLOSED/);
  await B.sources[0].authorize({ name: 'echo' }, {});
  assert.equal((await B.sources[0].client.callTool('echo', {}, {})).content[0].text, 'fixture-ok');
  assert.equal(calls, 1);
  config.mcpServers.fixture.enabled = false;
  await writeFile(configPath, JSON.stringify(config));
  await assert.rejects(B.sources[0].authorize({ name: 'echo' }, {}), /CONFIGURATION_CHANGED/);
});

test('Mail cannot invent an identity or dispatch identity registration', async t => {
  let requests = 0;
  const server = createServer((_, response) => { requests++; response.writeHead(500).end(); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const agentDir = await mkdtemp(join(tmpdir(), 'session-mail-'));
  await writeFile(join(agentDir, 'mcp.json'), JSON.stringify({ mcpServers: { 'mcp-agent-mail': { url: `http://127.0.0.1:${server.address().port}/mcp` } } }));
  const mcp = await connectSessionMcp({ cwd: agentDir, directory: agentDir }, {
    agentDir, projectTrusted: false, authorize: async () => {},
  });
  t.after(() => mcp.close());
  assert.deepEqual(mcp.sources, []);
  assert.equal(mcp.status().servers[0].reason, 'MCP_MAIL_EXISTING_IDENTITY_REQUIRED');
  assert.equal(mcp.status().agentMail, null);
  assert.equal(requests, 0);
});

test('existing Mail identity reaches a real transport, prevents impersonation and is reauthorized per call', async t => {
  const calls = [];
  const server = createServer(async (request, response) => {
    if (request.method !== 'POST') { response.writeHead(405).end(); return; }
    let raw = ''; for await (const chunk of request) raw += chunk;
    const message = JSON.parse(raw);
    if (message.id === undefined) { response.writeHead(202).end(); return; }
    let result = {};
    if (message.method === 'initialize') result = { protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'mail-fixture', version: '1' } };
    if (message.method === 'tools/list') result = { tools: ['send_message', 'register_agent'].map(name => ({ name, inputSchema: { type: 'object', properties: {} } })) };
    if (message.method === 'resources/list') result = { resources: [] };
    if (message.method === 'resources/templates/list') result = { resourceTemplates: [] };
    if (message.method === 'tools/call') { calls.push(message.params); result = { content: [{ type: 'text', text: 'synthetic mail accepted' }] }; }
    response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }));
  }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const root = await mkdtemp(join(tmpdir(), 'admitted-mail-'));
  await writeFile(join(root, 'mcp.json'), JSON.stringify({ mcpServers: { 'mcp-agent-mail': { url: `http://127.0.0.1:${server.address().port}/mcp` } } }));
  await writeFile(join(root, 'agent-mail-identity.json'), JSON.stringify({ project: root, name: 'FixtureActor', token: 'synthetic-proof' }), { mode: 0o600 });
  let active = true;
  const mcp = await connectSessionMcp({ cwd: root, directory: root }, { agentDir: root, projectTrusted: false,
    authorize: async () => { if (!active) throw Error('GRANT_REVOKED'); } });
  t.after(() => mcp.close());
  assert.equal(mcp.status().servers[0].state, 'connected');
  assert.deepEqual(mcp.status().agentMail, { project: root, name: 'FixtureActor' });
  assert(!JSON.stringify(mcp.status()).includes('synthetic-proof'));
  assert.equal(calls.length, 0, 'startup must not register an identity');
  const source = mcp.sources[0];
  const tool = { name: 'send_message' };
  await assert.rejects(source.authorize(tool, { project_key: root, sender_name: 'OtherActor' }), /identity mismatch/);
  await assert.rejects(source.authorize(tool, { project_key: '/foreign', sender_name: 'FixtureActor' }), /project mismatch/);
  const args = { project_key: root, sender_name: 'FixtureActor', to: ['FixtureRecipient'], subject: 'fixture', body_md: 'synthetic' };
  await source.authorize(tool, args);
  await source.client.callTool(tool.name, args);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].arguments.sender_token, 'synthetic-proof');
  active = false;
  await assert.rejects(source.authorize(tool, args), /GRANT_REVOKED/);
  assert.equal(calls.length, 1);
});
