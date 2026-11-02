import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Source census only: never import a provider, open a Harness, or resolve credentials.
export async function inventory(root) {
  const require = createRequire(join(root, 'apps/dpi-backend/package.json'));
  const ts = require('typescript');
  const digest = bytes => createHash('sha256').update(bytes).digest('hex');
  const files = [];
  async function inspect(path) {
    const bytes = await readFile(join(root, path));
    const source = ts.createSourceFile(path, bytes.toString(), ts.ScriptTarget.Latest, true,
      path.endsWith('.ts') ? ts.ScriptKind.TS : ts.ScriptKind.JS);
    if (source.parseDiagnostics.length) throw Error(`Invalid source: ${path}`);
    const imports = [];
    for (const statement of source.statements) {
      if (!ts.isImportDeclaration(statement)) continue;
      const specifier = statement.moduleSpecifier.text;
      if (!specifier.startsWith('@earendil-works/') && !specifier.startsWith('typebox')) continue;
      const clause = statement.importClause;
      const bindings = clause?.namedBindings;
      imports.push({
        specifier,
        typeOnly: Boolean(clause?.isTypeOnly),
        default: clause?.name?.text ?? null,
        namespace: bindings && ts.isNamespaceImport(bindings) ? bindings.name.text : null,
        named: bindings && ts.isNamedImports(bindings) ? bindings.elements.map(item => ({
          imported: (item.propertyName ?? item.name).text,
          local: item.name.text,
          typeOnly: Boolean(item.isTypeOnly || clause.isTypeOnly),
        })) : [],
      });
    }
    const item = { path, sha256: digest(bytes), imports };
    files.push(item);
    return item;
  }
  const voiceRoot = 'experiments/gippity-voice';
  const lockBytes = await readFile(join(root, voiceRoot, 'package-lock.json'));
  const lock = JSON.parse(lockBytes);
  const packages = [];
  for (const name of ['@howaboua/pi-durable-gippity-voice', '@howaboua/pi-durable-components']) {
    const base = `${voiceRoot}/node_modules/${name}`;
    const bytes = await readFile(join(root, base, 'package.json'));
    const manifest = JSON.parse(bytes);
    const pinned = lock.packages[`node_modules/${name}`];
    if (!pinned || pinned.version !== manifest.version) throw Error(`Lock mismatch: ${name}`);
    packages.push({ name, version: manifest.version, manifestSha256: digest(bytes),
      dependencies: manifest.dependencies, peerDependencies: manifest.peerDependencies,
      durable: manifest.durable, resolved: pinned.resolved, integrity: pinned.integrity });
    for (const entry of Object.values(manifest.exports)) {
      if (typeof entry !== 'object' || !entry.import) continue;
      await inspect(`${base}/${entry.import.replace(/^\.\//, '')}`);
    }
  }
  const toolRoot = 'apps/dpi-backend/src/native-profile/tools';
  for (const path of ['codex/ask.ts', 'codex/search.ts', 'codex/image.ts', 'codex/runtime.ts', 'antigravity/index.ts']) {
    await inspect(`${toolRoot}/${path}`);
  }
  const workletPath = `${voiceRoot}/worklet-patch.mjs`;
  const workletBytes = await readFile(join(root, workletPath));
  const backups = [];
  for (const name of ['index', 'activation']) {
    const path = `${voiceRoot}/node_modules/@howaboua/pi-durable-gippity-voice/dist/${name}.js.before-same-origin-worklets`;
    backups.push({ path, sha256: digest(await readFile(join(root, path))) });
  }
  return {
    kind: 'DM1_THIRD_PARTY_SOURCE_INVENTORY', runtimeAcceptance: 'NOT_TESTED',
    typescriptVersion: ts.version,
    voiceLock: { path: `${voiceRoot}/package-lock.json`, sha256: digest(lockBytes) },
    packages, files,
    workletPatch: { path: workletPath, sha256: digest(workletBytes), backups },
    limitations: [
      'Installed 0.10.0 inputs, not a compatible 1.5 artifact.',
      'No live imports, provider calls, auth reads, database opens or activation.',
      'Worklet backups are identified, not assumed to be pristine tarball bytes.',
      'Local source and selected entrypoint census, not a transitive runtime closure proof.',
    ],
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(process.argv[2] ?? fileURLToPath(new URL('../../../', import.meta.url)));
  console.log(JSON.stringify(await inventory(root), null, 2));
}
