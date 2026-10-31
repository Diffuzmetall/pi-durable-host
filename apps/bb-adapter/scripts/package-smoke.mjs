import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync, createReadStream } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { spawn, spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';

const archives = process.argv.slice(2).map(file => resolve(file));
if (archives.length !== 5) throw Error('Usage: node package-smoke.mjs BACKEND.tgz SDK.tgz BB.tgz OLD_TERMINAL.tgz OLD_SDK.tgz');
const root = await mkdtemp(join(tmpdir(), 'dpi-bb-packed-'));
const fresh = join(root, 'fresh'), old = join(root, 'old-terminal'), home = join(root, 'home'), work = join(root, 'work');
for (const directory of [fresh, old, home, work]) await mkdir(directory, { recursive: true });
const userConfig = join(home, 'npm-user.rc'), globalConfig = join(home, 'npm-global.rc');
await writeFile(userConfig, ''); await writeFile(globalConfig, '');
const npmEnv = { PATH: process.env.PATH, HOME: home, NPM_CONFIG_CACHE: process.env.npm_config_cache ?? join(homedir(), '.npm'),
  NPM_CONFIG_USERCONFIG: userConfig, NPM_CONFIG_GLOBALCONFIG: globalConfig, NPM_CONFIG_REGISTRY: 'https://registry.npmjs.org' };
for (const [directory, packages] of [[fresh, archives.slice(0, 3)], [old, archives.slice(3)]]) {
  await writeFile(join(directory, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
  const installed = spawnSync('npm', ['install', ...(directory === old ? ['--offline'] : []), '--ignore-scripts', '--no-audit', '--no-fund', ...packages], { cwd: directory, env: npmEnv, encoding: 'utf8', timeout: 120000 });
  await writeFile(join(directory, 'install.log'), installed.stdout + installed.stderr);
  assert.equal(installed.status, 0, `isolated installation failed; retained ${directory}/install.log`);
}
const load = file => import(pathToFileURL(file).href);
const backend = join(fresh, 'node_modules/dpi-backend');
const ownerSource = join(backend, 'dist/dpi-backend/src');
const { Store } = await load(join(ownerSource, 'store.js'));
const { GrantPolicy } = await load(join(ownerSource, 'grants.js'));
const { createHttpServer } = await load(join(ownerSource, 'http-server.js'));
const { createNativeProfile } = await load(join(ownerSource, 'native-profile/profile.js'));
const { createNativeModels } = await load(join(ownerSource, 'native-profile/models/index.js'));
const { installFaux } = await load(join(ownerSource, 'faux.js'));
const ai = [join(backend, 'node_modules/@earendil-works/pi-ai'), join(fresh, 'node_modules/@earendil-works/pi-ai')].find(directory => existsSync(join(directory, 'dist/index.js')));
assert.ok(ai, 'actual installed native owner dependency');
assert.equal(JSON.parse(await readFile(join(ai, 'package.json'), 'utf8')).version, '1.4.0');
const { InMemoryCredentialStore } = await load(join(ai, 'dist/index.js'));
const { fauxProvider } = await load(join(ai, 'dist/providers/faux.js'));
const { DpiClient } = await load(join(fresh, 'node_modules/dpi-sdk/dist/client.js'));
const reference = { provider: 'faux', modelId: 'echo' };
const owner = { id: 'owner', token: 'DISPOSABLE_PACKAGE_OWNER', actor: 'owner', source: 'terminal', authority: 'human',
  permissions: ['read','write','control','filesystem','human-accept'], binding: {} };
let policy = new GrantPolicy([owner]);
async function profile() {
  const create = async () => {
    const runtime = await createNativeModels({ credentials: new InMemoryCredentialStore(), defaultModel: reference,
      providers: [fauxProvider({ provider: 'faux', models: [{ id: 'echo', name: 'Offline Echo', contextWindow: 128000, maxTokens: 8192 }] }).provider] });
    installFaux(runtime.models);
    return runtime;
  };
  const device = await create();
  return createNativeProfile({ policy, owner: policy.authenticate(owner.token), models: { defaultModel: reference, catalogue: device.catalogue, create },
    resolveSkill: async () => { throw Error('No fixture skills'); }, connectMcp: async () => ({ sources: [], close: async () => {} }) });
}
const options = { dataDir: join(root, 'data'), startDirs: [work], name: 'bb-package-fixture', provider: 'faux' };
let store = await Store.open({ ...options, profile: await profile() });
const session = await store.create({ name: 'same-native-work', cwd: work, model: reference, thinkingLevel: 'off' });
await store.close();
const bb = { id: 'bb', token: 'DISPOSABLE_PACKAGE_BB', actor: 'bb', source: 'bb', authority: 'human', permissions: ['read','write','control'],
  binding: { sessionId: session.id, conversationId: 1, bb: { providerId: 'pi-durable', threadId: 'packed-bb-root' } } };
policy = new GrantPolicy([owner, bb]); store = await Store.open({ ...options, profile: await profile() });
const server = createHttpServer(store, policy).listen(0, '127.0.0.1'); await once(server, 'listening');
const address = server.address(); assert.ok(address && typeof address === 'object');
const base = `http://127.0.0.1:${address.port}`;
const native = new DpiClient(base, owner.token).agent(session.id, 1);
const child = spawn(process.execPath, [join(fresh, 'node_modules/dpi-bb-adapter/dist/main.js')], { cwd: root,
  env: { PATH: process.env.PATH, HOME: home, LANG: 'C.UTF-8', DPI_BASE: base, DPI_TOKEN: bb.token, DPI_SESSION: session.id, DPI_CONVERSATION: '1', DPI_BB_THREAD: 'packed-bb-root', DPI_CWD: work },
  stdio: ['pipe', 'pipe', 'pipe'] });
let stderr = '', parseError;
child.stderr.on('data', data => { stderr += data; });
const messages = [], responses = new Map();
const lines = createInterface({ input: child.stdout });
lines.on('line', line => {
  let message; try { message = JSON.parse(line); } catch (error) { parseError = error; return; }
  messages.push(message);
  if (message.method && message.id !== undefined) {
    assert.equal(message.method, 'thread/getOwnerScope');
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: { providerId: 'pi-durable', threadId: 'packed-bb-root', providerThreadId: session.id, parentThreadId: null } }) + '\n');
  } else if (message.id !== undefined) responses.set(message.id, message);
});
async function until(predicate, label, ms = 12000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await predicate()) return; await new Promise(resolve => setTimeout(resolve, 25)); }
  throw Error(`Timed out: ${label}; retained ${root}`);
}
let sequence = 0;
async function request(method, params = {}) {
  const id = ++sequence; child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  await until(() => responses.has(id) || child.exitCode !== null, method);
  assert.equal(child.exitCode, null, `client unexpectedly exited; retained ${root}`);
  const response = responses.get(id); assert.ok(response && !response.error, `refused ${method}: ${JSON.stringify(response)}`); return response.result;
}
let terminal;
try {
  assert.equal((await request('initialize')).protocolVersion, 2);
  assert.ok((await request('model/list')).models.some(model => model.id === 'faux/echo' && model.isDefault));
  assert.equal((await request('thread/start', { threadId: 'packed-bb-root', providerThreadId: session.id })).providerThreadId, session.id);
  const params = { threadId: 'packed-bb-root', providerThreadId: session.id, clientRequestId: 'creq_23456789ab', input: [{ type: 'text', text: 'PACKED-BB-ONLY' }] };
  await request('turn/start', params);
  await until(async () => (await native.entries()).items.some(entry => entry.kind === 'pi.assistant' && entry.model?.some(message => message.role === 'assistant' && message.stopReason === 'stop' && JSON.stringify(message.content).includes('PACKED-BB-ONLY'))), 'actual successful native BB answer');
  await request('turn/start', params);
  assert.equal((await native.entries()).items.filter(entry => entry.kind === 'host.input').length, 1);
  const oldSdk = await load(join(old, 'node_modules/dpi-sdk/dist/client.js'));
  const { RemoteTerminal } = await load(join(old, 'node_modules/dpi-terminal-adapter/dist/remote-controller.js'));
  const cache = join(root, 'terminal-cache'); await mkdir(cache);
  terminal = await RemoteTerminal.open(new oldSdk.DpiClient(base, owner.token), session.id, cache);
  await until(() => terminal.current().connection === 'online', 'unchanged old terminal observation');
  await terminal.submit('OLD-TERMINAL-SAME-HOST', 'followUp');
  await until(() => terminal.current().conversation.entries.some(entry => entry.kind === 'pi.assistant' && JSON.stringify(entry.model).includes('OLD-TERMINAL-SAME-HOST')), 'unchanged old terminal native answer');
  assert.equal(terminal.current().session.id, session.id);
  assert.equal(terminal.current().conversation.conversation.id, 1);
  await terminal.close(); terminal = undefined;
  await request('thread/stop', { threadId: 'packed-bb-root', intent: 'release' });
  child.stdin.end(); await once(child, 'exit'); assert.equal(child.exitCode, 0);
  assert.equal(parseError, undefined, 'bare Node CLI stdout is exclusively JSON-RPC');
  assert.ok(!JSON.stringify(messages).includes(bb.token)); assert.ok(!stderr.includes(bb.token));
  assert.equal((await native.entries()).items.filter(entry => entry.kind === 'host.input').length, 2, 'both unchanged clients addressed SAME native conversation');
  const hashes = [];
  for (const file of archives) { const hash = createHash('sha256'); for await (const chunk of createReadStream(file)) hash.update(chunk); hashes.push({ path: file, sha256: hash.digest('hex') }); }
  assert.equal(hashes[3].sha256, '1f1b74fa2b515b55bf280113d91116c267755973b5ed76ce9a6389174c235bde');
  assert.equal(hashes[4].sha256, 'd98831740905de74cffc64243d1b2c54cd83e8e76a34c927fa2b5f139e1cdd43');
  const result = { result: 'PASS', root, hashes, nativeSessionId: session.id, nativeConversationId: 1,
    bareNodeCli: 'JSON-RPC initialization/model-list/authorized attach/input/dedup/release', oldTerminal: 'fresh offline install of UNCHANGED accepted terminal +oldSDK; native answer on same host/conversation',
    isolation: 'faux only, temporary HOME/dataDir, loopback, ignore-scripts installs (public backend dependencies; old terminal offline); artifacts retained' };
  await writeFile(join(root, 'RESULT.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result));
} finally {
  await terminal?.close();
  if (child.exitCode === null) { child.stdin.end(); child.kill('SIGTERM'); await once(child, 'exit'); }
  lines.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await store.close();
  await writeFile(join(root, 'client-stderr.log'), stderr);
  // Disposable candidate/evidence is intentionally retained; no dynamic recursive cleanup.
}
