import assert from 'node:assert/strict';
import { readFile, writeFile, copyFile, realpath } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { runInNewContext } from 'node:vm';
import { applyPatch } from './worklet-patch.mjs';

const exec = promisify(execFile);
const root = '/home/ubuntu/.config/pi-durable-host/gippity-voice';
const installed = resolve(process.argv[2]);
const c = JSON.parse(await readFile(join(root, 'config.json'), 'utf8'));
const h = JSON.parse(await readFile('/home/ubuntu/.config/pi-durable-host/host.json', 'utf8'));
const headers = { authorization: `Bearer ${h.grants.find(g => g.id === h.ownerGrantId).token}` };
const proof = { phase: 'preflight', startedAt: new Date().toISOString(), restartRequests: 0 };
const save = () => writeFile(join(root, 'audio-latency-activation.json'), JSON.stringify(proof, null, 2) + '\n', { mode: 0o600 });
async function get(url, auth = false) {
  const response = await fetch(url, { headers: auth ? headers : undefined, signal: AbortSignal.timeout(5000) });
  assert.equal(response.status, 200);
  return response;
}
const sessions = async () => (await get(`http://127.0.0.1:${h.port}/v1/sessions`, true)).json();
const settings = async () => (await (await get(c.origin + '/api/settings')).json()).config;
const pid = async () => (await exec('systemctl', ['--user', 'show', 'pi-durable-host.service', '-p', 'MainPID', '--value'])).stdout.trim();
try {
  const before = await sessions();
  const expected = await settings();
  assert.equal(expected.v3Voice, 'sol');
  assert.equal(expected.v3AlternateVoice, 'sol');
  const settingsFile = join(h.dataDir, 'sessions', c.sessionId, 'components/gippity-voice/settings.json');
  assert.deepEqual(JSON.parse(await readFile(settingsFile, 'utf8')).voice, expected);
  const routes = (await exec('tailscale', ['serve', 'status', '--json'])).stdout;
  const pkg = await realpath(join(installed, 'node_modules/@howaboua/pi-durable-gippity-voice'));
  proof.packageDirectory = pkg;
  for (const name of ['index', 'activation']) {
    const path = join(pkg, `dist/${name}.js`);
    await copyFile(path, path + '.before-audio-latency', 1);
  }
  await applyPatch(installed);
  const bundle = await readFile(join(pkg, 'dist/index.js'), 'utf8');
  const start = bundle.indexOf('var LAN_VOICE_AUDIO_WORKLET =');
  const end = bundle.indexOf('var AUDIO_WORKLET_SOURCE =', start);
  assert.ok(start >= 0 && end > start);
  const expectedAudio = runInNewContext(bundle.slice(start, end) + '\nLAN_VOICE_AUDIO_WORKLET');
  assert.ok(expectedAudio.includes('PLAYBACK_MAX_WAIT_SECONDS = 0.06'));
  proof.phase = 'waiting-for-idle';
  await save();
  for (let i = 0; ; i++) {
    proof.busySessions = (await sessions()).filter(s => s.busy).length;
    await save();
    if (!proof.busySessions) break;
    assert.ok(i < 120, 'Host busy for ten minutes; no restart attempted');
    await delay(5000);
  }
  assert.deepEqual(await settings(), expected, 'Settings changed during wait; activation stopped');
  assert.equal((await sessions()).filter(s => s.busy).length, 0, 'New work arrived; no restart attempted');
  const old = await pid();
  proof.phase = 'restarting';
  proof.restartRequests = 1;
  await save();
  await exec('systemctl', ['--user', '--no-block', 'restart', 'pi-durable-host.service']);
  let after;
  // Wait for BOTH main authenticated API and voice API. Never repeat the restart.
  for (let i = 0; i < 330; i++) {
    await delay(2000);
    const current = await pid();
    if (current === '0' || current === old) continue;
    const ready = await Promise.all([sessions().catch(() => null), settings().catch(() => null)]);
    if (ready[0] && ready[1]) { after = ready[0]; break; }
  }
  assert.ok(after, 'Restart requested once; readiness remains uncertain; do not retry blindly');
  proof.phase = 'verifying';
  await save();
  assert.deepEqual(await settings(), expected);
  assert.deepEqual(JSON.parse(await readFile(settingsFile, 'utf8')).voice, expected);
  assert.ok(before.every(s => after.some(a => a.id === s.id)), 'Existing session missing');
  assert.ok(after.every(s => !s.error || before.some(b => b.id === s.id && b.error)), 'New session error');
  const actualAudio = await (await get(c.origin + '/_gippity/worklets/audio.js')).text();
  assert.equal(actualAudio, expectedAudio, 'Live audio module differs from tested candidate');
  assert.equal((await exec('tailscale', ['serve', 'status', '--json'])).stdout, routes);
  proof.phase = 'verified';
  proof.preservedSessions = before.length;
  proof.sessions = after.length;
  proof.sessionErrors = after.filter(s => s.error).length;
  proof.liveAudioEqualsCandidate = true;
  proof.settingsUnchanged = true;
  proof.settingsRewritten = false;
  proof.routesUnchanged = true;
  proof.deviceAudioQuality = 'NOT_VERIFIED';
} catch (error) {
  proof.failedPhase = proof.phase;
  proof.phase = 'failed';
  proof.error = error.message;
  process.exitCode = 1;
}
proof.finishedAt = new Date().toISOString();
await save();
console.log(JSON.stringify(proof));
