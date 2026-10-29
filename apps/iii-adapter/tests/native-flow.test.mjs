import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { generateKeyPairSync, createHash } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { signed } from '../src/auth.js';
import { engineFixture } from './helpers/engine.mjs';
import { nativeFixture } from './helpers/native-fixture.mjs';

const backendRoot = process.env.DPI_III_TEST_BACKEND_ROOT, clientBin = process.env.DPI_III_TEST_CLIENT_BIN;
if (!backendRoot || !clientBin) throw Error('Native test requires exact installed DPI_III_TEST_BACKEND_ROOT and DPI_III_TEST_CLIENT_BIN; no moving-source fallback.');

test('installed iii-only CLI: actual native admission, lost ACK/reopen, immutable paging and scoped controls', { timeout: 90000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'dpi-iii-native-')), engine = await engineFixture();
  const keys = generateKeyPairSync('ed25519'), publicKey = keys.publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const fixture = await nativeFixture({ backendRoot: resolve(backendRoot), root, engineUrl: engine.url, publicKey });
  const configFile = join(root, 'worker.json'); await writeFile(configFile, JSON.stringify(fixture.config), { mode: 0o600 });
  const workers = new Set(); let workerNumber = 0, diagnostics = '', releaseHeld = () => {}, paused;
  const stopWorker = async worker => {
    if (worker.exitCode !== null) return;
    const ended = once(worker, 'exit'); worker.kill('SIGTERM');
    const timer = setTimeout(() => worker.kill('SIGKILL'), 3000);
    await ended; clearTimeout(timer); workers.delete(worker);
  };
  const startWorker = async (configPath = configFile) => {
    const home = join(root, `client-home-${++workerNumber}`); await mkdir(home);
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(III_|OTEL_|NODE_OPTIONS$)/.test(key)));
    Object.assign(env, { HOME: home, XDG_CONFIG_HOME: join(home, 'config'), XDG_DATA_HOME: join(home, 'data'), III_FIXTURE_DPI_TOKEN: fixture.delegatedToken });
    const worker = spawn(process.execPath, [resolve(clientBin), '--config', configPath], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    workers.add(worker);
    worker.stderr.on('data', chunk => { diagnostics = (diagnostics + chunk).slice(-4000); });
    return worker;
  };
  t.after(async () => {
    paused?.release(); releaseHeld();
    await Promise.all([...workers].map(stopWorker));
    await engine.close(); await fixture.close(); await rm(root, { recursive: true, force: true });
  });
  const ns = fixture.config.namespace, functionId = name => `durable-pi::${name}`;
  const call = (name, body, hint, dropReply = false) => engine.invoke(ns, functionId(name),
    { ...signed(keys.privateKey, fixture.config.sessionId, functionId(name), body), ...(hint === undefined ? {} : { _caller_worker_id: hint }) },
    { authority: 'human', source: 'terminal', tools: ['bash'] }, dropReply);

  let held = new Promise(resolve => { releaseHeld = resolve; });
  const large = 'NATIVE_III_😀_'.repeat(2200), heldContent = 'HOLD_DISPOSABLE_III_JOB';
  fixture.setResponder(async (text, _transcript, faux) => {
    if (text === heldContent) { await held; return faux.fauxAssistantMessage(large); }
    return faux.fauxAssistantMessage(`NATIVE_OTHER:${text}`);
  });
  const badConfig = join(root, 'wrong-namespace.json');
  await writeFile(badConfig, JSON.stringify({ ...fixture.config, namespace: 'default' }), { mode: 0o600 });
  const wrongWorker = await startWorker(badConfig);
  const [wrongExit] = await once(wrongWorker, 'exit');
  assert.equal(wrongExit, 1); assert.match(diagnostics, /PERSISTED_BINDING_CONFLICT/); diagnostics = '';
  assert.equal(engine.frames.length, 0, 'mismatched config must not even register an engine transport');
  assert.equal(fixture.generations.size, 0);
  const firstWorker = await startWorker();
  await engine.waitFunction(ns, functionId('start'));
  const proof = await call('info', {});
  assert.equal(proof.source, 'iii'); assert.equal(proof.authority, 'delegated'); assert.equal(proof.namespace, ns);
  const intent = { requestId: 'stable-native-job', content: heldContent };
  await assert.rejects(call('start', intent, 'human', true), /SIMULATED_LOST_ACK/);
  const pending = await call('requests::get', { requestId: intent.requestId });
  assert.ok(Number.isSafeInteger(pending.submissionId)); assert.ok(pending.conversationId > 1);
  assert.notEqual(pending.receipt?.status, 'done');
  const foreignTarget = { binding: fixture.config.sessionId, session: fixture.config.sessionId, type: 'conversation', conversationId: 1 };
  await assert.rejects(call('controls::inspect', { target: foreignTarget }), /PARENT_CONTROL_DENIED|CONTROL_TARGET_DENIED|scope|403/i);
  await stopWorker(firstWorker);
  releaseHeld();
  const persisted = await fixture.waitSubmission(pending.submissionId);
  assert.equal(persisted.status, 'done'); assert.equal(persisted.answer.text, large);
  await fixture.reopen();
  await startWorker(); await engine.waitFunction(ns, functionId('requests::get'));
  const result = await call('requests::get', { requestId: intent.requestId });
  assert.equal(result.submissionId, pending.submissionId); assert.equal(result.receipt.status, 'done');
  assert.equal(result.resultInfo.answerRef, `durable:${pending.conversationId}:${persisted.answer.entryId}`);
  const answerRef = result.resultInfo.answerRef, pageInput = { requestId: intent.requestId, answerRef, limit: 4096 };
  const oldPage = await call('requests::result', pageInput); assert.ok(oldPage.cursor);
  await fixture.reopen();
  await assert.rejects(call('requests::result', { ...pageInput, cursor: oldPage.cursor }), /CURSOR_CONFLICT/);
  let combined = '', cursor;
  do {
    const page = await call('requests::result', { ...pageInput, ...(cursor === undefined ? {} : { cursor }) });
    assert.equal(page.answerRef, answerRef); assert.equal(page.totalChars, large.length);
    assert.equal(page.sha256, createHash('sha256').update(large).digest('hex'));
    combined += page.text; cursor = page.cursor;
  } while (cursor !== null);
  assert.equal(combined, large);
  await assert.rejects(call('requests::result', { ...pageInput, answerRef: 'tree-invalidation:1' }), /RESULT_REFERENCE_CONFLICT/);
  const retries = await Promise.all(Array.from({ length: 4 }, () => call('start', intent, { authority: 'human' })));
  for (const retry of retries) { assert.equal(retry.submissionId, pending.submissionId); assert.equal(retry.fingerprint, result.fingerprint); }
  assert.equal(fixture.generations.get(heldContent), 1);
  await assert.rejects(call('start', { ...intent, content: 'CHANGED_BODY' }), /REQUEST_PAYLOAD_CONFLICT|conflict/i);
  await assert.rejects(call('steer', { ...intent, jobId: intent.requestId }), /REQUEST_PAYLOAD_CONFLICT|conflict/i);
  for (const extra of [{ authority: 'human' }, { source: 'terminal' }, { tools: ['bash'] }, { namespace: 'default' }, { _caller_worker_id: 'root' }]) {
    await assert.rejects(call('start', { requestId: 'forged', content: 'MUST_NOT_EXECUTE', ...extra }), /UNKNOWN_INPUT_FIELD/);
  }
  assert.equal(await call('requests::get', { requestId: 'forged' }), null);
  const runResult = await call('run', { requestId: 'native-run', content: 'NATIVE_RUN_COMPLETE' });
  assert.equal(runResult.receipt.status, 'done'); assert.equal(runResult.result, 'NATIVE_OTHER:NATIVE_RUN_COMPLETE');

  const target = { ...foreignTarget, conversationId: pending.conversationId };
  const inspection = await call('controls::inspect', { target });
  await assert.rejects(call('subagents::spawn', { target, controlId: 'stale-spawn', expectedRevision: '0'.repeat(64), name: 'stale', task: 'MUST_NOT_EXECUTE' }), /revision|conflict/i);
  const child = await call('subagents::spawn', { target, controlId: 'native-child', expectedRevision: inspection.revision, name: 'native-child', task: 'NATIVE_CHILD_FIXTURE', tools: ['read'] });
  assert.ok(child.conversationId > 1); assert.equal(child.parentId, pending.conversationId);
  const childReceipt = await call('controls::get', { controlId: 'native-child' });
  assert.equal(childReceipt.childKey, child.childKey); assert.equal(childReceipt.requestId, child.requestId);

  // Hold only the genuine existing native abort call: the actual owner persists intent first.
  paused = await fixture.pauseAbort(pending.conversationId);
  const stopIntent = { jobId: intent.requestId, controlId: 'stop-native-job', expectedGeneration: result.jobGeneration };
  const stopping = call('stop', stopIntent);
  await Promise.race([paused.reached, stopping.then(() => { throw Error('Native abort pause was not reached'); })]);
  const stopPending = await call('controls::get', { controlId: stopIntent.controlId });
  assert.equal(stopPending.outcome, 'pending'); assert.equal(stopPending.stopped, false); assert.equal(stopPending.stopRequested, false);
  paused.release(); paused = undefined;
  const stopped = await stopping; assert.equal(stopped.stopped, true);
  await fixture.reopen();
  const stoppedAgain = await call('controls::get', { controlId: stopIntent.controlId });
  assert.equal(stoppedAgain.stopped, true); assert.equal(stoppedAgain.conversationId, pending.conversationId);
  assert.equal(fixture.revoke(), true);
  await assert.rejects(call('subagents::spawn', { target, controlId: 'revoked-spawn', expectedRevision: inspection.revision, name: 'revoked', task: 'MUST_NOT_EXECUTE' }), /unauthorized|401|revoked/i);
  assert.equal(fixture.generations.has('MUST_NOT_EXECUTE'), false);
  assert.equal(engine.frames.some(frame => frame.credentialPresent), false);
  assert.equal(diagnostics, '');
});
