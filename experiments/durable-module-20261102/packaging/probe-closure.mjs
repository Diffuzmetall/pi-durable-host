import assert from 'node:assert/strict';
import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = '/candidate';
const names = ['@earendil-works/chord', '@earendil-works/pi-ai', '@earendil-works/pi-durable', '@earendil-works/pi-codemode', '@earendil-works/pi-mcp'];
const contexts = ['package.json', 'apps/dpi-backend/package.json', 'packages/durable-reload/package.json'];
const resolutions = [];
for (const context of contexts) {
  for (const name of names) {
    const entry = fileURLToPath(import.meta.resolve(name, pathToFileURL(`${root}/${context}`).href));
    assert(realpathSync(entry).startsWith('/candidate/node_modules/'), entry);
    let dir = dirname(entry);
    let metadata;
    while (dir.startsWith(root)) {
      try {
        const value = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
        if (value.name === name) { metadata = value; break; }
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
      dir = dirname(dir);
    }
    assert.equal(metadata?.version, '1.5.0', `${context}:${name}`);
    const imported = await import(pathToFileURL(entry).href);
    assert(Object.keys(imported).length > 0, name);
    if (name === '@earendil-works/pi-durable') {
      assert.equal(typeof imported.Harness.open, 'function');
      assert.equal('watchEvents' in imported, false);
    }
    resolutions.push({ context, name, version: metadata.version, entry });
  }
}
const lock = JSON.parse(readFileSync(`${root}/package-lock.json`, 'utf8'));
const runtimeNames = new Set(names.map(name => `node_modules/${name}`));
for (const [path, metadata] of Object.entries(lock.packages)) {
  if ([...runtimeNames].some(name => path === name || path.endsWith(`/${name}`))) {
    assert.equal(metadata.version, '1.5.0', path);
    assert(metadata.integrity, `${path}: integrity required`);
  }
}
const result = {status: 'PASS_DEPENDENCY_IMPORTS_ONLY', resolutions, lifecycleScripts: 'DISABLED', harnessConstructed: false, sessionsStarted: 0, productionActivation: 'NOT RUN'};
writeFileSync('/scratch/closure-imports.json', JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result));
