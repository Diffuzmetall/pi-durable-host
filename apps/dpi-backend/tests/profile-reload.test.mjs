import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BACKGROUND_CONTEXT as ctx, withAbortSignal } from '@earendil-works/chord/context';
import { InMemoryCredentialStore, Type } from '@earendil-works/pi-ai';
import { fauxProvider, fauxAssistantMessage } from '@earendil-works/pi-ai/providers/faux';
import { createRegistry, defineExtension, defineTool } from '@earendil-works/pi-durable';
import { DpiClient } from '../../dpi-sdk/src/client.ts';
import { RemoteTerminal } from '../../terminal-adapter/src/remote-controller.ts';
import { reloadDurable, loadRegistryAdapters } from '@local/pi-durable-reload';
import { Store } from '../src/store.ts';
import { createNativeProfile, createNativeModels } from '../src/native-profile/profile.ts';
import { GrantPolicy } from '../src/grants.ts';
import { createHttpServer } from '../src/http-server.ts';
const selected = { provider: 'reload-faux', modelId: 'kept' };
const owner = { id:'owner', token:'fixture-owner', actor:'operator', source:'terminal', authority:'human',
  permissions:['read','write','control','filesystem','human-accept'], binding:{} };
function addition(version, name = 'reload-tool') {
  return defineExtension({ name: `addon-${name}`, tools:[defineTool({ name, parameters:Type.Object({}), replay:'safe',
    execute:async () => ({ output:[{type:'text',text:`version-${version}`}] }) })] });
}
function adapter(version) {
  return base => {
    const result = createRegistry();
    for (const ext of base.snapshot().installed()) result.install(ext);
    result.install(addition(version));
    return result;
  };
}
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(),'durable-reload-'));
  const work = join(directory,'work'); await mkdir(work);
  const state = { version:1, missing:false, invalid:false, closes:0, prepares:0, gate:undefined, started:undefined, release:undefined };
  const credentials = new InMemoryCredentialStore();
  await credentials.modify(selected.provider, async () => ({ type:'api_key', key:'SYNTHETIC_NOT_A_SECRET' }));
  let providers = [];
  const options = () => {
    const version = state.version;
    const faux = fauxProvider({ provider:selected.provider, models:[{ id:state.missing ? 'wrong' : selected.modelId, contextWindow:100000, maxTokens:4096 }, { id:`new-${version}`, contextWindow:100000, maxTokens:4096 }], tokensPerSecond:100000 });
    faux.setResponses([async () => {
      state.started?.();
      if (state.gate) await state.gate;
      return fauxAssistantMessage(`response-${version}`);
    }]);
    const provider = { ...faux.provider, auth:{ apiKey:{ name:'fixture', resolve:async ({credential}) => credential?.key ? {auth:{apiKey:credential.key}} : undefined } } };
    providers.push(provider);
    return { credentials, providers:[provider] };
  };
  const makeModels = () => createNativeModels(options);
  const discovery = await makeModels();
  const policy = new GrantPolicy([owner, ...[['reader','human',['read']],['writer','human',['read','write']],['delegated','delegated',['read','write','control']]].map(([id,authority,permissions]) => ({id,token:`fixture-${id}`,actor:id,source:'terminal',authority,permissions,binding:{}}))]);
  const profile = createNativeProfile({ policy, owner:policy.authenticate(owner.token),
    models:{ defaultModel:selected, catalogue:discovery.catalogue, create:makeModels },
    dcg:{ binaryPath:join(directory,'no-dcg'), envSource:()=>({}) },
    loadAdapters:async () => { state.prepares++; if (state.adapterGate) { state.adapterStarted?.(); await state.adapterGate; } if (state.invalid) throw Error('PRIVATE_RELOAD_TOKEN_SENTINEL'); return [adapter(state.version)]; },
    connectMcp:async () => ({ sources:[], close:async () => {state.closes++;} }),
  });
  const store = await Store.open({ dataDir:join(directory,'data'), startDirs:[work], name:'reload-test', provider:'faux', profile });
  const server = createHttpServer(store, policy).listen(0,'127.0.0.1'); await once(server,'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const client = new DpiClient(base, owner.token);
  const a = await client.createSession({name:'A',cwd:work,model:selected}); const b = await client.createSession({name:'B',cwd:work,model:selected});
  const opened = id => store.opened.get(id);
  return { state, store, policy, client, base, a, b, opened, directory, work,
    async close(){ server.closeAllConnections(); await new Promise(resolve=>server.close(resolve)); await store.close(); } };
}
async function run(opened, request) {
  const c = await opened.harness.root(ctx);
  const submitted = await c.submit({type:'input', content:'reload probe',requestId:request},ctx);
  const result = await submitted.wait(withAbortSignal(AbortSignal.timeout(5000),ctx));
  assert.equal(result.status,'done');
}

test('HTTP/SDK reload uses the existing Durable owner, changes dispatch/catalogue and leaves another session untouched', async () => {
  const f = await fixture();
  try {
    const a = f.opened(f.a.id), b = f.opened(f.b.id);
    const oldRegistry = a.profile.registry.snapshot(); const oldModels = a.models.models;
    f.state.version = 2;
    const response = await fetch(`${f.base}/v1/sessions/${f.a.id}/reload`,{method:'POST', headers:{authorization:`Bearer ${owner.token}`,'content-type':'application/json'},body:'{}'});
    assert.equal(response.status,200,await response.text());
    assert.equal(f.opened(f.a.id),a); assert.equal(f.opened(f.b.id),b);
    assert.equal(a.models.models,oldModels); assert.notEqual(a.profile.registry.snapshot(),oldRegistry);
    assert.equal(f.state.closes,0);
    assert.ok((await f.client.session(f.a.id).models()).some(m=>m.id==='new-2'));
    assert.ok(!(await f.client.session(f.b.id).models()).some(m=>m.id==='new-2'));
    assert.deepEqual((await (await a.harness.root(ctx)).agent(ctx)).model,selected);
    assert.deepEqual((await f.client.device()).models,await f.client.session(f.a.id).models());
    await run(a,'native-after-reload'); await run(b,'unaffected-other-session');
    f.state.version = 3;
    assert.equal((await f.client.session(f.a.id).reload()).sessionId,f.a.id);
    assert.ok((await a.models.catalogue()).some(m=>m.id==='new-3'));
  } finally { await f.close(); }
});

test('failed extension or missing saved model keeps the old registry, dispatch, choice and device catalogue', async () => {
  const f = await fixture();
  try {
    const a = f.opened(f.a.id), snapshot = a.profile.registry.snapshot();
    const catalogue = await f.client.device();
    f.state.version=2; f.state.invalid=true;
    await assert.rejects(f.client.session(f.a.id).reload(),error => !error.message.includes('PRIVATE_RELOAD_TOKEN_SENTINEL'));
    assert.equal(a.profile.registry.snapshot(),snapshot);
    assert.deepEqual(await f.client.device(),catalogue);
    f.state.invalid=false; f.state.missing=true;
    await assert.rejects(f.client.session(f.a.id).reload(),error=>error.status===503);
    assert.equal(a.profile.registry.snapshot(),snapshot);
    assert.ok(a.models.models.getModel(selected.provider,selected.modelId));
    assert.ok(!a.models.models.getModel(selected.provider,'new-2'));
    await run(a,'still-works-after-rejected-reload');
  } finally { await f.close(); }
});

test('active Durable tasks reject reload without disrupting generation or another idle session', async () => {
  const f = await fixture();
  try {
    const a = f.opened(f.a.id), old = a.profile.registry.snapshot();
    f.state.gate=new Promise(resolve=>{ f.state.release=resolve; });
    const started=new Promise(resolve=>{ f.state.started=resolve; });
    const executing=run(a,'active-generation');
    await started;
    f.state.version=2;
    await assert.rejects(f.client.session(f.a.id).reload(),error => error.status===409);
    assert.equal(a.profile.registry.snapshot(),old);
    await f.client.session(f.b.id).reload();
    f.state.release(); await executing;
    f.state.gate=undefined;
    await f.client.session(f.a.id).reload();
  } finally { f.state.release?.(); await f.close(); }
});

test('reload requires human write+control authority and does not admit client module paths', async () => {
  const f = await fixture();
  try {
    for (const [id,authority,permissions] of [['reader','human',['read']],['writer','human',['read','write']],['delegated','delegated',['read','write','control']]]) {
      const response=await fetch(`${f.base}/v1/sessions/${f.a.id}/reload`,{method:'POST',headers:{authorization:`Bearer fixture-${id}`,'content-type':'application/json'},body:'{}'});
      assert.equal(response.status,403);
    }
    const response=await fetch(`${f.base}/v1/sessions/${f.a.id}/reload`,{method:'POST',headers:{authorization:`Bearer ${owner.token}`,'content-type':'application/json'},body:'{"path":"/tmp/untrusted.ts"}'});
    assert.equal(response.status,400);
  } finally { await f.close(); }
});

test('the same reload operation works directly with Durable, with no HTTP/Store lifecycle involvement', async () => {
  const f = await fixture();
  try {
    const a=f.opened(f.a.id);
    f.state.version=4;
    const result=await reloadDurable({harness:a.harness,context:ctx,models:a.models,prepareExtensions:a.profile.prepareReload,assertCurrent:()=>{}});
    assert.ok(result.models.some(m=>m.id==='new-4'));
    assert.equal(f.state.closes,0);
    await run(a,'direct-durable-reload');
  } finally { await f.close(); }
});

test('trusted adapter reload refreshes transitive imports and rejects duplicate tools/removed guards', async () => {
  const f=await fixture();
  try {
    const a=f.opened(f.a.id);
    const module=join(f.directory,'adapter.mjs'), value=join(f.directory,'value.mjs');
    await writeFile(value,'export const version=1;');
    await writeFile(module,`import {createRegistry,defineExtension,defineTool} from '@earendil-works/pi-durable';\nimport {version} from './value.mjs';\nexport default base=>{const registry=createRegistry();for(const ext of base.snapshot().installed())registry.install(ext);registry.install(defineExtension({name:'file-addon',tools:[defineTool({name:'file_version',parameters:{type:'object',properties:{}},replay:'safe',execute:async()=>({output:[{type:'text',text:String(version)}]})})]}));return registry;}`);
    // A new evaluator is used for each load, not only a cache-busted entrypoint import.
    let adapters=await loadRegistryAdapters([module],f.directory);
    let candidate=await a.profile.registry.prepare(adapters); candidate.publish();
    let tool=a.profile.registry.snapshot().tools().find(item=>item.tool.name==='file_version').tool;
    assert.equal((await tool.execute({})).output[0].text,'1');
    await writeFile(value,'export const version=2;');
    adapters=await loadRegistryAdapters([module],f.directory);
    candidate=await a.profile.registry.prepare(adapters); candidate.publish();
    tool=a.profile.registry.snapshot().tools().find(item=>item.tool.name==='file_version').tool;
    assert.equal((await tool.execute({})).output[0].text,'2');
    const old=a.profile.registry.snapshot();
    await assert.rejects(a.profile.registry.prepare([()=>createRegistry()]),/BASE/);
    await assert.rejects(a.profile.registry.prepare([base=>{const registry=createRegistry();for(const ext of base.snapshot().installed())registry.install(ext);registry.install(addition(2)); registry.install(defineExtension({name:'duplicate',tools:[addition(3).tools[0]]}));return registry;}]),/DUPLICATE/);
    assert.equal(a.profile.registry.snapshot(),old);
  } finally { await f.close(); }
});

test('remote TUI delegates reload through SDK and refreshes its own model menu', async () => {
  const f=await fixture(); let terminal;
  try {
    terminal=await RemoteTerminal.open(f.client,f.a.id,join(f.directory,'terminal-cache'));
    f.state.version=5;
    await terminal.reload();
    assert.ok(terminal.current().models.some(model=>model.modelId==='new-5'));
    const prepares=f.state.prepares;
    await assert.rejects(terminal.reload('/tmp/untrusted.ts'),/cannot admit/);
    assert.equal(f.state.prepares,prepares);
  } finally { await terminal?.close(); await f.close(); }
});

test('concurrent reload is refused and revocation during preparation prevents publication', async () => {
  const f=await fixture();
  try {
    const a=f.opened(f.a.id),old=a.profile.registry.snapshot();
    const started=new Promise(resolve=>{f.state.adapterStarted=resolve;});
    f.state.adapterGate=new Promise(resolve=>{f.state.adapterRelease=resolve;});
    f.state.version=6;
    const pending=f.client.session(f.a.id).reload();
    // Attach the rejection observer before revoking, so there is no unhandled rejection window.
    const rejected=assert.rejects(pending,error=>error.status===401);
    await started;
    await assert.rejects(f.client.session(f.a.id).reload(),error=>error.status===409);
    assert.equal(a.profile.registry.snapshot(),old);
    f.policy.revoke(owner.id);
    f.state.adapterRelease();
    await rejected;
    assert.equal(a.profile.registry.snapshot(),old);
    assert.ok(!a.models.models.getModel(selected.provider,'new-6'));
  } finally { f.state.adapterRelease?.(); await f.close(); }
});
