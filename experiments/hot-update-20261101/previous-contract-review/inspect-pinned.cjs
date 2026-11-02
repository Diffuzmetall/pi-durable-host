// Static evidence only: parse sealed source text; never import artifact modules.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ts = require('../../../apps/dpi-backend/node_modules/typescript/lib/typescript.js');
const root = '/tmp/pi-host-restart-candidate-20261101-alice-v2';
const digest = b => crypto.createHash('sha256').update(b).digest('hex');
const manifestBytes = fs.readFileSync(path.join(root, 'RESTART-CANDIDATE.json'));
if (digest(manifestBytes) !== '672b7e5e746dcabfbf5ca82a571cd35f328e457f717b64e2b852b3afa3931665') throw Error('MANIFEST_MISMATCH');
const manifest = JSON.parse(manifestBytes);
const native = 'node_modules/dpi-backend/dist/dpi-backend/src/native-profile/';
const sdk = 'node_modules/@earendil-works/pi-durable/dist/';
const extra = new Set(['operational-profile.mjs', 'operational-models.mjs', 'delm-profile.mjs', 'delm-engine/index.js',
  'node_modules/dpi-backend/dist/dpi-backend/src/native-import.js',
  'node_modules/@earendil-works/pi-ai/dist/providers/data/openai-codex.json']);
const result = { manifestSha256: digest(manifestBytes), files: {}, definitions: [], defaultModel: null,
  limitations: 'Literal AST census, not installed-composition completeness or compatibility acceptance. Function bodies are retained as source only.' };
for (const [name, pin] of Object.entries(manifest.files)) {
  const selected = extra.has(name) || ((name.startsWith(native) || name.startsWith(sdk)) && /\.(m?js)$/.test(name) && !name.includes('/vendor/') && !name.includes('/upstream/'));
  if (!selected) continue;
  const bytes = fs.readFileSync(path.join(root, name));
  const actual = digest(bytes);
  if (actual !== pin.sha256) throw Error(`PIN_MISMATCH:${name}`);
  result.files[name] = actual;
  if (name.endsWith('openai-codex.json')) {
    const entry = JSON.parse(bytes)['openai-codex-responses']['chat:gpt-6.1-sol'];
    if (entry.provider !== 'openai-codex' || entry.id !== 'gpt-6.1-sol') throw Error('DEFAULT_MODEL_MISSING');
    result.defaultModel = entry;
    continue;
  }
  const source = ts.createSourceFile(name, bytes.toString(), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  if (source.parseDiagnostics.length) throw Error(`PARSE_FAILED:${name}`);
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && ['defineDoc', 'defineDocFamily', 'defineTask'].includes(node.expression.text)) {
      const object = node.arguments[0];
      if (object && ts.isObjectLiteralExpression(object)) {
        const fields = {};
        for (const property of object.properties) {
          if (!ts.isPropertyAssignment(property)) continue;
          const key = property.name.getText(source).replace(/^['"]|['"]$/g, '');
          if (['name', 'kind', 'version', 'scope', 'history', 'fork', 'family', 'initial'].includes(key)) fields[key] = property.initializer.getText(source);
        }
        result.definitions.push({ file: name, line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
          token: node.expression.text, exported: ts.isVariableDeclaration(node.parent) && ts.isVariableDeclarationList(node.parent.parent) &&
            ts.isVariableStatement(node.parent.parent.parent) && !!node.parent.parent.parent.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword), fields });
      } else result.definitions.push({ file: name, token: node.expression.text, unresolvedArgument: object?.getText(source) });
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}
process.stdout.write(JSON.stringify(result, null, 2) + '\n');
