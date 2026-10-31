import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BACKGROUND_CONTEXT as ctx, withAbortSignal } from '@earendil-works/chord/context';
import { createModels } from '@earendil-works/pi-ai/models';
import { fauxProvider, fauxAssistantMessage, fauxToolCall, fauxText } from '@earendil-works/pi-ai/providers/faux';
import { Harness, createRegistry } from '@earendil-works/pi-durable';
import { NodeExecutionEnv } from '@earendil-works/pi-durable/env/node';
import { openNodeSqliteStorage } from '@earendil-works/pi-durable/storage/sqlite/node';
import createWebTools, { decodeEntities, htmlToText, renderToolResult } from '../src/native-profile/tools/web/web-tools.js';

test('explicit native web binding required; unchanged HTML and result formatting stay inert', () => {
  assert.throws(() => createWebTools(), /WEB_PRIVATE_DIRECTORY_REQUIRED/);
  assert.throws(() => createWebTools({ directory: 'relative' }), /WEB_PRIVATE_DIRECTORY_REQUIRED/);
  assert.equal(decodeEntities('A &amp; B &#x1f600;'), 'A & B 😀');
  const text = htmlToText('<html><body><script>EXECUTE_SENTINEL()</script><p>safe &amp; visible</p><style>HIDE_ME</style></body></html>');
  assert.match(text, /safe & visible/);
  assert.ok(!text.includes('EXECUTE_SENTINEL') && !text.includes('HIDE_ME'));
  const result = renderToolResult([{ query: 'fixture', ok: true, engine: 'duckduckgo', markdown: '## title\nbody', links: [{ title: 'title', url: 'https://fixture.test/page' }] }]);
  assert.match(result, /Search results by query/);
  assert.match(result, /Read these pages/);
});

test('actual two-Harness web tools use local transports and independent settings/download/quota/cancel scope', { timeout: 30000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'dpi-web-tools-'));
  const beforeFetch = globalThis.fetch;
  const quotaKey = Symbol.for('pi-durable.web-tools.download-quota');
  const beforeQuota = Reflect.get(globalThis, quotaKey);
  const beforeEnv = { HOME: process.env.HOME, PI_CODING_AGENT_DIR: process.env.PI_CODING_AGENT_DIR };
  const calls = [];
  const sessions = [];
  let cancelledStream = false;
  const endpoint = createServer(async (request, response) => {
    const incoming = new URL(request.url, 'http://127.0.0.1');
    const target = new URL(incoming.searchParams.get('target'));
    const owner = request.headers['x-owner'];
    const rescue = request.headers['x-rescue'] === 'yes';
    calls.push({ owner, rescue, target: target.href });
    if (target.hostname === 'html.duckduckgo.com') {
      response.setHeader('content-type', 'text/html');
      response.end(`<html><body>${[1, 2].map(n => `<div class="result"><a class="result__a" href="https://fixture.test/page${n}">Title ${owner} ${n}</a><a class="result__snippet">Snippet ${owner} ${n}</a></div>`).join('')}</body></html>`);
      return;
    }
    if (target.pathname === '/refused' && !rescue) { response.writeHead(403).end('refused plain client'); return; }
    if (target.pathname === '/stream') {
      response.setHeader('content-type', 'text/plain'); response.flushHeaders(); response.write('partial');
      response.on('close', () => { cancelledStream = true; });
      return;
    }
    if (target.pathname === '/binary' || target.pathname === '/quota' || target.pathname === '/oversize') {
      response.setHeader('content-type', 'application/octet-stream');
      if (target.pathname === '/quota') response.setHeader('content-length', '250000000');
      if (target.pathname === '/oversize') response.setHeader('content-length', '600000001');
      response.end(`BINARY_${owner}`);
      return;
    }
    if (target.pathname === '/slow') await new Promise(resolve => setTimeout(resolve, 35));
    response.setHeader('content-type', 'text/html');
    response.end(`<html><head><title>Page ${owner}</title></head><body><p>PAGE_${owner}_ONLY ${rescue ? 'RESCUED' : target.pathname}</p><script>UNTRUSTED_SCRIPT_${owner}</script></body></html>`);
  }).listen(0, '127.0.0.1');
  await once(endpoint, 'listening');
  const base = `http://127.0.0.1:${endpoint.address().port}`;
  async function open(owner, count) {
    const directory = join(root, owner, 'state');
    const work = join(root, owner, 'work');
    await mkdir(join(directory, 'settings'), { recursive: true, mode: 0o700 });
    await mkdir(work, { recursive: true });
    await writeFile(join(directory, 'settings', 'settings.json'), JSON.stringify({ smartWebSearch: { resultsPerQuery: count } }));
    const transport = rescue => async (target, init) => {
      assert.ok(/^https?:/.test(target));
      return fetch(`${base}/record?target=${encodeURIComponent(target)}`, {
        ...init, headers: { ...init.headers, 'x-owner': owner, 'x-rescue': rescue ? 'yes' : 'no' },
      });
    };
    const extension = createWebTools({ directory, fetch: transport(false), rescueFetch: transport(true) });
    assert.deepEqual(extension.tools.map(tool => tool.name), ['web_search', 'web_fetch', 'batch_web_fetch']);
    const registry = createRegistry(); registry.install(extension);
    const provider = fauxProvider({ provider: `web-${owner}`, models: [{ id: 'echo', contextWindow: 128000, maxTokens: 4096 }], tokensPerSecond: 100000 });
    const models = createModels(); models.setProvider(provider.provider);
    const harness = await Harness.open(await openNodeSqliteStorage(join(directory, 'native.sqlite')), { models, registry, env: () => new NodeExecutionEnv({ cwd: work }) }, ctx);
    const conversation = await harness.root(ctx, { agent: { cwd: work, model: { provider: `web-${owner}`, modelId: 'echo' } } });
    let closed = false;
    const session = {
      directory, extension,
      async call(name, args) {
        const toolCall = fauxToolCall(name, args);
        provider.setResponses([fauxAssistantMessage(toolCall, { stopReason: 'toolUse' }), fauxAssistantMessage(fauxText('done'))]);
        const input = await conversation.submit({ type: 'input', content: 'execute local web fixture', requestId: `request-${toolCall.id}` }, ctx);
        assert.equal((await input.wait(withAbortSignal(AbortSignal.timeout(10000), ctx))).status, 'done');
        const history = (await conversation.entries({ order: 'ascending' }, 200, undefined, ctx)).items;
        const result = history.flatMap(entry => entry.model ?? []).find(message => message.role === 'toolResult' && message.toolCallId === toolCall.id);
        assert.ok(result);
        return { isError: result.isError, text: result.content.map(block => block.type === 'text' ? block.text : '').join('\n') };
      },
      async close() { if (!closed) { closed = true; await harness.close(ctx); } },
    };
    sessions.push(session);
    return session;
  }
  try {
    const [a, b] = await Promise.all([open('A', 1), open('B', 2)]);
    const [searchA, searchB] = await Promise.all([a.call('web_search', { searches: ['query A'] }), b.call('web_search', { searches: ['query B'] })]);
    assert.equal(searchA.isError, false); assert.equal(searchB.isError, false);
    assert.ok(searchA.text.includes('Title A 1') && !searchA.text.includes('Title A 2') && !searchA.text.includes('Title B'));
    assert.ok(searchB.text.includes('Title B 2') && !searchB.text.includes('Title A'));
    const fetched = await a.call('web_fetch', { url: 'https://fixture.test/page' });
    assert.equal(fetched.isError, false); assert.match(fetched.text, /PAGE_A_ONLY/); assert.ok(!fetched.text.includes('UNTRUSTED_SCRIPT'));
    const batch = await b.call('batch_web_fetch', { requests: [{ url: 'https://fixture.test/slow' }, { url: 'https://other.test/fast' }] });
    assert.equal(batch.isError, false);
    assert.ok(batch.text.indexOf('## Page 1:') < batch.text.indexOf('## Page 2:'));
    assert.ok(batch.text.includes('PAGE_B_ONLY') && !batch.text.includes('PAGE_A_ONLY'));
    const saved = await Promise.all([a.call('web_fetch', { url: 'https://fixture.test/binary' }), b.call('web_fetch', { url: 'https://fixture.test/binary' })]);
    for (const [index, session] of [a, b].entries()) {
      assert.equal(saved[index].isError, false);
      const path = /Saved ([^\s]+) \(/.exec(saved[index].text)?.[1];
      assert.ok(path?.startsWith(join(session.directory, 'downloads') + '/'));
      assert.equal(await readFile(path, 'utf8'), `BINARY_${index === 0 ? 'A' : 'B'}`);
      assert.equal((await stat(path)).mode & 0o777, 0o600);
    }
    const quota = await a.call('web_fetch', { url: 'https://fixture.test/quota' });
    assert.equal(quota.isError, true); assert.match(quota.text, /budget/);
    const oversized = await a.call('web_fetch', { url: 'https://fixture.test/oversize' });
    assert.equal(oversized.isError, true); assert.match(oversized.text, /declared body exceeds/);
    const rescued = await b.call('web_fetch', { url: 'https://fixture.test/refused' });
    assert.equal(rescued.isError, false); assert.match(rescued.text, /RESCUED/);
    assert.ok(calls.some(call => call.owner === 'B' && call.rescue));
    const beforeInvalid = calls.length;
    const invalid = await a.call('web_fetch', { url: 'file:///etc/passwd' });
    assert.equal(invalid.isError, true); assert.equal(calls.length, beforeInvalid);
    const fetchTool = b.extension.tools.find(tool => tool.name === 'web_fetch');
    const cancel = new AbortController();
    const pending = fetchTool.execute({ url: 'https://fixture.test/stream' }, {}, withAbortSignal(cancel.signal, ctx));
    const timer = setTimeout(() => cancel.abort(new Error('fixture cancellation')), 50);
    try { await assert.rejects(pending); } finally { clearTimeout(timer); }
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(cancelledStream, true, 'native caller cancellation closes actual recording response');
    await a.close();
    const afterClose = await b.call('web_fetch', { url: 'https://fixture.test/after-close' });
    assert.equal(afterClose.isError, false); assert.match(afterClose.text, /PAGE_B_ONLY/);
    assert.ok(!afterClose.text.includes(a.directory));
    const repeated = await b.call('web_fetch', { url: 'https://fixture.test/binary' });
    assert.equal(repeated.isError, false);
    assert.notEqual(repeated.text, saved[1].text, 'same URL cannot overwrite an earlier download');
    const originalB = /Saved ([^\s]+) \(/.exec(saved[1].text)[1];
    assert.equal(await readFile(originalB, 'utf8'), 'BINARY_B');
    assert.equal((await readdir(join(a.directory, 'downloads'))).length, 1);
    assert.equal((await readdir(join(b.directory, 'downloads'))).length, 2);
    const blocked = join(root, 'blocked');
    const outside = join(root, 'outside');
    await mkdir(blocked); await mkdir(outside);
    await symlink(outside, join(blocked, 'downloads'), 'dir');
    const bad = createWebTools({ directory: blocked, fetch: (target, init) => fetch(`${base}/record?target=${encodeURIComponent(target)}`, { ...init, headers: { 'x-owner': 'blocked' } }) });
    await assert.rejects(bad.tools.find(tool => tool.name === 'web_fetch').execute({ url: 'https://fixture.test/binary' }, {}, ctx), /not a directory/);
    assert.deepEqual(await readdir(outside), [], 'download directory symlink cannot write through');
    assert.equal(globalThis.fetch, beforeFetch);
    assert.equal(Reflect.get(globalThis, quotaKey), beforeQuota);
    assert.deepEqual({ HOME: process.env.HOME, PI_CODING_AGENT_DIR: process.env.PI_CODING_AGENT_DIR }, beforeEnv);
  } finally {
    for (const session of sessions) await session.close();
    endpoint.closeAllConnections();
    await new Promise(resolve => endpoint.close(resolve));
    await rm(root, { recursive: true, force: true });
  }
});
