import { lstat, readFile, realpath } from 'node:fs/promises';
import { isAbsolute, join, relative, sep } from 'node:path';

// Discovery's structural SettingsManager boundary, not a second persistence owner.
// PackageSource fields follow selected core/settings-manager.ts. Only explicitly
// supplied configuration is visible; resource resolution must never persist it.
export type PackageSource = string | {
  source: string;
  autoload?: boolean;
  extensions?: string[];
  skills?: string[];
  prompts?: string[];
  themes?: string[];
};
export interface ResourceSettings {
  packages?: PackageSource[];
  extensions?: string[];
  skills?: string[];
  prompts?: string[];
  themes?: string[];
  npmCommand?: string[];
}
/** Read only the resource fields of the existing operator-owned settings files.
 * This never writes settings or resolves/installs packages. Untrusted project
 * settings are not opened at all. Unknown non-resource settings remain private.
 */
export async function readResourceSettings(options: { agentDir: string; cwd: string; projectTrusted: boolean }) {
  const read = async (root: string, path: string): Promise<ResourceSettings> => {
    let text: string;
    try {
      const info = await lstat(path);
      if (!info.isFile() || info.isSymbolicLink() || info.size > 1024 * 1024) throw Error('invalid file');
      const child = relative(await realpath(root), await realpath(path));
      if (child === '..' || child.startsWith(`..${sep}`) || isAbsolute(child)) throw Error('foreign file');
      text = await readFile(path, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
      throw Error('RESOURCE_SETTINGS_INVALID');
    }
    let value: unknown;
    try { value = JSON.parse(text); } catch { throw Error('RESOURCE_SETTINGS_INVALID'); }
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('RESOURCE_SETTINGS_INVALID');
    const source = value as Record<string, unknown>;
    const settings: ResourceSettings = {};
    const strings = (item: unknown): item is string[] => Array.isArray(item) && item.every(entry => typeof entry === 'string' && !entry.includes('\0'));
    for (const key of ['skills', 'extensions', 'prompts', 'themes', 'npmCommand'] as const) {
      if (source[key] === undefined) continue;
      if (!strings(source[key])) throw Error('RESOURCE_SETTINGS_INVALID');
      settings[key] = source[key];
    }
    if (source.packages !== undefined) {
      if (!Array.isArray(source.packages)) throw Error('RESOURCE_SETTINGS_INVALID');
      settings.packages = source.packages.map((item: unknown): PackageSource => {
        if (typeof item === 'string' && !item.includes('\0')) return item;
        if (!item || typeof item !== 'object' || Array.isArray(item)) throw Error('RESOURCE_SETTINGS_INVALID');
        const entry = item as Record<string, unknown>;
        if (typeof entry.source !== 'string' || entry.source.includes('\0') ||
          (entry.autoload !== undefined && typeof entry.autoload !== 'boolean')) throw Error('RESOURCE_SETTINGS_INVALID');
        const result: Exclude<PackageSource, string> = { source: entry.source };
        if (entry.autoload !== undefined) result.autoload = entry.autoload;
        for (const key of ['skills', 'extensions', 'prompts', 'themes'] as const) {
          if (entry[key] === undefined) continue;
          if (!strings(entry[key])) throw Error('RESOURCE_SETTINGS_INVALID');
          result[key] = entry[key];
        }
        return result;
      });
    }
    return settings;
  };
  return {
    globalSettings: await read(options.agentDir, join(options.agentDir, 'settings.json')),
    projectSettings: options.projectTrusted ? await read(options.cwd, join(options.cwd, '.pi', 'settings.json')) : {},
  };
}

export interface SettingsManager {
  getGlobalSettings(): ResourceSettings;
  getProjectSettings(): ResourceSettings;
  getNpmCommand(): string[] | undefined;
  isProjectTrusted(): boolean;
  setPackages(packages: PackageSource[]): void;
  setProjectPackages(packages: PackageSource[]): void;
}

export function readOnlyResourceSettings(
  global: ResourceSettings,
  project: ResourceSettings,
  projectTrusted: boolean,
): SettingsManager {
  const user = structuredClone(global);
  const local = projectTrusted ? structuredClone(project) : {};
  return {
    getGlobalSettings: () => structuredClone(user),
    getProjectSettings: () => structuredClone(local),
    getNpmCommand: () => {
      const command = local.npmCommand ?? user.npmCommand;
      return command ? [...command] : undefined;
    },
    isProjectTrusted: () => projectTrusted,
    setPackages: () => { throw new Error('SKILLS_DISCOVERY_READ_ONLY'); },
    setProjectPackages: () => { throw new Error('SKILLS_DISCOVERY_READ_ONLY'); },
  };
}
