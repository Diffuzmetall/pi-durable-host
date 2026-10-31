import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { signed } from '../src/auth.js';
import { engineFixture } from './helpers/engine.mjs';

test('actual pinned iii-sdk registers signed namespaced functions and reconnects without a native runtime', async t => {
  const home = await mkdtemp(join(tmpdir(), 'dpi-iii-engine-'));
  const engine = await engineFixture(), keys = generateKeyPairSync('ed25519');
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(III_|OTEL_|NODE_OPTIONS$)/.test(key)));
  Object.assign(env, { HOME: home, XDG_CONFIG_HOME: join(home, 'config'), XDG_DATA_HOME: join(home, 'data'),
    III_FIXTURE_ENGINE: engine.url, III_FIXTURE_PUBLIC_KEY: keys.publicKey.export({ type: 'spki', format: 'pem' }).toString() });
  const worker = fork(new URL('./helpers/echo-worker.mjs', import.meta.url), [], { env, execArgv: ['--import', 'tsx'], silent: true });
  let diagnostics = '';
  worker.stderr.on('data', chunk => { diagnostics = (diagnostics + chunk).slice(-4000); });
  t.after(async () => {
    if (worker.exitCode === null) {
      const exit = once(worker, 'exit');
      worker.send('close');
      const timeout = setTimeout(() => worker.kill('SIGTERM'), 2000);
      await exit; clearTimeout(timeout);
    }
    await engine.close();
    await rm(home, { recursive: true, force: true });
  });
  const namespace = 'durable-pi-test-transport', functionId = 'durable-pi::fixture';
  const firstWorker = await engine.waitFunction(namespace, functionId);
  const body = { requestId: 'stable', content: 'loopback-only' }, envelope = signed(keys.privateKey, 'fixture-binding', functionId, body);
  assert.deepEqual(await engine.invoke(namespace, functionId, { ...envelope, _caller_worker_id: 'human' }, { authority: 'human', source: 'terminal' }), body);
  await assert.rejects(engine.invoke(namespace, functionId, { ...envelope, payload: { ...body, content: 'tampered' } }), /UNAUTHORIZED/);
  await assert.rejects(engine.invoke('default', functionId, envelope), /FUNCTION_NOT_REGISTERED/);
  await engine.disconnect(namespace, functionId);
  const secondWorker = await engine.waitFunction(namespace, functionId);
  assert.notEqual(firstWorker, secondWorker);
  assert.deepEqual(await engine.invoke(namespace, functionId, envelope), body);
  assert.ok(engine.frames.filter(frame => frame.type === 'registerfunction').length >= 2);
  assert.equal(engine.frames.some(frame => frame.credentialPresent), false);
  assert.equal(diagnostics, '');
});
