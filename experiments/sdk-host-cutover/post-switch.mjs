import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, readdirSync, readlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { DpiClient } from 'dpi-sdk';
const home=homedir(),configDir=join(home,'.config/pi-durable-host');
const release=join(home,'.local/share/pi-durable-host/releases/c0019d7-sse1');
const old=join(home,'.local/share/pi-durable-host/releases/c0019d7-dadd5534');
const config=JSON.parse(readFileSync(join(configDir,'host.json'),'utf8'));
const client=new DpiClient(`http://127.0.0.1:${config.port}`,config.grants.find(grant=>grant.id===config.ownerGrantId).token);
const ownerPid=Number(execFileSync('systemctl',['--user','show','pi-durable-host.service','--property=MainPID','--value'],{encoding:'utf8'}).trim());
const panes=[60443074756610,60447369723906],clients=[];
for(const pane of panes){
 const processInfo=execFileSync('tern',['process',String(pane)],{encoding:'utf8'});
 assert(processInfo.includes(join(release,'host-bindings-v16/terminal-launcher.mjs')));
 const launcherPid=Number(processInfo.match(/^program\s+(\d+)\s/m)[1]);
 const children=readFileSync(`/proc/${launcherPid}/task/${launcherPid}/children`,'utf8').trim().split(/\s+/).filter(Boolean).map(Number);
 const actual=children.map(pid=>({pid,args:readFileSync(`/proc/${pid}/cmdline`,'utf8').split('\0').filter(Boolean)}))
   .filter(child=>child.args[1]===join(release,'node_modules/dpi-terminal-adapter/dist/main.js'));
 assert.equal(actual.length,1,'Exactly one SDK TUI child per launcher');
 const {pid,args}=actual[0];
 assert.equal(new URL(args[2]).port,String(config.port));
 for(const fd of readdirSync(`/proc/${pid}/fd`)){
  let target;try{target=readlinkSync(`/proc/${pid}/fd/${fd}`);}catch(error){if(error.code==='ENOENT')continue;throw error;}
  assert(!/\.sqlite(?:-wal|-shm)?$/.test(target),'Terminal must not own SQLite');
 }
 const screen=execFileSync('tern',['capture',String(pane)],{encoding:'utf8'});
 assert(!/reconnecting|stale projection|startup refused/.test(screen));
 clients.push({pane,pid,sessionId:args[3]});
}
const selected=JSON.parse(readFileSync(join(old,'live-control/selected-copy-probe.json'),'utf8'));
assert.equal(clients[1].sessionId,selected.sessionId);
const before=JSON.parse(readFileSync(join(old,'live-control/OWNER-TRANSFER-READINESS.json'),'utf8'));
assert(!before.agents.some(agent=>agent.sessionId===clients[0].sessionId));
const fresh=client.agent(clients[0].sessionId,1);const detail=await fresh.get();
assert.equal(detail.busy,false);assert.deepEqual(detail.config.model,{provider:'openai-codex',modelId:'gpt-6.1-sol'});
const entries=await fresh.entries({scope:'all',limit:500});
assert(!entries.items.some(entry=>entry.model?.some(message=>message.role==='user'||message.role==='assistant')),'No unapproved post-switch model prompt or answer');
assert.equal(Number(readFileSync(join(config.dataDir,'catalog.sqlite.lock'),'utf8')),ownerPid);
let locks=1;
for(const name of readdirSync(join(config.dataDir,'sessions'))){
 const lock=join(config.dataDir,'sessions',name,'agent.sqlite.lock');
 assert.equal(Number(readFileSync(lock,'utf8')),ownerPid);locks++;
}
assert.equal(locks,4);assert.equal((await client.sessions()).length,3);
assert.equal(readdirSync(join(old,'live-acceptance-ledger')).filter(name=>name.endsWith('.json')).length,3);
const result={passed:true,checkedAt:new Date().toISOString(),hostPid:ownerPid,sqliteOwnerLocks:locks,clients,
 newSessionThroughDefaultLauncher:true,selectedCopyThroughContinue:true,noStaleProjection:true,clientSqliteDescriptors:0,
 additionalModelPrompts:0,providerReservations:3};
writeFileSync(join(configDir,'POST-SWITCH.json'),JSON.stringify(result,null,2),{flag:'wx',mode:0o600,flush:true});
console.log(JSON.stringify({passed:true,sdkClients:2,oneHostOwner:true,sqliteOwnerLocks:locks,newSession:true,selectedContinuation:true,staleProjection:false,additionalModelCalls:0}));
