import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, access, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import * as launcher from './terminal-launcher.mjs';

// The real service entrypoint runs in a subprocess. Only expensive initializers
// are replaced; the fixture acquires a real lock before delaying Store.open().
const hooks = `import { registerHooks } from 'node:module';
const modules = {
  'dpi-backend/store': ${JSON.stringify(`import {writeFile,unlink} from 'node:fs/promises';
import {join} from 'node:path';
export const Store = {async open({dataDir}) {
 const lock=join(dataDir,'catalog.sqlite.lock');
 await writeFile(lock,String(process.pid),{flag:'wx'});
 console.log('FIXTURE_OPENING');
 await new Promise(resolve=>setTimeout(resolve,350));
 if(process.env.FIXTURE_OPEN_FAILURE){await unlink(lock);throw Error('fixture open failure');}
 return {async close(){await unlink(lock);console.log('FIXTURE_CLOSED');}};
}};`)},
  'dpi-backend/server': ${JSON.stringify(`export class GrantPolicy {authenticate(){return {};}}
export function createHttpServer(){throw Error('HTTP must not start after shutdown was requested');}`)},
  'profile': ${JSON.stringify(`export async function createOperationalProfile(){return {id:'fixture@1'};}`)}
};
registerHooks({resolve(specifier,context,next){
 const key=specifier.endsWith('/operational-profile.mjs')||specifier==='./operational-profile.mjs'?'profile':specifier;
 if(Object.hasOwn(modules,key))return {url:'data:text/javascript,'+encodeURIComponent(modules[key]),shortCircuit:true};
 return next(specifier,context);
}});
`;

for (const signal of ['SIGTERM', 'SIGINT']) {
  test(`${signal} during Store.open closes its lock without advertising readiness`, { timeout: 5000 }, async () => {
    const root = await mkdtemp(join(tmpdir(), 'host-start-signal-'));
    await mkdir(join(root, 'sessions'));
    const config = join(root, 'host.json'), preload = join(root, 'hooks.mjs');
    await writeFile(config, JSON.stringify({ dataDir: root, startDirs: [root], trustedWorkspaces: [], port: 49182,
      ownerGrantId: 'fixture', grants: [{id:'fixture',authority:'human',token:'synthetic'}] }), { mode: 0o600 });
    await writeFile(preload, hooks);
    const child = spawn(process.execPath, ['--import', preload, new URL('./operational-service.mjs', import.meta.url).pathname, config], {
      env: { ...process.env, HOME: root, NOTIFY_SOCKET: '', FIXTURE_OPEN_FAILURE: '' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const exited = once(child, 'exit');
    let output = '', error = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { error += chunk; });
    try {
      const opening = (async () => {
        for await (const line of createInterface({ input: child.stdout })) if (line === 'FIXTURE_OPENING') return;
        throw Error('Fixture never reached Store.open');
      })();
      await Promise.race([opening, exited.then(() => { throw Error('Early exit: ' + error); })]);
      child.kill(signal);
      const [code, termination] = await exited;
      assert.equal(termination, null, 'signal must request graceful cleanup, not kill startup');
      assert.equal(code, 0, error);
      assert.match(output, /FIXTURE_CLOSED/);
      assert.doesNotMatch(output, /NATIVE_HOST_READY/);
      await assert.rejects(access(join(root, 'catalog.sqlite.lock')), {code:'ENOENT'});
    } finally {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    }
  });
}

test('terminal waits through the full five-minute service startup budget', async () => {
  const unit = await readFile(new URL('./host-lifecycle.conf', import.meta.url), 'utf8');
  assert.match(unit, /^TimeoutStartSec=300$/m);
  assert.match(unit, /^TimeoutStopSec=300$/m);
  assert.equal(typeof launcher.startHostService, 'function');
  let completed = false;
  await launcher.startHostService(async (binary, args, options) => {
    assert.equal(binary, '/usr/bin/systemctl');
    assert.deepEqual(args, ['--user', 'start', 'pi-durable-host.service']);
    assert.ok(options.timeout > 300_000, 'terminal must not expire before the service');
    await new Promise(resolve => setImmediate(resolve));
    completed = true;
  });
  assert.equal(completed, true);
  await assert.rejects(launcher.startHostService(async () => { throw Error('service failed'); }), /service failed/);
});
