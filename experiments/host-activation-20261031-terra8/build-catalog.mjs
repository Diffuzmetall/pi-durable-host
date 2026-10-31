#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { createRequire, builtinModules } from 'node:module';
import { readFile, writeFile, access } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const output = join(here, 'host/compiled/catalog.mjs');
await access(output).then(() => { throw Error('CATALOG_BUNDLE_ALREADY_EXISTS'); }, error => { if (error.code !== 'ENOENT') throw error; });
const require = createRequire(import.meta.url);
const esbuild = require('../../apps/dpi-backend/node_modules/esbuild/lib/main.js');
const result = await esbuild.build({
  absWorkingDir: here, entryPoints: [join(here, 'catalog-entry.mjs')], outfile: output,
  bundle: true, platform: 'node', target: 'node24', format: 'esm', metafile: true,
  external: ['@earendil-works/pi-ai', '@earendil-works/pi-ai/*'],
  legalComments: 'linked', logLevel: 'warning',
  banner: { js: "import { createRequire as __catalogRequire } from 'node:module'; const require = __catalogRequire(import.meta.url);" },
});
const runtimeImports = [...new Set(Object.values(result.metafile.outputs).flatMap(value => value.imports.map(item => item.path)))];
for (const value of Object.values(result.metafile.outputs)) for (const item of value.imports)
  if (item.external && !builtinModules.includes(item.path) && !/^(node:|@earendil-works\/pi-ai(\/|$))/.test(item.path))
    throw Error(`UNFROZEN_CATALOG_IMPORT: ${item.path}`);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const sources = await Promise.all(Object.keys(result.metafile.inputs).map(async input => {
  const path = resolve(here, input);
  return { path, sha256: sha256(await readFile(path)) };
}));
const licenseSource = '/home/ubuntu/.local/share/pi-durable/tui-releases/20261030-headless-48a55067/host-lane/host/LICENSE';
const license = await readFile(licenseSource);
await writeFile(join(here, 'host/compiled/CATALOG-LICENSE'), license, { mode: 0o600 });
await writeFile(join(here, 'host/compiled/CATALOG-PROVENANCE.json'), JSON.stringify({
  schema: 1, esbuild: esbuild.version, sources, runtimeImports,
  bundle: { file: 'catalog.mjs', sha256: sha256(await readFile(output)) },
  license: { source: licenseSource, file: 'CATALOG-LICENSE', sha256: sha256(license) },
}, null, 2) + '\n', { mode: 0o600 });
console.log(JSON.stringify({ status: 'CATALOG_BUNDLE_BUILT', inputs: sources.length, runtimeImports }));
