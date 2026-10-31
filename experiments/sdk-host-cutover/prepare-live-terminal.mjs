import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { DpiClient } from 'dpi-sdk';
import { provisionNewSessionMail } from '../host-bindings-v14/provision-session-mail.mjs';

const release = '/home/ubuntu/.local/share/pi-durable-host/releases/c0019d7-dadd5534';
const state = JSON.parse(readFileSync(join(release, 'live-control/host-state.json'), 'utf8'));
const binding = JSON.parse(readFileSync(join(release, 'CANDIDATE-PATH-BINDING.json'), 'utf8'));
assert(state.newSessionId && state.newSessionId !== binding.before.id);
if (process.argv[2] === 'inspect') {
  const client = new DpiClient(`http://127.0.0.1:${state.port}`, state.ownerToken);
  for (const [label, id] of [['selected', binding.before.id], ['new', state.newSessionId]]) {
    const detail = await client.agent(id, 1).get();
    const page = await client.agent(id, 1).entries({ limit: 500 });
    console.log(JSON.stringify({ label, fields: Object.keys(detail), tools: detail.tools.map(tool => tool.name), pageFields: Object.keys(page), counts: Object.fromEntries(Object.entries(page).filter(([,value]) => Array.isArray(value)).map(([key,value]) => [key,value.length])) }));
  }
} else {
  assert.equal(process.argv[2], 'provision');
  const result = await provisionNewSessionMail({ cwd: state.createBody.cwd, directory: join(binding.dataDir, 'sessions', state.newSessionId),
    agentDir: process.env.PI_CODING_AGENT_DIR || join(homedir(), '.pi/agent'), stage: 'terminal' });
  writeFileSync(join(release, 'live-control/mail-provision-result.json'), JSON.stringify(result), { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify(result));
}
