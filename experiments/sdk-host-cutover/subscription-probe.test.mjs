import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, readdir, chmod, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { subscriptionCredentials, subscriptionProbeFetch, probeStages, savedModel } from './subscription-probe.mjs';

const endpoint = 'https://chatgpt.com/backend-api/codex/responses';
const request = { method: 'POST', body: JSON.stringify({ model: savedModel.modelId, tool_choice: 'none', input: 'fixture' }) };

test('OAuth only, explicit provider, no refresh callback, private regular file', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cutover-auth-test-'));
  const path = join(directory, 'auth.json');
  const credential = { type: 'oauth', access: 'synthetic-access', refresh: 'synthetic-refresh', expires: Date.now() + 600_000 };
  const save = value => writeFile(path, JSON.stringify({ 'openai-codex': value }), { mode: 0o600 });
  await save(credential);
  const store = subscriptionCredentials(path);
  assert.deepEqual(await store.read('openai-codex'), credential);
  assert.equal(await store.read('other-provider'), undefined);
  assert.deepEqual(await store.list(), [{ providerId: 'openai-codex', type: 'oauth' }]);
  let refreshed = false;
  await assert.rejects(store.modify('openai-codex', async () => { refreshed = true; return credential; }), /MUST_NOT_REFRESH/);
  await assert.rejects(store.delete('openai-codex'), /MUST_NOT_DELETE/);
  assert.equal(refreshed, false);
  await save({ type: 'api_key', key: 'synthetic-api-key' });
  await assert.rejects(store.read('openai-codex'), /SUBSCRIPTION_OAUTH_REQUIRED/);
  await save({ ...credential, expires: 0 });
  await assert.rejects(store.read('openai-codex'), /REFRESH_REQUIRED_BEFORE_PROBE/);
  await writeFile(path, 'PRIVATE-MALFORMED-TOKEN');
  await assert.rejects(store.read('openai-codex'), error => error.message === 'AUTH_JSON_INVALID' && error.cause === undefined);
  await save(credential);
  await chmod(path, 0o644);
  await assert.rejects(store.read('openai-codex'), /PRIVATE_AUTH_FILE_REQUIRED/);
  await chmod(path, 0o600);
  const link = join(directory, 'link');
  await symlink(path, link);
  await assert.rejects(subscriptionCredentials(link).read('openai-codex'), { code: 'ELOOP' });
  const abort = AbortSignal.abort();
  await assert.rejects(store.read('openai-codex', { signal: abort }), { name: 'AbortError' });
  assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), { 'openai-codex': credential });
});

test('at most one dispatch per approved stage, including concurrent retries and restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cutover-budget-test-'));
  let calls = 0;
  const transport = async (_url, init) => {
    calls++;
    assert.equal(init.redirect, 'error');
    assert(init.signal instanceof AbortSignal);
    return new Response('synthetic');
  };
  for (const stage of probeStages) {
    const outcomes = await Promise.allSettled(Array.from({ length: 4 }, () => subscriptionProbeFetch(directory, stage, transport)(endpoint, request)));
    assert.equal(outcomes.filter(outcome => outcome.status === 'fulfilled').length, 1);
    assert(outcomes.filter(outcome => outcome.status === 'rejected').every(outcome => outcome.reason.code === 'EEXIST'));
    await assert.rejects(subscriptionProbeFetch(directory, stage, transport)(endpoint, request), { code: 'EEXIST' });
  }
  assert.equal(calls, 3);
  assert.equal((await readdir(directory)).length, 3);
  assert.throws(() => subscriptionProbeFetch(directory, 'new-attempt', transport), /UNAPPROVED_PROBE_STAGE/);
  const receipt = JSON.parse(await readFile(join(directory, 'selected-copy.json'), 'utf8'));
  assert.equal(receipt.outcome, 'dispatch_reserved_may_have_run');
  assert.equal('input' in receipt, false);
  assert.equal('headers' in receipt, false);
});

test('uncertain dispatch consumes its slot; invalid requests never reach transport', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cutover-failure-test-'));
  let calls = 0;
  const transport = async () => { calls++; throw Error('synthetic network failure'); };
  const fetch = subscriptionProbeFetch(directory, 'terminal', transport);
  await assert.rejects(fetch('https://api.openai.com/v1/responses', request), /SUBSCRIPTION_ENDPOINT_REQUIRED/);
  await assert.rejects(fetch(endpoint, { ...request, body: JSON.stringify({ model: 'replacement', tool_choice: 'none' }) }), /SAVED_MODEL_REQUIRED/);
  await assert.rejects(fetch(endpoint, { ...request, body: JSON.stringify({ model: savedModel.modelId, tool_choice: 'auto' }) }), /TEXT_ONLY_PROBE_REQUIRED/);
  await assert.rejects(fetch(endpoint, { ...request, body: JSON.stringify({ model: savedModel.modelId, tool_choice: 'none', service_tier: 'priority' }) }), /NO_EXTRA_SERVICE_TIER/);
  await assert.rejects(fetch(endpoint, { ...request, signal: AbortSignal.abort() }), { name: 'AbortError' });
  assert.equal(calls, 0);
  assert.deepEqual(await readdir(directory), []);
  await assert.rejects(fetch(endpoint, request), /synthetic network failure/);
  await assert.rejects(fetch(endpoint, request), { code: 'EEXIST' });
  assert.equal(calls, 1);
});
