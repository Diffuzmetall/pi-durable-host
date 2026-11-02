import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BACKGROUND_CONTEXT as ctx, withAbortSignal } from '@earendil-works/chord/context';
import { Type, InMemoryCredentialStore } from '@earendil-works/pi-ai';
import { getCurrentTools } from '@earendil-works/pi-ai/utils/transcript';
import { fauxProvider, fauxAssistantMessage, fauxToolCall } from '@earendil-works/pi-ai/providers/faux';
import { createRegistry, defineExtension, defineTool, defineTask } from '@earendil-works/pi-durable';
import { Store } from '../src/store.ts';
import { createNativeProfile, createNativeModels, loadRegistryAdapters } from '../src/native-profile/profile.ts';
import { GrantPolicy } from '../src/grants.ts';
import { createHttpServer } from '../src/http-server.ts';
import { DpiClient } from '../../dpi-sdk/src/client.ts';
import { reloadDurable } from '@local/pi-durable-reload';
import { assertNativeTaskContracts, compatibleToolSchema } from '../../../packages/durable-reload/src/compatibility.ts';

const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
const persistedTasks = (f) => {
  const db = new DatabaseSync(join(f.options.dataDir,'sessions',f.a.id,'agent.sqlite'),{readOnly:true});
  try { return db.prepare('SELECT record FROM tasks ORDER BY id').all(); } finally { db.close(); }
};
const documentAdapterSource=version=>`import {createRegistry,defineExtension,defineTask,defineDoc} from '@earendil-works/pi-durable';
  const doc=defineDoc({kind:'compat.doc',scope:'session',version:${version},initial:()=>({effects:0}),checkpointWhen:()=>true});
  const task=defineTask({name:'compat.doc.reader',version:1,initial:()=>({phase:'run'}),phases:{run:async(record,runtime,context)=>{await runtime.commit(async tx=>{(await tx.doc(doc)).effects++;return {status:'terminal',outcome:{status:'completed',result:null}}},context)}},abort:async()=>{}});
  export default base=>{const registry=createRegistry();for(const ext of base.snapshot().installed())registry.install(ext);registry.install(defineExtension({name:'compat.doc.bundle',tasks:[task]}));return registry;}`;
const selected={provider:'compat-faux',modelId:'exact'};
const spec={id:'owner',token:'synthetic-owner',actor:'operator',source:'terminal',authority:'human',permissions:['read','write','control','filesystem','human-accept'],binding:{}};
async function fixture({taskVersion=1,nested=false}={}) {
  const dir=await mkdtemp(join(tmpdir(),'hot-compat-')),work=join(dir,'work');await mkdir(work);
  const state={version:1,required:false,remove:false,calls:[],prompts:[],providers:new Map(),taskVersion,phase:[],gate:deferred(),started:deferred(),parentGate:deferred(),parentStarted:deferred(),effectStarted:deferred(),extraTasks:true};
  const credentials=new InMemoryCredentialStore();
  const makeModels=async(id='catalogue')=>createNativeModels(()=>{
    const faux=fauxProvider({provider:selected.provider,models:[{id:selected.modelId,contextWindow:128000,maxTokens:4096}],tokensPerSecond:100000});
    state.providers.set(id,faux);return {credentials,providers:[faux.provider]};
  });
  const policy=new GrantPolicy([spec]),catalogue=await makeModels();
  const task=version=>defineTask({name:'compat.phase',version:state.taskVersion,initial:()=>({phase:'first'}),
    phases:{first:async(_record,runtime,context)=>{state.started.resolve();await state.gate.promise;await runtime.commit(()=>({status:'pending',checkpoint:{phase:'next'}}),context);},
      next:async(record,runtime,context)=>{state.phase.push([record.id,version]);await runtime.commit(()=>({status:'terminal',outcome:{status:'completed',result:version}}),context);}},
    abort:async(_record,runtime,context)=>{await runtime.commit(()=>({status:'terminal',outcome:{status:'aborted'}}),context);}});
  const profile=createNativeProfile({policy,owner:policy.authenticate(spec.token),
    models:{defaultModel:selected,catalogue:catalogue.catalogue,create:context=>makeModels(context.sessionId)},
    dcg:{binaryPath:join(dir,'absent-dcg'),envSource:()=>({})},connectMcp:async()=>({sources:[],close:async()=>{}}),
    loadAdapters:async()=>[...await loadRegistryAdapters(state.extraAdapters??[],work),base=>{
      const next=createRegistry();for(const ext of base.snapshot().installed())next.install(ext);
      const version=state.version;
      if(!state.remove)next.install(defineExtension({name:'compat.tool',tools:[defineTool({name:'compat_probe',replay:'unsafe',
        parameters:Type.Object({value:Type.String(),...(version===1?{}:{extra:state.required?Type.String():Type.Optional(Type.String())})}),
        execute:async(args,api,context)=>{state.calls.push([version,args]);
          if(state.interruptAfterEffect){state.unsafeTask=api.taskId;state.effectStarted.resolve();await new Promise((_,reject)=>{if(context.abortSignal.aborted)reject(context.abortSignal.reason);else context.abortSignal.addEventListener('abort',()=>reject(context.abortSignal.reason),{once:true});});}
          return {output:[{type:'text',text:`compat-${version}`} ]};}}),
        ...(nested?[defineTool({name:'compat_parent',parameters:Type.Object({}),replay:'unsafe',executionMode:'sequential',
          execute:async(_args,api,context)=>{state.parentVersion=version;state.parentStarted.resolve();await state.parentGate.promise;
            return api.executeTool('compat_probe',{value:'nested'},context,{key:'stable-child'});}})]:[])]}));
      if(state.extraTasks)next.install(defineExtension({name:'compat.tasks',tasks:[task(version)]}));
      return next;
    }],
  });
  const options={dataDir:join(dir,'data'),startDirs:[work],provider:'faux',profile};
  const store=await Store.open(options),server=createHttpServer(store,policy).listen(0,'127.0.0.1');await once(server,'listening');
  const client=new DpiClient(`http://127.0.0.1:${server.address().port}`,spec.token);
  const a=await client.createSession({name:'A',cwd:work,model:selected});
  let serial=0;const pending=[];
  const invoke=()=>{
    const p=client.agent(a.id,1).send('compat fixture','followUp',`compat-${++serial}`,10000);pending.push(p);return p;
  };
  return {dir,work,options,profile,state,store,client,a,invoke,
    opened:()=>store.opened.get(a.id),
    async activeGeneration(){
      const started=deferred(),release=deferred();state.generationRelease=release;
      state.providers.get(a.id).setResponses([async request=>{state.prompts.push(request);started.resolve();await release.promise;return fauxAssistantMessage(fauxToolCall('compat_probe',{value:'old-call'}),{stopReason:'toolUse'});},fauxAssistantMessage('old complete')]);
      const running=invoke();await started.promise;return {running,release};
    },
    async close(){state.generationRelease?.resolve();state.gate.resolve();state.parentGate.resolve();await Promise.allSettled(pending);server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await store.close();},
  };
}

test('schema annotations never hide property names or const/enum payload changes',()=>{
  for(const name of ['description','title','examples','$comment']) {
    assert.equal(compatibleToolSchema(Type.Object({[name]:Type.String()}),Type.Object({[name]:Type.Number()})),false);
  }
  assert.equal(compatibleToolSchema({type:'object',properties:{value:{const:{description:'old'}}}},
    {type:'object',properties:{value:{const:{description:'new'}}}}),false);
  assert.equal(compatibleToolSchema({type:'object',properties:{value:{enum:[{title:'old'}]}}},
    {type:'object',properties:{value:{enum:[{title:'new'}]}}}),false);
  assert.equal(compatibleToolSchema(Type.Object({value:Type.String({description:'old annotation'})}),
    Type.Object({value:Type.String({description:'new annotation'})})),true);
});

test('generation offered schema v1 remains valid after optional schema extension, next prompt sees v2', {timeout:20000},async()=>{
  const f=await fixture();
  try {
    const {running,release}=await f.activeGeneration();
    f.state.version=2;await f.client.session(f.a.id).reload();
    f.state.providers.get(f.a.id).setResponses([fauxAssistantMessage('after old tool')]);
    release.resolve();await running;
    assert.deepEqual(f.state.calls,[[2,{value:'old-call'}]]);
    f.state.providers.get(f.a.id).setResponses([request=>{f.state.prompts.push(request);return fauxAssistantMessage(fauxToolCall('compat_probe',{value:'new-call',extra:'optional'}),{stopReason:'toolUse'});},fauxAssistantMessage('new complete')]);
    await f.invoke();
    assert.deepEqual(f.state.calls,[[2,{value:'old-call'}],[2,{value:'new-call',extra:'optional'}]]);
    assert.ok(!JSON.stringify(getCurrentTools(f.state.prompts[0].messages)).includes('extra'));
    assert.ok(JSON.stringify(getCurrentTools(f.state.prompts.at(-1).messages)).includes('extra'));
  }finally{await f.close();}
});

test('incompatible required schema is maintenance-required before publication, accepted generation still executes v1', {timeout:20000},async()=>{
  const f=await fixture();
  try {
    const old=f.opened().profile.registry.snapshot();
    const {running,release}=await f.activeGeneration();
    f.state.version=2;f.state.required=true;
    await assert.rejects(f.client.session(f.a.id).reload(),error=>error.status===409&&error.message.startsWith('maintenance-required'));
    assert.equal(f.opened().profile.registry.snapshot(),old);
    release.resolve();await running;
    assert.deepEqual(f.state.calls,[[1,{value:'old-call'}]]);
  }finally{await f.close();}
});

test('removal defers only while an accepted generation may call the offered tool, then removes without a restart', {timeout:20000},async()=>{
  const f=await fixture();
  try {
    const opened=f.opened();const {running,release}=await f.activeGeneration();
    f.state.remove=true;
    await assert.rejects(f.client.session(f.a.id).reload(),error=>error.status===409);
    release.resolve();await running;
    assert.deepEqual(f.state.calls,[[1,{value:'old-call'}]]);
    await f.client.session(f.a.id).reload();
    assert.equal(f.opened(),opened);
    assert.ok(!opened.profile.registry.snapshot().tools().some(({tool})=>tool.name==='compat_probe'));
  }finally{await f.close();}
});

test('stable native phase updates at checkpoint using the same task ID and no second first-phase effect', {timeout:20000},async()=>{
  const f=await fixture();
  try {
    const opened=f.opened(),task=opened.profile.registry.snapshot().task('compat.phase');
    const id=await opened.harness.commit(tx=>tx.createTask(task,{}, {conversationId:1,ownership:{kind:'conversation'},background:true}),ctx);
    await f.state.started.promise;
    f.state.version=2;await f.client.session(f.a.id).reload();
    f.state.gate.resolve();
    const result=await opened.harness.waitForTask(id,withAbortSignal(AbortSignal.timeout(5000),ctx));
    assert.equal(result.id,id);assert.equal(result.state.outcome.status,'completed');assert.equal(result.state.outcome.result,2);
    assert.deepEqual(f.state.phase,[[id,2]]);
  }finally{await f.close();}
});

test('changed persisted document contract from a fresh adapter is rejected before publication', {timeout:20000},async()=>{
  const f=await fixture();
  try {
    const path=join(f.dir,'document-adapter.mjs');
    await writeFile(path,documentAdapterSource(1));f.state.extraAdapters=[path];await f.client.session(f.a.id).reload();
    const opened=f.opened(),task=opened.profile.registry.snapshot().task('compat.doc.reader');
    const id=await opened.harness.commit(tx=>tx.createTask(task,{}, {conversationId:1,ownership:{kind:'conversation'},background:true}),ctx);
    const result=await opened.harness.waitForTask(id,withAbortSignal(AbortSignal.timeout(5000),ctx));
    assert.equal(result.state.outcome.status,'completed');
    const old=opened.profile.registry.snapshot();
    await writeFile(path,documentAdapterSource(2));
    await assert.rejects(f.client.session(f.a.id).reload(),error=>error.status===409&&error.message.startsWith('maintenance-required'));
    assert.equal(opened.profile.registry.snapshot(),old);
  }finally{await f.close();}
});

test('incompatible live task version is rejected before publication and remains runnable on its old checkpoint', {timeout:20000},async()=>{
  const f=await fixture();
  try {
    const opened=f.opened(),task=opened.profile.registry.snapshot().task('compat.phase');
    const id=await opened.harness.commit(tx=>tx.createTask(task,{}, {conversationId:1,ownership:{kind:'conversation'},background:true}),ctx);
    await f.state.started.promise;
    f.state.version=2;f.state.taskVersion=2;
    await assert.rejects(f.client.session(f.a.id).reload(),error=>error.status===409&&error.message.startsWith('maintenance-required'));
    f.state.gate.resolve();
    const result=await opened.harness.waitForTask(id,withAbortSignal(AbortSignal.timeout(5000),ctx));
    assert.equal(result.id,id);assert.equal(result.version,1);assert.equal(result.state.outcome.result,1);
  }finally{await f.close();}
});

test('queued and nested calls offered in v1 use compatible v2 without rerunning their v1 parent',{timeout:20000},async()=>{
  const f=await fixture({nested:true});
  try {
    f.state.providers.get(f.a.id).setResponses([
      fauxAssistantMessage([fauxToolCall('compat_parent',{}),fauxToolCall('compat_probe',{value:'queued'})],{stopReason:'toolUse'}),
      fauxAssistantMessage('complete'),
    ]);
    const running=f.invoke();await f.state.parentStarted.promise;
    f.state.version=2;await f.client.session(f.a.id).reload();f.state.parentGate.resolve();await running;
    assert.equal(f.state.parentVersion,1);assert.deepEqual(f.state.calls,[[2,{value:'nested'}],[2,{value:'queued'}]]);
    const records=await f.opened().harness.commit(tx=>tx.scanTasks({},100),ctx);
    const nested=records.items.find(record=>record.kind==='pi.tool'&&record.input.kind==='nested');
    assert.ok(nested);assert.equal(nested.input.key,'stable-child');assert.equal(nested.state.status,'terminal');
  }finally{await f.close();}
});

test('read-only task preflight preserves the SDK ToolTask v1 migration instead of declaring it incompatible',{timeout:20000},async()=>{
  const f=await fixture();
  try {
    const record={id:900,kind:'pi.tool',version:1,input:{assistant:2,callId:'old-model-call'},
      state:{status:'pending',checkpoint:{phase:'execute',arguments:{value:'old-effect'},replay:'unsafe'}}};
    const before=structuredClone(record);
    await assertNativeTaskContracts({scanTasks:async()=>({items:[record]})},f.opened().profile.registry.snapshot());
    assert.deepEqual(record,before,'validation must not mutate the saved v1 input/checkpoint');
  }finally{await f.close();}
});

test('unsafe effect survives compatible publication and reopen once, with unchanged native task ID',{timeout:20000},async()=>{
  const f=await fixture();let restored;
  try {
    f.state.interruptAfterEffect=true;
    f.state.providers.get(f.a.id).setResponses([fauxAssistantMessage(fauxToolCall('compat_probe',{value:'one-effect'}),{stopReason:'toolUse'})]);
    const running=f.invoke();void running.catch(()=>{});await f.state.effectStarted.promise;
    f.state.version=2;await f.client.session(f.a.id).reload();
    const id=f.state.unsafeTask;assert.ok(id);assert.deepEqual(f.state.calls,[[1,{value:'one-effect'}]]);
    await f.store.close();f.state.interruptAfterEffect=false;
    restored=await Store.open(f.options);assert.ok(restored.opened.has(f.a.id));
    const opened=restored.opened.get(f.a.id);
    const result=await opened.harness.waitForTask(id,withAbortSignal(AbortSignal.timeout(5000),ctx));
    assert.equal(result.id,id);assert.equal(result.state.status,'terminal');
    assert.deepEqual(f.state.calls,[[1,{value:'one-effect'}]],'unsafe effect cannot run again under v2');
  }finally{await restored?.close();await f.close();}
});

test('incompatible persisted contracts fail before a trusted native selection apply can mutate',{timeout:20000},async()=>{
  const f=await fixture();
  try {
    let applied=0,published=0;
    await assert.rejects(reloadDurable({harness:f.opened().harness,context:ctx,assertCurrent(){},
      prepareExtensions:async()=>({apply:async()=>{applied++;},validateState:async()=>{throw Error('fixture-incompatible-contract');},publish(){published++;}}),
    }),/fixture-incompatible-contract/);
    assert.equal(applied,0);assert.equal(published,0);
  }finally{await f.close();}
});

for(const boundary of ['selection-apply','native-mutation','publication-validation','revoked-authority']) {
  test(`fault at ${boundary} leaves the prior registry unpublished`,{timeout:20000},async()=>{
    const f=await fixture();
    try {
      const opened=f.opened(),snapshot=opened.profile.registry.snapshot(),commit=opened.harness.commit;
      let published=0,checks=0;
      if(boundary==='native-mutation')opened.harness.commit=async()=>{throw Error('fixture-native-mutation-fault');};
      try {
        await assert.rejects(reloadDurable({harness:opened.harness,context:ctx,
          assertCurrent(){if(boundary==='revoked-authority'&&++checks===2)throw Error('fixture-revoked-authority-fault');},
          prepareExtensions:async()=>({
            ...(boundary==='selection-apply'?{apply:async()=>{throw Error('fixture-selection-apply-fault');}}:{}),
            validate(){if(boundary==='publication-validation')throw Error('fixture-publication-validation-fault');},
            publish(){published++;},
          }),
        }),/fixture-.+-fault/);
      }finally{opened.harness.commit=commit;}
      assert.equal(published,0);assert.equal(opened.profile.registry.snapshot(),snapshot);
      f.state.version=2;await f.client.session(f.a.id).reload();
      assert.notEqual(opened.profile.registry.snapshot(),snapshot,'failure does not leave a stuck reload lock');
    }finally{await f.close();}
  });
}

for (const defect of ['incompatible-document','missing-artifact']) {
  test(`reopen rejects ${defect} before native task reconciliation or resume`,{timeout:20000},async()=>{
    const f=await fixture();let restored;
    try {
      const path=join(f.dir,'persisted-document-adapter.mjs');
      await writeFile(path,documentAdapterSource(1));f.state.extraAdapters=[path];await f.client.session(f.a.id).reload();
      const opened=f.opened(),task=opened.profile.registry.snapshot().task('compat.doc.reader');
      const id=await opened.harness.commit(tx=>tx.createTask(task,{}, {conversationId:1,ownership:{kind:'conversation'},background:true}),ctx);
      await opened.harness.waitForTask(id,withAbortSignal(AbortSignal.timeout(5000),ctx));
      await f.store.close();const before=persistedTasks(f);
      if(defect==='incompatible-document')await writeFile(path,documentAdapterSource(2));
      else f.state.extraAdapters=[join(f.dir,'artifact-not-installed.mjs')];
      restored=await Store.open(f.options);
      assert.ok(restored.errors.has(f.a.id));assert.ok(!restored.opened.has(f.a.id));
      assert.deepEqual(persistedTasks(f),before,'failed reopen never reconciles or resumes saved native tasks');
    }finally{await restored?.close();await f.close();}
  });
}

test('rollback below a persisted terminal task contract is rejected live and before reopen mutation',{timeout:20000},async()=>{
  const f=await fixture({taskVersion:2});let restored;
  try {
    const opened=f.opened(),task=opened.profile.registry.snapshot().task('compat.phase');
    const id=await opened.harness.commit(tx=>tx.createTask(task,{}, {conversationId:1,ownership:{kind:'conversation'},background:true}),ctx);
    await f.state.started.promise;f.state.gate.resolve();
    assert.equal((await opened.harness.waitForTask(id,withAbortSignal(AbortSignal.timeout(5000),ctx))).version,2);
    f.state.taskVersion=1;
    await assert.rejects(f.client.session(f.a.id).reload(),error=>error.status===409&&error.message.startsWith('maintenance-required'));
    await f.store.close();const before=persistedTasks(f);
    restored=await Store.open(f.options);
    assert.ok(restored.errors.has(f.a.id));assert.ok(!restored.opened.has(f.a.id));
    assert.deepEqual(persistedTasks(f),before);
  }finally{await restored?.close();await f.close();}
});
