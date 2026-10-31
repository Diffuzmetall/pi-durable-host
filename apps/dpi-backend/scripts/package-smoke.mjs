import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";

const backend = resolve(import.meta.dirname, "..");
const sdk = resolve(backend, "../dpi-sdk");
const root = await mkdtemp(join(tmpdir(), "dpi-packed-"));
const home = join(root, "home");
const install = join(root, "install");
const work = join(root, "work");
const artifacts = join(root, "artifacts");
await Promise.all([home, install, work, artifacts].map((path) => mkdir(path, { recursive: true })));
// No inherited auth, proxy, private profile or installed runtime environment.
const env = { PATH: process.env.PATH, HOME: home, LANG: "C.UTF-8", NO_COLOR: "1" };
const run = (command, args, cwd = install, extraEnv = {}) => {
  const result = spawnSync(command, args, { cwd, env: { ...env, ...extraEnv }, encoding: "utf8", timeout: 120_000, maxBuffer: 4 * 1024 * 1024 });
  if (result.error || result.status !== 0)
    throw Error(`${command} failed (${result.status}): ${result.error?.message ?? result.stderr.slice(-2000)}`);
  return result.stdout;
};
const pack = (cwd) => {
  const result = JSON.parse(run("npm", ["pack", "--json", "--pack-destination", artifacts], cwd));
  assert.equal(result.length, 1);
  assert.ok(result[0].files.some((file) => file.path === "LICENSE"));
  assert.ok(!result[0].files.some((file) => file.path.startsWith("node_modules/")));
  return join(artifacts, result[0].filename);
};
const sdkTarball = pack(sdk);
const backendTarball = pack(backend);
await writeFile(join(install, "package.json"), JSON.stringify({ private: true, type: "module" }));
run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", sdkTarball, backendTarball]);
const sdkRoot = join(install, "node_modules/dpi-sdk");
const backendRoot = join(install, "node_modules/dpi-backend");
const sdkPackage = JSON.parse(await readFile(join(sdkRoot, "package.json"), "utf8"));
assert.deepEqual(Object.keys(sdkPackage.dependencies ?? {}), []);
const checkClientFiles = async (path) => {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const file = join(path, entry.name);
    if (entry.isDirectory()) await checkClientFiles(file);
    else if (/\.(?:js|ts)$/.test(entry.name)) {
      const text = await readFile(file, "utf8");
      assert.ok(!/\b(?:from\s*|import\s*\(\s*)["'](?:@earendil-works\/pi-durable|node:sqlite|dpi-backend|bb-adapter|iii-adapter)/.test(text), `Client storage dependency in ${file}`);
    }
  }
};
await checkClientFiles(join(sdkRoot, "dist"));
for (const path of [sdkRoot, backendRoot]) {
  const license = await readFile(join(path, "LICENSE"), "utf8");
  assert.match(license, /MIT License/);
  assert.match(license, /Copyright \(c\) 2026 IndyDevDan/);
}
const probe = createServer();
probe.listen(0, "127.0.0.1");
await once(probe, "listening");
const port = probe.address().port;
await new Promise((resolve) => probe.close(resolve));
const base = `http://127.0.0.1:${port}`;
const token = `dpi_fixture_${randomBytes(32).toString("hex")}`;
const hostEnv = { ...env, DPI_HOME: join(home, ".dpi"), DPI_ENV_FILE: join(home, "absent.env"), DPI_PROVIDER: "faux", DPI_TOKEN: token, DPI_START_DIRS: work };
const executable = join(install, "node_modules/.bin/dpi-backend");
let child;
let logs = "";
const start = async () => {
  child = spawn(executable, ["--host", "127.0.0.1", "--port", String(port)], { cwd: install, env: hostEnv, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.on("data", (text) => { logs += text; });
  child.stderr.on("data", (text) => { logs += text; });
  for (let i = 0; i < 100; i++) {
    const response = await fetch(`${base}/healthz`).catch(() => undefined);
    if (response?.ok) return;
    if (child.exitCode !== null) throw Error(`Packed backend failed: ${logs.slice(-2000)}`);
    await delay(100);
  }
  throw Error("Packed backend startup timed out");
};
const stop = async (signal = "SIGTERM") => {
  if (child && child.exitCode === null) {
    const exited = once(child, "exit");
    child.kill(signal);
    await exited;
  }
};
try {
  await start();
  const { DpiClient } = await import(pathToFileURL(join(sdkRoot, "dist/client.js")).href);
  const client = new DpiClient(base, token);
  const device = await client.device();
  assert.equal(device.durableVersion, "1.4.0");
  assert.deepEqual(device.capabilities, ["events", "docs"]);
  assert.deepEqual(device.jobs, []);
  const recipe = join(install, "sdk-recipe.ts");
  await writeFile(recipe, `import { DpiClient } from "dpi-sdk";
const client = new DpiClient(process.env.DPI_URL!, process.env.DPI_TOKEN!);
const session = await client.createSession({name:"packed SDK",cwd:process.env.DPI_CWD!,model:{provider:"faux",modelId:"echo"}},"packed-sdk-create");
const result = await client.agent(session.id,"main").send("!printf packed-sdk-ok","followUp","packed-sdk-submit",15000);
if(result.status!=="done") throw Error("Expected terminal SDK result");
console.log(JSON.stringify({sessionId:session.id,...result}));
`);
  const recipeEnv = { DPI_URL: base, DPI_TOKEN: token, DPI_CWD: work, DPI_MODEL_PROVIDER: "faux", DPI_MODEL_ID: "echo", DPI_REQUEST_KEY: "packed-http", DPI_PROMPT: "!printf packed-http-ok" };
  const sdkResult = JSON.parse(run(process.execPath, ["--import", "tsx", recipe], install, recipeEnv));
  assert.match(sdkResult.answer.text, /packed-sdk-ok/);
  const httpResult = JSON.parse(run("sh", [join(sdkRoot, "examples/http-client.sh")], install, recipeEnv));
  assert.match(httpResult.answer, /packed-http-ok/);
  assert.notEqual(httpResult.sessionId, sdkResult.sessionId);
  // Both standalone client processes have exited; the owner and results remain.
  assert.equal((await client.session(sdkResult.sessionId).submission(sdkResult.submissionId)).status, "done");
  await stop("SIGKILL");
  await start();
  const afterRestart = await client.agent(sdkResult.sessionId, "main").send("!printf packed-sdk-ok", "followUp", "packed-sdk-submit", 1000);
  assert.equal(afterRestart.submissionId, sdkResult.submissionId);
  assert.equal(afterRestart.status, "done");
  await stop();
  const nativeRecipe = join(install, 'native-recipe.mjs');
  await writeFile(nativeRecipe, `
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {join} from 'node:path';
import {existsSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import {InMemoryCredentialStore,fauxProvider,fauxAssistantMessage} from '@earendil-works/pi-ai';
import {Store} from 'dpi-backend/store';
import {createHttpServer,GrantPolicy} from 'dpi-backend/server';
import {createNativeProfile,createNativeModels,HindsightClient,resolveConfig} from 'dpi-backend/native-profile';
import {DpiClient} from 'dpi-sdk';
const token=process.env.DPI_TOKEN;
const policy=new GrantPolicy([{id:'native-owner',token,actor:'native-owner',source:'terminal',authority:'human',permissions:['read','write','control','filesystem','human-accept'],binding:{}}]);
const profile=createNativeProfile({policy,owner:policy.authenticate(token),dcg:{binaryPath:join(process.env.DPI_HOME,'missing-dcg'),envSource:()=>({})},
  resolveSkill:async()=>{throw Error('No fixture skills');},connectMcp:async()=>({sources:[],close:async()=>{}}),
  memory:context=>{
    const cfg=resolveConfig({apiUrl:'http://127.0.0.1:1',apiToken:'fixture-disabled-memory',disabled:true,retainSessions:false,autoSeed:false,autoUpdate:false,codebaseSurvey:false,gitIngest:'none',manageBankConfig:false});
    assert.equal(cfg.disabled,true);
    const client=new HindsightClient({apiUrl:cfg.apiUrl,apiToken:cfg.apiToken,bank:context.sessionId,project:context.cwd});
    return {resolveBinding:cwd=>{assert.equal(cwd,context.cwd);return{cfg,bankId:context.sessionId};},resolveClient:()=>client,lifecycleEffects:{env:{},hasGit:()=>false}};
  }});
const options={dataDir:join(process.env.DPI_HOME,'native'),startDirs:[process.env.DPI_CWD],name:'packed-native',provider:'faux',profile};
let store=await Store.open(options);
const server=createHttpServer(store,policy).listen(0,'127.0.0.1');await once(server,'listening');
try{
  const client=new DpiClient('http://127.0.0.1:'+server.address().port,token);
  const device=await client.device();assert.ok(device.capabilities.includes('delegated-input.v1'));
  assert.deepEqual(device.models[0].supportedThinkingLevels,['off']);
  const session=await client.createSession({name:'packed native',cwd:process.env.DPI_CWD,model:{provider:'faux',modelId:'echo'}},'packed-native-create');
  const result=await client.agent(session.id,'main').send('!printf forbidden > packed-native-effect','followUp','packed-native-input',10000);
  assert.equal(result.status,'done');assert.ok(!existsSync(join(process.env.DPI_CWD,'packed-native-effect')));
  assert.match(result.answer.text,/DCG_UNAVAILABLE/);
  const response=await fetch('http://127.0.0.1:'+server.address().port+'/v1/sessions/'+session.id+'/agents/main/docs/durable.schedules',{headers:{authorization:'Bearer '+token}});
  assert.equal(response.status,200);assert.equal((await response.json()).kind,'durable.schedules');
  server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
  await store.close();store=await Store.open(options);assert.equal(store.errors.size,0);
  const {h,c}=await store.resolveAgent(session.id,'main');
  const receipt=await store.messageReceipt(store.resolveSession(session.id),c,'packed-native-input',{actor:'native-owner',source:'terminal',authority:'human',assertCurrent:()=>{}});
  assert.equal(receipt.submissionId,result.submissionId);assert.equal(receipt.status,'done');
  const reference={provider:'packed-native',modelId:'exact/packed-model'};
  const configuredModels=async()=>{
    const credentials=new InMemoryCredentialStore();await credentials.modify(reference.provider,async()=>({type:'api_key',key:'synthetic-packed-private-key'}));
    const fake=fauxProvider({provider:reference.provider,models:[{id:reference.modelId,contextWindow:65536}],tokensPerSecond:100000});
    fake.setResponses([(_context,options)=>{assert.equal(options.apiKey,'synthetic-packed-private-key');return fauxAssistantMessage('PACKED_SCOPED_OK');}]);
    return createNativeModels({credentials,providers:[{...fake.provider,auth:{apiKey:{name:'explicit packed fixture',resolve:async({credential})=>credential?.key?{auth:{apiKey:credential.key}}:undefined}}}]});
  };
  const menu=await configuredModels();
  const skillDir=join(process.env.DPI_CWD,'.pi','skills','packed');await mkdir(skillDir,{recursive:true});
  await mkdir(join(process.env.DPI_HOME,'agent'),{recursive:true});
  const skillContent='---\\nname: packed\\ndescription: Packed fixture\\n---\\nPACKED_PRIVATE_SKILL_BODY\\n';
  await writeFile(join(skillDir,'SKILL.md'),skillContent);
  const scopedProfile=createNativeProfile({policy,owner:policy.authenticate(token),models:{defaultModel:reference,catalogue:menu.catalogue,create:configuredModels},
    skills:()=>({projectRoot:process.env.DPI_CWD,homeDir:process.env.DPI_HOME,agentDir:join(process.env.DPI_HOME,'agent'),projectTrusted:true}),
    connectMcp:async()=>({sources:[],close:async()=>{}})});
  const scopedStore=await Store.open({...options,dataDir:join(process.env.DPI_HOME,'scoped-native'),profile:scopedProfile});
  const scopedServer=createHttpServer(scopedStore,policy).listen(0,'127.0.0.1');await once(scopedServer,'listening');
  try{
    const scopedClient=new DpiClient('http://127.0.0.1:'+scopedServer.address().port,token);
    assert.deepEqual((await scopedClient.device()).defaultModelRef,reference);
    const scopedSession=await scopedClient.createSession({name:'packed scoped native',cwd:process.env.DPI_CWD,model:reference},'packed-scoped-create');
    const metadata=await scopedClient.session(scopedSession.id).models();assert.equal(metadata[0].id,reference.modelId);
    assert.deepEqual(await scopedClient.agent(scopedSession.id,'main').models(),metadata);
    assert.deepEqual((await scopedClient.session(scopedSession.id).skills()).map(value=>value.name),['packed']);
    assert.equal((await scopedClient.session(scopedSession.id).skill('packed')).content,skillContent);
    const answer=await scopedClient.agent(scopedSession.id,'main').send('actual scoped packed fixture','followUp','packed-scoped-request',10000);
    assert.equal(answer.status,'done');assert.equal(answer.answer.text,'PACKED_SCOPED_OK');
    assert.ok(!JSON.stringify({metadata,answer}).includes('synthetic-packed-private-key'));
  }finally{scopedServer.closeAllConnections();await new Promise(resolve=>scopedServer.close(resolve));await scopedStore.close();}
  const transportOwner={id:'transport-owner',token,actor:'transport-owner',source:'terminal',authority:'human',permissions:['read','write','control','filesystem','human-accept'],binding:{}};
  let transportPolicy=new GrantPolicy([transportOwner]);
  const transportProfile=()=>createNativeProfile({policy:transportPolicy,owner:transportPolicy.authenticate(token),
    resolveSkill:async()=>{throw Error('No transport fixture skills');},connectMcp:async()=>({sources:[],close:async()=>{}})});
  const transportOptions={...options,dataDir:join(process.env.DPI_HOME,'transport-native')};
  let transportStore=await Store.open({...transportOptions,profile:transportProfile()});
  const transportSession=await transportStore.create({name:'packed transport',cwd:process.env.DPI_CWD,model:{provider:'faux',modelId:'echo'}});
  await transportStore.close();
  transportPolicy=new GrantPolicy([transportOwner,{id:'packed-bb',token:token+'-bb',actor:'packed-bb',source:'bb',authority:'delegated',
    permissions:['read','write','control'],binding:{sessionId:transportSession.id,conversationId:1,bb:{providerId:'packed-provider',threadId:'packed-root'}}}]);
  transportStore=await Store.open({...transportOptions,profile:transportProfile()});
  const transportServer=createHttpServer(transportStore,transportPolicy).listen(0,'127.0.0.1');await once(transportServer,'listening');
  try{
    const transportClient=new DpiClient('http://127.0.0.1:'+transportServer.address().port,token+'-bb');
    const parent=transportClient.agent(transportSession.id,'main');
    const rootBinding=await parent.bindBbThread('packed-root',{kind:'root'});
    assert.equal(rootBinding.providerId,'packed-provider');assert.equal(rootBinding.conversationId,1);
    const command={controlId:'packed-child',action:'spawn',expectedRevision:(await parent.parentControl()).revision,name:'packed-child',task:'Reply briefly without tools.'};
    const child=await parent.parentCommand(command);assert.ok(child.conversationId>1);
    assert.deepEqual(await parent.parentCommand(command),child);assert.deepEqual(await parent.parentReceipt(command.controlId),child);
    const bindingCommand={kind:'child',target:{key:child.childKey,conversationId:child.conversationId,executionId:child.executionId,requestId:child.requestId}};
    const childBinding=await parent.bindBbThread('packed-child',bindingCommand);
    assert.equal(childBinding.conversationId,child.conversationId);assert.equal(childBinding.parentThreadId,'packed-root');
    assert.deepEqual(await parent.bbBinding('packed-child'),childBinding);
    assert.equal((await parent.parentControl(bindingCommand.target)).parentId,1);
    let outcome;
    for(let i=0;i<80;i++){outcome=await parent.bbOutcome('packed-child');if(outcome.status==='completed')break;await new Promise(resolve=>setTimeout(resolve,25));}
    assert.equal(outcome.status,'completed');assert.equal(outcome.conversationId,child.conversationId);
    assert.equal(outcome.requestId,child.requestId);assert.ok(outcome.entries.some(entry=>entry.id===outcome.answer));
    const outcomeAbort=new AbortController();const outcomeStream=parent.bbOutcomes('packed-child',outcomeAbort.signal);
    const observed=await outcomeStream.next();assert.equal(observed.value.status,'completed');outcomeAbort.abort();await outcomeStream.return();
    const sendCommand={action:'send',controlId:'bb-child:packed-native-input',target:bindingCommand.target,task:'Packed Core admission input.',expectedRevision:(await parent.parentControl(bindingCommand.target)).revision};
    const sent=await parent.parentCommand(sendCommand);assert.equal(sent.requestId,sendCommand.controlId);
    assert.deepEqual(sent.retryContext,{expectedRevision:sendCommand.expectedRevision,target:sendCommand.target});
    const recovered=await parent.parentReceipt(sendCommand.controlId);
    assert.deepEqual(await parent.parentCommand({action:'send',controlId:sendCommand.controlId,task:sendCommand.task,...recovered.retryContext}),sent);
    for(let i=0;i<80;i++){outcome=await parent.bbOutcome('packed-child');if(outcome.status==='completed'&&outcome.requestId===sent.requestId)break;await new Promise(resolve=>setTimeout(resolve,25));}
    assert.equal(outcome.status,'completed');assert.equal(outcome.requestId,'bb-child:packed-native-input');
    assert.deepEqual(await parent.bindBbThread('packed-child',bindingCommand),childBinding);
    assert.deepEqual(await parent.reconcileParent(),{reconciled:true});
  }finally{transportServer.closeAllConnections();await new Promise(resolve=>transportServer.close(resolve));await transportStore.close();}
  const iiiSpec={id:'packed-iii',token:token+'-iii',actor:'verified-packed-worker',source:'iii',authority:'delegated',permissions:['read','write','control'],
    binding:{sessionId:transportSession.id,conversationId:1,iii:{bindingId:'packed-iii-binding',namespace:'durable-pi-test-package',configHash:'c'.repeat(64),workerId:'verified-packed-worker'}}};
  const iiiPolicy=new GrantPolicy([transportOwner,iiiSpec]);
  const iiiProfile=()=>createNativeProfile({policy:iiiPolicy,owner:iiiPolicy.authenticate(token),connectMcp:async()=>({sources:[],close:async()=>{}})});
  let iiiStore=await Store.open({...transportOptions,profile:iiiProfile()});
  let iiiServer=createHttpServer(iiiStore,iiiPolicy).listen(0,'127.0.0.1');await once(iiiServer,'listening');
  try{
    let iii=new DpiClient('http://127.0.0.1:'+iiiServer.address().port,iiiSpec.token).agent(transportSession.id,1);
    const info=await iii.iiiInfo();assert.equal(info.sessionId,'packed-iii-binding');assert.equal(info.workerId,'verified-packed-worker');assert.equal(info.authority,'delegated');
    const intent={requestId:'packed-iii-request',content:'Immutable packed native iii answer'};
    const accepted=await iii.iiiSubmit(intent);assert.ok(accepted.conversationId>1);
    let receipt;for(let i=0;i<100;i++){receipt=await iii.iiiRequest(intent.requestId);if(receipt.receipt.status==='done')break;await new Promise(resolve=>setTimeout(resolve,25));}
    assert.equal(receipt.receipt.status,'done');assert.ok(receipt.result.includes('Immutable packed native iii answer'));
    const query={requestId:intent.requestId,answerRef:receipt.resultInfo.answerRef,limit:5};
    const page=await iii.iiiResult(query);assert.equal(page.sha256,receipt.resultInfo.sha256);assert.equal(page.answerRef,receipt.resultInfo.answerRef);
    const state=await iii.iiiControl('controls::inspect',{target:{binding:info.sessionId,session:info.sessionId,type:'conversation',conversationId:accepted.conversationId}});assert.match(state.revision,/^[a-f0-9]{64}$/);
    const stopped=await iii.iiiJobStop({jobId:accepted.jobId,controlId:'packed-iii-stop',expectedGeneration:0});assert.equal(stopped.stopped,true);
    iiiServer.closeAllConnections();await new Promise(resolve=>iiiServer.close(resolve));await iiiStore.close();
    iiiStore=await Store.open({...transportOptions,profile:iiiProfile()});iiiServer=createHttpServer(iiiStore,iiiPolicy).listen(0,'127.0.0.1');await once(iiiServer,'listening');
    iii=new DpiClient('http://127.0.0.1:'+iiiServer.address().port,iiiSpec.token).agent(transportSession.id,1);
    assert.deepEqual(await iii.iiiSubmit(intent),receipt);assert.equal((await iii.iiiResult(query)).sha256,page.sha256);assert.deepEqual(await iii.iiiJobStopReceipt('packed-iii-stop'),stopped);
  }finally{iiiServer.closeAllConnections();await new Promise(resolve=>iiiServer.close(resolve));await iiiStore.close();}
  console.log(JSON.stringify({status:'PASS',profile:profile.id,nativeSubmissionId:result.submissionId,memory:'explicit-disabled-bind',guard:'fail-closed',scopedModelsSkills:'PASS',nativeTransport:'PASS',nativeOutcome:'PASS',nativeIii:'PASS',closure:'public-installed-package'}));
}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await store.close();}
`);
  const nativeResult = JSON.parse(run(process.execPath, [nativeRecipe], install, { DPI_TOKEN: token, DPI_HOME: home, DPI_CWD: work }));
  assert.equal(nativeResult.status, 'PASS');
  assert.equal(nativeResult.profile, 'native@1');
  assert.equal(nativeResult.scopedModelsSkills, 'PASS');
  assert.equal(nativeResult.nativeTransport, 'PASS');
  assert.equal(nativeResult.nativeOutcome, 'PASS');
  assert.equal(nativeResult.nativeIii, 'PASS');
  assert.ok(!logs.includes(token));
  assert.ok(!logs.includes("/home/ubuntu/Projects/master"));
  console.log(JSON.stringify({ status: "PASS", root, sdkTarball, backendTarball, defaultProfile: "minimal@1", durable: "1.4.0", sdkRuntimeDependencies: Object.keys(sdkPackage.dependencies ?? {}), cases: ["clean-home-install", "sdk-client-tool", "http-curl-tool", "client-exit-keeps-owner", "sigkill-retry-same-native-id", "installed-native-profile", "native-disabled-memory-original-storage-bind", "native-fail-closed-dcg", "native-profile-reopen-receipt", "installed-session-models-auth", "installed-native-agent-models", "installed-native-skills-sdk-body", "installed-native-parent-control", "installed-native-bb-binding", "installed-native-coherent-outcome-target", "installed-native-iii-jobs-immutable-result-reopen", "MIT-notices"] }));
} finally {
  await stop();
  await writeFile(join(root, "backend.log"), logs);
}
