import assert from 'node:assert/strict';
import { chmod, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { readTrustedNativeExtensions } from './native-extensions.mjs';

test('private adapter list is re-read, deduplicated and removable without reloading other host configuration', async () => {
  const root = await mkdtemp(join(tmpdir(), 'native-extension-config-'));
  const file = join(root, 'host.json');
  try {
    await writeFile(file, JSON.stringify({ nativeExtensions: ['/fixture/a.mjs', '/fixture/a.mjs'], unrelated: 'never-returned' }), { mode: 0o600 });
    assert.deepEqual(await readTrustedNativeExtensions(file), ['/fixture/a.mjs']);
    await writeFile(file, JSON.stringify({ nativeExtensions: ['/fixture/b.ts'] }));
    assert.deepEqual(await readTrustedNativeExtensions(file), ['/fixture/b.ts']);
    await writeFile(file, '{}');
    assert.deepEqual(await readTrustedNativeExtensions(file), []);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('adapter list rejects non-private config, symlinks, malformed and client-style relative paths', async () => {
  const root = await mkdtemp(join(tmpdir(), 'native-extension-config-deny-'));
  const file = join(root, 'host.json');
  try {
    for (const nativeExtensions of [['relative.ts'], 'bad', [12], ['/fixture/\0bad']]) {
      await writeFile(file, JSON.stringify({ nativeExtensions }), { mode: 0o600 });
      await assert.rejects(readTrustedNativeExtensions(file), /NATIVE_EXTENSION_PATHS_INVALID/);
    }
    await writeFile(file, '[]');
    await assert.rejects(readTrustedNativeExtensions(file), /HOST_CONFIG_INVALID/);
    await writeFile(file, '{');
    await assert.rejects(readTrustedNativeExtensions(file), SyntaxError);
    await writeFile(file, '{}');
    await chmod(file, 0o644);
    await assert.rejects(readTrustedNativeExtensions(file), /PRIVATE_HOST_CONFIG_REQUIRED/);
    await chmod(file, 0o600);
    const link = join(root, 'link.json');
    await symlink(file, link);
    await assert.rejects(readTrustedNativeExtensions(link));
    await writeFile(file, ' '.repeat(1048577));
    await assert.rejects(readTrustedNativeExtensions(file), /PRIVATE_HOST_CONFIG_REQUIRED/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
