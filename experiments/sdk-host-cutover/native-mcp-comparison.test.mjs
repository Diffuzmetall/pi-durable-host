import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { connectSessionMcp as native } from './legacy-session-mcp.mjs';
import { connectSessionMcp as nico } from './session-mcp.mjs';
import { McpClient, StreamableHttpTransport } from '@earendil-works/pi-mcp';
import { createInMemoryTransportPair } from '@earendil-works/pi-mcp/testing';

// Characterization, not native replacement acceptance: measured differences are explicit blockers.
test('pi-mcp 1.4.0 accepts structured arrays and null without losing content', async () => {
  const pair = createInMemoryTransportPair();
  await pair.server.start();
  let value = [1, 2];
  pair.server.onMessage(message => {
    if (message.id === undefined) return;
    const result = message.method === 'initialize'
      ? { protocolVersion: '2025-11-25', capabilities: { tools: {} }, serverInfo: { name: 'fixture', version: '1' } }
      : { structuredContent: value };
    void pair.server.send({ jsonrpc: '2.0', id: message.id, result });
  });
  const client = new McpClient({ name: 'fixture', version: '1' });
  try {
    await client.connect(pair.client);
    assert.deepEqual((await client.callTool('echo', {})).structuredContent, [1, 2]);
    value = null;
    assert.equal((await client.callTool('echo', {})).structuredContent, null);
  } finally { await client.close(); }
});

test('pi-mcp 1.4.0 cancels a pending auth resend, but active auth recovery still resends', async () => {
  const counts = [];
  for (const cancelled of [false, true]) {
    let posts = 0;
    const controller = new AbortController();
    const transport = new StreamableHttpTransport({ url: 'http://synthetic.invalid/mcp', openGetStream: false,
      authProvider: { token: async () => 'synthetic-token', onUnauthorized: async () => { if (cancelled) controller.abort(); } },
      fetch: async (_url, init) => {
        assert.equal(init.method, 'POST');
        posts++;
        return posts === 1 ? new Response('', { status: 401 })
          : new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { content: [] } }), { headers: { 'content-type': 'application/json' } });
      },
    });
    await transport.start();
    try {
      const sent = transport.send({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'effect' } }, { signal: controller.signal });
      if (cancelled) await assert.rejects(sent); else await sent;
    } finally { await transport.close(); }
    counts.push(posts);
  }
  assert.deepEqual(counts, [2, 1]);
});

test('replacement blockers: stock manager drops adapter-only server and resends tools/call after 404', async t => {
  let calls = 0, opens = 0;
  const endpoint = createServer(async (request, response) => {
    if (request.method !== 'POST') { response.writeHead(405).end(); return; }
    let raw = ''; for await (const chunk of request) raw += chunk;
    const message = JSON.parse(raw);
    if (message.id === undefined) { response.writeHead(202).end(); return; }
    if (message.method === 'tools/call') { calls++; response.writeHead(404).end(); return; }
    let result = {};
    if (message.method === 'initialize') { opens++; result = { protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'fixture', version: '1' } }; }
    if (message.method === 'tools/list') result = { tools: [{ name: 'effect', inputSchema: { type: 'object', properties: {} } }] };
    response.writeHead(200, { 'content-type': 'application/json', 'mcp-session-id': `synthetic-${opens}` })
      .end(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }));
  }).listen(0, '127.0.0.1');
  await new Promise(resolve => endpoint.once('listening', resolve));
  t.after(() => { endpoint.closeAllConnections(); endpoint.close(); });
  const root = await mkdtemp(join(tmpdir(), 'native-mcp-compare-'));
  const config = { url: `http://127.0.0.1:${endpoint.address().port}/mcp`, headers: { Authorization: 'Bearer synthetic' }, exposure: 'codemode' };
  await writeFile(join(root, 'mcp.json'), JSON.stringify({ mcpServers: { fixture: config } }));
  const adapterBytes = JSON.stringify({ mcpServers: { 'apify-catalog': { ...config, directTools: false } } });
  await writeFile(join(root, 'mcp-adapter.json'), adapterBytes);
  const options = { agentDir: root, projectTrusted: false, authorize: async () => {} };
  const context = { cwd: root, directory: root };
  const stock = await native(context, options);
  try {
    assert.deepEqual(stock.sources.map(source => source.server), ['fixture'], 'stock native loader does not import adapter-only settings');
    await assert.rejects(stock.sources[0].client.callTool('effect', {}));
    assert.equal(calls, 2, 'stock session-expiry recovery resends the tool request: not our no-resend contract');
    assert.equal(opens, 2);
  } finally { await stock.close(); }
  calls = 0; opens = 0;
  const current = await nico(context, options);
  try {
    assert.deepEqual(current.sources.map(source => source.server).sort(), ['apify-catalog', 'fixture']);
    await assert.rejects(current.sources.find(source => source.server === 'fixture').client.callTool('effect', {}));
    assert.equal(calls, 1, 'accepted Nico route does not resend after 404');
    assert.equal(await readFile(join(root, 'mcp-adapter.json'), 'utf8'), adapterBytes);
  } finally { await current.close(); }
});
