import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
process.umask(0o077);
const release = '/home/ubuntu/.local/share/pi-durable-host/releases/c0019d7-dadd5534';
const root = join(release, 'live-control');
const stage = process.argv[2];
assert(['terminal', 'selected-copy'].includes(stage));
assert(!existsSync(join(release, 'live-acceptance-ledger', `${stage}.json`)), 'STAGE_ALREADY_CONSUMED_NO_RETRY');
const state = JSON.parse(readFileSync(join(root, 'host-state.json'), 'utf8'));
const binding = JSON.parse(readFileSync(join(release, 'CANDIDATE-PATH-BINDING.json'), 'utf8'));
const recordPath = join(root, `${stage}-probe.json`);
if (!existsSync(recordPath)) {
  const expectedReply = `PI_DURABLE_${stage.replace('-', '_').toUpperCase()}_${randomUUID().slice(0, 8)}`;
  const prompt = stage === 'terminal' ? `This is a controlled Pi Durable terminal acceptance check. Do not use tools. Reply exactly: ${expectedReply}`
    : `This is a controlled continuation of this existing Pi Durable conversation. Do not use tools. In one short Russian sentence, describe the task we were working on before this message using the saved conversation history. Then on a new line write exactly: ${expectedReply}`;
  writeFileSync(recordPath, JSON.stringify({ stage, sessionId: stage === 'terminal' ? state.newSessionId : binding.before.id,
    prompt, promptSha256: createHash('sha256').update(prompt).digest('hex'), expectedReply }), { flag: 'wx', mode: 0o600 });
}
const record = JSON.parse(readFileSync(recordPath, 'utf8'));
writeFileSync(join(root, 'active-permit.next'), JSON.stringify(record), { flag: 'wx', mode: 0o600 });
renameSync(join(root, 'active-permit.next'), join(root, 'active-permit.json'));
const clientPath = join(release, 'terminal-client.json');
const client = { url: `http://127.0.0.1:${state.port}`, token: state.ownerToken };
if (existsSync(clientPath)) assert.deepEqual(JSON.parse(readFileSync(clientPath, 'utf8')), client);
else writeFileSync(clientPath, JSON.stringify(client), { flag: 'wx', mode: 0o600 });
const child = spawn(process.execPath, [join(release, 'host-bindings-v15/terminal-launcher.mjs'), '--session', record.sessionId],
  { stdio: 'inherit', cwd: stage === 'terminal' ? state.createBody.cwd : binding.cwd });
process.once('SIGTERM', () => child.kill('SIGTERM'));
const [code] = await once(child, 'exit'); process.exitCode = code ?? 1;
