// Independent resource-census probe. Product modules load only after sandbox admission.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, mkdtemp, readdir, readlink, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';

assert.equal(process.env.HOME, '/scratch/home', 'Sandbox only; no live fallback');
const check = JSON.parse(await readFile('/scratch/sandbox-check.json', 'utf8'));
assert.equal(check.status, 'PASS');
assert.equal(check.child, 'PASS');
assert.equal(typeof global.gc, 'function', 'Run with --expose-gc for named post-quiescence samples');
const candidate = '/candidate';
const backend = `${candidate}/node_modules/dpi-backend/dist/dpi-backend/src`;
const load = name => import(pathToFileURL(`${backend}/${name}.js`).href);
for (const name of ['@earendil-works/pi-durable', '@earendil-works/pi-ai', '@earendil-works/chord/context']) {
  assert.ok((await realpath(new URL(import.meta.resolve(name)))).startsWith(`${candidate}/`), `Noncandidate import: ${name}`);
}
const { BACKGROUND_CONTEXT: ctx } = await import('@earendil-works/chord/context');
const { InMemoryCredentialStore } = await import('@earendil-works/pi-ai');
const { fauxProvider, fauxAssistantMessage, fauxToolCall } = await import('@earendil-works/pi-ai/providers/faux');
const { Store } = await load('store');
const { GrantPolicy } = await load('grants');
const { createNativeProfile, createNativeModels } = await load('native-profile/profile');
const { createHttpServer } = await load('http-server');
const { DpiClient } = await import(pathToFileURL(`${candidate}/node_modules/dpi-sdk/dist/client.js`).href);
const { connectSessionMcp } = await import(pathToFileURL(`${candidate}/session-mcp.mjs`).href);
const directory = await mkdtemp('/scratch/tmp/heidi-installed-resources-');
const agentDir = join(directory, 'agent'), work = join(directory, 'project');
await mkdir(agentDir); await mkdir(work);
const report = { status: 'FAIL', candidate, directory, samples: [], checks: [], calls: [],
  externalBoundaries: ['faux model', 'synthetic owner credentials', 'local recording MCP HTTP server; not a vendor API'],
  realBoundaries: ['installed session MCP owner/Nico', 'Store', 'Harness', 'SQLite', 'HTTP', 'SDK', 'native ToolTask', 'Linux proc census'],
  limitations: ['MCP resource cohort only; not voice/memory resource acceptance', 'RSS/WeakRef samples require attribution; no automatic no-leak verdict'],
  productionActivation: 'NOT RUN' };
let endpoint, server, store, owner, ownerOpens = 0, initializations = 0;
const providers = new Map(), selected = { provider: 'heidi-resource-faux', modelId: 'exact-resource-model' };
const credentials = new InMemoryCredentialStore();
const policy = new GrantPolicy([{ id: 'qa-resource-owner', token: 'QA_RESOURCE_ONLY', actor: 'operator', source: 'terminal', authority: 'human',
  permissions: ['read', 'write', 'control', 'filesystem', 'human-accept'], binding: {} }]);
const models = id => createNativeModels(() => {
  const faux = fauxProvider({ provider: selected.provider, models: [{ id: selected.modelId, contextWindow: 128000, maxTokens: 8192 }], tokensPerSecond: 100000 });
  providers.set(id, faux);
  // Each generation of model behavior is stable; no retired providers accumulate per reload.
  return { credentials, providers: [faux.provider] };
});
const procIdentity = async () => ({ pid: process.pid, startticks: (await readFile('/proc/self/stat', 'utf8')).split(') ')[1].split(' ')[19] });
const weakSnapshots = [];
async function census(version) {
  // Calls and reload/drain have completed. Close only idle connections owned by this probe.
  server.closeIdleConnections(); endpoint.closeIdleConnections();
  await delay(200); global.gc(); await delay(25);
  const descriptors = [];
  for (const name of await readdir('/proc/self/fd')) {
    try { descriptors.push({ fd: Number(name), target: await readlink(`/proc/self/fd/${name}`) }); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const children = (await readFile(`/proc/self/task/${process.pid}/children`, 'utf8')).trim().split(/\s+/).filter(Boolean);
  const snapshot = { version, ...await procIdentity(), rss: process.memoryUsage().rss, heapUsed: process.memoryUsage().heapUsed,
    fd: descriptors.length, descriptors, children,
    handles: process._getActiveHandles().map(handle => handle.constructor.name).sort(),
    listeners: { hostRequest: server.listenerCount('request'), endpointRequest: endpoint.listenerCount('request') },
    ownerOpens, initializations, ownerStatus: owner.status(),
    // The report holds WeakRefs, not the old registry objects themselves.
    retainedRegistrySnapshots: weakSnapshots.filter(reference => reference.deref() !== undefined).length };
  report.samples.push(snapshot);
  return snapshot;
}
try {
  endpoint = createServer(async (request, response) => {
    try {
      if (request.method !== 'POST') { response.writeHead(405).end(); return; }
      let raw = ''; for await (const bytes of request) raw += bytes;
      const message = JSON.parse(raw), version = Number(new URL(request.url, 'http://fixture').searchParams.get('v'));
      if (message.id === undefined) { response.writeHead(202).end(); return; }
      let result = {};
      if (message.method === 'initialize') {
        initializations++;
        result = { protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'resource', version: String(version) } };
      } else if (message.method === 'tools/list') {
        result = { tools: [{ name: 'echo', description: `RESOURCE_VERSION_${version}`, inputSchema: { type: 'object', properties: {} } }] };
      } else if (message.method === 'tools/call') {
        report.calls.push({ version, id: message.id, name: message.params.name });
        result = { content: [{ type: 'text', text: `RESOURCE_RESULT_${version}` }] };
      }
      response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }));
    } catch (error) {
      report.endpointError = String(error); response.writeHead(500).end();
    }
  }).listen(0, '127.0.0.1');
  await once(endpoint, 'listening');
  const configure = version => writeFile(join(agentDir, 'mcp-adapter.json'), JSON.stringify({ mcpServers: { resource: {
    url: `http://127.0.0.1:${endpoint.address().port}/mcp?v=${version}`, exposure: 'direct',
  } } }));
  await configure(0);
  const catalogue = await models('catalogue');
  const profile = createNativeProfile({ policy, owner: policy.authenticate('QA_RESOURCE_ONLY'),
    models: { defaultModel: selected, catalogue: catalogue.catalogue, create: context => models(context.sessionId) },
    dcg: { binaryPath: join(directory, 'missing-dcg'), envSource: () => ({}) },
    connectMcp: async context => {
      ownerOpens++; assert.equal(ownerOpens, 1, 'A reload must not construct a second session owner');
      owner = await connectSessionMcp(context, { agentDir, projectTrusted: false, authorize: async () => {} });
      return owner;
    } });
  store = await Store.open({ dataDir: join(directory, 'data'), startDirs: [work], profile, provider: 'faux' });
  server = createHttpServer(store, policy).listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`, client = new DpiClient(base, 'QA_RESOURCE_ONLY');
  const session = await client.createSession({ name: 'resource-census', cwd: work, model: selected });
  const opened = store.opened.get(session.id), harness = opened.harness, root = await harness.root(ctx);
  report.identity = { ...await procIdentity(), session: session.id, root: root.id };
  const guard = opened.profile.registry.snapshot().extension('host.native-current-owner');
  const invoke = async version => {
    providers.get(session.id).setResponses([fauxAssistantMessage(fauxToolCall('mcp__resource__echo', {}), { stopReason: 'toolUse' }), fauxAssistantMessage('done')]);
    const response = await fetch(`${base}/v1/sessions/${session.id}/agents/main/messages`, {
      method: 'POST', headers: { authorization: 'Bearer QA_RESOURCE_ONLY', 'content-type': 'application/json' },
      body: JSON.stringify({ requestId: `resource-${version}`, content: `resource cycle ${version}`, waitMs: 10000 }),
    });
    const body = await response.text(); assert.equal(response.status, 200, body);
    const entries = (await root.entries({}, 500, undefined, ctx)).items;
    assert.match(JSON.stringify(entries), new RegExp(`RESOURCE_RESULT_${version}`));
    assert.equal(report.calls.filter(call => call.version === version).length, 1, `One admitted effect per cycle ${version}`);
  };
  const replace = async version => {
    weakSnapshots.push(new WeakRef(opened.profile.registry.snapshot()));
    await configure(version);
    const result = await client.session(session.id).reload();
    assert.equal(result.cleanup, undefined, 'Resource retirement must finish before a successful census');
    assert.equal(store.opened.get(session.id), opened); assert.equal(opened.harness, harness);
    assert.equal((await harness.root(ctx)).id, root.id);
    assert.equal(opened.profile.registry.snapshot().extension('host.native-current-owner'), guard);
    assert.match(opened.profile.registry.snapshot().tools().find(({ tool }) => tool.name === 'mcp__resource__echo').tool.description, new RegExp(`RESOURCE_VERSION_${version}`));
    await invoke(version);
  };
  // Warm the same real HTTP/native ToolTask path before naming the baseline.
  await invoke(0); await replace(1);
  const baseline = await census(1);
  report.baseline = 'sample version 1: one warm resource replacement, completed native call, idle sockets closed, forced GC';
  for (let version = 2; version <= 21; version++) {
    await replace(version);
    const sample = await census(version);
    assert.equal(sample.fd, baseline.fd, `FD count after completed resource swap ${version}`);
    assert.deepEqual(sample.children, baseline.children, `Child count after completed resource swap ${version}`);
    assert.deepEqual(sample.handles, baseline.handles, `Active handle census after completed resource swap ${version}`);
    assert.deepEqual(sample.listeners, baseline.listeners, `Listener census after completed resource swap ${version}`);
    assert.equal(sample.ownerStatus.configuredServers.length, 1);
    assert.equal(sample.ownerStatus.servers.length, 1);
    assert.equal(sample.ownerOpens, 1);
    assert.equal(sample.initializations, version + 1);
  }
  assert.equal(report.calls.length, 22);
  assert.equal(report.endpointError, undefined);
  assert.deepEqual(await procIdentity(), { pid: report.identity.pid, startticks: report.identity.startticks });
  report.checks.push('20 post-warmup real MCP replacements and native calls; one installed session owner and unchanged Harness/root',
    'Every post-quiescence FD/child/handle/listener count equals the named warm baseline',
    'Versioned raw OS, RSS, heap and WeakRef cohort samples preserved for independent attribution');
  report.status = 'PASS';
} catch (error) {
  report.error = String(error?.stack ?? error); process.exitCode = 1;
} finally {
  try {
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    if (store) await store.close();
    if (endpoint) { endpoint.closeAllConnections(); await new Promise(resolve => endpoint.close(resolve)); }
  } catch (error) { report.status = 'FAIL'; report.closeError = String(error); process.exitCode = 1; }
  report.finalOwnerStatus = owner?.status();
  await writeFile(join(directory, 'result.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ status: report.status, evidence: directory, error: report.error, productionActivation: 'NOT RUN' }));
}
