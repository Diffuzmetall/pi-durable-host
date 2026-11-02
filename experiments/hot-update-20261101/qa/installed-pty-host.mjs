// Disposable native owner for independent installed PTY QA; sandbox only.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { once } from 'node:events';
assert.equal(process.env.HOME, '/scratch/home', 'Sandbox only; no live fallback');
const check = JSON.parse(await readFile('/scratch/sandbox-check.json', 'utf8'));
assert.equal(check.status, 'PASS'); assert.equal(check.child, 'PASS');
const infoPath = process.argv[2];
assert.ok(infoPath.startsWith('/scratch/tmp/'), 'Info must stay in disposable scratch');
const directory = dirname(infoPath), project = join(directory, 'project');
await mkdir(project);
const backend = '/candidate/node_modules/dpi-backend/dist/dpi-backend/src';
const load = name => import(pathToFileURL(`${backend}/${name}.js`).href);
const { BACKGROUND_CONTEXT: ctx } = await import('@earendil-works/chord/context');
const { InMemoryCredentialStore } = await import('@earendil-works/pi-ai');
const { fauxProvider, fauxAssistantMessage } = await import('@earendil-works/pi-ai/providers/faux');
const { Store } = await load('store');
const { createNativeProfile, createNativeModels, readResourceSettings } = await load('native-profile/profile');
const { connectSessionMcp } = await import(pathToFileURL('/candidate/session-mcp.mjs').href);
const { GrantPolicy } = await load('grants');
const { createHttpServer } = await load('http-server');
const { DpiClient } = await import(pathToFileURL('/candidate/node_modules/dpi-sdk/dist/client.js').href);
const selected = { provider: 'heidi-pty-faux', modelId: 'saved-pty-model' };
const credentials = new InMemoryCredentialStore();
await credentials.modify(selected.provider, async () => ({ type: 'api_key', key: 'SYNTHETIC_PTY_ONLY' }));
let modelCalls = 0;
const options = () => {
  const faux = fauxProvider({ provider: selected.provider, models: [{ id: selected.modelId, contextWindow: 100000, maxTokens: 4096 }], tokensPerSecond: 100000 });
  const reply = () => { modelCalls++; faux.appendResponses([reply]); return fauxAssistantMessage('HEIDI_PTY_NATIVE_REPLY'); };
  faux.setResponses([reply]);
  return { credentials, providers: [{ ...faux.provider, auth: { apiKey: { name: 'fixture', resolve: async ({ credential }) => ({ auth: { apiKey: credential.key } }) } } }] };
};
const makeModels = () => createNativeModels(options), discovery = await makeModels();
const owner = { id: 'heidi-pty', token: 'SYNTHETIC_PTY_OWNER', actor: 'operator', source: 'terminal', authority: 'human', permissions: ['read', 'write', 'control', 'filesystem', 'human-accept'], binding: {} };
const policy = new GrantPolicy([owner]);
const profile = createNativeProfile({ policy, owner: policy.authenticate(owner.token), models: { defaultModel: selected, catalogue: discovery.catalogue, create: makeModels },
  skills: async context => {
    const source = { cwd: context.cwd, projectRoot: context.cwd, homeDir: '/scratch/home', agentDir: '/scratch/home/.pi/agent', projectTrusted: true };
    return { ...source, ...await readResourceSettings(source) };
  },
  dcg: { binaryPath: join(directory, 'missing-dcg'), envSource: () => ({}) },
  connectMcp: async context => {
    const mcp = await connectSessionMcp(context, { agentDir: '/scratch/home/.pi/agent', projectTrusted: false, authorize: async () => {} });
    const prepare = mcp.prepareReload.bind(mcp);
    mcp.prepareReload = async () => {
      const prepared = await prepare();
      const injectFailure = existsSync(join(directory, 'retirement-fault'));
      return { ...prepared, drain: async () => {
        await prepared.drain();
        if (injectFailure) throw Error('PRIVATE_PTY_RETIREMENT_FAULT');
      } };
    };
    return mcp;
  } });
const store = await Store.open({ dataDir: join(directory, 'data'), startDirs: [project], name: 'Independent installed PTY', provider: 'faux', profile });
const server = createHttpServer(store, policy).listen(0, '127.0.0.1'); await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}`;
const client = new DpiClient(base, owner.token);
const session = await client.createSession({ name: 'Heidi installed PTY', cwd: project, model: selected });
const opened = store.opened.get(session.id), harness = opened.harness;
const root = await harness.root(ctx);
const startticks = (await readFile('/proc/self/stat', 'utf8')).split(') ')[1].split(' ')[19];
await writeFile(infoPath, JSON.stringify({ base, token: owner.token, sessionId: session.id, rootId: root.id, pid: process.pid, startticks, project }) + '\n');
let closing = false;
process.on('SIGTERM', async () => {
  if (closing) return; closing = true;
  const result = { status: 'FAIL', modelCalls, pid: process.pid, startticks, sessionId: session.id, rootId: (await harness.root(ctx)).id, sameHarness: store.opened.get(session.id).harness === harness };
  try {
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    await store.close(); result.status = 'PASS';
  } catch (error) { result.error = String(error); }
  await writeFile(`${infoPath}.result`, JSON.stringify(result) + '\n');
  process.exit(result.status === 'PASS' ? 0 : 1);
});
