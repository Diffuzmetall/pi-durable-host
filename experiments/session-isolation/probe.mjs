import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { appendFile, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRegistry } from './recording-deps.mjs';

const envKeys = ['HINDSIGHT_LOG_FILE', 'HINDSIGHT_DIAG_FILE', 'HINDSIGHT_USAGE_FILE', 'AGENT_MAIL_AGENT', 'AGENT_MAIL_PROJECT'];
const source = await readFile(new URL('./snapshots/hindsight-adapter.mjs', import.meta.url), 'utf8');
const deps = new URL('./recording-deps.mjs', import.meta.url).href;
const rewritten = source.replace(/^import .* from "(@earendil-works\/pi-durable|\.\/bridge.mjs|\.\/index.mjs|\.\/private-fs.mjs)";$/gm, (line) => line.replace(/"[^"]+";$/, JSON.stringify(deps) + ';'));
const { default: install, HINDSIGHT_CONTROLLER } = await import('data:text/javascript;base64,' + Buffer.from(rewritten).toString('base64'));

async function session(root, id) {
  const cwd = join(root, id, 'cwd');
  const directory = join(root, id, 'data');
  const registry = await install(createRegistry());
  const controller = registry.snapshot().extension('hindsight')[HINDSIGHT_CONTROLLER];
  await controller.bind({ cwd, directory, session: id });
  // Exact onMailIdentity assignments from pinned runtime.ts:283–291. Identity itself is faux.
  process.env.AGENT_MAIL_AGENT = id;
  process.env.AGENT_MAIL_PROJECT = cwd;
  return { controller, cwd, directory, id };
}
async function observe(s) {
  await appendFile(process.env.HINDSIGHT_LOG_FILE, s.id + '\n');
  return {
    context: s.controller.context(),
    log: process.env.HINDSIGHT_LOG_FILE,
    diagnostics: process.env.HINDSIGHT_DIAG_FILE,
    usage: process.env.HINDSIGHT_USAGE_FILE,
    mail: { agent: process.env.AGENT_MAIL_AGENT, project: process.env.AGENT_MAIL_PROJECT },
  };
}

if (process.argv[2] === '--child') {
  const s = await session(process.argv[3], process.argv[4]);
  process.send(await observe(s));
  process.on('message', async (command) => {
    if (command === 'observe') process.send(await observe(s));
    else if (command === 'close') { s.controller.close(); process.exit(0); }
  });
} else {
  const saved = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  const root = await mkdtemp(join(tmpdir(), 'dpi-isolation-'));
  const children = [];
  try {
    envKeys.forEach((key) => delete process.env[key]);
    const a = await session(root, 'same-A');
    const b = await session(root, 'same-B');
    const seenA = await observe(a);
    const seenB = await observe(b);
    assert.notEqual(seenA.context.cwd, seenB.context.cwd);
    assert.equal(seenB.log, join(a.directory, 'memory.log'));
    assert.equal(seenA.mail.agent, b.id);
    assert.equal(seenB.diagnostics, join(a.directory, 'diagnostics.jsonl'));
    assert.equal(seenB.usage, join(a.directory, 'usage.jsonl'));
    a.controller.close();
    assert.equal((await observe(b)).context.session, b.id);
    assert.match(await readFile(seenA.log, 'utf8'), /same-B/);
    console.log('PASS reproducer: same-process cwd stays local, B logs use A paths, later Mail env overwrites A; fake controller close remains local');

    const env = { ...process.env };
    envKeys.forEach((key) => delete env[key]);
    async function child(id) {
      const p = fork(fileURLToPath(import.meta.url), ['--child', root, id], { env, stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
      children.push(p);
      const [view] = await once(p, 'message');
      return { p, view };
    }
    const ca = await child('process-A');
    const cb = await child('process-B');
    for (const { view } of [ca, cb]) {
      assert.equal(view.log, join(root, view.context.session, 'data', 'memory.log'));
      assert.equal(view.mail.agent, view.context.session);
      assert.equal(view.mail.project, view.context.cwd);
      assert.equal(view.diagnostics, join(root, view.context.session, 'data', 'diagnostics.jsonl'));
      assert.equal(view.usage, join(root, view.context.session, 'data', 'usage.jsonl'));
    }
    const exited = once(ca.p, 'exit');
    ca.p.send('close');
    await exited;
    const next = once(cb.p, 'message');
    cb.p.send('observe');
    const [remaining] = await next;
    assert.deepEqual(remaining, cb.view);
    assert.equal(await readFile(ca.view.log, 'utf8'), 'process-A\n');
    assert.equal(await readFile(cb.view.log, 'utf8'), 'process-B\nprocess-B\n');
    console.log('PASS process fixture: separate cwd/log/diagnostics/usage/Mail env; closing A preserves B');
    console.log('NOT_TESTED full Harness, live Hindsight/Mail, dispatcher runtime, production profile; process fixture is placement evidence, not full-profile acceptance');
  } finally {
    await Promise.all(children.filter((p) => p.exitCode === null).map(async (p) => { const exited = once(p, 'exit'); p.kill(); await exited; }));
    for (const key of envKeys) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; }
    await rm(root, { recursive: true, force: true });
  }
}
