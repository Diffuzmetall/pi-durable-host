import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { Store } from 'dpi-backend/store';
import { createHttpServer, GrantPolicy } from 'dpi-backend/server';
import { createNativeProfile, createNativeModels } from 'dpi-backend/native-profile';
import { fauxProvider, fauxAssistantMessage } from '@earendil-works/pi-ai/providers/faux';
import { DpiClient } from 'dpi-sdk';

test('large native snapshot drains before optional documents; fast viewer does not reconnect forever', { timeout: 25000 }, async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'large-native-snapshot-'));
  const grant = { id: 'test', actor: 'test', token: 'synthetic-token', source: 'terminal', authority: 'human',
    permissions: ['read','write','control','filesystem','human-accept'], binding: {} };
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
  const store = await Store.open({ dataDir: join(cwd, 'data'), startDirs: [cwd], profile, provider: 'faux' });
  const server = createHttpServer(store, policy).listen(0, '127.0.0.1'); await once(server, 'listening');
  const controller = new AbortController();
  try {
    const client = new DpiClient(`http://127.0.0.1:${server.address().port}`, grant.token);
    const session = await client.createSession({ cwd, name: 'large', model: { provider: 'faux', modelId: 'large' } }, 'create-large');
    await client.session(session.id).setCompaction({ enabled: false });
    const agent = client.agent(session.id, 1);
    assert.equal((await agent.send('large fixture', 'followUp', 'large-response', 20000)).status, 'done');
    let snapshotBytes = 0, documentSeen = false;
    for await (const frame of agent.events(AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]), ['durable-goals.native-goals'])) {
      if (frame.type === 'snapshot') snapshotBytes = Buffer.byteLength(JSON.stringify(frame));
      if (frame.type === 'doc') { documentSeen = true; break; }
    }
    assert(snapshotBytes > 2_000_000, 'Must exercise real snapshot larger than server backlog bound');
    assert(documentSeen, 'Initial snapshot was mistaken for a slow viewer before optional docs');
  } finally {
    controller.abort(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await store.close();
  }
});
