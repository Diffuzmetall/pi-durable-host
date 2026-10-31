import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { BACKGROUND_CONTEXT as context } from '@earendil-works/chord/context';
import { fauxProvider, fauxAssistantMessage, fauxToolCall } from '@earendil-works/pi-ai';
import { createModels } from '@earendil-works/pi-ai/models';
import { createRegistry, defineExtension, Harness } from '@earendil-works/pi-durable';
import { openNodeSqliteStorage } from '@earendil-works/pi-durable/storage/sqlite/node';
import { NodeExecutionEnv } from '@earendil-works/pi-durable/env/node';
import { createAutomation } from '../src/native-profile/automation/automation.js';
import { ScheduleDoc, occurrenceRequestId } from '../src/native-profile/automation/schedules.js';
import { NativeGoalRuntime } from '../src/native-profile/automation/native-goals.js';
import { NativeGoalsDoc } from '../src/native-profile/automation/native-contract.js';

const contract = { objective: 'Produce a checked local result in the main conversation',
  criteria: [{ id: 'c1', text: 'Real artifact was checked' }], skills: [],
  permissions: { scope: ['Temporary fixture directory'] }, limits: { maxCalls: 5 } };
const evidence = [{ criterionId: 'c1', check: 'Read the fixture artifact', proof: 'artifact.txt: checked fixture result', outcome: 'pass' }];
const call = args => fauxAssistantMessage(fauxToolCall('goal', args), { stopReason: 'toolUse' });
async function fixture(t, { settings = { compaction: { enabled: false } }, tools = [] } = {}) {
  const cwd = await mkdtemp(join(tmpdir(), 'session-goals-'));
  await writeFile(join(cwd, 'artifact.txt'), 'checked fixture result');
  const database = join(cwd, 'session.sqlite');
  const provider = fauxProvider({ tokensPerSecond: 100000 });
  const models = createModels(); models.setProvider(provider.provider);
  let host, service, root, automation, clock;
  let authorized = true;
  const admissions = [];
  const open = async () => {
    const registry = createRegistry();
    registry.install(defineExtension({ name: 'session-boundary-fixtures', tools }));
    automation = createAutomation({
      authorize: owner => authorized && owner === 1,
      tools: registry.snapshot().tools().map(({ tool }) => tool.name),
      resolveSkill: async () => { throw Error('No skills admitted in this fixture'); },
      admit: async (_conversation, requestId) => { admissions.push(requestId); },
      now: () => clock ?? Date.now(),
    });
    for (const extension of automation.extensions) registry.install(extension);
    service = automation.goals;
    host = await Harness.open(await openNodeSqliteStorage(database), { registry, models,
      env: async () => new NodeExecutionEnv({ cwd }), settings, now: () => clock ?? Date.now() }, context);
    const model = provider.getModel();
    root = await host.root(context, { agent: { cwd, model: { provider: model.provider, modelId: model.id } } });
    await automation.bind(host);
  };
  await open();
  t.after(async () => { try { await automation.shutdown(context); await host.close(context); } finally { await rm(cwd, { recursive: true, force: true }); } });
  const saved = async id => (await host.snapshot(NativeGoalsDoc, context)).goals[id];
  const run = async text => { const s = await root.submit({ type: 'input', content: text }, context); return s.wait(context); };
  const idle = () => root.waitForIdle(context);
  const conversations = () => { const db = new DatabaseSync(database, { readOnly: true }); try { return db.prepare('select count(*) as count from conversations').get().count; } finally { db.close(); } };
  return { cwd, database, provider, saved, run, idle, conversations, admissions, revoke: () => { authorized = false; }, get automation() { return automation; }, get service() { return service; }, get root() { return root; }, get host() { return host; },
    reopen: async (clean = true, at) => { if (clean) await automation.shutdown(context); await host.close(context); clock = at; await open(); } };
}

test('Goal continues the main conversation, creates no subagent, and persists a visible substantive result', { timeout: 15000 }, async t => {
  const f = await fixture(t);
  const transcripts = [];
  f.provider.setResponses([
    transcript => { transcripts.push(transcript); return call({ action: 'start', contract }); },
    transcript => { transcripts.push(transcript); return fauxAssistantMessage('Candidate checked; recording next.'); },
    transcript => { transcripts.push(transcript); return call({ action: 'record', evidence, summary: 'The local artifact was checked successfully.' }); },
    transcript => { transcripts.push(transcript); return fauxAssistantMessage('Result: the local artifact was checked successfully.'); },
  ]);
  await f.run('Start the agreed Goal here.'); await f.idle();
  const goals = Object.values((await f.host.snapshot(NativeGoalsDoc, context)).goals);
  assert.equal(goals.length, 1); const goal = goals[0];
  assert.equal(goal.status, 'completed'); assert.equal(goal.callsUsed, 3);
  assert.equal(f.conversations(), 1, 'neither worker nor verifier conversation may be created');
  assert.ok(transcripts.some(tr => JSON.stringify(tr).includes('You are the MAIN session agent')));
  const entries = (await f.root.entries({}, 100, undefined, context)).items;
  assert.ok(entries.some(e => e.kind === 'pi.assistant' && JSON.stringify(e.model).includes('Result: the local artifact')));
  const result = entries.find(e => e.kind === 'native-goal.result' && e.data.goalId === goal.id);
  assert.ok(result); assert.equal(result.conversationId, f.root.id); assert.equal(result.model, undefined);
  assert.ok(result.data.text.includes('The local artifact was checked successfully.'));
  assert.ok(result.data.text.includes('Read the fixture artifact'));
  assert.ok(result.data.text.includes('artifact.txt: checked fixture result'));
  assert.ok((await readFile(goal.reportPath, 'utf8')).includes('Evidence accepted: yes'));
  assert.equal(f.provider.state.callCount, 4);
  await f.reopen();
  assert.equal((await f.saved(goal.id)).status, 'completed');
  assert.equal(f.conversations(), 1); assert.equal(f.provider.state.callCount, 4, 'reopen must not replay completion or start work');
  const reopened = (await f.root.entries({}, 100, undefined, context)).items;
  assert.equal(reopened.filter(e => e.kind === 'native-goal.result' && e.data.goalId === goal.id).length, 1);
});

test('unsupported success claims are reminded, then paused at the shared model-call budget', { timeout: 10000 }, async t => {
  const f = await fixture(t);
  const goal = await f.service.create(f.root.id, { ...contract, limits: { maxCalls: 2 } }, context);
  f.provider.setResponses([fauxAssistantMessage('Done, trust me.'), fauxAssistantMessage('Still no check or proof.')]);
  await f.service.resume(f.root.id, goal.id, context); await f.idle();
  const paused = await f.saved(goal.id);
  assert.equal(paused.status, 'paused'); assert.equal(paused.reason, 'limit_exhausted');
  assert.equal(paused.callsUsed, 2); assert.equal(paused.reportPath, undefined);
  assert.equal(f.provider.state.callCount, 2); assert.equal(f.conversations(), 1);
  const result = (await f.root.entries({}, 100, undefined, context)).items.find(e => e.kind === 'native-goal.result');
  assert.ok(result.data.text.includes('Критерии ещё не подтверждены'));
  await f.service.limits(f.root.id, goal.id, 'none', context);
  assert.equal((await f.saved(goal.id)).callsUsed, 2);
  assert.equal((await f.saved(goal.id)).limits, 'none');
  assert.equal(f.provider.state.callCount, 2, 'changing limits alone does not resume');
  const epoch = (await f.host.snapshot(NativeGoalRuntime, context)).goals[goal.id].epoch;
  await f.run(`[Goal reminder ${goal.id}, revision 1, epoch ${epoch - 1}] stale queued work`);
  assert.equal(f.provider.state.callCount, 2, 'a stale continuation must be rejected before any model request');
});

test('human approval is not supplied by model evidence and completion needs no extra model turn', { timeout: 10000 }, async t => {
  const f = await fixture(t);
  const goal = await f.service.create(f.root.id, { ...contract, limits: { maxCalls: 1 }, criteria: [{ ...contract.criteria[0], human: true }] }, context);
  f.provider.setResponses([call({ action: 'record', evidence, summary: 'Ready for personal acceptance.' }), fauxAssistantMessage('Please personally accept the result.')]);
  await f.service.resume(f.root.id, goal.id, context); await f.idle();
  assert.equal((await f.saved(goal.id)).status, 'waiting');
  assert.equal((await f.saved(goal.id)).evidence[0].humanApproved, false);
  await f.service.approve(f.root.id, goal.id, 'c1', context);
  assert.equal((await f.saved(goal.id)).status, 'completed');
  assert.equal(f.provider.state.callCount, 1); assert.equal(f.conversations(), 1);
});

test('report-write failure is visible and does not mark success or consume a retry model call', { timeout: 10000 }, async t => {
  const f = await fixture(t);
  await writeFile(join(f.cwd, 'docs'), 'occupied by fixture');
  const goal = await f.service.create(f.root.id, contract, context);
  f.provider.setResponses([call({ action: 'record', evidence, summary: 'Checked result.' }), fauxAssistantMessage('Checks have passed.')]);
  await f.service.resume(f.root.id, goal.id, context); await f.idle();
  assert.equal((await f.saved(goal.id)).status, 'paused');
  assert.equal((await f.saved(goal.id)).reason, 'report_write_failed');
  assert.equal((await f.saved(goal.id)).reportPath, undefined);
  const entries = (await f.root.entries({}, 100, undefined, context)).items;
  assert.ok(entries.some(e => e.kind === 'native-goal.result' && e.data.text.includes('Отчёт не сохранён')));
  const calls = f.provider.state.callCount;
  const { unlink } = await import('node:fs/promises'); await unlink(join(f.cwd, 'docs'));
  await f.service.resume(f.root.id, goal.id, context);
  assert.equal((await f.saved(goal.id)).status, 'completed'); assert.equal(f.provider.state.callCount, calls);
});

test('stop fences reminders without aborting the main request', { timeout: 10000 }, async t => {
  const f = await fixture(t);
  const goal = await f.service.create(f.root.id, contract, context);
  let release, started;
  const admitted = new Promise(resolve => { started = resolve; });
  f.provider.setResponses([async () => { started(); await new Promise(resolve => { release = resolve; }); return fauxAssistantMessage('Current main request completed normally.'); }]);
  await f.service.resume(f.root.id, goal.id, context); await admitted;
  await f.service.stop(f.root.id, goal.id, context);
  assert.equal((await f.saved(goal.id)).status, 'paused');
  await f.service.stop(f.root.id, goal.id, context);
  const pauseEntries = (await f.root.entries({}, 100, undefined, context)).items.filter(e => e.kind === 'native-goal.result');
  assert.equal(pauseEntries.length, 1, 'repeated stop is idempotent');
  release(); await f.idle();
  assert.equal(f.provider.state.callCount, 1); assert.equal((await f.saved(goal.id)).status, 'paused');
  assert.equal(await f.service.protectsExecution(f.root.id, context), false, 'normal main Esc behavior is not hijacked');
  assert.ok((await f.root.entries({}, 100, undefined, context)).items.some(e => e.kind === 'pi.assistant' && JSON.stringify(e.model).includes('completed normally')));
});

test('a tool loop cannot spend beyond maxCalls; accepted evidence can finalize without another model call', { timeout: 10000 }, async t => {
  const f = await fixture(t);
  const first = await f.service.create(f.root.id, { ...contract, limits: { maxCalls: 1 } }, context);
  f.provider.setResponses([call({ action: 'status' })]);
  await f.service.resume(f.root.id, first.id, context); await f.idle();
  assert.equal(f.provider.state.callCount, 1, 'a thrown advisory hook alone must not allow the next provider call');
  assert.equal((await f.saved(first.id)).status, 'paused');
  const second = await f.service.create(f.root.id, { ...contract, limits: { maxCalls: 1 } }, context);
  f.provider.setResponses([call({ action: 'record', evidence, summary: 'Verified within the final allowed call.' })]);
  const before = f.provider.state.callCount;
  await f.service.resume(f.root.id, second.id, context); await f.idle();
  assert.equal(f.provider.state.callCount - before, 1);
  assert.equal((await f.saved(second.id)).status, 'completed');
  assert.equal(f.conversations(), 1);
  assert.ok((await f.root.entries({}, 100, undefined, context)).items.some(e => e.kind === 'native-goal.result' && e.data.text.includes('Verified within the final allowed call.')));
});

test('revoking Goal pauses reminders without disabling ordinary main-session conversation', { timeout: 10000 }, async t => {
  const f = await fixture(t);
  const goal = await f.service.create(f.root.id, contract, context);
  let release, started;
  const admitted = new Promise(resolve => { started = resolve; });
  f.provider.setResponses([async () => { started(); await new Promise(resolve => { release = resolve; }); return fauxAssistantMessage('Current work returned.'); }, fauxAssistantMessage('Ordinary conversation still works.')]);
  await f.service.resume(f.root.id, goal.id, context); await admitted;
  f.revoke(); release(); await f.idle();
  assert.equal((await f.saved(goal.id)).status, 'paused');
  assert.equal((await f.saved(goal.id)).reason, 'authority_revoked');
  await f.run('An unrelated ordinary question.');
  assert.equal(f.provider.state.callCount, 2);
  assert.equal((await f.saved(goal.id)).callsUsed, 1);
});

const scheduleCall = args => fauxAssistantMessage(fauxToolCall('schedule', args), { stopReason: 'toolUse' });
async function until(probe) {
  const deadline = Date.now() + 5000;
  while (!await probe()) {
    if (Date.now() > deadline) throw Error('Native automation condition timed out');
    await new Promise(resolve => setTimeout(resolve, 5));
  }
}

test('memory-independent automation requires explicit admission and denies child Goal control', async t => {
  assert.throws(() => createAutomation({ authorize: () => true, tools: [], resolveSkill: async () => '' }), /trusted host input admission/);
  const f = await fixture(t);
  const child = await f.host.createConversation({ ownership: { kind: 'ownerless' } }, context);
  await assert.rejects(f.service.create(child.id, contract, context), /AUTHORITY_REQUIRED/);
  assert.equal(Object.keys((await f.host.snapshot(NativeGoalsDoc, context))?.goals ?? {}).length, 0);
  assert.equal(f.provider.state.callCount, 0);
});

test('closed automation denies new root Goal admission and cannot rebind', async t => {
  const f = await fixture(t);
  await f.automation.shutdown(context);
  await assert.rejects(f.service.create(f.root.id, contract, context), /AUTHORITY_REQUIRED/);
  await assert.rejects(f.automation.bind(f.host), /already bound or closed/);
  assert.equal(f.provider.state.callCount, 0);
});

test('schedule reopens with identical native task/doc/request IDs and submits one occurrence', { timeout: 15000 }, async t => {
  const f = await fixture(t);
  f.provider.setResponses([scheduleCall({ action: 'add', when: 'in 1m', message: 'persisted schedule' }), fauxAssistantMessage('Schedule accepted.')]);
  await f.run('Create the synthetic schedule.'); await f.idle();
  const item = Object.values((await f.host.snapshot(ScheduleDoc, f.root.id, context)).items)[0];
  assert.equal(item.status, 'active');
  assert.equal((await f.host.getTask(item.taskId, context)).kind, 'durable.schedule');
  await f.reopen(true, item.next + 1);
  assert.equal((await f.host.snapshot(ScheduleDoc, f.root.id, context)).items[item.id].taskId, item.taskId);
  f.provider.setResponses([fauxAssistantMessage('Scheduled result.')]);
  f.host.resume();
  await until(async () => (await f.host.snapshot(ScheduleDoc, f.root.id, context)).items[item.id].status === 'completed');
  await f.idle();
  const key = occurrenceRequestId(item.taskId, 0);
  const receipt = await f.host.commit(tx => tx.submissionByRequest(f.root.id, key), context);
  assert.ok(receipt);
  assert.equal(receipt.conversationId, f.root.id);
  assert.deepEqual(f.admissions, [key]);
  assert.equal(f.conversations(), 1);
  const calls = f.provider.state.callCount;
  await f.reopen(true, item.next + 120000);
  f.host.resume(); await f.idle();
  const reconciled = await f.host.commit(tx => tx.submissionByRequest(f.root.id, key), context);
  assert.equal(reconciled.id, receipt.id);
  assert.equal((await f.host.snapshot(ScheduleDoc, f.root.id, context)).items[item.id].runs, 1);
  assert.deepEqual(f.admissions, [key]);
  assert.equal(f.provider.state.callCount, calls, 'Reopen did not rerun the completed occurrence');
});

test('revoked schedule authority fails native admission without creating a submission or retry', { timeout: 15000 }, async t => {
  const f = await fixture(t);
  f.provider.setResponses([scheduleCall({ action: 'add', when: 'in 1m', message: 'must not submit' }), fauxAssistantMessage('Schedule accepted.')]);
  await f.run('Create the synthetic schedule.'); await f.idle();
  const item = Object.values((await f.host.snapshot(ScheduleDoc, f.root.id, context)).items)[0];
  const calls = f.provider.state.callCount;
  f.revoke();
  await f.reopen(true, item.next + 1);
  f.host.resume();
  await until(async () => (await f.host.snapshot(ScheduleDoc, f.root.id, context)).items[item.id].status === 'failed');
  const receipt = await f.host.commit(tx => tx.submissionByRequest(f.root.id, occurrenceRequestId(item.taskId, 0)), context);
  assert.equal(receipt, undefined);
  assert.equal(f.provider.state.callCount, calls);
  assert.deepEqual(f.admissions, []);
  await f.reopen(true, item.next + 120000);
  f.host.resume(); await f.idle();
  assert.equal((await f.host.snapshot(ScheduleDoc, f.root.id, context)).items[item.id].status, 'failed');
  assert.equal(f.provider.state.callCount, calls);
});

