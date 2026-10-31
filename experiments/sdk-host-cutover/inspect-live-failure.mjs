import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DpiClient } from 'dpi-sdk';
const root = '/home/ubuntu/.local/share/pi-durable-host/releases/c0019d7-dadd5534/live-control';
const state = JSON.parse(readFileSync(join(root, 'host-state.json'), 'utf8'));
const probe = JSON.parse(readFileSync(join(root, 'selected-copy-probe.json'), 'utf8'));
const client = new DpiClient(`http://127.0.0.1:${state.port}`, state.ownerToken);
const agent = client.agent(probe.sessionId, 1);
const detail = await agent.get();
console.log(JSON.stringify({ busy: detail.busy, config: detail.config }));
console.log(JSON.stringify((await client.session(probe.sessionId).tasks('terminal', 5)).map(task => ({ id: task.id, kind: task.kind, status: task.state.outcome?.status, error: task.state.outcome?.error?.message }))));
const signal = AbortSignal.timeout(5000);
for await (const frame of agent.events(signal)) {
  console.log(JSON.stringify({ type: frame.type, ...(frame.type === 'fault' ? { error: frame.error } : {}) }));
  if (frame.type === 'snapshot' || frame.type === 'fault') break;
}
