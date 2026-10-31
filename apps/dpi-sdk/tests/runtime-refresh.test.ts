import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { DpiClient } from '../src/client.js';

test('refreshRuntime negotiates exact capability on every call and sends only empty body to encoded session', async () => {
  let capabilities: string[] = [];
  const requests: { method: string; url: string; body: string }[] = [];
  const server = createServer(async (request, response) => {
    let body = ''; for await (const chunk of request) body += chunk;
    requests.push({ method: request.method!, url: request.url!, body });
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify(request.url === '/v1/protocol' ? { apiVersion: 1, capabilities }
      : { sessionId: 'exact-id', refreshed: true }));
  }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const address = server.address(); assert.ok(address && typeof address === 'object');
    const session = new DpiClient(`http://127.0.0.1:${address.port}`, 'fixture-only').session('exact/id ?');
    await assert.rejects(session.refreshRuntime(), /missing required capabilities: runtime-refresh.v1/);
    assert.equal(requests.length, 1);
    capabilities = ['runtime-refresh.v1'];
    assert.deepEqual(await session.refreshRuntime(), { sessionId: 'exact-id', refreshed: true });
    assert.deepEqual(requests.at(-1), { method: 'POST', url: '/v1/sessions/exact%2Fid%20%3F/runtime/refresh', body: '{}' });
    capabilities = [];
    await assert.rejects(session.refreshRuntime(), /missing required capabilities: runtime-refresh.v1/);
    assert.deepEqual(requests.map(request => request.method), ['GET', 'GET', 'POST', 'GET']);
  } finally { server.closeAllConnections(); await new Promise<void>(done => server.close(() => done())); }
});
