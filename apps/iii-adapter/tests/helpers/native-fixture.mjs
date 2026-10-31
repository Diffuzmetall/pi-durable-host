import { pathToFileURL } from 'node:url';
import { once, EventEmitter } from 'node:events';
import { createServer } from 'node:net';
import { mkdir, realpath, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fingerprint } from '../../src/auth.js';
import { workerConfig } from '../../src/config.js';

/** Test SERVER owner only. Production adapter code never imports this module or a native runtime. */
export async function nativeFixture({ backendRoot, root, engineUrl, publicKey }) {
  // Native test runner enables Node's parent-URL resolver; honor public import-only exports.
  const parent = pathToFileURL(join(backendRoot, 'package.json')).href;
  const load = specifier => import(import.meta.resolve(specifier, parent));
  const [{ Store }, { GrantPolicy, createHttpServer }, { createNativeProfile, createNativeModels }, ai, faux] = await Promise.all([
    load('dpi-backend/store'), load('dpi-backend/server'), load('dpi-backend/native-profile'),
    load('@earendil-works/pi-ai'), load('@earendil-works/pi-ai/providers/faux'),
  ]);
  await mkdir(join(root, 'work'), { recursive: true });
  const work = await realpath(join(root, 'work'));
  await writeFile(join(work, 'fixture.txt'), 'DISPOSABLE_III_READ_ONLY_FIXTURE\n');
  const ownerToken = `fixture-owner-${randomUUID()}`, delegatedToken = `fixture-iii-${randomUUID()}`;
  const owner = { id: 'fixture-owner', token: ownerToken, actor: 'fixture-owner', source: 'terminal', authority: 'human',
    permissions: ['read', 'write', 'control', 'filesystem', 'human-accept'], binding: {} };
  const reference = { provider: 'iii-fixture-only', modelId: 'exact/native-faux' };
  const generations = new Map(), events = new EventEmitter();
  let respond = async text => faux.fauxAssistantMessage(`NATIVE_III_ANSWER:${text}`);
  async function configured() {
    const provider = faux.fauxProvider({ provider: reference.provider, models: [{ id: reference.modelId, contextWindow: 131072, maxTokens: 32768 }], tokensPerSecond: 1000000 });
    provider.setResponses(Array.from({ length: 200 }, () => async transcript => {
      const last = transcript.messages.findLast(message => message.role === 'user');
      const text = typeof last?.content === 'string' ? last.content : (last?.content ?? []).filter(item => item.type === 'text').map(item => item.text).join('');
      generations.set(text, (generations.get(text) ?? 0) + 1);
      events.emit('generation', text);
      return respond(text, transcript, faux);
    }));
    return createNativeModels({ credentials: new ai.InMemoryCredentialStore(), providers: [provider.provider] });
  }
  const catalogue = await configured();
  let policy = new GrantPolicy([owner]), store, server;
  const options = { dataDir: join(root, 'native-data'), startDirs: [work], name: 'disposable-iii-native', provider: 'faux' };
  const build = () => createNativeProfile({ policy, owner: policy.authenticate(ownerToken),
    models: { defaultModel: reference, catalogue: catalogue.catalogue, create: configured },
    resolveSkill: async () => { throw Error('No fixture skills'); }, connectMcp: async () => ({ sources: [], close: async () => {} }) });
  const open = () => Store.open({ ...options, profile: build() });
  store = await open();
  const session = await store.create({ name: 'Actual native iii fixture', cwd: work, model: reference });
  await store.close();
  const reservation = createServer(); reservation.listen(0, '127.0.0.1'); await once(reservation, 'listening');
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const config = workerConfig({ version: 2, optIn: true, contractVersion: 2, sessionId: 'disposable-worker-binding', workspace: work,
    namespace: 'durable-pi-test-fixture', url: engineUrl, publicKey,
    host: { baseUrl: `http://127.0.0.1:${port}`, sessionId: session.id, agentId: 1, tokenEnv: 'III_FIXTURE_DPI_TOKEN' } }).value;
  const grant = { id: 'fixture-iii', token: delegatedToken, actor: 'fixture-iii', source: 'iii', authority: 'delegated',
    permissions: ['read', 'write', 'control', 'filesystem'], binding: { sessionId: session.id, conversationId: 1,
      iii: { bindingId: config.sessionId, namespace: config.namespace, configHash: fingerprint(config), workerId: fingerprint(publicKey) } } };
  const start = async () => {
    policy = new GrantPolicy([owner, grant]);
    store = await open();
    server = createHttpServer(store, policy).listen(port, '127.0.0.1');
    await once(server, 'listening');
  };
  const stop = async () => {
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); server = undefined; }
    if (store) await store.close();
  };
  await start();
  return {
    config, delegatedToken, ownerToken, work, generations, events,
    setResponder(callback) { respond = callback; },
    get store() { return store; },
    waitSubmission(submissionId) { return store.settled(store.harness(store.resolveSession(session.id)), submissionId, 20000); },
    async pauseAbort(conversationId) {
      const harness = store.harness(store.resolveSession(session.id)), original = harness.conversation.bind(harness);
      let unblock, entered;
      const gate = new Promise(resolve => { unblock = resolve; }), reached = new Promise(resolve => { entered = resolve; });
      harness.conversation = async (...args) => {
        const handle = await original(...args);
        if (handle && args[0] === conversationId) {
          const abort = handle.abort.bind(handle);
          handle.abort = async (...abortArgs) => { entered(); await gate; return abort(...abortArgs); };
        }
        return handle;
      };
      return { reached, release() { harness.conversation = original; unblock(); } };
    },
    revoke() { return policy.revoke(grant.id); },
    async reopen() { await stop(); await start(); },
    close: stop,
  };
}
