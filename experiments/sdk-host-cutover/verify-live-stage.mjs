import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { DpiClient } from 'dpi-sdk';
const release = '/home/ubuntu/.local/share/pi-durable-host/releases/c0019d7-dadd5534';
const root = join(release, 'live-control');
const stage = process.argv[2];
assert(['terminal', 'selected-copy', 'iii'].includes(stage));
const probe = JSON.parse(readFileSync(join(root, `${stage}-probe.json`), 'utf8'));
const state = JSON.parse(readFileSync(join(root, 'host-state.json'), 'utf8'));
const client = new DpiClient(`http://127.0.0.1:${state.port}`, state.ownerToken);
let conversationId = 1;
if (stage === 'iii') {
  const delegated = new DpiClient(`http://127.0.0.1:${state.port}`, state.iiiGrant.token);
  const request = await delegated.agent(probe.sessionId, 1).iiiRequest(probe.requestId);
  assert.equal(request.receipt.status, 'done');
  conversationId = request.conversationId ?? request.receipt.conversationId;
  assert(Number.isSafeInteger(conversationId) && conversationId >= 1);
}
const agent = client.agent(probe.sessionId, conversationId);
const detail = await agent.get(); assert(!detail.busy, 'WAIT_FOR_NATIVE_COMPLETION');
const entries = []; let cursor;
do { const page = await agent.entries({ limit: 500, ...(cursor ? { cursor } : {}) }); entries.push(...page.items); cursor = page.next; } while (cursor);
const text = message => typeof message.content === 'string' ? message.content : (message.content ?? []).filter(block => block.type === 'text').map(block => block.text).join('');
const inputs = entries.filter(entry => entry.model?.some(message => message.role === 'user' && text(message) === probe.prompt));
assert.equal(inputs.length, 1, 'EXACTLY_ONE_ADMITTED_INPUT_REQUIRED');
const answers = entries.filter(entry => entry.id > inputs[0].id).flatMap(entry => (entry.model ?? []).filter(message => message.role === 'assistant'));
const answer = answers.map(text).join('\n');
assert(answer.includes(probe.expectedReply), 'EXPECTED_LIVE_ANSWER_REQUIRED');
assert(answers.every(message => message.stopReason !== 'error' && message.stopReason !== 'aborted'));
const precedingEntries = entries.filter(entry => entry.id < inputs[0].id).length;
if (stage === 'selected-copy') assert(precedingEntries >= 613, 'SAVED_HISTORY_REQUIRED');
const slot = JSON.parse(readFileSync(join(release, 'live-acceptance-ledger', `${stage}.json`), 'utf8'));
assert.equal(slot.modelId, 'gpt-6.1-sol');
const result = { stage, passed: true, precedingEntries, inputCount: inputs.length, answerSha256: createHash('sha256').update(answer).digest('hex'),
  requestSha256: slot.requestSha256, answer, recordedAt: new Date().toISOString() };
writeFileSync(join(root, `${stage}-RESULT.json`), JSON.stringify(result, null, 2), { flag: 'wx', mode: 0o600 });
const { answer: privateAnswer, ...safe } = result; console.log(JSON.stringify(safe));
