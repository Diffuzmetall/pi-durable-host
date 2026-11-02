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
  await writeFile(join(root, 'mcp.json'), JSON.stringify({ mcpServers: { 'mcp-agent-mail': {
    url: `http://127.0.0.1:${server.address().port}/mcp?v=2`,
  } } }));
  const staged = await mcp.prepareReload();
  assert.deepEqual(staged.status().agentMail, { project: root, name: 'FixtureActor' });
  assert(!JSON.stringify(staged.status()).includes('synthetic-proof'));
  staged.validate();
  staged.publish();
  await staged.drain();
  const nextSource = mcp.sources[0];
  await assert.rejects(nextSource.authorize(tool, { ...args, sender_name: 'OtherActor' }), /identity mismatch/);
  await assert.rejects(nextSource.client.callTool('register_agent', {}), /register_agent|registration|identity|not permitted|NOT_SENT/i);
  await nextSource.client.callTool(tool.name, args);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].arguments.sender_token, 'synthetic-proof');
  active = false;
  await assert.rejects(nextSource.authorize(tool, args), /GRANT_REVOKED/);
  await assert.rejects(nextSource.client.callTool(tool.name, args), /NOT_SENT/);
  assert.equal(calls.length, 2);
});

test('adapter config stages, discards, publishes and drains twenty real HTTP MCP streams', async t => {
  const live = new Set();
  const streams = new Map();
  const stream = version => {
    const key = String(version);
    if (!streams.has(key)) {
      const state = {};
      state.opened = new Promise(resolve => { state.open = resolve; });
      state.closed = new Promise(resolve => { state.close = resolve; });
      streams.set(key, state);
    }
    return streams.get(key);
  };
  let opens = 0, calls = 0, release, started;
  const held = new Promise(resolve => { release = resolve; });
  const entered = new Promise(resolve => { started = resolve; });
  const server = createServer(async (request, response) => {
    const version = new URL(request.url, 'http://fixture').searchParams.get('v');
    if (request.method === 'GET') {
      const id = request.headers['mcp-session-id'];
      live.add(id);
      response.writeHead(200, { 'content-type': 'text/event-stream' });
      response.write(': fixture stream\n\n');
      stream(version).open();
      response.on('close', () => { live.delete(id); stream(version).close(); });
      return;
    }
    if (request.method !== 'POST') { response.writeHead(405).end(); return; }
    let raw = ''; for await (const chunk of request) raw += chunk;
    const message = JSON.parse(raw);
    if (message.id === undefined) { response.writeHead(202).end(); return; }
    let result = {}, id = request.headers['mcp-session-id'];
    if (message.method === 'initialize') {
      id = `fixture-${++opens}`;
      result = { protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'fixture', version } };
    }
    if (message.method === 'tools/list') result = { tools: [{ name: 'echo', description: `version ${version}`,
      inputSchema: { type: 'object', properties: {} } }] };
    if (message.method === 'tools/call') {
      calls++;
      if (message.params.arguments.hold) { started(); await held; }
      result = { content: [{ type: 'text', text: version }] };
    }
    response.writeHead(200, { 'content-type': 'application/json', 'mcp-session-id': id });
    response.end(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { release(); server.closeAllConnections(); server.close(); });
  const root = await mkdtemp(join(tmpdir(), 'mcp-staged-http-'));
  const configPath = join(root, 'mcp-adapter.json');
  const configure = version => writeFile(configPath, JSON.stringify({ mcpServers: { fixture: {
    url: `http://127.0.0.1:${server.address().port}/mcp?v=${version}`, exposure: 'codemode',
  } } }));
  await configure(0);
  const mcp = await connectSessionMcp({ cwd: root, directory: root }, {
    agentDir: root, projectTrusted: false, authorize: async () => {},
  });
  t.after(() => mcp.close());
  await stream(0).opened;
  const original = mcp.sources[0];
  await configure('discard');
  const rejected = await mcp.prepareReload();
  await stream('discard').opened;
  assert.equal(mcp.sources[0], original);
  assert.match((await rejected.sources[0].client.listTools())[0].description, /discard/);
  await assert.rejects(rejected.sources[0].client.callTool('echo', {}), /NOT_SENT/);
  await rejected.discard();
  await stream('discard').closed;
  assert.equal(live.size, 1);
  await configure('raced');
  const raced = await mcp.prepareReload();
  await stream('raced').opened;
  await configure('newer');
  assert.throws(() => raced.validate(), /MCP_CONFIG_CHANGED_DURING_PREPARE/);
  assert.throws(() => raced.publish(), /MCP_CANDIDATE_NOT_VALIDATED/);
  await raced.discard();
  await stream('raced').closed;
  assert.equal(mcp.sources[0], original);
  assert.equal(live.size, 1);
  await configure(0);
  const call = original.client.callTool('echo', { hold: true });
  await entered;
  await configure(1);
  const next = await mcp.prepareReload();
  await stream(1).opened;
  next.validate();
  next.publish();
  assert.equal(live.size, 2);
  assert.equal((await mcp.sources[0].client.callTool('echo', {})).content[0].text, '1');
  await assert.rejects(original.client.callTool('echo', {}), /NOT_SENT/);
  release();
  assert.equal((await call).content[0].text, '0');
  await next.drain();
  await stream(0).closed;
  assert.equal(live.size, 1);
  for (let version = 2; version <= 20; version++) {
    await configure(version);
    const prepared = await mcp.prepareReload();
    await stream(version).opened;
    prepared.validate();
    prepared.publish();
    await prepared.drain();
    await stream(version - 1).closed;
    assert.equal(live.size, 1, `one remote SSE stream after replacement ${version}`);
    assert.equal((await mcp.sources[0].client.callTool('echo', {})).content[0].text, String(version));
  }
  const beforeInvalid = mcp.sources[0];
  await writeFile(configPath, JSON.stringify({ mcpServers: { fixture: {
    url: `http://127.0.0.1:${server.address().port}/mcp?v=invalid`, roots: true,
  } } }));
  await assert.rejects(mcp.prepareReload(), /MCP_UNSUPPORTED_CONFIG/);
  assert.equal(mcp.sources[0], beforeInvalid);
  assert.equal(live.size, 1);
  await mcp.close();
  await stream(20).closed;
  assert.equal(live.size, 0);
  assert.equal(opens, 23, 'initial + two discarded + twenty published replacements');
  assert.equal(calls, 21, 'one admitted old call + twenty explicit new calls; no replay');
  console.log('HTTP_MCP_CENSUS', JSON.stringify({ opens, calls, liveStreams: live.size }));
});
