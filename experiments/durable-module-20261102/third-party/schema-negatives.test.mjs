import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import test from 'node:test';

// Evaluate only schema declarations from current owning source. Never execute tools,
// import the native profile, load credentials, or contact a provider.
const root = fileURLToPath(new URL('../../../', import.meta.url));
const require = createRequire(join(root, 'apps/dpi-backend/package.json'));
const ts = require('typescript');
const { Type } = require('typebox');
const { Check } = require('typebox/value');

async function schemas(path, declarations) {
  const text = await readFile(join(root, 'apps/dpi-backend/src/native-profile/tools', path), 'utf8');
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const parts = [];
  const names = [];
  function visit(node) {
    if (ts.isVariableDeclaration(node) && ts.isSourceFile(node.parent.parent.parent) &&
        declarations.includes(node.name.getText(source))) {
      parts.push(`const ${node.name.getText(source)} = ${node.initializer.getText(source)};`);
      names.push(node.name.getText(source));
    }
    if (ts.isPropertyAssignment(node) && node.name.getText(source) === 'parameters') {
      const name = `inline${names.length}`;
      parts.push(`const ${name} = ${node.initializer.getText(source)};`);
      names.push(name);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.ok(names.length, path);
  const code = ts.transpileModule(parts.join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return vm.runInNewContext(`${code}\n({${names.join(',')}})`, { Type }, { timeout: 1000 });
}
const ask = (await schemas('codex/ask.ts', ['parameters'])).parameters;
const image = (await schemas('codex/image.ts', ['parameters'])).parameters;
const search = (await schemas('codex/search.ts', ['object', 'text', 'integer', 'choice', 'batch', 'query', 'SearchCommandsSchema'])).SearchCommandsSchema;
const usage = Object.values(await schemas('codex/runtime.ts', []))[0];
const antigravity = Object.values(await schemas('antigravity/index.ts', []));

test('required, optional, closed object and no-coercion contracts remain explicit', () => {
  for (const schema of [ask, image]) {
    assert.equal(Check(schema, { prompt: 'x' }), true);
    for (const value of [{}, { prompt: '' }, { prompt: 1 }, { prompt: 'x', unexpected: true },
      { prompt: 'x', num_last_images_to_include: '2' }, { prompt: 'x', num_last_images_to_include: 0 }]) {
      assert.equal(Check(schema, value), false, JSON.stringify(value));
    }
  }
  assert.equal(Check(usage, {}), true);
  assert.equal(Check(usage, { extra: true }), false);
});

test('Codex optional enums, numeric bounds and image arrays reject invalid values', () => {
  for (const value of [{ reasoning: 'invalid' }, { verbosity: 'invalid' }, { max_output_tokens: 32769 },
    { image_paths: [] }, { image_paths: Array(6).fill('x') }, { model: '' }]) {
    assert.equal(Check(ask, { prompt: 'x', ...value }), false, JSON.stringify(value));
  }
  assert.equal(Check(ask, { prompt: 'x', reasoning: 'off', max_output_tokens: 32768 }), true);
  assert.equal(Check(image, { prompt: 'x', quality: 'unknown' }), false);
  assert.equal(Check(image, { prompt: 'x', referenced_paths: [] }), false);
  assert.equal(Check(image, { prompt: 'x', quality: 'auto' }), true);
});

test('nested search objects, required fields, arrays and patterns stay closed', () => {
  assert.equal(Check(search, {}), true); // The executor owns the nonempty-command requirement.
  assert.equal(Check(search, { search_query: [{ q: 'x', recency: 0 }] }), true);
  for (const value of [{ search_query: [] }, { search_query: [{}] }, { search_query: [{ q: '' }] },
    { search_query: [{ q: 'x', recency: '1' }] }, { search_query: [{ q: 'x', extra: true }] },
    { search_query: Array(5).fill({ q: 'x' }) }, { extra: true }, { time: [{ utc_offset: '3' }] },
    { finance: [{ ticker: 'x', type: 'invalid' }] }]) {
    assert.equal(Check(search, value), false, JSON.stringify(value));
  }
  assert.equal(Check(search, { time: [{ utc_offset: '+03:00' }] }), true);
});

test('Antigravity provider tools keep required strings, optional booleans and closed objects', () => {
  assert.equal(antigravity.length, 2);
  const [google, generate] = antigravity;
  assert.equal(Check(google, { query: 'x', thinking: false }), true);
  for (const value of [{}, { query: '' }, { query: 'x', thinking: 'false' }, { query: 'x', extra: true }]) {
    assert.equal(Check(google, value), false, JSON.stringify(value));
  }
  assert.equal(Check(generate, { prompt: 'x' }), true);
  assert.equal(Check(generate, { prompt: 'x', extra: true }), false);
});

test('no migration invents format or structuredOutput semantics absent from these tool schemas', () => {
  for (const schema of [ask, image, search, usage, ...antigravity]) {
    const encoded = JSON.stringify(schema);
    assert.equal(encoded.includes('"format"'), false);
    assert.equal(encoded.includes('"structuredOutput"'), false);
  }
  // All selected root objects were already closed; no open object is converted here.
  for (const schema of [ask, image, search, usage, ...antigravity]) assert.equal(schema.additionalProperties, false);
});
