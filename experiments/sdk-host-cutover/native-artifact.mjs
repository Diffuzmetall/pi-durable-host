// Operator-owned installation selection, not a second execution or revision journal.
import { createHash } from 'node:crypto';
import { lstat, readFile, realpath, readdir } from 'node:fs/promises';
import { resolve, join, isAbsolute, relative } from 'node:path';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const inside = name => typeof name === 'string' && name.length > 0 && !isAbsolute(name)
  && !name.split('/').some(part => part === '..' || part === '.' || part === '');

/** Validate unknown operator configuration once, before loading any adapter code. */
export async function readNativeSelection(file, { sessionId, target } = {}) {
  const path = resolve(file);
  const info = await lstat(path);
  if (await realpath(path) !== path || !info.isFile() || info.uid !== process.getuid() || (info.mode & 0o077))
    throw Error('PRIVATE_CANONICAL_SELECTOR_REQUIRED');
  const bytes = await readFile(path);
  const config = JSON.parse(bytes);
  if (!object(config) || typeof config.sessionId !== 'string' || !config.sessionId
      || (sessionId !== undefined && config.sessionId !== sessionId)
      || typeof config.current !== 'string' || !object(config.artifacts)
      || !Object.hasOwn(config.artifacts, config.current)) throw Error('SESSION_SELECTOR_INVALID');
  const url = new URL(config.url);
  if (url.protocol !== 'http:' || !['127.0.0.1', '[::1]'].includes(url.hostname)
      || url.username || url.password || url.search || url.hash || url.pathname !== '/')
    throw Error('LOOPBACK_HOST_REQUIRED');
  const selected = target ?? config.current;
  if (typeof selected !== 'string' || !Object.hasOwn(config.artifacts, selected)) throw Error('UNAPPROVED_ARTIFACT');
  const artifact = config.artifacts[selected];
  if (!object(artifact) || !Array.isArray(artifact.adapters) || !artifact.adapters.length || !artifact.adapters.every(inside))
    throw Error('ARTIFACT_CONFIG_INVALID');
  const { root, files } = await validateSealedArtifact(artifact);
  if (!artifact.adapters.every(name => files.has(name))) throw Error('ARTIFACT_ADAPTER_MISSING');
  return { path, bytes, config, selected, paths: artifact.adapters.map(name => join(root, name)) };
}

/** Verify artifact integrity only. Never imports code, opens DBs, or proves compatibility. */
export async function validateSealedArtifact(artifact) {
  if (!object(artifact) || typeof artifact.root !== 'string' || !isAbsolute(artifact.root)
      || !/^[a-f0-9]{64}$/.test(artifact.manifestSha256)) throw Error('ARTIFACT_CONFIG_INVALID');
  const root = resolve(artifact.root);
  const rootInfo = await lstat(root);
  if (await realpath(root) !== root || !rootInfo.isDirectory() || rootInfo.uid !== process.getuid() || (rootInfo.mode & 0o222))
    throw Error('SEALED_CANONICAL_ARTIFACT_REQUIRED');
  const manifestPath = join(root, 'RESTART-CANDIDATE.json');
  const manifestInfo = await lstat(manifestPath);
  if (!manifestInfo.isFile() || manifestInfo.isSymbolicLink() || manifestInfo.uid !== process.getuid() || (manifestInfo.mode & 0o222))
    throw Error('SEALED_MANIFEST_REQUIRED');
  const manifestBytes = await readFile(manifestPath);
  if (sha256(manifestBytes) !== artifact.manifestSha256) throw Error('ARTIFACT_MANIFEST_CHANGED');
  const manifest = JSON.parse(manifestBytes);
  if (!object(manifest) || !object(manifest.files)) throw Error('ARTIFACT_MANIFEST_INVALID');
  for (const [name, entry] of Object.entries(manifest.files)) {
    if (!inside(name) || !object(entry) || !/^[a-f0-9]{64}$/.test(entry.sha256)) throw Error('ARTIFACT_MANIFEST_INVALID');
  }
  // Check the complete closure, not just the entry point. No mutable alias or extra code.
  const pending = [root];
  const seen = new Set();
  while (pending.length) {
    for (const entry of await readdir(pending.pop(), { withFileTypes: true })) {
      const entryPath = join(entry.parentPath, entry.name);
      const stat = await lstat(entryPath);
      if (stat.isSymbolicLink() || stat.uid !== process.getuid() || (stat.mode & 0o222)) throw Error('MUTABLE_ARTIFACT_REFUSED');
      if (stat.isDirectory()) pending.push(entryPath);
      else {
        const name = relative(root, entryPath);
        if (name === 'RESTART-CANDIDATE.json') continue;
        if (!stat.isFile() || !Object.hasOwn(manifest.files, name)
            || sha256(await readFile(entryPath)) !== manifest.files[name].sha256) throw Error('ARTIFACT_CONTENT_CHANGED');
        seen.add(name);
      }
    }
  }
  if (seen.size !== Object.keys(manifest.files).length) throw Error('ARTIFACT_CONTENT_MISSING');
  return { root, files: seen };
}

/** Supply this to existing nativeExtensions(context); one private selector per session. */
export async function selectedNativeAdapters(file, sessionId) {
  if (typeof sessionId !== 'string' || !sessionId) throw Error('BOUND_SESSION_REQUIRED');
  return (await readNativeSelection(file, { sessionId })).paths;
}
