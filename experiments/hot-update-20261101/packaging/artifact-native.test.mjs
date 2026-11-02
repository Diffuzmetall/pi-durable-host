import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { join, dirname } from 'node:path';
import { mkdir, writeFile, readFile, copyFile, symlink } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { unlinkSync } from 'node:fs';
import { fixture } from './artifact-selection.test.mjs';
import { selectedNativeAdapters } from '../../sdk-host-cutover/native-artifact.mjs';

const req=createRequire('/candidate/package.json');
// The fixture uses Node's import-condition resolver, exactly like the installed ESM modules.
const source = process.env.ARTIFACT_SOURCE === '1';
const imported=async name=>import(import.meta.resolve(name,source?'file:///repo/apps/dpi-backend/package.json':'file:///candidate/package.json'));
const {Store}=await (source?import('/repo/apps/dpi-backend/src/store.ts'):imported('dpi-backend/store'));
const {GrantPolicy}=await import(source?'file:///repo/apps/dpi-backend/src/grants.ts':pathToFileURL(join(dirname(req.resolve('dpi-backend/store')),'grants.js')).href);
const {createHttpServer}=await (source?import('/repo/apps/dpi-backend/src/http-server.ts'):imported('dpi-backend/server'));
const {createNativeProfile,createNativeModels,loadRegistryAdapters}=await (source?import('/repo/apps/dpi-backend/src/native-profile/profile.ts'):imported('dpi-backend/native-profile'));
const {DpiClient}=await import('/candidate/node_modules/dpi-sdk/dist/client.js');
const {BACKGROUND_CONTEXT:ctx,withAbortSignal}=await imported('@earendil-works/chord/context');
const {InMemoryCredentialStore}=await imported('@earendil-works/pi-ai');
const {fauxProvider,fauxAssistantMessage,fauxToolCall}=await imported('@earendil-works/pi-ai/providers/faux');

test('installed real Host/SDK and operator CLI roll forward/back without new owner or repeated native effect',async()=>{
  const f=await fixture('temporary');await mkdir(join(f.root,'work'));
  const effects=join(f.root,'effects.txt');await writeFile(effects,'');
  process.env.ARTIFACT_EFFECT_FILE=effects;
  const observed=[];
  const selected={provider:'artifact-faux',modelId:'kept'};
  const credentials=new InMemoryCredentialStore();
  await credentials.modify(selected.provider,async()=>({type:'api_key',key:'SYNTHETIC'}));
  const options=()=>{
    const faux=fauxProvider({provider:selected.provider,models:[{id:selected.modelId,contextWindow:100000,maxTokens:4096}],tokensPerSecond:100000});
    faux.setResponses(Array.from({length:30},()=>request=>{
      const input=request.messages.findLastIndex(message=>message.role==='user');
      return request.messages.slice(input+1).some(message=>message.role==='toolResult')
        ? fauxAssistantMessage('done')
        : fauxAssistantMessage(fauxToolCall('artifact_version',{}),{stopReason:'toolUse'});
    }));
    return {credentials,providers:[{...faux.provider,auth:{apiKey:{name:'fixture',resolve:async()=>({auth:{apiKey:'SYNTHETIC'}})}}}]};
  };
  const discovery=await createNativeModels(options);
  const owner={id:'operator',token:'SYNTHETIC_OPERATOR',actor:'operator',source:'terminal',authority:'human',permissions:['read','write','control','filesystem','human-accept'],binding:{}};
  const policy=new GrantPolicy([owner]);
  let enabled=false;
  const profile=createNativeProfile({policy,owner:policy.authenticate(owner.token),
    models:{defaultModel:selected,catalogue:discovery.catalogue,create:()=>createNativeModels(options)},
    dcg:{binaryPath:join(f.root,'absent-dcg'),envSource:()=>({})},
    loadAdapters:async context=>loadRegistryAdapters(await selectedNativeAdapters(f.selector,enabled?context.sessionId:'temporary'),context.cwd),
    connectMcp:async()=>({sources:[],close:async()=>{}})});
  const store=await Store.open({dataDir:join(f.root,'data'),startDirs:[join(f.root,'work')],name:'rollback',provider:'faux',profile});
  const server=createHttpServer(store,policy);
  let dropAck=false,cleanupFault=false,reloads=0;const responses=[];
  const handle=server.listeners('request')[0];server.removeListener('request',handle);
  server.on('request',(request,response)=>{
    if(request.url.endsWith('/reload')) {
      reloads++;
      const end=response.end.bind(response);
      response.end=(...args)=>{
        responses.push({status:response.statusCode,body:String(args[0]??'')});
        if(cleanupFault){cleanupFault=false;unlinkSync(`${f.selector}.lock`);}
        if(dropAck){dropAck=false;response.destroy();return response;}
        return end(...args);
      };
    }
    handle(request,response);
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const base=`http://127.0.0.1:${server.address().port}`;
  const client=new DpiClient(base,owner.token);
  try {
    const session=await client.createSession({name:'A',cwd:join(f.root,'work'),model:selected});
    const saved=JSON.parse(await readFile(f.selector));saved.sessionId=session.id;saved.url=base;
    await writeFile(f.selector,JSON.stringify(saved));enabled=true;
    const opened=store.opened.get(session.id),harness=opened.harness;
    const identity={pid:process.pid,session:session.id,model:(await client.session(session.id).models()).map(m=>m.id)};
    const operator=join(f.root,'operator');await mkdir(operator);await mkdir(join(operator,'node_modules'));
    await symlink('/candidate/node_modules/dpi-sdk',join(operator,'node_modules/dpi-sdk'));
    for(const name of ['native-artifact.mjs','select-native-artifact.mjs'])
      await copyFile(`/repo/experiments/sdk-host-cutover/${name}`,join(operator,name));
    const token=join(f.root,'token');await writeFile(token,owner.token,{mode:0o600});
    async function command(target,expected,expectedCode=0){
      const child=spawn(process.execPath,[join(operator,'select-native-artifact.mjs'),'--selector',f.selector,'--target',target,'--expected',expected,'--token-file',token],{stdio:['ignore','pipe','pipe']});
      let out='',err='';child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>err+=b);
      const [code]=await once(child,'exit');assert.equal(code,expectedCode,err||`${out} native=${JSON.stringify(responses)}`);return JSON.parse(out);
    }
    async function native(request,version){
      const root=await harness.root(ctx);
      const submitted=await root.submit({type:'input',content:'call artifact_version then finish',requestId:request},ctx);
      const outcome=await submitted.wait(withAbortSignal(AbortSignal.timeout(10000),ctx));assert.equal(outcome.status,'done');
      observed.push(version);
      assert.equal(await readFile(effects,'utf8'),observed.map(v=>v+'\n').join(''));
      assert.ok(submitted.id !== undefined,'Native receipt must have a real id');
      return submitted;
    }
    let started,release;
    const entered=new Promise(resolve=>{started=resolve;}),gate=new Promise(resolve=>{release=resolve;});
    process.artifactGate=()=>{started();return gate;};
    const running=native('effect-before-update','v1');await entered;let first;
    try { assert.equal((await command('v2','v1')).status,'reload-returned'); }
    finally { delete process.artifactGate;release();first=await running; }
    await native('effect-after-update','v2');
    assert.equal((await command('v1','v2')).status,'reload-returned');
    await native('effect-after-rollback','v1');
    assert.equal((await command('v1','v2')).reloadSent,false);
    assert.equal(store.opened.get(session.id).harness,harness);
    assert.deepEqual({pid:process.pid,session:session.id,model:(await client.session(session.id).models()).map(m=>m.id)},identity);
    const root=await harness.root(ctx);
    const repeated=await root.submit({type:'input',content:'call artifact_version then finish',requestId:'effect-before-update'},ctx);
    assert.equal(repeated.id,first.id);
    assert.equal(await readFile(effects,'utf8'),'v1\nv2\nv1\n');
    let before=reloads;cleanupFault=true;
    assert.equal((await command('v2','v1',2)).status,'uncertain');
    await native('effect-after-cleanup-failure','v2');
    assert.equal((await command('v2','v1')).reloadSent,false);assert.equal(reloads,before+1);
    before=reloads;dropAck=true;
    assert.equal((await command('v1','v2',2)).status,'uncertain');
    await native('effect-after-lost-ack','v1');
    assert.equal((await command('v1','v2')).reloadSent,false);assert.equal(reloads,before+1);
    await command('v2','v1');
    let checkpointStarted,checkpointRelease;
    const checkpointEntered=new Promise(resolve=>{checkpointStarted=resolve;});
    const checkpointGate=new Promise(resolve=>{checkpointRelease=resolve;});
    process.artifactCheckpointGate=()=>{checkpointStarted();return checkpointGate;};
    const task=opened.profile.registry.snapshot().task('artifact.checkpoint');
    const checkpoint=await harness.commit(tx=>tx.createTask(task,{}, {conversationId:1,ownership:{kind:'conversation'},background:true}),ctx);
    await checkpointEntered;
    const registry=opened.profile.registry.snapshot();before=reloads;
    try {
      assert.equal((await command('v1','v2',2)).status,'uncertain');
      assert.equal(responses.at(-1).status,409);
      assert.match(responses.at(-1).body,/maintenance-required/);
      assert.equal(opened.profile.registry.snapshot(),registry);
      assert.equal((await readFile(f.selector,'utf8')).includes('"current": "v1"'),true);
    } finally { delete process.artifactCheckpointGate;checkpointRelease(); }
    const savedTask=await harness.waitForTask(checkpoint,withAbortSignal(AbortSignal.timeout(5000),ctx));
    assert.equal(savedTask.version,2);assert.equal(savedTask.state.outcome.status,'completed');
    await native('effect-after-incompatible-rollback','v2');
    assert.equal((await command('v1','v2')).reloadSent,false);assert.equal(reloads,before+1);
    await command('v2','v1');
    assert.equal(store.opened.get(session.id).harness,harness);
    await writeFile(join(f.root,'native-result.json'),JSON.stringify({identity,oldReceipt:first.id,repeatedReceipt:repeated.id,effects:observed,reloads,checkpoint,savedVersion:savedTask.version,incompatibleRollback:'refused-before-publication',cleanupFailure:'uncertain-no-resend',lostAck:'uncertain-no-resend',source,productionActivation:'NOT RUN'}));
  } finally { server.closeAllConnections();await new Promise(r=>server.close(r));await store.close(); }
});
