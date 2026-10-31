import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, writeFile, readFile, symlink } from 'node:fs/promises';
import { existsSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { spawnSync } from 'node:child_process';
import { BACKGROUND_CONTEXT as ctx, withAbortSignal } from '@earendil-works/chord/context';
import { fauxProvider, fauxAssistantMessage, fauxText, fauxToolCall } from '@earendil-works/pi-ai/providers/faux';
import type { JsonValue } from '@earendil-works/chord';
import { ROOT_CONVERSATION_ID } from '@earendil-works/pi-durable';
import { NodeExecutionEnv } from '@earendil-works/pi-durable/env/node';
import { Store } from '../src/store.js';
import { createHttpServer } from '../src/http-server.js';
import { GrantPolicy, type GrantSpec } from '../src/grants.js';
import { minimalProfile, type RuntimeProfileContext, type RuntimeProfileFactory } from '../src/runtime-profile.js';
import { createNativeProfile } from '../src/native-profile/profile.js';
import { ExistingInputs } from '../src/native-profile/admission/input-policy.js';
import { ScheduleDoc } from '../src/native-profile/automation/schedules.js';
import { StreamableHttpTransport } from '@earendil-works/pi-mcp';
import { openSessionMail } from '../src/native-profile/memory/mail.js';
import { HindsightClient, resolveConfig } from '../src/native-profile/memory/session-memory.mjs';
import { DpiClient } from '../../dpi-sdk/src/client.js';
import { nativeRequestKey } from '../src/idempotency.js';
import { tempStore, faux } from './helpers.js';

const owner: GrantSpec = { id: 'operator', token: 'fixture-native-owner', actor: 'operator', source: 'terminal', authority: 'human',
  permissions: ['read', 'write', 'control', 'filesystem', 'human-accept'], binding: {} };

test('combined native Store/HTTP profile applies actual scoped policy, guards, nested CodeMode and persisted identities', { timeout: 40000 }, async () => {
  const temporary = await tempStore();
  const workspaceA = join(temporary.work, 'A');
  const workspaceB = join(temporary.work, 'B');
  await mkdir(workspaceA); await mkdir(workspaceB);
  await writeFile(join(workspaceA, 'allowed'), 'COMBINED_ALLOWED_SENTINEL');
  await writeFile(join(workspaceA, 'revoked'), 'COMBINED_REVOKED_PRIVATE_SENTINEL');
  await writeFile(join(workspaceB, 'allowed'), 'COMBINED_B_SENTINEL');
  await symlink(join(workspaceB, 'allowed'), join(workspaceA, 'escape'));
  const calls: string[] = [];
  const memoryCalls: Array<{ bank: string; path: string }> = [];
  const mailWorkspaces = new Map<string, string>();
  const contexts: Array<{ session: string; value: string }> = [];
  const envKeys = ['HINDSIGHT_LOG_FILE', 'HINDSIGHT_DIAG_FILE', 'HINDSIGHT_USAGE_FILE', 'AGENT_MAIL_AGENT', 'AGENT_MAIL_PROJECT'];
  const envBefore = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
  const closed: string[] = [];
  const blocked = new Set<string>();
  let authorizations = 0;
  const endpoint = createServer(async (req, res) => {
    const path = new URL(req.url!, 'http://127.0.0.1').pathname;
    const match = path.match(/^\/memory\/v1\/default\/banks\/([^/]+)(.*)$/);
    if (match) {
      const bank = decodeURIComponent(match[1]);
      assert.equal(req.headers.authorization, `Bearer fixture-memory-${bank}`);
      memoryCalls.push({ bank, path: match[2] });
      for await (const _chunk of req) { /* drain the fixture request only */ }
      res.setHeader('content-type', 'application/json');
      if (match[2] === '/memories/recall') res.end(JSON.stringify({ results: [{ text: `MEMORY_${bank}_ONLY` }] }));
      else if (match[2] === '/knowledge-base/tree') res.end(JSON.stringify({ roots: [{ id: `page-${bank}`, kind: 'page', name: bank, description: `PAGE_${bank}_ONLY` }] }));
      else if (match[2] === '/memories' && req.method === 'POST') res.end(JSON.stringify({ operation_id: `fixture-retain-${bank}-${memoryCalls.length}` }));
      else res.end('{}');
      return;
    }
    if (path === '/mcp') {
      if (req.method === 'GET') { res.writeHead(405); res.end(); return; }
      if (req.method === 'DELETE') { res.writeHead(204); res.end(); return; }
      let raw = ''; for await (const chunk of req) raw += chunk;
      const message = JSON.parse(raw);
      if (message.id === undefined) { res.writeHead(202); res.end(); return; }
      const session = String(req.headers['x-fixture-session']);
      res.setHeader('content-type', 'application/json'); res.setHeader('mcp-session-id', `fixture-${session}`);
      let result: unknown = {};
      if (message.method === 'initialize') result = { protocolVersion: '2025-11-25', capabilities: { tools: {} }, serverInfo: { name: 'combined-mail', version: '1' } };
      else if (message.method === 'tools/list') result = { tools: [{ name: 'fetch_inbox', inputSchema: { type: 'object', properties: { project_key: { type: 'string' }, agent_name: { type: 'string' } }, required: ['project_key', 'agent_name'] } }] };
      else if (message.method === 'tools/call') {
        assert.equal(message.params.arguments.project_key, mailWorkspaces.get(session));
        assert.equal(message.params.arguments.agent_name, session);
        calls.push(session); blocked.add(session);
        result = { content: [{ type: 'text', text: 'COMBINED_MCP_ALLOWED' }], structuredContent: { session } };
      }
      res.end(JSON.stringify({ jsonrpc: '2.0', id: message.id, result })); return;
    }
    res.writeHead(404); res.end('{}');
  }).listen(0, '127.0.0.1');
  await once(endpoint, 'listening');
  const address = endpoint.address(); assert.ok(address && typeof address === 'object');
  const build = (policy: GrantPolicy) => createNativeProfile({
    policy, owner: policy.authenticate(owner.token),
    resolveSkill: async () => { throw Error('No fixture skills configured'); },
    dcg: { binaryPath: join(temporary.root, 'deliberately-absent-dcg'), timeoutMs: 1000, envSource: () => ({}) },
    memory: context => {
      const cfg = resolveConfig({ apiUrl: `http://127.0.0.1:${address.port}/memory`, apiToken: `fixture-memory-${context.sessionId}`,
        serverMode: 'remote', autoInject: 'recall', autoSeed: false, autoUpdate: false, codebaseSurvey: false, gitIngest: 'none', manageBankConfig: false, retainSessions: true });
      const client = new HindsightClient({ apiUrl: cfg.apiUrl, apiToken: cfg.apiToken, bank: context.sessionId, project: context.cwd,
        log: message => appendFileSync(join(context.directory, 'memory', 'memory.log'), `${message}\n`, { mode: 0o600 }) });
      return {
        resolveBinding: cwd => { assert.equal(cwd, context.cwd); return { cfg, bankId: context.sessionId }; },
        resolveClient: binding => { assert.equal(binding.cwd, context.cwd); assert.equal(binding.bankId, context.sessionId); return client; },
        lifecycleEffects: { env: {}, hasGit: () => false, startSeed: () => { throw Error('UNEXPECTED_SEED'); }, startSurvey: () => { throw Error('UNEXPECTED_SURVEY'); } },
      };
    },
    connectMcp: async context => {
      mailWorkspaces.set(context.sessionId, context.cwd);
      const mail = await openSessionMail({
        project: context.cwd, agent: context.sessionId, allowedTools: ['fetch_inbox'],
        authorize: () => { authorizations++; if (blocked.has(context.sessionId)) throw Error('COMBINED_NESTED_REVOKED'); },
        transport: shellEnv => {
          assert.deepEqual(shellEnv, { AGENT_MAIL_AGENT: context.sessionId, AGENT_MAIL_PROJECT: context.cwd });
          return new StreamableHttpTransport({ url: `http://127.0.0.1:${address.port}/mcp`, headers: { 'x-fixture-session': context.sessionId } });
        },
      });
      return { sources: [mail.source], shellEnv: mail.shellEnv, close: async () => { closed.push(context.sessionId); await mail.close(); } };
    },
  });
  let policy = new GrantPolicy([owner]);
  let profile = build(policy);
  let store = await Store.open({ ...temporary.options, profile });
  let server: ReturnType<typeof createServer> | undefined;
  try {
    const A = await store.create({ name: 'A', cwd: workspaceA, model: faux });
    const B = await store.create({ name: 'B', cwd: workspaceB, model: faux });
    await store.close();
    assert.deepEqual(closed.sort(), [A.id, B.id].sort());
    const machine = (id: string, session: string): GrantSpec => ({ id, token: `fixture-${id}`, actor: id, source: 'iii', authority: 'delegated',
      permissions: ['read', 'write', 'control', 'human-accept'], binding: { sessionId: session, conversationId: 1 } });
    policy = new GrantPolicy([owner, machine('machine-A', A.id), machine('machine-B', B.id),
      { id: 'approve-only', token: 'fixture-approve-only', actor: 'reviewer', source: 'terminal', authority: 'human', permissions: ['read', 'human-accept'], binding: { sessionId: A.id, conversationId: 1 } }]);
    profile = build(policy);
    store = await Store.open({ ...temporary.options, profile });
    assert.equal(store.errors.size, 0);
    const scripted = fauxProvider({ provider: 'faux', models: [{ id: 'echo', contextWindow: 128000, maxTokens: 8192 }], tokensPerSecond: 100000 });
    store.models.setProvider(scripted.provider);
    let generations = 0;
    server = createHttpServer(store, policy).listen(0, '127.0.0.1');
    await once(server, 'listening');
    const http = server.address(); assert.ok(http && typeof http === 'object');
    const request = (path: string, token: string, body?: unknown) => fetch(`http://127.0.0.1:${http.port}/v1${path}`, {
      method: body ? 'POST' : 'GET', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const invoke = async (session: string, token: string, name: string, args: Record<string, JsonValue>, key: string, before?: () => void, agent: string | number = 'main') => {
      scripted.setResponses([
        modelContext => { generations++; contexts.push({ session, value: JSON.stringify(modelContext) }); before?.(); return fauxAssistantMessage(fauxToolCall(name, args), { stopReason: 'toolUse' }); },
        ...Array.from({ length: 8 }, () => () => { generations++; return fauxAssistantMessage(fauxText('combined complete')); }),
      ]);
      const response = await request(`/sessions/${session}/agents/${agent}/messages`, token, {
        requestId: key, content: key, waitMs: 10000,
        // None of these body fields are authority.
        actor: 'operator', authority: 'human', tools: ['bash'], policyReference: policy.reference(policy.authenticate(owner.token)),
      });
      const body = await response.json();
      const { c } = await store.resolveAgent(session, String(agent));
      const items = (await c.entries({}, 200, undefined, ctx)).items;
      return { response, body, items, entries: JSON.stringify(items) };
    };
    assert.deepEqual((await (await request('/protocol', 'fixture-machine-A')).json()).capabilities,
      ['events', 'docs', 'runtime-refresh.v1', 'profile-reload.v1', 'delegated-input.v1', 'profile-documents.v1', 'goal-operator.v1', 'native-parent-control.v1', 'native-bb-binding.v1', 'native-bb-outcome.v1', 'native-parent-target.v1', 'native-bb-input.v1', 'native-iii.v2']);
    const read = await invoke(A.id, 'fixture-machine-A', 'read', { path: 'allowed' }, 'native-read');
    assert.equal(read.response.status, 200, JSON.stringify(read.body));
    assert.match(read.entries, /COMBINED_ALLOWED_SENTINEL/);
    const a = await store.resolveAgent(A.id, 'main');
    assert.deepEqual(store.deviceInfo().models[0].supportedThinkingLevels, ['off']);
    assert.equal((await store.configure(a.row, a.c, { model: faux, thinkingLevel: 'xhigh' })).thinkingLevel, 'off');
    assert.deepEqual((await a.c.agent(ctx)).model, faux);
    const detail = await store.agentDetail(a.row, a.c);
    assert.ok(detail.documentKinds?.includes('bb.subagent-supervisor'));
    assert.ok(detail.documentKinds?.includes('durable-goals.runtime'));
    const sdk = new DpiClient(`http://127.0.0.1:${http.port}`, owner.token);
    const operator = sdk.agent(A.id, 'main');
    const beforeOperator = generations;
    const command = await operator.goalCommand('/goal status', 'operator-status');
    await a.h.waitForTask(command.taskId as import('@earendil-works/pi-durable').TaskId, withAbortSignal(AbortSignal.timeout(10000), ctx));
    const receipt = await operator.goalReceipt('operator-status');
    assert.equal(receipt.status, 'done'); assert.equal(typeof receipt.text, 'string');
    assert.equal((await operator.goalCommand('/goal status', 'operator-status')).taskId, command.taskId);
    await assert.rejects(() => operator.goalCommand('/goal list', 'operator-status'), error => (error as { code?: string }).code === 'conflict');
    assert.equal(generations, beforeOperator, 'operator status is never model input');
    assert.equal((await request(`/sessions/${A.id}/agents/main/goal/commands`, 'fixture-machine-A', { line: '/goal approve', requestId: 'forged-goal', authority: 'human' })).status, 403);
    assert.equal((await request(`/sessions/${A.id}/agents/main/goal/commands`, 'fixture-approve-only', { line: '/goal new {}', requestId: 'privilege-widening' })).status, 403);
    const otherConversation = await store.createAgent(a.row, { name: 'other-conversation' });
    assert.equal((await request(`/sessions/${A.id}/agents/${otherConversation.id}/goal/commands`, owner.token, { line: '/goal status', requestId: 'cross-goal' })).status, 403);
    const branchRead = await invoke(A.id, owner.token, 'read', { path: 'allowed' }, 'native-independent-conversation', undefined, otherConversation.id);
    assert.match(branchRead.entries, /COMBINED_ALLOWED_SENTINEL/);
    const history = await invoke(A.id, owner.token, 'search_history', { query: 'native-read' }, 'native-history');
    assert.ok(history.items.some(entry => entry.model?.some(message => message.role === 'toolResult' && message.toolName === 'search_history' && !message.isError)));
    const missingContext7 = await invoke(A.id, owner.token, 'context7_query_docs', { libraryId: '/fixture/local', query: 'fixture only' }, 'native-context7-missing');
    assert.match(missingContext7.entries, /Context7 credential is missing/);
    const key = nativeRequestKey('machine-A', 'message', 'native-read');
    const policies = await a.h.snapshot(ExistingInputs, a.c.id, ctx);
    assert.deepEqual(policies?.inputs[key], { workspace: workspaceA,
      policy: policy.reference(policy.authenticate('fixture-machine-A')), tools: ['read', 'contact_supervisor'] });
    const submission = await a.h.commit(tx => tx.submissionByRequest(a.c.id, key), ctx); assert.ok(submission);
    const denied = await invoke(A.id, 'fixture-machine-A', 'bash', { command: 'printf forbidden > machine-effect' }, 'native-denied');
    assert.match(denied.entries, /DELEGATED_INPUT_TOOL_DENIED/);
    assert.equal(existsSync(join(workspaceA, 'machine-effect')), false);
    const escape = await invoke(A.id, 'fixture-machine-A', 'read', { path: 'escape' }, 'native-symlink');
    assert.match(escape.entries, /BRIDGE_READ_DENIED/);
    assert.ok(!escape.entries.includes('COMBINED_B_SENTINEL'));
    assert.equal((await request(`/sessions/${B.id}/agents/main/messages`, 'fixture-machine-A', { content: 'cross', requestId: 'cross' })).status, 403);
    assert.equal((await request(`/sessions/${A.id}/agents/main/abort`, 'fixture-machine-A', {})).status, 403);
    const guarded = await invoke(A.id, owner.token, 'bash', { command: 'printf forbidden > human-effect' }, 'native-dcg');
    assert.match(guarded.entries, /DCG_UNAVAILABLE/);
    assert.equal(existsSync(join(workspaceA, 'human-effect')), false);
    authorizations = 0;
    const call = `tools.mcp__mcp_agent_mail__fetch_inbox(${JSON.stringify({ project_key: workspaceA, agent_name: A.id })})`;
    const code = `text(await ${call}); try { await ${call}; text("BAD_SECOND_EFFECT"); } catch(e) { text(e.message); }`;
    const nested = await invoke(A.id, owner.token, 'codemode', { code }, 'native-nested');
    assert.match(nested.entries, /COMBINED_NESTED_REVOKED/);
    assert.deepEqual(calls, [A.id]); assert.equal(authorizations, 2);
    const schedule = await invoke(A.id, owner.token, 'schedule', { action: 'add', when: 'in 1h', message: 'fixture future only' }, 'native-schedule');
    assert.equal(schedule.response.status, 200, JSON.stringify(schedule.body));
    const schedules = await a.h.snapshot(ScheduleDoc, a.c.id, ctx);
    assert.equal(Object.keys(schedules?.items ?? {}).length, 1);
    const revoked = await invoke(A.id, 'fixture-machine-A', 'read', { path: 'revoked' }, 'native-revoked', () => { policy.revoke('machine-A'); });
    assert.equal(revoked.response.status, 401);
    assert.match(revoked.entries, /DELEGATED_INPUT_POLICY_REVOKED/);
    assert.ok(!revoked.entries.includes('COMBINED_REVOKED_PRIVATE_SENTINEL'));
    const before = generations;
    assert.equal((await request(`/sessions/${A.id}/agents/main/messages`, 'fixture-machine-A', { content: 'again', requestId: 'after-revoke' })).status, 401);
    assert.equal(generations, before);
    const other = await invoke(B.id, 'fixture-machine-B', 'read', { path: 'allowed' }, 'native-other');
    assert.equal(other.response.status, 200); assert.match(other.entries, /COMBINED_B_SENTINEL/);
    assert.equal((await request(`/sessions/${A.id}/agents/main/docs/durable.schedules`, owner.token)).status, 200);
    assert.equal((await request(`/sessions/${A.id}/agents/main/docs/constructor`, owner.token)).status, 404);
    server.closeAllConnections(); await new Promise<void>(resolve => server!.close(() => resolve())); server = undefined;
    await store.configure(a.row, a.c, { readOnly: true });
    assert.ok((await store.agentDetail(a.row, a.c)).tools.filter(tool => tool.offered).every(tool => ['read', 'contact_supervisor', 'search_history', 'context7_resolve_library_id', 'context7_query_docs', 'google_search'].includes(tool.name)));
    await store.configure(a.row, a.c, { readOnly: false });
    const savedPolicies = await a.h.snapshot(ExistingInputs, a.c.id, ctx);
    blocked.clear();
    await store.close();
    store = await Store.open({ ...temporary.options, profile });
    assert.equal(store.errors.size, 0);
    const reopened = await store.resolveAgent(A.id, 'main');
    assert.deepEqual(await reopened.h.snapshot(ExistingInputs, reopened.c.id, ctx), savedPolicies);
    assert.deepEqual(await reopened.h.snapshot(ScheduleDoc, reopened.c.id, ctx), schedules);
    const handle = policy.authenticate(owner.token);
    const operatorReceipt = await store.goalReceipt(reopened.row, reopened.c, 'operator-status', { actor: owner.actor, source: owner.source, authority: owner.authority,
      policyReference: policy.reference(handle), assertCurrent: () => { policy.assert(handle, 'human-accept', { sessionId: A.id, conversationId: 1 }); } });
    assert.equal(operatorReceipt.taskId, command.taskId); assert.equal(operatorReceipt.status, 'done');
    assert.equal((await reopened.h.commit(tx => tx.submissionByRequest(reopened.c.id, key), ctx))?.id, submission.id);
    assert.equal(generations, before + 2, 'reopen must not replay settled generations or the future schedule');
    assert.ok(memoryCalls.some(call => call.bank === A.id && call.path === '/memories/recall'));
    assert.ok(memoryCalls.some(call => call.bank === B.id && call.path === '/memories/recall'));
    assert.ok(memoryCalls.some(call => call.path === '/memories'), 'actual retained memory must drain before native close');
    for (const [session, foreign] of [[A.id, B.id], [B.id, A.id]]) {
      const ownContexts = contexts.filter(item => item.session === session).map(item => item.value).join('\n');
      assert.ok(ownContexts.includes(`MEMORY_${session}_ONLY`));
      assert.ok(!ownContexts.includes(`MEMORY_${foreign}_ONLY`));
    }
    assert.deepEqual(Object.fromEntries(envKeys.map(key => [key, process.env[key]])), envBefore);
    assert.equal(await readFile(join(workspaceA, 'revoked'), 'utf8'), 'COMBINED_REVOKED_PRIVATE_SENTINEL');
  } finally {
    if (server) { server.closeAllConnections(); await new Promise<void>(resolve => server!.close(() => resolve())); }
    await store.close();
    endpoint.closeAllConnections(); await new Promise<void>(resolve => endpoint.close(() => resolve()));
    await temporary.cleanup();
  }
});

test('native execution env excludes server credentials and foreign globals while preserving explicit session vars', async () => {
  const temporary = await tempStore();
  try {
    const script = `
      import assert from 'node:assert/strict';
      import {SessionExecutionEnv,baseShellEnv} from './src/session-env.ts';
      import {BACKGROUND_CONTEXT as ctx} from '@earendil-works/chord/context';
      const make=name=>new SessionExecutionEnv({cwd:process.cwd(),shellEnv:{...baseShellEnv(),HINDSIGHT_LOG_FILE:name,AGENT_MAIL_AGENT:name}});
      const a=make('session-A'),b=make('session-B');
      async function probe(env){
        let output='';
        const result=await env.exec([process.execPath,'-e','console.log(JSON.stringify({tokenAbsent:!process.env.DPI_TOKEN,log:process.env.HINDSIGHT_LOG_FILE,agent:process.env.AGENT_MAIL_AGENT,explicit:process.env.EXPLICIT}))'],{inheritEnv:true,env:{EXPLICIT:'admitted'},onOutput:text=>output+=text},ctx);
        assert.equal(result.ok,true);
        return JSON.parse(output);
      }
      try {
        const first=await probe(a);await a.cleanup(ctx);const second=await probe(b);
        assert.deepEqual(first,{tokenAbsent:true,log:'session-A',agent:'session-A',explicit:'admitted'});
        assert.deepEqual(second,{tokenAbsent:true,log:'session-B',agent:'session-B',explicit:'admitted'});
        assert.equal(process.env.DPI_TOKEN,'fixture-host-token');assert.equal(process.env.HINDSIGHT_LOG_FILE,'foreign-session');
        console.log('SESSION_ENV_PASS');
      }finally{await a.cleanup(ctx);await b.cleanup(ctx);}
    `;
    const result = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', script], {
      cwd: join(import.meta.dirname, '..'), encoding: 'utf8', timeout: 10000,
      env: { PATH: process.env.PATH ?? '', HOME: temporary.root, TMPDIR: temporary.root, DPI_TOKEN: 'fixture-host-token', HINDSIGHT_LOG_FILE: 'foreign-session' },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /SESSION_ENV_PASS/);
  } finally { await temporary.cleanup(); }
});

test('Store awaits async profile binding before resume and cleans native ownership after normal and failed bind', { timeout: 20000 }, async () => {
  const temporary = await tempStore();
  const trace: string[] = [];
  let fail = false;
  const profile: RuntimeProfileFactory = Object.assign(async (context: RuntimeProfileContext) => {
    trace.push('factory');
    let host: import('@earendil-works/pi-durable').Harness | undefined;
    class BoundEnvironment extends NodeExecutionEnv {
      override async exec(...args: Parameters<NodeExecutionEnv['exec']>): ReturnType<NodeExecutionEnv['exec']> {
        trace.push('exec'); assert.ok(host, 'execution effects start only after bind');
        return super.exec(...args);
      }
    }
    return { ...minimalProfile(context),
      protectsExecution: async (id: import('@earendil-works/pi-durable').ConversationId) => { assert.equal(id, ROOT_CONVERSATION_ID); trace.push('protect'); return true; },
      env: () => new BoundEnvironment({ cwd: context.cwd }),
      bind: async (h: import('@earendil-works/pi-durable').Harness) => {
        host = h; trace.push('bind');
        assert.ok(await h.commit(tx => tx.conversation(ROOT_CONVERSATION_ID), ctx));
        if (fail) throw Error('fixture bind failure');
      },
      shutdown: async () => { trace.push('shutdown'); assert.ok(await host!.commit(tx => tx.conversation(ROOT_CONVERSATION_ID), ctx)); },
      cleanup: async () => { trace.push('cleanup'); await assert.rejects(() => host!.commit(tx => tx.conversation(ROOT_CONVERSATION_ID), ctx)); },
    };
  }, { id: 'lifecycle-fixture@1' });
  let store = await Store.open({ ...temporary.options, profile });
  try {
    const session = await store.create({ name: 'lifecycle', cwd: temporary.work, model: faux });
    const { c } = await store.resolveAgent(session.id, 'main');
    const submission = await store.send(c, { content: '!pwd', requestId: 'env-fixture' });
    assert.equal((await submission.wait(withAbortSignal(AbortSignal.timeout(10000), ctx))).status, 'done');
    assert.ok(trace.includes('exec') && trace.indexOf('bind') < trace.indexOf('exec'));
    await assert.rejects(() => store.abort(c, false, store.resolveSession(session.id)), /Native Goal protects/);
    assert.ok(trace.includes('protect'));
    await store.close();
    assert.ok(trace.indexOf('shutdown') < trace.indexOf('cleanup'));
    store = await Store.open({ ...temporary.options, profile });
    fail = true;
    await assert.rejects(() => store.create({ name: 'failed-bind', cwd: temporary.work, model: faux }), { code: 'internal', status: 500, message: 'Session initialization failed' });
    assert.deepEqual(trace.slice(-2), ['shutdown', 'cleanup']);
    fail = false;
    await store.close();
    store = await Store.open({ ...temporary.options, profile });
    assert.equal(store.errors.size, 0, 'failed bind must not strand the native storage owner lock');
  } finally { await store.close(); await temporary.cleanup(); }
});
