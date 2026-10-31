import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { BACKGROUND_CONTEXT as ctx } from '@earendil-works/chord/context';
import { fauxProvider, fauxAssistantMessage, fauxText, fauxToolCall } from '@earendil-works/pi-ai/providers/faux';
import { loadRegistryAdapters } from '@local/pi-durable-reload';
import { DpiClient } from '../../dpi-sdk/dist/client.js';
import { RemoteTerminal } from '../../terminal-adapter/src/remote-controller.js';
import { createNativeProfile } from '../src/native-profile/profile.js';
import { createExternalDirectories } from '../src/native-profile/external-dirs/index.js';
import { GrantPolicy } from '../src/grants.js';
import { createHttpServer } from '../src/http-server.js';
import { Store } from '../src/store.js';
import type { RuntimeComposition, RuntimeProfileContext } from '../src/runtime-profile.js';
import { faux, tempStore, until } from './helpers.js';

test('native directory adapter attaches/removes/reattaches via HTTP reload on the SAME live Durable Harness without bind or restart', async () => {
  const temp = await tempStore();
  const external = join(temp.root, 'external');
  await mkdir(join(external, '.pi/skills/live'), { recursive: true });
  await writeFile(join(external, 'AGENTS.md'), 'HOT_DIRECTORY_CONTEXT_V1');
  await writeFile(join(external, '.pi/skills/live/SKILL.md'), '---\nname: live\ndescription: HOT_SKILL_METADATA\n---\nHOT_SKILL_BODY');
  const adapterFile = join(temp.root, 'external-adapter.mjs');
  const adapterSource = fileURLToPath(new URL('../src/native-profile/external-dirs/adapter.ts', import.meta.url));
  const options = { cwd: temp.work, homeDir: temp.root, allowedRoots: [temp.root] };
  // Synthetic authority in a disposable fixture only. Production bootstrap must check CURRENT grants.
  await writeFile(adapterFile, `import {createExternalDirectoryAdapter} from ${JSON.stringify(adapterSource)};\nexport default createExternalDirectoryAdapter({...${JSON.stringify(options)},authorize:()=>{}});`);
  let enabled = false;
  let closes = 0;
  const token = 'disposable-hot-dir-owner';
  const policy = new GrantPolicy([{ id: 'owner', token, actor: 'fixture', source: 'terminal', authority: 'human',
    permissions: ['read', 'write', 'control', 'filesystem', 'human-accept'], binding: {} }]);
  const native = createNativeProfile({ policy, owner: policy.authenticate(token),
    dcg: { binaryPath: join(temp.root, 'absent-dcg'), envSource: () => ({}) },
    loadAdapters: context => enabled ? loadRegistryAdapters([adapterFile], context.cwd) : Promise.resolve([]),
    connectMcp: async () => ({ sources: [], close: async () => { closes++; } }),
  });
  const compositions = new Map<string, RuntimeComposition>();
  const profile = Object.assign(async (context: RuntimeProfileContext) => {
    const composition = await native(context);
    compositions.set(context.sessionId, composition);
    return composition;
  }, { id: native.id, capabilities: native.capabilities });
  const store = await Store.open({ ...temp.options, profile });
  const server = createHttpServer(store, policy).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert(address && typeof address !== 'string');
  const client = new DpiClient(`http://127.0.0.1:${address.port}`, token);
  let terminal: RemoteTerminal | undefined;
  try {
    const session = await store.create({ name: 'hot-external', cwd: temp.work, model: faux });
    const other = await store.create({ name: 'untouched', cwd: temp.work, model: faux });
    const { h, c, row } = await store.resolveAgent(session.id, 'main');
    terminal = await RemoteTerminal.open(client, session.id, join(temp.root, 'terminal-cache'));
    await until(async () => terminal!.current().externalDirectories?.length === 0, 10000, 'empty directory doc received over SSE');
    await store.resolveAgent(other.id, 'main');
    const hasTool = (id: string) => compositions.get(id)!.registry.snapshot().tools().some(({ tool }) => tool.name === 'add_directory');
    assert(!hasTool(session.id));
    enabled = true;
    await client.session(session.id).reload();
    assert.equal((await store.resolveAgent(session.id, 'main')).h, h);
    assert(hasTool(session.id));
    assert(!hasTool(other.id));
    assert.equal(closes, 0);
    const provider = fauxProvider({ provider: 'faux', models: [{ id: 'echo', contextWindow: 128000, maxTokens: 8192 }], tokensPerSecond: 100000 });
    const requests: unknown[] = [];
    provider.setResponses([
      () => fauxAssistantMessage(fauxToolCall('add_directory', { path: external }), { stopReason: 'toolUse' }),
      request => { requests.push(request); return fauxAssistantMessage(fauxText('added')); },
      request => { requests.push(request); return fauxAssistantMessage(fauxText('after-hot-reload')); },
    ]);
    store.models.setProvider(provider.provider);
    const first = await store.send(c, { content: 'add fixture', requestId: 'hot-native-add' });
    assert.equal((await store.settled(h, first.id as number, 15000)).status, 'done');
    const direct = createExternalDirectories({ ...options, authorize: () => {} });
    direct.bind(h);
    assert.equal((await direct.list(c.id, ctx))[0]?.absolutePath, external);
    await until(async () => terminal!.current().externalDirectories?.[0]?.absolutePath === external, 10000, 'directory strip data arrives over real SSE');
    const child = await store.createAgent(row, { name: 'no-inherited-dirs' });
    const childDocument = await client.agent(session.id, child.id).doc<{ directories: unknown[] }>('pi.external-directories');
    assert.deepEqual(childDocument.value, { directories: [] }, 'server must never project another conversation owners map');
    await terminal.switchConversation(child.id);
    assert(!terminal.current().externalDirectories?.length, 'switch clears prior conversation metadata synchronously');
    await until(async () => terminal!.current().externalDirectories?.length === 0, 10000, 'child receives its empty list');
    await terminal.switchConversation(c.id as number);
    await until(async () => terminal!.current().externalDirectories?.length === 1, 10000, 'root list restored without local saved directory state');
    // Removing adapter code does not delete state; reattachment uses current invocation access.
    enabled = false;
    await client.session(session.id).reload();
    assert(!hasTool(session.id));
    await writeFile(join(external, 'AGENTS.md'), 'HOT_DIRECTORY_CONTEXT_V2');
    enabled = true;
    await client.session(session.id).reload();
    assert(hasTool(session.id));
    assert.equal((await store.resolveAgent(session.id, 'main')).h, h);
    const second = await store.send(c, { content: 'read current directory context', requestId: 'hot-native-after-reload' });
    assert.equal((await store.settled(h, second.id as number, 15000)).status, 'done');
    assert.match(JSON.stringify(requests.at(-1)), /HOT_DIRECTORY_CONTEXT_V2/);
    assert.match(JSON.stringify(requests.at(-1)), /HOT_SKILL_METADATA/);
    assert(!JSON.stringify(requests.at(-1)).includes('HOT_SKILL_BODY'), 'skill bodies stay out of automatic context');
    assert.equal(closes, 0, 'reload must not close session MCP/resources');
    assert(!hasTool(other.id));
    await direct.remove(c.id, external, ctx);
    await until(async () => terminal!.current().externalDirectories?.length === 0, 10000, 'live removal clears the strip');
  } finally {
    await terminal?.close();
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await store.close();
    await temp.cleanup();
  }
});
