// Independent installed Store/Harness/HTTP/SDK + actual disposable DeLM board probe.
// Invoke via run-core.py --probe delm in Frank's sandbox, with its curated board fixture at /previous.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, mkdtemp, cp, realpath, symlink, chmod, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
assert.equal(process.env.HOME, '/scratch/home', 'Sandbox only; no live fallback');
const selfCheck = JSON.parse(await readFile('/scratch/sandbox-check.json', 'utf8'));
assert.equal(selfCheck.status, 'PASS'); assert.equal(selfCheck.child, 'PASS');
const boardSource = '/previous/scripts/delm_local.py';
assert.ok(existsSync(boardSource), 'BLOCKED: explicit curated disposable board fixture required at /previous');
const candidate = '/candidate';
const backend = `${candidate}/node_modules/dpi-backend/dist/dpi-backend/src`;
const load = name => import(pathToFileURL(`${backend}/${name}.js`).href);
const { BACKGROUND_CONTEXT: ctx, withAbortSignal } = await import('@earendil-works/chord/context');
const { InMemoryCredentialStore } = await import('@earendil-works/pi-ai');
const { fauxProvider, fauxAssistantMessage, fauxToolCall } = await import('@earendil-works/pi-ai/providers/faux');
const { Store } = await load('store');
const { createNativeProfile, createNativeModels } = await load('native-profile/profile');
const { GrantPolicy } = await load('grants');
const { createHttpServer } = await load('http-server');
const { DpiClient } = await import(pathToFileURL(`${candidate}/node_modules/dpi-sdk/dist/client.js`).href);
const { attachDelm } = await import(pathToFileURL(`${candidate}/delm-profile.mjs`).href);
const directory = await realpath(await mkdtemp('/scratch/tmp/heidi-installed-delm-'));
const boardFiles = {};
for (const entry of (await readdir('/previous',{recursive:true,withFileTypes:true})).sort((a,b)=>join(a.parentPath,a.name).localeCompare(join(b.parentPath,b.name)))) {
  assert.ok(!entry.isSymbolicLink(),'Curated board fixture must not contain symlink aliases');
  if(entry.isFile()) {
    const path = join(entry.parentPath,entry.name);
    boardFiles[relative('/previous',path)] = createHash('sha256').update(await readFile(path)).digest('hex');
  }
}
const boardFixture = {files:Object.keys(boardFiles).length,sha256:createHash('sha256').update(JSON.stringify(boardFiles)).digest('hex')};
await writeFile(join(directory,'board-source-manifest.json'),JSON.stringify(boardFiles,null,2)+'\n');
const workspace = join(directory, 'project'), run = join(directory, 'run'), engine = join(directory, 'engine');
await mkdir(workspace); await cp(`${candidate}/delm-engine`, engine, { recursive: true });
await symlink(`${candidate}/node_modules`,join(directory,'node_modules'), 'dir');
const modulePath = join(engine, 'index.js'), bindingFile = join(directory, 'bindings.json');
const source = await readFile(modulePath, 'utf8');
await chmod(modulePath,0o600); // Only the scratch copy; the manifest-checked installed engine stays read-only.
assert.ok(source.includes('Reason:'), 'Fixture instrumentation marker absent; do not guess engine patch');
const original = await import(pathToFileURL(modulePath).href);
const save = async (id, enabled = true) => writeFile(bindingFile, JSON.stringify({version:1,sessions:id ? {
  [id]: { run, actor:'alice', workspace, enabled },
} : {}}), {mode:0o600});
await save();
const env = {...process.env, PYTHONDONTWRITEBYTECODE:'1'};
execFileSync('python3', ['-B', boardSource, 'init', run, '--shared-workspace', workspace, '--n', '2', '--task', 'independent installed QA'], {env,stdio:'pipe'});
const board = spawn('python3', ['-B', boardSource, 'serve', run], {env,stdio:['ignore','pipe','pipe']});
let boardErrors = '', boardExited = false;
board.stderr.on('data', data => { boardErrors += data; });
board.once('exit', () => { boardExited = true; });
let store, server, releaseGate;
const report = {status:'FAIL',candidate,directory,boardFixture,productionActivation:'NOT RUN',
  externalBoundaries:['faux model','synthetic credential','empty MCP transport'],
  realBoundaries:['Store','Harness','SQLite','HTTP','SDK reload','native ToolTask','installed DeLM engine','disposable Python board'],checks:[]};
const deadlineContext = () => withAbortSignal(AbortSignal.timeout(15000), ctx);
const until = async predicate => {
  const deadline = Date.now() + 15000;
  while (!await predicate()) {
    if (boardExited) throw Error(`Disposable board exited: ${boardErrors}`);
    if (Date.now() > deadline) throw Error('Timed out awaiting actual disposable state transition');
    await new Promise(resolve => setTimeout(resolve, 15));
  }
};
try {
  await Promise.race([once(board.stdout,'data'), once(board,'exit').then(() => {throw Error(`Board startup failed: ${boardErrors}`);})]);
  let sequence = 0;
  const domain = args => JSON.parse(execFileSync(join(run,'bob/bin/context'), ['domain',JSON.stringify({request_id:`qa-${++sequence}`,...args})], {env,encoding:'utf8'}));
  const dependency = domain({op:'create',subject:'Завершить disposable dependency',detail:'Independent installed wait dependency',criteria:['One fixture completion']}).task;
  const claimed = domain({op:'claim',item:dependency.id,expected_revision:dependency.revision}).task;
  const selected = {provider:'heidi-delm-faux',modelId:'exact-model'};
  const credentials = new InMemoryCredentialStore();
  await credentials.modify(selected.provider, async () => ({type:'api_key',key:'SYNTHETIC_QA_ONLY'}));
  let responses = [], requests = 0;
  const options = () => {
    const faux = fauxProvider({provider:selected.provider,models:[{id:selected.modelId,contextWindow:100000,maxTokens:4096}],tokensPerSecond:100000});
    const respond = async request => {
      faux.appendResponses([respond]); requests++;
      const next = responses.shift();
      return typeof next === 'function' ? next(request) : next ?? fauxAssistantMessage('one native wake');
    };
    faux.setResponses([respond]);
    return {credentials,providers:[{...faux.provider,auth:{apiKey:{name:'fixture',resolve:async ({credential})=>({auth:{apiKey:credential.key}})}}}]};
  };
  const makeModels = () => createNativeModels(options), discovery = await makeModels();
  const owner = {id:'qa-owner',token:'SYNTHETIC_QA_OWNER',actor:'operator',source:'terminal',authority:'human',
    permissions:['read','write','control','filesystem','human-accept'],binding:{}};
  const policy = new GrantPolicy([owner]);
  const native = createNativeProfile({policy,owner:policy.authenticate(owner.token),
    models:{defaultModel:selected,catalogue:discovery.catalogue,create:makeModels},
    dcg:{binaryPath:join(directory,'missing-dcg'),envSource:()=>({})},
    connectMcp:async()=>({sources:[],close:async()=>{}}),loadAdapters:async()=>[]});
  const profile = Object.assign(async context => attachDelm(await native(context), context, {bindingFile,modulePath}), native);
  store = await Store.open({dataDir:join(directory,'data'),startDirs:[workspace],name:'Independent DeLM QA',provider:'faux',profile});
  server = createHttpServer(store,policy).listen(0,'127.0.0.1'); await once(server,'listening');
  const client = new DpiClient(`http://127.0.0.1:${server.address().port}`,owner.token);
  const session = await client.createSession({name:'Disposable DeLM',cwd:workspace,model:selected});
  const opened = store.opened.get(session.id), harness = opened.harness, root = await harness.root(ctx);
  const identity = {pid:process.pid,session:session.id,root:root.id};
  report.identityBefore = identity;
  await save(session.id);
  await client.session(session.id).reload();
  assert.ok(opened.profile.registry.snapshot().tools().some(({tool})=>tool.name==='delm_wait'));
  responses = [fauxAssistantMessage(fauxToolCall('delm_wait',{action:'wait',items:[dependency.id],reason:'retain exact pending IDs'}),{stopReason:'toolUse'}),fauxAssistantMessage('armed')];
  const armedSubmission = await root.submit({type:'input',content:'Arm the disposable wait',requestId:'heidi-delm-arm'},ctx);
  assert.equal((await armedSubmission.wait(deadlineContext())).status,'done');
  const beforeDoc = await harness.snapshot(original.DelmWaitDoc,root.id,ctx);
  assert.equal(Object.keys(beforeDoc.waits).length,1,'native ToolTask must create exactly one wait');
  const before = Object.values(beforeDoc.waits)[0];
  await until(async()=> (await harness.getTask(before.taskId,ctx)).state.status==='running');
  const requestsBefore = requests;
  report.waitBefore = before; report.modelRequestsBefore = requestsBefore;
  await writeFile(modulePath,source.replaceAll('Reason:','Reason QA_V2:').replaceAll(original.DELM_BUILD,'heidi-compatible-v2'));
  const result = await client.session(session.id).reload();
  assert.equal(requests,requestsBefore,'reload must not trigger a model turn');
  assert.equal(store.opened.get(session.id),opened); assert.equal(opened.harness,harness);
  assert.deepEqual((await harness.snapshot(original.DelmWaitDoc,root.id,ctx)).waits[before.id],before);
  report.checks.push({name:'SDK-publication-with-real-native-pending-DeLM-wait',waitBefore:before,result});
  // Hold the actual delivered model request: the wait task is allowed to finish after submitting it.
  let wakeSeen = false;
  const gate = new Promise(resolve=>{releaseGate=resolve;});
  responses = [async ()=>{wakeSeen=true;await gate;return fauxAssistantMessage('one updated native wake');}];
  domain({op:'complete',item:claimed.id,expected_revision:claimed.revision,generation:claimed.generation,summary:'One fixture completion'});
  await until(async()=> {
    assert.notEqual((await harness.snapshot(original.DelmWaitDoc,root.id,ctx)).waits[before.id].state,'failed','native delivery failed');
    return wakeSeen;
  });
  await until(async()=> (await harness.snapshot(original.DelmWaitDoc,root.id,ctx)).waits[before.id].state==='sent');
  const sent = (await harness.snapshot(original.DelmWaitDoc,root.id,ctx)).waits[before.id];
  assert.equal(sent.id,before.id); assert.equal(sent.taskId,before.taskId);
  assert.equal(sent.requestId,original.wakeRequestId(before.taskId));
  assert.equal(requests,requestsBefore+1);
  const entries = JSON.stringify((await root.entries({},100,undefined,ctx)).items);
  assert.ok(entries.includes('Reason QA_V2:'),'next native send phase must run replacement engine code');
  const receipt = await harness.commit(tx=>tx.submissionByRequest(root.id,sent.requestId),ctx);
  assert.ok(receipt,'canonical request must have a native receipt');
  releaseGate(); await root.waitForIdle(deadlineContext());
  await client.session(session.id).reload(); await root.waitForIdle(deadlineContext());
  const sameReceipt = await harness.commit(tx=>tx.submissionByRequest(root.id,sent.requestId),ctx);
  assert.equal(sameReceipt.id,receipt.id); assert.equal(requests,requestsBefore+1,'reload of sent wait must not duplicate a wake');
  report.identityAfter = {pid:process.pid,session:session.id,root:(await harness.root(ctx)).id};
  assert.deepEqual(report.identityAfter,identity);
  report.checks.push({name:'native-v2-send-one-wake-same-wait-task-request-receipt',sent,receiptId:receipt.id,modelRequests:requests});
  report.status='PASS';
} catch(error) {
  report.error = String(error?.stack ?? error);
} finally {
  releaseGate?.();
  if(server) {const closed=once(server,'close');server.close();server.closeAllConnections?.();await closed;}
  try {await store?.close();} catch(error) {report.status='FAIL';report.cleanupError=String(error);}
  if(!boardExited) {const closed=once(board,'exit');board.kill('SIGTERM');await closed;}
  await writeFile(join(directory,'result.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({status:report.status,evidence:directory,error:report.error,productionActivation:'NOT RUN'}));
}
if(report.status!=='PASS') process.exitCode=1;
