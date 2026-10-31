import { lstat, readFile, realpath } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { Admission, fingerprint } from './auth.js';
import { record, string } from './domain.js';

export interface WorkerConfig {
  version: 2;
  optIn: true;
  contractVersion: 2;
  sessionId: string;
  workspace: string;
  namespace: string;
  url: string;
  publicKey: string;
  host: { baseUrl: string; sessionId: string; agentId: number; tokenEnv: string };
}

/** Original I/session-binding namespace boundary, independent of the caller's worker hint. */
export function registrationNamespace(value: unknown): string {
  const namespace = string(value);
  if (namespace !== 'default' && !/^durable-pi-test-[a-zA-Z0-9-]+$/.test(namespace)) throw Error('EXPLICIT_WORKER_NAMESPACE_REQUIRED');
  return namespace;
}

/** Trusted operator configuration. No local native directory, DB, launch ticket or runtime. */
export function workerConfig(untrusted: unknown): { value: WorkerConfig; configHash: string } {
  const value = record(untrusted);
  if (Object.keys(value).sort().join(',') !== 'contractVersion,host,namespace,optIn,publicKey,sessionId,url,version,workspace'
    || value.version !== 2 || value.optIn !== true || value.contractVersion !== 2) throw Error('FRESH_VERSION_2_CONFIG_REQUIRED');
  const sessionId = string(value.sessionId), workspace = string(value.workspace, 4096);
  if (!isAbsolute(workspace)) throw Error('ABSOLUTE_SERVER_WORKSPACE_REQUIRED');
  const namespace = registrationNamespace(value.namespace);
  const url = string(value.url, 1024), engine = new URL(url);
  if (!['ws:', 'wss:'].includes(engine.protocol) || engine.username || engine.password || engine.search || engine.hash) throw Error('INVALID_ENGINE_URL');
  const publicKey = string(value.publicKey, 4096);
  if (!publicKey.startsWith('-----BEGIN PUBLIC KEY-----')) throw Error('ED25519_PUBLIC_KEY_REQUIRED');
  new Admission(publicKey, sessionId); // Reject a wrong key before opening either transport.
  const host = record(value.host);
  if (Object.keys(host).sort().join(',') !== 'agentId,baseUrl,sessionId,tokenEnv') throw Error('EXPLICIT_HOST_BINDING_REQUIRED');
  const baseUrl = string(host.baseUrl, 1024), endpoint = new URL(baseUrl);
  if (!['http:', 'https:'].includes(endpoint.protocol) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw Error('INVALID_HOST_URL');
  if (endpoint.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname)) throw Error('HTTPS_HOST_REQUIRED');
  const nativeSessionId = string(host.sessionId);
  if (!Number.isSafeInteger(host.agentId) || (host.agentId as number) < 1) throw Error('EXPLICIT_NATIVE_CONVERSATION_REQUIRED');
  const tokenEnv = string(host.tokenEnv);
  if (!/^[A-Z_][A-Z0-9_]*$/.test(tokenEnv)) throw Error('TOKEN_ENV_NAME_REQUIRED');
  const config: WorkerConfig = { version: 2, optIn: true, contractVersion: 2, sessionId, workspace, namespace, url, publicKey,
    host: { baseUrl, sessionId: nativeSessionId, agentId: host.agentId as number, tokenEnv } };
  // Preserve the original full-config fingerprint. Secrets live in the selected environment, not this JSON.
  return { value: config, configHash: fingerprint(config) };
}

export async function readWorkerConfig(path: string) {
  const file = await realpath(path), metadata = await lstat(file);
  if (!metadata.isFile() || metadata.uid !== process.getuid?.() || (metadata.mode & 0o077)) throw Error('OWNER_PRIVATE_CONFIG_REQUIRED');
  return workerConfig(JSON.parse(await readFile(file, 'utf8')));
}
