import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

// Must run through the existing physical sandbox. No Harness or Models is created.
assert.equal(process.env.HOME, '/scratch/home');
const require = createRequire('/candidate/apps/dpi-backend/package.json');
const resolve = name => import.meta.resolve(name, 'file:///candidate/apps/dpi-backend/package.json');
const native = await import(resolve('@earendil-works/pi-durable'));
const { validateToolArguments } = await import(resolve('@earendil-works/pi-ai'));
const { Type } = require('typebox');
const results = [];
const record = (name, detail = {}) => { results.push({ name, status: 'PASS', ...detail }); };
assert.equal(typeof native.Harness.open, 'function');
assert.equal('watchEvents' in native, false);
record('real target removes watchEvents');

for (const packageName of ['chord', 'pi-ai', 'pi-durable']) {
  const path = `/candidate/node_modules/@earendil-works/${packageName}/package.json`;
  assert.equal(JSON.parse(await readFile(path)).version, '1.5.0');
}
record('one actual native version set: 1.5.0');

const { default: createCodex } = await import('file:///candidate/apps/dpi-backend/src/native-profile/tools/codex/index.ts');
const { default: createAntigravity } = await import('file:///candidate/apps/dpi-backend/src/native-profile/tools/antigravity/index.ts');
const tools = [...createCodex(undefined).tools, ...createAntigravity({}).tools];
assert.deepEqual(tools.map(tool => tool.name), ['codex_ask', 'codex_search', 'codex_image', 'codex_usage', 'google_search', 'generate_image']);
const byName = new Map(tools.map(tool => [tool.name, tool]));
const validate = (name, args) => validateToolArguments(byName.get(name), { type: 'toolCall', id: 'offline-schema-only', name, arguments: args });
assert.deepEqual(validate('codex_ask', { prompt: 'x' }), { prompt: 'x' });
for (const [name, args] of [
  ['codex_ask', {}], ['codex_ask', { prompt: '' }], ['codex_ask', { prompt: 'x', extra: 1 }],
  ['codex_image', { prompt: 'x', quality: 'invalid' }], ['codex_image', { prompt: 'x', num_last_images_to_include: 6 }],
  ['codex_search', { search_query: [{}] }], ['codex_search', { search_query: [{ q: 'x', extra: 1 }] }],
  ['codex_search', { time: [{ utc_offset: 'invalid' }] }], ['codex_usage', { token: 'caller' }],
  ['google_search', { query: '' }], ['generate_image', { prompt: 'x', extra: 1 }],
]) assert.throws(() => validate(name, args), /Validation failed/);
record('six actual native tool definitions and 11 negative schema inputs');
const supplied = { prompt: 'x', num_last_images_to_include: '2' };
assert.equal(validate('codex_ask', supplied).num_last_images_to_include, 2);
assert.equal(supplied.num_last_images_to_include, '2');
record('native pi-ai coercion preserved without mutating supplied arguments');

// Existing tool definitions are closed; a direct TypeBox object remains open unless specified otherwise.
const open = { name: 'offline-open-probe', parameters: Type.Object({ id: Type.Integer() }) };
assert.deepEqual(validateToolArguments(open, { name: open.name, arguments: { id: 1, extra: true } }), { id: 1, extra: true });
const formatted = { name: 'offline-format-probe', parameters: Type.Object({ address: Type.String({ format: 'email' }) }) };
assert.throws(() => validateToolArguments(formatted, { name: formatted.name, arguments: { address: 'invalid' } }), /Validation failed/);
assert.equal(validateToolArguments(formatted, { name: formatted.name, arguments: { address: 'a@example.invalid' } }).address, 'a@example.invalid');
record('open objects and standard pi-ai format validation remain distinct');

const sdk = await import(resolve('@howaboua/pi-durable-components'));
const pkg = JSON.parse(await readFile('/candidate/node_modules/@howaboua/pi-durable-gippity-voice/package.json'));
const manifest = sdk.parseComponentPackage(pkg);
const compatibility = sdk.checkComponentCompatibility(manifest, {
  runtime: 'node', capabilities: new Set(pkg.durable.requires),
  peers: { '@earendil-works/chord': '1.5.0', '@earendil-works/pi-ai': '1.5.0', '@earendil-works/pi-durable': '1.5.0', '@modelcontextprotocol/sdk': '1.32.0' },
});
assert.equal(compatibility.status, 'unsupported');
assert.ok(compatibility.reasons.some(reason => reason.includes('@earendil-works/pi-durable')));
record('Component SDK correctly refuses unchanged 0.10.0 native peers', { reasons: compatibility.reasons });
for (const specifier of ['@howaboua/pi-durable-gippity-voice', '@howaboua/pi-durable-gippity-voice/component']) {
  await assert.rejects(import(resolve(specifier)), /does not provide an export named 'watchEvents'/);
}
record('both unchanged GipPity entrypoints reproduce removed named export failure');
const result = { kind: 'DM1_ISOLATED_THIRD_PARTY_PROBE', results,
  acceptance: 'GIPPITY_BLOCKED_NOT_COMPATIBLE',
  limitations: ['No Harness, session, model inference, credentials, audio or external provider was opened.',
    'No compatible third-party artifact has been built.',
    'Existing owned schemas have no format or structuredOutput fields; generic format probe is not live structured-output acceptance.'] };
await writeFile('/scratch/third-party-result.json', JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
