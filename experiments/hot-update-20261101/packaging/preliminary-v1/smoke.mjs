// Read-only imports and integrity checks inside Frank's physical sandbox.
import assert from 'node:assert/strict';
import {readFile, realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL, fileURLToPath} from 'node:url';

const root = '/candidate';
const digest = '18724c7afeffda96d63b10c57ca77e1c280598f6fd0c6f60e778e5402c78e73a';
const {validateSealedArtifact} = await import(`${root}/native-artifact.mjs`);
const result = await validateSealedArtifact({root, manifestSha256: digest});
const previous = await validateSealedArtifact({root: '/previous',
  manifestSha256: '672b7e5e746dcabfbf5ca82a571cd35f328e457f717b64e2b852b3afa3931665'});
const manifest = JSON.parse(await readFile(`${root}/RESTART-CANDIDATE.json`, 'utf8'));
assert.equal(manifest.status, 'PRELIMINARY_NOT_ACCEPTED');
assert.equal(manifest.activated, false);
assert.equal(manifest.productionActivation, 'NOT RUN');
assert.ok(manifest.checksNotRun.length >= 6);
const reload = fileURLToPath(import.meta.resolve('@local/pi-durable-reload',
  pathToFileURL(`${root}/node_modules/dpi-backend/dist/dpi-backend/src/store.js`).href));
assert.ok(reload.startsWith(`${root}/node_modules/dpi-backend/node_modules/@local/pi-durable-reload/`));
const modules = [
  'node_modules/dpi-backend/dist/dpi-backend/src/store.js',
  'node_modules/dpi-backend/dist/dpi-backend/src/http-server.js',
  'node_modules/dpi-backend/dist/dpi-backend/src/native-import.js',
  'node_modules/dpi-backend/dist/dpi-backend/src/native-profile/profile.js',
  'node_modules/dpi-sdk/dist/client.js',
  'node_modules/dpi-terminal-adapter/dist/remote-controller.js',
  'compiled/nico.mjs', 'operational-profile.mjs', 'operational-models.mjs',
  'delm-profile.mjs', 'session-mcp.mjs', 'gippity/operational-profile.mjs',
  'gippity/integration.mjs', 'gippity/audio-host.mjs', 'delm-engine/index.js',
];
for (const name of modules) {
  const path = `${root}/${name}`;
  assert.equal(await realpath(path), path);
  await import(pathToFileURL(path).href);
}
await import(pathToFileURL(reload).href);
const sdk = await readFile(`${root}/node_modules/dpi-sdk/dist/api.d.ts`, 'utf8');
assert.match(sdk, /cleanup\?:\s*['"]failed['"]/);
assert.equal(createHash('sha256').update(await readFile(`${root}/compiled/nico.mjs`)).digest('hex'),
  '4ac012202ca81685dd1e21fb1a7aa665cfe30a2b42cc08c37214118a89caca52');
console.log(JSON.stringify({status: 'PASS', scope: 'sealed integrity and read-only imports only',
  files: result.files.size, previousFiles: previous.files.size,
  importedModules: modules.length + 1, physicalReload: reload,
  manifestSha256: digest, productionActivation: 'NOT RUN'}));
