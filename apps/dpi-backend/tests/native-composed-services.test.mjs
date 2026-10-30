import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Same retained body can target the real packed package, without copying its code or opening another Harness.
const backend = process.env.DPI_COMPOSITION_BACKEND ?? resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packed = Boolean(process.env.DPI_COMPOSITION_BACKEND);
const dependencyRoot = packed ? dirname(backend) : join(backend, 'node_modules');
const dependency = name => import(pathToFileURL(join(dependencyRoot, name)).href);
const moduleAt = name => import(pathToFileURL(join(backend, packed ? 'dist/dpi-backend/src' : 'src', name)).href);
const [{ Store }, { GrantPolicy }, { createNativeProfile, HindsightClient, resolveConfig, openSessionMail }, { StreamableHttpTransport }, faux, { BACKGROUND_CONTEXT: ctx, withAbortSignal }] = await Promise.all([
  moduleAt(packed ? 'store.js' : 'store.ts'), moduleAt(packed ? 'grants.js' : 'grants.ts'),
  moduleAt(packed ? 'native-profile/profile.js' : 'native-profile/profile.ts'), dependency('@earendil-works/pi-mcp/dist/index.js'),
  dependency('@earendil-works/pi-ai/dist/providers/faux.js'), dependency('@earendil-works/chord/dist/context/index.js'),
]);
const token = 'composed-owner-fixture';
const spec = { id: 'owner', token, actor: 'fixture-owner', source: 'terminal', authority: 'human',
  permissions: ['read', 'write', 'control', 'filesystem', 'human-accept'], binding: {} };
const until = async predicate => {
  const end = Date.now() + 5000;
  while (!await predicate()) {
    assert.ok(Date.now() < end, 'bounded local integration observation');
    await new Promise(resolve => setTimeout(resolve, 10));
  }
};

test('actual composed Store isolates per-session Mail/MCP and Hindsight, rechecks nested grants, and closes only its own services', { timeout: 45000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'dpi-composed-services-'));
  const policy = new GrantPolicy([spec]);
  const owner = policy.authenticate(token);
  const envKeys = ['AGENT_MAIL_AGENT', 'AGENT_MAIL_PROJECT', 'HINDSIGHT_LOG_FILE', 'HINDSIGHT_DIAG_FILE', 'HINDSIGHT_USAGE_FILE'];
  const envBefore = envKeys.map(key => process.env[key]);
  const calls = [], closed = [], traces = [], compositions = new Map(), identities = new Map();
  const endpoint = createServer(async (request, response) => {
    let raw = ''; for await (const bytes of request) raw += bytes;
    response.setHeader('content-type', 'application/json');
    if (request.url.startsWith('/mcp/')) {
      const id = request.url.slice('/mcp/'.length), identity = identities.get(id);
      assert.ok(identity);
      if (request.method === 'DELETE') { closed.push(`mail:${id}`); response.writeHead(204).end(); return; }
      if (request.method === 'GET') { response.writeHead(405).end(); return; }
      const rpc = JSON.parse(raw);
      if (rpc.id === undefined) { response.writeHead(202).end(); return; }
      response.setHeader('mcp-session-id', `composed-${id}`);
      let result;
      if (rpc.method === 'initialize') result = { protocolVersion: '2025-11-25', capabilities: { tools: {} }, serverInfo: { name: 'local-mail', version: '1' } };
      else if (rpc.method === 'tools/list') result = { tools: ['send_message', 'fetch_inbox', 'not_approved'].map(name => ({ name,
        inputSchema: { type: 'object', properties: { project_key: { type: 'string' }, sender_name: { type: 'string' }, agent_name: { type: 'string' }, sender_token: { type: 'string' }, revoke: { type: 'boolean' } }, required: ['project_key'] } })) };
      else if (rpc.method === 'tools/call') {
        const args = rpc.params.arguments;
        assert.equal(args.project_key, identity.work);
        assert.equal(args.sender_name ?? args.agent_name, id);
        if (rpc.params.name === 'send_message') assert.equal(args.sender_token, `registration-${id}`);
        assert.notEqual(rpc.params.name, 'not_approved');
        calls.push({ kind: 'mail', id, args });
        if (args.revoke) identity.mailPolicy.revoke('mail');
        result = { content: [{ type: 'text', text: `MAIL_ONLY_${id}` }], structuredContent: { id, marker: `MAIL_ONLY_${id}` } };
      } else result = {};
      response.end(JSON.stringify({ jsonrpc: '2.0', id: rpc.id, result })); return;
    }
    if (['/memory/version', '/memory/v1/version'].includes(request.url)) { response.end(JSON.stringify({ version: 'local-fixture' })); return; }
    const match = request.url.match(/^\/memory\/v1\/default\/banks\/([^/]+)(.*)$/);
    if (!match) { response.writeHead(404).end('{}'); assert.fail(`Unexpected local fixture route: ${request.url}`); }
    const id = decodeURIComponent(match[1]);
    assert.equal(request.headers.authorization, `Bearer memory-${id}`);
    const body = raw ? JSON.parse(raw) : null;
    calls.push({ kind: 'memory', id, path: match[2], body });
    if (match[2] === '/memories/recall') response.end(JSON.stringify({ results: [{ text: `MEMORY_ONLY_${id}` }] }));
    else if (match[2] === '/knowledge-base/tree') response.end(JSON.stringify({ roots: [{ id: `kp-${id}`, kind: 'page', name: `PAGE_ONLY_${id}`, description: 'Local recording fixture' }] }));
    else if (match[2] === '/memories' && request.method === 'POST') response.end(JSON.stringify({ operation_id: `retain-${id}-${calls.length}` }));
    else response.end('{}');
  }).listen(0, '127.0.0.1');
  await once(endpoint, 'listening');
  const base = `http://127.0.0.1:${endpoint.address().port}`;
  const native = createNativeProfile({ policy, owner,
    connectMcp: async context => {
      const mailPolicy = new GrantPolicy([{ ...spec, id: 'mail', token: `mail-${context.sessionId}`, binding: { sessionId: context.sessionId, conversationId: 1 } }]);
      const handle = mailPolicy.authenticate(`mail-${context.sessionId}`);
      identities.set(context.sessionId, { work: context.cwd, mailPolicy });
      const mail = await openSessionMail({ project: context.cwd, agent: context.sessionId, registrationToken: `registration-${context.sessionId}`,
        allowedTools: ['send_message', 'fetch_inbox'], authorize: () => mailPolicy.assert(handle, 'write', { sessionId: context.sessionId, conversationId: 1 }),
        transport: () => new StreamableHttpTransport({ url: `${base}/mcp/${context.sessionId}` }) });
      return { sources: [mail.source], shellEnv: mail.shellEnv, close: () => mail.close() };
    },
    memory: context => {
      const cfg = resolveConfig({ apiUrl: `${base}/memory`, apiToken: `memory-${context.sessionId}`, serverMode: 'remote',
        autoInject: 'recall', autoSeed: false, autoUpdate: false, codebaseSurvey: false, gitIngest: 'none', manageBankConfig: false, retainSessions: true });
      return { resolveBinding: cwd => { assert.equal(cwd, context.cwd); return { cfg, bankId: context.sessionId }; },
        resolveClient: binding => new HindsightClient({ apiUrl: cfg.apiUrl, apiToken: cfg.apiToken, bank: binding.bankId, project: binding.cwd, log() {} }),
        lifecycleEffects: { env: {}, hasGit: () => false, startSeed() { assert.fail('No git seed'); }, startSurvey() { assert.fail('No survey'); } } };
    },
    tracing: context => ({ sdk: { start(name, type, input) {
      const record = { session: context.sessionId, name, type, input, updates: [], ended: false }; traces.push(record);
      return { update(value) { record.updates.push(value); }, end() { record.ended = true; } };
    }, async flush() {}, async close() { closed.push(`tracing:${context.sessionId}`); } } }),
  });
  const profile = Object.assign(async context => {
    const value = await native(context); compositions.set(context.sessionId, value); return value;
  }, { id: native.id, capabilities: native.capabilities });
  let store;
  try {
    const workA = join(root, 'A'), workB = join(root, 'B'); await Promise.all([mkdir(workA), mkdir(workB)]);
    store = await Store.open({ dataDir: join(root, 'data'), startDirs: [workA, workB], name: 'composed local services', provider: 'faux', profile });
    const reference = { provider: 'faux', modelId: 'echo' };
    const scripted = faux.fauxProvider({ provider: reference.provider, models: [{ id: reference.modelId, contextWindow: 128000, maxTokens: 8192 }], tokensPerSecond: 100000 });
    store.models.setProvider(scripted.provider);
    const A = await store.create({ cwd: workA, name: 'A', model: reference });
    const B = await store.create({ cwd: workB, name: 'B', model: reference });
    const send = async (s, requestId, call) => {
      scripted.setResponses([...(call ? [faux.fauxAssistantMessage(faux.fauxToolCall(call.name, call.args), { stopReason: 'toolUse' })] : []), faux.fauxAssistantMessage(`PRIVATE_ANSWER_${s.id}`)]);
      const { c } = await store.resolveAgent(s.id, 'main');
      const submission = await store.send(c, { content: `PRIVATE_PROMPT_${s.id}:${requestId}`, whenBusy: 'followUp', requestId }, {
        actor: spec.actor, source: spec.source, authority: spec.authority,
        assertCurrent: () => policy.assert(owner, 'write', { sessionId: s.id, conversationId: c.id }),
      }, store.resolveSession(s.id));
      const result = await submission.wait(withAbortSignal(AbortSignal.timeout(10000), ctx));
      assert.equal(result.status, 'done');
      return JSON.stringify((await c.entries({}, 200, undefined, ctx)).items);
    };
    const script = (s, body) => ({ name: 'codemode', args: { code: body ?? `text(await tools.mcp__mcp_agent_mail__send_message(${JSON.stringify({ project_key: s.cwd, sender_name: s.id, sender_token: 'spoofed' })}));` } });
    for (const s of [A, B]) {
      const composition = compositions.get(s.id), snapshot = composition.registry.snapshot();
      const names = snapshot.tools().map(({ tool }) => tool.name);
      assert.equal(new Set(names).size, names.length);
      for (const name of ['read', 'codemode', 'schedule', 'repo_watch', 'watch_pr', 'subagent', 'goal', 'hindsight_list_knowledge_pages', 'mcp__mcp_agent_mail__send_message']) assert.ok(names.includes(name), name);
      assert.ok(!names.includes('mcp__mcp_agent_mail__not_approved'));
      assert.ok(composition.native.inventory.present.includes('MCP:mcp-agent-mail'));
      assert.ok(composition.native.inventory.present.includes('session-local native Hindsight'));
      assert.ok(composition.native.inventory.present.includes('session-local metadata-only Langfuse'));
      assert.ok(composition.native.inventory.unavailable.includes('GitHub trigger transport explicitly unconfigured'));
      const transcript = await send(s, 'mail', script(s));
      assert.ok(transcript.includes(`MAIL_ONLY_${s.id}`), JSON.stringify(JSON.parse(transcript).filter(entry => entry.kind === 'pi.tool-result'))); assert.ok(transcript.includes(`MEMORY_ONLY_${s.id}`));
      const pages = await send(s, 'pages', { name: 'hindsight_list_knowledge_pages', args: {} });
      assert.ok(pages.includes(`PAGE_ONLY_${s.id}`));
      assert.ok(!transcript.includes(`registration-${s.id}`)); assert.ok(!transcript.includes(`memory-${s.id}`));
    }
    const count = calls.filter(call => call.kind === 'mail').length;
    const wrong = await send(B, 'foreign-project', script(B, `text(await tools.mcp__mcp_agent_mail__fetch_inbox(${JSON.stringify({ project_key: workA, agent_name: A.id })}));`));
    assert.match(wrong, /project mismatch/); assert.equal(calls.filter(call => call.kind === 'mail').length, count);
    const forged = await send(B, 'foreign-actor', script(B, `text(await tools.mcp__mcp_agent_mail__fetch_inbox(${JSON.stringify({ project_key: workB, agent_name: A.id })}));`));
    assert.match(forged, /identity mismatch/); assert.equal(calls.filter(call => call.kind === 'mail').length, count);
    await store.archive(store.resolveSession(A.id));
    assert.ok(closed.includes(`mail:${A.id}`)); assert.ok(closed.includes(`tracing:${A.id}`));
    assert.ok(!closed.includes(`mail:${B.id}`)); assert.ok(!closed.includes(`tracing:${B.id}`));
    assert.ok((await send(B, 'after-A-close', script(B))).includes(`MAIL_ONLY_${B.id}`));
    const beforeRevoke = calls.filter(call => call.kind === 'mail').length;
    const revoke = { project_key: workB, sender_name: B.id, revoke: true };
    const second = { project_key: workB, agent_name: B.id };
    await send(B, 'nested-revoke', script(B, `await tools.mcp__mcp_agent_mail__send_message(${JSON.stringify(revoke)}); text(await tools.mcp__mcp_agent_mail__fetch_inbox(${JSON.stringify(second)}));`));
    assert.equal(calls.filter(call => call.kind === 'mail').length, beforeRevoke + 1, 'native CodeMode rechecks current source grant on its second nested call');
    await until(() => [A, B].every(s => calls.some(call => call.kind === 'memory' && call.id === s.id && call.path === '/memories')));
    for (const s of [A, B]) {
      const other = s.id === A.id ? B.id : A.id;
      const ownMemory = calls.filter(call => call.kind === 'memory' && call.id === s.id);
      assert.ok(ownMemory.some(call => JSON.stringify(call.body).includes(`PRIVATE_PROMPT_${s.id}`)));
      assert.ok(ownMemory.every(call => !JSON.stringify(call.body).includes(`PRIVATE_PROMPT_${other}`)));
    }
    assert.ok(traces.some(t => t.type === 'tool') && traces.some(t => t.type === 'generation'));
    assert.doesNotMatch(JSON.stringify(traces), /PRIVATE_|registration-|memory-/);
    assert.deepEqual(envKeys.map(key => process.env[key]), envBefore);
    console.log(JSON.stringify({ candidate: backend, mode: packed ? 'installed' : 'source', sessions: 2, connections: 2,
      mailCalls: calls.filter(call => call.kind === 'mail').length, memoryBanks: [...new Set(calls.filter(call => call.kind === 'memory').map(call => call.id))].length,
      nestedRevokePrevented: true, identitySpoofPrevented: true, sessionCloseIsolated: true, metadataOnly: true,
      definitions: compositions.get(B.id).registry.snapshot().installed().map(extension => extension.name).sort() }));
  } finally {
    await store?.close(); endpoint.closeAllConnections(); await new Promise(resolve => endpoint.close(resolve));
    await rm(root, { recursive: true, force: true });
  }
});

test('composed tracing SDK failure is nonfatal and reports no private exception payload', { timeout: 20000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'dpi-composed-tracing-failure-'));
  const policy = new GrantPolicy([spec]); const reports = []; let calls = 0, closed = 0, store;
  const profile = createNativeProfile({ policy, owner: policy.authenticate(token), connectMcp: async () => ({ sources: [], close: async () => {} }),
    tracing: () => ({ sdk: { start() { calls++; throw Error('PRIVATE_SDK_EXCEPTION'); }, async flush() {}, async close() { closed++; } }, report: error => reports.push(error.message) }) });
  try {
    const work = join(root, 'work'); await mkdir(work);
    store = await Store.open({ dataDir: join(root, 'data'), startDirs: [work], name: 'tracing failure', provider: 'faux', profile });
    const provider = faux.fauxProvider({ provider: 'faux', models: [{ id: 'echo' }], tokensPerSecond: 100000 });
    store.models.setProvider(provider.provider);
    const row = await store.create({ cwd: work, name: 'failure', model: { provider: 'faux', modelId: 'echo' } });
    const { c } = await store.resolveAgent(row.id, 'main');
    for (let i = 0; i < 2; i++) {
      provider.setResponses([faux.fauxAssistantMessage('PRIVATE_ANSWER')]);
      const submission = await store.send(c, { content: 'PRIVATE_PROMPT', whenBusy: 'followUp', requestId: `failure-${i}` }, {
        actor: spec.actor, source: spec.source, authority: spec.authority,
        assertCurrent: () => policy.assert(policy.authenticate(token), 'write', { sessionId: row.id, conversationId: 1 }),
      }, row);
      assert.equal((await submission.wait(withAbortSignal(AbortSignal.timeout(10000), ctx))).status, 'done');
    }
    assert.equal(calls, 1, 'failed SDK disabled rather than retried per generation');
    assert.deepEqual(reports, ['Langfuse tracing unavailable; agent execution is unaffected']);
    await store.close(); store = undefined; assert.equal(closed, 1);
  } finally { await store?.close(); await rm(root, { recursive: true, force: true }); }
});

test('GitHub transport rechecks the current root grant before each subsequent asynchronous GET', async () => {
  const { createGitHubTriggerCapabilities } = await moduleAt('native-profile/automation/github-triggers.mjs');
  const policy = new GrantPolicy([spec]), handle = policy.authenticate(token), reads = [];
  const capabilities = createGitHubTriggerCapabilities({ env: { HOME: '/scratch/home', GH_CONFIG_DIR: '/scratch/home/gh', GH_TOKEN: 'synthetic-only' },
    authorizeRoot(id) {
      try { return policy.assert(handle, 'human-accept', { conversationId: id }).authority === 'human'; }
      catch { return false; }
    },
    execFile(command, args, options, callback) {
      assert.equal(command, 'gh'); assert.equal(options.shell, false);
      const endpoint = args[5]; reads.push(endpoint);
      const response = endpoint === 'user' ? { id: 1, login: 'fixture' }
        : endpoint === 'repos/fixture/project' ? { full_name: 'fixture/project', permissions: { push: true } } : [];
      queueMicrotask(() => { if (endpoint === 'user') policy.revoke('owner'); callback(null, JSON.stringify(response), ''); });
      return { kill() {} };
    },
  });
  await assert.rejects(capabilities.provider.poll({ mode: 'repo', repo: 'fixture/project', events: ['issues'], since: Date.now() - 1000,
    maxEvents: 1, maxBytes: 4096 }), /GitHub read-only trigger unavailable or denied/);
  assert.deepEqual(reads, ['user'], 'no further credential-bearing GET may start after current operator revocation');
});
