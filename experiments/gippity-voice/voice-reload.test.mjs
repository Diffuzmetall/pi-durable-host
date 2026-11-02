import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, copyFile, symlink, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createJiti } from 'jiti';
import * as chord from '@earendil-works/chord/context';
const ctx = chord.BACKGROUND_CONTEXT;
import * as gippity from '@howaboua/pi-durable-gippity-voice';
import * as gippityComponent from '@howaboua/pi-durable-gippity-voice/component';
import * as components from '@howaboua/pi-durable-components';
import { fauxProvider, fauxAssistantMessage } from '@earendil-works/pi-ai/providers/faux';
import { InMemoryCredentialStore } from '@earendil-works/pi-ai';
import * as nativeProfile from '../../apps/dpi-backend/src/native-profile/profile.ts';
const { createNativeProfile, createNativeModels } = nativeProfile;
import { Store } from '../../apps/dpi-backend/src/store.ts';
import { GrantPolicy } from '../../apps/dpi-backend/src/grants.ts';
import { createHttpServer } from '../../apps/dpi-backend/src/http-server.ts';
import { DpiClient } from '../../apps/dpi-sdk/src/client.ts';
import { createAudioLease } from './integration.mjs';

test('existing audio lease whenIdle waits without cancelling its owner and abort only removes the observer', async () => {
  const lease = createAudioLease();
  const token = await lease.acquire({ owner: 'fixture', mode: 'voice', snapshot: 'generation-v1' }, new AbortController().signal);
  let finished = false;
  const idle = lease.whenIdle(ctx).then(() => { finished = true; });
  const controller = new AbortController();
  const interrupted = lease.whenIdle({ abortSignal: controller.signal });
  controller.abort(); await assert.rejects(interrupted);
  assert.equal(finished, false); assert.equal(lease.snapshot, 'generation-v1');
  await token.release(); await idle; assert.equal(finished, true); assert.equal(lease.busy, false);
});

test('Host/SDK callback reload pins native helper v1 and runs v2 next without replacing Component or listener', { timeout: 40000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'voice-reload-host-'));
  const moduleDirectory = join(directory, 'module'); await mkdir(moduleDirectory);
  // Dependency identity comes from the explicitly mounted sealed dependency closure.
  const dependencies = fileURLToPath(new URL('../../../', import.meta.resolve('@howaboua/pi-durable-gippity-voice')));
  await symlink(dependencies, join(moduleDirectory, 'node_modules'), 'dir');
  let peerDependencies = dirname(fileURLToPath(import.meta.resolve('@earendil-works/chord/context')));
  while (basename(peerDependencies) !== 'node_modules') peerDependencies = dirname(peerDependencies);
  await symlink(peerDependencies, join(directory, 'node_modules'), 'dir');
  await copyFile(new URL('./integration.mjs', import.meta.url), join(moduleDirectory, 'integration.mjs'));
  const gate = join(directory, 'release'), started = join(directory, 'started');
  const helper = join(directory, 'helper.mjs');
  await writeFile(helper, `import{createInterface}from'node:readline';import{existsSync,writeFileSync}from'node:fs';
    const version=Number(process.argv[2]);console.log(JSON.stringify({type:'ready',version:2}));
    createInterface({input:process.stdin}).on('line',line=>{const message=JSON.parse(line);
      if(message.type==='shutdown')process.exit(0);
      if(message.type==='list_devices'){writeFileSync(${JSON.stringify(started)},String(version));
        const finish=()=>console.log(JSON.stringify({type:'devices',inputs:[],outputs:[],version}));
        if(version!==1||existsSync(${JSON.stringify(gate)}))finish();else{const timer=setInterval(()=>{
          if(existsSync(${JSON.stringify(gate)})){clearInterval(timer);finish();}},5);}}});`);
  const factoryFile = join(moduleDirectory, 'audio-host.mjs');
  const version = async value => writeFile(factoryFile, `import{spawn}from'node:child_process';
    export function createAudioHost(options){return{namespace:options.namespace,launch(){
      const child=spawn(process.execPath,[${JSON.stringify(helper)},'${value}'],{stdio:'pipe'});
      const children=globalThis[Symbol.for('voice-reload-fixture-children')]??=new Set();
      children.add(child);child.once('exit',()=>children.delete(child));return child;}};}`);
  await version(1);
  let prepared, preparations = 0;
  const jiti = createJiti(import.meta.url, { moduleCache: false, fsCache: false, tryNative: false,
    virtualModules: { '@earendil-works/chord/context': chord,
      '@howaboua/pi-durable-gippity-voice': gippity,
      '@howaboua/pi-durable-gippity-voice/component': gippityComponent,
      'dpi-backend/native-profile': nativeProfile,
      '@howaboua/pi-durable-components': { ...components, async prepareComponents(...args) {
      preparations++; prepared = await components.prepareComponents(...args); return prepared;
    } } } });
  const { attachGippity } = jiti(join(moduleDirectory, 'integration.mjs'));
  const keyFile = join(directory, 'key.pem'), certFile = join(directory, 'cert.pem');
  execFileSync('openssl', ['req', '-config', '/dev/null', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
    '-subj', '/CN=voice-fixture.ts.net', '-keyout', keyFile, '-out', certFile], { stdio: 'ignore' });
  const reserved = createServer().listen(0, '127.0.0.1'); await once(reserved, 'listening');
  const port = reserved.address().port; await new Promise(resolve => reserved.close(resolve));
  const config = { sessionId: undefined, conversationId: 1, bind: '127.0.0.1', port,
    origin: `https://voice-fixture.ts.net:${port}`, keyFile, certFile, audioHome: directory, statusFile: join(directory, 'status.json') };
  const policy = new GrantPolicy([{ id: 'voice-owner', token: 'fixture-token', actor: 'operator', source: 'terminal', authority: 'human',
    permissions: ['read', 'write', 'control', 'filesystem'], binding: {} }]);
  const selected = { provider: 'faux', modelId: 'faux-1' };
  const faux = fauxProvider({ tokensPerSecond: 100000 }); faux.setResponses([fauxAssistantMessage('local voice fixture')]);
  const modelOptions = { providers: [faux.provider], credentials: new InMemoryCredentialStore() };
  const discovery = await createNativeModels(modelOptions);
  const base = createNativeProfile({ policy, owner: policy.authenticate('fixture-token'),
    models: { defaultModel: selected, catalogue: discovery.catalogue, create: () => createNativeModels(modelOptions) },
    dcg: { binaryPath: join(directory, 'absent-dcg'), envSource: () => ({}) },
    connectMcp: async () => ({ sources: [], close: async () => {} }),
  });
  const profile = Object.assign(async runtime => {
    config.sessionId ??= runtime.sessionId;
    // Store marks the local faux provider offline; exercise voice explicitly with
    // its synthetic helper and local provider, not any external voice service.
    const composition = await base(runtime);
    return attachGippity(composition, { ...runtime, offline: false }, config);
  }, base);
  const store = await Store.open({ dataDir: join(directory, 'data'), startDirs: [directory], name: 'voice', provider: 'faux', profile });
  const server = createHttpServer(store, policy).listen(0, '127.0.0.1'); await once(server, 'listening');
  const client = new DpiClient(`http://127.0.0.1:${server.address().port}`, 'fixture-token');
  let pending;
  try {
    const session = await client.createSession({ name: 'voice-reload', cwd: directory, model: selected });
    assert.ok(prepared);
    const harness = store.opened.get(session.id).harness, instance = prepared.instances[0].instance;
    const controls = instance.api.controls;
    const listener = controls.lanStatus();
    pending = controls.listDevices(ctx);
    for (let count = 0; count < 500; count++) {
      if (await readFile(started, 'utf8').catch(() => '') === '1') break;
      await new Promise(resolve => setTimeout(resolve, 5));
    }
    assert.equal(await readFile(started, 'utf8'), '1');
    const graph = await harness.taskGraph(ctx);
    const serviceIds = () => Object.values(graph.value.tasks).filter(task => task.kind.includes('gippity')).map(task => task.id);
    const initialServiceIds = serviceIds(); assert.ok(initialServiceIds.length > 0);
    await version(2);
    await client.session(session.id).reload();
    assert.equal(preparations, 1); assert.equal(prepared.status, 'bound');
    assert.equal(controls, prepared.instances[0].instance.api.controls);
    assert.equal(store.opened.get(session.id).harness, harness);
    assert.deepEqual(controls.lanStatus(), listener);
    await writeFile(gate, 'release');
    assert.equal((await pending).version, 1);
    assert.equal((await controls.listDevices(ctx)).version, 2);
    await writeFile(factoryFile, 'invalid JavaScript source');
    await assert.rejects(client.session(session.id).reload());
    assert.equal((await controls.listDevices(ctx)).version, 2);
    await writeFile(factoryFile, 'export function createAudioHost(){return {namespace:"foreign"}}');
    await assert.rejects(client.session(session.id).reload());
    assert.equal((await controls.listDevices(ctx)).version, 2);
    await version(2);
    const winner = await store.opened.get(session.id).profile.prepareReload();
    const stale = await store.opened.get(session.id).profile.prepareReload();
    winner.validate(); winner.publish();
    assert.throws(() => stale.validate(), /NATIVE_REGISTRY_CHANGED_DURING_PREPARATION/);
    assert.equal((await controls.listDevices(ctx)).version, 2);
    for (let count = 0; count < 20; count++) {
      await version(count % 2 + 1); await client.session(session.id).reload();
      assert.equal((await controls.listDevices(ctx)).version, count % 2 + 1);
      assert.equal(globalThis[Symbol.for('voice-reload-fixture-children')].size, 0);
      assert.deepEqual(serviceIds(), initialServiceIds);
    }
    graph.dispose();
    assert.equal(preparations, 1); assert.equal(prepared.status, 'bound');
    assert.deepEqual(controls.lanStatus(), listener);
    await version(1); await client.session(session.id).reload();
    assert.equal((await controls.listDevices(ctx)).version, 1);
  } finally {
    await writeFile(gate, 'release'); await pending?.catch(() => {});
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    await store.close(); await rm(directory, { recursive: true, force: true });
  }
});
