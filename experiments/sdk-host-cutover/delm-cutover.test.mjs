import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { retained } from './delm-cutover-state.mjs';
import { deliverContinuation } from './delm-continuation.mjs';
import { nextUnit } from './delm-cutover-unit.mjs';

const unitOptions = { base: '/releases/base', release: '/releases/delm', bindings: '/private/bindings.json' };
const oldUnit = Buffer.from('[Service]\nExecStart=node /releases/base/operational-service.mjs config.json\n');
test('initial activation retains unit settings and adds one exact bindings line', () => {
  const unit = nextUnit(oldUnit, { ...unitOptions, currentService: '/releases/base/operational-service.mjs' });
  assert.equal(unit.toString(), '[Service]\nEnvironment=DELM_BINDINGS_FILE=/private/bindings.json\nExecStart=node /releases/delm/operational-service.mjs config.json\n');
});
test('same-release reload preserves unit bytes without duplicate environment', () => {
  const unit = nextUnit(oldUnit, { ...unitOptions, currentService: '/releases/base/operational-service.mjs' });
  assert.deepEqual(nextUnit(unit, { ...unitOptions, currentService: '/releases/delm/operational-service.mjs' }), unit);
});
test('unknown service owner and changed bindings are refused', () => {
  assert.throws(() => nextUnit(oldUnit, { ...unitOptions, currentService: '/other/service.mjs' }));
  const unit = nextUnit(oldUnit, { ...unitOptions, currentService: '/releases/base/operational-service.mjs' });
  assert.throws(() => nextUnit(unit, { ...unitOptions, bindings: '/other/bindings.json', currentService: '/releases/delm/operational-service.mjs' }));
});

const baseline = () => ({ sessions: [{ id: 'session', cwd: '/project', agents: [{ id: 1,
  config: { model: { provider: 'p', modelId: 'exact-model' } }, tools: ['read'], entries: { 1: 'hash' } }] }] });
test('retained verification permits additional entries, tools, sessions and current activity', () => {
  const before = baseline(), after = baseline();
  after.sessions[0].agents[0].entries[2] = 'new'; after.sessions[0].agents[0].tools.push('delm_wait');
  after.sessions[0].agents[0].busy = true; after.sessions.push({ id: 'additional' });
  assert.equal(retained(before, after).passed, true);
});
for (const [name, mutate] of [
  ['changed original entry', a => { a.sessions[0].agents[0].entries[1] = 'changed'; }],
  ['missing original entry', a => { delete a.sessions[0].agents[0].entries[1]; }],
  ['model substitution', a => { a.sessions[0].agents[0].config.model.modelId = 'other'; }],
  ['lost tool', a => { a.sessions[0].agents[0].tools = []; }],
  ['lost session', a => { a.sessions = []; }],
]) test(name + ' is refused', () => { const after = baseline(); mutate(after); assert.throws(() => retained(baseline(), after)); });

test('ambiguous continuation retries exact persisted bytes/ID; recovery does not repeat accepted delivery', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'delm-continuation-'));
  try {
    const content = 'Actual authorized deployment result; no new permission.';
    const intent = { content, requestId: 'stable-result', parentSession: 'parent', contentSha256: createHash('sha256').update(content).digest('hex') };
    await writeFile(join(dir, 'continuation-intent.json'), JSON.stringify(intent), { mode: 0o600 });
    const calls = [], accepted = new Map();
    const client = { agent: (session, root) => ({ send: async (...args) => {
      assert.equal(session, 'parent'); assert.equal(root, 1); calls.push(args);
      accepted.set(args[2], { submissionId: 17, status: 'queued' });
      if (calls.length === 1) throw Error('Response lost after acceptance');
      return accepted.get(args[2]);
    } }) };
    const receipt = await deliverContinuation(client, dir, { delayMs: 0 });
    assert.equal(receipt.submissionId, 17); assert.equal(calls.length, 2); assert.deepEqual(calls[0], calls[1]); assert.equal(accepted.size, 1);
    assert.deepEqual(await deliverContinuation(client, dir, { delayMs: 0 }), receipt); assert.equal(calls.length, 2);
    assert.equal(JSON.parse(await readFile(join(dir, 'continuation-intent.json'), 'utf8')).content, content);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
