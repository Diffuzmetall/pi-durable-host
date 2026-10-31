import assert from 'node:assert/strict';
import { test } from 'node:test';
import { once } from 'node:events';
import { DpiClient } from 'dpi-sdk/client';
import { BbProviderBridge } from '../src/provider-bridge.js';
import { fixtureProfileFactory } from './native-fixture.mjs';
const { Store } = await import(new URL('../../dpi-backend/src/store.ts', import.meta.url).href);
const { createHttpServer } = await import(new URL('../../dpi-backend/src/http-server.ts', import.meta.url).href);
const { GrantPolicy } = await import(new URL('../../dpi-backend/src/grants.ts', import.meta.url).href);
const { tempStore, faux } = await import(new URL('../../dpi-backend/tests/helpers.ts', import.meta.url).href);

test('Core compaction retries/restart/conflicts refuse BEFORE native effects or accepted ACK, leaving ordinary APIs intact', { timeout: 30000 }, async () => {
  const temp = await tempStore();
  const owner = { id: 'owner', token: 'DISPOSABLE_COMPACT_OWNER', actor: 'owner', source: 'terminal', authority: 'human', permissions: ['read','write','control'], binding: {} };
  let policy = new GrantPolicy([owner]);
  let store = await Store.open({ ...temp.options, profile: await fixtureProfileFactory(policy, owner.token) });
  const session = await store.create({ name: 'compact-refusal', cwd: temp.work, model: faux, thinkingLevel: 'off' });
  await store.close();
  const bb = { id: 'bb', token: 'DISPOSABLE_COMPACT_BB', actor: 'bb', source: 'bb', authority: 'human', permissions: ['read','write','control'],
    binding: { sessionId: session.id, conversationId: 1, bb: { providerId: 'pi-durable', threadId: 'compact-root' } } };
  policy = new GrantPolicy([owner, bb]);
  let server: ReturnType<typeof createHttpServer> | undefined, bridge: BbProviderBridge | undefined;
  let compactions = 0, sequence = 0;
  const output: any[] = [], responses = new Map<number, any>();
  try {
    for (let epoch = 0; epoch < 2; epoch++) {
      store = await Store.open({ ...temp.options, profile: await fixtureProfileFactory(policy, owner.token) });
      const originalCompact = store.compact.bind(store);
      store.compact = async (...args: any[]) => { compactions++; return originalCompact(...args); };
      server = createHttpServer(store, policy).listen(0, '127.0.0.1'); await once(server, 'listening');
      const address = server.address(); assert.ok(address && typeof address === 'object');
      const client = new DpiClient(`http://127.0.0.1:${address.port}`, bb.token), native = client.agent(session.id, 1);
      bridge = new BbProviderBridge(line => {
        const message = JSON.parse(line); output.push(message);
        if (typeof message.id === 'number' && !message.method) { responses.set(message.id, message); return; }
        if (typeof message.id !== 'string' || !message.method) return;
        assert.equal(message.method, 'thread/getOwnerScope');
        queueMicrotask(() => { void bridge!.handleLine(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: {
          providerId: 'pi-durable', threadId: 'compact-root', providerThreadId: session.id, parentThreadId: null } })); });
      }, { client, providerId: 'pi-durable', sessionId: session.id, conversationId: 1, threadId: 'compact-root', cwd: temp.work });
      const request = async (method: string, params: object) => {
        const id = ++sequence; await bridge!.handleLine(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
        const response = responses.get(id); assert.ok(response); return response;
      };
      const attached = await request(epoch ? 'thread/resume' : 'thread/start', {
        threadId: 'compact-root', providerThreadId: session.id, model: 'faux/echo', thinkingLevel: 'max' });
      assert.ok(!attached.error, `epoch ${epoch}: ${JSON.stringify(attached)}`);
      const h = store.harness(store.resolveSession(session.id));
      const tasks = async () => [...await store.tasks(h, 'active', 200), ...await store.tasks(h, 'terminal', 200)]
        .map(task => ({ id: task.id, kind: task.kind })).sort((a,b) => a.id - b.id);
      const before = await tasks(), entries = await native.entries();
      for (const method of ['turn/start', 'turn/steer']) {
        for (const text of ['/compact', '/compact', '/compact changed instructions', 'prefix\n /compact notes']) {
          for (const threadId of ['compact-root', 'unattached-native-child']) {
            const result = await request(method, { threadId, clientRequestId: 'creq_23456789af', model: 'faux/echo', thinkingLevel: 'max', input: [{ type: 'text', text }] });
            assert.equal(result.error?.message, 'BB_COMPACTION_UNSUPPORTED_IDEMPOTENCY');
          }
        }
      }
      assert.equal(compactions, 0, 'no real Store.compact invocation, not a fabricated applied result');
      assert.deepEqual(await tasks(), before, 'zero new native task IDs');
      assert.deepEqual(await native.entries(), entries, 'no replacement normal prompt/native entry');
      assert.equal((await native.config()).thinkingLevel, 'off', 'refused intent cannot apply deferred selection');
      assert.ok(!output.some(message => message.method === 'thread/delta' && message.params.deltas.some((delta: any) => delta.kind === 'input.accepted')));
      assert.equal(typeof native.compact, 'function', 'existing public SDK API is unchanged');
      await bridge.shutdown(); bridge = undefined;
      server.closeAllConnections(); await new Promise<void>(resolve => server!.close(() => resolve())); server = undefined;
      if (epoch === 0) await store.close();
    }
  } finally {
    await bridge?.shutdown();
    if (server) { server.closeAllConnections(); await new Promise<void>(resolve => server!.close(() => resolve())); }
    await store.close(); await temp.cleanup();
  }
});
