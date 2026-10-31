import { lstatSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const file = (directory) => join(directory, 'title.txt');

export function normalizeTitle(input) {
  const title = input.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, ' ').replace(/[\x00-\x1f\x7f-\x9f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!title || [...title].length > 80) throw new Error('Session name must contain 1–80 printable characters');
  return title;
}

export function readTitle(directory) {
  const path = file(directory);
  try {
    if (!lstatSync(path).isFile()) return undefined;
    return normalizeTitle(readFileSync(path, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return undefined;
    if (error?.message?.startsWith('Session name must')) return undefined;
    throw error;
  }
}

export function writeTitle(directory, input) {
  const title = normalizeTitle(input);
  const path = file(directory);
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, `${title}\n`, { mode: 0o600, flag: 'wx' });
    renameSync(temporary, path);
  } catch (error) {
    try { unlinkSync(temporary); } catch { /* no temporary file to remove */ }
    throw error;
  }
  return title;
}
