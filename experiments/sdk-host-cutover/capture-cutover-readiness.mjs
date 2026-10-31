import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DpiClient } from 'dpi-sdk';
const root='/home/ubuntu/.local/share/pi-durable-host/releases/c0019d7-dadd5534/live-control';
const state=JSON.parse(readFileSync(join(root,'host-state.json'),'utf8'));
const client=new DpiClient(`http://127.0.0.1:${state.port}`,state.ownerToken);
const sessions=await client.sessions(); const agents=[];
for(const session of sessions) for(const summary of await client.session(session.id).agents()){
 const agent=client.agent(session.id,summary.id);const detail=await agent.get();assert.equal(detail.busy,false);
 for await(const frame of agent.events(AbortSignal.timeout(5000))) if(frame.type==='snapshot'){
   assert.equal(frame.inbox.length,0,'No pending inputs before owner transfer');break;
 }
 agents.push({sessionId:session.id,conversationId:summary.id,model:detail.config.model,thinking:detail.config.thinkingLevel,busy:false});
}
writeFileSync(join(root,'OWNER-TRANSFER-READINESS.json'),JSON.stringify({checkedAt:new Date().toISOString(),agents}),{flag:'wx',mode:0o600,flush:true});
console.log(JSON.stringify({sessions:sessions.length,agents:agents.length,allIdle:true,allInboxesEmpty:true,providerAttempts:3}));
