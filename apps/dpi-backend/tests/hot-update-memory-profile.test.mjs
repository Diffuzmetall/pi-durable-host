import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {once} from 'node:events';
import {createServer} from 'node:http';
import {BACKGROUND_CONTEXT as ctx, withAbortSignal} from '@earendil-works/chord/context';
import {createModels} from '@earendil-works/pi-ai/models';
import {fauxProvider, fauxAssistantMessage} from '@earendil-works/pi-ai/providers/faux';
import {Harness} from '@earendil-works/pi-durable';
import {NodeExecutionEnv} from '@earendil-works/pi-durable/env/node';
import {openNodeSqliteStorage} from '@earendil-works/pi-durable/storage/sqlite/node';
import {reloadDurable} from '@local/pi-durable-reload';
import {createNativeProfile} from '../src/native-profile/profile.ts';
import {GrantPolicy} from '../src/grants.ts';
import {HindsightClient, resolveConfig} from '../src/native-profile/memory/session-memory.mjs';
import {ContextState} from '../src/native-profile/memory/hindsight/extension.mjs';

test('full profile automatically replaces memory with stable session logs, delivery and authority', {timeout:30000}, async()=>{
  const directory=await mkdtemp(join(tmpdir(),'profile-memory-')), calls=[], sessions=[];
  const endpoint=createServer(async(request,response)=>{
    let raw=''; for await(const bytes of request)raw+=bytes;
    const match=request.url.match(/^\/v1\/default\/banks\/([^/]+)(.*)$/);
    if(!match){response.writeHead(404);response.end('{}');return;}
    const bank=decodeURIComponent(match[1]),body=raw?JSON.parse(raw):undefined;
    assert.equal(request.headers.authorization,`Bearer synthetic-${bank}`);
    calls.push({bank,path:match[2],body}); response.setHeader('content-type','application/json');
    response.end(JSON.stringify(match[2]==='/memories/recall'?{results:[{text:`RECALL_${bank}_ONLY`}]}:{}));
  }).listen(0,'127.0.0.1'); await once(endpoint,'listening');
  const base=`http://127.0.0.1:${endpoint.address().port}`;
  async function open(label){
    const work=join(directory,label,'work'),state=join(directory,label,'state');await mkdir(work,{recursive:true});
    const policy=new GrantPolicy([{id:label,token:`synthetic-${label}`,actor:'operator',source:'terminal',authority:'human',permissions:['read','write','control'],binding:{}}]);
    const owner=policy.authenticate(`synthetic-${label}`);
    const cfg=resolveConfig({apiUrl:base,apiToken:`synthetic-${label}`,serverMode:'remote',autoInject:'recall',retainSessions:false,
      autoSeed:false,autoUpdate:false,codebaseSurvey:false,gitIngest:'none',manageBankConfig:false});
    const client=new HindsightClient({apiUrl:base,apiToken:cfg.apiToken,bank:label,project:work});
    const profile=await createNativeProfile({policy,owner,connectMcp:async()=>({sources:[],close:async()=>{}}),
      memory:async()=>({resolveBinding:cwd=>{assert.equal(cwd,work);return {cfg,bankId:label};},resolveClient:()=>client,lifecycleEffects:{env:{},hasGit:()=>false}}),
    })({sessionId:label,cwd:work,directory:state});
    const models=createModels(),provider=fauxProvider({provider:`profile-${label}`,models:[{id:'fixture'}],tokensPerSecond:100000});models.setProvider(provider.provider);
    const storage=await openNodeSqliteStorage(join(state,'native.sqlite'));
    const host=await Harness.open(storage,{registry:profile.registry,models,env:()=>new NodeExecutionEnv({cwd:work})},ctx);
    let subscriptions=0;const subscribe=host.subscribeCommits.bind(host);
    host.subscribeCommits=(...args)=>{subscriptions++;const unsubscribe=subscribe(...args);return()=>{subscriptions--;unsubscribe();};};
    await profile.bind(host,ctx,storage);
    let conversation=await host.root(ctx,{agent:{cwd:work,model:{provider:`profile-${label}`,modelId:'fixture'}}});host.resume();
    const delivery=profile.registry.snapshot().extension('hindsight.delivery');
    const value={profile,host,delivery,subscriptions:()=>subscriptions,
      async run(marker){
        provider.setResponses([fauxAssistantMessage(`ANSWER_${label}`)]);
        await profile.admitInput(conversation,marker,ctx);
        const submission=await conversation.submit({type:'input',content:marker,requestId:marker,whenBusy:'followUp'},ctx);
        assert.equal((await submission.wait(withAbortSignal(AbortSignal.timeout(5000),ctx))).status,'done');
        assert.ok(calls.some(call=>call.bank===label&&call.path==='/memories/recall'&&call.body.query.includes(marker)),marker);
      },
      reload:replacements=>reloadDurable({harness:host,context:ctx,assertCurrent(){},prepareExtensions:()=>profile.prepareReload([],replacements)}),
      async fork(){const entries=await conversation.entries({},200,undefined,ctx);conversation=await conversation.fork(entries.items.at(-1).id,{ownership:{kind:'ownerless'}},ctx);},
      async close(){await profile.shutdown(ctx);await host.close(ctx);await profile.cleanup(ctx);},
    };sessions.push(value);return value;
  }
  try{
    const a=await open('A'),b=await open('B');await a.run('BEFORE_A');await b.run('BEFORE_B');
    const aSubscriptions=a.subscriptions(),bSubscriptions=b.subscriptions();assert.ok(aSubscriptions>0);
    const original=a.profile.registry.snapshot().extension('hindsight'),guard=a.profile.registry.snapshot().extension('host.native-current-owner');
    for(let index=0;index<20;index++)await a.reload();
    assert.notEqual(a.profile.registry.snapshot().extension('hindsight'),original);
    assert.equal(a.profile.registry.snapshot().extension('hindsight.delivery'),a.delivery);
    assert.equal(a.profile.registry.snapshot().extension('host.native-current-owner'),guard);
    assert.equal(a.subscriptions(),aSubscriptions);assert.equal(b.subscriptions(),bSubscriptions);
    await a.fork();await a.run('AFTER_RELOAD_A');
    const explicit={...a.profile.registry.snapshot().extension('hindsight')};
    await a.reload([{extension:explicit,documents:[ContextState.definition]}]);
    assert.equal(a.profile.registry.snapshot().extension('hindsight'),explicit,'explicit replacement wins over automatic memory');
    const before=a.profile.registry.snapshot();
    await assert.rejects(a.reload([{extension:{...a.delivery},documents:[]}]),/NATIVE_HANDLER_REPLACEMENT_DENIED/);
    assert.equal(a.profile.registry.snapshot(),before);
    await a.close();sessions.splice(sessions.indexOf(a),1);assert.equal(a.subscriptions(),0);
    assert.equal(b.subscriptions(),bSubscriptions);await b.reload();await b.fork();await b.run('B_AFTER_A_CLOSE');
    const aLog=await readFile(join(directory,'A','state','memory','memory.log'),'utf8');
    const bLog=await readFile(join(directory,'B','state','memory','memory.log'),'utf8');
    assert.ok(aLog.length>0);assert.ok(bLog.length>0);
    assert.ok(calls.every(call=>!JSON.stringify(call.body??null).includes(call.bank==='A'?'BEFORE_B':'BEFORE_A')));
    console.log('MEMORY_PROFILE_RELOAD_PASS',JSON.stringify({replacements:21,aSubscriptions,bSubscriptions,bAliveAfterAClose:true}));
  }finally{
    for(const session of sessions)await session.close();
    endpoint.closeAllConnections();await new Promise(resolve=>endpoint.close(resolve));
  }
});
