import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { runInNewContext } from 'node:vm';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { patchWorklets } from './worklet-patch.mjs';

const exec = promisify(execFile);
test('both genuine release processors load as same-origin modules under unchanged strict CSP; Blob controls fail', { timeout: 60000 }, async () => {
  const sources = [];
  for (const name of ['index', 'activation']) {
    const bundle = await readFile(new URL(`./node_modules/@howaboua/pi-durable-gippity-voice/dist/${name}.js.before-same-origin-worklets`, import.meta.url), 'utf8');
    const patched = await readFile(new URL(`./node_modules/@howaboua/pi-durable-gippity-voice/dist/${name}.js`, import.meta.url), 'utf8');
    assert.equal(patched, patchWorklets(bundle));
    const csp = /response.setHeader\("content-security-policy", "([^"]+)"\)/.exec(bundle)[1];
    assert.ok(patched.includes(`response.setHeader("content-security-policy", "${csp}")`));
    const start = patched.indexOf('var LAN_VOICE_AUDIO_WORKLET =');
    const end = patched.indexOf('var AUDIO_WORKLET_SOURCE =', start);
    const worklets = runInNewContext(patched.slice(start, end) + '\n({audio:LAN_VOICE_AUDIO_WORKLET,microphone:LAN_VOICE_MICROPHONE_BUFFER_WORKLET})');
    sources.push({ csp, worklets });
  }
  assert.equal(sources[0].csp, sources[1].csp);
  for (const name of ['audio', 'microphone']) assert.equal(sources[0].worklets[name], sources[1].worklets[name]);
  const { csp, worklets } = sources[0];
  const server = createServer((req, res) => {
    res.setHeader('content-security-policy', csp);
    res.setHeader('x-content-type-options', 'nosniff');
    const name = /^\/_gippity\/worklets\/(audio|microphone)\.js$/.exec(req.url)?.[1];
    const probe = req.url === '/probe.js';
    res.setHeader('content-type', name || probe ? 'text/javascript; charset=utf-8' : 'text/html');
    // Seed the real processor on its audio thread, avoiding MessagePort/offline-render races.
    res.end(probe ? worklets.audio + `\nregisterProcessor('pi-lan-voice-probe', class extends PiLanVoiceProcessor {
      constructor() { super(); this.handleMessage(new Int16Array(480).fill(8192).buffer); }
    });` : name ? worklets[name] : '<!doctype html><title>Strict CSP real AudioWorklet regression</title>');
  }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const session = `gippity-worklet-regression-${process.pid}`;
  const browser = async (...args) => {
    const { stdout } = await exec('agent-browser', ['--session', session, '--json', ...args], { timeout: 25000 });
    const result = JSON.parse(stdout);
    assert.equal(result.success, true, stdout);
    return result.data;
  };
  try {
    await browser('open', `http://127.0.0.1:${server.address().port}/`);
    const result = await browser('eval', `(async () => {
      const modules = ${JSON.stringify(worklets)};
      const results = [];
      for (const [name, processor] of [['audio','pi-lan-voice'],['microphone','pi-lan-microphone-buffer']]) {
        const context = new AudioContext();
        const blob = URL.createObjectURL(new Blob([modules[name]], {type:'text/javascript'}));
        let blobError;
        try { await context.audioWorklet.addModule(blob); } catch (error) { blobError = error.name; }
        URL.revokeObjectURL(blob);
        await context.close();
        const fixed = new AudioContext();
        await fixed.audioWorklet.addModule('/_gippity/worklets/' + name + '.js');
        const node = new AudioWorkletNode(fixed, processor);
        node.disconnect();
        await fixed.close();
        results.push({name, blobError, registered:true});
      }
      const offline = new OfflineAudioContext(1, 7200, 48000);
      await offline.audioWorklet.addModule('/probe.js');
      const player = new AudioWorkletNode(offline, 'pi-lan-voice-probe');
      player.connect(offline.destination);
      const rendered = await offline.startRendering();
      const firstFrame = rendered.getChannelData(0).findIndex(value => value !== 0);
      return {results, shortFragmentFirstFrame:firstFrame, userAgent:navigator.userAgent};
    })()`);
    for (const item of result.result.results) {
      assert.equal(item.blobError, 'AbortError');
      assert.equal(item.registered, true);
    }
    assert.ok(result.result.shortFragmentFirstFrame >= 0, 'real browser must play a short fragment');
    assert.ok(result.result.shortFragmentFirstFrame / 48 <= 65);
    console.log(JSON.stringify(result.result));
  } finally {
    await browser('close');
    await new Promise(resolve => server.close(resolve));
  }
});
