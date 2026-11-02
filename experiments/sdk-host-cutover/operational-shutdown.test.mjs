import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { get } from 'node:http';

const provider = new URL('./api/openai-codex-responses.js', import.meta.resolve('@earendil-works/pi-ai')).href;
const service = new URL('./operational-service.mjs', import.meta.url);
// Exercise the real service and pi-ai's actual cache timer, without credentials or a model/network request.
const fixture = `
import { createServer } from 'node:http';
import { writeFile } from 'node:fs/promises';
import { stream } from ${JSON.stringify(provider)};
class Socket extends EventTarget {
  readyState = 0;
  constructor() { super(); queueMicrotask(() => { this.readyState = 1; this.dispatchEvent(new Event('open')); }); }
  send() { queueMicrotask(() => { const event = new Event('message'); event.data = JSON.stringify({type:'response.completed',response:{id:'fixture',status:'completed',output:[],usage:{input_tokens:0,output_tokens:0,total_tokens:0}}}); this.dispatchEvent(event); }); }
  close() { this.readyState = 3; const event = new Event('close'); event.code = 1000; this.dispatchEvent(event); }
}
globalThis.WebSocket = Socket;
export const createOperationalProfile = async () => {
  process.send({type:'profile'});
  await new Promise(resolve => setTimeout(resolve, 100));
  return { id:'fixture' };
};
export class GrantPolicy { authenticate() { return {}; } }
let server;
export const createHttpServer = () => server = createServer((req, res) => {
  if (req.url !== '/events') return res.end('ok');
  res.writeHead(200, {'Content-Type':'text/event-stream'});
  res.write('data: ready\\n\\n');
  const heartbeat = setInterval(() => res.write(': heartbeat\\n\\n'), 50);
  req.on('close', () => { clearInterval(heartbeat); process.send({type:'sse-closed'}); });
});
export class Store {
  static async openCatalog() {
    process.send({type:'opening'});
    const store = new Store();
    store.restoring = store.restore();
    if (!process.env.BACKGROUND) await store.restoring;
    return store;
  }
  async restore() {
    await new Promise(resolve => setTimeout(resolve, 150));
    const model = {id:'fixture',name:'fixture',api:'openai-codex-responses',provider:'openai-codex',baseUrl:'https://example.invalid',reasoning:false,input:['text'],cost:{input:0,output:0,cacheRead:0,cacheWrite:0},contextWindow:8192,maxTokens:512};
    const apiKey = 'a.' + Buffer.from(JSON.stringify({'https://api.openai.com/auth':{chatgpt_account_id:'fixture'}})).toString('base64') + '.b';
    const result = await stream(model,{messages:[{role:'user',content:'fixture',timestamp:0}]},{apiKey,sessionId:'fixture-session',transport:'websocket'}).result();
    if (result.stopReason !== 'stop') throw Error('Fixture generation failed');
    if (process.env.FAIL_OPEN) throw Error('synthetic open failure');
    process.send({type:'restored'});
  }
  async close() {
    process.send({type:'closing'});
    if (server?.listening) throw Error('HTTP admission remains open');
    await this.restoring;
    await writeFile(process.env.FIXTURE_CLOSED, 'closed', {flag:'ax'});
    await new Promise(resolve => setTimeout(resolve, 100));
    if (process.env.FAIL_CLOSE) throw Error('synthetic close failure');
  }
}
`;

for (const [signal, stage, failClose] of [['SIGTERM','ready',false], ['SIGINT','ready',false], ['SIGTERM','opening',false], ['SIGTERM','ready',true], ['SIGTERM','profile',false], ['SIGTERM','failed-open',false], ['SIGTERM','repeated',false], ['SIGTERM','recovery',false], ['SIGTERM','sse',false]]) {
  test(`${signal} during ${stage}${failClose ? ' with close error' : ''} releases cached provider resources`, { timeout: 10000 }, async () => {
    const root = await mkdtemp(join(tmpdir(), 'durable-shutdown-'));
    await mkdir(join(root, 'sessions'));
    const entry = join(root, 'service.mjs');
    const deps = new URL('./node_modules', import.meta.url).pathname;
    await symlink(deps, join(root, 'node_modules'));
    await writeFile(entry, await readFile(service));
    const module = pathToFileURL(join(root, 'fixture.mjs')).href;
    await writeFile(join(root, 'fixture.mjs'), fixture);
    await writeFile(join(root, 'loader.mjs'), `export async function resolve(s,c,next) { if (['dpi-backend/store','dpi-backend/server','./operational-profile.mjs'].includes(s)) return {url:${JSON.stringify(module)},shortCircuit:true}; return next(s,c); }`);
    // A real loopback listener is closed by the production shutdown path; no public listener is created.
    const probe = (await import('node:net')).createServer().listen(0, '127.0.0.1');
    await once(probe, 'listening'); const port = probe.address().port; await new Promise(resolve => probe.close(resolve));
    const config = {dataDir:root,startDirs:[root],trustedWorkspaces:[],port,ownerGrantId:'fixture',grants:[{id:'fixture',authority:'human',token:'synthetic'}]};
    const configFile = join(root, 'host.json'); await writeFile(configFile, JSON.stringify(config), {mode:0o600});
    const closed = join(root, 'closed');
    const child = spawn(process.execPath, ['--experimental-loader', join(root,'loader.mjs'), entry, configFile], {env:{PATH:process.env.PATH,HOME:root,FIXTURE_CLOSED:closed,...(failClose ? {FAIL_CLOSE:'1'} : {}),...(stage === 'failed-open' ? {FAIL_OPEN:'1'} : {}),...(stage === 'recovery' ? {BACKGROUND:'1'} : {})},stdio:['ignore','pipe','pipe','ipc']});
    const exited = once(child, 'exit'); let stdout = '', stderr = ''; let timer;
    const events = [];
    child.on('message', message => events.push(message.type));
    child.stderr.on('data', data => { stderr += data; });
    try {
      await new Promise((resolve, reject) => {
        child.on('message', message => {
          if (stage === 'opening' && message.type === 'opening' || stage === 'profile' && message.type === 'profile' || stage === 'failed-open' && message.type === 'opening') resolve();
          if (stage === 'repeated' && message.type === 'closing') child.kill('SIGINT');
        });
        child.stdout.on('data', data => { stdout += data; if (['ready','repeated','recovery','sse'].includes(stage) && stdout.includes('NATIVE_HOST_READY')) resolve(); });
        child.once('exit', code => reject(Error(`Premature exit ${code}: ${stderr}`)));
      });
      let streamClosed;
      if (stage === 'sse') {
        await new Promise((resolve, reject) => {
          const request = get(`http://127.0.0.1:${port}/events`, response => {
            streamClosed = new Promise(done => response.once('close', done));
            response.once('data', resolve); response.on('error', () => {});
          });
          request.on('error', reject);
        });
      }
      if (stage !== 'failed-open') child.kill(signal);
      const shutdownStarted = performance.now();
      const [code, terminationSignal] = await Promise.race([exited, new Promise((_, reject) => { timer = setTimeout(() => reject(Error('Shutdown retained provider resources beyond 2s')), 2000); })]);
      assert.equal(terminationSignal, null); assert.equal(code, failClose || stage === 'failed-open' ? 1 : 0);
      if (!['profile','failed-open'].includes(stage)) assert.equal(await readFile(closed, 'utf8'), 'closed');
      if (['opening','profile','failed-open'].includes(stage)) assert.doesNotMatch(stdout, /NATIVE_HOST_READY/);
      if (stage === 'recovery') assert.ok(events.indexOf('closing') < events.indexOf('restored'), JSON.stringify(events));
      if (stage === 'sse') { await streamClosed; assert.ok(events.includes('sse-closed')); }
      const stages = stdout.split('\n').filter(line => line.startsWith('{')).map(line => JSON.parse(line)).filter(value => value.status === 'NATIVE_HOST_STAGE');
      assert.ok(stages.some(value => value.stage === 'shutdown-settled' && Number.isInteger(value.elapsedMs)));
      if (['ready','repeated','sse','recovery'].includes(stage)) assert.deepEqual(stages.map(value => value.stage), ['profile-created','catalogue-open','shutdown-settled']);
      console.log(JSON.stringify({fixture:stage, shutdownMs:Math.round(performance.now() - shutdownStarted), code}));
    } finally {
      clearTimeout(timer); if (child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); await exited; }
      await rm(root, {recursive:true,force:true});
    }
  });
}
