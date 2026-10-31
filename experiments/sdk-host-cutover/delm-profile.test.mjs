import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, symlinkSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { attachDelm } from './delm-profile.mjs';
import { reloadDurable } from '../../apps/dpi-backend/node_modules/@local/pi-durable-reload/dist/index.js';

// Unit fixtures exercise staging/publication; real Harness cases below use the shared operation.
async function publishPrepared(composition) {
  const prepared = await composition.prepareReload();
  await prepared.apply?.();
  prepared.publish();
}

function fixture(t) {
  const home = mkdtempSync(join(tmpdir(), 'delm-profile-'));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const workspace = join(home, 'project');
  const run = join(home, 'run');
  mkdirSync(workspace); mkdirSync(run); mkdirSync(join(run, 'alice'));
  writeFileSync(join(run, 'config.json'), JSON.stringify({ actors: { alice: 'synthetic' }, workspace }));
  const bindingFile = join(home, 'bindings.json');
  const binding = { run, actor: 'alice', workspace, enabled: true };
  const save = (entry = binding) => writeFileSync(bindingFile, JSON.stringify({ version: 1, sessions: { session1: entry } }), { mode: 0o600 });
  save();
  const modulePath = join(home, 'delm.mjs');
  writeFileSync(modulePath, `export const DelmWaitDoc = {kind:'delm.waits'};
export let options;
export function createDelmWait(value) { options=value; return {name:'delm',tools:[{name:'delm_wait',execute:async(args,api,ctx)=>api.commit(async()=>({ok:true}),ctx)}]}; }`);
  const calls = [];
  const context = { sessionId: 'session1', cwd: workspace };
  const agent = { cwd: workspace, extensions: [{ name: 'existing-sentinel' }] };
  const root = { id: 1, agent: async () => agent, configure: async change => Object.assign(agent, change) };
  const harness = { conversation: async () => root, snapshot: async () => ({ waits: {} }) };
  const originalReader = () => 'preserved';
  const composition = {
    registry: { install: extension => calls.push(['install', extension]) }, extensions: [],
    admitInput: async (...args) => calls.push(['admit', ...args]),
    bind: async (...args) => calls.push(['bind', ...args]),
    shutdown: async (...args) => calls.push(['shutdown', ...args]),
    documentReaders: new Map([['existing', originalReader]]),
  };
  const attach = () => attachDelm(composition, context, { bindingFile, modulePath });
  const execute = () => composition.extensions[0].tools[0].execute({}, { conversationId: 1, commit: fn => fn({}) }, {});
  return { home, workspace, run, bindingFile, binding, save, modulePath, calls, context, root, harness, composition, originalReader, attach, execute };
}

test('attaches before Harness, preserves composition/readers and uses current native admission', async t => {
  const f = fixture(t);
  assert.equal(await f.attach(), f.composition);
  assert.equal(f.composition.documentReaders.get('existing'), f.originalReader);
  assert.equal(f.composition.extensions.length, 1);
  const module = await import(pathToFileURL(f.modulePath).href);
  assert.equal(module.options.run, f.run);
  assert.equal(module.options.actor, 'alice');
  await assert.rejects(() => module.options.admitInput(f.root, 'request', {}));
  await f.composition.bind(f.harness, 'ctx', 'storage');
  await module.options.admitInput(f.root, 'request', {}, { conversationId: 1 });
  assert.deepEqual(f.calls.find(call => call[0] === 'admit').slice(1), [f.root, 'request', {}]);
  assert.deepEqual(await f.execute(), { ok: true });
  assert.deepEqual(await f.composition.documentReaders.get('delm.waits')(f.harness, f.root, {}), { waits: {} });
  assert.deepEqual(f.calls.find(call => call[0] === 'bind').slice(1), [f.harness, 'ctx', 'storage']);
});

test('unknown sessions retain a staged reload hook only; disabled sessions register but cannot execute until enabled', async t => {
  const f = fixture(t);
  const unknown = fixture(t);
  assert.equal(await attachDelm(unknown.composition, { ...unknown.context, sessionId: 'unknown' },
    { bindingFile: unknown.bindingFile, modulePath: '/missing' }), unknown.composition);
  assert.equal(unknown.composition.extensions.length, 0);
  assert.equal(typeof unknown.composition.prepareReload, 'function');
  f.save({ ...f.binding, enabled: false });
  await f.attach(); await f.composition.bind(f.harness, {});
  const { options } = await import(pathToFileURL(f.modulePath).href);
  assert.ok(f.composition.documentReaders.has('delm.waits'));
  await assert.rejects(f.execute);
  await assert.rejects(() => options.admitInput(f.root, 'request', {}));
  assert.equal(f.calls.filter(call => call[0] === 'admit').length, 0);
  f.save();
  assert.deepEqual(await f.execute(), { ok: true });
});

test('private binding permissions, owner, symlinks and schema fail closed', async t => {
  const f = fixture(t);
  chmodSync(f.bindingFile, 0o644); await assert.rejects(f.attach); chmodSync(f.bindingFile, 0o600);
  chmodSync(f.home, 0o755); await assert.rejects(f.attach); chmodSync(f.home, 0o700);
  const link = join(f.home, 'link.json'); symlinkSync(f.bindingFile, link);
  await assert.rejects(() => attachDelm(f.composition, f.context, { bindingFile: link, modulePath: f.modulePath }));
  for (const value of [null, { version: 2, sessions: {} }, { version: 1, sessions: [] },
    { version: 1, sessions: { session1: { ...f.binding, extra: true } } },
    { version: 1, sessions: { session1: { ...f.binding, enabled: 'true' } } },
    { version: 1, sessions: { session1: f.binding, session2: f.binding } }]) {
    writeFileSync(f.bindingFile, JSON.stringify(value)); await assert.rejects(f.attach);
  }
  // Foreign uid is checked explicitly in readBindings; no privileged chown in tests.
});

test('canonical workspace, actor and pinned module checks', async t => {
  const f = fixture(t);
  for (const entry of [{ ...f.binding, actor: '../alice' }, { ...f.binding, run: `${f.run}/.` },
    { ...f.binding, workspace: f.home }, { ...f.binding, actor: 'bob' }]) {
    f.save(entry); await assert.rejects(f.attach);
  }
  f.save();
  const link = join(f.home, 'module-link.mjs'); symlinkSync(f.modulePath, link);
  await assert.rejects(() => attachDelm(f.composition, f.context, { bindingFile: f.bindingFile, modulePath: link }));
  chmodSync(f.modulePath, 0o666); await assert.rejects(f.attach);
});

test('root-only tools/admission; actual conversation cwd and owner root are checked', async t => {
  const f = fixture(t); await f.attach(); await f.composition.bind(f.harness, {});
  const { options } = await import(pathToFileURL(f.modulePath).href);
  await assert.rejects(() => options.admitInput({ ...f.root, id: 2 }, 'request', {}));
  await assert.rejects(() => options.admitInput(f.root, 'request', {}, { conversationId: 2 }));
  // Invocation handles need not have agent(); only the owner's root is authoritative.
  await assert.rejects(() => f.composition.extensions[0].tools[0].execute({}, { conversationId: 2 }, {}));
  f.harness.conversation = async () => ({ id: 1, agent: async () => ({ cwd: f.home }) });
  await assert.rejects(() => options.admitInput(f.root, 'request', {}));
  assert.equal(f.calls.filter(call => call[0] === 'admit').length, 0);
});

test('live disable/removal/rebind and authority revocation fence admission; disabled status stays readable', async t => {
  const f = fixture(t); await f.attach(); await f.composition.bind(f.harness, {});
  const { options } = await import(pathToFileURL(f.modulePath).href);
  f.save({ ...f.binding, enabled: false });
  await assert.rejects(() => options.admitInput(f.root, 'request', {}));
  await assert.rejects(f.execute);
  assert.deepEqual(await f.composition.documentReaders.get('delm.waits')(f.harness, f.root, {}), { waits: {} });
  f.save({ ...f.binding, workspace: f.home }); await assert.rejects(f.execute);
  writeFileSync(f.bindingFile, JSON.stringify({ version: 1, sessions: {} })); await assert.rejects(f.execute);
  f.save(); f.composition.admitInput = async () => { throw Error('authority revoked'); };
  await assert.rejects(() => options.admitInput(f.root, 'request', {}), /authority revoked/);
  f.composition.admitInput = async () => f.save({ ...f.binding, enabled: false });
  await assert.rejects(() => options.admitInput(f.root, 'request', {}));
});

test('shutdown fences before awaiting original shutdown, forwards receiver/arguments', async t => {
  const f = fixture(t);
  let release;
  f.composition.shutdown = function (...args) {
    assert.equal(this, f.composition); assert.deepEqual(args, ['ctx']);
    return new Promise(resolve => { release = resolve; });
  };
  await f.attach(); await f.composition.bind(f.harness, {});
  const { options } = await import(pathToFileURL(f.modulePath).href);
  const closing = f.composition.shutdown('ctx');
  await assert.rejects(() => options.admitInput(f.root, 'request', {}));
  await assert.rejects(f.execute);
  release(); await closing;
});

test('transaction fence checks live binding before mutating waits', async t => {
  const f = fixture(t); await f.attach(); await f.composition.bind(f.harness, {});
  let touched = false;
  await assert.rejects(() => f.composition.extensions[0].tools[0].execute({}, {
    conversationId: 1, commit: async fn => {
      f.save({ ...f.binding, enabled: false });
      return fn(new Proxy({}, { get() { touched = true; } }));
    },
  }, {}));
  assert.equal(touched, false);
});

test('hot refresh installs only a newly bound session without rebinding or replacing its Harness', async t => {
  const f = fixture(t);
  writeFileSync(f.bindingFile, JSON.stringify({ version: 1, sessions: {} }));
  await f.attach();
  await f.composition.bind(f.harness, {});
  assert.equal(f.composition.extensions.length, 0);
  f.save();
  const prepared = await f.composition.prepareReload();
  assert.equal(f.composition.extensions.length, 0, 'preparation must not install or publish');
  await prepared.apply(); prepared.publish();
  assert.equal(f.composition.extensions.length, 1);
  assert.equal(f.calls.filter(call => call[0] === 'bind').length, 1);
  assert.deepEqual(await f.execute(), { ok: true });
  await publishPrepared(f.composition);
  assert.equal(f.calls.filter(call => call[0] === 'install').length, 1);
  assert.equal(f.calls.filter(call => call[0] === 'bind').length, 1);
  await assert.rejects(() => f.composition.bind({ ...f.harness }, {}));
  f.save({ ...f.binding, enabled: false });
  await publishPrepared(f.composition);
  await assert.rejects(f.execute);
  await f.composition.shutdown({});
  await assert.rejects(() => f.composition.prepareReload());
});

test('native profile stages DeLM alongside adapters: failed preparation retains old state; aliases publish once on the same Harness', async t => {
  const f = fixture(t);
  const { Store } = await import('dpi-backend/store');
  const { GrantPolicy, createHttpServer } = await import('dpi-backend/server');
  const { createNativeProfile, createNativeModels } = await import('dpi-backend/native-profile');
  const { DpiClient } = await import('dpi-sdk');
  const { fauxProvider } = await import('@earendil-works/pi-ai/providers/faux');
  const { BACKGROUND_CONTEXT: ctx } = await import('@earendil-works/chord/context');
  const require = createRequire(new URL('../../apps/dpi-backend/package.json', import.meta.url));
  writeFileSync(f.modulePath, `import { defineExtension } from ${JSON.stringify(pathToFileURL(require.resolve('@earendil-works/pi-durable')).href)};
export const DelmWaitDoc = {kind:'delm.waits'};
export function createDelmWait() { return defineExtension({name:'delm',tools:[]}); }`);
  writeFileSync(f.bindingFile, JSON.stringify({ version: 1, sessions: {} }));
  const owner = { id:'owner', token:'synthetic-owner', actor:'operator', source:'terminal', authority:'human',
    permissions:['read','write','control','filesystem','human-accept'], binding:{} };
  const policy = new GrantPolicy([owner]);
  const create = () => createNativeModels({ providers: [fauxProvider().provider], credentials: {
    read: async () => undefined, list: async () => [], modify: async () => { throw Error('no auth writes'); }, delete: async () => { throw Error('no auth writes'); },
  } });
  const models = await create();
  let failed = false;
  const native = createNativeProfile({ policy, owner: policy.authenticate(owner.token),
    models: { defaultModel: {provider:'faux',modelId:'faux-1'}, catalogue: models.catalogue, create },
    loadAdapters: async () => { if (failed) throw Error('isolated adapter failure'); return []; },
    connectMcp: async () => ({sources:[], close:async () => {}}),
    dcg: {binaryPath: join(f.home,'unconfigured-dcg'), envSource: () => ({})},
  });
  const profile = Object.assign(async context => attachDelm(await native(context), context,
    {bindingFile: f.bindingFile, modulePath: f.modulePath}), native);
  const store = await Store.open({dataDir: join(f.home,'data'), startDirs:[f.workspace], profile});
  const server = createHttpServer(store,policy).listen(0,'127.0.0.1'); await once(server,'listening');
  try {
    const client = new DpiClient(`http://127.0.0.1:${server.address().port}`,owner.token);
    const session = await client.createSession({name:'existing',cwd:f.workspace,model:{provider:'faux',modelId:'faux-1'}});
    const opened = store.opened.get(session.id), host = opened.harness;
    const root = await host.root(ctx), before = await root.agent(ctx);
    const registry = opened.profile.registry.snapshot();
    writeFileSync(f.bindingFile, JSON.stringify({version:1,sessions:{[session.id]:f.binding}}));
    failed = true;
    await assert.rejects(() => client.session(session.id).refreshRuntime());
    assert.equal(opened.profile.registry.snapshot(), registry);
    assert.equal(opened.profile.documentReaders.has('delm.waits'), false);
    assert.deepEqual((await root.agent(ctx)).extensions, before.extensions);
    failed = false;
    await client.session(session.id).refreshRuntime();
    await client.session(session.id).reload();
    assert.equal(opened.harness, host);
    assert.equal(opened.profile.extensions.filter(ext => ext.name === 'delm').length, 1);
    assert.equal(opened.profile.documentReaders.has('delm.waits'), true);
    assert.equal((await root.agent(ctx)).extensions.filter(ext => ext.name === 'delm').length, 1);
    assert.deepEqual((await root.agent(ctx)).model, before.model);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await store.close(); }
});

for (const hot of [false, true]) test(`actual matching-SDK Harness (${hot ? 'hot attach' : 'cold attach'}): board wait, denied wake, stable retry and faux generation`, { timeout: 20000 }, async t => {
  const f = fixture(t);
  const backend = fileURLToPath(new URL('../../apps/dpi-backend/package.json', import.meta.url));
  const require = createRequire(backend);
  const sdkRoot = process.env.DELM_TEST_SDK_ROOT ?? fileURLToPath(new URL('../../apps/dpi-backend/node_modules', import.meta.url));
  const hostRequire = createRequire(join(sdkRoot, '__delm_fixture__.cjs'));
  const { build } = require('esbuild');
  const sdkPath = realpathSync(hostRequire.resolve('@earendil-works/pi-durable'));
  const aiPath = realpathSync(join(sdkRoot, '@earendil-works/pi-ai/dist/index.js'));
  const packageEntry = realpathSync(process.env.DELM_TEST_ENGINE ?? fileURLToPath(new URL('../../../pi-durable-delm/extensions/delm/index.js', import.meta.url)));
  t.diagnostic(`DeLM engine: ${packageEntry}; Host SDK: ${sdkPath}`);
  const outfile = join(f.home, 'actual-delm.mjs');
  await build({ entryPoints: [packageEntry], outfile, bundle: true, format: 'esm', platform: 'node', logLevel: 'silent',
    plugins: [{ name: 'host-sdk', setup(builder) {
      builder.onResolve({ filter: /^@earendil-works\/(pi-durable|pi-ai)$/ }, args => ({ path: args.path.endsWith('/pi-durable') ? sdkPath : aiPath, external: true }));
    } }],
  });
  const { createRegistry, Harness, defineExtension } = await import(pathToFileURL(sdkPath).href);
  const { openNodeSqliteStorage } = await import(new URL('./storage/sqlite/node.js', pathToFileURL(sdkPath)).href);
  const { createModels } = await import(new URL('./models.js', pathToFileURL(aiPath)).href);
  const { fauxProvider, fauxAssistantMessage } = await import(new URL('./providers/faux.js', pathToFileURL(aiPath)).href);
  const { BACKGROUND_CONTEXT: ctx } = await import(pathToFileURL(realpathSync(join(sdkRoot, '@earendil-works/chord/dist/context/index.js'))).href);
  const project = process.env.DELM_TEST_BOARD_ROOT ?? dirname(dirname(dirname(packageEntry)));
  const env = { ...process.env, HOME: f.home, PYTHONDONTWRITEBYTECODE: '1' };
  rmSync(f.run, { recursive: true });
  execFileSync('python3', ['-B', join(project, 'scripts/delm_local.py'), 'init', f.run,
    '--shared-workspace', f.workspace, '--n', '2', '--task', 'isolated Host wrapper wait/wake'], { env, stdio: 'pipe' });
  const server = spawn('python3', ['-B', join(project, 'scripts/delm_local.py'), 'serve', f.run],
    { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let host;
  try {
    await Promise.race([once(server.stdout, 'data'), once(server, 'exit').then(() => { throw Error('Fixture board exited before readiness'); })]);
    let sequence = 0;
    const domain = (actor, args) => JSON.parse(execFileSync(join(f.run, actor, 'bin/context'),
      ['domain', JSON.stringify({ request_id: `wrapper-${++sequence}`, ...args })], { env, encoding: 'utf8' }));
    const task = domain('bob', { op: 'create', subject: 'bounded output', detail: 'complete only after waiter arms' }).task;
    const claim = domain('bob', { op: 'claim', item: task.id, expected_revision: task.revision }).task;
    const admissions = [];
    let denied = true;
    f.composition.admitInput = async (conversation, request) => {
      assert.equal(conversation.id, 1); admissions.push(request);
      if (denied) throw Error('isolated authority denial');
    };
    const sentinel = defineExtension({ name: 'existing-sentinel' });
    const originalRegistry = createRegistry(); originalRegistry.install(sentinel);
    const faux = fauxProvider(), models = createModels(); models.setProvider(faux.provider);
    const database = join(f.home, 'exact-existing-session.sqlite');
    host = await Harness.open(await openNodeSqliteStorage(database), { registry: originalRegistry, models }, ctx);
    const originalRoot = await host.root(ctx, { agent: { cwd: f.workspace, model: { provider: 'faux', modelId: 'faux-1' } } });
    await originalRoot.configure({ extensions: [sentinel], instructions: 'preserve existing operator instructions' }, ctx);
    assert.deepEqual((await originalRoot.agent(ctx)).extensions.map(extension => extension.name), ['existing-sentinel']);
    await host.close(ctx); host = undefined;
    f.composition.registry = createRegistry(); f.composition.registry.install(sentinel);
    if (hot) writeFileSync(f.bindingFile, JSON.stringify({ version: 1, sessions: {} }));
    else f.save({ ...f.binding, enabled: false });
    await attachDelm(f.composition, f.context, { bindingFile: f.bindingFile, modulePath: outfile });
    assert.equal(f.composition.registry.snapshot().tools().some(({ tool }) => tool.name === 'delm_wait'), !hot);
    let generations = 0;
    faux.setResponses([() => { generations++; return fauxAssistantMessage('Actual Harness received exactly one board wake'); }]);
    host = await Harness.open(await openNodeSqliteStorage(database), { registry: f.composition.registry, models }, ctx);
    const root = await host.conversation(1, ctx);
    assert.equal(root.id, originalRoot.id);
    assert.deepEqual((await root.agent(ctx)).extensions.map(extension => extension.name), ['existing-sentinel']);
    await f.composition.bind(host, ctx);
    if (hot) {
      assert.equal((await root.agent(ctx)).tools.some(tool => tool.name === 'delm_wait'), false);
      const sameHost = host;
      f.save({ ...f.binding, enabled: false });
      for (let i = 0; i < 2; i++) await reloadDurable({ harness: host, context: ctx,
        prepareExtensions: f.composition.prepareReload.bind(f.composition), assertCurrent() {} });
      assert.equal(host, sameHost, 'hot attach must preserve exact Harness');
      assert.equal(f.composition.extensions.length, 1, 'refresh must not duplicate extensions');
    }
    const restored = await root.agent(ctx);
    assert.deepEqual(restored.extensions.map(extension => extension.name), ['existing-sentinel', 'delm']);
    assert.equal(restored.instructions, 'preserve existing operator instructions');
    assert.ok(restored.tools.some(tool => tool.name === 'delm_wait'));
    const { DelmWaitDoc, wakeRequestId } = await import(pathToFileURL(outfile).href);
    const tool = f.composition.extensions[0].tools[0];
    const execute = async (args, key) => (await tool.execute(args, {
      conversationId: root.id, taskId: key, callId: key, commit: (fn, txContext) => host.commit(fn, txContext ?? ctx),
    }, ctx)).structuredOutput.result;
    const doc = () => host.snapshot(DelmWaitDoc, root.id, ctx);
    const until = async predicate => {
      const deadline = Date.now() + 8000;
      while (!await predicate()) {
        if (Date.now() > deadline) throw Error('Native wait/wake fixture timed out');
        await new Promise(resolve => setTimeout(resolve, 15));
      }
    };
    await assert.rejects(() => execute({ action: 'wait', items: [task.id], reason: 'must not arm disabled' }, 'disabled-arm'));
    assert.equal(generations, 0);
    assert.equal(admissions.length, 0);
    f.save();
    const armed = await execute({ action: 'wait', items: [task.id], reason: 'bounded native wake check' }, 'arm');
    assert.equal((await doc()).waits[armed.id].state, 'waiting');
    assert.equal(admissions.length, 0);
    host.resume();
    domain('bob', { op: 'complete', item: claim.id, expected_revision: claim.revision, generation: claim.generation, summary: 'fixture output complete' });
    await until(async () => (await doc()).waits[armed.id].state === 'failed');
    const requestId = wakeRequestId(armed.taskId);
    assert.deepEqual(admissions, [requestId]);
    assert.equal(await host.commit(tx => tx.submissionByRequest(root.id, requestId), ctx), undefined);
    assert.equal(generations, 0);
    denied = false;
    await execute({ action: 'retry', id: armed.id }, 'retry');
    await until(async () => (await doc()).waits[armed.id].state === 'sent');
    await root.waitForIdle(ctx);
    assert.deepEqual(admissions, [requestId, requestId]);
    assert.ok(await host.commit(tx => tx.submissionByRequest(root.id, requestId), ctx));
    assert.equal(generations, 1);
    const waits = await f.composition.documentReaders.get('delm.waits')(host, root, ctx);
    assert.equal(waits.waits[armed.id].state, 'sent');
    assert.equal((await execute({ action: 'status' }, 'status'))[0].requestId, requestId);

    if (hot) {
      // Available-work semantics run on the actual newly installed task registry,
      // Python board and scheduler, not a mocked callback or manual resume input.
      const free = domain('bob', { op: 'create', subject: 'existing free output', detail: 'claim once' }).task;
      const immediate = await execute({ action: 'work', reason: 'take existing free work' }, 'free-work');
      assert.equal(immediate.workAvailableNow, true);
      const first = domain('alice', { op: 'claim', item: free.id, expected_revision: free.revision }).task;
      assert.equal(domain('alice', { op: 'complete', item: first.id, expected_revision: first.revision,
        generation: first.generation, summary: 'existing free task finished' }).task.state, 'done');
      faux.setResponses([() => { generations++; return fauxAssistantMessage('Actual hot-attached work watcher received new free task'); }]);
      const waiting = await execute({ action: 'work', reason: 'one delayed task after empty queue' }, 'delayed-work');
      assert.equal((await doc()).waits[waiting.id].state, 'waiting');
      assert.equal(generations, 1, 'durable work wait must not poll models');
      const later = domain('bob', { op: 'create', subject: 'delayed free output', detail: 'one native wake' }).task;
      await until(async () => (await doc()).waits[waiting.id].state === 'sent');
      await root.waitForIdle(ctx);
      const delivered = (await doc()).waits[waiting.id];
      assert.equal(delivered.requestId, wakeRequestId(waiting.taskId));
      assert.equal(delivered.trigger.kind, 'work');
      assert.ok(delivered.trigger.tasks.includes(later.id));
      assert.equal(generations, 2, 'new board work must trigger exactly one native model wake');
      const receipt = domain('alice', { op: 'snapshot', request_id: delivered.receipt.request_id });
      assert.ok(receipt.view.queue.some(item => item.id === later.id));
      domain('alice', { op: 'ack', receipt_id: receipt.receipt_id });
      const taken = domain('alice', { op: 'claim', item: later.id, expected_revision: later.revision }).task;
      assert.equal(domain('alice', { op: 'complete', item: taken.id, expected_revision: taken.revision,
        generation: taken.generation, summary: 'delayed work claimed and finished after native wake' }).task.state, 'done');
      const reconciled = await execute({ action: 'status' }, 'read-ack-status');
      assert.equal(reconciled.find(entry => entry.id === waiting.id).deliveryState, 'acked');
      assert.equal(Object.values((await doc()).waits).filter(entry => entry.state === 'waiting').length, 0);
    }
    const expectedGenerations = hot ? 2 : 1;

    // Reopen the exact same DB again, now with 'delm' already persisted in AgentDoc.
    await f.composition.shutdown(ctx); await host.close(ctx); host = undefined;
    f.save({ ...f.binding, enabled: false });
    const restarted = { registry: createRegistry(), extensions: [sentinel],
      admitInput: async () => assert.fail('status must not admit model input'), shutdown: async () => {} };
    restarted.registry.install(sentinel);
    await attachDelm(restarted, f.context, { bindingFile: f.bindingFile, modulePath: outfile });
    host = await Harness.open(await openNodeSqliteStorage(database), { registry: restarted.registry, models }, ctx);
    const resumedRoot = await host.conversation(1, ctx);
    await restarted.bind(host, ctx);
    assert.deepEqual((await resumedRoot.agent(ctx)).extensions.map(extension => extension.name), ['existing-sentinel', 'delm']);
    assert.ok((await resumedRoot.agent(ctx)).tools.some(tool => tool.name === 'delm_wait'));
    const restoredTool = (await resumedRoot.agent(ctx)).tools.find(tool => tool.name === 'delm_wait');
    const status = () => restoredTool.execute({ action: 'status' }, {
      conversationId: 1, taskId: 'restart-status', callId: 'restart-status', commit: (fn, txContext) => host.commit(fn, txContext ?? ctx),
    }, ctx);
    await assert.rejects(status);
    assert.ok(await restarted.documentReaders.get('delm.waits')(host, resumedRoot, ctx));
    assert.equal(generations, expectedGenerations);
    f.save();
    assert.equal((await status()).structuredOutput.result[0].requestId, requestId);
    assert.equal(generations, expectedGenerations, 'disabled startup and resume status do not generate');
    await restarted.shutdown(ctx);
  } finally {
    await f.composition.shutdown(ctx);
    if (host) await host.close(ctx);
    const stopped = once(server, 'close'); server.kill('SIGTERM'); await stopped;
  }
});

