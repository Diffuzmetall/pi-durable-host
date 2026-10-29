import { existsSync, statSync } from 'node:fs';
import { isAbsolute, relative, sep } from 'node:path';
import { defineExtension, section, type PromptInput } from '@earendil-works/pi-durable';
import { readGoalSkill } from '../automation/goal-skills.js';
import type { createNativeGoalService } from '../automation/native-goals.js';
import { DefaultPackageManager } from './upstream/core/package-manager.js';
import { loadSkills, type LoadSkillsResult, type Skill } from './upstream/core/skills.js';
import { readOnlyResourceSettings, type ResourceSettings } from './upstream/core/settings-manager.js';
import { loadProjectContextFiles } from './upstream/core/context.js';
import { buildSystemPromptSections, type BuildSystemPromptOptions } from './upstream/core/system-prompt.js';
import { canonicalizePath } from './upstream/utils/paths.js';
import type { ResourceDiagnostic } from './upstream/core/diagnostics.js';

export type { Skill, ResourceSettings, ResourceDiagnostic };
export interface NativeSkillsOptions {
  cwd: string;
  /** Inclusive ancestor boundary; directories above it are never discovered. */
  projectRoot: string;
  /** Explicit home for .agents/skills and ~ resources, not process.env.HOME. */
  homeDir: string;
  /** Explicit agent resources/context root; settings.json is never opened. */
  agentDir: string;
  projectTrusted: boolean;
  globalSettings?: ResourceSettings;
  projectSettings?: ResourceSettings;
  documentation?: BuildSystemPromptOptions['documentation'];
  onDiagnostics?(diagnostics: readonly ResourceDiagnostic[]): void;
}

type GoalResolver = Parameters<typeof createNativeGoalService>[0]['resolveSkill'];
const KEYS = ['preamble', 'tools', 'rules', 'docs', 'project_context', 'skills', 'cwd'] as const;
// Exact selected core/tools/{read,bash,edit,write}.ts prompt contributions.
const CONTRIBUTIONS: Record<string, { snippet: string; guidelines: readonly string[] }> = {
  read: { snippet: 'Read file contents', guidelines: ['Use read to examine files instead of cat or sed.'] },
  bash: { snippet: 'Execute bash commands (ls, grep, find, etc.)', guidelines: ['You can inspect PI_* environment variables for current model and session details.'] },
  write: { snippet: 'Create or overwrite files', guidelines: ['Use write only for new files or complete rewrites.'] },
  edit: { snippet: 'Make precise file edits with exact text replacement, including multiple disjoint edits in one call', guidelines: [
    'Use edit for precise changes (edits[].oldText must match exactly)',
    'When changing multiple separate locations in one file, use one edit call with multiple entries in edits[] instead of multiple edit calls',
    'Each edits[].oldText is matched against the original file, not after earlier edits are applied. Do not emit overlapping or nested edits. Merge nearby changes into one edit.',
    'Keep edits[].oldText as small as possible while still being unique in the file. Do not pad with large unchanged regions.',
  ] },
};

/** Actual selected resolver → loadSkills → structured prompt pipeline.
 * No Storage, Harness, settings-file, environment or process lifetime is owned here.
 */
export function createNativeSkills(options: NativeSkillsOptions) {
  const roots = { cwd: options.cwd, projectRoot: options.projectRoot, homeDir: options.homeDir, agentDir: options.agentDir };
  for (const [name, path] of Object.entries(roots)) {
    if (!isAbsolute(path) || path.includes('\0') || (existsSync(path) && !statSync(path).isDirectory())) {
      throw new Error(`NATIVE_SKILLS_INVALID_DIRECTORY: ${name}`);
    }
    roots[name as keyof typeof roots] = canonicalizePath(path);
  }
  const scopeCwd = (cwd: string): string => {
    if (!isAbsolute(cwd) || cwd.includes('\0') || !existsSync(cwd) || !statSync(cwd).isDirectory()) {
      throw new Error('NATIVE_SKILLS_INVALID_WORKSPACE');
    }
    const resolved = canonicalizePath(cwd);
    const child = relative(roots.projectRoot, resolved);
    if (child === '..' || child.startsWith(`..${sep}`) || isAbsolute(child)) {
      throw new Error('NATIVE_SKILLS_WORKSPACE_MISMATCH');
    }
    return resolved;
  };
  scopeCwd(roots.cwd);
  const settingsManager = readOnlyResourceSettings(options.globalSettings ?? {}, options.projectSettings ?? {}, options.projectTrusted);

  // Selected experimental/durable/skills.ts, retaining skip (never install) and
  // includeDefaults:false: the real resource resolver owns defaults/filtering.
  const catalogue = async (cwd = roots.cwd): Promise<LoadSkillsResult> => {
    const directory = scopeCwd(cwd);
    const missing: ResourceDiagnostic[] = [];
    const resources = await new DefaultPackageManager({
      cwd: directory, agentDir: roots.agentDir, homeDir: roots.homeDir,
      projectRoot: roots.projectRoot, settingsManager,
    }).resolve(async () => {
      missing.push({ type: 'warning', message: 'Missing package skipped without installation (explicit resource configuration)' });
      return 'skip';
    });
    const result = loadSkills({ cwd: directory, agentDir: roots.agentDir,
      skillPaths: resources.skills.filter(skill => skill.enabled).map(skill => skill.path), includeDefaults: false });
    result.diagnostics.push(...missing);
    options.onDiagnostics?.(result.diagnostics);
    return result;
  };

  const context = async (cwd = roots.cwd, selectedTools = ['read', 'bash', 'edit', 'write']) => {
    const directory = scopeCwd(cwd);
    const result = await catalogue(directory);
    const diagnostics: ResourceDiagnostic[] = [];
    const contextFiles = loadProjectContextFiles({ cwd: directory, agentDir: roots.agentDir,
      boundary: roots.projectRoot, diagnostics });
    const toolSnippets: Record<string, string> = {};
    const toolGuidelines: Record<string, string[]> = {};
    for (const name of selectedTools) {
      const contribution = CONTRIBUTIONS[name];
      if (!contribution) continue;
      toolSnippets[name] = contribution.snippet;
      toolGuidelines[name] = [...contribution.guidelines];
    }
    const sections = buildSystemPromptSections({ cwd: directory, selectedTools, toolSnippets, toolGuidelines,
      documentation: options.documentation, contextFiles, skills: result.skills });
    options.onDiagnostics?.(diagnostics);
    return { sections, skills: result.skills, contextFiles, diagnostics: [...result.diagnostics, ...diagnostics] };
  };

  // Selected createPiPrompt's per-PromptInput WeakMap: refresh on every real
  // request, while all seven sections share one resource resolution/build.
  const built = new WeakMap<PromptInput, Promise<Record<string, string>>>();
  const build = (input: PromptInput): Promise<Record<string, string>> => {
    let value = built.get(input);
    if (value === undefined) {
      value = context(input.env?.cwd ?? input.agent.cwd ?? roots.cwd, input.agent.tools.map(tool => tool.name))
        .then(result => result.sections);
      built.set(input, value);
    }
    return value;
  };
  const extension = defineExtension({ name: 'pi-prompt',
    sections: KEYS.map(key => section(key, async input => (await build(input))[key], { tag: false })),
  });

  const getSkill = async (name: string) => {
    const { skills } = await catalogue();
    const skill = skills.find(candidate => candidate.name === name);
    if (!skill) throw new Error(`GOAL_SKILL_UNAVAILABLE: ${name}`);
    // Reuse the actual Goal reader's file/size/empty-body guards. Never use its
    // ambient fallback; the catalogue is always explicitly present, even empty.
    const text = await readGoalSkill(name, roots.cwd, skills);
    return { ...skill, content: text.slice(`Source: ${skill.filePath}\n`.length) };
  };
  const resolveGoalSkill: GoalResolver = async (name, _context, advertised) => {
    const { skills } = await catalogue();
    const skill = skills.find(candidate => candidate.name === name);
    // A supplied snapshot can only narrow current trusted discovery. It cannot
    // authorize a path/body, even when its metadata has the correct skill name.
    if (!skill || (advertised !== undefined && !advertised.some(candidate =>
      candidate.name === name && candidate.filePath === skill.filePath))) {
      throw new Error(`GOAL_SKILL_UNAVAILABLE: ${name}`);
    }
    return readGoalSkill(name, roots.cwd, skills);
  };
  return { extension, catalogue, context, getSkill, resolveGoalSkill };
}
