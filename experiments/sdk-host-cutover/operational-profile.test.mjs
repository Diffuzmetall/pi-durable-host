import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, access } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { Store } from 'dpi-backend/store';
import { createHttpServer, GrantPolicy } from 'dpi-backend/server';
import { createNativeModels } from 'dpi-backend/native-profile';
import { DpiClient } from 'dpi-sdk';
import { fauxProvider, fauxAssistantMessage, fauxToolCall } from '@earendil-works/pi-ai/providers/faux';
import { createOperationalProfile } from './operational-profile.mjs';

// No production data or credentials are mounted. These are genuine native Store/Harness + SDK calls.
test('operational bootstrap runs native read/bash through SDK, keeps identity on reopen and never resends', { timeout: 35_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'operational-host-'));
  const cwd = join(root, 'work'); await mkdir(cwd);
  await writeFile(join(cwd, 'value.txt'), 'OFFLINE_NATIVE_READ_OK');
  await mkdir(join(homedir(), '.hindsight'), { recursive: true });
  await writeFile(join(homedir(), '.hindsight/coding-agent.json'), JSON.stringify({ disabled: true }));
  const grant = { id: 'fixture-operator', token: 'fixture-token', actor: 'fixture-operator', source: 'terminal', authority: 'human',
    permissions: ['read', 'write', 'control', 'filesystem', 'human-accept'], binding: {} };
  const policy = new GrantPolicy([grant]);
  const handles = [];
  const create = async () => {
    const faux = fauxProvider({ models: [{ id: 'echo' }], tokensPerSecond: Infinity });
    handles.push(faux);
    faux.setResponses([
      fauxAssistantMessage(fauxToolCall('read', { path: join(cwd, 'value.txt') }), { stopReason: 'toolUse' }),
      context => {
        assert(context.messages.some(message => message.role === 'toolResult' && message.toolName === 'read' && JSON.stringify(message.content).includes('OFFLINE_NATIVE_READ_OK')));
        return fauxAssistantMessage(fauxToolCall('bash', { command: 'printf OFFLINE_NATIVE_BASH_OK' }), { stopReason: 'toolUse' });
      },
      context => {
        assert(context.messages.some(message => message.role === 'toolResult' && message.toolName === 'bash' && !message.isError && JSON.stringify(message.content).includes('OFFLINE_NATIVE_BASH_OK')));
        return fauxAssistantMessage([
          fauxToolCall('bash', { command: 'rm -rf /home/probe/important' }),
          fauxToolCall('mcp_status', {}),
        ], { stopReason: 'toolUse' });
      },
      context => {
        assert(context.messages.some(message => message.role === 'toolResult' && message.toolName === 'bash' && message.isError && /blocked|denied/i.test(JSON.stringify(message.content))));
        assert(context.messages.some(message => message.role === 'toolResult' && message.toolName === 'mcp_status' && !message.isError && JSON.stringify(message.content).includes('agentMail')));
        return fauxAssistantMessage('HOST_BOOTSTRAP_FIXTURE_OK');
      },
    ]);
    return createNativeModels({ providers: [faux.provider], credentials: {
      read: async () => undefined, list: async () => [], modify: async () => { throw Error('Fixture auth mutation'); }, delete: async () => { throw Error('Fixture auth mutation'); },
    } });
  };
  const discovery = await create();
  const profile = await createOperationalProfile({ policy, owner: policy.authenticate(grant.token), trustedWorkspaces: [cwd],
    models: { defaultModel: { provider: 'faux', modelId: 'echo' }, catalogue: discovery.catalogue, create } });
  assert.equal(profile.id, 'native@1');
  const options = { dataDir: join(root, 'data'), startDirs: [cwd], name: 'offline-operational', profile };
  let store, server;
  const open = async () => {
    store = await Store.open(options);
    server = createHttpServer(store, policy).listen(0, '127.0.0.1');
    await once(server, 'listening');
    return new DpiClient(`http://127.0.0.1:${server.address().port}`, grant.token);
  };
  const close = async () => {
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    await store.close();
  };
  let client = await open();
  try {
    const session = await client.createSession({ name: 'bootstrap-fixture', cwd, model: { provider: 'faux', modelId: 'echo' } }, 'bootstrap-create');
    const agent = client.agent(session.id, 1);
    const detail = await agent.get();
    for (const name of ['mcp_status', 'codex_ask', 'google_search', 'context7_query_docs'])
      assert(detail.tools.some(tool => tool.name === name && tool.offered), `Missing native tool: ${name}`);
    const result = await agent.send('Exercise the scripted offline fixture.', 'followUp', 'bootstrap-send', 10_000);
    assert.equal(result.status, 'done', JSON.stringify(result));
    assert.equal(result.answer.text, 'HOST_BOOTSTRAP_FIXTURE_OK');
    const count = handles.reduce((sum, value) => sum + value.state.callCount, 0);
    assert.equal(count, 4);
    assert.deepEqual(await agent.send('Exercise the scripted offline fixture.', 'followUp', 'bootstrap-send', 1000), result);
    await close();
    client = await open();
    assert.equal(store.errors.size, 0);
    assert.equal((await client.sessions()).length, 1);
    assert.equal((await client.session(session.id).get()).id, session.id);
    assert.deepEqual(await client.agent(session.id, 1).send('Exercise the scripted offline fixture.', 'followUp', 'bootstrap-send', 1000), result);
    assert.equal(handles.reduce((sum, value) => sum + value.state.callCount, 0), count);
  } finally { await close(); }
});

test('operational entrypoint rejects missing credentials before creating storage or an auth file', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'operational-cli-'));
  const dataDir = join(directory, 'data');
  const config = join(directory, 'host.json');
  await writeFile(config, JSON.stringify({ dataDir, startDirs: [directory], trustedWorkspaces: [], port: 0, ownerGrantId: 'operator',
    grants: [{ id: 'operator', token: 'synthetic', actor: 'operator', source: 'terminal', authority: 'human',
      permissions: ['read', 'write', 'control', 'filesystem', 'human-accept'], binding: {} }] }), { mode: 0o600 });
  await assert.rejects(promisify(execFile)(process.execPath, [new URL('./operational-host.mjs', import.meta.url).pathname, config]), error => {
    assert.equal(error.code, 1);
    assert.match(error.stderr, /^NATIVE_HOST_START_FAILED/);
    assert(!error.stderr.includes('synthetic'));
    return true;
  });
  await assert.rejects(access(dataDir), { code: 'ENOENT' });
  await assert.rejects(access(join(homedir(), '.pi/agent/auth.json')), { code: 'ENOENT' });
});

test('full operational binding recalls and retains only to its synthetic Hindsight endpoint', { timeout: 30_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'operational-memory-'));
  const calls = [];
  const endpoint = createServer(async (request, response) => {
    let raw = ''; for await (const chunk of request) raw += chunk;
    assert.equal(request.headers.authorization, 'Bearer synthetic-memory-token');
    const path = new URL(request.url, 'http://127.0.0.1').pathname;
    calls.push({ path, method: request.method, body: raw ? JSON.parse(raw) : undefined });
    response.setHeader('content-type', 'application/json');
    if (path.endsWith('/memories/recall')) response.end(JSON.stringify({ results: [{ text: 'SYNTHETIC_MEMORY_CONTEXT' }] }));
    else if (path.endsWith('/knowledge-base/tree')) response.end(JSON.stringify({ roots: [] }));
    else if (path.endsWith('/memories') && request.method === 'POST') {
      response.end(JSON.stringify({ operation_id: `synthetic-${calls.length}` }));
      if (raw.includes('SYNTHETIC_MEMORY_USER_INPUT') && raw.includes('SYNTHETIC_MEMORY_ANSWER')) endpoint.emit('retained-turn');
    }
    else response.end('{}');
  }).listen(0, '127.0.0.1');
  await once(endpoint, 'listening');
  const configPath = join(homedir(), '.hindsight/coding-agent.json');
  await writeFile(configPath, JSON.stringify({ apiUrl: `http://127.0.0.1:${endpoint.address().port}`, apiToken: 'synthetic-memory-token',
    serverMode: 'self-hosted', bankId: 'operational-fixture', autoInject: 'recall', autoSeed: false, autoUpdate: false,
    codebaseSurvey: false, gitIngest: 'none', manageBankConfig: false, retainSessions: true }));
  const grant = { id: 'memory-operator', token: 'synthetic-host-token', actor: 'memory-operator', source: 'terminal', authority: 'human',
    permissions: ['read', 'write', 'control', 'filesystem', 'human-accept'], binding: {} };
  const policy = new GrantPolicy([grant]);
  const create = async () => {
    const faux = fauxProvider({ models: [{ id: 'echo', contextWindow: 128000, maxTokens: 4096 }], tokensPerSecond: Infinity });
    faux.setResponses([context => {
      assert(JSON.stringify(context.messages).includes('SYNTHETIC_MEMORY_CONTEXT'));
      return fauxAssistantMessage('SYNTHETIC_MEMORY_ANSWER');
    }]);
    return createNativeModels({ providers: [faux.provider], credentials: {
      read: async () => undefined, list: async () => [], modify: async () => { throw Error('No fixture auth write'); }, delete: async () => { throw Error('No fixture auth delete'); },
    } });
  };
  let store, server;
  try {
    const catalogue = (await create()).catalogue;
    const profile = await createOperationalProfile({ policy, owner: policy.authenticate(grant.token),
      models: { defaultModel: { provider: 'faux', modelId: 'echo' }, catalogue, create } });
    store = await Store.open({ dataDir: join(root, 'data'), startDirs: [root], provider: 'faux', name: 'synthetic-memory', profile });
    server = createHttpServer(store, policy).listen(0, '127.0.0.1'); await once(server, 'listening');
    const client = new DpiClient(`http://127.0.0.1:${server.address().port}`, grant.token);
    const session = await client.createSession({ name: 'memory-binding', cwd: root, model: { provider: 'faux', modelId: 'echo' } }, 'memory-create');
    const result = await client.agent(session.id, 1).send('SYNTHETIC_MEMORY_USER_INPUT', 'followUp', 'memory-send', 10_000);
    assert.equal(result.status, 'done', JSON.stringify(result));
    assert.equal(result.answer.text, 'SYNTHETIC_MEMORY_ANSWER');
    // HTTP completion is not the async retention receipt; closing the owner fences that delivery.
    if (!calls.some(call => JSON.stringify(call.body)?.includes('SYNTHETIC_MEMORY_ANSWER')))
      await once(endpoint, 'retained-turn', { signal: AbortSignal.timeout(10_000) });
  } finally {
    server?.closeAllConnections(); if (server) await new Promise(resolve => server.close(resolve));
    await store?.close();
    endpoint.closeAllConnections(); await new Promise(resolve => endpoint.close(resolve));
    await writeFile(configPath, JSON.stringify({ disabled: true }));
  }
  assert(calls.some(call => call.path.endsWith('/memories/recall')));
  const retained = calls.filter(call => call.method === 'POST' && call.path.endsWith('/memories'));
  assert(JSON.stringify(retained).includes('SYNTHETIC_MEMORY_USER_INPUT'));
  assert(JSON.stringify(retained).includes('SYNTHETIC_MEMORY_ANSWER'));
  assert(calls.every(call => !call.path.includes('/banks/') || /\/banks\/operational-fixture(?:\/|$)/.test(call.path)),
    JSON.stringify(calls.map(call => call.path)));
});
