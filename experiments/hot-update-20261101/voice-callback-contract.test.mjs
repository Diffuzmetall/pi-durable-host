import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { BACKGROUND_CONTEXT as ctx } from '@earendil-works/chord/context';
import { createRegistry, Harness } from '@earendil-works/pi-durable';
import { NodeExecutionEnv } from '@earendil-works/pi-durable/env/node';
import { openNodeSqliteStorage } from '@earendil-works/pi-durable/storage/sqlite/node';
import { createModels } from '@earendil-works/pi-ai/models';
import { fauxProvider, fauxAssistantMessage } from '@earendil-works/pi-ai/providers/faux';
import { ComponentCapabilities, prepareComponents, audioLeaseCapability } from '@howaboua/pi-durable-components';
import { createComponent, gippityVoiceOptions, gippityVoiceTarget } from '@howaboua/pi-durable-gippity-voice/component';

// A public callback seam probe, NOT real audio, Host HTTP reload or product acceptance.
test('real voice component retains its native kernel while an accepted RPC completes on v1 and a future RPC uses v2', { timeout: 20000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'voice-callback-contract-'));
  const env = new NodeExecutionEnv({ cwd: directory });
  const models = createModels();
  const faux = fauxProvider({ tokensPerSecond: 100000 });
  faux.setResponses([fauxAssistantMessage('local bootstrap')]); models.setProvider(faux.provider);
  let release, started;
  const held = new Promise(resolve => { release = resolve; });
  const entered = new Promise(resolve => { started = resolve; });
  const audio = { namespace: env.id, launch: () => assert.fail('audio boundary must not run') };
  const lease = { acquire: () => assert.fail('physical microphone must not run') };
  const options = { namespace: env.id, audio, lease, instructions: 'Local contract fixture.',
    config: { voice: { autoResumeRealtime: false, refreshRealtimeAfterCompaction: false } },
    async rpc(_request, signal) { started(); await held; signal.throwIfAborted(); return 'callback-v1'; },
  };
  const capabilities = new ComponentCapabilities().provide(audioLeaseCapability, lease)
    .provide(gippityVoiceOptions, options).provide(gippityVoiceTarget, 1);
  const pkg = { name: '@howaboua/pi-durable-gippity-voice', version: '0.10.0', description: 'Installed public factory probe',
    peerDependencies: {}, peerDependenciesMeta: {}, durable: { schemaVersion: 1, kind: 'extension',
      entry: './component', runtimes: ['node'], requires: [], permissions: [] } };
  let idleCalls = 0;
  const prepared = await prepareComponents([{ manifest: pkg, load: async () => ({ createComponent }) }], {
    capabilities, compatibility: { runtime: 'node', peers: {} }, existing: { extensions: [], providers: [] },
    whenIdle: async () => { idleCalls++; throw Error('retirement not permitted by this probe'); },
  }, ctx);
  assert.equal(prepared.instances.length, 1);
  const instance = prepared.instances[0].instance;
  assert.equal(instance.retention, 'idle');
  assert.equal(instance.stopAdmission, undefined);
  const controls = instance.api.controls;
  const registry = createRegistry();
  for (const extension of prepared.extensions) registry.install(extension);
  const storage = await openNodeSqliteStorage(join(directory, 'agent.sqlite'));
  let harness, pending;
  try {
    harness = await Harness.open(storage, { registry, models, env: () => env,
      settings: { extensions: prepared.extensions } }, ctx);
    const root = await harness.root(ctx, { agent: { model: { provider: 'faux', modelId: 'faux-1' }, extensions: prepared.extensions } });
    await prepared.bind({ harness, storage }, ctx);
    await controls.sendText('establish native service', ctx);
    const graph = await harness.taskGraph(ctx);
    const serviceIds = () => Object.values(graph.value.tasks).filter(task => task.kind.includes('gippity')).map(task => task.id);
    const before = serviceIds(); assert.ok(before.length > 0);
    const request = { target: 'fixture', method: 'record', args: [] };
    pending = controls.rpc(request); await entered;
    options.rpc = async (_request, signal) => { signal.throwIfAborted(); return 'callback-v2'; };
    assert.equal(await controls.rpc(request), 'callback-v2');
    assert.equal(prepared.status, 'bound');
    assert.equal(instance.api.controls, controls);
    assert.equal(idleCalls, 0);
    assert.equal(root.id, 1);
    assert.deepEqual(serviceIds(), before);
    graph.dispose();
    release(); assert.equal(await pending, 'callback-v1');
  } finally {
    release(); await pending?.catch(() => {});
    await prepared.closeBeforeHarness(ctx);
    await harness?.close(ctx);
    await prepared.closeAfterHarness(ctx);
    await storage.close(); await env.cleanup(ctx);
    await rm(directory, { recursive: true, force: true });
  }
});
