import assert from 'node:assert/strict';
import { test } from 'node:test';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { DpiClient } from 'dpi-sdk/client';
import { BbProviderBridge } from '../src/provider-bridge.js';
import { fixtureProfileFactory } from './native-fixture.mjs';

const { Store } = await import(new URL('../../dpi-backend/src/store.ts', import.meta.url).href);
const { createHttpServer } = await import(new URL('../../dpi-backend/src/http-server.ts', import.meta.url).href);
const { GrantPolicy } = await import(new URL('../../dpi-backend/src/grants.ts', import.meta.url).href);
const { tempStore, faux, until } = await import(new URL('../../dpi-backend/tests/helpers.ts', import.meta.url).href);
const originalContract = '/home/ubuntu/Projects/master/experiments/pi-durable-1.4-upgrade/provider-lane/src/bb-compat/native-history-contract.ts';
const { nativeHistoryRequestSchema } = await import(originalContract);
const originalBridgeSdk = '/home/ubuntu/Projects/master/experiments/pi-durable-1.4-upgrade/provider-lane/node_modules/@get-bb/plugin-sdk/dist/provider-bridge.js';
const { providerHealthResultSchema } = await import(originalBridgeSdk);

const owner = { id: 'owner', token: 'bridge-fixture-owner', actor: 'owner', source: 'terminal', authority: 'human',
  permissions: ['read','write','control','filesystem','human-accept'], binding: {} };

for (const prepared of [false, true]) test(`actual selected BB JSON-RPC methods drive native SDK root and automatic existing child projection (prepared=${prepared}), never a RunnerProcess`, { timeout: 50000 }, async () => {
  const temp = await tempStore(); let policy = new GrantPolicy([owner]);
  let store = await Store.open({ ...temp.options, profile: await fixtureProfileFactory(policy, owner.token) });
  const session = await store.create({ name: 'stdio-bridge', cwd: temp.work, model: faux, thinkingLevel: 'off' });
  await store.close();
  const bb = { id: 'bb', token: 'bridge-fixture-bb', actor: 'bb', source: 'bb', authority: 'human', permissions: ['read','write','control'],
    binding: { sessionId: session.id, conversationId: 1, bb: { providerId: 'pi-durable', threadId: 'bridge-root' } } };
  policy = new GrantPolicy([owner, bb]);
  store = await Store.open({ ...temp.options, profile: await fixtureProfileFactory(policy, owner.token) });
  const server = createHttpServer(store, policy).listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert.ok(address && typeof address === 'object');
  const client = new DpiClient(`http://127.0.0.1:${address.port}`, bb.token);
  const native = client.agent(session.id, 1);
  const output: any[] = [], responses = new Map<number, any>();
  let confirmations = 0, registrations = 0, alias: { threadId: string; conversationId: string } | undefined;
  let digest: string | null = null, json: string | undefined;
  let bridge: BbProviderBridge;
  const sendRaw = (line: string) => {
    const message = JSON.parse(line); output.push(message);
    if (typeof message.id === 'number' && message.method === undefined) { responses.set(message.id, message); return; }
    if (typeof message.id !== 'string' || !message.method) return;
    const params = message.params; let result: unknown;
    if (message.method === 'thread/confirmRootAttachment') {
      confirmations++; assert.equal(params.providerThreadId, session.id);
      assert.equal(params.enrollmentFingerprint, 'synthetic-enrollment'); assert.equal(params.rootProfileFingerprint, 'synthetic-profile');
      result = { threadId: 'bridge-root' };
    } else if (message.method === 'thread/getOwnerScope') {
      if (!confirmations && !output.some(event => event.method === 'thread/identity' && event.params.threadId === 'bridge-root' && event.params.providerThreadId === session.id)) {
        queueMicrotask(() => { void bridge.handleLine(JSON.stringify({ jsonrpc: '2.0', id: message.id, error: { code: -32000, message: 'Owner scope unavailable' } })); });
        return;
      }
      const child = alias && params.providerThreadId === `${session.id}:${alias.conversationId}`;
      result = { providerId: 'pi-durable', threadId: child ? alias!.threadId : 'bridge-root', providerThreadId: params.providerThreadId, parentThreadId: child ? 'bridge-root' : null };
    } else if (message.method === 'thread/registerExisting') {
      if (!alias) { registrations++; alias = { threadId: 'bridge-child', conversationId: params.conversationId }; }
      assert.equal(params.sessionId, session.id); assert.equal(params.parentThreadId, 'bridge-root'); result = { threadId: alias.threadId };
    } else if (message.method === 'thread/reconcileExisting') {
      assert.ok(alias); assert.equal(params.threadId, alias.threadId);
      const parsed = nativeHistoryRequestSchema.parse({ ...params, providerId: 'pi-durable', providerThreadId: `${session.id}:${alias.conversationId}` });
      if (!parsed.snapshot) result = { threadId: alias.threadId, digest, changed: false };
      else {
        const next = JSON.stringify(parsed.snapshot), changed = next !== json;
        if (changed) { assert.equal(params.expectedDigest, digest); json = next; digest = createHash('sha256').update(next).digest('hex'); }
        result = { threadId: alias.threadId, digest, changed };
      }
    } else throw Error(`Unexpected reverse Core method ${message.method}`);
    queueMicrotask(() => { void bridge.handleLine(JSON.stringify({ jsonrpc: '2.0', id: message.id, result })); });
  };
  const options = { client, providerId: 'pi-durable', sessionId: session.id, conversationId: 1, threadId: 'bridge-root', cwd: temp.work,
    rootAttachment: prepared ? { enrollmentFingerprint: 'synthetic-enrollment', rootProfileFingerprint: 'synthetic-profile' } : undefined };
  bridge = new BbProviderBridge(sendRaw, options);
  let id = 0;
  const request = async (method: string, params: Record<string, unknown> = {}) => {
    const current = ++id; await bridge.handleLine(JSON.stringify({ jsonrpc: '2.0', id: current, method, params }));
    const response = responses.get(current); assert.ok(response, `response ${method}`); return response;
  };
  try {
    assert.equal((await request('initialize')).result.capabilities.fork, 'none');
    const health = providerHealthResultSchema.parse((await request('provider/health')).result);
    assert.equal(health.supported, true); assert.equal(health.health.status, 'ready');
    assert.equal(health.health.canInstall, false); assert.equal(health.health.canUpdate, false);
    await assert.rejects(client.session(session.id).models(), { status: 403 }, 'no grant widening for session-level discovery');
    const models = (await request('model/list')).result.models;
    assert.equal(models[0].id, 'faux/echo'); assert.equal(models[0].isDefault, true);
    assert.ok(models[0].supportedReasoningEfforts.some((effort: any) => effort.reasoningEffort === 'max'), 'native max is not renamed or invented');
    assert.ok((await request('thread/start', { threadId: 'bridge-root', providerThreadId: 'OTHER-SESSION' })).error);
    assert.equal(confirmations, 0); assert.equal(await native.bbBinding('bridge-root'), null);
    assert.ok((await request('thread/start', { threadId: 'bridge-root', cwd: temp.work + '/wrong' })).error);
    assert.equal(confirmations, 0); assert.equal(await native.bbBinding('bridge-root'), null);
    const environmentBefore = { ...process.env };
    const coreEnv = { PATH: process.env.PATH!, BB_CLI: '/transport/bb', BB_SERVER_URL: 'http://127.0.0.1:41686',
      BB_HOST_DAEMON_PORT: '41687', BB_PROJECT_ID: 'proj_fixture', BB_THREAD_STORAGE: '/transport/thread-storage',
      BB_THREAD_ID: 'bridge-root', BB_ENVIRONMENT_ID: 'env_fixture' };
    for (const options of [
      { envVars: { ...coreEnv, NODE_OPTIONS: '--import=/untrusted.mjs' } },
      { envVars: { ...coreEnv, LD_PRELOAD: '/untrusted.so' } },
      { envVars: { ...coreEnv, PATH: '/untrusted/bin' } },
      { envVars: { ...coreEnv, BB_THREAD_ID: 'foreign-thread' } },
      { envVars: { ...coreEnv, BB_PROJECT_ID: 42 } },
    ]) {
      const denied = await request('thread/start', { threadId: 'bridge-root', shellEnvOverrides: {}, options });
      assert.equal(denied.error?.message, 'BB_SHARED_HOST_ENV_IMMUTABLE');
    }
    assert.equal((await request('thread/start', { threadId: 'bridge-root', options: { envVars: coreEnv }, shellEnvOverrides: { PATH: '/untrusted/bin' } })).error?.message, 'BB_SHARED_HOST_ENV_IMMUTABLE');
    assert.equal((await request('thread/start', { threadId: 'bridge-root', cwd: temp.work, options: { cwd: '/other-root' } })).error?.message, 'BB_OWNER_CWD_IMMUTABLE');
    assert.equal(confirmations, 0); assert.equal(await native.bbBinding('bridge-root'), null);
    const invalidNative = new BbProviderBridge(sendRaw, { ...options, cwd: temp.work + '/not-native' });
    const invalidNativeId = ++id;
    await invalidNative.handleLine(JSON.stringify({ jsonrpc: '2.0', id: invalidNativeId, method: 'thread/start', params: { threadId: 'bridge-root' } }));
    assert.ok(responses.get(invalidNativeId)?.error);
    await invalidNative.shutdown();
    assert.equal(confirmations, 0);
    assert.ok(!output.some(event => event.method === 'thread/identity'), 'mismatched native Root cannot publish identity or confirm enrollment');
    const started = await request('thread/start', { threadId: 'bridge-root', providerThreadId: session.id, model: 'faux/echo', thinkingLevel: 'max', options: { envVars: coreEnv } });
    assert.equal(started.result.providerThreadId, session.id); assert.equal(confirmations, prepared ? 1 : 0);
    assert.equal((await native.config()).thinkingLevel, 'off', 'read attachment defers BB selection until explicit execution');
    assert.ok((await request('turn/start', { threadId: 'bridge-root', providerThreadId: 'forged', clientRequestId: 'creq_23456789ab', input: [{ type: 'text', text: 'WRONG' }] })).error);
    assert.equal((await native.entries()).items.filter(entry => entry.kind === 'host.input').length, 0);
    const first = await request('turn/start', { threadId: 'bridge-root', options: { envVars: coreEnv }, clientRequestId: 'creq_23456789ab', input: [{ type: 'text', text: 'ROOT-BRIDGE' }] });
    assert.equal(first.result.threadId, 'bridge-root'); assert.equal((await native.config()).thinkingLevel, 'max');
    await until(async () => output.some(event => event.method === 'thread/delta' && event.params.deltas.some((delta: any) => delta.kind === 'turn.boundary' && delta.status === 'completed')), 15000, 'successful root native turn reaches actual BB delta grammar');
    assert.ok((await native.entries()).items.some(entry => entry.kind === 'pi.assistant' && JSON.stringify(entry.model).includes('Echo: ROOT-BRIDGE')), 'genuine native answer, not merely an error boundary/input ACK');
    assert.ok(!(await request('turn/start', { threadId: 'bridge-root', clientRequestId: 'creq_23456789ab', input: [{ type: 'text', text: 'ROOT-BRIDGE' }] })).error);
    assert.equal((await native.entries()).items.filter(entry => entry.kind === 'host.input').length, 1);
    const created = await native.parentCommand({ action: 'spawn', controlId: 'actual-native-existing-child', expectedRevision: (await native.parentControl()).revision,
      name: 'native-existing', task: 'Initial existing native child.' });
    await until(async () => registrations === 1 && !!json, 15000, 'automatic native existing-child registration and authorized coherent history');
    assert.equal(alias!.conversationId, String(created.conversationId));
    const childStart = await request('thread/start', { threadId: 'bridge-child', providerThreadId: `${session.id}:${created.conversationId}` });
    assert.equal(childStart.result.providerThreadId, `${session.id}:${created.conversationId}`);
    const beforeConnectionNotice = output.length;
    Reflect.apply(Reflect.get(bridge, 'unavailable'), bridge, ['bridge-child']);
    assert.ok(!output.slice(beforeConnectionNotice).some(event => event.method === 'thread/delta' && event.params.threadId === 'bridge-child'),
      'connection failure must not poison a native-owned child transcript with a live Core diagnostic item');
    Reflect.apply(Reflect.get(bridge, 'unavailable'), bridge, ['bridge-root']);
    assert.ok(output.slice(beforeConnectionNotice).some(event => event.method === 'thread/delta' && event.params.threadId === 'bridge-root'),
      'Root retains its ordinary live Core connection diagnostic');
    const childInput = await request('turn/start', { threadId: 'bridge-child', providerThreadId: `${session.id}:${created.conversationId}`,
      clientRequestId: 'creq_23456789ac', input: [{ type: 'text', text: 'CHILD-BRIDGE' }] });
    assert.equal(childInput.result.threadId, 'bridge-child');
    await until(async () => !!json?.includes('Echo: CHILD-BRIDGE') && JSON.parse(json).status === 'completed' && json.includes('bb-child:creq_23456789ac'), 15000, 'child source-compatible Core request reaches true successful native answer/receipt/history');
    assert.ok(!(await request('thread/stop', { threadId: 'bridge-root', intent: 'release' })).error);
    assert.ok(!(await request('turn/steer', { threadId: 'bridge-child', providerThreadId: `${session.id}:${created.conversationId}`,
      clientRequestId: 'creq_23456789ad', input: [{ type: 'text', text: 'CHILD-AFTER-ROOT-DETACH' }] })).error, 'existing child survives Root view release without re-provision');
    await until(async () => !!json?.includes('Echo: CHILD-AFTER-ROOT-DETACH') && JSON.parse(json).status === 'completed', 15000, 'child-only successful native answer after shared Root view detach');
    assert.ok((await request('thread/fork', { threadId: 'no-fork' })).error);
    assert.ok((await request('provider/installation/run')).error);
    assert.ok((await request('skills/configure')).error, 'no fake applied native skill configuration');
    assert.ok(!JSON.stringify(output).includes(bb.token));
    assert.deepEqual({ ...process.env }, environmentBefore, 'Core launch context never mutates the shared execution environment');
  } finally {
    await bridge.shutdown(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    await store.close(); await temp.cleanup();
  }
});
