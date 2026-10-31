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
    if (message.method === 'tools/list') result = { tools: ['echo', 'hidden'].map(name => ({ name, inputSchema: {
      type: 'object', properties: { log_type: { anyOf: [{ type: 'string', enum: ['build', 'deploy'] }, { const: null, nullable: true }] } }, required: ['log_type'],
    } })) };
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
  const advertised = (await B.sources[0].client.listTools())[0].inputSchema.properties.log_type.anyOf[1];
  assert.deepEqual(advertised, { const: null, nullable: true }, 'schema normalization must not mutate the advertised catalogue');
  await assert.rejects(B.sources[0].client.callTool('echo', { log_type: 42 }, {}));
  assert.equal(calls, 0, 'schema fix must not bypass argument validation');
  assert.equal((await B.sources[0].client.callTool('echo', { log_type: null }, {})).content[0].text, 'fixture-ok');
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

test('native settings win over stale Pi overrides; adapter-only servers survive; 401 never resends', async t => {
  const calls = [];
  const server = createServer(async (request, response) => {
    if (request.method !== 'POST') { response.writeHead(405).end(); return; }
    let raw = ''; for await (const chunk of request) raw += chunk;
    const message = JSON.parse(raw);
    if (message.id === undefined) { response.writeHead(202).end(); return; }
    if (message.method === 'tools/call') { calls.push(request.headers.authorization); response.writeHead(401).end(); return; }
    const result = message.method === 'initialize'
      ? { protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'fixture', version: '1' } }
      : { tools: [{ name: 'effect', inputSchema: { type: 'object', properties: {} } }] };
    response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }));
  }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const root = await mkdtemp(join(tmpdir(), 'nico-policy-'));
  const url = `http://127.0.0.1:${server.address().port}/mcp`;
  const global = { mcpServers: { codegraph: { url, enabled: true }, exa: { url, headers: { Authorization: 'Bearer native-fixture' } } } };
  await writeFile(join(root, 'mcp.json'), JSON.stringify(global));
  const adapter = { mcpServers: { codegraph: { url, disabled: true }, exa: { url, headers: { Authorization: 'Bearer stale-fixture' } },
    'apify-catalog': { url, directTools: false } } };
  await writeFile(join(root, 'mcp-adapter.json'), JSON.stringify(adapter));
  let allowed = true;
  const mcp = await connectSessionMcp({ cwd: root, directory: root }, { agentDir: root, projectTrusted: false,
    authorize: () => { if (!allowed) throw Error('REVOKED'); } });
  t.after(() => mcp.close());
  assert.equal(mcp.status().manager, 'nico');
  assert.deepEqual(mcp.sources.map(s => s.server).sort(), ['apify-catalog', 'codegraph', 'exa']);
  const exa = mcp.sources.find(s => s.server === 'exa');
  await assert.rejects(exa.client.callTool('effect', {}));
  assert.deepEqual(calls, ['Bearer native-fixture'], 'an uncertain tool call must not be resent');
  allowed = false;
  await assert.rejects(exa.client.callTool('effect', {}));
  assert.equal(calls.length, 1, 'direct client calls also recheck revocation');
  assert.deepEqual(JSON.parse(await (await import('node:fs/promises')).readFile(join(root, 'mcp-adapter.json'), 'utf8')), adapter);
});

test('native OAuth store is read in place, expiry and project trust are preserved', async t => {
  const root = await mkdtemp(join(tmpdir(), 'nico-oauth-'));
  await mkdir(join(root, '.pi'));
  await writeFile(join(root, 'mcp.json'), JSON.stringify({ mcpServers: { fixture: { url: 'http://127.0.0.1:1/mcp', oauth: {} } } }));
  await writeFile(join(root, '.pi/mcp.json'), JSON.stringify({ mcpServers: { untrusted: { command: 'must-not-run' } } }));
  const store = { 'fixture|http://127.0.0.1:1/mcp': { serverUrl: 'http://127.0.0.1:1/mcp',
    tokens: { access_token: 'synthetic-expired', token_type: 'Bearer' }, tokensExpireAt: 1 } };
  const { mcpNamespace } = await import('./compiled/nico.mjs');
  store[`${mcpNamespace('fixture')}|http://127.0.0.1:1/mcp`] = store['fixture|http://127.0.0.1:1/mcp'];
  const bytes = JSON.stringify(store);
  await writeFile(join(root, 'mcp-auth.json'), bytes, { mode: 0o600 });
  const mcp = await connectSessionMcp({ cwd: root, directory: root }, { agentDir: root, projectTrusted: false, authorize: () => {} });
  t.after(() => mcp.close());
  assert.equal(mcp.status().servers.length, 1);
  assert.equal(mcp.status().servers[0].error, 'needs_auth');
  assert(!JSON.stringify(mcp.status()).includes('synthetic-expired'));
  assert.equal(await (await import('node:fs/promises')).readFile(join(root, 'mcp-auth.json'), 'utf8'), bytes);
});

test('SDK -> unchanged native@1 CodeMode -> Nico, durable reopen does not resend', { timeout: 30_000 }, async t => {
  const { homedir } = await import('node:os');
  const { Store } = await import('dpi-backend/store');
  const { createHttpServer, GrantPolicy } = await import('dpi-backend/server');
  const { createNativeModels } = await import('dpi-backend/native-profile');
  const { DpiClient } = await import('dpi-sdk');
  const { fauxProvider, fauxAssistantMessage, fauxToolCall } = await import('@earendil-works/pi-ai/providers/faux');
  const { createOperationalProfile } = await import('./operational-profile.mjs');
  const root = await mkdtemp(join(tmpdir(), 'nico-sdk-'));
  const oldDir = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = root;
  t.after(() => { if (oldDir === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = oldDir; });
  await mkdir(join(homedir(), '.hindsight'), { recursive: true });
  await writeFile(join(homedir(), '.hindsight/coding-agent.json'), JSON.stringify({ disabled: true }));
  let calls = 0;
  const endpoint = createServer(async (request, response) => {
    if (request.method !== 'POST') { response.writeHead(405).end(); return; }
    let raw = ''; for await (const chunk of request) raw += chunk;
    const message = JSON.parse(raw);
    if (message.id === undefined) { response.writeHead(202).end(); return; }
    let result;
    if (message.method === 'initialize') result = { protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'fixture', version: '1' } };
    else if (message.method === 'tools/list') result = { tools: [{ name: 'echo', inputSchema: { type: 'object', properties: {
      log_type: { anyOf: [{ type: 'string', enum: ['build', 'deploy'] }, { const: null, nullable: true }] },
    } } }] };
    else if (message.method === 'tools/call') { calls++; result = { content: [{ type: 'text', text: 'NICO_NATIVE_CODEMODE_OK' }] }; }
    else result = {};
    response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }));
  }).listen(0, '127.0.0.1');
  await new Promise(resolve => endpoint.once('listening', resolve));
  t.after(() => { endpoint.closeAllConnections(); endpoint.close(); });
  await writeFile(join(root, 'mcp.json'), JSON.stringify({ mcpServers: { fixture: { url: `http://127.0.0.1:${endpoint.address().port}/mcp`, exposure: 'codemode' } } }));
  const grant = { id: 'fixture', token: 'synthetic', actor: 'fixture', source: 'terminal', authority: 'human',
    permissions: ['read', 'write', 'control', 'filesystem', 'human-accept'], binding: {} };
  const policy = new GrantPolicy([grant]);
  const create = async () => {
    const faux = fauxProvider({ models: [{ id: 'echo', contextWindow: 128000 }], tokensPerSecond: Infinity });
    faux.setResponses([
      fauxAssistantMessage(fauxToolCall('codemode', { code: 'text(await tools.mcp__fixture__echo({log_type: null}));' }), { stopReason: 'toolUse' }),
      context => {
        const latest = context.messages.findLast(m => m.role === 'toolResult' && m.toolName === 'codemode');
        assert(latest && !latest.isError && JSON.stringify(latest.content).includes('NICO_NATIVE_CODEMODE_OK'));
        return fauxAssistantMessage('NICO_SDK_OK');
      },
    ]);
    return createNativeModels({ providers: [faux.provider], credentials: { read: async () => undefined, list: async () => [], modify: async () => { throw Error('No credential writes'); }, delete: async () => { throw Error('No credential writes'); } } });
  };
  const discovery = await create();
  const profile = await createOperationalProfile({ policy, owner: policy.authenticate(grant.token), models: {
    defaultModel: { provider: 'faux', modelId: 'echo' }, catalogue: discovery.catalogue, create } });
  assert.equal(profile.id, 'native@1');
  const { createOperationalProfile: legacyFactory } = await import('./legacy-operational-profile.mjs');
  let selectedProfile = await legacyFactory({ policy, owner: policy.authenticate(grant.token), models: {
    defaultModel: { provider: 'faux', modelId: 'echo' }, catalogue: discovery.catalogue, create } });
  const legacyProfile = selectedProfile;
  let store, server;
  const open = async () => {
    store = await Store.open({ dataDir: join(root, 'data'), startDirs: [root], profile: selectedProfile });
    server = createHttpServer(store, policy).listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    return new DpiClient(`http://127.0.0.1:${server.address().port}`, grant.token);
  };
  const close = async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await store.close(); };
  let client = await open();
  try {
    const session = await client.createSession({ name: 'Nico fixture', cwd: root, model: { provider: 'faux', modelId: 'echo' } }, 'nico-create');
    const agent = client.agent(session.id, 1);
    const detail = await agent.get();
    assert(detail.tools.some(tool => tool.name === 'codemode' && tool.offered));
    const response = await agent.send('Run the local scripted fixture.', 'followUp', 'nico-once', 10_000);
    assert.equal(response.status, 'done', JSON.stringify(response));
    assert.equal(response.answer.text, 'NICO_SDK_OK');
    assert.equal(calls, 1);
    await close(); selectedProfile = profile; client = await open();
    assert.deepEqual(await client.agent(session.id, 1).send('Run the local scripted fixture.', 'followUp', 'nico-once', 1000), response);
    assert.equal(calls, 1, 'old durable receipts are not re-executed after the transport switch');
    assert.equal(store.errors.size, 0);
    const afterSwitch = await client.agent(session.id, 1).send('Run the local scripted fixture.', 'followUp', 'nico-after-switch', 10_000);
    assert.equal(afterSwitch.status, 'done', JSON.stringify(afterSwitch));
    assert.equal(afterSwitch.answer.text, 'NICO_SDK_OK');
    assert.equal(calls, 2, 'one new native CodeMode call through Nico');
    await close(); selectedProfile = legacyProfile; client = await open();
    assert.deepEqual(await client.agent(session.id, 1).send('Run the local scripted fixture.', 'followUp', 'nico-after-switch', 1000), afterSwitch);
    assert.equal(calls, 2, 'rollback does not resend completed effects');
    assert.equal(store.errors.size, 0);
  } finally { await close(); }
});
