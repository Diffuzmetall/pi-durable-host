import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BACKGROUND_CONTEXT as ctx } from '@earendil-works/chord/context';
import { InMemoryCredentialStore } from '@earendil-works/pi-ai';
import { fauxProvider, fauxAssistantMessage, fauxToolCall } from '@earendil-works/pi-ai/providers/faux';
import { createRegistry, defineExtension, GenerationTask, hook } from '@earendil-works/pi-durable';
import { Store } from '../../../apps/dpi-backend/src/store.ts';
import { GrantPolicy } from '../../../apps/dpi-backend/src/grants.ts';
import { createHttpServer } from '../../../apps/dpi-backend/src/http-server.ts';
import { createNativeProfile, createNativeModels } from '../../../apps/dpi-backend/src/native-profile/profile.ts';
import { createAutomation } from '../../../apps/dpi-backend/src/native-profile/automation/automation.ts';
import { ScheduleDoc, occurrenceRequestId } from '../../../apps/dpi-backend/src/native-profile/automation/schedules.ts';
import { NativeGoalsDoc } from '../../../apps/dpi-backend/src/native-profile/automation/native-contract.ts';
import { DpiClient } from '../../../apps/dpi-sdk/src/client.ts';
const selected = {provider:'s5-faux',modelId:'same-native-model'};
const owner = {id:'owner',token:'s5-synthetic-owner',actor:'operator',source:'terminal',authority:'human',
  permissions:['read','write','control','filesystem','human-accept'],binding:{}};
const target = r => ({key:r.childKey,conversationId:r.conversationId,executionId:r.executionId,requestId:r.requestId});
const until = async predicate => {
  const deadline = Date.now()+75000;
  while (!await predicate()) {
    if(Date.now()>deadline) throw Error('Native schedule fixture timed out');
    await new Promise(resolve=>setTimeout(resolve,15));
  }
};

test('automation prepares handlers before bind, preserves service and fences preparation after close', async()=>{
  const automation=createAutomation({authorize:()=>true,admit:async()=>{}});
  const service=automation.goals;
  const first=await automation.prepareReload(), second=await automation.prepareReload();
  assert.equal(first[0].extension.name,'durable-schedules');
  assert.notEqual(first[0].extension,second[0].extension);
  assert.equal(first[0].documents[0].kind,'durable.schedules');
  assert.equal(automation.goals,service);
  await automation.shutdown(ctx);
  await assert.rejects(()=>automation.prepareReload(),/AUTOMATION_CLOSED/);
});

test('HTTP reload refreshes schedule handler and ordinary Goal hook without changing contract, occurrence or parent authority', {timeout:100000}, async()=>{
  const home=await mkdtemp(join(tmpdir(),'s5-native-')), work=join(home,'project'); await mkdir(work);
  let policy=new GrantPolicy([owner]), store, server;
  const providers=new Map(), seen=[];
  let version=1;
  const credentials=new InMemoryCredentialStore();
  const makeModels=async id=>createNativeModels(()=>{
    const faux=fauxProvider({provider:selected.provider,models:[{id:selected.modelId,contextWindow:128000,maxTokens:8192}],tokensPerSecond:100000});
    providers.set(id,faux); return {credentials,providers:[faux.provider]};
  });
  const catalogue=await makeModels('catalogue');
  const build=()=>createNativeProfile({policy,owner:policy.authenticate(owner.token),
    models:{defaultModel:selected,catalogue:catalogue.catalogue,create:c=>makeModels(c.sessionId)},
    connectMcp:async()=>({sources:[],close:async()=>{}}),dcg:{binaryPath:join(home,'unconfigured-dcg'),envSource:()=>({})},
    loadAdapters:async()=>{
      const current=version;
      const ordinary=defineExtension({name:'s5-goal-neighbour',hooks:[hook(GenerationTask,{beforeRequest:async()=>{seen.push(current);}})]});
      return [base=>{const next=createRegistry();for(const extension of base.snapshot().installed())next.install(extension);next.install(ordinary);return next;}];
    },
  });
  const open=()=>Store.open({dataDir:join(home,'data'),startDirs:[work],profile:build(),provider:'faux'});
  try{
    store=await open();
    const A=await store.create({name:'A',cwd:work,model:selected}), B=await store.create({name:'B',cwd:work,model:selected});
    await store.close();store=undefined;
    const machine=(id,sessionId)=>({id,token:`s5-${id}`,actor:id,source:'iii',authority:'delegated',permissions:['read','write','control'],binding:{sessionId,conversationId:1}});
    policy=new GrantPolicy([owner,machine('machine-a',A.id),machine('machine-b',B.id)]);
    store=await open();
    server=createHttpServer(store,policy).listen(0,'127.0.0.1');await once(server,'listening');
    const url=`http://127.0.0.1:${server.address().port}`, client=new DpiClient(url,owner.token);
    const a=new DpiClient(url,'s5-machine-a').agent(A.id,'main'), b=new DpiClient(url,'s5-machine-b').agent(B.id,'main');
    providers.get(A.id).setResponses([fauxAssistantMessage('child fixture result'),fauxAssistantMessage('parent report acknowledged')]);
    providers.get(B.id).setResponses([fauxAssistantMessage('child fixture result'),fauxAssistantMessage('parent report acknowledged')]);
    const child=await a.parentCommand({controlId:'a-child',expectedRevision:(await a.parentControl()).revision,action:'spawn',name:'a-child',task:'Local faux fixture only'});
    const foreign=await b.parentCommand({controlId:'b-child',expectedRevision:(await b.parentControl()).revision,action:'spawn',name:'b-child',task:'Local faux fixture only'});
    const opened=store.opened.get(A.id), host=opened.harness, root=await host.root(ctx), other=store.opened.get(B.id);
    await (await host.conversation(child.conversationId,ctx)).waitForIdle(ctx);
    await (await other.harness.conversation(foreign.conversationId,ctx)).waitForIdle(ctx);
    await until(async()=>JSON.stringify((await root.entries({},50,undefined,ctx)).items.filter(entry=>entry.kind==='pi.user')).includes('a-child'));
    const otherRoot=await other.harness.root(ctx);
    await until(async()=>JSON.stringify((await otherRoot.entries({},50,undefined,ctx)).items.filter(entry=>entry.kind==='pi.user')).includes('b-child'));
    await root.waitForIdle(ctx);await otherRoot.waitForIdle(ctx);
    const goals=opened.profile.native.goals;
    const goal=await goals.create(root.id,{objective:'Pinned fixture contract',criteria:[{id:'check',text:'Explicit local proof',human:true}],skills:[],
      permissions:{scope:['Disposable source fixture']},limits:{maxCalls:3}},ctx);
    const savedGoal=structuredClone((await host.snapshot(NativeGoalsDoc,ctx)).goals[goal.id]);
    const originalSchedule=opened.profile.registry.snapshot().extension('durable-schedules');
    const originalGoalGuard=opened.profile.registry.snapshot().extension('native-goals');
    const otherSchedule=other.profile.registry.snapshot().extension('durable-schedules');
    providers.get(A.id).setResponses([fauxAssistantMessage(fauxToolCall('schedule',{action:'add',when:'in 1m',message:'one retained occurrence'}),{stopReason:'toolUse'}),fauxAssistantMessage('scheduled')]);
    const submitted=await root.submit({type:'input',content:'fixture schedule only',requestId:'schedule-arm'},ctx);await submitted.wait(ctx);await root.waitForIdle(ctx);
    const scheduleState=await host.snapshot(ScheduleDoc,root.id,ctx);
    assert.ok(scheduleState,JSON.stringify((await root.entries({},50,undefined,ctx)).items.filter(entry=>entry.kind==='pi.tool-result')));
    const scheduled=Object.values(scheduleState.items)[0];assert.ok(scheduled);
    assert.equal(scheduled.status,'active');assert.equal(scheduled.runs,0);
    version=2;
    providers.get(A.id).setResponses([fauxAssistantMessage('one native occurrence')]);
    await client.session(A.id).reload();
    assert.equal(store.opened.get(A.id).harness,host);
    assert.notEqual(opened.profile.registry.snapshot().extension('durable-schedules'),originalSchedule);
    assert.equal(opened.profile.registry.snapshot().extension('native-goals'),originalGoalGuard,'accounting/acceptance guards are never replaced');
    assert.equal(other.profile.registry.snapshot().extension('durable-schedules'),otherSchedule);
    assert.equal(opened.profile.native.goals,goals);
    assert.deepEqual((await host.snapshot(NativeGoalsDoc,ctx)).goals[goal.id],savedGoal);
    await until(async()=> (await host.snapshot(ScheduleDoc,root.id,ctx)).items[scheduled.id].status==='completed');
    await root.waitForIdle(ctx);
    const after=(await host.snapshot(ScheduleDoc,root.id,ctx)).items[scheduled.id];
    assert.equal(after.taskId,scheduled.taskId);assert.equal(after.id,scheduled.id);assert.equal(after.runs,1);
    const occurrence=occurrenceRequestId(scheduled.taskId,0);
    const receipt=await host.commit(tx=>tx.submissionByRequest(root.id,occurrence),ctx);assert.ok(receipt);
    assert.ok(seen.includes(1));assert.ok(seen.includes(2),'future ordinary hook uses v2');
    await client.session(A.id).reload();
    assert.equal((await host.snapshot(ScheduleDoc,root.id,ctx)).items[scheduled.id].runs,1);
    assert.equal((await host.commit(tx=>tx.submissionByRequest(root.id,occurrence),ctx)).taskId,receipt.taskId);
    assert.deepEqual(await a.parentReceipt('a-child'),child);
    const rev=(await a.parentControl()).revision;
    await assert.rejects(()=>a.parentCommand({controlId:'foreign-current',expectedRevision:rev,action:'stop',target:target(foreign),scope:'child-tree'}),{status:403});
    await assert.rejects(()=>client.agent(A.id,child.conversationId).parentControl(),{status:403});
    const stopped=await a.parentCommand({controlId:'own-stop',expectedRevision:(await a.parentControl()).revision,action:'stop',target:target(child),scope:'child-tree'});
    assert.equal(stopped.stopped,true);
    policy.revoke('machine-a');
    await assert.rejects(()=>a.parentControl(),{status:401});
    assert.deepEqual((await host.snapshot(NativeGoalsDoc,ctx)).goals[goal.id],savedGoal);
  }finally{
    if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
    if(store)await store.close();
    await rm(home,{recursive:true,force:true});
  }
});
