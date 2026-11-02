import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { spawnSync } from 'node:child_process';
import { createServer, connect } from 'node:net';
import { once } from 'node:events';
import { pathToFileURL } from 'node:url';

// Refuse accidental direct execution on the host before probing any credential path.
assert.equal(import.meta.url, 'file:///sandbox/check.mjs', 'Run only through sandbox/run.py');

export function checkAccess(sentinel) {
  const denied = [
    '/home/ubuntu/.pi/agent/auth.json',
    '/home/ubuntu/.config',
    '/home/ubuntu/.local/share/pi-durable',
    '/home/ubuntu/.local/share/pi-durable-host',
    '/run/user/1000',
    '/var/tmp',
    sentinel,
  ];
  for (const path of denied) {
    assert.throws(() => readFileSync(path));
    assert.equal(existsSync(path), false, `Unexpected host mount: ${path}`);
  }
  for (const path of [
    '/home/ubuntu/.pi/agent/auth.json',
    '/home/ubuntu/.local/share/pi-durable-host/sandbox-write-probe',
    '/production-write-probe',
    '/sandbox/write-probe',
  ]) assert.throws(() => writeFileSync(path, 'SYNTHETIC_WRITE_PROBE'));
  assert.throws(() => mkdirSync('/home/ubuntu', {recursive: true}));
  for (const mount of ['/repo', '/candidate', '/previous']) {
    if (existsSync(mount)) assert.throws(() => writeFileSync(`${mount}/sandbox-write-probe`, 'DENY'));
  }
  // A descendant cannot reach the outer namespace through procfs root aliases.
  for (const prefix of ['/proc/1/root', `/proc/${process.ppid}/root`]) {
    assert.throws(() => readFileSync(`${prefix}/home/ubuntu/.pi/agent/auth.json`));
    assert.throws(() => readFileSync(`${prefix}${sentinel}`));
  }
  const pid1Environment = readFileSync('/proc/1/environ', 'utf8');
  assert.equal(/FRANK_SANDBOX_SENTINEL=|OPENAI_API_KEY=|ANTHROPIC_API_KEY=/.test(pid1Environment), false);
  const allowed = new Set(['PATH', 'HOME', 'PI_CODING_AGENT_DIR', 'XDG_CONFIG_HOME', 'TMPDIR', 'LANG', 'TERM', 'PWD']);
  assert.deepEqual(Object.keys(process.env).filter(key => !allowed.has(key)), []);
  assert.equal(process.env.PWD, '/scratch');
  assert.equal(process.env.HOME, '/scratch/home');
  assert.equal(process.env.PI_CODING_AGENT_DIR, '/scratch/home/.pi/agent');
  for (const dir of [process.env.HOME, '/scratch/data', process.env.TMPDIR]) {
    writeFileSync(`${dir}/writable-probe`, 'SYNTHETIC_WRITABLE');
    assert.equal(readFileSync(`${dir}/writable-probe`, 'utf8'), 'SYNTHETIC_WRITABLE');
  }
  assert.equal(Object.values(networkInterfaces()).flat().some(address => !address.internal), false);
  return {deniedPaths: denied, productionWritesDenied: true, secretFreeEnvironment: true,
    writableHomeAndData: true, loopbackOnly: true, procRootEscapeDenied: true};
}

export async function selfCheck(sentinel) {
  const parent = checkAccess(sentinel);
  const child = spawnSync(process.execPath, ['/sandbox/check.mjs', sentinel], {encoding: 'utf8'});
  assert.equal(child.status, 0, child.stderr);
  assert.equal(JSON.parse(child.stdout).productionWritesDenied, true);
  const server = createServer(socket => socket.end('LOOPBACK_OK'));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const socket = connect(server.address().port, '127.0.0.1');
  let response = '';
  socket.on('data', data => response += data);
  await once(socket, 'end');
  await new Promise(resolve => server.close(resolve));
  assert.equal(response, 'LOOPBACK_OK');
  const result = {status: 'PASS', parent, child: 'PASS', loopbackConnection: 'PASS',
    hostProcVisible: false, productionActivation: 'NOT RUN'};
  writeFileSync('/scratch/sandbox-check.json', JSON.stringify(result, null, 2));
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(JSON.stringify(checkAccess(process.argv[2])));
}
