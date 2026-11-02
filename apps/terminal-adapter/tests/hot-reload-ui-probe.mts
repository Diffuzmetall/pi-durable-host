// Disposable real Host/Harness/SQLite fixture. Proxy injects only the second reload receipt's cleanup field.
// This proves HTTP/SDK/TUI presentation, not an actual backend cleanup failure.
import { createServer, request, type ClientRequest } from 'node:http';
import { rename, writeFile } from 'node:fs/promises';
import { nativeAttentionFixture } from '../../dpi-backend/tests/fixtures/terminal-native-attention.js';
const host = await nativeAttentionFixture();
const info = process.env.HOT_UI_INFO!;
const outgoing = new Set<ClientRequest>();
let reloadPosts = 0;
const receipts: Array<string> = [];
const server = createServer((incoming, response) => {
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
      let body = Buffer.concat(chunks);
      const receipt = JSON.parse(body.toString());
      if (id === 2 && received.statusCode === 200) {
        receipt.cleanup = 'failed';
        body = Buffer.from(JSON.stringify(receipt));
      }
      receipts.push(receipt.cleanup ?? 'none');
      const headers = { ...received.headers };
      delete headers['transfer-encoding'];
      headers['content-length'] = String(body.length);
      response.writeHead(received.statusCode!, headers).end(body);
    });
  });
  outgoing.add(upstream);
  upstream.on('close', () => outgoing.delete(upstream));
  upstream.on('error', () => response.destroy());
  response.on('close', () => upstream.destroy());
  incoming.pipe(upstream);
});
await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
if (!address || typeof address === 'string') throw Error('Missing disposable proxy port');
await writeFile(`${info}.tmp`, JSON.stringify({ base: `http://127.0.0.1:${address.port}`, sessionId: host.sessionId, token: host.token, root: host.root, pid: process.pid }));
await rename(`${info}.tmp`, info);
await new Promise<void>(resolve => { process.once('SIGTERM', resolve); process.once('SIGINT', resolve); });
await writeFile(`${info}.result`, JSON.stringify({ modelCalls: host.modelCalls, pid: process.pid, reloadPosts, receipts }));
for (const client of outgoing) client.destroy();
server.closeAllConnections();
await new Promise<void>(resolve => server.close(() => resolve()));
await host.close();
