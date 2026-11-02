import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { execFileSync } from 'node:child_process';
import { once } from 'node:events';
import WebSocket from 'ws';

const root = '/home/ubuntu/.config/pi-durable-host/gippity-voice';
const config = JSON.parse(await readFile(`${root}/config.json`, 'utf8'));
const host = JSON.parse(await readFile('/home/ubuntu/.config/pi-durable-host/host.json', 'utf8'));
const { DpiClient } = await import(`${config.baseProfile.replace('/operational-profile.mjs', '')}/node_modules/dpi-sdk/dist/client.js`);
const client = new DpiClient(`http://127.0.0.1:${host.port}`, host.grants.find(g => g.id === host.ownerGrantId).token);
const proof = { timestamp: new Date().toISOString(), sessionId: config.sessionId, microphone: 'NOT_TESTED: synthetic PCM, not a physical microphone' };
const save = () => writeFile(`${root}/verify.json`, JSON.stringify(proof, null, 2) + '\n', { mode: 0o600 });
let socket, eventPump;
const eventsAbort = new AbortController();
try {
  const status = JSON.parse(await readFile(config.statusFile, 'utf8'));
  assert.equal(status.sdk, 'bound'); assert.equal(status.running, true); assert.equal(status.readiness.ready, true);
  proof.component = status;
  const page = await fetch(config.origin, { signal: AbortSignal.timeout(15000) });
  assert.equal(page.status, 200); assert.match(await page.text(), /GipPity/i);
  proof.https = 'PASS: verified TLS certificate and browser page through Tailscale Serve';
  const discovery = await fetch(`${config.origin}/api/discovery`, { signal: AbortSignal.timeout(15000) });
  assert.equal(discovery.status, 200); assert.equal((await discovery.json()).trustedNetwork, true);
  const routes = JSON.parse(execFileSync('tailscale', ['serve', 'status', '--json'], { encoding: 'utf8' }));
  const before = JSON.parse(await readFile(`${root}/tailscale-serve.preimage.json`, 'utf8'));
  for (const [key, value] of Object.entries(before)) {
    if (value && typeof value === 'object') for (const [child, old] of Object.entries(value)) assert.deepEqual(routes[key][child], old);
    else assert.deepEqual(routes[key], value);
  }
  assert.equal(routes.TCP['8448'].HTTPS, true);
  assert.notEqual(routes.AllowFunnel?.[new URL(config.origin).host], true);
  proof.routes = 'PASS: all pre-existing routes preserved; HTTPS enabled; Voice Funnel disabled';
  const idsBefore = JSON.parse(await readFile(`${root}/sessions.before.json`, 'utf8'));
  const sessions = await client.sessions();
  for (const saved of idsBefore) assert.ok(sessions.some(s => s.id === saved.id), `Missing session ${saved.id}`);
  proof.preservedSessions = idsBefore.length;
  const errorsBefore = new Set(idsBefore.filter(s => s.error).map(s => s.id));
  assert.deepEqual(sessions.filter(s => s.error && !errorsBefore.has(s.id)).map(s => s.id), []);
  proof.sessionErrors = 'PASS: no new session errors';
  await save();

  // One actual browser-protocol dictation call. Provider credentials remain inside Host.
  const clientId = 'gippity-server-acceptance';
  const messages = [];
  let eventError;
  const events = await fetch(`${config.origin}/api/events?client=${clientId}`, { signal: eventsAbort.signal });
  assert.equal(events.status, 200);
  eventPump = (async () => {
    const decoder = new TextDecoder(); let buffered = '';
    for await (const chunk of events.body) {
      buffered += decoder.decode(chunk, { stream: true });
      let end;
      while ((end = buffered.indexOf('\n\n')) >= 0) {
        const frame = buffered.slice(0, end); buffered = buffered.slice(end + 2);
        for (const line of frame.split('\n')) if (line.startsWith('data: ')) messages.push(JSON.parse(line.slice(6)));
      }
    }
  })().catch(error => { if (!eventsAbort.signal.aborted) eventError = error; });
  socket = new WebSocket(`${config.origin.replace(/^https:/, 'wss:')}/api/audio?client=${clientId}`, { origin: config.origin });
  socket.on('message', (data, binary) => { if (!binary) messages.push(JSON.parse(data.toString())); });
  const wait = async predicate => {
    for (let i = 0; i < 200; i++) {
      if (eventError) throw eventError;
      const error = messages.find(m => m.type === 'error');
      if (error) throw Error(error.message);
      const found = messages.find(predicate); if (found) return found;
      await delay(100);
    }
    throw Error('Browser audio protocol timeout');
  };
  await once(socket, 'open');
  socket.send(JSON.stringify({ type: 'start', mode: 'dictation' }));
  await wait(m => m.type === 'active' && m.mode === 'dictation');
  const pcm = await readFile(`${root}/command.pcm`);
  for (let offset = 0; offset < pcm.length; offset += 4800) {
    socket.send(pcm.subarray(offset, offset + 4800)); await delay(100);
  }
  socket.send(JSON.stringify({ type: 'finish', draft: '', revision: 0, selectionStart: 0, selectionEnd: 0 }));
  await wait(m => m.type === 'dictation.complete');
  // Draft state is broadcast through the browser's SSE connection.
  const draft = await wait(m => m.type === 'draft' && m.text?.trim());
  assert.match(draft.text, /ready/i);
  proof.dictation = { status: 'PASS', transcript: draft.text, source: 'local flite PCM -> tailnet WebSocket -> GipPity -> canonical Codex OAuth -> editable draft' };
  await save();

  // Exactly one harmless live input; never automatically retry this admission.
  const response = await fetch(`${config.origin}/api/send`, {
    method: 'POST', headers: { origin: config.origin, 'content-type': 'application/json' },
    body: JSON.stringify({ clientId, text: draft.text, revision: draft.revision }), signal: AbortSignal.timeout(20000),
  });
  assert.equal(response.status, 200, await response.text());
  proof.submission = 'accepted; waiting for native answer'; await save();
  let items = [], answer;
  for (let i = 0; i < 90; i++) {
    const result = await client.agent(config.sessionId, config.conversationId).transcript('json');
    items = result.items ?? [];
    answer = items.find(item => item.kind === 'assistant' && !item.streaming && !item.error &&
      item.blocks.some(block => block.type === 'text' && /\bready\b/i.test(block.text)));
    if (answer) break;
    await delay(1000);
  }
  assert.ok(items.some(item => item.kind === 'user' && item.text.includes(draft.text)), 'Dictated command absent from target conversation');
  assert.ok(answer, 'No completed native assistant answer containing ready');
  assert.ok(!items.some(item => item.kind === 'tool' || item.kind === 'tool-result' || item.blocks?.some(block => block.type === 'tool')), 'Unexpected tool use');
  proof.answer = answer.blocks.filter(block => block.type === 'text').map(block => block.text).join('\n');
  proof.submission = 'PASS: dictated command present in configured conversation, completed native assistant answer contains ready, no tools invoked';
  proof.result = 'PASS';
} catch (error) {
  proof.result = 'FAIL'; proof.error = error.message;
  process.exitCode = 1;
} finally {
  socket?.close();
  eventsAbort.abort();
  await eventPump;
  await save();
}
console.log(JSON.stringify({ result: proof.result, error: proof.error, https: proof.https, dictation: proof.dictation, submission: proof.submission, preservedSessions: proof.preservedSessions }));
