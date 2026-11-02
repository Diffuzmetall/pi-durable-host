import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SourceTextModule, SyntheticModule } from 'node:vm';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

// Unchanged wrapper source; explicit offline dependencies. No auth, global
// configuration, production data or real model/MCP endpoint is loaded.
const ctx = { name: 'fixture-background-context' };
async function load(path, dependencies) {
  const url = new URL(path, import.meta.url);
  const module = new SourceTextModule(await readFile(url, 'utf8'), {
    identifier: url.href, initializeImportMeta(meta) { meta.url = url.href; meta.resolve = name => `file:///fixture/${name}/index.js`; },
    importModuleDynamically: async () => dependencies.dynamic,
  });
  await module.link(async specifier => {
    const exports = dependencies[specifier] ?? {};
    return new SyntheticModule(Object.keys(exports), function () {
      for (const [name, value] of Object.entries(exports)) this.setExport(name, value);
    });
  });
  await module.evaluate();
  return module;
}
async function fixture(kind, stage, failures = []) {
  const calls = [], original = Error('ATTACH_FIXTURE');
  const errors = Object.fromEntries(failures.map(name => [name, Error(`${name}_FIXTURE`)]));
  let child, nativeOptions;
  const composition = {
    extensions: [], native: { inventory: { unavailable: [] } },
    registry: { install() { if (stage === 'register') throw original; } },
    async shutdown(context) { assert.equal(context, ctx); calls.push('shutdown'); if (errors.shutdown) throw errors.shutdown; },
    async cleanup(context) {
      assert.equal(context, ctx); calls.push('cleanup');
      if (child) { child.stdin.end(); await once(child, 'exit'); }
      if (errors.cleanup) throw errors.cleanup;
    },
  };
  const native = Object.assign(async runtime => {
    if (stage === 'native') throw original;
    if (nativeOptions) await nativeOptions.connectMcp(runtime);
    child = spawn(process.execPath, ['-e', 'process.stdin.resume()'], { stdio: ['pipe', 'ignore', 'ignore'] });
    return composition;
  }, { id: 'fixture@1', capabilities: ['fixture-capability'] });
  const attach = async () => { if (stage === 'attach') throw original; return composition; };
  let module;
  if (kind === 'DeLM') {
    module = await load('./operational-profile.mjs', {
      'node:os': { homedir: () => '/fixture' }, 'node:path': { join: (...s) => s.join('/'), resolve: s => s },
      'node:fs/promises': { lstat: async () => ({ isFile: () => true }), readFile() {} }, 'node:util': { parseEnv() {} },
      '@earendil-works/chord/context': { BACKGROUND_CONTEXT: ctx },
      'dpi-backend/native-profile': { createNativeProfile: options => { nativeOptions = options; return native; }, createNativeModels() {}, resolveAvailableModel() {}, saveGeneratedImages() {}, loadRegistryAdapters() {} },
      '@earendil-works/pi-durable': { defineExtension: x => x, defineTool: x => x }, '@earendil-works/pi-ai': { Type: { Object: () => ({}) } },
      './compiled/bindings.mjs': Object.fromEntries(['AuthStorage', 'executeAntigravitySearch', 'generateAntigravityImageContent', 'antigravityApiKey', 'refreshAntigravityToken', 'loadTracingConfig', 'createSessionTracing', 'resolveMemoryBinding', 'resolveMemoryClient'].map(name => [name, () => {}])),
      './session-mcp.mjs': { connectSessionMcp: async () => ({ status() { if (stage === 'status') throw original; return { servers: [] }; } }) },
      './provision-session-mail.mjs': { provisionNewSessionMail() {} }, './operational-models.mjs': { operationalModelOptions() {} },
      './delm-profile.mjs': { attachDelm: attach },
    });
  } else {
    const base = new SyntheticModule(['createOperationalProfile'], function () { this.setExport('createOperationalProfile', async () => native); });
    await base.link(() => {}); await base.evaluate();
    module = await load('../gippity-voice/operational-profile.mjs', {
      'node:fs/promises': { readFile: async () => JSON.stringify({ baseProfile: '/fixture/base.mjs' }) },
      'node:url': { pathToFileURL: () => new URL('file:///fixture/base.mjs') },
      '@earendil-works/chord/context': { BACKGROUND_CONTEXT: ctx },
      './integration.mjs': { attachGippity: attach }, dynamic: base,
    });
  }
  return { module, composition, calls, original, errors, get child() { return child; } };
}
async function runFixture(kind, stage, failures, verify) {
  const saved = { GIPPITY_CONFIG: process.env.GIPPITY_CONFIG, DELM_BINDINGS_FILE: process.env.DELM_BINDINGS_FILE };
  process.env.GIPPITY_CONFIG = '/fixture/voice.json'; process.env.DELM_BINDINGS_FILE = '/fixture/bindings.json';
  const f = await fixture(kind, stage, failures);
  try {
    const profile = await f.module.namespace.createOperationalProfile({ models: {} });
    assert.equal(profile.id, 'fixture@1');
    await verify(f, () => profile({ cwd: '/fixture', directory: '/fixture', offline: true }));
  } finally {
    for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    f.child?.stdin.end();
  }
}
for (const innerFails of [false, true]) test(`nested DeLM/GipPity ${innerFails ? 'inner' : 'outer'} attach failure closes once`, async () => {
  await runFixture('DeLM', innerFails ? 'attach' : 'success', [], async (f) => {
    const outer = await load('../gippity-voice/operational-profile.mjs', {
      'node:fs/promises': { readFile: async () => JSON.stringify({ baseProfile: '/fixture/base.mjs' }) },
      'node:url': { pathToFileURL: () => new URL('file:///fixture/base.mjs') },
      '@earendil-works/chord/context': { BACKGROUND_CONTEXT: ctx },
      './integration.mjs': { attachGippity: async () => { throw f.original; } }, dynamic: f.module,
    });
    const profile = await outer.namespace.createOperationalProfile({ models: {} });
    await assert.rejects(profile({ cwd: '/fixture', directory: '/fixture', offline: true }), error => error === f.original);
    assert.deepEqual(f.calls, ['shutdown', 'cleanup']); assert.equal(f.child.exitCode, 0);
  });
});

for (const stage of ['register', 'bind']) test(`GipPity prepared ${stage} failure retains both lifecycle owners`, async () => {
  const calls = [], original = Error('PREPARED_FAILURE');
  const before = Error('BEFORE_FAILURE'), after = Error('AFTER_FAILURE');
  const prepared = {
    skipped: [], instances: [{ instance: { api: {} } }], extensions: [{}],
    async bind() { throw original; },
    async closeBeforeHarness() { calls.push('prepared.shutdown'); throw before; },
    async closeAfterHarness() { calls.push('prepared.cleanup'); throw after; },
  };
  class Capabilities { provide() { return this; } }
  const components = Object.fromEntries(['audioLeaseCapability', 'nativeWebRtcAudioCapability', 'nodeExecutionCapability', 'modelsCapability', 'networkCapability', 'stateCapability'].map(name => [name, {}]));
  const module = await load('../gippity-voice/integration.mjs', {
    'node:fs/promises': { mkdir() {}, rename() {}, writeFile: async () => {}, readFile: async path => JSON.stringify({ name: path.slice('/fixture/'.length, -'/package.json'.length), version: 'fixture', peerDependencies: {} }) },
    'node:path': await import('node:path'), 'node:url': await import('node:url'),
    '@earendil-works/chord/context': { BACKGROUND_CONTEXT: ctx },
    '@howaboua/pi-durable-components': { ...components, ComponentCapabilities: Capabilities, parseComponentPackage: x => x, prepareComponents: async () => prepared },
    '@howaboua/pi-durable-gippity-voice': { createNativeGippityAudioHost: () => ({}), checkGippityDictationReadiness() {} },
    '@howaboua/pi-durable-gippity-voice/component': { gippityVoiceOptions: {}, gippityVoiceTarget: {} },
  });
  const composition = {
    env: async () => ({ id: 'fixture' }), extensions: [],
    registry: { install() { if (stage === 'register') throw original; } },
    async shutdown() { calls.push('base.shutdown'); }, async cleanup() { calls.push('base.cleanup'); },
  };
  const attach = () => module.namespace.attachGippity(composition, { sessionId: 'fixture', models: {}, cwd: '/fixture', directory: '/fixture' }, {
    sessionId: 'fixture', conversationId: 1, bind: '127.0.0.1', port: 43210, origin: 'https://fixture.ts.net', audioHome: '/fixture', keyFile: '/fixture/key', certFile: '/fixture/cert',
  });
  if (stage === 'register') await assert.rejects(attach(), error => error === original);
  else { await attach(); await assert.rejects(composition.bind({}, ctx, {}), error => error === original); }
  await assert.rejects(composition.shutdown(ctx), error => error === before);
  await assert.rejects(composition.cleanup(ctx), error => error === after);
  assert.deepEqual(calls, ['prepared.shutdown', 'base.shutdown', 'prepared.cleanup', 'base.cleanup']);
});

for (const kind of ['DeLM', 'GipPity']) {
  for (const stage of (kind === 'DeLM' ? ['status', 'register', 'attach'] : ['attach']))
  for (const failures of [[], ['shutdown'], ['shutdown', 'cleanup']]) {
    test(`${kind} ${stage} rollback with ${failures.join('+') || 'successful hooks'}`, async () => {
      await runFixture(kind, stage, failures, async (f, open) => {
        await assert.rejects(open(), error => {
          if (!failures.length) assert.equal(error, f.original);
          else { assert.equal(error.cause, f.original); assert.deepEqual(error.errors, [f.original, ...failures.map(name => f.errors[name])]); }
          return true;
        });
        assert.deepEqual(f.calls, ['shutdown', 'cleanup']); assert.equal(f.child.exitCode, 0);
      });
    });
  }
  test(`${kind} success transfers ownership without early hooks`, async () => {
    await runFixture(kind, 'success', [], async (f, open) => {
      assert.equal(await open(), f.composition); assert.deepEqual(f.calls, []);
      await f.composition.shutdown(ctx); await f.composition.cleanup(ctx);
      assert.deepEqual(f.calls, ['shutdown', 'cleanup']); assert.equal(f.child.exitCode, 0);
    });
  });
  test(`${kind} native failure is not cleaned a second time`, async () => {
    await runFixture(kind, 'native', [], async (f, open) => {
      await assert.rejects(open(), error => error === f.original); assert.deepEqual(f.calls, []);
    });
  });
}
