import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { crc32, deflateSync } from 'node:zlib';
import { join } from 'node:path';
import { InMemoryCredentialStore } from '@earendil-works/pi-ai';
import { fauxProvider, fauxAssistantMessage, fauxToolCall } from '@earendil-works/pi-ai/providers/faux';
import { Store } from '../src/store.ts';
import { GrantPolicy, createHttpServer } from '../src/http-server.ts';
import { createNativeProfile, createNativeModels, saveGeneratedImages } from '../src/native-profile/profile.ts';
import { DpiClient } from '../../dpi-sdk/src/client.ts';
import { BACKGROUND_CONTEXT as ctx } from '@earendil-works/chord/context';
import { NativeGoalRuntime } from '../src/native-profile/automation/native-goals.ts';

// Configured source integration, not live provider/whole-milestone acceptance.
test('configured native Store isolates Models/skills, private bodies, scoped SDK metadata and exact saved references', { timeout: 30000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dpi-native-configured-'));
  const workA = join(directory, 'A'), workB = join(directory, 'B');
  await Promise.all([mkdir(workA), mkdir(workB)]);
  const skillPaths = new Map();
  for (const [scope, work] of [['A', workA], ['B', workB]]) {
    const homeDir = join(directory, `home-${scope}`), agentDir = join(homeDir, '.pi', 'agent');
    const file = join(work, '.pi', 'skills', 'fixture', 'SKILL.md');
    await mkdir(agentDir, { recursive: true }); await mkdir(join(work, '.pi', 'skills', 'fixture'), { recursive: true });
    const content = `---\nname: fixture\ndescription: Fixture ${scope}\n---\nPRIVATE_SKILL_BODY_${scope}\n`;
    await writeFile(file, content);
    skillPaths.set(work, { homeDir, agentDir, file, content });
  }
  const reference = { provider: 'same-native-provider', modelId: 'exact/native-id' };
  const token = 'dpi_native_configured_fixture_token_abcdefghijklmnopqrstuvwxyz';
  const policy = new GrantPolicy([{ id: 'owner', token, actor: 'owner', source: 'terminal', authority: 'human',
    permissions: ['read', 'write', 'control', 'filesystem', 'human-accept'], binding: {} },
    { id: 'viewer', token: `${token}-viewer`, actor: 'viewer', source: 'viewer', authority: 'observer', permissions: ['read'], binding: {} },
    { id: 'no-fs', token: `${token}-no-fs`, actor: 'no-fs', source: 'terminal', authority: 'human', permissions: ['read', 'write'], binding: {} },
    { id: 'machine', token: `${token}-machine`, actor: 'machine', source: 'iii', authority: 'delegated', permissions: ['read', 'filesystem'], binding: {} },
  ]);
  const requests = [], scopes = new Map();
  let missingB = false;
  const endpoint = createServer(async (request, response) => {
    let body = ''; for await (const chunk of request) body += chunk;
    requests.push({ scope: request.url, authorization: request.headers.authorization, ...JSON.parse(body) });
    response.end(`healthy scoped response ${request.url}`);
  }).listen(0, '127.0.0.1');
  await once(endpoint, 'listening');
  const endpointBase = `http://127.0.0.1:${endpoint.address().port}`;
  async function modelsFor(scope) {
    const credentials = new InMemoryCredentialStore();
    await credentials.modify(reference.provider, async () => ({ type: 'api_key', key: `SYNTHETIC_SCOPE_KEY_${scope}` }));
    const faux = fauxProvider({ provider: reference.provider, models: [{ id: reference.modelId, reasoning: true,
      contextWindow: scope === 'B' ? 65536 : 131072, maxTokens: 8192 }], tokensPerSecond: 100000 });
    faux.getModel().thinkingLevelMap = { max: 'max', xhigh: null };
    const reply = async (_context, options, _state, model) => {
      const response = await fetch(`${endpointBase}/${scope}`, { method: 'POST', headers: { authorization: `Bearer ${options.apiKey}` },
        body: JSON.stringify({ provider: model.provider, modelId: model.id }) });
      return fauxAssistantMessage(await response.text());
    };
    const provider = { ...faux.provider, auth: { apiKey: { name: 'explicit fixture auth',
      resolve: async ({ credential }) => credential?.key ? { auth: { apiKey: credential.key } } : undefined } } };
    const runtime = await createNativeModels({ credentials, providers: missingB && scope === 'B' ? [] : [provider] });
    return { runtime, faux, reply };
  }
  const menu = await modelsFor('MENU');
  const modelConfiguration = {
    defaultModel: { ...reference, privateHint: 'SYNTHETIC_PRIVATE_DEFAULT' },
    catalogue: menu.runtime.catalogue,
    create: async context => {
      const scope = context.cwd === workA ? 'A' : 'B';
      const value = await modelsFor(scope); scopes.set(context.sessionId, value); return value.runtime;
    },
  };
  const profile = createNativeProfile({ policy, owner: policy.authenticate(token), models: modelConfiguration,
    skills: context => ({ projectRoot: context.cwd, homeDir: skillPaths.get(context.cwd).homeDir,
      agentDir: skillPaths.get(context.cwd).agentDir, projectTrusted: true }),
    resolveSkill: async name => { throw Error(`Legacy resolver must not replace actual configured skills: ${name}`); },
    connectMcp: async () => ({ sources: [], close: async () => {} }),
  });
  const options = { dataDir: join(directory, 'data'), startDirs: [workA, workB], name: 'configured native', provider: 'faux', profile };
  let store, server;
  try {
    store = await Store.open(options);
    server = createHttpServer(store, policy).listen(0, '127.0.0.1'); await once(server, 'listening');
    const client = new DpiClient(`http://127.0.0.1:${server.address().port}`, token);
    const device = await client.device();
    assert.deepEqual(device.defaultModelRef, reference);
    assert.equal(device.models[0].provider, reference.provider);
    assert.doesNotMatch(JSON.stringify(device), /SYNTHETIC_|apiKey|authorization/);
    const a = await client.createSession({ name: 'A', cwd: workA, model: { ...reference, apiKey: 'SPOOFED_BODY_KEY' } });
    const b = await client.createSession({ name: 'B', cwd: workB, model: reference });
    assert.notEqual(scopes.get(a.id).runtime.models, scopes.get(b.id).runtime.models);
    const viewer = new DpiClient(client.baseUrl, `${token}-viewer`);
    const metadata = await viewer.session(a.id).skills();
    assert.deepEqual(metadata.map(skill => skill.name), ['fixture']);
    assert.doesNotMatch(JSON.stringify(metadata), /PRIVATE_SKILL_BODY|content|sourceInfo/);
    assert.equal((await client.session(a.id).skill('fixture')).content, skillPaths.get(workA).content);
    assert.equal((await client.session(b.id).skill('fixture')).content, skillPaths.get(workB).content);
    for (const suffix of ['viewer', 'no-fs', 'machine'])
      await assert.rejects(new DpiClient(client.baseUrl, `${token}-${suffix}`).session(a.id).skill('fixture'), error => error.status === 403);
    await assert.rejects(client.session(a.id).skill('../../outside'));
    const goal = await store.opened.get(a.id).profile.native.goals.create(1, {
      objective: 'Use actual configured native skill', criteria: [{ id: 'fixture', text: 'Body remains native' }],
      skills: ['fixture'], permissions: { scope: ['read fixture only'] }, limits: { maxCalls: 1 },
    }, ctx);
    const nativeGoal = await store.harness(store.resolveSession(a.id)).snapshot(NativeGoalRuntime, ctx);
    assert.match(nativeGoal.goals[goal.id].skillText.fixture, /PRIVATE_SKILL_BODY_A/);
    const publicGoal = await viewer.agent(a.id, 'main').doc('durable-goals.runtime');
    assert.doesNotMatch(JSON.stringify(publicGoal), /PRIVATE_SKILL_BODY|skillText/);
    const renamed = skillPaths.get(workA).content.replace('name: fixture', 'name: renamed');
    await writeFile(skillPaths.get(workA).file, renamed);
    assert.deepEqual((await client.session(a.id).skills()).map(skill => skill.name), ['renamed']);
    await assert.rejects(client.session(a.id).skill('fixture'));
    assert.equal((await client.session(a.id).skill('renamed')).content, renamed);
    assert.equal(store.models.getModels().length, 0, 'native execution never uses the legacy global container');
    const aModels = await client.session(a.id).models(), bModels = await client.session(b.id).models();
    assert.equal(aModels[0].contextWindow, 131072); assert.equal(bModels[0].contextWindow, 65536);
    assert.deepEqual(bModels[0].supportedThinkingLevels, ['off', 'minimal', 'low', 'medium', 'high', 'max']);
    assert.doesNotMatch(JSON.stringify([aModels, bModels]), /SYNTHETIC_|apiKey|authorization/);
    for (const session of [a, b]) scopes.get(session.id).faux.setResponses([scopes.get(session.id).reply]);
    const results = await Promise.all([client.agent(a.id, 'main').send('scope A', 'followUp', 'scope-a', 5000),
      client.agent(b.id, 'main').send('scope B', 'followUp', 'scope-b', 5000)]);
    assert.deepEqual(results.map(result => result.status), ['done', 'done']);
    assert.deepEqual(requests.map(value => value.authorization).sort(), ['Bearer SYNTHETIC_SCOPE_KEY_A', 'Bearer SYNTHETIC_SCOPE_KEY_B']);
    assert.ok(requests.every(value => value.provider === reference.provider && value.modelId === reference.modelId));
    const configured = await client.agent(b.id, 'main').configure({ thinkingLevel: 'max', model: reference });
    assert.equal(configured.thinkingLevel, 'max');
    await assert.rejects(client.agent(b.id, 'main').configure({ model: { ...reference, modelId: 'REMOVED_ID' } }), /Unknown model/);
    await client.session(a.id).archive();
    scopes.get(b.id).faux.setResponses([scopes.get(b.id).reply]);
    assert.equal((await client.agent(b.id, 'main').send('B after A close', 'followUp', 'b-after-a', 5000)).status, 'done');
    assert.equal(requests.at(-1).authorization, 'Bearer SYNTHETIC_SCOPE_KEY_B');
    const before = (await client.agent(b.id, 'main').entries()).items.map(entry => entry.id);
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); server = undefined;
    await store.close();
    missingB = true; store = await Store.open(options);
    assert.equal(store.opened.has(b.id), false); assert.equal(store.errors.get(b.id), 'Internal error', 'cached public failures omit private initializer causes');
    assert.deepEqual({ provider: store.resolveSession(b.id).provider, modelId: store.resolveSession(b.id).model }, reference);
    assert.equal(requests.length, 3, 'unavailable saved model never resumes a generation or falls back');
    await store.close(); missingB = false; store = await Store.open(options);
    const row = store.resolveSession(b.id);
    assert.equal(store.opened.has(b.id), true);
    const conversation = (await store.resolveAgent(b.id, 'main')).c;
    assert.deepEqual((await store.entries(conversation, undefined, 2000)).items.map(entry => entry.id), before);
    assert.deepEqual({ provider: row.provider, modelId: row.model }, reference);
  } finally {
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    await store?.close(); endpoint.closeAllConnections(); await new Promise(resolve => endpoint.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
});

test('one configured native registry executes original external tool families through scoped Models and loopback capabilities', { timeout: 30000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dpi-configured-tools-'));
  const work = join(directory, 'work'); await mkdir(work); await mkdir(join(directory, 'agent'));
  const trace = [], captured = new Map();
  const png = (() => {
    const chunk = (name, data) => {
      const kind = Buffer.from(name), size = Buffer.alloc(4), sum = Buffer.alloc(4);
      size.writeUInt32BE(data.length); sum.writeUInt32BE(crc32(Buffer.concat([kind, data])));
      return Buffer.concat([size, kind, data, sum]);
    };
    const header = Buffer.alloc(13); header.writeUInt32BE(1); header.writeUInt32BE(1, 4); header[8] = 8; header[9] = 6;
    return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header),
      chunk('IDAT', deflateSync(Buffer.from([0, 255, 0, 0, 255]))), chunk('IEND', Buffer.alloc(0))]).toString('base64');
  })();
  const fixtureKey = 'SYNTHETIC_CONFIGURED_TOOL_SECRET';
  const endpoint = createServer(async (request, response) => {
    let raw = ''; for await (const bytes of request) raw += bytes;
    const body = raw && request.headers['content-type']?.includes('application/json') ? JSON.parse(raw) : undefined;
    trace.push({ path: request.url, method: request.method, rpc: body?.method, key: request.headers.authorization });
    response.setHeader('content-type', 'application/json');
    if (request.url === '/mcp') {
      if (request.method === 'DELETE' || body?.id === undefined) { response.writeHead(202).end(); return; }
      if (body.method === 'initialize') response.setHeader('Mcp-Session-Id', 'configured-fixture-session');
      response.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: body.method === 'initialize'
        ? { protocolVersion: '2025-11-25', capabilities: { tools: {} }, serverInfo: { name: 'configured-context7', version: '1' } }
        : { content: [{ type: 'text', text: `Configured documentation ${fixtureKey}` }] } }));
    } else if (request.url === '/google') response.end(JSON.stringify({ text: `Configured grounded search ${fixtureKey}` }));
    else if (request.url === '/image') response.end(JSON.stringify({ images: [{ data: png, mimeType: 'image/png' }] }));
    else if (request.url.includes('/images/')) response.end(JSON.stringify({ data: [{ b64_json: png }] }));
    else if (request.url.startsWith('/web')) {
      response.setHeader('content-type', 'text/html');
      response.end('<html><body><main><h1>Configured web fixture</h1><p>Original page extraction remains usable.</p><div class="result"><a class="result__a" href="https://example.invalid/configured">Configured article</a><a class="result__snippet">Source snippet</a></div></main></body></html>');
    } else if (request.url.includes('/usage')) response.end(JSON.stringify({ email: 'PRIVATE_ACCOUNT', rate_limit: { primary_window: { used_percent: 12, reset_after_seconds: 30 } } }));
    else response.end(JSON.stringify({ results: [{ ref_id: 'turn0search0', title: 'Configured source', url: 'https://example.invalid/source' }] }));
  }).listen(0, '127.0.0.1');
  await once(endpoint, 'listening'); const base = `http://127.0.0.1:${endpoint.address().port}`;
  const rootReference = { provider: 'configured-faux', modelId: 'root' };
  const oauth = { type: 'oauth', access: `synthetic.${Buffer.from(JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: 'configured-fixture-account' } })).toString('base64url')}.fake`, refresh: 'fixture-never-refresh', expires: Date.now() + 3600000 };
  async function nativeModels() {
    const root = fauxProvider({ provider: rootReference.provider, models: [{ id: rootReference.modelId }], tokensPerSecond: 100000 });
    const codex = fauxProvider({ provider: 'openai-codex', api: 'openai-codex-responses', models: [{ id: 'configured-codex', input: ['text', 'image'] }], tokensPerSecond: 100000 });
    const runtime = await createNativeModels({ credentials: new InMemoryCredentialStore(), providers: [root.provider,
      { ...codex.provider, auth: { oauth: { name: 'Synthetic configured fixture', login: async () => oauth,
        refresh: async () => { throw Error('No fixture refresh'); }, toAuth: async value => ({ apiKey: value.access }) } } }] });
    await runtime.models.login('openai-codex', 'oauth', {});
    return { runtime, root, codex };
  }
  const menu = await nativeModels(); let sessionModels;
  const token = 'dpi_configured_tools_owner_token_abcdefghijklmnopqrstuvwxyz';
  const policy = new GrantPolicy([{ id: 'owner', token, actor: 'owner', source: 'terminal', authority: 'human', permissions: ['read', 'write', 'control', 'filesystem', 'human-accept'], binding: {} }]);
  const native = createNativeProfile({ policy, owner: policy.authenticate(token),
    models: { defaultModel: rootReference, catalogue: menu.runtime.catalogue,
      create: async () => { sessionModels = await nativeModels(); return sessionModels.runtime; } },
    skills: () => ({ projectRoot: work, homeDir: directory, agentDir: join(directory, 'agent'), projectTrusted: true }),
    context7: () => ({ endpoint: `${base}/mcp`, resolveCredential: () => fixtureKey }),
    web: () => ({ fetch: (_url, init) => fetch(`${base}/web`, init) }),
    antigravity: () => ({ resolveApiKey: async () => fixtureKey,
      search: async input => (await (await fetch(`${base}/google`, { method: 'POST', headers: { authorization: `Bearer ${input.apiKey}` }, body: JSON.stringify({ query: input.query }), signal: input.signal })).json()).text,
      image: async input => {
        const remote = await (await fetch(`${base}/image`, { method: 'POST', headers: { authorization: `Bearer ${input.apiKey}` }, body: JSON.stringify({ prompt: input.prompt }), signal: input.signal })).json();
        return { ...await saveGeneratedImages(input.cwd, input.path, remote.images), text: ['Configured image'], model: 'fixture-image' };
      },
    }),
    codex: () => ({ authorize: ({ conversationId }) => conversationId === 1,
      runtimeOptions: { fetch: (url, init) => { const parsed = new URL(String(url)); assert.equal(parsed.origin, 'https://chatgpt.com'); return fetch(base + parsed.pathname, init); }, deadlineMs: 5000 } }),
    connectMcp: async () => ({ sources: [], close: async () => {} }),
  });
  const profile = Object.assign(async context => { const value = await native(context); captured.set(context.sessionId, value); return value; }, { id: native.id, models: native.models, capabilities: native.capabilities });
  let store, server;
  try {
    store = await Store.open({ dataDir: join(directory, 'data'), startDirs: [work], name: 'configured tools', provider: 'faux', profile });
    server = createHttpServer(store, policy).listen(0, '127.0.0.1'); await once(server, 'listening');
    const client = new DpiClient(`http://127.0.0.1:${server.address().port}`, token);
    const session = await client.createSession({ cwd: work, name: 'configured tools', model: rootReference });
    const composition = captured.get(session.id);
    const names = composition.registry.snapshot().tools().map(value => value.tool.name);
    for (const name of ['read', 'write', 'edit', 'bash', 'search_history', 'web_search', 'web_fetch', 'batch_web_fetch', 'context7_resolve_library_id', 'context7_query_docs', 'google_search', 'generate_image', 'codex_ask', 'codex_search', 'codex_image', 'codex_usage']) assert.ok(names.includes(name), name);
    assert.equal(new Set(names).size, names.length, 'one native registration per tool');
    assert.ok(!composition.native.inventory.unavailable.some(item => /CodexHost|Context7 credential|Antigravity operations|provider\/auth|skills/.test(item)));
    const run = async (name, args) => {
      const tool = fauxToolCall(name, args);
      sessionModels.root.setResponses([fauxAssistantMessage(tool, { stopReason: 'toolUse' }), fauxAssistantMessage('Configured call completed.')]);
      if (name === 'codex_ask') sessionModels.codex.setResponses([fauxAssistantMessage('Configured native Codex answer')]);
      const outcome = await client.agent(session.id, 'main').send(`Configured ${name}`, 'followUp', `configured-${name}`, 10000);
      assert.equal(outcome.status, 'done');
      const entries = (await client.agent(session.id, 'main').entries()).items;
      const result = entries.find(entry => entry.kind === 'pi.tool-result' && entry.model?.some(message => message.role === 'toolResult' && message.toolCallId === tool.id));
      assert.ok(result, name);
      assert.ok(result.model.every(message => message.role !== 'toolResult' || !message.isError), `${name}: ${JSON.stringify(result)}`);
      assert.doesNotMatch(JSON.stringify(entries), /SYNTHETIC_CONFIGURED_TOOL_SECRET|PRIVATE_ACCOUNT/);
      assert.ok(!JSON.stringify(entries).includes(oauth.access));
      return JSON.stringify(result);
    };
    assert.match(await run('context7_resolve_library_id', { libraryName: 'fixture', query: 'fixture library' }), /Configured documentation/);
    assert.match(await run('context7_query_docs', { libraryId: '/fixture/v1', query: 'fixture docs' }), /Configured documentation/);
    assert.match(await run('google_search', { query: 'fixture' }), /grounded search/);
    assert.match(await run('generate_image', { prompt: 'fixture image', path: 'configured-image.png' }), /Saved image/);
    assert.match(await run('web_search', { searches: ['Configured article'] }), /Configured article/);
    assert.match(await run('web_fetch', { url: `${base}/web`, format: 'text' }), /Configured web fixture/);
    assert.match(await run('batch_web_fetch', { requests: [{ url: `${base}/web`, format: 'text' }] }), /Configured web fixture/);
    assert.match(await run('codex_ask', { prompt: 'Synthetic standalone', model: 'configured-codex', reasoning: 'off' }), /Configured native Codex answer/);
    assert.match(await run('codex_search', { search_query: [{ q: 'configured fixture' }] }), /Configured source/);
    assert.match(await run('codex_usage', {}), /12/);
    assert.match(await run('codex_image', { prompt: 'Synthetic configured image', output_path: 'configured-codex.png' }), /configured-codex.png/);
    assert.ok(trace.some(value => value.rpc === 'initialize')); assert.ok(trace.some(value => value.method === 'DELETE'));
    assert.ok(trace.some(value => value.path === '/image')); assert.ok(trace.some(value => value.path.includes('/usage')));
    assert.equal(sessionModels.codex.state.callCount, 1, 'exactly one synthetic native Codex request, no live model');
  } finally {
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    await store?.close(); endpoint.closeAllConnections(); await new Promise(resolve => endpoint.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
});
