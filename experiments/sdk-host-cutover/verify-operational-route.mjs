import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createPrivateKey, createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
const release=join(homedir(),'.local/share/pi-durable-host/releases/c0019d7-sse1');
const { DpiClient } = await import(pathToFileURL(join(release,'node_modules/dpi-sdk/dist/client.js')));
const { registerWorker } = await import(pathToFileURL(join(release,'node_modules/iii-sdk/dist/index.mjs')));
const { signed } = await import(pathToFileURL(join(release,'node_modules/dpi-iii-adapter/dist/auth.js')));
const configDir=join(homedir(),'.config/pi-durable-host');
const old=join(homedir(),'.local/share/pi-durable-host/releases/c0019d7-dadd5534');
const host=JSON.parse(readFileSync(join(configDir,'host.json'),'utf8'));
const owner=host.grants.find(grant=>grant.id===host.ownerGrantId);
const client=new DpiClient(`http://127.0.0.1:${host.port}`,owner.token);
const readiness=JSON.parse(readFileSync(join(old,'live-control/OWNER-TRANSFER-READINESS.json'),'utf8'));
for(const saved of readiness.agents){
 const agent=client.agent(saved.sessionId,saved.conversationId);const detail=await agent.get();
 assert.equal(detail.busy,false);assert.deepEqual(detail.config.model,saved.model);assert.equal(detail.config.thinkingLevel,saved.thinking);
 const names=new Set(detail.tools.map(tool=>tool.name));
 if(saved.conversationId===1) for(const name of ['read','write','edit','bash','codemode','mcp_status'])assert(names.has(name),`Native tool missing: ${name}`);
}
const selected=JSON.parse(readFileSync(join(old,'live-control/selected-copy-probe.json'),'utf8'));
const docs=['bb.subagents','bb.subagent-supervisor','durable.schedules','durable-goals.native-goals'];const seen=new Set();let snapshotBytes=0;
for await(const frame of client.agent(selected.sessionId,1).events(AbortSignal.timeout(15000),docs)){
 if(frame.type==='snapshot')snapshotBytes=Buffer.byteLength(JSON.stringify(frame));
 if(frame.type==='doc'){seen.add(frame.kind);if(seen.size===docs.length)break;}
}
assert(snapshotBytes>2_000_000);assert.equal(seen.size,4);
const config=JSON.parse(readFileSync(join(configDir,'iii-worker.json'),'utf8'));const key=createPrivateKey(readFileSync(join(configDir,'iii-private.pem')));
const probe=JSON.parse(readFileSync(join(old,'live-control/iii-probe.json'),'utf8'));
const previous=JSON.parse(readFileSync(join(old,'live-control/iii-transport-RESULT.json'),'utf8'));
const caller=registerWorker(config.url,{namespace:config.namespace,workerName:'cutover-readonly-verifier',otel:{enabled:false},enableMetricsReporting:false});
const call=(operation,payload)=>{const functionId=`durable-pi::${operation}`;return caller.trigger({namespace:config.namespace,function_id:functionId,payload:signed(key,config.sessionId,functionId,payload)});};
try{
 const info=await call('info',{});assert.equal(info.authority,'delegated');assert.equal(info.nativeSessionId,config.host.sessionId);
 const request=await call('requests::get',{requestId:probe.requestId});assert.equal(request.receipt.status,'done');assert.equal(request.resultInfo.sha256,previous.answerSha256);
 let answer='',cursor;do{const page=await call('requests::result',{requestId:probe.requestId,answerRef:request.resultInfo.answerRef,limit:4096,...(cursor?{cursor}:{})});answer+=page.text;cursor=page.cursor;}while(cursor!==null);
 assert.equal(createHash('sha256').update(answer).digest('hex'),previous.answerSha256);
}finally{await caller.shutdown();}
const result={passed:true,checkedAt:new Date().toISOString(),preservedAgents:readiness.agents.length,savedModelsAndThinkingPreserved:true,
 nativeRootToolsPresent:true,largeSnapshotBytes:snapshotBytes,optionalDocuments:seen.size,signedIiiRetainedAnswerAfterRestart:true,modelCallsMade:0};
writeFileSync(process.argv[2] ?? join(configDir,'OPERATIONAL-VERIFY.json'),JSON.stringify(result,null,2),{flag:'wx',mode:0o600,flush:true});console.log(JSON.stringify(result));
