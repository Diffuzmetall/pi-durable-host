import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
const exec = promisify(execFile);
const root = '/home/ubuntu/.config/pi-durable-host/gippity-voice';
const config = JSON.parse(await readFile(`${root}/config.json`, 'utf8'));
const host = JSON.parse(await readFile('/home/ubuntu/.config/pi-durable-host/host.json', 'utf8'));
const headers = {authorization: `Bearer ${host.grants.find(g => g.id === host.ownerGrantId).token}`};
const state = {phase: 'waiting-for-idle', startedAt: new Date().toISOString()};
const save = () => writeFile(`${root}/context-activation.json`, JSON.stringify(state, null, 2) + '\n', {mode: 0o600});
const sessions = async () => {
  const r = await fetch(`http://127.0.0.1:${host.port}/v1/sessions`, {headers, signal: AbortSignal.timeout(10000)});
  assert.equal(r.status, 200); return r.json();
};
try {
  const before = await sessions();
  await save();
  for (let i = 0; ; i++) {
    state.busySessions = (await sessions()).filter(s => s.busy).length;
    await save();
    if (!state.busySessions) break;
    assert.ok(i < 120, 'Host stayed busy for ten minutes; restart not attempted');
    await delay(5000);
  }
  const pid = async () => (await exec('systemctl', ['--user', 'show', 'pi-durable-host.service', '-p', 'MainPID', '--value'])).stdout.trim();
  const oldPid = await pid();
  assert.equal((await sessions()).filter(s => s.busy).length, 0);
  state.phase = 'restarting'; await save();
  await exec('systemctl', ['--user', '--no-block', 'restart', 'pi-durable-host.service']);
  let ready = false;
  // systemd allows 300s for stop and 300s for start; retain a 60s margin.
  for (let i = 0; i < 330; i++) {
    await delay(2000);
    const newPid = await pid();
    if (newPid === '0' || newPid === oldPid) continue;
    const active = (await exec('systemctl', ['--user', 'show', 'pi-durable-host.service', '-p', 'ActiveState', '--value'])).stdout.trim();
    if (active !== 'active') continue;
    const r = await fetch(`${config.origin}/api/settings`, {signal: AbortSignal.timeout(5000)}).catch(() => null);
    if (r?.ok) { ready = true; break; }
  }
  assert.ok(ready, 'Restart requested once, but new Host did not become ready');
  state.phase = 'saving-settings'; await save();
  const r = await fetch(`${config.origin}/api/settings`, {
    method: 'POST', headers: {origin: config.origin, 'content-type': 'application/json'},
    body: JSON.stringify({contextModel: {provider: 'openai-codex', modelId: 'gpt-6-luna'}}),
    signal: AbortSignal.timeout(15000),
  });
  assert.equal(r.status, 200, await r.text());
  const check = await fetch(`${config.origin}/api/settings`, {signal: AbortSignal.timeout(10000)});
  assert.equal(check.status, 200);
  const saved = (await check.json()).config;
  assert.deepEqual(saved.contextModel, {provider: 'openai-codex', modelId: 'gpt-6-luna'});
  assert.equal(saved.v3Voice, 'sol'); assert.equal(saved.v3AlternateVoice, 'sol');
  const after = await sessions();
  assert.ok(before.every(s => after.some(a => a.id === s.id)), 'Existing session missing');
  assert.ok(after.every(s => !s.error || before.some(b => b.id === s.id && b.error)), 'New session error');
  const live = JSON.parse(await readFile(config.statusFile, 'utf8'));
  assert.equal(live.sessionId, config.sessionId); assert.equal(live.running, true);
  state.settings = {contextModel: saved.contextModel, primaryVoice: saved.v3Voice, alternateVoice: saved.v3AlternateVoice};
  state.sessionId = live.sessionId; state.preservedSessions = before.length;
  state.phase = 'verified';
} catch (error) {
  state.failedPhase = state.phase; state.phase = 'failed'; state.error = error.message; process.exitCode = 1;
}
state.finishedAt = new Date().toISOString(); await save();
console.log(JSON.stringify(state));
