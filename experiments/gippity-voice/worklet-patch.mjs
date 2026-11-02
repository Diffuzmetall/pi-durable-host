import { readFile, writeFile, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';

// Version-specific, fail-closed release adaptation. No server/SDK/permission replacement.
export function patchAudioLatency(source) {
  if (source.includes('const PLAYBACK_MAX_WAIT_SECONDS = 0.06;')) return source;
  const replacements = [
    ['const PLAYBACK_START_SAMPLES = 1440;',
     'const PLAYBACK_START_SAMPLES = 1440;\nconst PLAYBACK_MAX_WAIT_SECONDS = 0.06;'],
    ['    this.playing = false;\n    this.playbackPhase = 0;',
     '    this.playing = false;\n    this.playbackWaitFrames = 0;\n    this.playbackPhase = 0;', 2],
    ['      if (this.playbackLength < PLAYBACK_START_SAMPLES) return;\n      this.playing = true;',
     `      if (this.playbackLength === 0) { this.playbackWaitFrames = 0; return; }
      // Keep the jitter reserve, but never strand a short tail waiting for another packet.
      this.playbackWaitFrames += output.length;
      if (this.playbackLength < PLAYBACK_START_SAMPLES &&
          this.playbackWaitFrames < sampleRate * PLAYBACK_MAX_WAIT_SECONDS) return;
      this.playbackWaitFrames = 0;
      this.playing = true;`],
    ['      this.playbackNext = this.shiftPlayback();\n    }\n    const step = TARGET_RATE / sampleRate;',
     '      this.playbackNext = this.playbackLength > 0 ? this.shiftPlayback() : this.playbackCurrent;\n    }\n    const step = TARGET_RATE / sampleRate;'],
  ];
  for (const [before, after, count = 1] of replacements) {
    if (source.split(before).length !== count + 1) throw Error('Unsupported GipPity audio latency patch anchor');
    source = source.replaceAll(before, after);
  }
  return source;
}

export function patchWorklets(source) {
  const replacements = [
    ['  const audioWorkletSource = ${AUDIO_WORKLET_SOURCE};\n  const microphoneWorkletSource = ${MICROPHONE_WORKLET_SOURCE};',
     "  const audioWorkletUrl = '/_gippity/worklets/audio.js';\n  const microphoneWorkletUrl = '/_gippity/worklets/microphone.js';"],
    ["      const microphoneUrl = URL.createObjectURL(new Blob([microphoneWorkletSource], { type:'text/javascript' }));\n      const audioUrl = URL.createObjectURL(new Blob([audioWorkletSource], { type:'text/javascript' }));\n      try { await Promise.all([context.audioWorklet.addModule(microphoneUrl), context.audioWorklet.addModule(audioUrl)]); }\n      finally { URL.revokeObjectURL(microphoneUrl); URL.revokeObjectURL(audioUrl); }",
     '      await Promise.all([context.audioWorklet.addModule(microphoneWorkletUrl), context.audioWorklet.addModule(audioWorkletUrl)]);'],
    ["          const workletUrl = URL.createObjectURL(new Blob([audioWorkletSource], { type:'text/javascript' }));\n          try { await context.audioWorklet.addModule(workletUrl); }\n          finally { URL.revokeObjectURL(workletUrl); }",
     '          await context.audioWorklet.addModule(audioWorkletUrl);'],
    ['      if (path === LAN_REMOTE_CLIENT_PATH)\n',
     '      if (path === "/_gippity/worklets/audio.js")\n        return content(response, "text/javascript; charset=utf-8", LAN_VOICE_AUDIO_WORKLET);\n      if (path === "/_gippity/worklets/microphone.js")\n        return content(response, "text/javascript; charset=utf-8", LAN_VOICE_MICROPHONE_BUFFER_WORKLET);\n      if (path === LAN_REMOTE_CLIENT_PATH)\n'],
  ];
  for (const [before, after] of replacements) {
    if (source.split(before).length !== 2) throw Error('Unsupported GipPity bundle: patch anchor not unique');
    source = source.replace(before, after);
  }
  return patchAudioLatency(source);
}

export async function applyPatch(root, restore = false) {
  const pkg = join(root, 'node_modules/@howaboua/pi-durable-gippity-voice');
  const manifest = JSON.parse(await readFile(join(pkg, 'package.json'), 'utf8'));
  if (manifest.version !== '0.10.0') throw Error('Only GipPity 0.10.0 is supported');
  const writes = [];
  for (const name of ['index', 'activation']) {
    const path = join(pkg, `dist/${name}.js`);
    const current = await readFile(path, 'utf8');
    const backup = `${path}.before-same-origin-worklets`;
    let original = await readFile(backup, 'utf8').catch(error => {
      if (error.code !== 'ENOENT') throw error;
    });
    if (original === undefined) {
      if (restore) throw Error('No worklet patch backup');
      original = current;
    }
    const patched = patchWorklets(original);
    if (current !== original && current !== patched && patchAudioLatency(current) !== patched)
      throw Error(`Unrelated bundle edits: ${name}`);
    writes.push({ path, backup, original, content: restore ? original : patched });
  }
  for (const item of writes) {
    if (!restore) await copyFile(item.path, item.backup, 1).catch(error => {
      if (error.code !== 'EEXIST') throw error;
    });
    await writeFile(item.path, item.content);
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await applyPatch(resolve(process.argv[2] ?? fileURLToPath(new URL('.', import.meta.url))), process.argv.includes('--restore'));
  console.log('GipPity same-origin worklet patch: complete');
}
