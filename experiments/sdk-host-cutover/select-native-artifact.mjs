#!/usr/bin/env node
import { open, readFile, rename, unlink, lstat } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { resolve, dirname } from 'node:path';
import { readNativeSelection } from './native-artifact.mjs';

/** One local operator action: select an approved artifact, then use existing SDK reload.
 * A repeated explicit target never resends an uncertain reload. No tasks/effects are retried.
 */
export async function selectNativeArtifact({ selector, target, expected, client }) {
  const current = await readNativeSelection(selector);
  await readNativeSelection(selector, { target });
  if (current.config.current === target)
    return { status: 'already-selected', activeOutcome: 'not-rechecked', reloadSent: false, target };
  if (current.config.current !== expected) throw Error('SELECTOR_EXPECTED_CURRENT_CONFLICT');
  const directory = await lstat(dirname(current.path));
  if (directory.uid !== process.getuid() || (directory.mode & 0o077)) throw Error('PRIVATE_SELECTOR_DIRECTORY_REQUIRED');
  // A crash leaves this lock for explicit operator reconciliation, never TTL stealing.
  const lockPath = `${current.path}.lock`;
  const lock = await open(lockPath, 'wx', 0o600);
  const temporary = `${current.path}.next-${process.pid}`;
  let reloadSent = false, outcome;
  try {
    if (!(await readFile(current.path)).equals(current.bytes)) throw Error('SELECTOR_CHANGED');
    const staged = await open(temporary, 'wx', 0o600);
    try {
      await staged.writeFile(JSON.stringify({ ...current.config, previous: expected, current: target }, null, 2) + '\n');
      await staged.sync();
    } finally { await staged.close(); }
    await rename(temporary, current.path);
    // Publication/selection and native SQLite are deliberately not presented as one transaction.
    // Any transport or post-publication cleanup error is uncertain: retain target, do not resend.
    reloadSent = true;
    outcome = await client.session(current.config.sessionId).reload().then(
      result => ({ status: 'reload-returned', target, reloadSent: true, result }),
      () => ({ status: 'uncertain', target, reloadSent: true,
        reason: 'Reload did not return success. Selection retained; reconcile active state before another change.' }),
    );
  } finally {
    const cleanup = await Promise.allSettled([lock.close(), unlink(lockPath)]);
    const failed = cleanup.find(result => result.status === 'rejected');
    if (failed) {
      if (!reloadSent) throw failed.reason;
      outcome = { status: 'uncertain', target, reloadSent: true,
        reason: 'Operator lock cleanup failed after selection. Reconcile active state and lock before another change.' };
    }
  }
  return outcome;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { values } = parseArgs({ options: {
    selector: { type: 'string' }, target: { type: 'string' }, expected: { type: 'string' },
    'token-file': { type: 'string' },
  } });
  if (!values.selector || !values.target || !values.expected || !values['token-file'])
    throw Error('Usage: select-native-artifact.mjs --selector PRIVATE_JSON --target APPROVED_ID --expected CURRENT_ID --token-file PRIVATE_TOKEN');
  const state = await readNativeSelection(values.selector);
  const tokenPath = resolve(values['token-file']);
  const info = await lstat(tokenPath);
  if (!info.isFile() || info.isSymbolicLink() || info.uid !== process.getuid() || (info.mode & 0o077))
    throw Error('PRIVATE_OPERATOR_TOKEN_REQUIRED');
  const token = (await readFile(tokenPath, 'utf8')).trim();
  if (!token || /\s/.test(token)) throw Error('OPERATOR_TOKEN_INVALID');
  const { DpiClient } = await import('dpi-sdk');
  const result = await selectNativeArtifact({ selector: values.selector, target: values.target,
    expected: values.expected, client: new DpiClient(state.config.url, token) });
  console.log(JSON.stringify(result));
  if (result.status === 'uncertain') process.exitCode = 2;
}
