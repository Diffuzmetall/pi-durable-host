// Extracted from selected resource-loader.ts and footer-data-provider.ts.
// Only deltas: explicit ancestor boundary and structured diagnostics, no CLI chalk.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { canonicalizePath, resolvePath } from '../utils/paths.js';
import { stripBom } from '../utils/text.js';
import type { ResourceDiagnostic } from './diagnostics.js';

type ContextFile = { path: string; content: string };
type GitPaths = { repoDir: string; commonGitDir: string; headPath: string };

function findGitPaths(cwd: string, boundary: string): GitPaths | null {
  let dir = cwd;
  while (true) {
    const gitPath = join(dir, '.git');
    if (existsSync(gitPath)) {
      try {
        const stat = statSync(gitPath);
        if (stat.isFile()) {
          const content = readFileSync(gitPath, 'utf8').trim();
          if (content.startsWith('gitdir: ')) {
            const gitDir = resolve(dir, content.slice(8).trim());
            const headPath = join(gitDir, 'HEAD');
            if (!existsSync(headPath)) return null;
            const commonDirPath = join(gitDir, 'commondir');
            const commonGitDir = existsSync(commonDirPath)
              ? resolve(gitDir, readFileSync(commonDirPath, 'utf8').trim()) : gitDir;
            return { repoDir: dir, commonGitDir, headPath };
          }
        } else if (stat.isDirectory()) {
          const headPath = join(gitPath, 'HEAD');
          if (!existsSync(headPath)) return null;
          return { repoDir: dir, commonGitDir: gitPath, headPath };
        }
      } catch { return null; }
    }
    const parent = dirname(dir);
    if (parent === dir || dir === boundary) return null;
    dir = parent;
  }
}

function loadContextFileFromDir(dir: string, diagnostics: ResourceDiagnostic[]): ContextFile | null {
  const candidates = ['AGENTS.override.md', 'AGENTS.md', 'AGENTS.MD', 'CLAUDE.md', 'CLAUDE.MD'];
  for (const filename of candidates) {
    const filePath = join(dir, filename);
    if (existsSync(filePath)) {
      try {
        if (!statSync(filePath).isFile()) continue;
        return { path: filePath, content: stripBom(readFileSync(filePath, 'utf-8')) };
      } catch (error) {
        diagnostics.push({ type: 'warning', path: filePath, message: `Could not read ${filePath}: ${error}` });
      }
    }
  }
  return null;
}

function findShadowedContextFile(cwd: string, boundary: string, diagnostics: ResourceDiagnostic[]): string | undefined {
  const gitPaths = findGitPaths(cwd, boundary);
  if (!gitPaths) return undefined;
  const commonGitDir = canonicalizePath(gitPaths.commonGitDir);
  const worktreeRoot = canonicalizePath(gitPaths.repoDir);
  const mainRepoRoot = dirname(commonGitDir);
  if (!worktreeRoot.startsWith(`${mainRepoRoot}${sep}`)) return undefined;
  if (canonicalizePath(join(mainRepoRoot, '.git')) !== commonGitDir) return undefined;
  const worktreeContextFile = loadContextFileFromDir(worktreeRoot, diagnostics);
  return worktreeContextFile ? join(mainRepoRoot, basename(worktreeContextFile.path)) : undefined;
}

export function loadProjectContextFiles(options: {
  cwd: string; agentDir: string; boundary: string; diagnostics: ResourceDiagnostic[];
}): ContextFile[] {
  const resolvedCwd = resolvePath(options.cwd);
  const resolvedAgentDir = resolvePath(options.agentDir);
  const contextFiles: ContextFile[] = [];
  const seenPaths = new Set<string>();
  const globalContext = loadContextFileFromDir(resolvedAgentDir, options.diagnostics);
  if (globalContext) {
    contextFiles.push(globalContext);
    seenPaths.add(globalContext.path);
  }
  const ancestorContextFiles: ContextFile[] = [];
  const shadowedContextFile = findShadowedContextFile(resolvedCwd, options.boundary, options.diagnostics);
  let currentDir = resolvedCwd;
  while (true) {
    const contextFile = loadContextFileFromDir(currentDir, options.diagnostics);
    const isShadowed = shadowedContextFile !== undefined && canonicalizePath(contextFile?.path ?? '') === shadowedContextFile;
    if (contextFile && !isShadowed && !seenPaths.has(contextFile.path)) {
      ancestorContextFiles.unshift(contextFile);
      seenPaths.add(contextFile.path);
    }
    const parentDir = dirname(currentDir);
    if (parentDir === currentDir || currentDir === options.boundary) break;
    currentDir = parentDir;
  }
  contextFiles.push(...ancestorContextFiles);
  return contextFiles;
}
