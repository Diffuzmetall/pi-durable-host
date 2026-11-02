import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {BACKGROUND_CONTEXT as ctx,withAbortSignal} from '@earendil-works/chord/context';
import {Type} from '@earendil-works/pi-ai';
import {createModels} from '@earendil-works/pi-ai/models';
import {Harness,createRegistry,defineExtension,defineTask,defineDoc,defineTool} from '@earendil-works/pi-durable';
import {openNodeSqliteStorage} from '@earendil-works/pi-durable/storage/sqlite/node';
import {ReloadableRegistry,reloadDurable} from '@local/pi-durable-reload';
import {createNativeProfile} from '../src/native-profile/profile.ts';
import {GrantPolicy} from '../src/grants.ts';

const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
async function fixture(){
  const dir=await mkdtemp(join(tmpdir(),'trusted-handler-')),gate=deferred(),started=deferred();
  const effects=[];
  const doc=version=>defineDoc({kind:'trusted.contract',scope:'session',version,initial:()=>({effects:0})});
  const originalDoc=doc(1);
  const extension=(version,{required=false,taskVersion=1}={})=>defineExtension({name:'delm',
    tools:[defineTool({name:'trusted_probe',parameters:Type.Object({value:Type.String(),...(required?{extra:Type.String()}:{})}),execute:async()=>({output:[]})})],
    tasks:[defineTask({name:'trusted.wait',version:taskVersion,initial:()=>({phase:'wait'}),phases:{
      wait:async(_task,runtime,context)=>{effects.push(version);await runtime.commit(async tx=>{(await tx.doc(originalDoc)).effects++;},context);started.resolve();await gate.promise;await runtime.commit(()=>({status:'pending',checkpoint:{phase:'finish'}}),context);},
      finish:async(_task,runtime,context)=>{await runtime.commit(()=>({status:'terminal',outcome:{status:'completed',result:version}}),context);},
    },abort:async(_task,runtime,context)=>{await runtime.commit(()=>({status:'terminal',outcome:{status:'aborted'}}),context);}})]});
  const base=createRegistry();base.install(extension(1));
  const schedule=defineTask({name:'trusted.schedule',version:1,initial:()=>({phase:'wait'}),phases:{
    wait:async(_task,runtime,context)=>runtime.sleepUntil(runtime.now()+3600000,{phase:'wait'},context),
  },abort:async(_task,runtime,context)=>{await runtime.commit(()=>({status:'terminal',outcome:{status:'aborted'}}),context);}});
  const guard=defineExtension({name:'authority-guard',tasks:[schedule]});base.install(guard);
  const registry=new ReloadableRegistry(base,['delm']),storage=await openNodeSqliteStorage(join(dir,'agent.sqlite'));
  const harness=await Harness.open(storage,{registry,models:createModels()},ctx),root=await harness.root(ctx,{agent:{cwd:dir}});
  harness.resume();
  const start=async task=>harness.commit(tx=>tx.createTask(task,{}, {conversationId:root.id,ownership:{kind:'conversation'},background:true}),ctx);
  const reload=async(replacement)=>reloadDurable({harness,context:ctx,assertCurrent(){},prepareExtensions:async()=>{
    const next=await registry.prepare([],[],[replacement]);return {...next,validateState:reader=>next.validateState(reader,storage,ctx)};
  }});
  return {registry,base,harness,storage,root,guard,extension,doc,originalDoc,gate,started,effects,start,reload,schedule,
    close:async()=>{gate.resolve();await harness.close(ctx);}};
}

test('trusted replacement keeps pending wait/schedule IDs and the native phase snapshot, with no idle barrier',{timeout:10000},async()=>{
  const f=await fixture();
  try{
    const id=await f.start(f.registry.snapshot().task('trusted.wait')),schedule=await f.start(f.schedule);
    await f.started.promise;
    const old=f.registry.snapshot(),replacement={extension:f.extension(2),documents:[f.originalDoc.definition]};
    await f.reload(replacement);
    assert.notEqual(f.registry.snapshot(),old);assert.equal(old.task('trusted.wait').definition.version,1);
    assert.equal(f.base.snapshot().extension('delm'),replacement.extension);
    assert.equal(f.registry.snapshot().extension('authority-guard'),f.guard);
    f.gate.resolve();const result=await f.harness.waitForTask(id,withAbortSignal(AbortSignal.timeout(3000),ctx));
    assert.equal(result.id,id);assert.equal(result.state.outcome.result,2);assert.deepEqual(f.effects,[1]);
    const records=await f.harness.commit(tx=>tx.scanTasks({},100),ctx);
    assert.equal(records.items.filter(record=>record.kind==='trusted.schedule').length,1);
    assert.equal(records.items.find(record=>record.id===schedule).state.status,'sleeping');
    assert.equal((await f.harness.snapshot(f.originalDoc,ctx)).effects,1);
    await assert.rejects(f.reload({extension:f.extension(3),documents:[]}),/maintenance-required/);
    await f.reload({extension:f.extension(1),documents:[f.originalDoc.definition]});
    assert.equal(f.registry.snapshot().extension('delm').tasks[0].definition.version,1);
  }finally{await f.close();}
});

for(const defect of ['guard','surface','schema','task','document'])test(`trusted replacement rejects ${defect} before publication`,{timeout:10000},async()=>{
  const f=await fixture();
  try{
    const id=await f.start(f.registry.snapshot().task('trusted.wait'));await f.started.promise;
    const before=f.registry.snapshot(),base=f.base.snapshot();
    let extension=f.extension(2),documents=[f.originalDoc.definition];
    if(defect==='guard')extension={...extension,name:'authority-guard'};
    if(defect==='surface')extension={...extension,tools:[]};
    if(defect==='schema')extension=f.extension(2,{required:true});
    if(defect==='task')extension=f.extension(2,{taskVersion:2});
    if(defect==='document')documents=[f.doc(2).definition];
    await assert.rejects(f.reload({extension,documents}),/NATIVE_HANDLER_REPLACEMENT_DENIED|maintenance-required/);
    assert.equal(f.registry.snapshot(),before);assert.equal(f.base.snapshot(),base);
    f.gate.resolve();assert.equal((await f.harness.waitForTask(id,withAbortSignal(AbortSignal.timeout(3000),ctx))).state.outcome.result,1);
  }finally{await f.close();}
});

test('native full profile exposes only the explicit handler allowlist, never authority/guards',{timeout:10000},async()=>{
  const policy=new GrantPolicy([{id:'fixture',token:'synthetic',actor:'operator',source:'terminal',authority:'human',permissions:['read','write','control'],binding:{}}]);
  const profile=createNativeProfile({policy,owner:policy.authenticate('synthetic'),connectMcp:async()=>({sources:[],close:async()=>{}})});
  const directory=await mkdtemp(join(tmpdir(),'trusted-profile-'));
  const composition=await profile({sessionId:'fixture',cwd:directory,directory});
  try{
    const existing=composition.registry.snapshot().extension('durable-schedules');assert.ok(existing);
    const guard=composition.registry.snapshot().extension('local-host-automation-authority'),goals=composition.registry.snapshot().extension('native-goals');assert.ok(guard);
    const automatic=await composition.prepareReload();assert.equal(automatic.apply,undefined);automatic.validate();automatic.publish();
    assert.notEqual(composition.registry.snapshot().extension('durable-schedules'),existing);
    assert.equal(composition.registry.snapshot().extension('local-host-automation-authority'),guard);
    assert.equal(composition.registry.snapshot().extension('native-goals'),goals);
    const {ScheduleDoc}=await import('../src/native-profile/automation/schedules.ts');
    const explicit={...composition.registry.snapshot().extension('durable-schedules')};
    const next=await composition.prepareReload([],[{extension:explicit,documents:[ScheduleDoc.definition]}]);next.validate();next.publish();
    assert.equal(composition.registry.snapshot().extension('durable-schedules'),explicit,'explicit native replacement is not duplicated by automatic preparation');
    await assert.rejects(composition.prepareReload([],[{extension:{...guard},documents:[]}]),/NATIVE_HANDLER_REPLACEMENT_DENIED/);
    await composition.shutdown(ctx);
    await assert.rejects(composition.prepareReload(),/closed|CLOSED|unavailable|UNAVAILABLE/);
  }finally{await composition.shutdown(ctx);await composition.cleanup(ctx);}
});
