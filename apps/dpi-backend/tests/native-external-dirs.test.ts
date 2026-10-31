import assert from 'node:assert/strict';
import { mkdir, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import type { ConversationId } from '@earendil-works/pi-durable';
import { BACKGROUND_CONTEXT as ctx } from '@earendil-works/chord/context';
import { fauxProvider, fauxAssistantMessage, fauxText, fauxToolCall } from '@earendil-works/pi-ai/providers/faux';
import { createExternalDirectories } from '../src/native-profile/external-dirs/index.js';
import { minimalProfile, type RuntimeComposition, type RuntimeProfileContext, type RuntimeProfileFactory } from '../src/runtime-profile.js';
import { Store } from '../src/store.js';
import { faux, tempStore } from './helpers.js';

const root = 1 as ConversationId;
async function fixture() {
  const temp = await tempStore();
  const external = join(temp.root, 'external');
  await mkdir(join(external, '.agents/skills/foreign'), { recursive: true });
  await writeFile(join(external, 'AGENTS.md'), 'EXTERNAL_AGENT_INSTRUCTIONS');
  await writeFile(join(external, 'CLAUDE.md'), 'EXTERNAL_CLAUDE_INSTRUCTIONS');
  await writeFile(join(external, '.agents/skills/foreign/SKILL.md'), '---\nname: foreign\ndescription: External fixture\n---\nFOREIGN_BODY\n');
  await mkdir(join(external, 'src'));
  await writeFile(join(external, 'src/file.ts'), 'fixture');
  const services = new Map<string, ReturnType<typeof createExternalDirectories>>();
  let revoked = false;
  let readsRevoked = false;
  const profile: RuntimeProfileFactory = Object.assign((context: RuntimeProfileContext): RuntimeComposition => {
    const base = minimalProfile(context);
    const service = createExternalDirectories({ cwd: context.cwd, homeDir: temp.root, allowedRoots: [temp.root],
      authorize: async (_owner, action) => { if (readsRevoked || (revoked && action === 'manage')) throw Error('fixture grant revoked'); },
    });
    base.registry.install(service.extension);
    services.set(context.sessionId, service);
    return { ...base, extensions: [...base.extensions, service.extension], bind: async harness => { service.bind(harness); } };
  }, { id: 'external-dirs-fixture@1' });
  let store = await Store.open({ ...temp.options, profile });
  const session = await store.create({ name: 'external-dirs', cwd: temp.work, model: faux });
  const { row } = await store.resolveAgent(session.id, 'main');
  const child = (await store.createAgent(row, { name: 'isolated-child' })).id as ConversationId;
  return { child, temp, external, session,
    get store() { return store; },
    get service() { return services.get(session.id)!; },
    services,
    revoke() { revoked = true; },
    revokeReads() { readsRevoked = true; },
    async reopen() { await store.close(); store = await Store.open({ ...temp.options, profile }); await store.resolveAgent(session.id, 'main'); },
    async close() { await store.close(); await temp.cleanup(); },
  };
}

test('native external directories persist across owner reopen without cwd/session/conversation leakage', async () => {
  const f = await fixture();
  try {
    const selected = await f.service.add(root, f.external, ctx);
    assert.deepEqual(selected.skills, ['foreign']);
    assert.equal((await f.service.list(root, ctx)).length, 1);
    assert.equal((await f.service.list(f.child, ctx)).length, 0);
    const other = await f.store.create({ name: 'same-cwd-other-session', cwd: f.temp.work, model: faux });
    await f.store.resolveAgent(other.id, 'main');
    assert.deepEqual(await f.services.get(other.id)!.list(root, ctx), []);
    await f.reopen();
    assert.equal((await f.service.list(root, ctx))[0].absolutePath, f.external);
    assert.match((await f.service.getSkill(root, 'foreign', ctx)).content, /FOREIGN_BODY/);
    const skills = await f.service.catalogue(root, ctx);
    assert(!JSON.stringify(skills).includes('FOREIGN_BODY'), 'metadata never includes full skill texts');
    await assert.rejects(f.service.getSkill(f.child, 'foreign', ctx), /UNAVAILABLE/);
    await f.service.remove(root, 'external', ctx);
    assert.deepEqual(await f.service.catalogue(root, ctx), []);
  } finally { await f.close(); }
});

test('native core denies outside roots, context symlink escape and revoked mutations without changing directory state', async () => {
  const f = await fixture();
  try {
    await assert.rejects(f.service.add(root, '/etc', ctx), /OUTSIDE_ALLOWED_ROOTS/);
    await assert.rejects(f.service.add(root, f.temp.work, ctx), /ALREADY_CWD/);
    const escaped = join(f.temp.root, 'escape');await mkdir(escaped);
    await symlink(join(f.temp.work, 'AGENTS.md'), join(escaped, 'AGENTS.md'));
    await writeFile(join(f.temp.work, 'AGENTS.md'), 'NEVER_FOLLOW_EXTERNAL_CONTEXT_LINK');
    await assert.rejects(f.service.add(root, escaped, ctx), /SYMLINK_ESCAPE/);
    assert.deepEqual(await f.service.list(root, ctx), []);
    f.revoke();
    await assert.rejects(f.service.add(root, f.external, ctx), /revoked/);
    assert.deepEqual(await f.service.list(root, ctx), []);
  } finally { await f.close(); }
});

test('bounded external search skips extension execution, symlink traversal and ignored directories; context and bodies refresh live', async () => {
  const f = await fixture();
  try {
    await mkdir(join(f.external, '.pi/extensions'), { recursive: true });
    await writeFile(join(f.external, '.pi/extensions/danger.ts'), "throw Error('MUST_NOT_EXECUTE');");
    await mkdir(join(f.external, 'node_modules/ignored'), { recursive: true });
    await writeFile(join(f.external, 'node_modules/ignored/fake.ts'), 'ignored');
    await symlink('/etc', join(f.external, 'outside'));
    await f.service.add(root, f.external, ctx);
    const result = await f.service.search(root, 'src/**/*.ts', 20, ctx);
    assert.deepEqual(result.files, [join(f.external, 'src/file.ts')]);
    const all = await f.service.search(root, '*.ts', 20, ctx);
    assert(!all.files.some(path => path.includes('node_modules') || path.includes('/etc/')));
    await assert.rejects(f.service.search(root, '*.ts', -1, ctx), /INVALID_QUERY/);
    await writeFile(join(f.external, '.agents/skills/foreign/SKILL.md'), '---\nname: foreign\ndescription: Changed live\n---\nLIVE_CHANGED_BODY\n');
    assert.match((await f.service.getSkill(root, 'foreign', ctx)).content, /LIVE_CHANGED_BODY/);
    await f.service.remove(root, f.external, ctx);
    await assert.rejects(f.service.getSkill(root, 'foreign', ctx), /UNAVAILABLE/);
  } finally { await f.close(); }
});

test('external skill directory symlinks and duplicate names are refused before persisting selections', async () => {
  const f = await fixture();
  try {
    const escaped = join(f.temp.root, 'escaped-skills');
    await mkdir(join(escaped, '.agents'), { recursive: true });
    await symlink(join(f.external, '.agents/skills'), join(escaped, '.agents/skills'));
    await assert.rejects(f.service.add(root, escaped, ctx), /SYMLINK_ESCAPE/);
    assert.deepEqual(await f.service.list(root, ctx), []);
    await f.service.add(root, f.external, ctx);
    const duplicate = join(f.temp.root, 'duplicate');
    await mkdir(join(duplicate, '.pi/skills/foreign'), { recursive: true });
    await writeFile(join(duplicate, '.pi/skills/foreign/SKILL.md'), '---\nname: foreign\ndescription: Duplicate\n---\nDUPLICATE_BODY');
    await assert.rejects(f.service.add(root, duplicate, ctx), /NAME_COLLISION/);
    assert.equal((await f.service.list(root, ctx)).length, 1);
    f.revokeReads();
    await assert.rejects(f.service.catalogue(root, ctx), /revoked/);
    await assert.rejects(f.service.getSkill(root, 'foreign', ctx), /revoked/);
    await assert.rejects(f.service.search(root, '*', 20, ctx), /revoked/);
  } finally { await f.close(); }
});

test('actual native add_directory tool executes via faux dispatch and next request receives AGENTS/CLAUDE context', async () => {
  const f = await fixture();
  try {
    const provider = fauxProvider({ provider: 'faux', models: [{ id: 'echo', contextWindow: 128000, maxTokens: 8192 }], tokensPerSecond: 100000 });
    const seen: unknown[] = [];
    provider.setResponses([
      () => fauxAssistantMessage(fauxToolCall('add_directory', { path: f.external }), { stopReason: 'toolUse' }),
      request => { seen.push(request); return fauxAssistantMessage(fauxText('native-tool-complete')); },
      request => { seen.push(request); return fauxAssistantMessage(fauxText('native-context-complete')); },
    ]);
    f.store.models.setProvider(provider.provider);
    const { h, c } = await f.store.resolveAgent(f.session.id, 'main');
    const first = await f.store.send(c, { content: 'add external fixture', requestId: 'external-add-tool' });
    assert.equal((await f.store.settled(h, first.id as number, 15000)).status, 'done');
    assert.equal((await f.service.list(c.id, ctx)).length, 1);
    const next = await f.store.send(c, { content: 'observe added context', requestId: 'external-next-prompt' });
    assert.equal((await f.store.settled(h, next.id as number, 15000)).status, 'done');
    assert.match(JSON.stringify(seen), /EXTERNAL_AGENT_INSTRUCTIONS/);
    assert.match(JSON.stringify(seen), /EXTERNAL_CLAUDE_INSTRUCTIONS/);
    assert.match(JSON.stringify(seen), /Skill \/skill:foreign/);
  } finally { await f.close(); }
});
