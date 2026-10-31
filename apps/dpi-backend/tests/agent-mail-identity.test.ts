import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { StreamableHttpTransport } from '@earendil-works/pi-mcp';
import { DpiClient } from '../../dpi-sdk/dist/client.js';
import { GrantPolicy } from '../src/grants.js';
import { createHttpServer } from '../src/http-server.js';
import { createNativeProfile } from '../src/native-profile/profile.js';
import { openSessionMail } from '../src/native-profile/memory/mail.js';
import { Store } from '../src/store.js';
import { faux, tempStore, until } from './helpers.js';
import { RemoteTerminal } from '../../terminal-adapter/src/remote-controller.js';
import { TerminalProjection } from '../../terminal-adapter/src/projection.js';

// Loopback MCP only: no installed config, real Mail registration or model requests.
test('session Mail identity reaches SDK documents and terminal footer without credentials or cross-session reuse', { timeout: 20000 }, async () => {
  const temp = await tempStore();
  const token = 'fixture-mail-owner';
  const secret = 'PRIVATE_MAIL_REGISTRATION_SENTINEL';
  const policy = new GrantPolicy([{ id: 'owner', token, actor: 'owner', source: 'terminal', authority: 'human',
    permissions: ['read', 'write', 'control', 'filesystem', 'human-accept'], binding: {} }]);
  const endpoint = createServer(async (request, response) => {
    if (request.method === 'GET') { response.writeHead(405).end(); return; }
    if (request.method === 'DELETE') { response.writeHead(204).end(); return; }
    let raw = ''; for await (const chunk of request) raw += chunk;
    const message = JSON.parse(raw);
    if (message.id === undefined) { response.writeHead(202).end(); return; }
    assert.notEqual(message.method, 'tools/call', 'Observation must never invoke a Mail tool');
    const result = message.method === 'initialize'
      ? { protocolVersion: '2025-11-25', capabilities: { tools: {} }, serverInfo: { name: 'fixture-mail', version: '1' } }
      : { tools: [{ name: 'fetch_inbox', inputSchema: { type: 'object', properties: {} } }] };
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }));
  }).listen(0, '127.0.0.1');
  await once(endpoint, 'listening');
  const address = endpoint.address(); assert(address && typeof address === 'object');
  const profile = createNativeProfile({ policy, owner: policy.authenticate(token), connectMcp: async context => {
    if (context.cwd.endsWith('/no-mail')) return { sources: [], close: async () => {} };
    const mail = await openSessionMail({ project: context.cwd, agent: `Mail-${context.sessionId}`, registrationToken: secret,
      allowedTools: ['fetch_inbox'], authorize: () => {},
      transport: () => new StreamableHttpTransport({ url: `http://127.0.0.1:${address.port}/mcp` }) });
    return { sources: [mail.source], shellEnv: { ...mail.shellEnv, PRIVATE_TOKEN: secret }, close: () => mail.close() };
  } });
  let store: Store | undefined;
  let server: ReturnType<typeof createHttpServer> | undefined;
  const viewers: RemoteTerminal[] = [];
  try {
    store = await Store.open({ ...temp.options, profile });
    const sessions: Awaited<ReturnType<Store['create']>>[] = [];
    for (const name of ['A', 'B', 'no-mail']) {
      const cwd = join(temp.work, name); await mkdir(cwd);
      sessions.push(await store.create({ name, cwd, model: faux }));
    }
    server = createHttpServer(store, policy).listen(0, '127.0.0.1');
    await once(server, 'listening');
    const http = server.address(); assert(http && typeof http === 'object');
    const client = new DpiClient(`http://127.0.0.1:${http.port}`, token);
    for (const session of sessions) {
      const expected = session.name === 'no-mail' ? null : { name: `Mail-${session.id}`, project: session.cwd };
      const agent = client.agent(session.id, 1);
      const detail = await agent.get();
      assert(detail.documentKinds?.includes('host.agent-mail'), 'Host must discover the safe identity document');
      const doc = await agent.doc('host.agent-mail');
      assert.deepEqual(doc.value, expected);
      assert(!JSON.stringify(doc).includes(secret));
      const terminal = await RemoteTerminal.open(client, session.id, join(temp.root, `cache-${session.id}`));
      viewers.push(terminal);
      await until(async () => terminal.current().connection === 'online', 5000, 'terminal SDK snapshot');
      await until(async () => JSON.stringify(terminal.current().agentMail ?? null) === JSON.stringify(expected), 5000, 'Mail footer identity');
      assert.deepEqual(terminal.current().agentMail ?? null, expected);
      assert(!JSON.stringify(terminal.current()).includes(secret));
    }
    assert.notDeepEqual(viewers[0].current().agentMail, viewers[1].current().agentMail);
    await viewers[0].close();
    const reopened = await RemoteTerminal.open(client, sessions[0].id, join(temp.root, 'reopened'));
    viewers.push(reopened);
    await until(async () => reopened.current().agentMail?.name === `Mail-${sessions[0].id}`, 5000, 'identity on viewer reattach');
  } finally {
    await Promise.all(viewers.map(viewer => viewer.close()));
    server?.closeAllConnections();
    if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
    await store?.close();
    endpoint.closeAllConnections();
    await new Promise<void>(resolve => endpoint.close(() => resolve()));
    await temp.cleanup();
  }
});

test('Mail projection clears absent or malformed identity and only retains public fields', () => {
  const projection = new TerminalProjection();
  projection.apply({ type: 'doc', kind: 'host.agent-mail', value: { name: 'WildBass', project: '/fixture', token: 'PRIVATE' } });
  assert.deepEqual(projection.agentMail, { name: 'WildBass', project: '/fixture' });
  for (const value of [null, {}, { name: 'Other' }, { name: '', project: '/fixture' }, { name: 'Other', project: 42 }]) {
    projection.apply({ type: 'doc', kind: 'host.agent-mail', value });
    assert.equal(projection.agentMail, undefined);
  }
});
