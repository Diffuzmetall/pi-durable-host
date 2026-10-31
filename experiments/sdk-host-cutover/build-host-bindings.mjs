#!/usr/bin/env node
// Offline builder: freeze the original adapters, never import mutable installations at runtime.
import { createHash } from 'node:crypto';
import { builtinModules, createRequire } from 'node:module';
import { dirname, join, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises';

const here = dirname(fileURLToPath(import.meta.url));
const release = '/home/ubuntu/.local/share/pi-durable-host/releases/c0019d7-dadd5534';
const version = process.argv[2];
if (!/^host-bindings-v[1-9][0-9]*$/.test(version ?? '')) throw Error('A new host-bindings-vN destination is required');
const destination = join(release, version, 'compiled');
await mkdir(destination, { mode: 0o700 }); // Never overwrite an earlier candidate/evidence.
const require = createRequire(import.meta.url);
const esbuild = require('/home/ubuntu/Projects/pi-durable-host/apps/dpi-backend/node_modules/esbuild/lib/main.js');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const output = join(destination, 'bindings.mjs');
const result = await esbuild.build({
  absWorkingDir: here, entryPoints: [join(here, 'host-bindings-entry.mjs')], outfile: output,
  bundle: true, platform: 'node', target: 'node24', format: 'esm', metafile: true,
  nodePaths: ['/home/ubuntu/.local/share/pi-durable/tui-releases/20261030-headless-48a55067/extensions-lane/langfuse-node_modules.unused',
    join(release, 'node_modules'), '/home/ubuntu/.pi/agent/npm/node_modules',
    '/home/ubuntu/Projects/master/experiments/pi-durable-1.4-upgrade/extensions-lane/node_modules'],
  alias: Object.fromEntries(['otel', 'tracing', 'core'].map(name => [`@langfuse/${name}`,
    `/home/ubuntu/Projects/master/experiments/pi-durable-1.4-upgrade/extensions-lane/node_modules/@langfuse/${name}/dist/index.mjs`])),
  // The old mutable symlink now contains OTel 3 alongside API 1.9. Freeze the coherent
  // 2.12/0.223 snapshot instead; do not patch missing exports or change installed runtimes.
  plugins: [{ name: 'frozen-opentelemetry', setup(build) {
    build.onResolve({ filter: /^@opentelemetry\// }, args => args.pluginData?.frozenOtel ? undefined
      : build.resolve(args.path, { resolveDir: '/', kind: args.kind, pluginData: { frozenOtel: true } }));
  } }],
  legalComments: 'linked', logLevel: 'warning',
  external: ['@earendil-works/pi-ai', '@earendil-works/pi-ai/*', '@earendil-works/pi-mcp', '@earendil-works/pi-mcp/*'],
  banner: { js: "import {createRequire as __nativeCreateRequire} from 'node:module'; const require = __nativeCreateRequire(import.meta.url);" },
});
// Every runtime dependency must be a Node built-in or an installed immutable native package.
for (const item of Object.values(result.metafile.outputs)) for (const dependency of item.imports) {
  if (dependency.external && !builtinModules.includes(dependency.path) && !/^(node:|@earendil-works\/pi-(ai|mcp)(\/|$))/.test(dependency.path))
    throw Error(`Unfrozen runtime import: ${dependency.path}`);
}
const sources = [];
const notices = new Map();
for (const input of Object.keys(result.metafile.inputs)) {
  const path = resolve(here, input);
  sources.push({ path, sha256: hash(await readFile(path)) });
  // Preserve license/notice files for bundled packages, including the original host checkout.
  for (let directory = dirname(path); directory !== dirname(directory); directory = dirname(directory)) {
    const names = await readdir(directory);
    if (!names.includes('package.json')) continue;
    for (const name of names.filter(name => /^(licen[sc]e|copying|notice)(\.|$)/i.test(name))) {
      const source = join(directory, name);
      if ((await stat(source)).isFile()) notices.set(source, await readFile(source));
    }
    break;
  }
}
const originalLicense = '/home/ubuntu/.local/share/pi-durable/tui-releases/20261030-headless-48a55067/host-lane/host/LICENSE';
notices.set(originalLicense, await readFile(originalLicense));
await mkdir(join(destination, 'licenses'), { mode: 0o700 });
const licenses = [];
for (const [source, bytes] of notices) {
  const file = `licenses/${hash(bytes).slice(0, 16)}-${basename(source)}`;
  await writeFile(join(destination, file), bytes, { mode: 0o600 });
  licenses.push({ source, file, sha256: hash(bytes) });
}
const bytes = await readFile(output);
await writeFile(join(destination, 'PROVENANCE.json'), JSON.stringify({
  schema: 1, generatedAt: new Date().toISOString(), esbuild: esbuild.version,
  bundle: { file: 'bindings.mjs', sha256: hash(bytes), bytes: bytes.length }, sources, licenses,
  runtimeImports: [...new Set(Object.values(result.metafile.outputs).flatMap(item => item.imports.map(value => value.path)))],
}, null, 2) + '\n', { mode: 0o600 });
console.log(JSON.stringify({ status: 'HOST_BINDINGS_BUILT', version, inputs: sources.length, licenses: licenses.length, bytes: bytes.length }));
