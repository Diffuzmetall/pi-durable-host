import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID, createHash, createPrivateKey } from 'node:crypto';
import { registerWorker } from 'iii-sdk';
import { signed } from '../node_modules/dpi-iii-adapter/dist/auth.js';
process.umask(0o077);
const release = '/home/ubuntu/.local/share/pi-durable-host/releases/c0019d7-dadd5534';
const root = join(release, 'live-control');
assert(!existsSync(join(release, 'live-acceptance-ledger/iii.json')), 'III_SLOT_ALREADY_CONSUMED_NO_RETRY');
const config = JSON.parse(readFileSync(join(root, 'iii-worker.json'), 'utf8'));
const key = createPrivateKey(readFileSync(join(root, 'iii-private.pem')));
const expectedReply = `PI_DURABLE_III_${randomUUID().slice(0, 8)}`;
const prompt = `This is a controlled Pi Durable check through the actual iii engine and signed SDK adapter. Do not use tools. Reply exactly: ${expectedReply}`;
const probe = { stage: 'iii', sessionId: config.host.sessionId, requestId: randomUUID(), prompt, expectedReply,
  promptSha256: createHash('sha256').update(prompt).digest('hex') };
writeFileSync(join(root, 'iii-probe.json'), JSON.stringify(probe), { flag: 'wx', mode: 0o600, flush: true });
writeFileSync(join(root, 'active-permit.next'), JSON.stringify(probe), { flag: 'wx', mode: 0o600, flush: true });
renameSync(join(root, 'active-permit.next'), join(root, 'active-permit.json'));
const caller = registerWorker(config.url, { namespace: config.namespace, workerName: 'cutover-acceptance-caller',
  otel: { enabled: false }, enableMetricsReporting: false, invocationTimeoutMs: 90_000 });
const call = (operation, payload) => {
  const functionId = `durable-pi::${operation}`;
  return caller.trigger({ namespace: config.namespace, function_id: functionId, payload: signed(key, config.sessionId, functionId, payload) });
};
try {
  const info = await call('info', {});
  assert.equal(info.authority, 'delegated'); assert.equal(info.nativeSessionId, config.host.sessionId);
  const intent = { requestId: probe.requestId, content: prompt };
  const first = await call('run', intent);
  assert.equal(first.receipt?.status, 'done', 'NATIVE_COMPLETION_REQUIRED');
  const replay = await call('run', intent);
  assert.equal(replay.submissionId, first.submissionId);
  const result = await call('requests::get', { requestId: probe.requestId });
  assert.equal(result.receipt.status, 'done');
  let answer = '', cursor;
  do {
    const page = await call('requests::result', { requestId: probe.requestId, answerRef: result.resultInfo.answerRef, limit: 4096, ...(cursor ? { cursor } : {}) });
    assert.equal(page.sha256, result.resultInfo.sha256); answer += page.text; cursor = page.cursor;
  } while (cursor !== null);
  assert(answer.includes(expectedReply));
  assert.equal(createHash('sha256').update(answer).digest('hex'), result.resultInfo.sha256);
  writeFileSync(join(root, 'iii-transport-RESULT.json'), JSON.stringify({ passed: true, engine: '0.24.6', signed: true, authority: info.authority,
    sameSubmissionOnReplay: true, answerSha256: result.resultInfo.sha256, nativeSessionReused: true }), { flag: 'wx', mode: 0o600, flush: true });
  console.log('REAL_III_PASS: signed actual engine/adapter, delegated native completion, same-key replay, answer checksum');
} finally { await caller.shutdown(); }
