import assert from 'node:assert/strict';
import { test } from 'node:test';
import { once } from 'node:events';
import { BACKGROUND_CONTEXT as ctx } from '@earendil-works/chord/context';
import { fauxProvider, fauxAssistantMessage } from '@earendil-works/pi-ai/providers/faux';
import { Store } from '/tmp/dpi-packed-PupzPZ/install/node_modules/dpi-backend/dist/dpi-backend/src/store.js';
import { createHttpServer } from '/tmp/dpi-packed-PupzPZ/install/node_modules/dpi-backend/dist/dpi-backend/src/http-server.js';
import { GrantPolicy, type GrantSpec } from '/tmp/dpi-packed-PupzPZ/install/node_modules/dpi-backend/dist/dpi-backend/src/grants.js';
import { createNativeProfile } from '/tmp/dpi-packed-PupzPZ/install/node_modules/dpi-backend/dist/dpi-backend/src/native-profile/profile.js';
import { DpiClient } from '/tmp/dpi-packed-PupzPZ/install/node_modules/dpi-sdk/dist/client.js';
import type { NativeBbOutcome, NativeParentReceipt } from '/tmp/dpi-packed-PupzPZ/install/node_modules/dpi-sdk/dist/api.js';
import { projectCoherentHistory, type HistoricalSnapshot } from './history-projector.ts';
import { tempStore, faux, until } from './helpers.ts';

const owner: GrantSpec = { id: 'owner', token: 'fixture-outcome-owner', actor: 'owner', source: 'terminal', authority: 'human',
  permissions: ['read', 'write', 'control', 'filesystem', 'human-accept'], binding: {} };
const exact = (r: NativeParentReceipt) => ({ key: r.childKey!, conversationId: r.conversationId!, executionId: r.executionId!, requestId: r.requestId! });

test('scoped SDK captures actual coherent child receipts/history across working, completion, stop, late input and reopen', { timeout: 45000 }, async () => {
  const temporary = await tempStore();
  let policy = new GrantPolicy([owner]);
  const build = () => createNativeProfile({ policy, owner: policy.authenticate(owner.token),
    resolveSkill: async () => { throw Error('No fixture skills'); }, connectMcp: async () => ({ sources: [], close: async () => {} }) });
  let store = await Store.open({ ...temporary.options, profile: build() });
  let server: ReturnType<typeof createHttpServer> | undefined;
  let release: (() => void) | undefined;
  const controllers: AbortController[] = [], streams: Promise<void>[] = []; 
  const start = async () => {
    server = createHttpServer(store, policy).listen(0, '127.0.0.1'); await once(server, 'listening');
    const address = server.address(); assert.ok(address && typeof address === 'object'); return `http://127.0.0.1:${address.port}`;
  };
  const stop = async () => {
    if (server) { server.closeAllConnections(); await new Promise<void>(resolve => server!.close(() => resolve())); server = undefined; }
    await store.close();
  };
  try {
    const A = await store.create({ name: 'A', cwd: temporary.work, model: faux });
    const B = await store.create({ name: 'B', cwd: temporary.work, model: faux });
    await store.close();
    const bb = (id: string, sessionId: string): GrantSpec => ({ id, token: `fixture-${id}`, actor: id, source: 'bb', authority: 'delegated',
      permissions: ['read', 'write', 'control'], binding: { sessionId, conversationId: 1, bb: { providerId: 'fixture-provider', threadId: id } } });
    policy = new GrantPolicy([owner, bb('bb-a', A.id), bb('bb-b', B.id)]);
    store = await Store.open({ ...temporary.options, profile: build() });
    let base = await start();
    let a = new DpiClient(base, 'fixture-bb-a').agent(A.id, 'main');
    const b = new DpiClient(base, 'fixture-bb-b').agent(B.id, 'main');
    await a.bindBbThread('bb-a', { kind: 'root' }); await b.bindBbThread('bb-b', { kind: 'root' });
    assert.equal((await a.bbOutcome('bb-a')).status, 'unknown', 'unowned root is not a native child execution');
    const fake = fauxProvider({ provider: 'faux', models: [{ id: 'echo', contextWindow: 128000, maxTokens: 8192 }], tokensPerSecond: 100000 });
    let calls = 0;
    let held = new Promise<void>(resolve => { release = resolve; });
    fake.setResponses(Array.from({ length: 40 }, () => async transcript => {
      const user = transcript.messages.findLast(message => message.role === 'user');
      const content = typeof user?.content === 'string' ? user.content : user?.content.map(item => item.type === 'text' ? item.text : '').join('') ?? '';
      if (content.startsWith('Subagent ')) return fauxAssistantMessage('Native parent report acknowledged.');
      if (content.includes('Provider failure fixture')) return fauxAssistantMessage('', { stopReason: 'error', errorMessage: 'SYNTHETIC_COHERENT_PROVIDER_SECRET' });
      if (['Wait for fixture', 'Named host input', 'Pending fixture'].some(text => content.includes(text))) {
        calls++;
        if (!content.includes('Named host input')) await held;
        return fauxAssistantMessage('COHERENT_CHILD_ANSWER');
      }
      return fauxAssistantMessage('Fixture parent acknowledgment.');
    }));
    store.models.setProvider(fake.provider);
    const spawned = await a.parentCommand({ action: 'spawn', controlId: 'coherent-child', expectedRevision: (await a.parentControl()).revision,
      name: 'coherent-child', task: 'Wait for fixture then answer.' });
    const target = exact(spawned);
    assert.equal((await a.parentControl(target)).parentId, 1);
    await assert.rejects(a.parentControl({ ...target, executionId: 'wrong-execution' }), { status: 409 });
    await assert.rejects(b.parentControl(target), { status: 403 });
    await assert.rejects(a.parentControl({ key: target.key, conversationId: target.conversationId } as never), { status: 400 });
    await a.bindBbThread('child', { kind: 'child', target });
    const observed: NativeBbOutcome[] = [];
    const observe = () => {
      const controller = new AbortController(); controllers.push(controller);
      const done = (async () => { for await (const outcome of a.bbOutcomes('child', controller.signal)) observed.push(outcome); })();
      streams.push(done); return { controller, done };
    };
    const firstViewer = observe();
    await until(async () => observed.some(outcome => outcome.status === 'working'), 5000, 'native coherent SSE working hint');
    firstViewer.controller.abort(); await firstViewer.done;
    assert.equal((await a.bbOutcome('child')).status, 'working', 'closing a coherent viewer does not abort held native work');
    observe();
    await until(async () => calls === 1, 5000, 'native faux generation');
    let captured: NativeBbOutcome = await a.bbOutcome('child');
    await until(async () => { captured = await a.bbOutcome('child'); return captured.status === 'working'; }, 5000, 'coherent working frame');
    release!();
    await until(async () => { captured = await a.bbOutcome('child'); return captured.status === 'completed'; }, 5000, 'canonical completed receipt');
    assert.equal(captured.status, 'completed');
    if (captured.status !== 'completed') throw Error('Expected coherent completed frame');
    await until(async () => observed.some(outcome => outcome.status === 'completed'), 5000, 'native receipt settlement emits coherent terminal SSE');
    const first = captured;
    assert.equal(first.conversationId, target.conversationId); assert.equal(first.parentConversationId, 1);
    assert.equal(first.requestId, target.requestId); assert.ok(first.entries.some(entry => entry.id === first.answer));
    assert.ok(first.inputs?.some(input => input.requestId === first.requestId)); assert.equal(first.agent?.model, 'faux/echo');
    await a.parentCommand({ controlId: 'stop-completed', action: 'stop', expectedRevision: (await a.parentControl()).revision, target, scope: 'child-tree' });
    captured = await a.bbOutcome('child'); assert.equal(captured.status, 'completed', 'stop does not relabel a previously canonical answer');
    assert.equal(calls, 1);
    const answer = await new DpiClient(base, owner.token).agent(A.id, target.conversationId).send('Named host input after original execution', 'followUp', 'later-host-input', 10000);
    assert.equal(answer.status, 'done');
    await until(async () => { captured = await a.bbOutcome('child'); return captured.status === 'completed' && captured.submissionId === answer.submissionId; }, 5000, 'latest canonical host.input receipt');
    assert.equal(calls, 2);
    // Real native stop of a pending generation; release provider only after its actual native abort mark exists.
    held = new Promise<void>(resolve => { release = resolve; });
    const next = await a.parentCommand({ action: 'send', controlId: 'bb-child:pending-execution', expectedRevision: (await a.parentControl()).revision, target, task: 'Pending fixture generation.' });
    assert.equal(next.requestId, 'bb-child:pending-execution', 'true native request, never a client-side receipt alias');
    await until(async () => calls === 3, 5000, 'pending native send');
    const stopPending = a.parentCommand({ action: 'stop', controlId: 'stop-pending', expectedRevision: (await a.parentControl()).revision, target: exact(next), scope: 'child-tree' });
    const h = store.harness(store.resolveSession(A.id));
    await until(async () => (await h.inspect(ctx)).tasks.some(task => task.record.conversationId === target.conversationId && task.record.abortRequested), 5000, 'native abort mark');
    release!(); await stopPending;
    await until(async () => { captured = await a.bbOutcome('child'); return captured.status === 'interrupted'; }, 5000, 'canonical aborted receipt');
    await until(async () => observed.some(outcome => outcome.status === 'interrupted'), 5000, 'native abort receipt observed without client polling');
    for (const controller of controllers) controller.abort(); await Promise.all(streams);
    const interrupted = await a.bbOutcome('child');
    if (interrupted.status !== 'interrupted') throw Error('Expected interrupted receipt');
    assert.equal(interrupted.requestId, next.requestId); assert.ok(interrupted.submissionId);
    await assert.rejects(a.bbOutcome('foreign-thread'), { status: 403 });
    await assert.rejects(new DpiClient(base, owner.token).agent(A.id, 'main').bbOutcome('child'), { status: 403 });
    await stop(); store = await Store.open({ ...temporary.options, profile: build() }); base = await start();
    a = new DpiClient(base, 'fixture-bb-a').agent(A.id, 'main');
    assert.deepEqual(await a.bbOutcome('child'), interrupted); assert.equal(calls, 3, 'capture/reopen never starts another model request');
    const nativeChild = (await store.resolveAgent(A.id, String(target.conversationId))).c;
    await nativeChild.configure({ model: null }, ctx);
    const missingModel = await new DpiClient(base, owner.token).agent(A.id, target.conversationId).send('Canonical no-model failure', 'followUp', 'missing-model', 10000);
    assert.equal(missingModel.status, 'unanswered');
    const failed = await a.bbOutcome('child'); assert.equal(failed.status, 'failed');
    if (failed.status !== 'failed') throw Error('Expected canonical failure');
    assert.equal(failed.submissionId, missingModel.submissionId);
    store.models.setProvider(fake.provider);
    await nativeChild.configure({ model: faux }, ctx);
    const providerFailure = await new DpiClient(base, owner.token).agent(A.id, target.conversationId).send('Provider failure fixture', 'followUp', 'provider-failure', 15000);
    assert.equal(providerFailure.status, 'unanswered');
    const publicFailure = await a.bbOutcome('child'); assert.equal(publicFailure.status, 'failed');
    assert.match(JSON.stringify((await nativeChild.entries({}, 1000, undefined, ctx)).items), /SYNTHETIC_COHERENT_PROVIDER_SECRET/);
    assert.doesNotMatch(JSON.stringify(publicFailure), /SYNTHETIC_COHERENT_PROVIDER_SECRET/);
    const storage = store.opened.get(A.id)!.storage, scan = storage.scanSubmissions.bind(storage);
    let changed = false;
    storage.scanSubmissions = async (...args) => {
      const page = await scan(...args);
      if (!changed) { changed = true; await nativeChild.submit({ type: 'write', entry: { kind: 'fixture.concurrent', data: null } }, ctx); }
      return page;
    };
    try { assert.deepEqual(await a.bbOutcome('child'), { status: 'unknown', reason: 'concurrent-change' }); }
    finally { storage.scanSubmissions = scan; }
    await nativeChild.configure({ model: null }, ctx);
    const unnamed = await nativeChild.submit({ type: 'input', content: 'Native input without a request ID' }, ctx);
    await unnamed.wait(ctx);
    assert.deepEqual(await a.bbOutcome('child'), { status: 'unknown', reason: 'receipt-unavailable' }, 'never attribute the latest unnamed input to an older named receipt');
    // The exact selected original Core predicate must accept the actual canonical native send.
    const coreChild = await a.parentCommand({ action: 'spawn', controlId: 'core-child', name: 'core-child', task: 'Core child bootstrap.', expectedRevision: (await a.parentControl()).revision });
    const coreTarget = exact(coreChild);
    await a.bindBbThread('core-child', { kind: 'child', target: coreTarget });
    const coreSend = { action: 'send' as const, controlId: 'bb-child:core-1', target: coreTarget, task: 'Core admission fixture', expectedRevision: (await a.parentControl()).revision };
    const coreReceipt = await a.parentCommand(coreSend); assert.equal(coreReceipt.requestId, 'bb-child:core-1');
    assert.deepEqual(await a.parentCommand(coreSend), coreReceipt);
    let coreFrame = await a.bbOutcome('core-child');
    await until(async () => { coreFrame = await a.bbOutcome('core-child'); return coreFrame.status === 'completed' && coreFrame.requestId === coreReceipt.requestId; }, 5000, 'actual native Core request receipt');
    const coreSnapshot = projectCoherentHistory(coreFrame).snapshot;
    assert.equal(nativeControlWasAdmitted({ requestId: 'core-1', input: [{ type: 'text', text: coreSend.task }] }, coreSnapshot), true);
    assert.equal(nativeControlWasAdmitted({ requestId: 'wrong-id', input: [{ type: 'text', text: coreSend.task }] }, coreSnapshot), false);
    assert.equal(nativeControlWasAdmitted({ requestId: 'core-1', input: [{ type: 'text', text: 'Different body' }] }, coreSnapshot), false);
    let revoked = false;
    storage.scanSubmissions = async (...args) => {
      const page = await scan(...args);
      if (!revoked) { revoked = true; policy.revoke('bb-a'); }
      return page;
    };
    try { await assert.rejects(a.bbOutcome('child'), { status: 401 }); assert.equal(revoked, true); }
    finally { storage.scanSubmissions = scan; }
    assert.equal(calls, 3);
  } finally { for (const controller of controllers) controller.abort(); release?.(); await Promise.allSettled(streams); await stop(); await temporary.cleanup(); }
});

// Exact original selected B compat/source/bb-0.47.1.patch:2665-2672; provenance only, never authority.
function nativeControlWasAdmitted(control: { requestId: string; input: unknown }, snapshot: HistoricalSnapshot): boolean {
  const receipt = snapshot.inputs?.find(receipt => receipt.requestId === `bb-child:${control.requestId}`);
  const nativeText = receipt && snapshot.items.filter(item => item.source.entryId === receipt.entryId && item.item.type === 'userMessage')
    .flatMap(item => item.item.type === 'userMessage' ? item.item.content.map(block => block.text) : []).join('\n').trim();
  const controlText = Array.isArray(control.input) && control.input.every(block => block?.type === 'text' && typeof block.text === 'string')
    ? control.input.map(block => block.text).join('\n').trim() : undefined;
  return receipt !== undefined && nativeText === controlText;
}
