#!/usr/bin/env node
import { lstat, readFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { once } from 'node:events';
import { Store } from 'dpi-backend/store';
import { createHttpServer, GrantPolicy } from 'dpi-backend/server';
import { createOperationalProfile } from './operational-profile.mjs';
import { readTrustedNativeExtensions } from './native-extensions.mjs';

// The private server configuration is selected by the operator, never by an HTTP caller.
async function main() {
  const file = process.argv[2];
  if (!file || process.argv.length !== 3) throw Error('PRIVATE_HOST_CONFIG_REQUIRED');
  const info = await lstat(file);
  if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o077)) throw Error('PRIVATE_HOST_CONFIG_REQUIRED');
  const config = JSON.parse(await readFile(file, 'utf8'));
  if (!config || typeof config !== 'object' || !isAbsolute(config.dataDir ?? '') ||
    !Array.isArray(config.startDirs) || !config.startDirs.length || !config.startDirs.every(path => typeof path === 'string' && isAbsolute(path)) ||
    !Array.isArray(config.trustedWorkspaces) || !config.trustedWorkspaces.every(path => config.startDirs.includes(path)) ||
    !Array.isArray(config.grants) || typeof config.ownerGrantId !== 'string' ||
    !Number.isInteger(config.port) || config.port < 0 || config.port > 65535) throw Error('HOST_CONFIG_INVALID');
  const ownerGrant = config.grants.find(grant => grant.id === config.ownerGrantId);
  if (!ownerGrant || ownerGrant.authority !== 'human') throw Error('HOST_HUMAN_OWNER_REQUIRED');
  const policy = new GrantPolicy(config.grants);
  const profile = await createOperationalProfile({ policy, owner: policy.authenticate(ownerGrant.token), trustedWorkspaces: config.trustedWorkspaces,
    // Re-read ONLY the trusted adapter list at each native reload. Other host settings stay unchanged.
    nativeExtensions: () => readTrustedNativeExtensions(file),
  });
  const store = await Store.open({ dataDir: config.dataDir, startDirs: config.startDirs, name: 'durable-host', profile });
  const server = createHttpServer(store, policy);
  let closing;
  const close = () => closing ??= (async () => {
    server.closeAllConnections(); server.close(); await store.close();
  })();
  try { server.listen(config.port, '127.0.0.1'); await once(server, 'listening'); }
  catch { await close(); throw Error('HOST_LISTEN_FAILED'); }
  process.once('SIGINT', close); process.once('SIGTERM', close);
  console.log(JSON.stringify({ status: 'NATIVE_HOST_READY', endpoint: `http://127.0.0.1:${server.address().port}`, profile: profile.id, pid: process.pid }));
}

await main().catch(() => { console.error('NATIVE_HOST_START_FAILED — inspect the private configuration and credential capability'); process.exitCode = 1; });
