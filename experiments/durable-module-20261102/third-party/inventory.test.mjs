import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { inventory } from './inventory.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const result = await inventory(root);

test('census identifies both real removed imports without executing a native module', () => {
  const removed = result.files.filter(file => file.imports.some(item =>
    item.specifier === '@earendil-works/pi-durable' && item.named.some(name => name.imported === 'watchEvents')));
  assert.equal(removed.length, 2);
  assert.ok(removed.some(file => file.path.endsWith('/dist/index.js')));
  assert.ok(removed.some(file => file.path.endsWith('/dist/activation.js')));
  assert.equal(result.runtimeAcceptance, 'NOT_TESTED');
});

test('all selected files and worklet inputs carry current SHA256 evidence', async () => {
  for (const file of [...result.files, result.voiceLock, result.workletPatch, ...result.workletPatch.backups]) {
    const bytes = await readFile(join(root, file.path));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256, file.path);
  }
});

test('both 0.10.0 packages pin native 1.4 peers and release tarball integrity', () => {
  assert.equal(result.packages.length, 2);
  for (const pkg of result.packages) {
    assert.equal(pkg.version, '0.10.0');
    for (const native of ['chord', 'pi-ai', 'pi-durable']) {
      assert.equal(pkg.peerDependencies[`@earendil-works/${native}`], '1.4.0');
    }
    assert.match(pkg.resolved, /\/releases\/download\/v0\.10\.0\//);
    assert.match(pkg.integrity, /^sha512-/);
  }
});

test('five tool changes only replace the removed pi-ai TypeBox re-exports', async () => {
  const baseline = JSON.parse(await readFile(new URL('./BASELINE-INVENTORY.json', import.meta.url), 'utf8'));
  for (const file of baseline.files.filter(file => file.path.includes('/src/native-profile/tools/'))) {
    let source = await readFile(join(root, file.path), 'utf8');
    if (file.path.endsWith('/codex/ask.ts')) {
      source = source.replace('import { contentText } from "@earendil-works/pi-ai";\nimport { Type } from "typebox";',
        'import { Type, contentText } from "@earendil-works/pi-ai";');
    } else {
      source = source.replace(/(import \{ Type(?:, type Static)? \} from )(["'])typebox\2;/,
        '$1$2@earendil-works/pi-ai$2;');
    }
    assert.equal(createHash('sha256').update(source).digest('hex'), file.sha256, file.path);
  }
});

test('Codex and Antigravity schema-owning boundaries are visible individually', () => {
  for (const path of ['codex/ask.ts', 'codex/search.ts', 'codex/image.ts', 'codex/runtime.ts', 'antigravity/index.ts']) {
    const file = result.files.find(file => file.path.endsWith(`/tools/${path}`));
    assert.ok(file, path);
    assert.ok(file.imports.some(item => item.specifier === 'typebox' &&
      item.named.some(name => name.imported === 'Type')), path);
    assert.equal(file.imports.some(item => item.specifier === '@earendil-works/pi-ai' &&
      item.named.some(name => name.imported === 'Type' || name.imported === 'Static')), false, path);
  }
  const search = result.files.find(file => file.path.endsWith('/tools/codex/search.ts'));
  assert.ok(search.imports.some(item => item.named.some(name => name.imported === 'Static' && name.typeOnly)));
});
