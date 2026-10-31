#!/usr/bin/env node
import { lstat, readFile, readdir } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { once } from 'node:events';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Store } from 'dpi-backend/store';
import { createHttpServer, GrantPolicy } from 'dpi-backend/server';
import { createOperationalProfile } from './operational-profile.mjs';

process.umask(0o077);
async function main() {
  const file = process.argv[2];
  if (!file || process.argv.length !== 3) throw Error('PRIVATE_HOST_CONFIG_REQUIRED');
  const info = await lstat(file);
  if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o077)) throw Error('PRIVATE_HOST_CONFIG_REQUIRED');
  const config = JSON.parse(await readFile(file, 'utf8'));
  if (!config || typeof config !== 'object' || !isAbsolute(config.dataDir ?? '') ||
      !Array.isArray(config.startDirs) || !config.startDirs.length || !config.startDirs.every(path => typeof path === 'string' && isAbsolute(path)) ||
      !Array.isArray(config.trustedWorkspaces) || !config.trustedWorkspaces.every(path => config.startDirs.includes(path)) ||
      (config.nativeExtensions !== undefined && (!Array.isArray(config.nativeExtensions) ||
        !config.nativeExtensions.every(path => typeof path === 'string' && isAbsolute(path) && !path.includes('\0')))) ||
      !Array.isArray(config.grants) || typeof config.ownerGrantId !== 'string' ||
      !Number.isInteger(config.port) || config.port < 1 || config.port > 65535) throw Error('HOST_CONFIG_INVALID');
  const ownerGrant = config.grants.find(grant => grant.id === config.ownerGrantId);
  if (!ownerGrant || ownerGrant.authority !== 'human') throw Error('HOST_HUMAN_OWNER_REQUIRED');
  // Never let native dead-lock recovery silently steal a previous owner's lock.
  const lockPaths = [join(config.dataDir, 'catalog.sqlite.lock')];
  const sessions = await readdir(join(config.dataDir, 'sessions'), { withFileTypes: true });
  for (const session of sessions) if (session.isDirectory()) lockPaths.push(join(config.dataDir, 'sessions', session.name, 'agent.sqlite.lock'));
  for (const path of lockPaths) {
    const lock = await lstat(path).catch(error => { if (error.code !== 'ENOENT') throw error; });
    if (lock) throw Error('EXISTING_OWNER_LOCK_REFUSED');
  }
  const policy = new GrantPolicy(config.grants);
  const profile = await createOperationalProfile({ policy, owner: policy.authenticate(ownerGrant.token), trustedWorkspaces: config.trustedWorkspaces, nativeExtensions: config.nativeExtensions });
  const store = await Store.open({ dataDir: config.dataDir, startDirs: config.startDirs, name: 'durable-host', profile });
  const server = createHttpServer(store, policy);
  let closing;
  const close = () => closing ??= (async () => { server.closeAllConnections(); server.close(); await store.close(); })();
  process.once('SIGINT', close); process.once('SIGTERM', close);
  try {
    server.listen(config.port, '127.0.0.1'); await once(server, 'listening');
    if (process.env.NOTIFY_SOCKET) await promisify(execFile)('/usr/bin/systemd-notify', ['--ready']);
  } catch { await close(); throw Error('HOST_STARTUP_FAILED'); }
  console.log(JSON.stringify({ status: 'NATIVE_HOST_READY', endpoint: `http://127.0.0.1:${server.address().port}`, profile: profile.id, pid: process.pid }));
}
await main().catch(error => { console.error(['EXISTING_OWNER_LOCK_REFUSED','PRIVATE_HOST_CONFIG_REQUIRED','HOST_CONFIG_INVALID'].includes(error.message)
  ? error.message : 'NATIVE_HOST_START_FAILED — inspect private configuration and credential capability'); process.exitCode = 1; });
