import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { appendFileSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BACKGROUND_CONTEXT as ctx, withAbortSignal } from '@earendil-works/chord/context';
import { createModels } from '@earendil-works/pi-ai/models';
import { fauxProvider, fauxAssistantMessage, fauxToolCall, fauxText } from '@earendil-works/pi-ai/providers/faux';
import { Harness, createRegistry } from '@earendil-works/pi-durable';
import { NodeExecutionEnv } from '@earendil-works/pi-durable/env/node';
import { openNodeSqliteStorage } from '@earendil-works/pi-durable/storage/sqlite/node';
import { StreamableHttpTransport } from '@earendil-works/pi-mcp';
import { createMcpCodemodeExtension } from '/tmp/dpi-packed-dUBp45/install/node_modules/dpi-backend/dist/dpi-backend/src/native-profile/guards/mcp-codemode.js';
import { createSessionMemory, HindsightClient, resolveConfig } from '/tmp/dpi-packed-dUBp45/install/node_modules/dpi-backend/dist/dpi-backend/src/native-profile/memory/session-memory.mjs';
import { openSessionMail } from '/tmp/dpi-packed-dUBp45/install/node_modules/dpi-backend/dist/dpi-backend/src/native-profile/memory/mail.js';

const envKeys = ['HINDSIGHT_LOG_FILE', 'HINDSIGHT_DIAG_FILE', 'HINDSIGHT_USAGE_FILE', 'AGENT_MAIL_AGENT', 'AGENT_MAIL_PROJECT'];

test('missing explicit memory resolvers refuses instead of using private config defaults', async () => {
  await assert.rejects(() => createSessionMemory(createRegistry(), { directory: '/not-used-with-missing-resolvers' }), /EXPLICIT_MEMORY_BINDING_AND_CLIENT_REQUIRED/);
});

test('two actual native Hindsight/Mail sessions isolate context, log paths, identities and close without global mutation', { timeout: 30000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'dpi-native-memory-'));
  const beforeEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
  const calls = [];
  const sessions = [];
  const endpoint = createServer(async (request, response) => {
    let raw = '';
    for await (const chunk of request) raw += chunk;
    const url = new URL(request.url, 'http://127.0.0.1');
    response.setHeader('content-type', 'application/json');
    if (url.pathname === '/mcp') {
      if (request.method === 'GET') { response.writeHead(405); response.end(); return; }
      if (request.method === 'DELETE') { response.writeHead(204); response.end(); return; }
      const message = JSON.parse(raw);
      if (message.id === undefined) { response.writeHead(202); response.end(); return; }
      const actor = request.headers['x-fixture-agent'];
      response.setHeader('mcp-session-id', `session-${actor}`);
      let result;
      if (message.method === 'initialize') result = { protocolVersion: '2025-11-25', capabilities: { tools: {} }, serverInfo: { name: 'recording-mail', version: '1' } };
      else if (message.method === 'tools/list') result = { tools: ['fetch_inbox', 'send_message'].map(name => ({
        name, inputSchema: { type: 'object', properties: { project_key: { type: 'string' }, agent_name: { type: 'string' }, sender_name: { type: 'string' }, sender_token: { type: 'string' } }, required: ['project_key'] },
      })) };
      else if (message.method === 'tools/call') {
        const args = message.params.arguments;
        calls.push({ kind: 'mail', actor, name: message.params.name, args });
        if (message.params.name === 'send_message') assert.equal(args.sender_token, `registration-${actor}-fixture`);
        assert.equal(args.project_key, join(root, actor, 'work'));
        assert.equal(args.agent_name ?? args.sender_name, actor);
        result = { content: [{ type: 'text', text: `MAIL_${actor}_ONLY` }], structuredContent: { actor } };
      } else result = {};
      response.end(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }));
      return;
    }
    const match = url.pathname.match(/^\/memory\/v1\/default\/banks\/([^/]+)(.*)$/);
    if (!match) { response.writeHead(404); response.end('{}'); return; }
    const bank = decodeURIComponent(match[1]);
    assert.equal(request.headers.authorization, `Bearer memory-${bank}-fixture`);
    calls.push({ kind: 'memory', bank, path: match[2], body: raw ? JSON.parse(raw) : undefined });
    if (match[2] === '/memories/recall') response.end(JSON.stringify({ results: [{ text: `MEMORY_${bank}_ONLY` }] }));
    else if (match[2] === '/knowledge-base/tree') response.end(JSON.stringify({ roots: [{ id: `kp-${bank}`, kind: 'page', name: `Page ${bank}`, description: `PAGE_${bank}_ONLY` }] }));
    else if (match[2] === '/memories' && request.method === 'POST') response.end(JSON.stringify({ operation_id: `retained-${bank}-${calls.length}` }));
    else response.end('{}');
  }).listen(0, '127.0.0.1');
  await once(endpoint, 'listening');
  const base = `http://127.0.0.1:${endpoint.address().port}`;
  async function open(label) {
    const work = join(root, label, 'work');
    const directory = join(root, label, 'state');
    await mkdir(work, { recursive: true, mode: 0o700 });
    const registry = createRegistry();
    let active = true;
    const mail = await openSessionMail({
      project: work, agent: label, registrationToken: `registration-${label}-fixture`, allowedTools: ['fetch_inbox', 'send_message'],
      authorize: () => { if (!active) throw Error('MAIL_GRANT_REVOKED'); },
      transport: shellEnv => {
        assert.equal(shellEnv.AGENT_MAIL_AGENT, label);
        assert.equal(shellEnv.AGENT_MAIL_PROJECT, work);
        return new StreamableHttpTransport({ url: `${base}/mcp`, headers: { 'x-fixture-agent': label } });
      },
    });
    registry.install(await createMcpCodemodeExtension(mail.source));
    const cfg = resolveConfig({ apiUrl: `${base}/memory`, apiToken: `memory-${label}-fixture`, serverMode: 'remote', autoInject: 'recall',
      autoSeed: false, autoUpdate: false, codebaseSurvey: false, gitIngest: 'none', manageBankConfig: false, retainSessions: true });
    const client = new HindsightClient({ apiUrl: cfg.apiUrl, apiToken: cfg.apiToken, bank: label, project: work,
      log: message => appendFileSync(join(directory, 'memory.log'), `${message}\n`, { mode: 0o600 }) });
    const memory = await createSessionMemory(registry, {
      directory,
      resolveBinding: cwd => { assert.equal(cwd, work); return { cfg, bankId: label }; },
      resolveClient: binding => { assert.equal(binding.cwd, work); assert.equal(binding.bankId, label); return client; },
      lifecycleEffects: { env: {}, hasGit: () => false, startSeed: () => { throw Error('NO_SEED'); }, startSurvey: () => { throw Error('NO_SURVEY'); } },
    });
    const models = createModels();
    const provider = fauxProvider({ provider: 'memory-fixture', models: [{ id: 'echo', contextWindow: 128000, maxTokens: 4096 }], tokensPerSecond: 100000 });
    models.setProvider(provider.provider);
    const storage = await openNodeSqliteStorage(join(directory, 'native.sqlite'));
    const harness = await Harness.open(storage, { models, registry, env: () => new NodeExecutionEnv({ cwd: work, shellEnv: { PATH: process.env.PATH ?? '', ...mail.shellEnv } }) }, ctx);
    const conversation = await harness.root(ctx, { agent: { model: { provider: 'memory-fixture', modelId: 'echo' }, cwd: work } });
    await memory.bind({ session: harness, storage, context: ctx });
    let closed = false;
    let lastTranscript = '';
    const value = {
      label, work, mail, memory, harness, conversation,
      revoke: () => { active = false; },
      transcript: () => lastTranscript,
      async run(prompt, code, toolName) {
        provider.setResponses(code || toolName
          ? [fauxAssistantMessage(fauxToolCall(toolName ?? 'codemode', code ? { code } : {}), { stopReason: 'toolUse' }), fauxAssistantMessage(fauxText(`ANSWER_${label}`))]
          : [fauxAssistantMessage(fauxText(`ANSWER_${label}`))]);
        const submission = await memory.controller.submit(conversation, prompt, 'followUp', `${label}:${prompt}`);
        assert.equal((await submission.wait(withAbortSignal(AbortSignal.timeout(10000), ctx))).status, 'done');
        lastTranscript = JSON.stringify((await conversation.entries({}, 200, undefined, ctx)).items);
        return lastTranscript;
      },
      async close() {
        if (closed) return;
        closed = true;
        await memory.drain(2000);
        await memory.close();
        await mail.close();
        await harness.close(ctx);
      },
    };
    sessions.push(value);
    return value;
  }
  try {
    const [a, b] = await Promise.all([open('A'), open('B')]);
    const contexts = await Promise.all([a.run('PROMPT_A_SENTINEL'), b.run('PROMPT_B_SENTINEL')]);
    assert.match(contexts[0], /MEMORY_A_ONLY/);
    assert.ok(!contexts[0].includes('MEMORY_B_ONLY'));
    assert.match(contexts[1], /MEMORY_B_ONLY/);
    assert.ok(!contexts[1].includes('MEMORY_A_ONLY'));
    const lists = await Promise.all([a.run('LIST_A', undefined, 'hindsight_list_knowledge_pages'), b.run('LIST_B', undefined, 'hindsight_list_knowledge_pages')]);
    assert.ok(lists[0].includes('Page A') && !lists[0].includes('Page B'), 'actual memory tool must use session A binding');
    assert.ok(lists[1].includes('Page B') && !lists[1].includes('Page A'), 'actual memory tool must use session B binding');
    const send = s => `text(await tools.mcp__mcp_agent_mail__send_message(${JSON.stringify({ project_key: s.work, sender_name: s.label, sender_token: 'caller-spoof' })}));`;
    await Promise.all([a.run('MAIL_A', send(a)), b.run('MAIL_B', send(b))]);
    assert.equal(calls.filter(call => call.kind === 'mail').length, 2);
    await a.close();
    const later = await b.run('PROMPT_B_AFTER_A_CLOSE');
    assert.match(later, /MEMORY_B_ONLY/);
    const beforeDenied = calls.filter(call => call.kind === 'mail').length;
    const wrong = await b.run('MAIL_WRONG', `text(await tools.mcp__mcp_agent_mail__fetch_inbox(${JSON.stringify({ project_key: a.work, agent_name: 'A' })}));`);
    assert.match(wrong, /Agent Mail project mismatch/);
    b.revoke();
    const revoked = await b.run('MAIL_REVOKED', `text(await tools.mcp__mcp_agent_mail__fetch_inbox(${JSON.stringify({ project_key: b.work, agent_name: 'B' })}));`);
    assert.match(revoked, /MAIL_GRANT_REVOKED/);
    assert.equal(calls.filter(call => call.kind === 'mail').length, beforeDenied);
    await b.memory.drain(2000);
    for (const s of [a, b]) {
      const other = s.label === 'A' ? 'B' : 'A';
      assert.notEqual(s.memory.paths.log, sessions.find(value => value.label === other).memory.paths.log);
      const text = (await Promise.all(Object.values(s.memory.paths).map(path => readFile(path, 'utf8')))).join('\n');
      assert.ok(!text.includes(`PROMPT_${other}_SENTINEL`), 'logs must not cross session prompt boundaries');
      assert.ok(!text.includes(`MEMORY_${other}_ONLY`), 'logs must not cross session memory boundaries');
      assert.ok(!text.includes(`memory-${s.label}-fixture`), 'memory credential must not enter logs');
      assert.ok(!text.includes(`registration-${s.label}-fixture`), 'Mail registration token must not enter logs');
      assert.ok(!s.transcript().includes(`memory-${s.label}-fixture`), 'memory credential must not enter model transcript');
      assert.ok(!s.transcript().includes(`registration-${s.label}-fixture`), 'Mail registration token must not enter model transcript');
      assert.ok(text.includes(`"bank":"${s.label}"`), 'actual usage/lifecycle logs must identify their own bank');
      assert.ok(!text.includes(`"bank":"${other}"`), 'usage/lifecycle logs must not identify the other bank');
      const ownCalls = calls.filter(call => call.kind === 'memory' && call.bank === s.label);
      assert.ok(ownCalls.some(call => call.path === '/memories/recall' && call.body.query.includes(`PROMPT_${s.label}_SENTINEL`)), 'actual context query must reach the matching loopback bank');
      assert.ok(ownCalls.every(call => !JSON.stringify(call.body ?? null).includes(`PROMPT_${other}_SENTINEL`)), 'context/retained payload must not cross banks');
      assert.ok(ownCalls.some(call => call.path === '/memories'), 'actual retained delivery must reach the matching loopback bank');
    }
    assert.ok(envKeys.every(key => process.env[key] === beforeEnv[key]), 'session-owned integrations must not mutate caller environment');
  } finally {
    await Promise.all(sessions.map(session => session.close()));
    endpoint.closeAllConnections();
    await new Promise(resolve => endpoint.close(resolve));
    await rm(root, { recursive: true, force: true });
  }
});
