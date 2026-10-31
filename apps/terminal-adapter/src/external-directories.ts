export interface ExternalDirectory { absolutePath: string; label: string }

/** The server sends ONLY the selected conversation's list, never its session-wide owners map. */
export function externalDirectoriesView(value: unknown): readonly ExternalDirectory[] | undefined {
  if (!value || typeof value !== 'object' || !('directories' in value) || !Array.isArray(value.directories) || value.directories.length > 16) return undefined;
  const directories: ExternalDirectory[] = [];
  for (const directory of value.directories) {
    if (!directory || typeof directory !== 'object' || typeof directory.absolutePath !== 'string' || !directory.absolutePath.startsWith('/') ||
        typeof directory.label !== 'string' || !directory.label.trim()) return undefined;
    directories.push({ absolutePath: directory.absolutePath, label: directory.label });
  }
  return directories;
}
