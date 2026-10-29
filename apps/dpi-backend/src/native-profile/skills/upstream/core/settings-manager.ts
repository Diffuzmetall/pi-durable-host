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
