import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {BACKGROUND_CONTEXT as ctx} from '@earendil-works/chord/context';
import {InMemoryCredentialStore} from '@earendil-works/pi-ai';
import {fauxProvider,fauxAssistantMessage,fauxToolCall} from '@earendil-works/pi-ai/providers/faux';
import {Store} from '../src/store.ts';
import {SessionExecutionEnv} from '../src/session-env.ts';
import {DcgExecutionEnv} from '../src/native-profile/guards/dcg/environment.ts';
import {createNativeProfile,createNativeModels} from '../src/native-profile/profile.ts';
import {GrantPolicy} from '../src/grants.ts';
import {createHttpServer} from '../src/http-server.ts';
import {DpiClient} from '../../dpi-sdk/src/client.ts';
import {connectSessionMcp} from '../../../experiments/sdk-host-cutover/session-mcp.mjs';
import {createMcpManager} from '../../../experiments/hot-update-20261101/mcp-source/build-observer/nico.mjs';

const selected={provider:'mcp-profile-faux',modelId:'fixture'};
async function fixture(connectMcp){
  const root=await mkdtemp(join(tmpdir(),'native-mcp-profile-'));const work=join(root,'work');await mkdir(work);
  const policy=new GrantPolicy([{id:'fixture',token:'synthetic',actor:'operator',source:'terminal',authority:'human',permissions:['read','write','control','filesystem','human-accept'],binding:{}}]);
  const providers=new Map(),credentials=new InMemoryCredentialStore();
  const makeModels=id=>createNativeModels(()=>{const model=fauxProvider({provider:selected.provider,models:[{id:selected.modelId,contextWindow:128000,maxTokens:8192}],tokensPerSecond:100000});providers.set(id,model);return {credentials,providers:[model.provider]};});
  const catalogue=await makeModels('catalogue');
  const binary=join(root,'fixture-dcg');
  await writeFile(binary,`#!${process.execPath}\nlet input='';process.stdin.setEncoding('utf8');process.stdin.on('data',part=>input+=part);process.stdin.on('end',()=>process.stdout.write(JSON.stringify({schema_version:1,robot_mode:true,dcg_version:'0.15.3',command:input.slice(0,-2),decision:'allow',mode:null,reason:'synthetic fixture policy'})));\n`,{mode:0o700});
  const profile=createNativeProfile({policy,owner:policy.authenticate('synthetic'),
    models:{defaultModel:selected,catalogue:catalogue.catalogue,create:c=>makeModels(c.sessionId)},
    dcg:{binaryPath:binary,envSource:()=>({})},connectMcp});
  const store=await Store.open({dataDir:join(root,'data'),startDirs:[work],profile,provider:'faux'});
  const server=createHttpServer(store,policy).listen(0,'127.0.0.1');await once(server,'listening');
  const base=`http://127.0.0.1:${server.address().port}`,client=new DpiClient(base,'synthetic');let serial=0;
  const create=()=>client.createSession({name:'fixture',cwd:work,model:selected});
  return {store,client,policy,create,async reload(id){return client.session(id).reload();},
    async invoke(id,args={}){
      providers.get(id).setResponses([fauxAssistantMessage(fauxToolCall('mcp__fixture__echo',args),{stopReason:'toolUse'}),fauxAssistantMessage('complete')]);
      const response=await fetch(`${base}/v1/sessions/${id}/agents/main/messages`,{method:'POST',headers:{authorization:'Bearer synthetic','content-type':'application/json'},body:JSON.stringify({requestId:`mcp-${++serial}`,content:'fixture',waitMs:10000})});
      assert.equal(response.status,200,await response.text());const {c}=await store.resolveAgent(id,'main');return (await c.entries({},200,undefined,ctx)).items;
    },
    async close(){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await store.close();},
  };
}

test('actual session MCP config replaces the native catalogue and retains admitted HTTP call/task identity', {timeout:30000},async()=>{
  let calls=0,opens=0,release,started;
  const held=new Promise(resolve=>{release=resolve;}),entered=new Promise(resolve=>{started=resolve;});
  const endpoint=createServer(async(request,response)=>{
    if(request.method!=='POST'){response.writeHead(405).end();return;}
    const version=new URL(request.url,'http://fixture').searchParams.get('v');let raw='';for await(const bytes of request)raw+=bytes;
    const message=JSON.parse(raw);if(message.id===undefined){response.writeHead(202).end();return;}
    let result={};
    if(message.method==='initialize'){opens++;result={protocolVersion:'2025-03-26',capabilities:{tools:{}},serverInfo:{name:'fixture',version}};}
    if(message.method==='tools/list')result={tools:[{name:'echo',description:`fixture version ${version}`,inputSchema:{type:'object',properties:{hold:{type:'boolean'}}}}]};
    if(message.method==='tools/call'){calls++;if(message.params.arguments.hold){started();await held;}result={content:[{type:'text',text:`MCP_RESULT_${version}`}]};}
    response.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify({jsonrpc:'2.0',id:message.id,result}));
  }).listen(0,'127.0.0.1');await once(endpoint,'listening');
  const agentDir=await mkdtemp(join(tmpdir(),'staged-profile-config-'));
  const configure=version=>writeFile(join(agentDir,'mcp-adapter.json'),JSON.stringify({mcpServers:{fixture:{url:`http://127.0.0.1:${endpoint.address().port}/mcp?v=${version}`,exposure:'direct'}}}));
  await configure(1);const owners=[];
  const f=await fixture(async c=>{const owner=await connectSessionMcp(c,{agentDir,projectTrusted:false,authorize:async()=>{}});owners.push(owner);return owner;});
  try{
    const session=await f.create();const opened=f.store.opened.get(session.id),root=(await opened.harness.root(ctx)).id;
    const guard=opened.profile.registry.snapshot().extension('host.native-current-owner');
    const active=f.invoke(session.id,{hold:true});await entered;
    const before=await opened.harness.commit(tx=>tx.scanTasks({},500),ctx);
    await configure(2);
    const published=new Promise(resolve=>{const unsubscribe=opened.profile.registry.subscribe(()=>{
      if(opened.profile.registry.snapshot().tools().find(({tool})=>tool.name==='mcp__fixture__echo')?.tool.description.includes('version 2')){unsubscribe();resolve();}
    });});
    let finished=false;const pending=f.reload(session.id).then(value=>{finished=true;return value;});
    // Native publication occurs before retirement waits for the admitted HTTP call.
    await published;
    assert.equal(finished,false);release();const result=await pending;assert.equal(result.cleanup,undefined);
    assert.match(JSON.stringify(await active),/MCP_RESULT_1/);assert.match(JSON.stringify(await f.invoke(session.id)),/MCP_RESULT_2/);
    assert.equal(f.store.opened.get(session.id),opened);assert.equal((await opened.harness.root(ctx)).id,root);
    assert.equal(opened.profile.registry.snapshot().extension('host.native-current-owner'),guard);
    const after=await opened.harness.commit(tx=>tx.scanTasks({},500),ctx);
    for(const task of before.items)assert.ok(after.items.some(next=>next.id===task.id));
    for(let version=3;version<=21;version++){await configure(version);await f.reload(session.id);}
    assert.equal(owners.length,1);assert.equal(opens,21);assert.equal(calls,2);
    console.log('MCP_NATIVE_HTTP_PASS',JSON.stringify({owners:owners.length,opens,calls,replacements:20}));
  }finally{release();await f.close();endpoint.closeAllConnections();await new Promise(resolve=>endpoint.close(resolve));}
});

async function managerFixture({failClose=false,invalidInitial=false}={}){
  const state={version:0,required:false,opened:0,closed:0,discarded:0,invalidInitial};
  const spec=revision=>({name:'fixture',revision:String(revision),lifecycle:'keep-alive',createTransport:async()=>{
    state.opened++;let closed=false;return {async start(){},async send(message){
      if(message.id===undefined)return;let result={};
      if(message.method==='initialize')result={protocolVersion:'2025-03-26',capabilities:{tools:{}},serverInfo:{name:'fixture',version:String(revision)}};
      if(message.method==='tools/list')result={tools:[{name:'echo',inputSchema:{type:'object',properties:state.required?{extra:{type:'string'}}:{},...(state.required?{required:['extra']}:{})}}]};
      if(message.method==='tools/call')result={content:[{type:'text',text:`fixture-${revision}`}]};
      queueMicrotask(()=>this.onmessage?.({jsonrpc:'2.0',id:message.id,result}));
    },async close(){if(closed)return;if(failClose)throw Error('SYNTHETIC_PRIVATE_CLEANUP_SECRET');closed=true;state.closed++;this.onclose?.();}};
  }});
  let manager,serial=0,source,activeEnv={MCP_PROFILE_FIXTURE:'0'};
  const environment=version=>version===2?{}:{MCP_PROFILE_FIXTURE:String(version)};
  const sources=catalogue=>[{server:'fixture',allowedTools:['echo'],authorize:async()=>{},client:{listTools:async()=>catalogue.map(d=>d.definition),callTool:(name,args)=>manager.call(catalogue.find(d=>d.definition.name===name),args,{callId:`native-${++serial}`})}}];
  const f=await fixture(async()=>{
    manager=createMcpManager({servers:[spec(0)],authorize:async()=>{}});await manager.ready();source=sources(manager.catalog());
    return {get sources(){return source;},get shellEnv(){return activeEnv;},close:()=>manager.close(),async prepareReload(){
      const ticket=await manager.prepareReload([spec(state.version)]);const candidate=sources(ticket.catalog()),shellEnv=environment(state.version);
      return {sources:candidate,shellEnv,validate(){ticket.validate();if(state.invalidInitial)throw Error('SYNTHETIC_PRIVATE_INITIAL_SECRET');},publish(){ticket.publish();source=candidate;activeEnv=shellEnv;},discard:async()=>{state.discarded++;await ticket.discard();},drain:()=>ticket.drain()};
    }};
  });return {...f,state,manager:()=>manager};
}

test('native compatibility rejection discards actual manager candidate and preserves active registry', {timeout:15000},async()=>{
  const f=await managerFixture();try{
    const session=await f.create(),opened=f.store.opened.get(session.id),before=opened.profile.registry.snapshot();
    f.state.version=1;f.state.required=true;
    await assert.rejects(f.reload(session.id),error=>error.status===409);
    assert.equal(opened.profile.registry.snapshot(),before);assert.equal(f.state.discarded,1);assert.equal(f.state.closed,1);
    f.state.required=false;await f.reload(session.id);assert.notEqual(opened.profile.registry.snapshot(),before);
    assert.match(JSON.stringify(await f.invoke(session.id)),/fixture-1/);
  }finally{await f.close();}
});

test('failed retirement returns sanitized applied outcome and fences a third actual manager generation', {timeout:15000},async()=>{
  const f=await managerFixture({failClose:true});try{
    const session=await f.create(),opened=f.store.opened.get(session.id),before=opened.profile.registry.snapshot();
    f.state.version=1;const result=await f.reload(session.id);
    assert.equal(result.cleanup,'failed');assert.equal(result.sessionId,session.id);assert.notEqual(opened.profile.registry.snapshot(),before);
    assert.ok(!JSON.stringify(result).includes('SECRET'));assert.match(JSON.stringify(await f.invoke(session.id)),/fixture-1/);
    f.state.version=2;await assert.rejects(f.reload(session.id));assert.equal(f.state.opened,2);
  }finally{await f.close().catch(()=>{});}
});

test('published MCP shell environment changes reach the same cached guard and remove retired values', {timeout:15000},async()=>{
  const f=await managerFixture();try{
    const session=await f.create(),profile=f.store.opened.get(session.id).profile,environment=profile.env({},ctx);
    const run=async()=>{let text='';const result=await environment.exec([process.execPath,'-p','process.env.MCP_PROFILE_FIXTURE??"absent"'],{onOutput:part=>text+=part},ctx);assert.equal(result.ok,true);assert.equal(result.value.exitCode,0);return text.trim();};
    assert.equal(await run(),'0');f.state.version=1;await f.reload(session.id);
    assert.equal(profile.env({},ctx),environment);assert.equal(await run(),'1');
    f.state.version=2;await f.reload(session.id);assert.equal(await run(),'absent');
  }finally{await f.close();}
});

test('DCG admission captures the owning shell environment before waiting for evaluation', {timeout:10000},async()=>{
  const shellEnv={MCP_PROFILE_FIXTURE:'old'};let release,entered;
  const held=new Promise(resolve=>release=resolve),started=new Promise(resolve=>entered=resolve);
  const environment=new DcgExecutionEnv(new SessionExecutionEnv({cwd:tmpdir(),shellEnv}),{evaluator:{async evaluate(){entered();await held;return {kind:'allow'};},async close(){}}});
  let text='';try{
    const active=environment.exec([process.execPath,'-p','process.env.MCP_PROFILE_FIXTURE'],{onOutput:part=>text+=part},ctx);
    await started;shellEnv.MCP_PROFILE_FIXTURE='new';release();
    const result=await active;assert.equal(result.ok,true);assert.equal(result.value.exitCode,0);assert.equal(text.trim(),'old');
    text='';const next=await environment.exec([process.execPath,'-p','process.env.MCP_PROFILE_FIXTURE'],{onOutput:part=>text+=part},ctx);
    assert.equal(next.ok,true);assert.equal(next.value.exitCode,0);assert.equal(text.trim(),'new');
  }finally{release();await environment.cleanup(ctx);}
});

test('Store initial-open validation failure discards its ticket and closes the actual session owner', {timeout:15000},async()=>{
  const f=await managerFixture({invalidInitial:true});try{
    await assert.rejects(f.create(),error=>error.status===500&&!JSON.stringify(error).includes('SECRET'));
    assert.equal(f.state.discarded,1);assert.equal(f.state.opened,f.state.closed);
  }finally{await f.close();}
});
