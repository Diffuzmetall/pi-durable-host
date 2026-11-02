// Independent installed Host/SDK probe. Invoke only through Frank's sandbox/run.py.
// Run staged under /scratch with node_modules -> /candidate/node_modules.
// Uses existing native profile/reload; external model is explicitly faux.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, mkdtemp, readdir, realpath, symlink, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';

assert.equal(process.env.HOME, '/scratch/home', 'Sandbox only; no live fallback');
const selfCheck = JSON.parse(await readFile('/scratch/sandbox-check.json', 'utf8'));
assert.equal(selfCheck.status, 'PASS');
assert.equal(selfCheck.child, 'PASS');
const candidate = '/candidate';
const backend = `${candidate}/node_modules/dpi-backend/dist/dpi-backend/src`;
const load = name => import(pathToFileURL(`${backend}/${name}.js`).href);
for (const specifier of ['@earendil-works/pi-durable', '@earendil-works/pi-ai', '@earendil-works/chord/context']) {
  const resolved = await realpath(new URL(import.meta.resolve(specifier)));
  assert.ok(resolved.startsWith(`${candidate}/`), `Noncandidate runtime import: ${specifier}`);
}
const { BACKGROUND_CONTEXT: ctx, withAbortSignal } = await import('@earendil-works/chord/context');
const { InMemoryCredentialStore, Type } = await import('@earendil-works/pi-ai');
const { fauxProvider, fauxAssistantMessage, fauxToolCall } = await import('@earendil-works/pi-ai/providers/faux');
const { createRegistry, defineExtension, defineTool, defineTask, hook, ToolTask } = await import('@earendil-works/pi-durable');
const { getCurrentTools } = await import('@earendil-works/pi-ai/utils/transcript');
const { loadRegistryAdapters } = await import(pathToFileURL(`${candidate}/node_modules/dpi-backend/node_modules/@local/pi-durable-reload/dist/index.js`).href);
const { Store } = await load('store');
const { createNativeProfile, createNativeModels } = await load('native-profile/profile');
const { GrantPolicy } = await load('grants');
const { createHttpServer } = await load('http-server');
const { ScheduleDoc } = await load('native-profile/automation/schedules');
const { readResourceSettings } = await load('native-profile/skills/index');
const { DpiClient } = await import(pathToFileURL(`${candidate}/node_modules/dpi-sdk/dist/client.js`).href);

const directory = await mkdtemp('/scratch/tmp/heidi-r4-core-');
const work = join(directory, 'project'), otherWork = join(directory, 'other-project');
for (const project of [work, otherWork]) await mkdir(project);
const skillA = join(work, '.pi/skills/qa-first/SKILL.md');
await mkdir(join(work, '.pi/skills/qa-first'), { recursive: true });
await mkdir(join(otherWork, '.pi/skills/qa-b'), { recursive: true });
await writeFile(skillA, '---\nname: qa-first\ndescription: Independent QA skill\n---\nQA_SKILL_V1\n');
await writeFile(join(otherWork, '.pi/skills/qa-b/SKILL.md'), '---\nname: qa-b\ndescription: Isolated B skill\n---\nQA_B_SKILL\n');
await writeFile(join(work, 'AGENTS.md'), 'QA_PROJECT_CONTEXT_V1\n');
await writeFile(join(otherWork, 'AGENTS.md'), 'QA_B_PROJECT_CONTEXT\n');
const selected = { provider: 'heidi-r4-faux', modelId: 'exact-saved-model' };
const owner = { id: 'owner', token: 'QA_ONLY_OWNER', actor: 'operator', source: 'terminal', authority: 'human',
  permissions: ['read','write','control','filesystem','human-accept'], binding: {} };
const policy = new GrantPolicy([owner]);
const credentials = new InMemoryCredentialStore();
await credentials.modify(selected.provider, async () => ({ type: 'api_key', key: 'SYNTHETIC_QA_ONLY' }));
let version = 1, fault = false, releaseTool, toolStarted, activeGate, modulePath;
let store, server;
let phaseStarted, releasePhase, phaseGate, releaseGeneration, unsafeStarted, unsafeTask;
let taskVersion = 1, schemaMode = 0, interruptUnsafe = false, extraExtension = false, currentSystem = '';
const effects = [], samples = [], hiddenHooks = [], phaseEffects = [];
let modelRequests = 0, resourceCloses = 0, plannedResponses = [];
const options = () => {
  const faux = fauxProvider({ provider: selected.provider, models: [{ id: selected.modelId, contextWindow: 100000, maxTokens: 4096 }], tokensPerSecond: 100000 });
  // Self-requeue inside this faux boundary; never retain a growing list of old providers in QA.
  const respond = async request => {
    faux.appendResponses([respond]);
    modelRequests++;
    currentSystem = JSON.stringify(request.messages.filter(message => message.role === 'system').at(-1));
    const next = plannedResponses.shift();
    return typeof next === 'function' ? next(request) : next ?? fauxAssistantMessage('READY');
  };
  faux.setResponses([respond]);
  return { credentials, providers: [{ ...faux.provider, auth: { apiKey: { name: 'fixture', resolve: async ({ credential }) => ({ auth: { apiKey: credential.key } }) } } }] };
};
const makeModels = () => createNativeModels(options);
const discovery = await makeModels();
const toolExtension = v => defineExtension({ name: 'heidi-r4-tool', tools: [defineTool({
  name: 'qa_version', description: `fixture-version-${v}`,
  parameters: Type.Object({ marker: Type.String(), ...(schemaMode ? { qaOptional: schemaMode === 2 ? Type.String() : Type.Optional(Type.String()) } : {}) }), replay: 'unsafe',
  execute: async ({ marker }, api, context) => {
    effects.push({ marker, version: v, stage: 'start' });
    if (marker === 'accepted-v1') { toolStarted(); await activeGate; }
    if (interruptUnsafe && marker === 'unsafe-before-reopen') {
      unsafeTask = api.taskId; unsafeStarted();
      await new Promise((_, reject) => {
        if (context.abortSignal.aborted) reject(context.abortSignal.reason);
        else context.abortSignal.addEventListener('abort', () => reject(context.abortSignal.reason), { once: true });
      });
    }
    effects.push({ marker, version: v, stage: 'finish' });
    return { output: [{ type: 'text', text: `QA_VERSION_${v}:${marker}` }] };
  },
})], tasks: [defineTask({ name: 'heidi-qa-phase', version: taskVersion, initial: () => ({ phase: 'first' }),
  phases: {
    first: async (record, runtime, context) => {
      phaseEffects.push([record.id, v, 'first-start']); phaseStarted(); await phaseGate;
      phaseEffects.push([record.id, v, 'first-finish']);
      await runtime.commit(() => ({ status: 'pending', checkpoint: { phase: 'next' } }), context);
    },
    next: async (record, runtime, context) => {
      phaseEffects.push([record.id, v, 'next']);
      await runtime.commit(() => ({ status: 'terminal', outcome: { status: 'completed', result: v } }), context);
    },
  },
  abort: async (_record, runtime, context) => { await runtime.commit(() => ({ status: 'terminal', outcome: { status: 'aborted' } }), context); },
})] });
const profile = createNativeProfile({ policy, owner: policy.authenticate(owner.token),
  models: { defaultModel: selected, catalogue: discovery.catalogue, create: makeModels },
  skills: async context => {
    const source = { cwd: context.cwd, projectRoot: context.cwd, homeDir: '/scratch/home', agentDir: '/scratch/home/.pi/agent', projectTrusted: true };
    return { ...source, ...await readResourceSettings(source) };
  },
  dcg: { binaryPath: join(directory, 'missing-dcg'), envSource: () => ({}) },
  connectMcp: async () => ({ sources: [], close: async () => { resourceCloses++; } }),
  loadAdapters: async () => {
    if (fault) throw Error('PRIVATE_PREPARE_FAILURE_QA_SENTINEL');
    if (modulePath) return loadRegistryAdapters([modulePath], directory);
    const v = version;
    return [base => { const next = createRegistry(); for (const ext of base.snapshot().installed()) next.install(ext); next.install(toolExtension(v)); if (extraExtension) next.install(defineExtension({ name: 'qa-discovery-added' })); return next; }];
  },
});
const report = { status: 'FAIL', candidate, directory, externalBoundaries: ['faux model', 'synthetic credentials', 'empty MCP boundary'],
  realBoundaries: ['Store', 'Harness', 'SQLite', 'HTTP', 'SDK', 'native ToolTask'], checks: [], effects, samples,
  productionActivation: 'NOT RUN' };
const procStart = async () => (await readFile('/proc/self/stat', 'utf8')).split(') ')[1].split(' ')[19];
const census = async cycle => {
  global.gc?.();
  // Census is observational. Count only owned resources; HTTP keep-alive is closed before final samples.
  samples.push({ cycle, rss: process.memoryUsage().rss, heapUsed: process.memoryUsage().heapUsed,
    fd: (await readdir('/proc/self/fd')).length,
    children: (await readFile('/proc/self/task/' + process.pid + '/children', 'utf8')).trim().split(/\s+/).filter(Boolean),
    activeHandles: process._getActiveHandles().map(handle => handle.constructor.name).sort(), resourceCloses });
};
const configureCall = (tool, args) => {
  plannedResponses = [fauxAssistantMessage(fauxToolCall(tool, args), { stopReason: 'toolUse' }), fauxAssistantMessage('QA_DONE')];
};
async function call(opened, marker) {
  configureCall('qa_version', { marker });
  const root = await opened.harness.root(ctx);
  const submitted = await root.submit({ type: 'input', content: `execute ${marker}`, requestId: marker }, ctx);
  return { submitted, finished: submitted.wait(withAbortSignal(AbortSignal.timeout(15000), ctx)) };
}
try {
  const storeOptions = { dataDir: join(directory, 'data'), startDirs: [work, otherWork], name: 'R4 independent QA', provider: 'faux', profile };
  store = await Store.open(storeOptions);
  server = createHttpServer(store, policy).listen(0, '127.0.0.1'); await once(server, 'listening');
  const client = new DpiClient(`http://127.0.0.1:${server.address().port}`, owner.token);
  const a = await client.createSession({ name: 'A', cwd: work, model: selected });
  const b = await client.createSession({ name: 'B', cwd: otherWork, model: selected });
  const openedA = store.opened.get(a.id), openedB = store.opened.get(b.id);
  const rootA = await openedA.harness.root(ctx), rootB = await openedB.harness.root(ctx);
  const identity = { pid: process.pid, startticks: await procStart(), sessionA: a.id, sessionB: b.id, rootA: rootA.id, rootB: rootB.id };
  report.identityBefore = identity;
  configureCall('schedule', { action: 'add', when: 'in 1h', message: 'QA pending schedule must survive reload' });
  const scheduled = await rootA.submit({ type: 'input', content: 'create the disposable schedule', requestId: 'qa-parked-schedule' }, ctx);
  assert.equal((await scheduled.wait(withAbortSignal(AbortSignal.timeout(15000), ctx))).status, 'done');
  const scheduleBefore = await openedA.harness.snapshot(ScheduleDoc, rootA.id, ctx);
  assert.equal(Object.keys(scheduleBefore.items).length, 1, 'actual native schedule must be pending');
  const harness = openedA.harness, bSnapshot = openedB.profile.registry.snapshot();
  phaseGate = new Promise(resolve => { releasePhase = resolve; });
  const phaseReady = new Promise(resolve => { phaseStarted = resolve; });
  const phaseId = await harness.commit(tx => tx.createTask(openedA.profile.registry.snapshot().task('heidi-qa-phase'), {},
    { conversationId: rootA.id, ownership: { kind: 'conversation' }, background: true }), ctx);
  await phaseReady;
  activeGate = new Promise(resolve => { releaseTool = resolve; });
  const started = new Promise(resolve => { toolStarted = resolve; });
  const first = await call(openedA, 'accepted-v1');
  // Observe rejection immediately; a failed publication must not leave an unhandled task rejection.
  first.finished.catch(() => {});
  await Promise.race([started, first.finished.then(() => { throw Error('native v1 tool did not start'); })]);
  const nativeReceipt = first.submitted.id;
  assert.ok(nativeReceipt, 'canonical native submission ID required');
  assert.equal(effects.filter(e => e.marker === 'accepted-v1' && e.stage === 'start').length, 1);
  version = 2;
  const beforeReloadRequests = modelRequests;
  const beforeIncompatible = openedA.profile.registry.snapshot();
  taskVersion = 2;
  await assert.rejects(client.session(a.id).reload(), error => error.status === 409 && error.message.startsWith('maintenance-required'));
  assert.equal(openedA.profile.registry.snapshot(), beforeIncompatible);
  taskVersion = 1;
  const reloadResult = await client.session(a.id).reload();
  assert.equal(modelRequests, beforeReloadRequests, 'reload itself must not add a model turn');
  assert.equal(effects.some(e => e.marker === 'accepted-v1' && e.stage === 'finish'), false, 'reload must publish before v1 tool drain');
  assert.equal(store.opened.get(a.id), openedA); assert.equal(openedA.harness, harness);
  assert.equal(openedB.profile.registry.snapshot(), bSnapshot);
  releaseTool(); releasePhase();
  const phaseResult = await harness.waitForTask(phaseId, withAbortSignal(AbortSignal.timeout(10000), ctx));
  assert.equal(phaseResult.id, phaseId);
  assert.equal(phaseResult.state.outcome.result, 2);
  assert.deepEqual(phaseEffects, [[phaseId, 1, 'first-start'], [phaseId, 1, 'first-finish'], [phaseId, 2, 'next']]);
  report.checks.push({ name: 'same-ID-native-phase-v1-finish-v2-checkpoint-and-incompatible-version-refusal', phaseId, phaseEffects });
  assert.equal((await first.finished).status, 'done');
  assert.deepEqual(effects.filter(e => e.marker === 'accepted-v1').map(e => [e.version, e.stage]), [[1,'start'],[1,'finish']]);
  assert.equal((await (await call(openedA, 'next-v2')).finished).status, 'done');
  assert.equal(effects.find(e => e.marker === 'next-v2' && e.stage === 'finish').version, 2);
  assert.equal((await (await call(openedB, 'isolated-b')).finished).status, 'done');
  assert.equal(effects.find(e => e.marker === 'isolated-b' && e.stage === 'finish').version, 1);
  report.checks.push({ name: 'busy-v1-sdk-publication-v2-next-call-B-isolation', nativeReceipt, reloadResult });
  // Probe a newly installed hook, not a new tool outside the conversation's explicit tool selection.
  openedA.profile.registry.install(defineExtension({ name: 'hidden-base-qa', hooks: [hook(ToolTask, {
    beforeTool: async call => {
      if (call.name === 'qa_version') hiddenHooks.push(call.arguments.marker);
      return undefined;
    },
  })] }));
  assert.equal((await (await call(openedA, 'hidden-after-publication')).finished).status, 'done');
  assert.deepEqual(hiddenHooks, ['hidden-after-publication']);
  report.checks.push({ name: 'hidden-base-hook-install-after-publication-reaches-native-Harness' });
  fault = true;
  const old = openedA.profile.registry.snapshot();
  await assert.rejects(client.session(a.id).reload(), error => !error.message.includes('PRIVATE_PREPARE_FAILURE_QA_SENTINEL'));
  assert.equal(openedA.profile.registry.snapshot(), old);
  fault = false;
  assert.equal((await (await call(openedA, 'after-prepare-failure')).finished).status, 'done');
  assert.equal(effects.find(e => e.marker === 'after-prepare-failure' && e.stage === 'finish').version, 2);
  report.checks.push({ name: 'prepare-failure-old-dispatch-usable-no-private-error' });
  // Warm up both the request and reload path before taking the named stress baseline.
  for (let i = 0; i < 10; i++) { version++; await client.session(a.id).reload(); await (await call(openedA, `warmup-${i}`)).finished; }
  await census(0);
  for (let i = 1; i <= 100; i++) {
    version++;
    await client.session(a.id).reload();
    assert.equal((await (await call(openedA, `cycle-${i}`)).finished).status, 'done');
    assert.equal(effects.find(e => e.marker === `cycle-${i}` && e.stage === 'finish').version, version);
    assert.equal(openedA.harness, harness);
    if (i % 10 === 0) await census(i);
  }
  report.identityAfter = { pid: process.pid, startticks: await procStart(), sessionA: a.id, sessionB: b.id,
    rootA: (await openedA.harness.root(ctx)).id, rootB: (await openedB.harness.root(ctx)).id };
  assert.deepEqual(report.identityAfter, identity);
  assert.deepEqual(await openedA.harness.snapshot(ScheduleDoc, rootA.id, ctx), scheduleBefore, 'pending schedule/doc/task identity changed');
  report.scheduleBefore = scheduleBefore;
  assert.equal(resourceCloses, 0, 'pure code replacement must not retire MCP owner');
  report.checks.push({ name: '100-code-swaps-every-dispatch-verified', cycles: 100 });
  // Reuse the native settings/skills reader and inspect the current PromptInput, not old history snapshots.
  assert.equal((await (await call(openedA, 'context-before')).finished).status, 'done');
  assert.ok(currentSystem.includes('QA_PROJECT_CONTEXT_V1'));
  assert.ok(currentSystem.includes('<name>qa-first</name>'));
  await writeFile(join(work, 'AGENTS.md'), 'QA_PROJECT_CONTEXT_V2\n');
  await writeFile(skillA, '---\nname: qa-second\ndescription: Updated QA skill\n---\nQA_SKILL_V2\n');
  await client.session(a.id).reload();
  assert.equal((await (await call(openedA, 'context-after')).finished).status, 'done');
  assert.ok(currentSystem.includes('QA_PROJECT_CONTEXT_V2') && !currentSystem.includes('QA_PROJECT_CONTEXT_V1'));
  assert.ok(currentSystem.includes('<name>qa-second</name>'));
  assert.equal((await (await call(openedB, 'context-isolated-b')).finished).status, 'done');
  assert.ok(currentSystem.includes('QA_B_PROJECT_CONTEXT') && !currentSystem.includes('QA_PROJECT_CONTEXT_V2'));
  const settings = join(work, '.pi/settings.json');
  await writeFile(settings, JSON.stringify({ skills: ['-skills/qa-first'] }));
  await client.session(a.id).reload();
  assert.deepEqual(await client.session(a.id).skills(), []);
  assert.deepEqual((await client.session(b.id).skills()).map(skill => skill.name), ['qa-b']);
  const beforeBadSettings = openedA.profile.registry.snapshot();
  await writeFile(settings, '{PRIVATE_BAD_SETTINGS_SENTINEL');
  await assert.rejects(client.session(a.id).reload(), error => !error.message.includes('PRIVATE_BAD_SETTINGS_SENTINEL'));
  assert.equal(openedA.profile.registry.snapshot(), beforeBadSettings);
  assert.deepEqual(await client.session(a.id).skills(), []);
  await writeFile(settings, '{}'); await unlink(skillA);
  const baseCount = (await client.session(a.id).reload()).extensions;
  assert.deepEqual(await client.session(a.id).skills(), []);
  extraExtension = true;
  assert.equal((await client.session(a.id).reload()).extensions, baseCount + 1);
  extraExtension = false;
  assert.equal((await client.session(a.id).reload()).extensions, baseCount);
  assert.equal(openedB.profile.registry.snapshot(), bSnapshot);
  report.checks.push({ name: 'native-context-skills-edit-disable-remove-settings-failure-and-adapter-inventory-isolated-projects' });
  // Keep a real generation open with its v1 offered schema while testing required/optional additions.
  let oldOffered;
  const generationGate = new Promise(resolve => { releaseGeneration = resolve; });
  let generationStarted;
  const generationReady = new Promise(resolve => { generationStarted = resolve; });
  plannedResponses = [async request => {
    oldOffered = getCurrentTools(request.messages); generationStarted(); await generationGate;
    return fauxAssistantMessage(fauxToolCall('qa_version', { marker: 'old-issued-schema-call' }), { stopReason: 'toolUse' });
  }, fauxAssistantMessage('SCHEMA_DONE')];
  const generation = await rootA.submit({ type: 'input', content: 'schema window fixture', requestId: 'schema-window' }, ctx);
  const generationFinished = generation.wait(withAbortSignal(AbortSignal.timeout(15000), ctx));
  generationFinished.catch(() => {}); await generationReady;
  const schemaSnapshot = openedA.profile.registry.snapshot();
  schemaMode = 2; version++;
  await assert.rejects(client.session(a.id).reload(), error => error.status === 409 && error.message.startsWith('maintenance-required'));
  assert.equal(openedA.profile.registry.snapshot(), schemaSnapshot);
  schemaMode = 1;
  await client.session(a.id).reload(); releaseGeneration();
  assert.equal((await generationFinished).status, 'done');
  assert.equal(effects.find(e => e.marker === 'old-issued-schema-call' && e.stage === 'finish').version, version);
  assert.ok(!JSON.stringify(oldOffered).includes('qaOptional'));
  let newOffered;
  plannedResponses = [request => {
    newOffered = getCurrentTools(request.messages);
    return fauxAssistantMessage(fauxToolCall('qa_version', { marker: 'new-issued-schema-call', qaOptional: 'allowed' }), { stopReason: 'toolUse' });
  }, fauxAssistantMessage('SCHEMA_DONE')];
  const nextSchema = await rootA.submit({ type: 'input', content: 'updated schema fixture', requestId: 'schema-after' }, ctx);
  assert.equal((await nextSchema.wait(withAbortSignal(AbortSignal.timeout(15000), ctx))).status, 'done');
  assert.ok(JSON.stringify(newOffered).includes('qaOptional'));
  report.checks.push({ name: 'old-generation-schema-required-addition-refused-optional-addition-applied', oldOffered, newOffered });
  // Change dependencies only, then invoke the tool through native execution, not direct execute().
  await symlink('/candidate/node_modules', join(directory, 'node_modules'), 'dir');
  const nested = join(directory, 'nested'); await mkdir(nested);
  const js = join(nested, 'value.mjs'), ts = join(nested, 'value.ts');
  await writeFile(js, 'export const jsVersion = 1;\n');
  await writeFile(ts, 'export const tsVersion: number = 1;\n');
  modulePath = join(directory, 'adapter.mjs');
  const moduleCode = `import {createRegistry,defineExtension,defineTool} from '@earendil-works/pi-durable';
import {jsVersion} from './nested/value.mjs'; import {tsVersion} from './nested/value.ts';
export default base => {const result=createRegistry(); for(const ext of base.snapshot().installed()) result.install(ext);
result.install(defineExtension({name:'heidi-r4-tool',tools:[defineTool({name:'qa_version',parameters:{type:'object',properties:{marker:{type:'string'},qaOptional:{type:'string'}},required:['marker']},replay:'unsafe',execute:async({marker})=>({output:[{type:'text',text:'QA_DEP_JS_'+jsVersion+'_TS_'+tsVersion+':'+marker}]})})]}));return result;};`;
  await writeFile(modulePath, moduleCode);
  const agent = client.agent(a.id, 'main');
  for (const [j, t] of [[1,1], [2,1], [2,2]]) {
    await writeFile(js, `export const jsVersion = ${j};\n`);
    await writeFile(ts, `export const tsVersion: number = ${t};\n`);
    assert.equal(await readFile(modulePath, 'utf8'), moduleCode, 'entrypoint must not change');
    await client.session(a.id).reload();
    const marker = `dependency-${j}-${t}`;
    assert.equal((await (await call(openedA, marker)).finished).status, 'done');
    assert.ok(JSON.stringify(await agent.transcript('json')).includes(`QA_DEP_JS_${j}_TS_${t}:${marker}`), 'native result must use current nested JS/TS values');
  }
  const lastGoodSnapshot = openedA.profile.registry.snapshot();
  await writeFile(ts, 'export const = THIS_IS_A_BAD_DEPENDENCY;');
  await assert.rejects(client.session(a.id).reload());
  assert.equal(openedA.profile.registry.snapshot(), lastGoodSnapshot);
  assert.equal((await (await call(openedA, 'dependency-after-failed-import')).finished).status, 'done');
  assert.ok(JSON.stringify(await agent.transcript('json')).includes('QA_DEP_JS_2_TS_2:dependency-after-failed-import'));
  assert.equal(openedA.harness, harness);
  assert.equal(openedB.profile.registry.snapshot(), bSnapshot);
  report.checks.push({ name: 'nested-JS-and-TS-dependency-only-change-and-bad-import-retains-working-native-dispatch' });
  // Reopen only disposable current SQLite state. The accepted unsafe invocation is never resent.
  modulePath = undefined;
  await client.session(a.id).reload();
  interruptUnsafe = true;
  const unsafeReady = new Promise(resolve => { unsafeStarted = resolve; });
  const interrupted = await call(openedA, 'unsafe-before-reopen'); interrupted.finished.catch(() => {});
  await unsafeReady; version++;
  await client.session(a.id).reload();
  assert.ok(unsafeTask);
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); server = undefined;
  await store.close(); interruptUnsafe = false;
  store = await Store.open(storeOptions);
  const reopened = store.opened.get(a.id);
  assert.ok(reopened, 'compatible installed state must reopen');
  const unsafeResult = await reopened.harness.waitForTask(unsafeTask, withAbortSignal(AbortSignal.timeout(10000), ctx));
  assert.equal(unsafeResult.id, unsafeTask); assert.equal(unsafeResult.state.status, 'terminal');
  assert.equal((await reopened.harness.root(ctx)).id, rootA.id);
  assert.deepEqual(effects.filter(e => e.marker === 'unsafe-before-reopen').map(e => e.stage), ['start']);
  report.checks.push({ name: 'unsafe-effect-once-after-compatible-publication-and-reopen', taskId: unsafeTask, nativeReceipt: interrupted.submitted.id });
  await store.close();
  const savedTasks = () => {
    const db = new DatabaseSync(join(directory, 'data', 'sessions', a.id, 'agent.sqlite'), { readOnly: true });
    try { return db.prepare('SELECT record FROM tasks ORDER BY id').all(); } finally { db.close(); }
  };
  const beforeMissing = savedTasks();
  modulePath = join(directory, 'artifact-missing.mjs');
  store = await Store.open(storeOptions);
  assert.ok(store.errors.has(a.id)); assert.ok(!store.opened.has(a.id));
  assert.deepEqual(savedTasks(), beforeMissing, 'failed installed-artifact preflight must not resume/reconcile task rows');
  report.checks.push({ name: 'missing-installed-artifact-refused-before-task-mutation', savedTaskRows: beforeMissing.length });
  // Samples are raw data, not an automatic memory-leak verdict. Post-quiescence attribution is separate.
  report.status = 'PASS';
} catch (error) {
  report.error = String(error);
  process.exitCode = 1;
} finally {
  releaseTool?.(); releasePhase?.(); releaseGeneration?.();
  try {
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    await store?.close();
  } catch (error) { report.status = 'FAIL'; report.cleanupError = String(error); process.exitCode = 1; }
  await writeFile(join(directory, 'result.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ status: report.status, report: join(directory, 'result.json'), checks: report.checks, error: report.error }));
}
