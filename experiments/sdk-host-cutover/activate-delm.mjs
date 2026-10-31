#!/usr/bin/env node
/** Operator-authorized restart with a bounded idle precheck (not an atomic ingress fence).
 * UI submissions can race the check; that interruption risk is explicitly approved.
 * No model calls except the substantive result continuation after cutover. */
import assert from 'node:assert/strict';
import { readFile, writeFile, open, rename, lstat, readdir } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { homedir } from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { deliverContinuation } from './delm-continuation.mjs';
import { nextUnit } from './delm-cutover-unit.mjs';

process.umask(0o077);
const [releaseArg, evidenceArg, bindingsArg, parentSession] = process.argv.slice(2);
assert(releaseArg && evidenceArg && bindingsArg && parentSession, 'Release, evidence, bindings and exact parent session required');
const release = resolve(releaseArg), evidence = resolve(evidenceArg), bindings = resolve(bindingsArg);
const home = homedir(), configDir = join(home, '.config/pi-durable-host');
const unit = join(home, '.config/systemd/user/pi-durable-host.service');
const node = process.execPath, source = dirname(new URL(import.meta.url).pathname);
const sdkPath = join(home, '.local/share/pi-durable-host/releases/c0019d7-sse1/node_modules/dpi-sdk/dist/client.js');
const { DpiClient } = await import(pathToFileURL(sdkPath).href);
const savedClient = JSON.parse(await readFile(join(home, '.local/share/pi-durable-host/releases/c0019d7-sse1/terminal-client.json'), 'utf8'));
const client = new DpiClient(new URL(savedClient.url).origin, savedClient.token);
const env = { ...process.env, XDG_RUNTIME_DIR: `/run/user/${process.getuid()}`, DBUS_SESSION_BUS_ADDRESS: `unix:path=/run/user/${process.getuid()}/bus` };
const system = (...args) => execFileSync('systemctl', ['--user', ...args], { env, encoding: 'utf8', timeout: 80_000, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const pid = () => Number(system('show', 'pi-durable-host.service', '-p', 'MainPID', '--value'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const privateWrite = (name, value) => writeFile(join(evidence, name), JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600, flush: true });
async function snapshot(name, before) {
  const checker = name === 'before-idle.json' || name === 'rollback-readiness.json' ? 'nico-state.mjs' : 'delm-cutover-state.mjs';
  const args = [join(source, checker), join(evidence, name), ...(before ? [join(evidence, before)] : [])];
  try {
    const result = execFileSync(node, args, { env, timeout: 180_000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    await writeFile(join(evidence, name + '.stdout'), result, { flag: 'wx', mode: 0o600 });
  } catch (error) {
    await privateWrite(name + '.error.json', { name: error.name, status: error.status, signal: error.signal,
      message: error.message, stdout: error.stdout?.toString(), stderr: error.stderr?.toString() });
    throw error;
  }
}
async function idle() {
  for (const session of await client.sessions()) {
    if ((await client.session(session.id).tasks('live', 100)).length) return false;
    for (const agent of await client.session(session.id).agents()) if (agent.busy) return false;
  }
  return true;
}
async function unlocked(dataDir) {
  const paths = [join(dataDir, 'catalog.sqlite.lock')];
  for (const entry of await readdir(join(dataDir, 'sessions'), { withFileTypes: true }))
    if (entry.isDirectory()) paths.push(join(dataDir, 'sessions', entry.name, 'agent.sqlite.lock'));
  for (const path of paths) assert(!await lstat(path).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error; }), 'Existing owner lock; never steal');
}
async function atomic(expected, replacement) {
  const info = await lstat(unit);
  assert(!info.isSymbolicLink() && (await readFile(unit)).equals(expected), 'Concurrent unit change refused');
  const temporary = join(dirname(unit), `.delm-unit-${randomUUID()}`);
  const handle = await open(temporary, 'wx', info.mode & 0o777);
  try { await handle.writeFile(replacement); await handle.sync(); } finally { await handle.close(); }
  assert((await readFile(unit)).equals(expected), 'Concurrent unit change refused');
  await rename(temporary, unit);
}
let stopped = false, changed = false, previousUnit, replacement, previousService, config, dependentActive = false;
let result;
try {
  const manifest = JSON.parse(await readFile(join(release, 'DELM-RELEASE.json'), 'utf8'));
  assert.equal(manifest.release, release);
  assert(!((await lstat(release)).mode & 0o222), 'Unsealed release refused');
  for (const [file, digest] of Object.entries(manifest.files)) assert.equal(sha(await readFile(join(release, file))), digest);
  config = JSON.parse(await readFile(join(configDir, 'host.json'), 'utf8'));
  const oldPid = pid();
  const command = (await readFile(`/proc/${oldPid}/cmdline`, 'utf8')).split('\0').filter(Boolean);
  previousService = command[1];
  previousUnit = await readFile(unit);
  replacement = nextUnit(previousUnit, { currentService: previousService, base: manifest.base, release, bindings });
  const guardedPaths = [join(configDir, 'host.json'), join(configDir, 'runtime.env'), join(home, '.pi/agent/auth.json'), join(home, '.pi/agent/mcp.json')];
  const digests = new Map();
  for (const file of guardedPaths) digests.set(file, sha(await readFile(file)));
  const unchanged = async () => { for (const [file, digest] of digests) assert.equal(sha(await readFile(file)), digest, 'Config changed during cutover'); };
  await privateWrite('activation-intent.json', { release, base: manifest.base, oldPid, parentSession,
    bounds: '10 minute best-effort idle precheck; approved UI admission race; no explicit abort/lock removal' });
  try { dependentActive = system('is-active', 'pi-durable-iii-worker.service') === 'active'; } catch {}
  if (dependentActive) system('stop', 'pi-durable-iii-worker.service');
  const deadline = Date.now() + 600_000;
  while (!await idle()) { assert(Date.now() < deadline, 'Host stayed busy; no cutover'); await sleep(3000); }
  assert.equal(pid(), oldPid);
  await snapshot('before-idle.json'); // Full native task/inbox check; external UI can still race this approved restart.
  await snapshot('before.json');
  await unchanged(); assert.equal(pid(), oldPid);
  await writeFile(join(evidence, 'host.service.preimage'), previousUnit, { flag: 'wx', mode: 0o600 });
  stopped = true; system('stop', 'pi-durable-host.service');
  assert.equal(pid(), 0); await unlocked(config.dataDir); await unchanged();
  await atomic(previousUnit, replacement); changed = true;
  system('daemon-reload'); system('start', 'pi-durable-host.service');
  await snapshot('after.json', 'before.json');
  await unchanged();
  if (dependentActive) system('start', 'pi-durable-iii-worker.service');
  result = { passed: true, release, previousPid: oldPid, hostPid: pid(), iiiWorkerRestored: dependentActive,
    modelCalls: 0, retainedHistories: true, idlePrechecked: true, atomicIngressFence: false };
  await privateWrite('ACTIVATED.json', result);
} catch (error) {
  await privateWrite('cutover-error.json', { name: error.name, message: error.message, stack: error.stack });
  let restored = false;
  if (stopped) {
    try {
      if (pid()) {
        const command = (await readFile(`/proc/${pid()}/cmdline`, 'utf8')).split('\0');
        assert.equal(command[1], join(release, 'operational-service.mjs'));
        await snapshot('rollback-readiness.json');
        system('stop', 'pi-durable-host.service');
      }
      await unlocked(config.dataDir);
      if (changed) await atomic(replacement, previousUnit);
      system('daemon-reload'); system('start', 'pi-durable-host.service');
      if (dependentActive) system('start', 'pi-durable-iii-worker.service');
      restored = true;
    } catch { /* Retain exact evidence; never kill another owner or steal locks. */ }
  }
  let iiiWorkerRestored = !dependentActive;
  if (dependentActive) {
    try {
      const owner = pid(); assert(owner > 1);
      const command = (await readFile(`/proc/${owner}/cmdline`, 'utf8')).split('\0');
      assert([previousService, join(release, 'operational-service.mjs')].includes(command[1]));
      await client.protocol(); // Restore the dependent even when a busy new Host prevented rollback.
      assert.equal(pid(), owner);
      system('start', 'pi-durable-iii-worker.service'); iiiWorkerRestored = true;
    } catch { /* No usable expected owner: retain exact failure rather than start a competing service. */ }
  }
  result = { passed: false, restored, stopped, changed, iiiWorkerRestored, error: error?.name ?? 'Error' };
  await privateWrite('FAILED.json', result);
}
console.log(JSON.stringify(result));
// One substantive operator continuation, not a dummy actor resume or a replacement worker.
const requestId = `delm-deploy-result:${sha(Buffer.from(evidence)).slice(0, 24)}`;
const content = `[Authorized DeLM deployment result] ${JSON.stringify(result)}. Evidence: ${evidence}. Read the actual evidence and handoff.json, then continue the already-authorized current-Host DeLM task in Rex using the run recorded there. This message grants no new permissions.`;
await privateWrite('continuation-intent.json', { requestId, content, contentSha256: sha(Buffer.from(content)), parentSession });
await deliverContinuation(client, evidence);
if (!result.passed) process.exitCode = 1;
