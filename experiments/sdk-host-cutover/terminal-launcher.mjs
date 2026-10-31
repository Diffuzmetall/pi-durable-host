#!/usr/bin/env node
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, lstat, readFile, open, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { parseArgs, promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { spawn, execFile } from 'node:child_process';
import { once } from 'node:events';
import { DpiClient } from 'dpi-sdk';

export function parseLaunchArgs(args) {
  const { values } = parseArgs({ args, strict: true, allowPositionals: false, options: {
    session: { type: 'string' }, continue: { type: 'boolean', short: 'c' },
    'retry-new': { type: 'boolean' }, help: { type: 'boolean' },
  } });
  if ([values.session !== undefined, !!values.continue, !!values['retry-new']].filter(Boolean).length > 1)
    throw Error('Conflicting session selection');
  if (values.session !== undefined && !/^[A-Za-z0-9][A-Za-z0-9_-]{0,255}$/.test(values.session))
    throw Error('Use an exact Host session ID, never a SQLite path or partial legacy locator');
  return values;
}

/** Selection uses only SDK discovery. No original-session scanning, implicit import or local execution owner. */
export async function selectHostSession(client, args, cwd, directory) {
  if (args.session || args.continue) {
    let id = args.session;
    if (!id) {
      const sessions = (await client.sessions()).filter(session => session.cwd === cwd)
        .sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id));
      if (!sessions.length) throw Error('No Host session for this cwd; use the explicit legacy entrypoint for unmigrated sessions');
      id = sessions[0].id;
    }
    const session = await client.session(id).get();
    if (session.id !== id || session.cwd !== cwd || session.error) throw Error('Exact Host session/cwd is unavailable; no fallback');
    return id;
  }
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const pending = join(directory, 'launcher-new-session.json');
  let intent;
  if (args['retry-new']) {
    const info = await lstat(pending);
    if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o077)) throw Error('Invalid private creation receipt');
    intent = JSON.parse(await readFile(pending, 'utf8'));
    if (typeof intent?.key !== 'string' || !intent.key || intent.body?.cwd !== cwd || typeof intent.body.name !== 'string' ||
      typeof intent.body.model?.provider !== 'string' || typeof intent.body.model?.modelId !== 'string') throw Error('Creation receipt does not match this cwd');
  } else {
    const device = await client.device();
    const model = device.defaultModelRef;
    if (!model || !device.models.some(item => item.provider === model.provider && item.id === model.modelId && item.available !== false))
      throw Error('Exact Host default model is unavailable; no fallback');
    intent = { key: randomUUID(), body: { name: 'Untitled session', cwd, model } };
    const file = await open(pending, 'wx', 0o600); // Existing uncertainty is not a new-session request.
    try { await file.writeFile(JSON.stringify(intent)); await file.sync(); } finally { await file.close(); }
    const folder = await open(directory, 'r'); try { await folder.sync(); } finally { await folder.close(); }
  }
  const session = await client.createSession(intent.body, intent.key);
  await unlink(pending); // Only an acknowledged receipt releases this intent.
  const folder = await open(directory, 'r'); try { await folder.sync(); } finally { await folder.close(); }
  return session.id;
}

async function main() {
  const args = parseLaunchArgs(process.argv.slice(2));
  if (args.help) {
    console.log('pi-durable [--session EXACT_HOST_ID | --continue/-c | --retry-new]\nNo arguments: create a Host session with its exact default model.\n--continue: newest Host session for the current cwd; never scans legacy SQLite.\n--retry-new: explicitly reconcile the retained new-session request, never replay a prompt.\n--extension/-e, --no-mcp, --mcp-*, --listen, --print/-p, --json and CLI prompts are not supported by this SDK launcher. Use the explicit legacy entrypoint; no automatic fallback.');
    return;
  }
  const configPath = new URL('../terminal-client.json', import.meta.url);
  const info = await lstat(configPath);
  if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o077)) throw Error('Private client configuration required');
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  const url = new URL(config.url);
  if (!['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname) || url.protocol !== 'http:' || url.username || url.password ||
    url.pathname !== '/' || url.search || url.hash || typeof config.token !== 'string' || !config.token.trim()) throw Error('Private loopback client binding required');
  await promisify(execFile)('/usr/bin/systemctl', ['--user', 'start', 'pi-durable-host.service'], { timeout: 45_000 });
  const directory = join(homedir(), '.local/state/dpi-terminal', createHash('sha256').update(`${url.href}\0${config.token}`).digest('hex'));
  const client = new DpiClient(url.href.replace(/\/$/, ''), config.token);
  const id = await selectHostSession(client, args, process.cwd(), directory);
  const binary = new URL('../node_modules/dpi-terminal-adapter/dist/main.js', import.meta.url).pathname;
  const child = spawn(process.execPath, [binary, url.href, id], { stdio: 'inherit', env: { ...process.env, DPI_TOKEN: config.token } });
  const interrupt = () => child.kill('SIGINT'), terminate = () => child.kill('SIGTERM');
  process.once('SIGINT', interrupt); process.once('SIGTERM', terminate);
  try { const [code] = await once(child, 'exit'); process.exitCode = code ?? 1; }
  finally { process.removeListener('SIGINT', interrupt); process.removeListener('SIGTERM', terminate); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await main().catch(() => { console.error('SDK terminal startup refused. Check Host/grant/CLI options (--help). No legacy fallback or local owner was started; uncertain creation receipts remain private.'); process.exitCode = 1; });
