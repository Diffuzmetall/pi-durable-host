import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { isAbsolute } from 'node:path';

/** Only the server-selected private file, never an HTTP-provided path or process-wide settings. */
export async function readTrustedNativeExtensions(file) {
  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = await handle.stat();
    if (!info.isFile() || (info.mode & 0o077) || info.size > 1048576) throw Error('PRIVATE_HOST_CONFIG_REQUIRED');
    const config = JSON.parse(await handle.readFile('utf8'));
    if (!config || typeof config !== 'object' || Array.isArray(config)) throw Error('HOST_CONFIG_INVALID');
    const paths = config.nativeExtensions ?? [];
    if (!Array.isArray(paths) || !paths.every(path => typeof path === 'string' && isAbsolute(path) && !path.includes('\0')))
      throw Error('NATIVE_EXTENSION_PATHS_INVALID');
    return [...new Set(paths)];
  } finally { await handle.close(); }
}
