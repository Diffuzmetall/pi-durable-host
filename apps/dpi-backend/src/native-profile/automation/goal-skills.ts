import { readFile, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';

export type GoalSkillSource = { readonly name: string; readonly filePath: string };

/** Consume the native host's resolved catalogue, including package/custom skill paths.
 * The fallback is for headless hosts without a catalogue. Bodies never grant tool authority.
 */
export async function readGoalSkill(name: string, cwd: string, catalogue?: readonly GoalSkillSource[]): Promise<string> {
  let files: string[];
  if (catalogue !== undefined) {
    const skill = catalogue.find(candidate => candidate.name === name);
    if (!skill || !isAbsolute(skill.filePath)) throw Error(`GOAL_SKILL_UNAVAILABLE: ${name}`);
    files = [skill.filePath];
  } else {
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(name)) throw Error('GOAL_INVALID_SKILL_NAME');
    files = [join(cwd, '.pi', 'skills'), join(cwd, '.agents', 'skills'),
      join(homedir(), '.pi', 'agent', 'skills'), join(homedir(), '.agents', 'skills')]
      .map(root => join(root, name, 'SKILL.md'));
  }
  for (const file of files) {
    try {
      const info = await stat(file);
      if (!info.isFile()) throw Error('GOAL_INVALID_SKILL_FILE');
      if (info.size > 256 * 1024) throw Error('GOAL_SKILL_TOO_LARGE');
      const body = await readFile(file, 'utf8');
      if (!body.trim()) throw Error('GOAL_EMPTY_SKILL');
      return `Source: ${file}\n${body}`;
    } catch (error: any) { if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error; }
  }
  throw Error(`GOAL_SKILL_UNAVAILABLE: ${name}`);
}
