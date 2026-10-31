import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once, EventEmitter } from 'node:events';
import { Store } from '../src/store.js';
import { createHttpServer, GrantPolicy } from '../src/http-server.js';
import { createNativeProfile, createNativeModels } from '../src/native-profile/profile.js';
import { fauxProvider, fauxAssistantMessage } from '@earendil-works/pi-ai/providers/faux';
import { DpiClient } from '../../dpi-sdk/src/client.js';
import { openSse } from '../src/streams.js';

test('snapshot over 2 MB is followed by all four requested documents on the same SSE connection', { timeout: 25000 }, async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'large-native-snapshot-'));
  const grant = { id: 'test', actor: 'test', token: 'synthetic-token', source: 'terminal', authority: 'human',
    permissions: ['read', 'write', 'control', 'filesystem', 'human-accept'], binding: {} };
  const policy = new GrantPolicy([grant]);
  const create = () => {
    const faux = fauxProvider({ models: [{ id: 'large', contextWindow: 4_000_000, maxTokens: 2_000_000 }], tokensPerSecond: Infinity, tokenSize: { min: 2_000_000, max: 2_000_000 } });
    faux.setResponses([fauxAssistantMessage('x'.repeat(2_050_000))]);
    return createNativeModels({ providers: [faux.provider], credentials: {
      read: async () => undefined, list: async () => [], modify: async () => { throw Error('No auth'); }, delete: async () => { throw Error('No auth'); },
    } });
  };
  const discovery = await create();
  const profile = createNativeProfile({ policy, owner: policy.authenticate(grant.token),
    models: { defaultModel: { provider: 'faux', modelId: 'large' }, catalogue: discovery.catalogue, create },
    connectMcp: async () => ({ sources: [], close: async () => {} }) });
  const kinds = ['durable-goals.native-goals', 'durable.schedules', 'host.agent-mail', 'durable.triggers.watches'];
  const store = await Store.open({ dataDir: join(cwd, 'data'), startDirs: [cwd], profile, provider: 'faux' });
  const server = createHttpServer(store, policy).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const controller = new AbortController();
  try {
    const client = new DpiClient(`http://127.0.0.1:${server.address().port}`, grant.token);
    const session = await client.createSession({ cwd, name: 'large', model: { provider: 'faux', modelId: 'large' } }, 'create-large');
    await client.session(session.id).setCompaction({ enabled: false });
    const agent = client.agent(session.id, 1);
    assert.equal((await agent.send('large fixture', 'followUp', 'large-response', 20000)).status, 'done');
    let snapshotBytes = 0, snapshots = 0;
    const documents = [];
    for await (const frame of agent.events(AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]), kinds)) {
      if (frame.type === 'snapshot') { snapshots++; snapshotBytes = Buffer.byteLength(JSON.stringify(frame)); }
      if (frame.type === 'doc') documents.push({ kind: frame.kind, value: frame.value });
      if (documents.length === kinds.length) break;
    }
    assert(snapshotBytes > 2_000_000, 'Must exercise the actual server backlog bound');
    assert.equal(snapshots, 1, 'No reconnect may substitute for document delivery');
    assert.deepEqual(documents.map(document => document.kind), kinds);
  } finally {
    controller.abort();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await store.close();
  }
});

test('steady-state backlog still disconnects a slow viewer', () => {
  const response = Object.assign(new EventEmitter(), {
    locals: {}, writableLength: 0, ends: 0,
    status() { return this; }, set() { return this; }, flushHeaders() {}, write() { return true; },
    end() { this.ends++; },
  });
  const stream = openSse(response, { kind: 'device' });
  response.writableLength = 2_000_001;
  stream.send({ type: 'fixture' });
  assert.equal(stream.closed, true);
  assert.equal(response.ends, 1);
});
