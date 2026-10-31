import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DpiClient } from 'dpi-sdk';
const root='/home/ubuntu/.local/share/pi-durable-host/releases/c0019d7-dadd5534/live-control';
const state=JSON.parse(readFileSync(join(root,'host-state.json'),'utf8'));
const probe=JSON.parse(readFileSync(join(root,'selected-copy-probe.json'),'utf8'));
const client=new DpiClient(`http://127.0.0.1:${state.port}`,state.ownerToken);
const agent=client.agent(probe.sessionId,1);const detail=await agent.get();
const docs=detail.documentKinds.filter(kind=>['bb.subagents','bb.subagent-supervisor','durable.schedules','durable-goals.native-goals'].includes(kind));
await Promise.all(['session','agent','agent-docs'].map(async kind=>{
 const start=Date.now(),signal=AbortSignal.timeout(5000),frames=[];
 const stream=kind==='session'?client.session(probe.sessionId).events(signal):agent.events(signal,kind==='agent-docs'?docs:[]);
 try {for await(const frame of stream)frames.push(frame.type==='doc'?`doc:${frame.kind}`:frame.type);}
 catch(error){frames.push(`error:${error.message}`);}
 console.log(JSON.stringify({kind,frames,elapsedMs:Date.now()-start,boundedAbort:signal.aborted}));
}));
