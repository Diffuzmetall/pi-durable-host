#!/usr/bin/env node
// Pinned dependency adaptation, never an installer or a production operation.
import { readFile, writeFile, realpath, stat } from 'node:fs/promises';
import { resolve, relative, isAbsolute, join } from 'node:path';
import { createHash } from 'node:crypto';

const revision = 'host-commit-authorization-v1';
const root = await realpath(resolve(process.argv[2] ?? ''));
if (!root.startsWith('/tmp/') || root === '/tmp' || /(?:source|build)-20261102-alice-v1$/.test(root))
  throw Error('Supply an owned disposable candidate under /tmp; the shared seed is read-only');
const directory = await realpath(join(root, 'node_modules/@earendil-works/pi-durable/dist'));
const nested = relative(root, directory);
if (isAbsolute(nested) || nested.startsWith('..')) throw Error('Native dependency resolves outside candidate');
const packageJson = JSON.parse(await readFile(join(directory, '../package.json'), 'utf8'));
if (packageJson.version !== '1.5.0') throw Error('Patch requires exact Durable 1.5.0');
const hash = value => createHash('sha256').update(value).digest('hex');
const edits = [
  { path: 'session/session.js', before: 'a2429d4bad5ae08a7dfae32fe05e74cb881d9100d9035a6784eedca3f92d7496', changes: [
    ['    #closing;', '    #beforeCommit;\n    #closing;'],
    ['persistWithinMs = () => undefined) {', 'persistWithinMs = () => undefined, beforeCommit) {'],
    ['        this.#readOnly = readOnly;', '        this.#readOnly = readOnly;\n        this.#beforeCommit = beforeCommit;'],
    ['            result = await change(tx);', '            this.#beforeCommit?.(context);\n            result = await change(tx);\n            this.#beforeCommit?.(context);'],
  ] },
  { path: 'session/session.d.ts', before: '86deacb4998d62838e75302b61e100cd44510f7a3be6db6ef622982c43b7290f', changes: [
    ['persistWithinMs?: () => number | undefined);', 'persistWithinMs?: () => number | undefined, beforeCommit?: (context: Context) => void);'],
  ] },
  { path: 'harness/harness.js', before: '4096cbb0756c59606a0b6437909a879b5c603fde2d2a9bc25854398e30b25e47', changes: [
    ['options.readOnly === true, () => hostSettings()?.progress?.persistWithinMs);', 'options.readOnly === true, () => hostSettings()?.progress?.persistWithinMs, options.beforeCommit);'],
  ] },
  { path: 'harness/types.d.ts', before: 'eff2fd6232680d3367a9e7c69fe158b38e1aff2d5f182086bfe6bfc1f2b1bb66', changes: [
    ['export type HarnessOptions<Tool extends ToolRegistration = ToolRegistration> = {', 'export type HarnessOptions<Tool extends ToolRegistration = ToolRegistration> = {\n    /** Synchronous authorization at callback entry and success, before any provisional change is committed. A throw rolls back the callback. No asynchronous work or side effects. */\n    readonly beforeCommit?: (context: Context) => void;'],
  ] },
  { path: 'index.js', before: '5ca348ed464ecc7f1017f8a988bda277621d33b9591cf9c8f385a2fa3d331318', append: '\nexport const COMMIT_AUTHORIZATION_REVISION = "host-commit-authorization-v1";\n' },
  { path: 'index.d.ts', before: '1f3ce1b8789b6257c6e50b9ac8db4f18c6bcc51461da2bb4d51350040cf9c5fa', append: '\nexport declare const COMMIT_AUTHORIZATION_REVISION: "host-commit-authorization-v1";\n' },
];
// Validate the complete preimage before touching any file. Unknown or partially patched packages are refused.
const prepared = [];
for (const item of edits) {
  const path = join(directory, item.path);
  const physical = await realpath(path);
  if (physical !== path || !(await stat(path)).isFile()) throw Error(`Unexpected native file: ${item.path}`);
  const source = await readFile(path, 'utf8');
  if (hash(source) !== item.before) throw Error(`Native preimage mismatch: ${item.path}`);
  let content = source;
  for (const [before, after] of item.changes ?? []) {
    if (content.split(before).length !== 2) throw Error(`Patch anchor is not unique: ${item.path}`);
    content = content.replace(before, after);
  }
  content += item.append ?? '';
  prepared.push({ path, content, file: item.path, before: item.before, after: hash(content) });
}
for (const item of prepared) await writeFile(item.path, item.content);
const evidence = { revision, package: '@earendil-works/pi-durable', version: '1.5.0',
  files: prepared.map(({ file, before, after }) => ({ file, before, after })) };
await writeFile(join(root, 'commit-authorization-patch.json'), `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify(evidence));
