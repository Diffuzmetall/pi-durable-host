import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Local artifact assembly and disposable installation only; npm is strictly offline.
assert(process.argv[2], 'Usage: node tests/pack-probe.mjs /absolute/path/to/dpi-sdk.tgz');
const sdkArtifact = resolve(process.argv[2]);
const sdkHash = createHash('sha256').update(readFileSync(sdkArtifact)).digest('hex');
const app = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const root = mkdtempSync(join(tmpdir(), 'dpi-terminal-packed-'));
const artifacts = join(root, 'artifacts');
const install = join(root, 'install');
const home = join(root, 'home');
for (const path of [artifacts, install, home]) mkdirSync(path);
writeFileSync(join(root, 'empty.npmrc'), '');
const env = { PATH: process.env.PATH, LANG: 'C.UTF-8', HOME: home, npm_config_cache: join(homedir(), '.npm'), npm_config_userconfig: join(root, 'empty.npmrc'), npm_config_loglevel: 'silent' };
let step = 0;
function run(command, args, cwd = app, extraEnv = {}) {
  const result = spawnSync(command, args, { cwd, env: { ...env, ...extraEnv }, encoding: 'utf8', timeout: 120_000, maxBuffer: 2 * 1024 * 1024 });
  const log = join(root, `step-${++step}.log`);
  writeFileSync(log, (result.stdout ?? '') + (result.stderr ?? ''));
  assert.equal(result.status, 0, `${command} failed; evidence=${log}; ${result.error?.code ?? ''}`);
  return result.stdout.trim();
}
const packedName = run('npm', ['pack', '--silent', '--pack-destination', artifacts]).split('\n').at(-1);
const terminalArtifact = join(artifacts, packedName);
run('npm', ['install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=false', '--prefix', install, terminalArtifact, sdkArtifact]);
const modules = join(install, 'node_modules');
const terminal = join(modules, 'dpi-terminal-adapter');
for (const forbidden of ['dpi-backend', 'bb-adapter', 'iii-adapter', '@earendil-works/pi-durable', 'better-sqlite3']) {
  assert.throws(() => readFileSync(join(modules, forbidden, 'package.json')), { code: 'ENOENT' });
}
const sdk = JSON.parse(readFileSync(join(modules, 'dpi-sdk', 'package.json'), 'utf8'));
assert.equal(Object.keys(sdk.dependencies ?? {}).length, 0);
const importedSources = [];
for (const item of readdirSync(join(terminal, 'dist'), { recursive: true, withFileTypes: true })) {
  if (!item.isFile() || !/\.(?:js|mjs)$/.test(item.name)) continue;
  const path = join(item.parentPath, item.name);
  const source = readFileSync(path, 'utf8');
  assert(!/\/(?:home|Users)\/[^/]+\//.test(source) && !source.includes('dpi-sdk/src/'), `Private/source import: ${path}`);
  assert(!/from\s*["']@earendil-works\/pi-durable/.test(source), `Native runtime import: ${path}`);
  importedSources.push(path);
}
assert(importedSources.length > 30, 'Actual localized UI must be in the artifact, not only the controller');
for (const name of ['LICENSE.pi', 'LICENSE.extensions', 'LICENSE.pi-style']) {
  assert.match(readFileSync(join(terminal, 'dist/ui/licenses', name), 'utf8'), /MIT License|Permission is hereby granted/);
}
assert.match(readFileSync(join(terminal, 'dist/ui/licenses/NOTICE.tool-cards.md'), 'utf8'), /pi-style/);
assert.match(run(join(modules, '.bin', 'dpi-terminal'), ['--help'], install), /DPI_TOKEN/);
const entry = join(terminal, 'dist/main.js');
const ui = JSON.parse(run('python3', [join(app, 'tests/probe.py'), '--entry', entry]));
const latency = JSON.parse(run('python3', [join(app, 'tests/latency-probe.py'), '--entry', entry]));
assert.equal(ui.result, 'PASS');
assert.equal(latency.result, 'PASS');
run('node', ['--import', 'tsx', '--test', join(app, 'tests/native-attention.test.mts')], app, { TERMINAL_NATIVE_ENTRY: entry });
assert.equal(createHash('sha256').update(readFileSync(sdkArtifact)).digest('hex'), sdkHash);
const result = { result: 'PASS', root, terminalArtifact, terminalSha256: createHash('sha256').update(readFileSync(terminalArtifact)).digest('hex'), sdkArtifact, sdkSha256: sdkHash, installedWithoutOtherAdaptersOrRuntime: true, uiModules: importedSources.length, clientUsesTypeScriptLoader: false, installedNativeAttentionAndGoalUi: true, ui, latency };
writeFileSync(join(root, 'result.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ ...result, latency: { ...latency, sampleMs: undefined } }, null, 2));
