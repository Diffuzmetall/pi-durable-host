import assert from 'node:assert/strict';
import { test } from 'node:test';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { DpiClient } from 'dpi-sdk/client';
import { BbThreadSession, type BbCore } from '../src/session.js';

// Native runtime is fixture-only and dynamically loaded from the owning backend;
// the adapter's published runtime dependency remains public dpi-sdk alone.
const { Store } = await import(new URL('../../dpi-backend/src/store.ts', import.meta.url).href);
const { createHttpServer } = await import(new URL('../../dpi-backend/src/http-server.ts', import.meta.url).href);
const { GrantPolicy } = await import(new URL('../../dpi-backend/src/grants.ts', import.meta.url).href);
const { createNativeProfile } = await import(new URL('../../dpi-backend/src/native-profile/profile.ts', import.meta.url).href);
const { tempStore, faux, until } = await import(new URL('../../dpi-backend/tests/helpers.ts', import.meta.url).href);

const owner = { id: 'owner', token: 'root-fixture-owner', actor: 'owner', source: 'terminal', authority: 'human',
  permissions: ['read', 'write', 'control', 'filesystem', 'human-accept'], binding: {} };

test('actual native BB root: Core scope + exact binding, unchanged model, lost ACK stable request, reopen and revoked reconnect', { timeout: 45000 }, async () => {
  const temp = await tempStore();
  let policy = new GrantPolicy([owner]);
  const profile = () => createNativeProfile({ policy, owner: policy.authenticate(owner.token),
    resolveSkill: async () => { throw Error('No fixture skills'); }, connectMcp: async () => ({ sources: [], close: async () => {} }) });
  let store = await Store.open({ ...temp.options, profile: profile() });
  const row = await store.create({ name: 'actual-bb-root', cwd: temp.work, model: faux });
  await store.close();
  const root = { id: 'bb-root', token: 'fixture-bb-root', actor: 'bb-root', source: 'bb', authority: 'human',
    permissions: ['read','write','control'], binding: { sessionId: row.id, conversationId: 1, bb: { providerId: 'pi-durable', threadId: 'bb-root' } } };
  policy = new GrantPolicy([owner, root]);
  store = await Store.open({ ...temp.options, profile: profile() });
  let server: any, proxy: ReturnType<typeof createServer> | undefined;
  const notifications: { method: string; params: Record<string, unknown> }[] = [];
  let coreAllowed = true, malformed = false;
  const coreServer = createServer(async (req, res) => {
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const call = JSON.parse(Buffer.concat(chunks).toString());
    assert.equal(call.method, 'thread/getOwnerScope');
    res.setHeader('content-type', 'application/json');
    if (!coreAllowed) { res.writeHead(403); res.end('{}'); return; }
    res.end(JSON.stringify(malformed ? { providerId: 'wrong-provider', threadId: 'bb-root', providerThreadId: row.id, parentThreadId: null }
      : { providerId: 'pi-durable', threadId: 'bb-root', providerThreadId: call.params.providerThreadId, parentThreadId: null }));
  });
  coreServer.listen(0, '127.0.0.1'); await once(coreServer, 'listening');
  const coreAddress = coreServer.address(); assert.ok(coreAddress && typeof coreAddress === 'object');
  const core: BbCore = {
    async getOwnerScope(providerThreadId) {
      const reply = await fetch(`http://127.0.0.1:${coreAddress.port}`, { method: 'POST', body: JSON.stringify({ method: 'thread/getOwnerScope', params: { providerThreadId } }) });
      if (!reply.ok) throw Error('Core denied'); return reply.json();
    },
    reconcileExisting: async () => { throw Error('Root does not synthesize child history'); },
    notify: (method, params) => { notifications.push({ method, params }); },
  };
  const start = async () => {
    server = createHttpServer(store, policy).listen(0, '127.0.0.1'); await once(server, 'listening');
    return `http://127.0.0.1:${server.address().port}`;
  };
  const stop = async () => { if (server) { server.closeAllConnections(); await new Promise<void>(r => server.close(r)); server = undefined; } await store.close(); };
  let adapter: BbThreadSession | undefined;
  try {
    let base = await start();
    const options = (client: DpiClient) => ({ client, core, providerId: 'pi-durable', sessionId: row.id, conversationId: 1, threadId: 'bb-root', cwd: temp.work });
    const client = new DpiClient(base, root.token);
    const before = await client.agent(row.id, 1).config();
    await assert.rejects(BbThreadSession.open(options(client)), /BINDING_REQUIRED/);
    malformed = true;
    await assert.rejects(BbThreadSession.bindRoot(options(client)), /SCOPE_MISMATCH/);
    assert.equal(await client.agent(row.id, 1).bbBinding('bb-root'), null);
    malformed = false;
    adapter = await BbThreadSession.bindRoot(options(client));
    assert.deepEqual(await adapter.native.config(), before, 'read attach never changes model, thinking, tools or instructions');
    await assert.rejects(BbThreadSession.open({ ...options(client), cwd: temp.work + '/other' }), /NATIVE_SESSION_MISMATCH/);
    await assert.rejects(BbThreadSession.open({ ...options(client), sessionId: 'not-the-selected-session' }));

    // Commit native admission on the real server, lose HTTP ACK, then explicitly retry SAME user key.
    let loseAck = true;
    proxy = createServer(async (req, res) => {
      const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const body = Buffer.concat(chunks);
      const reply = await fetch(base + req.url, { method: req.method, headers: req.headers as Record<string, string>, body: body.length ? body : undefined });
      const payload = await reply.text();
      if (loseAck && req.method === 'POST' && req.url?.endsWith('/messages')) { loseAck = false; res.destroy(); return; }
      res.writeHead(reply.status, { 'content-type': 'application/json' }); res.end(payload);
    });
    proxy.listen(0, '127.0.0.1'); await once(proxy, 'listening');
    const proxyAddress = proxy.address(); assert.ok(proxyAddress && typeof proxyAddress === 'object');
    const uncertain = await BbThreadSession.open(options(new DpiClient(`http://127.0.0.1:${proxyAddress.port}`, root.token)));
    await assert.rejects(uncertain.prompt('ROOT-LOST-ACK', 'creq_23456789ab'));
    const accepted = await uncertain.prompt('ROOT-LOST-ACK', 'creq_23456789ab');
    assert.equal(loseAck, false);
    await assert.rejects(uncertain.prompt('CHANGED-PAYLOAD', 'creq_23456789ab'), { status: 409 });
    await assert.rejects(uncertain.steer('ROOT-LOST-ACK', 'creq_23456789ab'), { status: 409 });
    await until(async () => !(await adapter!.native.get()).busy, 15000, 'root native completion');
    const entries = await adapter.native.entries({ scope: 'all' });
    const inputs = entries.items.filter(e => e.kind === 'host.input');
    assert.equal(inputs.length, 1);
    assert.equal((inputs[0].data as { requestId: string }).requestId, 'bb-root:creq_23456789ab');
    const same = await adapter.prompt('ROOT-LOST-ACK', 'creq_23456789ab');
    assert.equal(same.submissionId, accepted.submissionId);
    assert.ok(entries.items.some(e => e.kind === 'pi.assistant'));
    uncertain.close();

    const signal = new AbortController();
    const observed = adapter.observe(signal.signal);
    await until(async () => notifications.some(n => (n.params.deltas as { kind: string }[] | undefined)?.some(d => d.kind === 'turn.boundary')), 15000, 'real native terminal frame to BB delta');
    signal.abort(); await observed;
    const boundary = notifications.flatMap(n => n.params.deltas as any[]).find(d => d.kind === 'turn.boundary');
    assert.equal(boundary.status, 'completed'); assert.ok(boundary.providerCheckpointId);
    adapter.close(); await assert.rejects(adapter.prompt('AFTER-DETACH', 'creq_23456789ac'), /DETACHED/);
    await stop();
    store = await Store.open({ ...temp.options, profile: profile() }); base = await start();
    adapter = await BbThreadSession.open(options(new DpiClient(base, root.token)));
    const afterReopen = await adapter.prompt('ROOT-LOST-ACK', 'creq_23456789ab');
    assert.equal(afterReopen.submissionId, accepted.submissionId);
    assert.equal((await adapter.native.entries()).items.filter(e => e.kind === 'host.input').length, 1);
    coreAllowed = false;
    await assert.rejects(adapter.prompt('CORE-REVOKED', 'creq_23456789ad'), /Core denied/);
    coreAllowed = true; policy.revoke(root.id);
    await assert.rejects(adapter.prompt('HOST-REVOKED', 'creq_23456789ae'), { status: 401 });
  } finally {
    adapter?.close(); proxy?.closeAllConnections(); if (proxy) await new Promise<void>(r => proxy!.close(() => r()));
    coreServer.closeAllConnections(); await new Promise<void>(r => coreServer.close(() => r()));
    await stop(); await temp.cleanup();
  }
});
