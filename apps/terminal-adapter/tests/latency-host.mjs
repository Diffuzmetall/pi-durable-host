// Deterministic stream transport fixture, not a native runtime or a model provider.
import { createServer } from 'node:http';
import { appendFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const root = process.env.TERMINAL_PROBE_ROOT;
const token = process.env.DPI_TOKEN;
if (!root || !token) throw Error('Use the isolated latency probe');
const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
const agent = { id: 1, name: 'main', named: false, kind: 'root', busy: false, background: 0 };
const model = { id: 'echo', provider: 'faux', name: 'Fixture', tier: 'T', icon: '', contextWindow: 128000, reasoning: false, cost: { input: 0, output: 0 } };
const session = { id: 'fixture', name: 'latency-fixture', cwd: root, model: 'echo', createdAt: 0, dbPath: '', busy: false, agents: [agent] };
let entries = [{ id: 1, conversationId: 1, kind: 'fixture.unknown-render-kind', data: { text: 'UNKNOWN_RENDER_SAFE\u001b[31m_TEXT', code: 'throw new Error("untrusted renderer must not execute")' } }];
const viewers = new Set();
const responses = new Set();
const receipts = new Map();
let sequence = 2;
const frame = (res, value) => res.write('data: ' + JSON.stringify(value) + '\n\n');
const snapshot = () => ({ type: 'snapshot', entries, tools: [], compactions: [], inbox: [], agent: { model: { provider: 'faux', modelId: 'echo' }, thinkingLevel: 'off' }, usage: { models: {}, tools: {} } });
const server = createServer(async (req, res) => {
  if (req.headers.authorization !== 'Bearer ' + token) { res.writeHead(401).end(); return; }
  const url = new URL(req.url, 'http://fixture');
  const json = (value, status = 200) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(value)); };
  if (url.pathname.endsWith('/events')) {
    responses.add(res);
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
    frame(res, { type: 'hello', apiVersion: 1, serverTime: 0, scope: { kind: 'agent', sessionId: 'fixture', agentId: 1 } });
    if (url.pathname.includes('/agents/')) { viewers.add(res); frame(res, { type: 'snapshot', snapshot: snapshot(), inbox: [] }); }
    else frame(res, { type: 'session', agents: [agent], tasks: [], usage: { models: {}, tools: {} } });
    res.on('close', () => { responses.delete(res); viewers.delete(res); });
    return;
  }
  if (url.pathname === '/v1/protocol') return json({ apiVersion: 1, capabilities: ['events', 'docs'] });
  if (url.pathname === '/v1/device') return json({ models: [model], defaultModel: 'echo', capabilities: ['events', 'docs'] });
  if (url.pathname === '/v1/sessions/fixture') return json(session);
  if (url.pathname === '/v1/sessions/fixture/agents/1') return json({ ...agent, sessionId: 'fixture', config: snapshot().agent, tools: [], extensions: [] });
  if (url.pathname.endsWith('/entries')) return json({ items: entries });
  if (url.pathname.includes('/receipts/')) {
    const found = receipts.get(decodeURIComponent(url.pathname.split('/receipts/')[1]));
    return found ? json({ submissionId: found.id, status: 'done' }) : json({ error: { code: 'not_found', message: 'No fixture receipt' } }, 404);
  }
  if (req.method === 'POST' && url.pathname.endsWith('/messages')) {
    let body = '';
    for await (const chunk of req) { body += chunk; if (body.length > 100000) return json({ error: { code: 'invalid', message: 'Body too large' } }, 400); }
    const value = JSON.parse(body);
    const sample = /^latency (\d+)$/.exec(value.content ?? '');
    if (!sample || typeof value.requestId !== 'string') return json({ error: { code: 'invalid', message: 'Expected sample' } }, 400);
    const existing = receipts.get(value.requestId);
    if (existing) return json({ submissionId: existing.id, status: 'queued' }, 202);
    const marker = 'LATENCY_RENDER_' + sample[1].padStart(3, '0');
    const entry = { id: sequence++, conversationId: 1, kind: 'pi.assistant', model: [{ role: 'assistant', provider: 'faux', model: 'echo', usage, stopReason: 'stop', content: [{ type: 'text', text: marker }] }] };
    entries = [entry];
    receipts.set(value.requestId, { id: entry.id });
    appendFileSync(join(root, 'latency.jsonl'), JSON.stringify({ marker, committedNs: process.hrtime.bigint().toString() }) + '\n');
    for (const viewer of viewers) frame(viewer, { type: 'snapshot', snapshot: snapshot(), inbox: [] });
    return json({ submissionId: entry.id, status: 'queued' }, 202);
  }
  return json({ error: { code: 'not_found', message: 'Unknown fixture operation' } }, 404);
});
server.listen(0, '127.0.0.1', () => {
  writeFileSync(join(root, 'ready.json'), JSON.stringify({ base: 'http://127.0.0.1:' + server.address().port, sessionId: 'fixture' }), { mode: 0o600, flag: 'wx' });
  console.log('FIXTURE_READY');
});
const close = () => { for (const response of responses) response.end(); server.closeAllConnections(); server.close(); };
process.once('SIGTERM', close);
process.once('SIGINT', close);
