import assert from 'node:assert/strict';
import { test } from 'node:test';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { DpiClient } from 'dpi-sdk/client';
import { BbProviderBridge } from 'file:///tmp/dave-bb-gate.OLMWRo/final-client/node_modules/dpi-bb-adapter/dist/provider-bridge.js';
import { fixtureProfileFactory } from './latency-native-fixture.mjs';

const { Store } = await import("file:///tmp/dpi-bb-packed-ji7o5v/fresh/node_modules/dpi-backend/dist/dpi-backend/src/store.js");
const { createHttpServer } = await import("file:///tmp/dpi-bb-packed-ji7o5v/fresh/node_modules/dpi-backend/dist/dpi-backend/src/http-server.js");
const { GrantPolicy } = await import("file:///tmp/dpi-bb-packed-ji7o5v/fresh/node_modules/dpi-backend/dist/dpi-backend/src/grants.js");
const { tempStore, faux, until } = await import("file:///tmp/alice-bb-immutable.SHCqB2/tests/backend-helpers.mts");
const originalContract = '/home/ubuntu/Projects/master/experiments/pi-durable-1.4-upgrade/provider-lane/src/bb-compat/native-history-contract.ts';
const { nativeHistoryRequestSchema } = await import(originalContract);

const owner = { id: 'owner', token: 'bridge-fixture-owner', actor: 'owner', source: 'terminal', authority: 'human',
  permissions: ['read','write','control','filesystem','human-accept'], binding: {} };

test('Independent same-metric native tool commit to BB visibility (50 samples)', { timeout: 50000 }, async () => {
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
  const commitTimes = new Map<string, bigint>(), localMs = new Map<string, number>(), remoteMs = new Map<string, number>();
  const visible = (deltas: unknown, mode: 'local' | 'remote') => {
    const now = process.hrtime.bigint(), serialized = JSON.stringify(deltas);
    for (const [marker, stamp] of commitTimes) if (serialized.includes(marker)) {
      const target = mode === 'local' ? localMs : remoteMs;
      if (!target.has(marker)) target.set(marker, Number(now - stamp) / 1e6);
    }
  };
  const output: any[] = [], responses = new Map<number, any>();
  let confirmations = 0, registrations = 0, alias: { threadId: string; conversationId: string } | undefined;
  let digest: string | null = null, json: string | undefined;
  let bridge: BbProviderBridge;
  const sendRaw = (line: string) => {
    const message = JSON.parse(line); if (message.method === 'thread/delta') visible(message.params.deltas, 'remote'); output.push(message);
    if (typeof message.id === 'number' && message.method === undefined) { responses.set(message.id, message); return; }
    if (typeof message.id !== 'string' || !message.method) return;
    const params = message.params; let result: unknown;
    if (message.method === 'thread/confirmRootAttachment') {
      confirmations++; assert.equal(params.providerThreadId, session.id);
      assert.equal(params.enrollmentFingerprint, 'synthetic-enrollment'); assert.equal(params.rootProfileFingerprint, 'synthetic-profile');
      result = { threadId: 'bridge-root' };
    } else if (message.method === 'thread/getOwnerScope') {
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
    rootAttachment: { enrollmentFingerprint: 'synthetic-enrollment', rootProfileFingerprint: 'synthetic-profile' } };
  bridge = new BbProviderBridge(sendRaw, options);
  let id = 0;
  const request = async (method: string, params: Record<string, unknown> = {}) => {
    const current = ++id; await bridge.handleLine(JSON.stringify({ jsonrpc: '2.0', id: current, method, params }));
    const response = responses.get(current); assert.ok(response, `response ${method}`); return response;
  };
  try {
    assert.equal((await request('initialize')).result.capabilities.fork, 'none');
    await assert.rejects(client.session(session.id).models(), { status: 403 }, 'no grant widening for session-level discovery');
    const models = (await request('model/list')).result.models;
    assert.equal(models[0].id, 'faux/echo'); assert.equal(models[0].isDefault, true);
    assert.ok(models[0].supportedReasoningEfforts.some((effort: any) => effort.reasoningEffort === 'max'), 'native max is not renamed or invented');
    assert.ok((await request('thread/start', { threadId: 'bridge-root', providerThreadId: 'OTHER-SESSION' })).error);
    assert.equal(confirmations, 0); assert.equal(await native.bbBinding('bridge-root'), null);
    assert.ok((await request('thread/start', { threadId: 'bridge-root', cwd: temp.work + '/wrong' })).error);
    assert.equal(confirmations, 0); assert.equal(await native.bbBinding('bridge-root'), null);
    const started = await request('thread/start', { threadId: 'bridge-root', providerThreadId: session.id, model: 'faux/echo', thinkingLevel: 'max' });
    assert.equal(started.result.providerThreadId, session.id); assert.equal(confirmations, 1);
    assert.equal((await native.config()).thinkingLevel, 'off', 'read attachment defers BB selection until explicit execution');
    assert.ok((await request('turn/start', { threadId: 'bridge-root', providerThreadId: 'forged', clientRequestId: 'creq_23456789ab', input: [{ type: 'text', text: 'WRONG' }] })).error);
    assert.equal((await native.entries()).items.filter(entry => entry.kind === 'host.input').length, 0);
    const first = await request('turn/start', { threadId: 'bridge-root', clientRequestId: 'creq_23456789ab', input: [{ type: 'text', text: 'ROOT-BRIDGE' }] });
    assert.equal(first.result.threadId, 'bridge-root'); assert.equal((await native.config()).thinkingLevel, 'max');
    await until(async () => output.some(event => event.method === 'thread/delta' && event.params.deltas.some((delta: any) => delta.kind === 'turn.boundary' && delta.status === 'completed')), 15000, 'successful root native turn reaches actual BB delta grammar');
    assert.ok((await native.entries()).items.some(entry => entry.kind === 'pi.assistant' && JSON.stringify(entry.model).includes('Echo: ROOT-BRIDGE')), 'genuine native answer, not merely an error boundary/input ACK');
    assert.ok(!(await request('turn/start', { threadId: 'bridge-root', clientRequestId: 'creq_23456789ab', input: [{ type: 'text', text: 'ROOT-BRIDGE' }] })).error);
    assert.equal((await native.entries()).items.filter(entry => entry.kind === 'host.input').length, 1);
    // SAME native durable tool-result commit -> SAME BB delta-visible callback, before/after SDK transport.
    const { DeltaTranslator } = await import('/home/ubuntu/Projects/master/experiments/pi-durable-1.4-upgrade/provider-lane/src/projection/host/delta-translator.ts');
    const { writeFile } = await import('node:fs/promises');
    const baseline = new DeltaTranslator(), ownerHarness = store.harness(store.resolveSession(session.id));
    const off = ownerHarness.subscribeCommits((publication: any) => {
      for (const change of publication.changes) if (change.type === 'entry' && change.value.conversationId === 1) {
        const entry = change.value;
        for (const message of entry.model ?? []) {
          if (message.role === 'assistant') for (const part of message.content ?? []) if (part.type === 'toolCall')
            baseline.translate({ type: 'tool_execution_start', toolCallId: part.id, toolName: part.name, args: part.arguments }, { threadId: 'baseline', cwd: temp.work });
          if (message.role !== 'toolResult') continue;
          const result = (message.content ?? []).filter((p: any) => p.type === 'text').map((p: any) => p.text).join('\n');
          const match = result.match(/BB_LATENCY_\d+/); if (!match) continue;
          commitTimes.set(match[0], process.hrtime.bigint());
          const deltas = baseline.translate({ type: 'tool_execution_end', toolCallId: message.toolCallId, toolName: message.toolName, result, isError: message.isError }, { threadId: 'baseline', cwd: temp.work });
          visible(deltas, 'local');
        }
      }
    });
    try {
      const alphabet = '23456789abcdefghijkmnpqrstuvwxyz';
      for (let sample=0; sample<50; sample++) {
        const marker = 'BB_LATENCY_' + sample, filename = 'latency-' + sample + '.txt';
        await writeFile(temp.work + '/' + filename, marker + '\n');
        const id = 'creq_' + ('22222222' + alphabet[Math.floor(sample / alphabet.length)] + alphabet[sample % alphabet.length]);
        const result = await request('turn/start', { threadId: 'bridge-root', clientRequestId: id, input: [{ type: 'text', text: 'BBREADLAT ' + filename }] });
        assert.ok(!result.error, 'actual native read-tool input accepted');
        await until(async () => remoteMs.has(marker), 15000, 'actual native tool result reaches remote BB presentation ' + marker);
      }
    } finally { off(); }
    assert.equal(localMs.size,50); assert.equal(remoteMs.size,50);
    const percentile = (map: Map<string,number>) => [...map.values()].sort((a,b)=>a-b)[Math.ceil(50*0.95)-1];
    const baselineP95 = percentile(localMs), remoteP95 = percentile(remoteMs), budget = 1.2*baselineP95+50;
    const result = { metric: 'native synchronous adopted commit(toolResult) -> BB tool delta visible callback', samples:50, baselineP95,remoteP95,budget,pass:remoteP95<=budget,local:[...localMs],remote:[...remoteMs], scope:'same actual native read-tool commits, original B DeltaTranslator baseline vs installed BB/SDK loopback; synthetic/faux, Core API ingress NOT production BB UI repaint/LLM latency' };
    await writeFile('/tmp/dave-bb-successor-latency.json',JSON.stringify(result,null,2));
    console.log('BB_LATENCY_RESULT',JSON.stringify({baselineP95,remoteP95,budget,pass:result.pass,samples:50}));
    assert.ok(result.pass,'ISC26 same native commit-to-BB-visible metric budget');
    const created = await native.parentCommand({ action: 'spawn', controlId: 'actual-native-existing-child', expectedRevision: (await native.parentControl()).revision,
      name: 'native-existing', task: 'Initial existing native child.' });
    await until(async () => registrations === 1 && !!json, 15000, 'automatic native existing-child registration and authorized coherent history');
    assert.equal(alias!.conversationId, String(created.conversationId));
    const childStart = await request('thread/start', { threadId: 'bridge-child', providerThreadId: `${session.id}:${created.conversationId}` });
    assert.equal(childStart.result.providerThreadId, `${session.id}:${created.conversationId}`);
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
  } finally {
    await bridge.shutdown(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    await store.close(); await temp.cleanup();
  }
});
