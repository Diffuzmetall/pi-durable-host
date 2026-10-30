import assert from 'node:assert/strict';
import { test } from 'node:test';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { DpiClient } from 'dpi-sdk/client';
import type { NativeParentReceipt, NativeParentTarget } from 'dpi-sdk/api';
import { BbThreadSession, type BbCore } from '../src/session.js';
import { BbChildSession } from '../src/child-session.js';
import type { HistoricalSnapshot } from '../src/history-types.js';

const { Store } = await import(new URL('../../dpi-backend/src/store.ts', import.meta.url).href);
const { createHttpServer } = await import(new URL('../../dpi-backend/src/http-server.ts', import.meta.url).href);
const { GrantPolicy } = await import(new URL('../../dpi-backend/src/grants.ts', import.meta.url).href);
const { createNativeProfile } = await import(new URL('../../dpi-backend/src/native-profile/profile.ts', import.meta.url).href);
const { tempStore, faux, until } = await import(new URL('../../dpi-backend/tests/helpers.ts', import.meta.url).href);
const { nativeHistoryRequestSchema } = await import(new URL('./fixtures/native-history-contract.ts', import.meta.url).href);
// Execute the ACTUAL read-only selected Core admission predicate, not a lookalike allowing arbitrary request IDs.
const patch = readFileSync(new URL('./fixtures/native-control.patch', import.meta.url), 'utf8').split('\n');
const startPredicate = patch.findIndex(line => line.startsWith('+export function nativeControlWasAdmitted('));
assert.ok(startPredicate >= 0);
const endPredicate = patch.findIndex((line, index) => index > startPredicate && line === '+}');
const sourcePredicate = patch.slice(startPredicate, endPredicate + 1).map(line => line.slice(1)).join('\n').replace('export function', 'function');
const nativeControlWasAdmitted = runInNewContext(ts.transpile(sourcePredicate, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }) + '\nnativeControlWasAdmitted;') as
  (control: { requestId: string; input: unknown }, snapshot: HistoricalSnapshot) => boolean;
const exact = (r: NativeParentReceipt): Required<NativeParentTarget> => ({ key: r.childKey!, conversationId: r.conversationId!, executionId: r.executionId!, requestId: r.requestId! });
const owner = { id: 'owner', token: 'child-fixture-owner', actor: 'owner', source: 'terminal', authority: 'human',
  permissions: ['read','write','control','filesystem','human-accept'], binding: {} };

test('actual native child registration/history/control: original Core predicate, lost ACK/CAS, stop/reopen/late result and no replacement', { timeout: 65000 }, async () => {
  const temp = await tempStore(); let policy = new GrantPolicy([owner]);
  const profile = () => createNativeProfile({ policy, owner: policy.authenticate(owner.token),
    resolveSkill: async () => { throw Error('No fixture skills'); }, connectMcp: async () => ({ sources: [], close: async () => {} }) });
  let store = await Store.open({ ...temp.options, profile: profile() });
  const A = await store.create({ name: 'bb-child-A', cwd: temp.work, model: faux });
  const B = await store.create({ name: 'bb-child-B', cwd: temp.work, model: faux });
  await store.close();
  const bbGrant = (id: string, sessionId: string) => ({ id, token: `fixture-${id}`, actor: id, source: 'bb', authority: 'human',
    permissions: ['read','write','control'], binding: { sessionId, conversationId: 1, bb: { providerId: 'pi-durable', threadId: id } } });
  const grantA = bbGrant('root-a', A.id), grantB = bbGrant('root-b', B.id);
  policy = new GrantPolicy([owner, grantA, grantB]); store = await Store.open({ ...temp.options, profile: profile() });
  let server: any, coreAllowed = true, loseRegisterAck = true, loseHistoryAck = false;
  let registrations = 0, nativeCaptures = 0, digestReads = 0, mutations = 0;
  let root: BbThreadSession | undefined;
  let digest: string | null = null, snapshotJson: string | undefined;
  const aliases = new Map<string, { threadId: string; conversationId: string }>();
  const writes: { snapshot: HistoricalSnapshot; expectedDigest: string | null }[] = [];
  let pendingControl: { requestId: string; input: { type: string; text: string }[] } | undefined;
  let pendingAdmitted = false;
  const notifications: unknown[] = [];
  const announcedChildren = new Set<string>();
  const coreServer = createServer(async (req, res) => {
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const { method, params } = JSON.parse(Buffer.concat(chunks).toString());
    res.setHeader('content-type', 'application/json');
    if (!coreAllowed) { res.writeHead(403); res.end('{}'); return; } // BEFORE digest/idempotent no-op too.
    if (method === 'thread/getOwnerScope') {
      const child = [...aliases.values()].find(a => `${A.id}:${a.conversationId}` === params.providerThreadId);
      if (params.providerThreadId !== A.id && (!child || !announcedChildren.has(params.providerThreadId))) { res.writeHead(403); res.end('{}'); return; }
      res.end(JSON.stringify({ providerId: 'pi-durable', threadId: child?.threadId ?? 'root-a', providerThreadId: params.providerThreadId, parentThreadId: child ? 'root-a' : null }));
    } else if (method === 'thread/registerExisting') {
      assert.equal(params.sessionId, A.id); assert.equal(params.parentThreadId, 'root-a'); assert.equal(params.parentProviderThreadId, A.id);
      assert.match(params.requestId, /^pi-durable:native:[a-f0-9]{64}$/);
      let alias = aliases.get(params.requestId);
      if (!alias) { registrations++; alias = { threadId: 'child-a', conversationId: params.conversationId }; aliases.set(params.requestId, alias); }
      if (loseRegisterAck) { loseRegisterAck = false; res.destroy(); return; }
      res.end(JSON.stringify({ threadId: alias.threadId }));
    } else if (method === 'thread/reconcileExisting') {
      const alias = [...aliases.values()].find(a => a.threadId === params.threadId);
      if (!alias) { res.writeHead(403); res.end('{}'); return; }
      const parsed = nativeHistoryRequestSchema.parse({ ...params, providerId: 'pi-durable', providerThreadId: `${A.id}:${alias.conversationId}` });
      if (!parsed.snapshot) { digestReads++; res.end(JSON.stringify({ threadId: alias.threadId, digest, changed: false })); return; }
      writes.push({ snapshot: structuredClone(parsed.snapshot), expectedDigest: parsed.expectedDigest });
      if (pendingControl && !nativeControlWasAdmitted(pendingControl, parsed.snapshot)) {
        res.end(JSON.stringify({ threadId: alias.threadId, digest, changed: false, deferred: true })); return;
      }
      if (pendingControl) pendingAdmitted = true;
      const json = JSON.stringify(parsed.snapshot);
      const changed = json !== snapshotJson;
      if (changed && parsed.expectedDigest !== digest) { res.writeHead(409); res.end('{}'); return; }
      if (changed) { mutations++; snapshotJson = json; digest = createHash('sha256').update(json).digest('hex'); }
      if (loseHistoryAck) { loseHistoryAck = false; res.destroy(); return; }
      res.end(JSON.stringify({ threadId: alias.threadId, digest, changed }));
    } else { res.writeHead(400); res.end('{}'); }
  });
  coreServer.listen(0, '127.0.0.1'); await once(coreServer, 'listening');
  const coreAddress = coreServer.address(); assert.ok(coreAddress && typeof coreAddress === 'object');
  const rpc = async (method: string, params: unknown) => {
    const response = await fetch(`http://127.0.0.1:${coreAddress.port}`, { method: 'POST', body: JSON.stringify({ method, params }) });
    if (!response.ok) throw Error(`Core refused ${response.status}`); return response.json();
  };
  const core: BbCore = { getOwnerScope: providerThreadId => rpc('thread/getOwnerScope', { providerThreadId }),
    registerExisting: params => rpc('thread/registerExisting', params), reconcileExisting: rpc,
    notify: (method, params) => {
      notifications.push({ method, params });
      if (method === 'thread/identity') {
        const alias = [...aliases.values()].find(a => a.threadId === params.threadId);
        assert.ok(alias, 'only a Core-acknowledged child can be announced');
        assert.equal(params.providerThreadId, `${A.id}:${alias.conversationId}`);
        announcedChildren.add(String(params.providerThreadId));
      }
    } };
  const start = async () => {
    server = createHttpServer(store, policy);
    server.on('request', (req: { url?: string }) => { if (req.url?.endsWith('/outcome') || req.url?.endsWith('/outcomes')) nativeCaptures++; });
    server.listen(0, '127.0.0.1'); await once(server, 'listening'); return `http://127.0.0.1:${server.address().port}`;
  };
  const stop = async () => { if (server) { server.closeAllConnections(); await new Promise<void>(r => server.close(r)); server = undefined; } await store.close(); };
  const options = (base: string) => ({ client: new DpiClient(base, grantA.token), core, providerId: 'pi-durable', sessionId: A.id, conversationId: 1, threadId: 'root-a', cwd: temp.work });
  try {
    let base = await start(); root = await BbThreadSession.bindRoot(options(base));
    const a = root.native, b = new DpiClient(base, grantB.token).agent(B.id, 1);
    const initial = await a.parentCommand({ action: 'spawn', controlId: 'native-existing-a', expectedRevision: (await a.parentControl()).revision, name: 'native-a', task: 'Initial native A.' });
    const foreign = await b.parentCommand({ action: 'spawn', controlId: 'native-existing-b', expectedRevision: (await b.parentControl()).revision, name: 'native-b', task: 'Initial native B.' });
    await assert.rejects(root.registerChild(exact(foreign)), { status: 403 });
    assert.equal(registrations, 0, 'native exact-child proof is BEFORE any Core registration effect');
    const uncertain = await root.registerChild(exact(initial));
    assert.deepEqual(uncertain, { status: 'projection-unavailable', reason: 'registration-unconfirmed' });
    assert.equal(registrations, 1); assert.equal(loseRegisterAck, false);
    const registered = await root.registerChild(exact(initial)); assert.equal(registered.status, 'registered'); assert.equal(registrations, 1);
    const child = await root.openChild('child-a'); assert.equal(digestReads, 1); assert.equal(nativeCaptures, 0, 'authorized digest precedes first native capture');
    assert.equal(child.binding.conversationId, initial.conversationId);
    assert.equal(child.providerThreadId, `${A.id}:${initial.conversationId}`);
    await until(async () => (await a.bbOutcome('child-a')).status === 'completed', 15000, 'initial native child outcome');
    loseHistoryAck = true;
    await assert.rejects(child.captureHistory());
    const first = writes.at(-1)!; const mutationBeforeRetry = mutations, readsBeforeRetry = digestReads, capturesBeforeRetry = nativeCaptures;
    await assert.rejects(child.captureHistory(), /RETRY_IDENTICAL/);
    await child.retryHistory();
    assert.equal(mutations, mutationBeforeRetry); assert.equal(digestReads, readsBeforeRetry); assert.equal(nativeCaptures, capturesBeforeRetry);
    assert.deepEqual(writes.at(-1), first, 'lost ACK retry owns ORIGINAL snapshot and expected CAS digest');

    // A detached Core scope may reject an in-flight history response. Explicit
    // reconnect must finish that exact attempt, not start another observation.
    loseHistoryAck = true;
    await assert.rejects(child.captureHistory());
    const reconnectAttempt = structuredClone(writes.at(-1)!);
    const reconnectMutations = mutations, reconnectReads = digestReads, reconnectCaptures = nativeCaptures;
    loseHistoryAck = true;
    await assert.rejects(root.openChild('child-a'));
    assert.equal(child.historyRetryReady, true, 'failed reconnect retains the uncertain original');
    const writesBeforeConcurrentOpen = writes.length;
    const [attachedOne, attachedTwo] = await Promise.all([root.openChild('child-a'), root.openChild('child-a')]);
    assert.equal(attachedOne, child); assert.equal(attachedTwo, child);
    assert.equal(child.historyRetryReady, false);
    assert.equal(writes.length, writesBeforeConcurrentOpen + 1, 'concurrent reconnect coalesces one retry');
    assert.deepEqual(writes.at(-1), reconnectAttempt);
    assert.equal(mutations, reconnectMutations); assert.equal(digestReads, reconnectReads); assert.equal(nativeCaptures, reconnectCaptures);

    const inputId = 'creq_23456789ab', task = 'slow: ' + 'NATIVE-CHILD-WORKING '.repeat(300);
    pendingControl = { requestId: inputId, input: [{ type: 'text', text: task }] };
    const sent = await child.prompt(task, inputId);
    const revision = sent.retryContext!.expectedRevision;
    assert.equal(sent.requestId, `bb-child:${inputId}`, 'ACTUAL native receipt, not rewritten client projection');
    assert.equal(sent.conversationId, initial.conversationId);
    assert.equal((await child.prompt(task, inputId)).executionId, sent.executionId);
    await assert.rejects(child.prompt('CHANGED-INTENT', inputId), { status: 409 });
    await assert.rejects(root.control({ action: 'send', controlId: 'bb-child:creq_23456789ac', expectedRevision: revision, target: exact(initial), task: 'STALE', followUp: true }), { status: 409 });
    await assert.rejects(child.stop('foreign-scope', (await root.parentState()).revision, { ...exact(sent), conversationId: sent.conversationId! + 10000 }), /EXACT_EXISTING_CHILD/);
    const observedStates: string[] = [], observed = new AbortController();
    const observation = child.observe(observed.signal, capture => { observedStates.push(capture.frame.status); });
    await until(async () => pendingAdmitted && observedStates.includes('working'), 15000, 'actual Core predicate + coherent working observation');
    assert.ok(!notifications.some((n: any) => n.params.threadId === 'child-a' && n.params.deltas?.some((d: any) => d.kind === 'input.accepted')), 'child acceptance belongs ONLY to authoritative history receipt');
    const stopped = await child.stop('bb-stop-child-a', (await root.parentState()).revision, exact(sent));
    assert.equal(stopped.action, 'stop'); assert.equal(stopped.scope, 'child-tree');
    await until(async () => observedStates.includes('interrupted') || observedStates.includes('completed'), 15000, 'native terminal outcome after stop');
    observed.abort(); await observation.catch(error => { if (!observed.signal.aborted) throw error; });
    const terminal = await child.captureHistory(); assert.ok(['interrupted','completed'].includes(terminal.frame.status));
    const beforeClose = terminal.frame;
    child.close(); root.close(); await stop();

    store = await Store.open({ ...temp.options, profile: profile() }); base = await start();
    root = await BbThreadSession.open(options(base));
    const reopened = await root.openChild('child-a');
    const duplicate = await reopened.prompt(task, inputId);
    assert.deepEqual(duplicate, sent, 'native canonical execution survives owner reopen; no replay/replacement');
    const afterClose = await reopened.captureHistory();
    assert.equal(afterClose.frame.status, beforeClose.status);
    pendingControl = { requestId: 'creq_23456789ae', input: [{ type: 'text', text: 'LATE-NATIVE-RESULT' }] };
    const late = await reopened.prompt('LATE-NATIVE-RESULT', pendingControl.requestId);
    assert.equal(late.conversationId, initial.conversationId);
    await until(async () => { const outcome = await root!.native.bbOutcome('child-a'); return outcome.status === 'completed' && outcome.requestId === late.requestId; }, 15000, 'late native answer on SAME child');
    const final = await reopened.captureHistory();
    assert.equal(final.frame.status, 'completed'); assert.equal(pendingAdmitted, true);
    assert.ok(snapshotJson?.includes('LATE-NATIVE-RESULT')); assert.ok(snapshotJson?.includes('bb-child:creq_23456789ae'));
    const ownerClient = new DpiClient(base, owner.token);
    await ownerClient.agent(A.id, initial.conversationId!).send('HUMAN-TERMINAL-INPUT', 'followUp', 'raw-human-key');
    await until(async () => { const outcome = await root!.native.bbOutcome('child-a'); return outcome.status === 'completed' && outcome.requestId.startsWith('host:'); }, 15000, 'canonical human input receipt differs from raw metadata');
    const human = await reopened.captureHistory();
    if (human.frame.status !== 'completed') throw Error('Expected native completed human input');
    const humanEntry = human.frame.entries.find(entry => (entry.data as { requestId?: string } | undefined)?.requestId === 'raw-human-key');
    assert.ok(humanEntry);
    const canonical = human.frame.inputs?.find(input => input.entryId === String(humanEntry.id));
    assert.ok(canonical); assert.ok(canonical.requestId.startsWith('host:')); assert.notEqual(canonical.requestId, 'raw-human-key');
    assert.ok(snapshotJson?.includes(canonical.requestId)); assert.ok(!snapshotJson?.includes('raw-human-key'), 'raw metadata never substitutes for native receipt provenance');
    const summary = await ownerClient.session(A.id).get();
    assert.equal(summary.agents.filter(agent => agent.kind === 'subagent').length, 1, 'no replacement native child on loss, retry, stop or reconnect');
    coreAllowed = false; const readsBeforeRevoke = digestReads;
    await assert.rejects(root.openChild('child-a'), /Core refused/); assert.equal(digestReads, readsBeforeRevoke);
    coreAllowed = true; policy.revoke(grantA.id);
    await assert.rejects(reopened.captureHistory(), { status: 401 });
    reopened.close();
  } finally {
    root?.close(); coreServer.closeAllConnections(); await new Promise<void>(r => coreServer.close(() => r()));
    await stop(); await temp.cleanup();
  }
});

test('concurrent cached opens BOTH await the original history ACK before exposing the child', async () => {
  // Retained form of the independent compiled reproducer: only binding transport
  // and the deferred ACK are fixtures; openChild and retryHistory are production.
  let acknowledge = () => {}; let applies = 0, captures = 0;
  const ack = new Promise<void>(resolve => { acknowledge = resolve; });
  const binding = { sessionId: 'fixture-session', conversationId: 2, parentThreadId: 'fixture-root', bbThreadId: 'fixture-child' };
  const parent = { signal: new AbortController().signal, bindingForChild: async () => binding,
    native: { bbOutcome() { captures++; throw Error('Unexpected native capture'); } },
    children: new Map<string, Promise<BbChildSession>>() };
  const pending = Object.freeze({ fixture: 'original-uncertain-history-attempt' });
  const child = Reflect.construct(BbChildSession, [parent, binding, { async apply(body: unknown) {
    assert.equal(body, pending); applies++; await ack; return { status: 'applied' };
  } }]) as BbChildSession;
  Reflect.set(child, 'pending', pending);
  parent.children.set(binding.bbThreadId, Promise.resolve(child));
  const settled = [false, false];
  const opens = [0, 1].map(i => (Reflect.apply(BbThreadSession.prototype.openChild, parent, [binding.bbThreadId]) as Promise<BbChildSession>)
    .then(value => { settled[i] = true; return value; }));
  for (let i = 0; i < 20; i++) await Promise.resolve();
  const beforeAck = [...settled];
  acknowledge();
  const results = await Promise.all(opens);
  assert.deepEqual(beforeAck, [false, false], 'neither concurrent consumer may observe an unconfirmed child');
  assert.equal(applies, 1); assert.equal(captures, 0);
  assert.ok(results.every(value => value === child));
  assert.equal(Reflect.get(child, 'pending'), undefined);
  child.close();
});
