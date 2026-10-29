import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import test, { type TestContext } from 'node:test';
import { openHistorySink, type HistoryRequester } from '../src/history-sink.js';
import type { HistoricalSnapshot } from '../src/history-types.js';

const threadId = 'fixture-thread-A';
const zero = '0'.repeat(64);
const one = '1'.repeat(64);
const snapshot = (text: string): HistoricalSnapshot => ({
  status: 'completed',
  inputs: [{ entryId: '11', requestId: 'root-stable-key' }],
  items: [{ source: { entryId: '11', messageIndex: 0, blockIndex: 0 }, item: { type: 'userMessage', content: [{ type: 'text', text }] } }],
});

// Recording BB RPC boundary, not a substitute for actual Core authorization/schema smoke.
async function rpcFixture(t: TestContext) {
  let active = true;
  let digest: string | null = null;
  let dropNextAck = false;
  let mutations = 0;
  let reads = 0;
  const requests: Parameters<HistoryRequester>[1][] = [];
  const server = createServer(async (req, res) => {
    let raw = '';
    for await (const bytes of req) raw += bytes;
    const { method, params } = JSON.parse(raw) as { method: string; params: Parameters<HistoryRequester>[1] };
    requests.push(params);
    // Check authorization before read, identical-content no-op or CAS.
    if (!active || req.headers.authorization !== 'Bearer bb-local-fixture' || params.threadId !== threadId) {
      res.writeHead(403).end('denied');
      return;
    }
    if (method !== 'thread/reconcileExisting') { res.writeHead(400).end('unsupported'); return; }
    if (!params.snapshot) {
      reads++;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ threadId, digest, changed: false }));
      return;
    }
    const next = createHash('sha256').update(JSON.stringify(params.snapshot)).digest('hex');
    // Source server contract: identical authorized payload wins BEFORE CAS.
    if (digest === next) {
      res.end(JSON.stringify({ threadId, digest, changed: false }));
      return;
    }
    if (params.expectedDigest !== digest) { res.writeHead(409).end('conflict'); return; }
    digest = next;
    mutations++;
    if (dropNextAck) { dropNextAck = false; req.socket.destroy(); return; }
    res.end(JSON.stringify({ threadId, digest, changed: true }));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const url = `http://127.0.0.1:${address.port}/rpc`;
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
  const request: HistoryRequester = async (method, params) => {
    const response = await fetch(url, { method: 'POST', headers: { authorization: 'Bearer bb-local-fixture', 'content-type': 'application/json' }, body: JSON.stringify({ method, params }) });
    if (!response.ok) throw new Error(`BB RPC ${response.status}`);
    return response.json();
  };
  return {
    request, requests,
    loseNextAck() { dropNextAck = true; },
    revoke() { active = false; },
    get mutations() { return mutations; },
    get reads() { return reads; },
    get digest() { return digest; },
  };
}

test('ISC-29 partial: commit then actual socket ACK loss retries identical CAS without reread or duplicate', async t => {
  const rpc = await rpcFixture(t);
  const sink = await openHistorySink({ threadId, request: rpc.request });
  const first = snapshot('first');
  rpc.loseNextAck();
  await assert.rejects(sink.apply(first), /fetch failed/);
  assert.equal(rpc.mutations, 1);
  assert.equal(rpc.reads, 1);
  const requestCount = rpc.requests.length;
  await assert.rejects(sink.apply(snapshot('changed')), /retry identical snapshot only/);
  assert.equal(rpc.requests.length, requestCount, 'changed retry must never reach Core');
  const receipt = await sink.apply(first);
  assert.equal(receipt.changed, false);
  assert.equal(receipt.digest, rpc.digest);
  assert.equal(rpc.mutations, 1);
  assert.equal(rpc.reads, 1, 'lost ACK must not trigger read/rebase');
  assert.deepEqual(rpc.requests[1], rpc.requests[2], 'same snapshot and original expectedDigest on explicit retry');
  await sink.apply(snapshot('second'));
  assert.equal(rpc.requests[3]?.expectedDigest, receipt.digest, 'advance only on validated ACK');
  assert.equal(rpc.mutations, 2);
});

test('ISC-29 partial: external writer after lost ACK never authorizes rollback/rebase', async t => {
  const rpc = await rpcFixture(t);
  const a = await openHistorySink({ threadId, request: rpc.request });
  rpc.loseNextAck();
  await assert.rejects(a.apply(snapshot('A')), /fetch failed/);
  const b = await openHistorySink({ threadId, request: rpc.request });
  const newer = await b.apply(snapshot('B'));
  await assert.rejects(a.apply(snapshot('A')), /BB RPC 409/);
  await assert.rejects(a.apply(snapshot('C')), /retry identical snapshot only/);
  assert.equal(rpc.reads, 2, 'exactly one explicit authorized open per sink');
  assert.equal(rpc.mutations, 2);
  assert.equal(rpc.digest, newer.digest);
});

test('revocation and foreign thread reject before identical no-op or digest read', async t => {
  const rpc = await rpcFixture(t);
  await assert.rejects(openHistorySink({ threadId: 'foreign-thread', request: rpc.request }), /BB RPC 403/);
  assert.equal(rpc.reads, 0);
  const sink = await openHistorySink({ threadId, request: rpc.request });
  await sink.apply(snapshot('same'));
  rpc.revoke();
  await assert.rejects(sink.apply(snapshot('same')), /BB RPC 403/);
  await assert.rejects(sink.apply(snapshot('new')), /retry identical snapshot only/);
  assert.equal(rpc.mutations, 1);
  assert.equal(rpc.reads, 1);
});

test('one in-flight immutable attempt, no client queue or caller-owned payload alias', async () => {
  let release!: (value: unknown) => void;
  const pending = new Promise(resolve => { release = resolve; });
  const requests: Parameters<HistoryRequester>[1][] = [];
  const sink = await openHistorySink({ threadId, request: async (_method, params) => {
    requests.push(params);
    return params.snapshot ? pending : { threadId, digest: zero, changed: false };
  } });
  const input = snapshot('before');
  const expected = structuredClone(input);
  const first = sink.apply(input);
  input.items.length = 0;
  await assert.rejects(sink.apply(snapshot('concurrent')), /Concurrent history apply refused/);
  assert.equal(requests.length, 2);
  assert.deepEqual(requests[1]?.snapshot, expected);
  release({ threadId, digest: one, changed: true, secret: 'not-a-public-field' });
  assert.deepEqual(await first, { threadId, digest: one, changed: true }, 'receipt exports only checked public fields');
});

test('malformed initial receipts cannot start observation/history admission', async () => {
  const bad = [
    undefined, null, {},
    { threadId: 'other', digest: zero, changed: false },
    { threadId, digest: 'not-a-digest', changed: false },
    { threadId, digest: zero, changed: true },
    { threadId, digest: zero, changed: false, deferred: true },
    { threadId, digest: zero, changed: 'false' },
  ];
  for (const value of bad) await assert.rejects(openHistorySink({ threadId, request: async () => value }), /Invalid history reconciliation acknowledgement/);
  for (const value of ['', 'a'.repeat(201)]) await assert.rejects(openHistorySink({ threadId: value, request: async () => null }), /History threadId/);
});

test('malformed mutation ACK freezes original attempt and never advances expectedDigest', async () => {
  const bad = [
    undefined, null, {},
    { threadId: 'other', digest: one, changed: true },
    { threadId, digest: 'A'.repeat(64), changed: true },
    { threadId, digest: null, changed: false },
    { threadId, digest: one, changed: true, deferred: true },
    { threadId, digest: one, changed: false, deferred: false },
  ];
  for (const value of bad) {
    const requests: Parameters<HistoryRequester>[1][] = [];
    const sink = await openHistorySink({ threadId, request: async (_method, params) => {
      requests.push(params);
      return !params.snapshot ? { threadId, digest: zero, changed: false } : requests.length === 2 ? value : { threadId, digest: one, changed: true };
    } });
    const input = snapshot('stable');
    await assert.rejects(sink.apply(input), /Invalid history reconciliation acknowledgement/);
    await assert.rejects(sink.apply(snapshot('different')), /retry identical snapshot only/);
    await sink.apply(input);
    assert.deepEqual(requests[1], requests[2]);
    assert.equal(requests[2]?.expectedDigest, zero);
  }
});

test('deferred reply must retain acknowledged digest and no mutation', async () => {
  const requests: Parameters<HistoryRequester>[1][] = [];
  let invalid = true;
  const sink = await openHistorySink({ threadId, request: async (_method, params) => {
    requests.push(params);
    if (!params.snapshot) return { threadId, digest: null, changed: false };
    return { threadId, digest: invalid ? one : null, changed: false, deferred: true };
  } });
  const input = snapshot('deferred');
  await assert.rejects(sink.apply(input), /Deferred history response changed its digest/);
  invalid = false;
  assert.deepEqual(await sink.apply(input), { threadId, digest: null, changed: false, deferred: true });
  await sink.apply(snapshot('later'));
  assert.equal(requests.at(-1)?.expectedDigest, null);
});
