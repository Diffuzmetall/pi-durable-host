/** Pi-add-dir semantics adapted to native Durable documents, sections and tools. See NOTICE.md. */
import { open, opendir, realpath, stat } from 'node:fs/promises';
import { basename, isAbsolute, join, matchesGlob, relative, resolve, sep } from 'node:path';
import { Type } from '@earendil-works/pi-ai';
import { defineDoc, defineExtension, defineTool, section, type ConversationId, type Extension, type Harness } from '@earendil-works/pi-durable';
import type { Context } from '@earendil-works/chord';
import { loadSkills } from '../skills/upstream/core/skills.js';
import type { Skill } from '../skills/index.js';

type ExternalDirectoryStorage = Pick<Harness, 'snapshot'> & Partial<Pick<Harness, 'commit'>>;

export type AddedDirectory = { absolutePath: string; label: string; addedAt: number };
export const ExternalDirectories = defineDoc<{ owners: Record<string, AddedDirectory[]> }>({
  kind: 'pi.external-directories', version: 1, scope: 'session', checkpointWhen: () => false,
  initial: () => ({ owners: {} }),
});
export interface ExternalDirectoryOptions {
  cwd: string;
  homeDir: string;
  /** Trusted operator boundary. Adding a directory never extends these roots or filesystem rights. */
  allowedRoots: readonly string[];
  /** Must check the CURRENT grant; called again inside each mutation transaction. */
  authorize(owner: ConversationId, action: 'read' | 'manage', path: string, context: Context): void | Promise<void>;
}
const SKILL_DIRS = ['.pi/skills', '.agents/skills', '.claude/skills'];
const inside = (root: string, target: string) => {
  const child = relative(root, target);
  return child !== '..' && !child.startsWith(`..${sep}`) && !isAbsolute(child);
};

export function createExternalDirectories(options: ExternalDirectoryOptions) {
  if (!isAbsolute(options.cwd) || !isAbsolute(options.homeDir) || !options.allowedRoots.length ||
      options.allowedRoots.some(root => !isAbsolute(root))) throw Error('EXTERNAL_DIRS_TRUSTED_ROOTS_REQUIRED');
  let harness: Pick<Harness, 'snapshot' | 'commit'> | undefined;
  // Native callbacks expose invocation-bound document access. Never retain it across calls/reloads.
  const scoped = (storage: ExternalDirectoryStorage) => {
    const service = createExternalDirectories(options);
    service.bind(storage);
    return service;
  };
  const bound = () => { if (!harness) throw Error('EXTERNAL_DIRS_NOT_BOUND'); return harness; };
  const canonicalRoots = () => Promise.all(options.allowedRoots.map(root => realpath(root)));
  const check = async (owner: ConversationId, path: string, context: Context) => {
    const target = await realpath(path);
    if (!(await canonicalRoots()).some(root => inside(root, target))) throw Error('EXTERNAL_DIR_OUTSIDE_ALLOWED_ROOTS');
    await options.authorize(owner, 'read', target, context);
    return target;
  };
  const list = async (owner: ConversationId, context: Context) => {
    await options.authorize(owner, 'read', options.cwd, context);
    return (await bound().snapshot(ExternalDirectories, context))?.owners[String(owner)] ?? [];
  };
  const text = async (owner: ConversationId, root: string, path: string, context: Context): Promise<string | undefined> => {
    let target: string;
    try { target = await realpath(path); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; }
    if (!inside(root, target)) throw Error('EXTERNAL_CONTEXT_SYMLINK_ESCAPE');
    await check(owner, target, context);
    const handle = await open(target, 'r');
    try {
      const info = await handle.stat();
      if (!info.isFile() || info.size > 65536) throw Error('EXTERNAL_CONTEXT_INVALID_FILE_OR_SIZE');
      const buffer = Buffer.alloc(65537);
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
      if (bytesRead > 65536) throw Error('EXTERNAL_CONTEXT_INVALID_FILE_OR_SIZE');
      return buffer.subarray(0, bytesRead).toString('utf8');
    } finally { await handle.close(); }
  };
  const scan = async (owner: ConversationId, path: string, context: Context) => {
    const root = await check(owner, path, context);
    const contextFiles: { path: string; content: string }[] = [];
    for (const name of ['AGENTS.md', 'CLAUDE.md', '.pi/AGENTS.md', '.pi/CLAUDE.md']) {
      const content = await text(owner, root, join(root, name), context);
      if (content) contextFiles.push({ path: join(root, name), content });
    }
    const skillPaths: string[] = [];
    for (const dir of SKILL_DIRS) {
      let skillRoot: string;
      try { skillRoot = await realpath(join(root, dir)); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue; throw error; }
      if (!inside(root, skillRoot)) throw Error('EXTERNAL_CONTEXT_SYMLINK_ESCAPE');
      await check(owner, skillRoot, context);
      let visited = 0;
      for await (const entry of await opendir(skillRoot)) {
        context.abortSignal?.throwIfAborted();
        if (++visited > 1000) throw Error('EXTERNAL_SKILL_DIRECTORY_TOO_LARGE');
        if (!entry.isDirectory()) continue;
        const path = join(root, dir, entry.name, 'SKILL.md');
        if (await text(owner, root, path, context)) skillPaths.push(path);
      }
    }
    const skills = loadSkills({ cwd: root, agentDir: options.homeDir, skillPaths, includeDefaults: false }).skills;
    return { contextFiles, skills };
  };
  const catalogue = async (owner: ConversationId, context: Context): Promise<Skill[]> => {
    const result: Skill[] = [];
    for (const dir of await list(owner, context)) result.push(...(await scan(owner, dir.absolutePath, context)).skills);
    const names = new Set<string>();
    for (const skill of result) {
      if (names.has(skill.name)) throw Error('EXTERNAL_SKILL_NAME_COLLISION');
      names.add(skill.name);
    }
    return result;
  };
  const add = async (owner: ConversationId, input: string, context: Context) => {
    if (!input.trim() || input.includes('\0')) throw Error('EXTERNAL_DIR_PATH_REQUIRED');
    const unquoted = input.trim().replace(/^@/, '');
    const path = unquoted === '~' ? options.homeDir : unquoted.startsWith('~/') ? join(options.homeDir, unquoted.slice(2)) : resolve(options.cwd, unquoted);
    const absolutePath = await check(owner, path, context);
    if (!(await stat(absolutePath)).isDirectory()) throw Error('EXTERNAL_DIR_NOT_DIRECTORY');
    if (absolutePath === await realpath(options.cwd)) throw Error('EXTERNAL_DIR_ALREADY_CWD');
    const resources = await scan(owner, absolutePath, context);
    const names = new Set((await catalogue(owner, context)).map(skill => skill.name));
    for (const skill of resources.skills) {
      if (names.has(skill.name)) throw Error('EXTERNAL_SKILL_NAME_COLLISION');
      names.add(skill.name);
    }
    await bound().commit(async tx => {
      const doc = await tx.doc(ExternalDirectories);
      const dirs = doc.owners[String(owner)] ?? [];
      if (dirs.length >= 16) throw Error('EXTERNAL_DIR_LIMIT');
      if (dirs.some(dir => dir.absolutePath === absolutePath)) throw Error('EXTERNAL_DIR_ALREADY_ADDED');
      // No filesystem/resource loading after this last current-authority check.
      await options.authorize(owner, 'manage', absolutePath, context);
      doc.owners[String(owner)] = [...dirs, { absolutePath, label: basename(absolutePath), addedAt: Date.now() }];
    }, context);
    return { absolutePath, contextFiles: resources.contextFiles.map(file => file.path), skills: resources.skills.map(skill => skill.name) };
  };
  const remove = async (owner: ConversationId, input: string, context: Context) => {
    const dirs = await list(owner, context);
    const exact = dirs.find(dir => dir.absolutePath === input) ?? dirs.find(dir => dir.label === input);
    if (!exact || (dirs.filter(dir => dir.label === input).length > 1 && exact.absolutePath !== input)) throw Error('EXTERNAL_DIR_NOT_FOUND_OR_AMBIGUOUS');
    await bound().commit(async tx => {
      const doc = await tx.doc(ExternalDirectories);
      await options.authorize(owner, 'manage', exact.absolutePath, context);
      doc.owners[String(owner)] = (doc.owners[String(owner)] ?? []).filter(dir => dir.absolutePath !== exact.absolutePath);
    }, context);
  };
  const getSkill = async (owner: ConversationId, name: string, context: Context) => {
    const skill = (await catalogue(owner, context)).find(skill => skill.name === name);
    if (!skill) throw Error('EXTERNAL_SKILL_UNAVAILABLE');
    const dir = (await list(owner, context)).find(dir => inside(dir.absolutePath, skill.filePath));
    if (!dir) throw Error('EXTERNAL_SKILL_UNAVAILABLE');
    const content = await text(owner, dir.absolutePath, skill.filePath, context);
    if (!content) throw Error('EXTERNAL_SKILL_UNAVAILABLE');
    return { ...skill, baseDir: resolve(skill.filePath, '..'), content };
  };
  const search = async (owner: ConversationId, pattern: string, maxResults: number, context: Context) => {
    if (!pattern || pattern.length > 512 || !Number.isInteger(maxResults) || maxResults < 1 || maxResults > 200) throw Error('EXTERNAL_SEARCH_INVALID_QUERY');
    const files: string[] = [];
    let visited = 0;
    for (const dir of await list(owner, context)) {
      const root = await check(owner, dir.absolutePath, context);
      const queue = [root];
      while (queue.length && files.length < maxResults && visited < 10000) {
        context.abortSignal?.throwIfAborted();
        const parent = queue.shift()!;
        for await (const entry of await opendir(parent)) {
          if (++visited > 10000 || files.length >= maxResults) break;
          if (entry.name === '.git' || entry.name === 'node_modules' || entry.isSymbolicLink()) continue;
          const path = join(parent, entry.name);
          const canonical = await check(owner, path, context);
          if (!inside(root, canonical)) throw Error('EXTERNAL_SEARCH_PATH_ESCAPE');
          if (entry.isDirectory()) queue.push(canonical);
          else if (entry.isFile() && matchesGlob(pattern.includes('/') ? relative(root, path) : entry.name, pattern)) files.push(canonical);
        }
      }
    }
    return { files, truncated: visited >= 10000 || files.length >= maxResults };
  };
  const render = async (owner: ConversationId, context: Context) => {
      const dirs = await list(owner, context);
      if (!dirs.length) return undefined;
      const parts = ['External directories selected for this conversation. These context files do not extend permissions; external .pi/extensions are never executed.'];
      for (const dir of dirs) {
        const resources = await scan(owner, dir.absolutePath, context);
        parts.push(`Directory: ${dir.absolutePath}`);
        for (const file of resources.contextFiles) parts.push(`Context file ${file.path}:\n${file.content}`);
        for (const skill of resources.skills) parts.push(`Skill /skill:${skill.name}: ${skill.description}`);
      }
      const content = parts.join('\n\n');
      if (Buffer.byteLength(content) > 262144) throw Error('EXTERNAL_CONTEXT_TOTAL_TOO_LARGE');
      return content;
  };
  const extension: Extension = defineExtension({ name: 'pi-add-dir',
    sections: [section('external-directories', (input, context) => scoped(input.read).render(input.conversationId, context))],
    tools: [defineTool({ name: 'add_directory', description: 'Add an approved external directory to THIS conversation context. Does not grant filesystem permissions or execute extensions.', replay: 'unsafe',
      parameters: Type.Object({ path: Type.String({ minLength: 1, maxLength: 4096 }), reason: Type.Optional(Type.String({ maxLength: 1000 })) }, { additionalProperties: false }),
      execute: async (args, api, context) => ({ output: [{ type: 'text', text: JSON.stringify(await scoped(api).add(api.conversationId, args.path, context)) }] }),
    }), defineTool({ name: 'search_external_files', description: 'Search filenames in this conversation\'s approved external directories; skips symlinks, .git and node_modules. No file contents.', replay: 'safe',
      parameters: Type.Object({ pattern: Type.String({ minLength: 1, maxLength: 512 }), maxResults: Type.Optional(Type.Integer({ minimum: 1, maximum: 200 })) }, { additionalProperties: false }),
      execute: async (args, api, context) => ({ output: [{ type: 'text', text: JSON.stringify(await scoped(api).search(api.conversationId, args.pattern, args.maxResults ?? 50, context)) }] }),
    })],
  });
  return { extension, list, add, remove, catalogue, getSkill, search, render,
    bind(value: ExternalDirectoryStorage) {
      if (harness) throw Error('EXTERNAL_DIRS_ALREADY_BOUND');
      harness = { snapshot: value.snapshot.bind(value), commit: value.commit?.bind(value) ?? (() => { throw Error('EXTERNAL_DIRS_READ_ONLY_SCOPE'); }) };
    } };

}
