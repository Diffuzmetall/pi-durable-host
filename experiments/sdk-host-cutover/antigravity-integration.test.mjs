import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { InMemoryCredentialStore } from '@earendil-works/pi-ai';
import { createNativeModels } from 'dpi-backend/native-profile';
import { operationalModelOptions } from './operational-models.mjs';

test('actual bootstrap keeps builtins, ignores stale duplicate OAuth, hydrates cached public model IDs without network', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'antigravity-native-bootstrap-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(join(directory, 'antigravity-accounts.json'), JSON.stringify({ activeAccountId: 'fixture', accounts: {
    fixture: { access: '', refresh: 'fixture-only', expires: 1, projectId: 'fixture-only' },
  } }), { mode: 0o600 });
  const credentials = new InMemoryCredentialStore();
  await credentials.modify('antigravity', async () => ({ type: 'oauth', refresh: 'stale-duplicate', access: '', expires: 1 }));
  const options = await operationalModelOptions({ agentDir: directory, credentials });
  assert(options.providers.some(p => p.id === 'openai-codex'));
  assert(options.providers.some(p => p.id === 'antigravity'));
  assert.equal(await options.credentials.read('antigravity'), undefined);
  await assert.rejects(async () => options.credentials.modify('antigravity', async () => undefined), /READ_ONLY/);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => assert.fail('startup must never call an external API');
  t.after(() => { globalThis.fetch = originalFetch; });
  const runtime = await createNativeModels(options);
  const models = (await runtime.catalogue()).filter(x => x.provider === 'antigravity');
  assert(models.length >= 5); assert(models.every(x => x.available));
  assert(models.some(x => x.id === 'claude-opus-4-6'));
  assert.equal((await credentials.read('antigravity')).refresh, 'stale-duplicate');
});
