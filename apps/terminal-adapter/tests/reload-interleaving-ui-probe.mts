// Test-only transport fault boundary around the real native HTTP Host.
import { createServer, request, type ClientRequest, type ServerResponse } from 'node:http';
import { rename, writeFile } from 'node:fs/promises';
import { nativeAttentionFixture } from '../../dpi-backend/tests/fixtures/terminal-native-attention.js';

const host = await nativeAttentionFixture();
const info = process.env.HOT_UI_INFO!;
const outgoing = new Set<ClientRequest>();
const held = new Map<number, { response: ServerResponse; status: number; body: Buffer; headers: Record<string, string | string[] | undefined> }>();
let reloadPosts = 0;
const server = createServer((incoming, response) => {
  const release = /^\/_fixture\/release\/(\d+)$/.exec(incoming.url ?? '');
  if (release) {
    if (incoming.headers.authorization !== `Bearer ${host.token}`) {
      response.writeHead(401).end();
      return;
    }
    const id = Number(release[1]);
    const pending = held.get(id);
    if (!pending) { response.writeHead(409).end(); return; }
    held.delete(id);
    // The real Host already published. Case 2 loses only the transport ACK.
    if (id === 2) pending.response.destroy();
    else pending.response.writeHead(pending.status, pending.headers).end(pending.body);
    response.writeHead(204).end();
    return;
  }
  const isReload = incoming.method === 'POST' && incoming.url?.endsWith('/reload');
  const id = isReload ? ++reloadPosts : undefined;
  const upstream = request(new URL(incoming.url!, host.base), {
    method: incoming.method, headers: incoming.headers,
  }, received => {
    if (id === undefined) {
      response.writeHead(received.statusCode!, received.headers);
      received.pipe(response);
      return;
    }
    const chunks: Buffer[] = [];
    received.on('data', chunk => chunks.push(Buffer.from(chunk)));
    received.on('end', () => {
      const body = Buffer.concat(chunks);
      held.set(id, { response, status: received.statusCode!, body, headers: received.headers });
      void writeFile(`${info}.reload-${id}.tmp`, JSON.stringify({ id, status: received.statusCode, body: body.toString() }))
        .then(() => rename(`${info}.reload-${id}.tmp`, `${info}.reload-${id}.json`));
    });
  });
  outgoing.add(upstream);
  upstream.on('close', () => outgoing.delete(upstream));
  upstream.on('error', () => response.destroy());
  response.on('close', () => { if (!isReload) upstream.destroy(); });
  incoming.pipe(upstream);
});
await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
if (!address || typeof address === 'string') throw Error('Missing disposable proxy port');
await writeFile(`${info}.tmp`, JSON.stringify({ base: `http://127.0.0.1:${address.port}`, sessionId: host.sessionId, token: host.token, pid: process.pid }));
await rename(`${info}.tmp`, info);
await new Promise<void>(resolve => { process.once('SIGTERM', resolve); process.once('SIGINT', resolve); });
await writeFile(`${info}.result`, JSON.stringify({ modelCalls: host.modelCalls, pid: process.pid, reloadPosts, held: held.size }));
for (const pending of held.values()) pending.response.destroy();
for (const client of outgoing) client.destroy();
server.closeAllConnections();
await new Promise<void>(resolve => server.close(() => resolve()));
await host.close();
