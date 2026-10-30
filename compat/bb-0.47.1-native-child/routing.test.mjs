// SPDX-License-Identifier: MIT
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { initializeRegisteredChildRouting, committedNativeHistoryTurn } from './registered-child-routing.mjs';
import { baselineSha256, buildPatchedDaemon } from './apply.mjs';

const parent = {
  providerId: 'pi-durable', processKey: 'authenticated-process', projectId: 'proj_local', environmentId: 'env_local',
  bridgeLaunch: { command: 'fixture-provider' }, skillRoots: [], contributedEnv: [], instructionMode: 'append',
  envVars: { BB_THREAD_ID: 'thr_parent', PARENT_PRIVATE: 'do-not-copy' },
  options: { model: 'root/model', privateCredential: 'do-not-copy' }, instructions: 'ROOT_PRIVATE_INSTRUCTIONS',
  dynamicTools: [{ name: 'root-only-tool' }],
};
function args(overrides = {}) {
  return { parent, parentThreadId: 'thr_parent', childThreadId: 'thr_child', providerId: 'pi-durable',
    processKey: 'authenticated-process', resolveEnvironment: ({ threadId, projectId, environmentId }) => ({ envVars: {
      BB_THREAD_ID: threadId, BB_PROJECT_ID: projectId, BB_ENVIRONMENT_ID: environmentId,
    } }), ...overrides };
}

test('registered child gets its own routing environment, not Root execution configuration or credentials', () => {
  const before = structuredClone(parent);
  const child = initializeRegisteredChildRouting(args());
  assert.equal(child.processKey, parent.processKey);
  assert.equal(child.envVars.BB_THREAD_ID, 'thr_child');
  assert.equal(child.envVars.BB_PROJECT_ID, parent.projectId);
  assert.equal(child.envVars.BB_ENVIRONMENT_ID, parent.environmentId);
  for (const field of ['options', 'instructions', 'dynamicTools']) assert.equal(Object.hasOwn(child, field), false);
  assert.equal(child.envVars.PARENT_PRIVATE, undefined);
  assert.equal(JSON.stringify(child).includes('do-not-copy'), false);
  assert.equal(child.sessionRestorable, true);
  assert.deepEqual(parent, before);
});

test('registration retry preserves the existing child configuration and model', () => {
  const existing = { ...initializeRegisteredChildRouting(args()), options: { model: 'child/retained' } };
  assert.equal(initializeRegisteredChildRouting(args({ existing })), existing);
  assert.equal(existing.options.model, 'child/retained');
});

test('missing parent, foreign provider/process and child promotion are rejected', () => {
  for (const change of [{ parent: undefined }, { providerId: 'foreign' }, { processKey: 'foreign' },
    { childThreadId: 'thr_parent' }, { parent: { ...parent, projectId: undefined } },
    { parent: { ...parent, environmentId: undefined } }]) {
    assert.throws(() => initializeRegisteredChildRouting(args(change)), /routing refused/);
  }
});

test('existing alias cannot cross process, provider, project, environment or thread scope', () => {
  const child = initializeRegisteredChildRouting(args());
  for (const change of [{ processKey: 'other' }, { providerId: 'other' }, { projectId: 'other' },
    { environmentId: 'other' }, { envVars: { ...child.envVars, BB_THREAD_ID: 'thr_other' } }]) {
    assert.throws(() => initializeRegisteredChildRouting(args({ existing: { ...child, ...change } })), /routing refused/);
  }
});

test('environment resolver cannot return parent or foreign project/environment routing', () => {
  for (const change of [{ BB_THREAD_ID: 'thr_parent' }, { BB_PROJECT_ID: 'other' }, { BB_ENVIRONMENT_ID: 'other' }]) {
    assert.throws(() => initializeRegisteredChildRouting(args({ resolveEnvironment: () => ({ envVars: {
      BB_THREAD_ID: 'thr_child', BB_PROJECT_ID: 'proj_local', BB_ENVIRONMENT_ID: 'env_local', ...change,
    } }) })), /routing refused/);
  }
});

test('overlay rejects unknown bytes rather than best-effort patching another Core build', () => {
  assert.throws(() => buildPatchedDaemon(Buffer.from('not the selected Core')), /SHA-256 differs/);
});

// The exact built callback is exercised without starting a daemon. Real Core/Chrome
// acceptance is separate; these are focused routing/ordering/error regressions only.
const basePath = process.env.BB_CORE_DAEMON;
if (!basePath) throw Error('BB_CORE_DAEMON must identify the pinned read-only baseline for these checks');
const base = await readFile(basePath);
assert.equal(createHash('sha256').update(base).digest('hex'), baselineSha256);
const patched = buildPatchedDaemon(base);
const start = patched.indexOf('e.onNativeThreadRegistration(xe).then(de=>{try{');
const end = patched.indexOf('catch{se()}},se)', start) + 'catch{se()}},se)'.length;
assert.ok(start > 0 && end > start);
const callback = patched.slice(start, end);
function fixture({ replaced = false, parentOverride, existing } = {}) {
  const configs = new Map([['thr_parent', parentOverride ?? parent]]);
  if (existing) configs.set('thr_child', existing);
  const requests = []; const identity = []; const replies = []; let rejected = 0;
  const process = { processKey: 'authenticated-process', providerId: 'pi-durable', child: {} };
  const ctx = {
    e: { onNativeThreadRegistration: async () => ({ threadId: 'thr_child' }) }, xe: {},
    de: undefined, ge: 'thr_parent', a: configs, P: process, j: { data: {} }, _: { parsedId: 'registration-1' },
    to: () => false, M: { requireProviderProcess: () => replaced ? {} : process },
    Nu: args().resolveEnvironment, initializeRegisteredChildRouting,
    G9: (...values) => identity.push(values), o: {},
    We: (id, config) => { requests.push('routing-initialized'); configs.set(id, config); },
    Bo: value => { requests.push('registration-ack'); replies.push(value); }, se: () => { rejected++; },
  };
  return { ctx, configs, requests, identity, replies, rejected: () => rejected };
}

test('built Core callback installs routing before ACK: FIRST stop needs no prior followup or native replay', async () => {
  const f = fixture();
  await runInNewContext(callback, f.ctx);
  assert.deepEqual(f.requests, ['routing-initialized', 'registration-ack']);
  assert.equal(f.configs.get('thr_child').processKey, 'authenticated-process');
  assert.equal(f.identity.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(f.replies[0].result)), { threadId: 'thr_child' });
  assert.equal(f.rejected(), 0);
  // No turn/start, native submit, parent task or history operation exists in this callback.
  assert.equal(callback.includes('turn/start'), false);
  assert.equal(callback.includes('snapshot'), false);
});

test('built callback rejects replaced parent process before identity/configuration/ACK', async () => {
  const f = fixture({ replaced: true });
  await runInNewContext(callback, f.ctx);
  assert.equal(f.rejected(), 1);
  assert.equal(f.identity.length, 0);
  assert.equal(f.configs.has('thr_child'), false);
  assert.equal(f.replies.length, 0);
});

test('built callback fails closed on foreign parent and retains existing child on idempotent ACK retry', async () => {
  const foreign = fixture({ parentOverride: { ...parent, providerId: 'other' } });
  await runInNewContext(callback, foreign.ctx);
  assert.equal(foreign.rejected(), 1);
  assert.equal(foreign.identity.length, 0);
  const child = { ...initializeRegisteredChildRouting(args()), options: { model: 'child/retained' } };
  const retry = fixture({ existing: child });
  await runInNewContext(callback, retry.ctx);
  assert.equal(retry.configs.get('thr_child'), child);
  assert.deepEqual(retry.requests, ['registration-ack']);
});

test('only a confirmed same-thread CAS receipt creates turn bookkeeping; deferred/read-only/foreign receipts do not', () => {
  const request = { threadId: 'thr_child', providerThreadId: 'native-session:24', snapshot: { status: 'working' } };
  const receipt = { threadId: 'thr_child', turnId: 'native-turn' };
  assert.deepEqual(committedNativeHistoryTurn(request, receipt), {
    type: 'turn/started', threadId: 'thr_child', providerThreadId: 'native-session:24', scope: { kind: 'turn', turnId: 'native-turn' },
  });
  for (const status of ['completed', 'failed', 'interrupted'])
    assert.equal(committedNativeHistoryTurn({ ...request, snapshot: { status } }, receipt).type, 'turn/completed');
  assert.equal(committedNativeHistoryTurn({ threadId: 'thr_child' }, receipt), undefined);
  for (const change of [{ deferred: true }, { threadId: 'thr_foreign' }, { turnId: undefined }])
    assert.equal(committedNativeHistoryTurn(request, { ...receipt, ...change }), undefined);
});

test('built history wrapper observes only after authenticated commit, without another persisted event', async () => {
  const hStart = patched.indexOf('(async request=>{');
  const hEnd = patched.indexOf('}),N=>Bo', hStart) + 2;
  assert.ok(hStart > 0 && hEnd > hStart);
  const seen = []; const order = [];
  const observe = runInNewContext(patched.slice(hStart, hEnd), {
    e: { onNativeHistory: async request => { order.push('commit'); return { threadId: request.threadId, turnId: 'native-turn' }; } },
    I: { observe: event => { order.push('turn-state'); seen.push(event); } },
    w: { observe: () => order.push('goal-state') }, wt: () => order.push('idle'), committedNativeHistoryTurn,
  });
  await observe({ threadId: 'thr_child', providerThreadId: 'native-session:24', snapshot: { status: 'working' } });
  assert.deepEqual(order, ['commit', 'turn-state', 'goal-state', 'idle']);
  assert.equal(seen[0].scope.turnId, 'native-turn');
});
