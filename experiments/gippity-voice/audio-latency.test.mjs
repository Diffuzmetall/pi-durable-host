import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

export function audioSource(bundle) {
  const start = bundle.indexOf('var LAN_VOICE_AUDIO_WORKLET =');
  const end = bundle.indexOf('// packages/gippity-voice/src/voice/lan/microphone-buffer-worklet.ts', start);
  assert.ok(start >= 0 && end > start);
  return runInNewContext(bundle.slice(start, end) + '\nLAN_VOICE_AUDIO_WORKLET');
}

function processor(source, rate) {
  let Processor;
  runInNewContext(source, {
    sampleRate: rate, ArrayBuffer, Int16Array, Float32Array,
    AudioWorkletProcessor: class { port = { postMessage() {} }; },
    registerProcessor(_name, value) { Processor = value; },
  });
  return new Processor();
}

export function firstAudioDelay(source, rate, samples, limitMs = 1000) {
  const p = processor(source, rate);
  p.handleMessage(new Int16Array(samples).fill(8192).buffer);
  const output = new Float32Array(128);
  for (let frames = 0; frames < rate * limitMs / 1000; frames += output.length) {
    p.process([], [[output]]);
    if (output.some(value => value !== 0)) return frames * 1000 / rate;
  }
  return Infinity;
}

for (const name of ['index', 'activation']) {
  const bundle = await readFile(new URL(`./node_modules/@howaboua/pi-durable-gippity-voice/dist/${name}.js`, import.meta.url), 'utf8');
  const source = audioSource(bundle);
  for (const rate of [24000, 44100, 48000]) {
    test(`${name}: short PCM resumes within 65ms at ${rate}Hz, including after underrun`, () => {
      assert.ok(firstAudioDelay(source, rate, 480) <= 65, '20ms fragment must not wait indefinitely for another packet');
      const p = processor(source, rate);
      const output = new Float32Array(128);
      p.handleMessage(new Int16Array(1440).fill(8192).buffer);
      let heard = false;
      for (let n = 0; n < Math.ceil(rate / 128); n++) {
        p.process([], [[output]]);
        heard ||= output.some(value => value !== 0);
      }
      assert.ok(heard);
      assert.equal(p.playing, false);
      p.handleMessage(new Int16Array(480).fill(8192).buffer);
      heard = false;
      for (let n = 0; n < Math.ceil(rate * 0.065 / 128); n++) {
        p.process([], [[output]]);
        heard ||= output.some(value => value !== 0);
      }
      assert.ok(heard, 'short tail after starvation must resume');
    });
    test(`${name}: full prebuffer starts immediately; suppression clears pending audio at ${rate}Hz`, () => {
      assert.equal(firstAudioDelay(source, rate, 1440), 0);
      const p = processor(source, rate);
      const output = new Float32Array(128);
      p.handleMessage(new Int16Array(480).fill(8192).buffer);
      p.handleMessage({ type: 'speaker_suppressed', suppressed: true });
      p.handleMessage(new Int16Array(1440).fill(8192).buffer);
      p.handleMessage({ type: 'speaker_suppressed', suppressed: false });
      for (let n = 0; n < 100; n++) {
        p.process([], [[output]]);
        assert.ok(output.every(value => value === 0));
      }
      assert.equal(p.playbackLength, 0);
    });
  }
}
