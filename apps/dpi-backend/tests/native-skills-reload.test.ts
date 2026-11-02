import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { InMemoryCredentialStore } from '@earendil-works/pi-ai';
import { createRegistry, defineExtension } from '@earendil-works/pi-durable';
import { fauxProvider, fauxAssistantMessage } from '@earendil-works/pi-ai/providers/faux';
import { Store } from '../src/store.js';
import { GrantPolicy } from '../src/grants.js';
import { createNativeProfile, createNativeModels } from '../src/native-profile/profile.js';
import { createHttpServer } from '../src/http-server.js';
import { DpiClient } from '../../dpi-sdk/src/client.js';
import { createNativeSkills, readResourceSettings } from '../src/native-profile/skills/index.js';

async function put(path: string, text: string) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, text);
}
const skill = (name: string) => `---\nname: ${name}\ndescription: Fixture ${name}\n---\nBODY_${name}\n`;
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'hot-skills-'));
  const cwd = join(root, 'project'), homeDir = join(root, 'home'), agentDir = join(homeDir, '.pi/agent');
  await mkdir(cwd, { recursive: true }); await mkdir(agentDir, { recursive: true });
  return { root, options: { cwd, projectRoot: cwd, homeDir, agentDir, projectTrusted: true } };
}

test('resource settings are explicit read-only discovery data; malformed and untrusted settings cannot publish', async () => {
  const { root, options } = await fixture();
  try {
    await put(join(options.agentDir, 'settings.json'), JSON.stringify({ skills: ['skills/global'], model: 'ignored', packages: [] }));
    await put(join(options.cwd, '.pi/settings.json'), JSON.stringify({ skills: ['skills/local'] }));
    assert.deepEqual(await readResourceSettings(options), { globalSettings: { skills: ['skills/global'], packages: [] }, projectSettings: { skills: ['skills/local'] } });
    await put(join(options.cwd, '.pi/settings.json'), '{broken');
    await assert.rejects(readResourceSettings(options), /RESOURCE_SETTINGS_INVALID/);
    assert.deepEqual((await readResourceSettings({ ...options, projectTrusted: false })).projectSettings, {});
    await put(join(options.cwd, '.pi/settings.json'), JSON.stringify({ packages: [{ source: 'local', skills: [4] }] }));
    await assert.rejects(readResourceSettings(options), /RESOURCE_SETTINGS_INVALID/);
    await put(join(options.cwd, '.pi/settings.json'), JSON.stringify({ skills: 'not-an-array' }));
    await assert.rejects(readResourceSettings(options), /RESOURCE_SETTINGS_INVALID/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('settings reader rejects foreign canonical paths and file symlinks without leaking contents', async () => {
  const { root, options } = await fixture();
  try {
    const foreign = join(root, 'foreign');
    await put(join(foreign, 'settings.json'), '{PRIVATE_SETTINGS_SENTINEL');
    await symlink(foreign, join(options.cwd, '.pi'));
    await assert.rejects(readResourceSettings(options), error => error instanceof Error && error.message === 'RESOURCE_SETTINGS_INVALID');
    await rm(join(options.cwd, '.pi'));
    await mkdir(join(options.cwd, '.pi'));
    await symlink(join(foreign, 'settings.json'), join(options.cwd, '.pi/settings.json'));
    await assert.rejects(readResourceSettings(options), /RESOURCE_SETTINGS_INVALID/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('prepared settings publish only on success; context and skill add/change/remove are reread', async () => {
  const { root, options } = await fixture();
  try {
    const file = join(options.cwd, '.pi/skills/one/SKILL.md');
    await put(file, skill('one'));
    await put(join(options.cwd, 'AGENTS.md'), 'CONTEXT_V1');
    const service = createNativeSkills(options);
    assert.deepEqual((await service.catalogue()).skills.map(s => s.name), ['one']);
    const prepared = await service.prepareReload({ projectSettings: { skills: ['-skills/one'] } });
    assert.deepEqual((await service.catalogue()).skills.map(s => s.name), ['one']);
    prepared.publish();
    assert.equal((await service.catalogue()).skills.length, 0);
    await put(file, skill('two'));
    await put(join(options.cwd, 'AGENTS.md'), 'CONTEXT_V2');
    (await service.prepareReload({})).publish();
    const context = await service.context();
    assert.deepEqual(context.skills.map(s => s.name), ['two']);
    assert.match(context.sections.project_context, /CONTEXT_V2/);
    assert.doesNotMatch(context.sections.project_context, /CONTEXT_V1/);
    await rm(file);
    assert.equal((await service.catalogue()).skills.length, 0);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('missing packages never install, and failed discovery preserves active settings', async () => {
  const { root, options } = await fixture();
  try {
    await put(join(options.cwd, '.pi/skills/one/SKILL.md'), skill('one'));
    const service = createNativeSkills(options);
    await assert.rejects(service.prepareReload({ globalSettings: {
      packages: ['npm:hot-update-missing-fixture@0.0.0'], npmCommand: ['MUST_NOT_EXECUTE'],
    }, projectSettings: { skills: ['-skills/one'] } }), /NATIVE_SKILLS_RELOAD_INVALID/);
    assert.deepEqual((await service.catalogue()).skills.map(s => s.name), ['one']);
    await put(join(options.cwd, '.pi/skills/bad/SKILL.md'), '---\nname: [bad YAML\n---\ninvalid');
    await assert.rejects(service.prepareReload({}), /NATIVE_SKILLS_RELOAD_INVALID/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('real Host HTTP/SDK reload refreshes settings and native prompt without reopening sessions', { timeout: 30000 }, async () => {
  const { root, options } = await fixture();
  const selected = { provider: 'skills-reload-faux', modelId: 'fixture' };
  const policy = new GrantPolicy([{ id: 'owner', token: 'synthetic-owner', actor: 'operator', source: 'terminal', authority: 'human',
    permissions: ['read', 'write', 'control', 'filesystem', 'human-accept'], binding: {} }]);
  const credentials = new InMemoryCredentialStore();
  const prompts: string[] = [];
  const makeModels = () => createNativeModels(() => {
    const faux = fauxProvider({ provider: selected.provider, models: [{ id: selected.modelId, contextWindow: 128000, maxTokens: 1024 }], tokensPerSecond: 100000 });
    // Durable retains earlier system snapshots in history. Assert the current
    // PromptInput, not immutable prompt entries from previous generations.
    faux.setResponses([transcript => { prompts.push(JSON.stringify(transcript.messages.filter(message => message.role === 'system').at(-1))); return fauxAssistantMessage('captured'); }]);
    return { credentials, providers: [faux.provider] };
  });
  const discovery = await makeModels();
  let adapterEnabled = false;
  const profile = createNativeProfile({ policy, owner: policy.authenticate('synthetic-owner'),
    loadAdapters: async () => adapterEnabled ? [base => {
      const registry = createRegistry();
      for (const extension of base.snapshot().installed()) registry.install(extension);
      registry.install(defineExtension({ name: 'discovery-addon' }));
      return registry;
    }] : [],
    models: { defaultModel: selected, catalogue: discovery.catalogue, create: makeModels },
    skills: async context => ({ ...options, projectRoot: context.cwd, ...await readResourceSettings({ ...options, cwd: context.cwd }) }),
    dcg: { binaryPath: join(root, 'absent-dcg'), envSource: () => ({}) },
    connectMcp: async () => ({ sources: [], close: async () => {} }),
  });
  const store = await Store.open({ dataDir: join(root, 'data'), startDirs: [options.cwd], name: 'skills-reload', provider: 'faux', profile });
  const server = createHttpServer(store, policy).listen(0, '127.0.0.1'); await once(server, 'listening');
  const client = new DpiClient(`http://127.0.0.1:${(server.address() as AddressInfo).port}`, 'synthetic-owner');
  try {
    await put(join(options.cwd, '.pi/skills/one/SKILL.md'), skill('one'));
    await put(join(options.cwd, 'AGENTS.md'), 'NATIVE_CONTEXT_V1');
    const a = await client.createSession({ name: 'A', cwd: options.cwd, model: selected });
    const b = await client.createSession({ name: 'B', cwd: options.cwd, model: selected });
    await client.agent(a.id, 1).send('capture before', 'followUp', 'before', 5000);
    assert.match(prompts.at(-1)!, /NATIVE_CONTEXT_V1/);
    assert.match(prompts.at(-1)!, /<name>one<\/name>/);
    await put(join(options.cwd, '.pi/settings.json'), JSON.stringify({ skills: ['-skills/one'] }));
    await put(join(options.cwd, 'AGENTS.md'), 'NATIVE_CONTEXT_V2');
    assert.equal((await client.session(a.id).reload()).sessionId, a.id);
    assert.deepEqual(await client.session(a.id).skills(), []);
    assert.deepEqual((await client.session(b.id).skills()).map(s => s.name), ['one']);
    await client.agent(a.id, 1).send('capture after', 'followUp', 'after', 5000);
    assert.match(prompts.at(-1)!, /NATIVE_CONTEXT_V2/);
    assert.doesNotMatch(prompts.at(-1)!, /<name>one<\/name>/);
    await put(join(options.cwd, '.pi/settings.json'), '{bad-json');
    await assert.rejects(client.session(a.id).reload());
    assert.deepEqual(await client.session(a.id).skills(), []);
    assert.deepEqual((await client.session(b.id).skills()).map(s => s.name), ['one']);
    assert.equal((await client.session(a.id).get()).id, a.id);
    await put(join(options.cwd, '.pi/settings.json'), JSON.stringify({ skills: ['-skills/one'] }));
    const baseCount = (await client.session(a.id).reload()).extensions;
    adapterEnabled = true;
    assert.equal((await client.session(a.id).reload()).extensions, baseCount + 1);
    adapterEnabled = false;
    assert.equal((await client.session(a.id).reload()).extensions, baseCount);
    assert.deepEqual((await client.session(b.id).skills()).map(s => s.name), ['one']);
  } finally {
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    await store.close(); await rm(root, { recursive: true, force: true });
  }
});

test('settings publication stays session-local and never trusts project resources implicitly', async () => {
  const { root, options } = await fixture();
  try {
    await put(join(options.cwd, '.pi/skills/one/SKILL.md'), skill('one'));
    const a = createNativeSkills(options), b = createNativeSkills(options);
    const untrusted = createNativeSkills({ ...options, projectTrusted: false });
    (await a.prepareReload({ projectSettings: { skills: ['-skills/one'] } })).publish();
    assert.equal((await a.catalogue()).skills.length, 0);
    assert.deepEqual((await b.catalogue()).skills.map(s => s.name), ['one']);
    (await untrusted.prepareReload({ projectSettings: { skills: [join(options.cwd, '.pi/skills/one')] } })).publish();
    assert.equal((await untrusted.catalogue()).skills.length, 0);
    await assert.rejects(a.catalogue(options.homeDir), /WORKSPACE_MISMATCH/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
