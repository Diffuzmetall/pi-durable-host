import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { attachDelm } from '../../sdk-host-cutover/delm-profile.mjs';
import { ReloadableRegistry, reloadDurable, loadFreshModule } from '../../../packages/durable-reload/src/index.ts';
const require = createRequire(new URL('../../../apps/dpi-backend/package.json', import.meta.url));
const sdk = pathToFileURL(require.resolve('@earendil-works/pi-durable'));
const { createRegistry, Harness, defineExtension } = await import(sdk.href);
const { openNodeSqliteStorage } = await import(new URL('./storage/sqlite/node.js', sdk));
const ai = new URL('../../../apps/dpi-backend/node_modules/@earendil-works/pi-ai/dist/index.js', import.meta.url);
const { createModels } = await import(ai.href);
const { fauxProvider, fauxAssistantMessage } = await import(new URL('./providers/faux.js', ai));
const { BACKGROUND_CONTEXT: ctx } = await import(new URL('../../../apps/dpi-backend/node_modules/@earendil-works/chord/dist/context/index.js', import.meta.url).href);
const { build } = require('esbuild');
const until = async predicate => {
  const deadline = Date.now() + 10000;
  while (!await predicate()) {
    if (Date.now() > deadline) throw Error('Disposable native engine timed out');
    await new Promise(resolve => setTimeout(resolve, 15));
  }
};

test('actual DeLM pending phase publishes v2, retains native IDs and delivers exactly once', { timeout: 40000 }, async t => {
  // /candidate contains only a curated disposable copy of the existing engine/board source.
  const home = mkdtempSync(join(tmpdir(), 's5-engine-'));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const workspace = join(home, 'project'); mkdirSync(workspace);
  const run = join(home, 'run');
  const env = { ...process.env, HOME: home, PYTHONDONTWRITEBYTECODE: '1' };
  execFileSync('python3', ['-B', '/candidate/scripts/delm_local.py', 'init', run,
    '--shared-workspace', workspace, '--n', '2', '--task', 'isolated source reload fixture'], {env, stdio:'pipe'});
  const server = spawn('python3', ['-B', '/candidate/scripts/delm_local.py', 'serve', run], {env, stdio:['ignore','pipe','pipe']});
  let host;
  try {
    await Promise.race([once(server.stdout,'data'), once(server,'exit').then(() => {throw Error('Disposable board failed');})]);
    let sequence = 0;
    const domain = args => JSON.parse(execFileSync(join(run,'bob/bin/context'), ['domain', JSON.stringify({request_id:`probe-${++sequence}`, ...args})], {env,encoding:'utf8'}));
    const task = domain({op:'create',subject:'fixture dependency',detail:'one completion'}).task;
    const claim = domain({op:'claim',item:task.id,expected_revision:task.revision}).task;
    const modulePath = join(home,'engine.mjs');
    await build({entryPoints:['/candidate/extensions/delm/index.js'],outfile:modulePath,bundle:true,format:'esm',platform:'node',
      external:['@earendil-works/pi-durable','@earendil-works/pi-ai'],logLevel:'silent'});
    const originalModule = readFileSync(modulePath,'utf8');
    assert.ok(originalModule.includes('Reason:'));
    const original = loadFreshModule(modulePath);
    const bindingFile = join(home,'bindings.json');
    const binding = {run,actor:'alice',workspace,enabled:true};
    const save = entry => writeFileSync(bindingFile,JSON.stringify({version:1,sessions:{session1:entry}}),{mode:0o600});
    save(binding);
    const registry = new ReloadableRegistry(createRegistry(), ['delm']);
    const sentinel = defineExtension({name:'s5-existing-sentinel'}); registry.install(sentinel);
    const extensions = [...registry.snapshot().installed()];
    registry.subscribe(() => extensions.splice(0,extensions.length,...registry.snapshot().installed()));
    const admissions = [];
    let deny = false, cleanupFails = false, lifecycleMode = 'healthy';
    const lifecycle = [];
    const applyError = Error('FIXTURE_WRAPPER_APPLY_REJECTED');
    const discardError = Error('FIXTURE_DISCARD_REJECTED');
    const drainError = Error('FIXTURE_DRAIN_REJECTED');
    let releaseDrain;
    const composition = {registry,extensions,
      prepareReload: async (additions=[], replacements=[]) => {
        const candidate = await registry.prepare([], additions, replacements);
        const mode = lifecycleMode;
        return {...candidate,
          ...(['apply-reject', 'double-reject'].includes(mode) ? {async apply() {
            lifecycle.push('apply'); throw applyError;
          }} : {}),
          async discard() {
            lifecycle.push('discard');
            if (mode === 'double-reject') throw discardError;
          },
          async drain() {
            lifecycle.push('drain');
            // A nested commit proves retirement is outside the publication commit.
            await host.commit(() => {}, ctx);
            if (mode === 'drain-fail') throw drainError;
            if (mode === 'drain-block') await new Promise(resolve => { releaseDrain = resolve; });
          },
        };
      },
      admitInput: async (_root,id) => { if (deny) throw Error('synthetic revocation'); admissions.push(id); },
      shutdown: async () => {if(cleanupFails) throw Error('synthetic cleanup failure');},
    };
    await attachDelm(composition,{sessionId:'session1',cwd:workspace},{bindingFile,modulePath});
    const models = createModels(), faux = fauxProvider(); models.setProvider(faux.provider);
    let generations = 0;
    faux.setResponses([() => {generations++; return fauxAssistantMessage('one actual native wake');}]);
    host = await Harness.open(await openNodeSqliteStorage(join(home,'session.sqlite')),{registry,models},ctx);
    const root = await host.root(ctx,{agent:{cwd:workspace,model:{provider:'faux',modelId:'faux-1'}}});
    await root.configure({extensions:[sentinel]},ctx);
    await composition.bind(host,ctx);
    const tool = () => registry.snapshot().tools().find(({tool})=>tool.name==='delm_wait').tool;
    const execute = (handler,args,key) => handler.execute(args,{conversationId:root.id,taskId:key,callId:key,
      commit:(fn,context)=>host.commit(fn,context??ctx)},ctx);
    const old = tool();
    const armed = (await execute(old,{action:'wait',items:[task.id],reason:'retain pending task across update'},'arm')).structuredOutput.result;
    const before = (await host.snapshot(original.DelmWaitDoc,root.id,ctx)).waits[armed.id];
    host.resume();
    await until(async()=> (await host.getTask(armed.taskId,ctx)).state.status==='running');
    writeFileSync(modulePath,originalModule.replaceAll('Reason:', 'Reason v2:').replaceAll(original.DELM_BUILD,'s5-compatible-v2'));
    const harness = host;
    await reloadDurable({harness:host,context:ctx,prepareExtensions:composition.prepareReload.bind(composition),assertCurrent(){}});
    assert.equal(host,harness);
    assert.equal((await execute(tool(),{action:'status'},'status-v2')).structuredOutput.build,'s5-compatible-v2');
    assert.deepEqual((await host.snapshot(original.DelmWaitDoc,root.id,ctx)).waits[armed.id],before);
    assert.equal(generations,0);
    // Retained and current versions share current authority, not the loading-time grant.
    save({...binding,enabled:false});
    await assert.rejects(()=>execute(old,{action:'status'},'old-revoked'));
    await assert.rejects(()=>execute(tool(),{action:'status'},'new-revoked'));
    save(binding);
    deny = true;
    domain({op:'complete',item:claim.id,expected_revision:claim.revision,generation:claim.generation,summary:'one fixture output'});
    await until(async()=> (await host.snapshot(original.DelmWaitDoc,root.id,ctx)).waits[armed.id].state==='failed');
    assert.equal(generations,0);
    deny = false;
    await execute(tool(),{action:'retry',id:armed.id},'retry-after-revoke');
    await until(async()=> (await host.snapshot(original.DelmWaitDoc,root.id,ctx)).waits[armed.id].state==='sent');
    await root.waitForIdle(ctx);
    const sent = (await host.snapshot(original.DelmWaitDoc,root.id,ctx)).waits[armed.id];
    assert.equal(sent.id,armed.id); assert.equal(sent.taskId,armed.taskId);
    assert.equal(sent.requestId,original.wakeRequestId(armed.taskId));
    assert.deepEqual(admissions,[sent.requestId]); assert.equal(generations,1);
    const entries = (await root.entries({},100,undefined,ctx)).items;
    assert.ok(JSON.stringify(entries).includes('Reason v2:'),'next native send phase must execute engine v2');
    const submission = await host.commit(tx=>tx.submissionByRequest(root.id,sent.requestId),ctx);
    assert.ok(submission);
    assert.equal(typeof submission.id,'number');
    await execute(tool(),{action:'retry',id:armed.id},'repeat-retry');
    await root.waitForIdle(ctx); assert.equal(generations,1);
    assert.deepEqual(await host.commit(tx=>tx.submissionByRequest(root.id,sent.requestId),ctx),submission);

    // Exercise the real operational wrapper through the new shared lifecycle.
    const reload = () => reloadDurable({harness:host,context:ctx,
      prepareExtensions:composition.prepareReload.bind(composition),assertCurrent(){}});
    const retainedTool = tool();
    for (const mode of ['apply-reject', 'double-reject']) {
      lifecycleMode = mode; lifecycle.length = 0;
      await assert.rejects(reload, error => {
        if (mode === 'double-reject') {
          assert.ok(error instanceof AggregateError);
          assert.equal(error.message, 'DURABLE_RELOAD_DISCARD_FAILED');
          assert.deepEqual(error.errors, [applyError, discardError]);
        } else assert.equal(error, applyError);
        return true;
      });
      assert.deepEqual(lifecycle, ['apply', 'discard']);
      assert.equal(tool(), retainedTool, 'rejected wrapper must retain the active handler');
      assert.deepEqual((await host.snapshot(original.DelmWaitDoc,root.id,ctx)).waits[armed.id],sent);
    }
    lifecycleMode = 'drain-fail'; lifecycle.length = 0;
    writeFileSync(modulePath,originalModule.replaceAll('Reason:', 'Reason v3:').replaceAll(original.DELM_BUILD,'s5-lifecycle-v3'));
    const applied = await reload();
    assert.equal(applied.cleanupError,drainError,'failed retirement is applied, not rollback');
    assert.deepEqual(lifecycle,['drain'],'published candidate must not be discarded');
    assert.equal((await execute(tool(),{action:'status'},'status-v3')).structuredOutput.build,'s5-lifecycle-v3');
    assert.deepEqual((await host.snapshot(original.DelmWaitDoc,root.id,ctx)).waits[armed.id],sent);

    lifecycleMode = 'drain-block'; lifecycle.length = 0;
    const retiring = reload();
    await until(() => releaseDrain !== undefined);
    await assert.rejects(reload, error => error.reason === 'busy');
    releaseDrain(); await retiring;
    assert.deepEqual(lifecycle,['drain']);
    assert.equal(host,harness);
    assert.deepEqual(await host.commit(tx=>tx.submissionByRequest(root.id,sent.requestId),ctx),submission);
    assert.equal(generations,1,'resource lifecycle must not replay a delivered DeLM wake');
    console.log(JSON.stringify({probe:'delm-wrapper-lifecycle',conversationId:root.id,
      waitId:sent.id,waitTaskId:sent.taskId,requestId:sent.requestId,
      submissionId:submission.id,generations,applyRejections:2,discardCalls:2,
      failedDrainApplied:true,concurrentDrainRejected:true}));
    cleanupFails = true;
    await assert.rejects(()=>composition.shutdown(ctx),/synthetic cleanup failure/);
    await assert.rejects(()=>execute(old,{action:'status'},'closed-old'));
    await assert.rejects(()=>execute(tool(),{action:'status'},'closed-new'));
    await assert.rejects(()=>composition.prepareReload());
    assert.equal(generations,1,'cleanup failure must not replay accepted input');
  } finally {
    if (host) await host.close(ctx);
    const stopped = once(server,'close'); server.kill('SIGTERM'); await stopped;
  }
});
