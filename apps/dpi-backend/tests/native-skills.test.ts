import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { BACKGROUND_CONTEXT as ctx } from '@earendil-works/chord/context';
import { Harness, createRegistry } from '@earendil-works/pi-durable';
import { CodingTools } from '@earendil-works/pi-durable/tools';
import { NodeExecutionEnv } from '@earendil-works/pi-durable/env/node';
import { openNodeSqliteStorage } from '@earendil-works/pi-durable/storage/sqlite/node';
import { createModels } from '@earendil-works/pi-ai/models';
import { fauxProvider, fauxAssistantMessage, fauxToolCall } from '@earendil-works/pi-ai/providers/faux';
import { createNativeSkills, type NativeSkillsOptions } from '../src/native-profile/skills/index.js';
import { createNativeGoalService, NativeGoalRuntime } from '../src/native-profile/automation/native-goals.js';
import { until } from './helpers.js';

const skillText = (name: string, description = `Description for ${name}`, body = `EXACT_BODY_${name}`, extra = '') =>
  `---\nname: ${name}\ndescription: ${JSON.stringify(description)}\n${extra}---\n${body}\n`;
async function put(path: string, content: string) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
}
async function scope(root: string, label: string): Promise<NativeSkillsOptions> {
  const cwd = join(root, label), homeDir = join(root, `home-${label}`), agentDir = join(homeDir, '.pi', 'agent');
  await mkdir(cwd, { recursive: true }); await mkdir(agentDir, { recursive: true });
  return { cwd, projectRoot: cwd, homeDir, agentDir, projectTrusted: true };
}

test('selected discovery preserves defaults, packages, filters, native diagnostics and XML names', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dpi-skills-discovery-'));
  try {
    const options = await scope(root, 'A');
    await put(join(options.cwd, '.pi', 'skills', 'local', 'SKILL.md'), skillText('local', 'Native <tag> & "quotes"'));
    await put(join(options.agentDir, 'skills', 'user', 'SKILL.md'), skillText('user'));
    await put(join(options.homeDir, '.agents', 'skills', 'agent-home', 'SKILL.md'), skillText('agent-home'));
    await put(join(options.cwd, '.agents', 'skills', 'agent-project', 'SKILL.md'), skillText('agent-project'));
    await put(join(options.cwd, '.pi', 'skills', 'hidden', 'SKILL.md'), skillText('hidden', 'Manual only', 'HIDDEN_BODY', 'disable-model-invocation: true\n'));
    await put(join(options.cwd, '.pi', 'skills', 'excluded', 'SKILL.md'), skillText('excluded'));
    await put(join(options.cwd, '.pi', 'skills', 'bad', 'SKILL.md'), '---\nname: bad\ndescription: [bad YAML\n---\nnever loaded');
    await put(join(options.cwd, '.pi', 'skills', 'no-description', 'SKILL.md'), '---\nname: no-description\n---\nno description');
    await put(join(options.cwd, '.pi', 'skills', 'duplicate', 'SKILL.md'), skillText('duplicate'));
    await put(join(options.agentDir, 'skills', 'duplicate', 'SKILL.md'), skillText('duplicate'));
    await put(join(root, 'package', 'package.json'), JSON.stringify({ name: 'local-skill-package', pi: { skills: ['./resources'] } }));
    await put(join(root, 'package', 'resources', 'packaged', 'SKILL.md'), skillText('packaged'));
    await put(join(options.agentDir, 'settings.json'), '{INVALID_PRIVATE_SETTINGS_MUST_NOT_BE_READ');
    options.globalSettings = { packages: [join(root, 'package'), 'npm:fixture-missing-skill-package@1.0.0'], npmCommand: ['DO_NOT_EXECUTE_THIS_COMMAND'] };
    options.projectSettings = { skills: ['-skills/excluded'] };
    const service = createNativeSkills(options);
    const result = await service.catalogue();
    const names = result.skills.map(skill => skill.name);
    for (const name of ['local', 'user', 'agent-home', 'agent-project', 'hidden', 'packaged']) assert.ok(names.includes(name), name);
    assert.equal(names.filter(name => name === 'duplicate').length, 1);
    assert.ok(!names.includes('excluded'));
    assert.ok(!names.includes('bad'));
    assert.ok(!names.includes('no-description'));
    assert.ok(result.diagnostics.some(item => item.type === 'collision'));
    assert.ok(result.diagnostics.some(item => item.path?.endsWith('/bad/SKILL.md')));
    assert.ok(result.diagnostics.some(item => item.message.includes('description')));
    assert.ok(result.diagnostics.some(item => item.message.includes('Missing package skipped')));
    const rendered = await service.context();
    assert.match(rendered.sections.skills, /<name>local<\/name>/);
    assert.match(rendered.sections.skills, /Native &lt;tag&gt; &amp; &quot;quotes&quot;/);
    assert.ok(!rendered.sections.skills.includes('<name>hidden</name>'));
    assert.equal((await service.getSkill('hidden')).content, skillText('hidden', 'Manual only', 'HIDDEN_BODY', 'disable-model-invocation: true\n'));
    assert.ok(!JSON.stringify(result.skills).includes('EXACT_BODY_local'), 'catalogue is metadata, not all private bodies');
    await assert.rejects(service.getSkill('../other/SKILL.md'), /GOAL_SKILL_UNAVAILABLE/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('explicit roots bound context inheritance, trust and foreign catalogues without ambient fallback', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dpi-skills-scope-'));
  const homeBefore = process.env.HOME;
  try {
    const a = await scope(root, 'A'), b = await scope(root, 'B');
    await put(join(root, 'AGENTS.md'), 'OUTSIDE_BOUNDARY_NEVER_IN_CONTEXT');
    await put(join(a.agentDir, 'AGENTS.md'), 'GLOBAL_A');
    await put(join(a.cwd, 'AGENTS.md'), 'PROJECT_A_OLD');
    await put(join(a.cwd, 'AGENTS.override.md'), 'PROJECT_A_OVERRIDE');
    await put(join(a.cwd, 'sub', 'CLAUDE.md'), 'CHILD_A');
    await put(join(a.cwd, '.pi', 'skills', 'owned', 'SKILL.md'), skillText('owned', 'A', 'ONLY_A'));
    await put(join(b.cwd, '.pi', 'skills', 'owned', 'SKILL.md'), skillText('owned', 'B', 'ONLY_B'));
    const sa = createNativeSkills(a), sb = createNativeSkills(b);
    const rendered = await sa.context(join(a.cwd, 'sub'));
    assert.deepEqual(rendered.contextFiles.map(file => file.content), ['GLOBAL_A', 'PROJECT_A_OVERRIDE', 'CHILD_A']);
    assert.ok(!JSON.stringify(rendered).includes('OUTSIDE_BOUNDARY_NEVER_IN_CONTEXT'));
    assert.ok(!JSON.stringify(rendered).includes('PROJECT_A_OLD'));
    await assert.rejects(sa.catalogue(b.cwd), /WORKSPACE_MISMATCH/);
    const foreign = (await sb.catalogue()).skills;
    await assert.rejects(sa.resolveGoalSkill('owned', ctx, foreign), /GOAL_SKILL_UNAVAILABLE/);
    assert.match(await sa.resolveGoalSkill('owned', ctx), /ONLY_A/);
    const untrusted = createNativeSkills({ ...a, projectTrusted: false });
    assert.equal((await untrusted.catalogue()).skills.length, 0);
    assert.match((await untrusted.context()).sections.project_context, /PROJECT_A_OVERRIDE/,
      'actual context files do not require project trust; executable project resources do');
    assert.throws(() => createNativeSkills({ ...a, homeDir: 'relative-home' }), /INVALID_DIRECTORY/);
    await assert.rejects(sa.context(join(a.cwd, 'missing')), /INVALID_WORKSPACE/);
    await put(join(a.cwd, '.pi', 'skills', 'huge', 'SKILL.md'), skillText('huge', 'large valid skill', 'x'.repeat(256 * 1024)));
    await assert.rejects(sa.getSkill('huge'), /GOAL_SKILL_TOO_LARGE/);
    assert.equal(process.env.HOME, homeBefore);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('actual context extraction retains nested linked-worktree shadowing within explicit boundary', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dpi-skills-worktree-'));
  try {
    const options = await scope(root, 'main');
    const nested = join(options.cwd, '.nested', 'linked');
    const gitDir = join(options.cwd, '.git', 'worktrees', 'linked');
    await put(join(options.cwd, '.git', 'HEAD'), 'ref: refs/heads/fixture\n');
    await put(join(gitDir, 'HEAD'), 'ref: refs/heads/linked-fixture\n');
    await put(join(gitDir, 'commondir'), '../..\n');
    await put(join(nested, '.git'), `gitdir: ${gitDir}\n`);
    await put(join(options.cwd, 'AGENTS.md'), 'SHADOWED_MAIN_CONTEXT');
    await put(join(nested, 'AGENTS.md'), 'NESTED_LINKED_CONTEXT');
    const value = await createNativeSkills({ ...options, cwd: nested }).context();
    assert.deepEqual(value.contextFiles.map(file => file.content), ['NESTED_LINKED_CONTEXT']);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('real native Harness consumes refreshed selected context/read tool and persists actual Goal skill body', { timeout: 25000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'dpi-skills-native-'));
  const hosts: Harness[] = [];
  try {
    const a = await scope(root, 'A'), b = await scope(root, 'B');
    const skillA = join(a.cwd, '.pi', 'skills', 'owned-a', 'SKILL.md');
    const skillB = join(b.cwd, '.pi', 'skills', 'owned-b', 'SKILL.md');
    await put(skillA, skillText('owned-a', 'A description', 'NATIVE_SKILL_BODY_A'));
    await put(skillB, skillText('owned-b', 'B description', 'NATIVE_SKILL_BODY_B'));
    await put(join(a.agentDir, 'AGENTS.md'), 'NATIVE_CONTEXT_A');
    await put(join(b.agentDir, 'AGENTS.md'), 'NATIVE_CONTEXT_B');
    const open = async (options: NativeSkillsOptions, label: string) => {
      const skills = createNativeSkills(options);
      const goals = createNativeGoalService({ authorize: () => true, tools: ['read'], resolveSkill: skills.resolveGoalSkill });
      const registry = createRegistry(); registry.install(CodingTools); registry.install(skills.extension); registry.install(goals.extension);
      const models = createModels();
      const provider = fauxProvider({ provider: `faux-skills-${label}`, models: [{ id: 'fixture', contextWindow: 32000, maxTokens: 2048 }], tokensPerSecond: 100000 });
      models.setProvider(provider.provider);
      const host = await Harness.open(await openNodeSqliteStorage(join(options.cwd, 'native.sqlite')),
        { registry, models, env: () => new NodeExecutionEnv({ cwd: options.cwd }) }, ctx);
      hosts.push(host);
      const conversation = await host.root(ctx, { agent: { cwd: options.cwd, model: { provider: provider.provider.id, modelId: 'fixture' }, tools: CodingTools.tools?.filter(tool => tool.name === 'read') } });
      goals.setSkillCatalogue((await skills.catalogue()).skills); await goals.bind(host); host.resume();
      return { host, skills, goals, provider, conversation };
    };
    const first = await open(a, 'A'), second = await open(b, 'B');
    const run = async (value: typeof first, label: string, file: string, expectedName: string) => {
      value.provider.setResponses([
        transcript => {
          const text = JSON.stringify(transcript);
          assert.ok(text.includes(`NATIVE_CONTEXT_${label}`));
          assert.ok(text.includes(`<name>${expectedName}</name>`));
          assert.ok(!text.includes(`NATIVE_CONTEXT_${label === 'A' ? 'B' : 'A'}`));
          return fauxAssistantMessage(fauxToolCall('read', { path: file }), { stopReason: 'toolUse' });
        },
        transcript => {
          assert.ok(JSON.stringify(transcript).includes(`NATIVE_SKILL_BODY_${label}`));
          return fauxAssistantMessage(`CONSUMED_${label}`);
        },
      ]);
      const submission = await value.conversation.submit({ type: 'input', content: 'Read the selected fixture skill.', requestId: `skills-${label}-${expectedName}` }, ctx);
      await until(async () => (await submission.status(ctx)).status === 'done', 10000, 'skills native submission');
      const entries = await value.conversation.entries({}, 100, undefined, ctx);
      assert.match(JSON.stringify(entries.items), new RegExp(`CONSUMED_${label}`));
    };
    await run(first, 'A', skillA, 'owned-a');
    const goal = await first.goals.create(first.conversation.id, {
      objective: 'Use the exact selected fixture skill', criteria: [{ id: 'fixture', text: 'Native fixture body remains available' }],
      skills: ['owned-a'], permissions: { scope: ['read fixture only'] }, limits: { maxCalls: 1 },
    }, ctx);
    const admitted = await first.host.commit(async tx => (await tx.doc(NativeGoalRuntime)).goals[goal.id].skillText['owned-a'], ctx);
    assert.equal(admitted, `Source: ${skillA}\n${skillText('owned-a', 'A description', 'NATIVE_SKILL_BODY_A')}`);
    await assert.rejects(first.goals.create(first.conversation.id, {
      objective: 'Reject a foreign skill', criteria: [{ id: 'foreign', text: 'No foreign body' }],
      skills: ['owned-b'], permissions: { scope: ['read fixture only'] }, limits: { maxCalls: 1 },
    }, ctx), /GOAL_SKILL_UNAVAILABLE/);
    await put(skillA, skillText('renamed-a', 'Updated description', 'NATIVE_SKILL_BODY_A_UPDATED'));
    await run(first, 'A', skillA, 'renamed-a');
    await first.host.close(ctx); hosts.splice(hosts.indexOf(first.host), 1);
    await run(second, 'B', skillB, 'owned-b');
    const reopened = await open(a, 'A-reopen');
    const restored = await reopened.host.commit(async tx => (await tx.doc(NativeGoalRuntime)).goals[goal.id].skillText['owned-a'], ctx);
    assert.equal(restored, admitted, 'Goal keeps its admitted native body snapshot, not changed filesystem content');
    assert.equal(reopened.provider.state.callCount, 0, 'reopen does not call a model');
  } finally {
    for (const host of hosts) await host.close(ctx);
    await rm(root, { recursive: true, force: true });
  }
});
