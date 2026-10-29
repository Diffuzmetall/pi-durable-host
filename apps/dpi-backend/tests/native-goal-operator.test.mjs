import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { BACKGROUND_CONTEXT as context } from '@earendil-works/chord/context';
import { fauxProvider, fauxAssistantMessage, fauxToolCall } from '@earendil-works/pi-ai';
import { createModels } from '@earendil-works/pi-ai/models';
import { Harness, createRegistry } from '@earendil-works/pi-durable';
import { openNodeSqliteStorage } from '@earendil-works/pi-durable/storage/sqlite/node';
import { NodeExecutionEnv } from '@earendil-works/pi-durable/env/node';
import { createAutomation } from '../src/native-profile/automation/automation.js';
import { NativeGoalsDoc } from '../src/native-profile/automation/native-contract.js';
import { createGoalOperator } from '../src/native-profile/operator/goal-operator.js';

const contract = { objective: 'Check a disposable artifact', criteria: [{ id: 'human', text: 'Human accepts the result', human: true }],
  skills: [], permissions: { scope: ['Disposable fixture only'] }, limits: { maxCalls: 1 } };

async function fixture(t, { holdEffect = false, holdAdmission = false, interruptAfterEffect = false } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'goal-operator-'));
  const home = process.env.HOME;
  process.env.HOME = join(directory, 'home');
  await mkdir(process.env.HOME);
  const models = createModels();
  const provider = fauxProvider({ tokensPerSecond: 100000 });
  models.setProvider(provider.provider);
  provider.setResponses([fauxAssistantMessage(fauxToolCall('goal', { action: 'record', evidence: [{ criterionId: 'human', check: 'Fixture inspected', proof: 'Disposable artifact evidence', outcome: 'pass' }], summary: 'Ready for human acceptance.' }), { stopReason: 'toolUse' })]);
  let host, automation, operator, root;
  let allowed = true;
  let authorizations = 0;
  const calls = [];
  let release, reached, interrupted;
  const effectGate = new Promise(resolve => { release = resolve; });
  const effectReached = new Promise(resolve => { reached = resolve; });
  const effectInterrupted = new Promise(resolve => { interrupted = resolve; });
  const open = async () => {
    const registry = createRegistry();
    automation = createAutomation({ authorize: owner => allowed && owner === 1, tools: [],
      resolveSkill: async () => { throw Error('No fixture skills'); }, admit: async () => {} });
    for (const extension of automation.extensions) registry.install(extension);
    operator = createGoalOperator({ authorize: async identity => {
      authorizations++;
      if ((holdEffect && authorizations === 3) || (holdAdmission && authorizations === 1)) { reached(); await effectGate; }
      return allowed && identity.policyRef === 'trusted-human';
    } });
    registry.install(operator.extension);
    host = await Harness.open(await openNodeSqliteStorage(join(directory, 'native.sqlite')), {
      registry, models, env: async () => new NodeExecutionEnv({ cwd: directory }), settings: { compaction: { enabled: false } },
    }, context);
    const model = provider.getModel();
    root = await host.root(context, { agent: { cwd: directory, model: { provider: model.provider, modelId: model.id } } });
    await automation.bind(host);
    operator.bind(host, {
      async command(owner, line, ctx) {
        calls.push(line);
        const result = await automation.goals.command(owner, line, ctx);
        if (interruptAfterEffect) {
          interrupted();
          await new Promise((_, reject) => {
            if (ctx.abortSignal.aborted) reject(ctx.abortSignal.reason);
            else ctx.abortSignal.addEventListener('abort', () => reject(ctx.abortSignal.reason), { once: true });
          });
        }
        return result;
      },
      protectsExecution: (owner, ctx) => automation.goals.protectsExecution(owner, ctx),
    }, root.id);
  };
  await open();
  const close = async () => { operator.shutdown(); await automation.shutdown(context); await host.close(context); };
  t.after(async () => {
    release();
    try { await close(); } finally {
      if (home === undefined) delete process.env.HOME; else process.env.HOME = home;
      await rm(directory, { recursive: true, force: true });
    }
  });
  return {
    get host() { return host; }, get root() { return root; }, get operator() { return operator; }, get automation() { return automation; },
    calls, provider, effectReached, effectInterrupted, release,
    setAllowed(value) { allowed = value; },
    request: (requestId, line = `/goal new ${JSON.stringify(contract)}`) => ({ conversationId: root.id, requestId, line, policyRef: 'trusted-human' }),
    goals: async () => Object.values((await host.snapshot(NativeGoalsDoc, context))?.goals ?? {}),
    reopen: async () => { await close(); interruptAfterEffect = false; await open(); },
  };
}

test('real native Goal command survives lost HTTP ACK/reopen with one canonical task and one Goal', { timeout: 15000 }, async t => {
  const f = await fixture(t);
  const request = f.request('http-lost-ack');
  let drop = true;
  const taskIds = [];
  const server = createServer(async (_request, response) => {
    try {
      const admitted = await f.operator.command(request, context);
      taskIds.push(admitted.taskId);
      f.host.resume();
      await f.host.waitForTask(admitted.taskId, context);
      const receipt = await f.operator.receipt(request, context);
      if (drop) { drop = false; response.destroy(); return; }
      response.setHeader('content-type', 'application/json'); response.end(JSON.stringify(receipt));
    } catch { response.writeHead(403).end('denied'); }
  }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const url = `http://127.0.0.1:${server.address().port}/fixture-operator`;
  await assert.rejects(fetch(url, { method: 'POST' }), /fetch failed/);
  const receipt = await (await fetch(url, { method: 'POST' })).json();
  assert.equal(receipt.status, 'done'); assert.equal(taskIds.length, 2); assert.equal(taskIds[0], taskIds[1]);
  assert.equal(f.calls.length, 1);
  await f.root.waitForIdle(context);
  assert.equal((await f.goals()).length, 1);
  assert.equal((await f.goals())[0].status, 'waiting');
  const native = await f.host.waitForTask(receipt.taskId, context);
  assert.equal(native.state.outcome.status, 'completed'); assert.equal(native.state.outcome.result.taskId, receipt.taskId);
  await assert.rejects(f.operator.command({ ...request, line: '/goal list' }, context), /REQUEST_CONFLICT/);
  await f.reopen(); f.host.resume();
  const retried = await f.operator.command(request, context);
  assert.deepEqual(retried, receipt); assert.equal(f.calls.length, 1); assert.equal((await f.goals()).length, 1);
  assert.equal(await f.operator.protectsExecution(f.root.id, context), await f.automation.goals.protectsExecution(f.root.id, context));
});

test('delegated/self-approval/cross-conversation and queued revoked human have no Goal effect', { timeout: 10000 }, async t => {
  const f = await fixture(t, { holdEffect: true });
  const request = f.request('human-queued');
  // The third current-policy check is the queued native task, outside the admission transaction.
  const admitted = await f.operator.command(request, context);
  f.host.resume(); await f.effectReached;
  f.setAllowed(false); f.release();
  const task = await f.host.waitForTask(admitted.taskId, context);
  assert.equal(task.state.outcome.status, 'failed'); assert.equal(f.calls.length, 0); assert.equal((await f.goals()).length, 0);
  await assert.rejects(f.operator.receipt(request, context), /HUMAN_AUTHORITY_REQUIRED/);
  f.setAllowed(true);
  assert.equal((await f.operator.receipt(request, context)).status, 'failed');
  for (const policyRef of ['delegated', 'assistant', 'iii']) {
    await assert.rejects(f.operator.command({ ...f.request(`deny-${policyRef}`, '/goal approve fake human'), policyRef, actor: 'human', authority: 'human' }, context), /HUMAN_AUTHORITY_REQUIRED/);
  }
  await assert.rejects(f.operator.command({ ...f.request('wrong-child'), conversationId: 999 }, context), /HUMAN_AUTHORITY_REQUIRED/);
  assert.equal(f.calls.length, 0); assert.equal(f.provider.state.callCount, 0);
  assert.equal((await f.operator.command(request, context)).taskId, admitted.taskId, 'same rejected request never gains a new execution');
});

test('human approval uses actual Goal service, not model self-approval', { timeout: 15000 }, async t => {
  const f = await fixture(t);
  const start = await f.operator.command(f.request('human-goal'), context);
  f.host.resume(); await f.host.waitForTask(start.taskId, context); await f.root.waitForIdle(context);
  const [goal] = await f.goals();
  assert.equal(goal.status, 'waiting'); assert.equal(goal.reason, 'human_acceptance_required');
  assert.equal(goal.evidence[0].humanApproved, false);
  const approval = f.request('human-approval', `/goal approve ${goal.id} human`);
  await assert.rejects(f.operator.command({ ...approval, policyRef: 'assistant' }, context), /HUMAN_AUTHORITY_REQUIRED/);
  assert.equal((await f.goals())[0].status, 'waiting');
  const admitted = await f.operator.command(approval, context);
  await f.host.waitForTask(admitted.taskId, context);
  const receipt = await f.operator.receipt(approval, context);
  assert.equal(receipt.status, 'done'); assert.equal(receipt.text, 'Human approval recorded');
  assert.equal((await f.goals())[0].status, 'completed');
  assert.equal((await f.operator.command(approval, context)).taskId, admitted.taskId);
  const entries = (await f.root.entries({}, 100, undefined, context)).items;
  assert.equal(entries.filter(entry => entry.kind === 'native-goal.approval').length, 1);
});

test('canonical request owns caller data and concurrent retries admit one native task', { timeout: 15000 }, async t => {
  const f = await fixture(t, { holdAdmission: true });
  const canonical = f.request('immutable-input');
  const mutable = { ...canonical };
  const pending = f.operator.command(mutable, context);
  await f.effectReached;
  mutable.line = '/goal list'; mutable.requestId = 'different-key'; mutable.policyRef = 'delegated';
  f.release();
  const first = await pending;
  const retries = await Promise.all([f.operator.command(canonical, context), f.operator.command(canonical, context)]);
  assert.equal(first.requestId, canonical.requestId);
  assert.ok(retries.every(receipt => receipt.taskId === first.taskId));
  f.host.resume(); await f.host.waitForTask(first.taskId, context); await f.root.waitForIdle(context);
  assert.equal(f.calls.length, 1); assert.equal(f.calls[0], canonical.line); assert.equal((await f.goals()).length, 1);
  await assert.rejects(f.operator.command({ ...canonical, requestId: 'invalid-command', line: 'not a Goal command' }, context), /INVALID_COMMAND/);
  await assert.rejects(f.operator.command({ ...canonical, requestId: '' }, context), /INVALID_REQUEST/);
  f.operator.shutdown();
  await assert.rejects(f.operator.command(canonical, context), /UNAVAILABLE/);
});

test('interrupted native task after actual Goal effect reopens uncertain, never replays unsafe command', { timeout: 15000 }, async t => {
  const f = await fixture(t, { interruptAfterEffect: true });
  const request = f.request('interrupted-effect');
  const admitted = await f.operator.command(request, context);
  f.host.resume(); await f.effectInterrupted; await f.root.waitForIdle(context);
  assert.equal((await f.operator.receipt(request, context)).status, 'started');
  assert.equal((await f.goals()).length, 1);
  await f.reopen(); f.host.resume();
  const native = await f.host.waitForTask(admitted.taskId, context);
  assert.equal(native.state.outcome.status, 'failed');
  const receipt = await f.operator.command(request, context);
  assert.equal(receipt.taskId, admitted.taskId); assert.equal(receipt.status, 'uncertain');
  assert.equal(receipt.error, 'GOAL_OPERATOR_OUTCOME_UNCERTAIN');
  assert.equal(f.calls.length, 1); assert.equal((await f.goals()).length, 1);
});
