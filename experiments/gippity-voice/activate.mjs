import { readFile, writeFile, rename } from 'node:fs/promises';
import { execFileSync, spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

process.umask(0o077);
const root = '/home/ubuntu/.config/pi-durable-host/gippity-voice';
const config = JSON.parse(await readFile(`${root}/config.json`, 'utf8'));
const host = JSON.parse(await readFile('/home/ubuntu/.config/pi-durable-host/host.json', 'utf8'));
const token = host.grants.find(g => g.id === host.ownerGrantId).token;
const install = '/home/ubuntu/.local/share/pi-durable-host/extensions/gippity-voice/0.1.0';
const override = '/home/ubuntu/.config/systemd/user/pi-durable-host.service.d/zz-gippity-voice.conf';
const state = { startedAt: new Date().toISOString(), phase: 'waiting-for-idle' };
const save = () => writeFile(`${root}/activation.json`, JSON.stringify(state, null, 2) + '\n', { mode: 0o600 });
// restart joins both stop (300s) and start (300s), plus a bounded margin.
const systemctl = (...args) => execFileSync('systemctl', ['--user', ...args], { encoding: 'utf8', timeout: 660000 });
let installedOverride = false;
try {
  await save();
  let sessions;
  // Never interrupt an existing foreground turn, including the turn which staged this restart.
  for (let i = 0; i < 120; i++) {
    const response = await fetch(`http://127.0.0.1:${host.port}/v1/sessions`, {
      headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw Error(`Host idle preflight HTTP ${response.status}`);
    sessions = await response.json();
    const busy = sessions.filter(session => session.busy);
    if (!busy.length) break;
    state.busySessions = busy.length; await save();
    if (i === 119) throw Error('Host remained busy for 10 minutes; restart not attempted');
    await delay(5000);
  }
  await writeFile(`${root}/sessions.before.json`, JSON.stringify(sessions.map(s => ({ id: s.id, error: !!s.error })), null, 2) + '\n', { mode: 0o600 });
  state.phase = 'restarting'; await save();
  await writeFile(override, await readFile(`${root}/host-dropin.candidate`), { flag: 'wx', mode: 0o600 });
  installedOverride = true;
  systemctl('daemon-reload');
  systemctl('restart', 'pi-durable-host.service');
  state.phase = 'verifying'; await save();
  const output = execFileSync(process.execPath, [`${install}/verify-live.mjs`], { encoding: 'utf8', timeout: 240000 });
  await writeFile(`${root}/verify.log`, output, { mode: 0o600 });
  const browser = ['--session', 'gippity-voice-acceptance'];
  try {
    execFileSync('agent-browser', [...browser, 'open', config.origin], { encoding: 'utf8', timeout: 45000 });
    const snapshot = execFileSync('agent-browser', [...browser, 'snapshot', '-i'], { encoding: 'utf8', timeout: 15000 });
    await writeFile(`${root}/browser.snapshot.txt`, snapshot, { mode: 0o600 });
    const capabilities = execFileSync('agent-browser', [...browser, '--json', 'eval', '({secure:window.isSecureContext,microphoneAPI:typeof navigator.mediaDevices?.getUserMedia,ready:document.readyState})'], { encoding: 'utf8', timeout: 15000 });
    await writeFile(`${root}/browser.capabilities.txt`, capabilities, { mode: 0o600 });
    const result = JSON.parse(capabilities);
    if (!result.success || result.data?.result?.secure !== true || result.data?.result?.microphoneAPI !== 'function') throw Error('Browser secure microphone API unavailable');
    state.browser = 'PASS: rendered browser page, secure context, microphone API available; physical microphone not tested';
  } finally {
    execFileSync('agent-browser', [...browser, 'close'], { encoding: 'utf8', timeout: 15000 });
  }
  state.phase = 'ready'; state.finishedAt = new Date().toISOString(); await save();
} catch (error) {
  state.phase = 'failed'; state.error = error.message; await save();
  // A timeout does not cancel systemd's job. Never roll back an activating or stopping unit.
  const live = spawnSync('systemctl', ['--user', 'show', '--property=ActiveState', '--value', 'pi-durable-host.service'], { encoding: 'utf8', timeout: 10000 });
  state.serviceState = live.status === 0 ? live.stdout.trim() : 'unknown';
  await save();
  // Revert only our override after a definite terminal failure; preserve all owner locks and history.
  if (installedOverride && ['failed', 'inactive'].includes(state.serviceState)) {
    await rename(override, `${root}/host-dropin.failed`);
    systemctl('daemon-reload'); systemctl('start', 'pi-durable-host.service');
    state.rollback = 'restored original service entrypoint'; await save();
  }
  process.exitCode = 1;
}
console.log(JSON.stringify(state));
