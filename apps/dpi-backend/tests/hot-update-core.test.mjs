import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BACKGROUND_CONTEXT as ctx } from '@earendil-works/chord/context';
import { InMemoryCredentialStore, Type } from '@earendil-works/pi-ai';
import { fauxProvider, fauxAssistantMessage, fauxToolCall } from '@earendil-works/pi-ai/providers/faux';
import { createRegistry, defineExtension, defineTool, hook, ToolTask } from '@earendil-works/pi-durable';
import { Store } from '../src/store.ts';
import { createNativeProfile, createNativeModels } from '../src/native-profile/profile.ts';
import { GrantPolicy } from '../src/grants.ts';
import { createHttpServer } from '../src/http-server.ts';
import { DpiClient } from '../../dpi-sdk/src/client.ts';

const selected = { provider: 'hot-update-faux', modelId: 'same-model' };
const owner = { id:'owner', token:'synthetic-owner', actor:'operator', source:'terminal', authority:'human',
  permissions:['read','write','control','filesystem','human-accept'], binding:{} };

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'hot-core-'));
  const work = join(directory,'work'); await mkdir(work);
  const state = { version:1, calls:[], gate:undefined, started:undefined, invalid:false };
  const providers = new Map();
  const credentials = new InMemoryCredentialStore();
  const makeModels = async (id='catalogue') => createNativeModels(() => {
    const faux = fauxProvider({provider:selected.provider, models:[{id:selected.modelId,contextWindow:128000,maxTokens:8192}],tokensPerSecond:100000});
    providers.set(id, faux);
    return {credentials, providers:[faux.provider]};
  });
  const catalogue = await makeModels();
  const policy = new GrantPolicy([owner]);
  const extension = version => defineExtension({name:'ordinary-probe',tools:[defineTool({name:'hot_probe',parameters:Type.Object({}),replay:'safe',
    execute:async () => {
      state.calls.push(version);
      if (version === 1 && state.gate) { state.started?.(); await state.gate; }
      return {output:[{type:'text',text:`tool-version-${version}`}]};
    },
  })]});
  const profile = createNativeProfile({policy,owner:policy.authenticate(owner.token),
    models:{defaultModel:selected,catalogue:catalogue.catalogue,create:context=>makeModels(context.sessionId)},
    dcg:{binaryPath:join(directory,'missing-dcg'),envSource:()=>({})},
    connectMcp:async()=>({sources:[],close:async()=>{}}),
    loadAdapters:async()=>{
      if (state.prepareGate) { state.prepareStarted?.(); await state.prepareGate; }
      if (state.invalid) throw Error('SYNTHETIC_PRIVATE_PREPARE');
      const addon=extension(state.version);
      return [base=>{const next=createRegistry();for(const ext of base.snapshot().installed())next.install(ext);next.install(addon);return next;}];
    },
  });
  const store = await Store.open({dataDir:join(directory,'data'),startDirs:[work],profile,provider:'faux'});
  const server = createHttpServer(store,policy).listen(0,'127.0.0.1'); await once(server,'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const client = new DpiClient(base,owner.token);
  const a=await client.createSession({name:'A',cwd:work,model:selected});
  const b=await client.createSession({name:'B',cwd:work,model:selected});
  let serial=0;
  async function invoke(id, name='hot_probe', args={}) {
    providers.get(id).setResponses([fauxAssistantMessage(fauxToolCall(name,args),{stopReason:'toolUse'}),fauxAssistantMessage('complete')]);
    const result=await fetch(`${base}/v1/sessions/${id}/agents/main/messages`, {method:'POST',headers:{authorization:`Bearer ${owner.token}`,'content-type':'application/json'},
      body:JSON.stringify({requestId:`core-${++serial}`,content:'fixture',waitMs:10000})});
    assert.equal(result.status,200,await result.text());
    const {c}=await store.resolveAgent(id,'main');
    return (await c.entries({},200,undefined,ctx)).items;
  }
  return {state,providers,store,client,a,b,invoke,extension,
    async close(){state.release?.();state.prepareRelease?.();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await store.close();}};
}

test('native full profile busy ToolTask and schedule survive HTTP/SDK reload with exact owner; future dispatch is v2', {timeout:20000}, async()=>{
  const f=await fixture();
  try {
    await f.invoke(f.a.id,'schedule',{action:'add',when:'in 1m',message:'retained occurrence'});
    const opened=f.store.opened.get(f.a.id), other=f.store.opened.get(f.b.id), pid=process.pid;
    const before=await opened.harness.commit(tx=>tx.scanTasks({},500),ctx);
    assert.ok(before.items.some(task=>task.state.status!=='terminal'),'live schedule exists');
    const root=await opened.harness.root(ctx), rootId=root.id;
    f.state.gate=new Promise(resolve=>{f.state.release=resolve;});
    const started=new Promise(resolve=>{f.state.started=resolve;});
    const active=f.invoke(f.a.id); await started;
    f.state.version=2;
    const result=await f.client.session(f.a.id).reload();
    assert.equal(result.sessionId,f.a.id);
    assert.equal(process.pid,pid);assert.equal(f.store.opened.get(f.a.id),opened);assert.equal(f.store.opened.get(f.b.id),other);
    assert.equal((await opened.harness.root(ctx)).id,rootId);
    // Publication does not cancel or repeat the accepted v1 tool.
    f.providers.get(f.a.id).setResponses([fauxAssistantMessage('post-v1 complete')]);
    f.state.release();
    const oldEntries=await active;
    assert.match(JSON.stringify(oldEntries),/tool-version-1/);
    const nextEntries=await f.invoke(f.a.id);
    assert.match(JSON.stringify(nextEntries),/tool-version-2/);
    assert.deepEqual(f.state.calls,[1,2]);
    const otherEntries=await f.invoke(f.b.id);
    assert.match(JSON.stringify(otherEntries),/tool-version-1/);
    const after=await opened.harness.commit(tx=>tx.scanTasks({},500),ctx);
    for(const task of before.items.filter(task=>task.state.status!=='terminal'))assert.ok(after.items.some(next=>next.id===task.id));
  } finally {await f.close();}
});

test('direct hidden-base hook install and uninstall stay visible after adapter publication', async()=>{
  const f=await fixture();
  try {
    const registry=f.store.opened.get(f.a.id).profile.registry;
    let invoked=0;
    const ext=defineExtension({name:'late-base',hooks:[hook(ToolTask,{beforeTool:async()=>{invoked++;}})]});
    registry.install(ext);
    assert.equal(registry.snapshot().extension(ext.name),ext);
    await f.invoke(f.a.id);
    assert.equal(invoked,1,'late base hook runs on the next native ToolTask');
    registry.uninstall(ext);
    assert.equal(registry.snapshot().extension(ext.name),undefined);
    assert.ok(registry.snapshot().extension('ordinary-probe'));
    await f.invoke(f.a.id);
    assert.equal(invoked,1,'uninstalled hidden-base hook does not run again');
  } finally {await f.close();}
});

test('close during reload preparation fences publication and retains ownership until the preparer settles', async()=>{
  const f=await fixture();
  try {
    const opened=f.store.opened.get(f.a.id),old=opened.profile.registry.snapshot();
    f.state.version=2;
    const started=new Promise(resolve=>{f.state.prepareStarted=resolve;});
    f.state.prepareGate=new Promise(resolve=>{f.state.prepareRelease=resolve;});
    const pending=f.client.session(f.a.id).reload();
    const rejected=assert.rejects(pending,error=>error.status===503||error.status===409);
    await started;
    let closed=false;const closing=f.store.close().then(()=>{closed=true;});
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(closed,false);
    assert.equal(f.store.opened.get(f.a.id),opened);
    f.state.prepareRelease();await rejected;await closing;
    assert.equal(opened.profile.registry.snapshot(),old);
  } finally {await f.close();}
});
