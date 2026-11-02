import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { applyPatch } from './worklet-patch.mjs';

// Explicit one-shot operational action, not part of npm test or postinstall.
// Wait outside the Host's process group so this conversation can finish first.
process.umask(0o077);
const exec = promisify(execFile);
const root = '/home/ubuntu/.config/pi-durable-host/gippity-voice';
const install = '/home/ubuntu/.local/share/pi-durable-host/extensions/gippity-voice/0.1.0';
const config = JSON.parse(await readFile(`${root}/config.json`, 'utf8'));
const host = JSON.parse(await readFile('/home/ubuntu/.config/pi-durable-host/host.json', 'utf8'));
const headers = { authorization: `Bearer ${host.grants.find(g => g.id === host.ownerGrantId).token}` };
const state = { phase: 'waiting-for-idle', startedAt: new Date().toISOString() };
const save = () => writeFile(`${root}/worklets-fix.json`, JSON.stringify(state, null, 2) + '\n', { mode: 0o600 });
const sessions = async () => {
  const r = await fetch(`http://127.0.0.1:${host.port}/v1/sessions`, { headers, signal: AbortSignal.timeout(10000) });
  assert.equal(r.status, 200);
  return r.json();
};
const routes = async () => JSON.parse((await exec('tailscale', ['serve', 'status', '--json'])).stdout);
const get = async path => {
  const r = await fetch(config.origin + path, { signal: AbortSignal.timeout(15000) });
  assert.equal(r.status, 200, `${path}: HTTP ${r.status}`);
  return { text: await r.text(), csp: r.headers.get('content-security-policy'), type: r.headers.get('content-type') };
};
try {
  const before = await sessions();
  const previousErrors = new Set(before.filter(s => s.error).map(s => s.id));
  const routeSnapshot = await routes();
  const csp = (await get('/')).csp;
  assert.ok(csp?.includes("script-src 'self' 'unsafe-inline';"));
  assert.ok(!csp.includes('unsafe-eval'));
  await save();
  for (let i = 0; ; i++) {
    const busy = (await sessions()).filter(s => s.busy);
    state.busySessions = busy.length; await save();
    if (!busy.length) break;
    if (i >= 120) throw Error('Host stayed busy for 10 minutes; no patch or restart performed');
    await delay(5000);
  }
  // All anchors and backups validated before either bundle is changed.
  await applyPatch(install);
  state.phase = 'patched'; await save();
  assert.equal((await sessions()).filter(s => s.busy).length, 0, 'New request arrived; restart refused');
  state.phase = 'restarting'; await save();
  // No retry: timeout is an uncertain systemd job, not a cancelled restart.
  await exec('systemctl', ['--user', 'restart', 'pi-durable-host.service'], { timeout: 660000 });
  state.phase = 'verifying'; await save();
  const page = await get('/'); assert.equal(page.csp, csp);
  const client = await get('/_gippity/client.js');
  assert.doesNotMatch(client.text, /URL.createObjectURL|revokeObjectURL/);
  const bundle = await readFile(`${install}/node_modules/@howaboua/pi-durable-gippity-voice/dist/activation.js`, 'utf8');
  const start = bundle.indexOf('var LAN_VOICE_AUDIO_WORKLET =');
  const end = bundle.indexOf('var AUDIO_WORKLET_SOURCE =', start);
  const worklets = runInNewContext(bundle.slice(start, end) + '\n({audio:LAN_VOICE_AUDIO_WORKLET,microphone:LAN_VOICE_MICROPHONE_BUFFER_WORKLET})');
  state.resources = [];
  for (const name of ['audio', 'microphone']) {
    const path = `/_gippity/worklets/${name}.js`;
    assert.ok(client.text.includes(path));
    const module = await get(path);
    assert.match(module.type, /^text\/javascript/);
    assert.equal(module.text, worklets[name]);
    state.resources.push({ path, sha256: createHash('sha256').update(module.text).digest('hex') });
    const denied = await fetch(config.origin + path, { headers: { origin: 'https://attacker.example' } });
    assert.equal(denied.status, 403);
  }
  const session = `gippity-fixed-worklets-${process.pid}`;
  const browser = async (...args) => {
    const { stdout } = await exec('agent-browser', ['--session', session, '--json', ...args], { timeout: 30000 });
    const result = JSON.parse(stdout); assert.equal(result.success, true, stdout); return result.data;
  };
  try {
    await browser('open', config.origin);
    state.browser = (await browser('eval', `(async () => {
      const results = [];
      for (const [name, processor] of [['audio','pi-lan-voice'],['microphone','pi-lan-microphone-buffer']]) {
        const context = new AudioContext();
        try {
          await context.audioWorklet.addModule('/_gippity/worklets/' + name + '.js');
          const node = new AudioWorkletNode(context, processor);
          node.disconnect(); results.push({name, registered:true});
        } finally { await context.close(); }
      }
      return {results, secure:isSecureContext, userAgent:navigator.userAgent};
    })()`)).result;
    assert.equal(state.browser.secure, true);
    assert.equal(state.browser.results.length, 2);
    assert.ok(state.browser.results.every(x => x.registered));
  } finally { await browser('close'); }
  const after = await sessions();
  assert.ok(before.every(s => after.some(a => a.id === s.id)), 'Existing session missing');
  assert.ok(after.every(s => !s.error || previousErrors.has(s.id)), 'New session error');
  assert.deepEqual(await routes(), routeSnapshot);
  state.preservedSessions = before.length;
  state.routesUnchanged = true;
  state.cspUnchanged = true;
  state.physicalMicrophone = 'not tested; no microphone, transcription or input submission used';
  state.phase = 'verified';
} catch (error) {
  state.failedPhase = state.phase;
  state.phase = 'failed'; state.error = error.message;
  process.exitCode = 1;
}
state.finishedAt = new Date().toISOString();
await save();
console.log(JSON.stringify(state));
