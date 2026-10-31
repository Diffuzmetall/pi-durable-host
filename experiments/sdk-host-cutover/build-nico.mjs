#!/usr/bin/env node
// Build from an accepted dependency candidate; never modify its tree or an installed release.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { builtinModules, createRequire } from 'node:module';
import { dirname, join, resolve, basename, relative } from 'node:path';
import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises';
const [candidateArg, outputArg] = process.argv.slice(2);
if (!candidateArg || !outputArg) throw Error('Usage: build-nico.mjs ACCEPTED_CANDIDATE NEW_DIRECTORY');
const candidate = resolve(candidateArg), output = resolve(outputArg);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const receipt = JSON.parse(await readFile(join(candidate, 'evidence/acceptance/artifact.json'), 'utf8'));
if (hash(await readFile(join(candidate, receipt.artifact))) !== receipt.sha256) throw Error('NICO_ARTIFACT_HASH_MISMATCH');
for (const patch of receipt.patches) if (hash(await readFile(join(candidate, patch.path))) !== patch.sha256) throw Error('NICO_PATCH_HASH_MISMATCH');
const adapter = join(candidate, 'node_modules/pi-mcp-adapter');
for (const [file, digest] of Object.entries(receipt.patchedFiles))
  if (hash(await readFile(join(adapter, file))) !== digest) throw Error(`NICO_INSTALLED_PREIMAGE_MISMATCH: ${file}`);
await mkdir(output, { mode: 0o700 });
const require = createRequire(import.meta.url);
const dependencyRequire = createRequire(join(candidate, 'package.json'));
const traversePackage = dependencyRequire.resolve('json-schema-traverse/package.json');
if (JSON.parse(await readFile(traversePackage, 'utf8')).version !== '1.0.0') throw Error('JSON_SCHEMA_TRAVERSE_VERSION_REQUIRED');
const schemaCompat = join(output, 'schema-compat');
await mkdir(schemaCompat);
const patch = join(dirname(fileURLToPath(import.meta.url)), 'nico-null-const.patch');
const original = await readFile(join(adapter, 'json-schema-validator.ts'));
await writeFile(join(schemaCompat, 'json-schema-validator.ts'), original);
await writeFile(join(schemaCompat, 'nico-null-const.patch'), await readFile(patch));
execFileSync('patch', ['-p1', '--fuzz=0', '--batch', '--input', patch], { cwd: schemaCompat, stdio: 'pipe' });
const normalizedValidator = await readFile(join(schemaCompat, 'json-schema-validator.ts'), 'utf8');
const additionalNicoPatches = [{ file: 'json-schema-validator.ts', patch: 'schema-compat/nico-null-const.patch',
  sha256: hash(await readFile(patch)), preimageSha256: hash(original), resultSha256: hash(normalizedValidator),
  dependency: { name: 'json-schema-traverse', version: '1.0.0' } }];
const esbuild = require('../../apps/dpi-backend/node_modules/esbuild/lib/main.js');
const result = await esbuild.build({
  absWorkingDir: candidate, stdin: { resolveDir: candidate, contents: [
    "export {createMcpManager} from './packages/durable-mcp/manager.ts';",
    "export {snapshotToServerSpecs} from './packages/durable-mcp/config.ts';",
    "export {createCredentialResolver} from './packages/durable-mcp/auth.ts';",
    "export {resolveMcpSnapshot} from './packages/config-migration/index.ts';",
    "export {authorizeAgentMail} from '/home/ubuntu/Projects/pi-durable-host/apps/dpi-backend/src/native-profile/memory/mail.ts';",
    "export {mcpNamespace} from '/home/ubuntu/.local/share/pi-durable/tui-releases/20261030-headless-48a55067/host-lane/host/packages/coding-agent/src/core/mcp-servers.ts';",
  ].join('\n') },
  outfile: join(output, 'nico.mjs'), bundle: true, platform: 'node', target: 'node24', format: 'esm', metafile: true,
  legalComments: 'linked', logLevel: 'warning',
  alias: { 'supports-color': '/usr/share/nodejs/supports-color/index.js',
    'json-schema-traverse': dependencyRequire.resolve('json-schema-traverse') },
  plugins: [{ name: 'null-constant-schema-compatibility', setup(build) {
    build.onLoad({ filter: /json-schema-validator\.ts$/ }, args => args.path === join(adapter, 'json-schema-validator.ts')
      ? { contents: normalizedValidator, loader: 'ts', resolveDir: adapter } : undefined);
  } }],
  banner: { js: "import {createRequire as __nicoCreateRequire} from 'node:module'; const require = __nicoCreateRequire(import.meta.url);" },
});
// ws probes these optional native accelerators inside try/catch; its standard JS implementation is retained.
const optionalAccelerators = ['bufferutil', 'utf-8-validate'];
for (const item of Object.values(result.metafile.outputs)) for (const dep of item.imports)
  if (dep.external && !builtinModules.includes(dep.path) && !dep.path.startsWith('node:') && !optionalAccelerators.includes(dep.path))
    throw Error(`NICO_UNBUNDLED_IMPORT: ${dep.path}`);
const sources = [], notices = new Map();
for (const input of Object.keys(result.metafile.inputs)) {
  if (input === '<stdin>') continue;
  const path = resolve(candidate, input), bytes = await readFile(path);
  sources.push({ path, sha256: hash(bytes) });
  for (let dir = dirname(path); dir !== dirname(dir); dir = dirname(dir)) {
    const files = await readdir(dir);
    if (!files.includes('package.json')) continue;
    for (const file of files.filter(name => /^(licen[sc]e|copying|notice)(\.|$)/i.test(name))) {
      const full = join(dir, file);
      if ((await stat(full)).isFile()) notices.set(full, await readFile(full));
    }
    break;
  }
}
await mkdir(join(output, 'licenses'));
for (const [path, bytes] of notices) await writeFile(join(output, 'licenses', `${hash(bytes).slice(0,16)}-${basename(path)}`), bytes);
const bundle = await readFile(join(output, 'nico.mjs'));
await writeFile(join(output, 'PROVENANCE.json'), JSON.stringify({ artifact: receipt, additionalNicoPatches, sources,
  esbuild: esbuild.version, optionalAccelerators, bundle: { sha256: hash(bundle), bytes: bundle.length }, licenses: [...notices.keys()],
  adapterInputs: sources.filter(item => !relative(adapter, item.path).startsWith('..')).length,
}, null, 2) + '\n', { mode: 0o600 });
console.log(JSON.stringify({ status: 'BUILT', version: receipt.version, inputs: sources.length, bytes: bundle.length, additionalNicoPatches: additionalNicoPatches.length }));
