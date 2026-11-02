// Independent 67-session real Store/HTTP integration. Faux only, disposable DB.
// node [--import tsx] catalog-67.mjs /absolute/backend/src-or-dist-directory
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const source = resolve(process.argv[2]);
const ext = existsSync(join(source, 'store.ts')) ? 'ts' : 'js';
const load = name => import(pathToFileURL(join(source, `${name}.${ext}`)).href);
const files = ['store', 'http-server', 'routes', 'runtime-profile'];
const hash = async () => Object.fromEntries(await Promise.all(files.map(async name => [name, createHash('sha256').update(await readFile(join(source, `${name}.${ext}`))).digest('hex')])));
const beforeHashes = await hash();
const { Store } = await load('store');
const { minimalProfile } = await load('runtime-profile');
const { createHttpServer } = await load('http-server');
const root = await mkdtemp(join(tmpdir(), 'heidi-catalog67-'));
const work = join(root, 'work'); await mkdir(work);
const options = { dataDir: join(root, 'data'), startDirs: [work], name: 'isolated-67', provider: 'faux', profile: minimalProfile };
const token = 'HEIDI_DISPOSABLE_67_TOKEN';
const secret = 'HEIDI_PRIVATE_RESTORE_SENTINEL';
const checks = [], timings = {};
let store, server, release, timer;
let active = 0, peak = 0, cleanup = 0, released = false;
const report = { result: 'FAIL', root, source, beforeHashes, checks, timings, externalModelCalls: 0, productionActivation: 'NOT RUN' };
async function until(predicate, label, timeout = 15000) {
  const end = performance.now() + timeout;
  while (performance.now() < end) {
    if (await predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw Error(`Timed out: ${label}`);
}
try {
  store = await Store.open(options);
  for (let i = 0; i < 67; i++) await store.create({ name: `qa-${i}`, cwd: work, model: { provider: 'faux', modelId: 'echo' } });
  const ordered = store.list();
  const roots = Object.fromEntries(await Promise.all(ordered.map(async row => [row.id, (await store.resolveAgent(row.id, 'main')).c.id])));
  await store.close();
  const catalog = new DatabaseSync(join(options.dataDir, 'catalog.sqlite'), { readOnly: true });
  const profilesBefore = catalog.prepare('SELECT * FROM session_profiles ORDER BY sessionId').all();
  catalog.close();
  assert.equal(profilesBefore.length, 67);
  const [fast, slow, broken] = ordered;
  const gate = new Promise(resolve => { release = () => { released = true; resolve(); }; });
  let slowStarted = false;
  const profile = Object.assign(async context => {
    const started = performance.now();
    active++; peak = Math.max(peak, active);
    try {
      if (context.sessionId === slow.id) {
        slowStarted = true;
        timer = setTimeout(release, 2000);
        await gate;
      }
      if (context.sessionId === broken.id) throw Error(secret);
      const composition = minimalProfile(context);
      return { ...composition, cleanup: async () => { cleanup++; } };
    } finally {
      active--;
      timings[context.sessionId] = { profileCreateMs: performance.now() - started };
    }
  }, { id: minimalProfile.id });
  const start = performance.now();
  store = await Store.openCatalog({ ...options, profile });
  timings.catalogOpenMs = performance.now() - start;
  server = createHttpServer(store, token).listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (path, method = 'GET', body) => fetch(base + path, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(1000) });
  await until(() => slowStarted && store.sessionReadiness(fast.id) === 'ready' && store.sessionReadiness(broken.id) === 'failed', 'fast/failed session while stall remains', 1800);
  assert.equal(released, false, 'HTTP must become usable before injected 2s stall completes');
  assert.equal((await request('/healthz')).status, 200);
  assert.equal((await request(`/v1/sessions/${fast.id}/agents/main`)).status, 200);
  const blocked = await request(`/v1/sessions/${slow.id}/agents/main/messages`, 'POST', { content: 'MUST_NOT_EXECUTE', requestId: 'qa-blocked', whenBusy: 'steer' });
  assert.equal(blocked.status, 503);
  const failed = await request(`/v1/sessions/${broken.id}/agents/main`);
  assert.equal(failed.status, 503);
  assert.ok(!(await failed.text()).includes(secret));
  const catalogue = await request('/v1/sessions');
  assert.equal(catalogue.status, 200);
  assert.ok(!(await catalogue.text()).includes(secret));
  assert.equal(released, false, 'control requests must finish while stall remains blocked');
  timings.firstSessionHttpMs = performance.now() - start;
  assert.ok(peak <= 4, `initializer peak ${peak} exceeds bound 4`);
  await assert.rejects(Store.open(options), /already owned/);
  checks.push('67-session real HTTP: liveness/fast/catalogue respond during 2s stall; restoring/failed refuse mutation/read; no raw sentinel');
  await store.whenRestored();
  timings.allSettledMs = performance.now() - start;
  assert.deepEqual(store.recoveryStatus(), { state: 'ready', total: 67, restoring: 0, ready: 66, failed: 1 });
  assert.equal(active, 0);
  checks.push('all 67 settle to 66 ready/1 failed with initializer peak <=4 and second owner refused');
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); server = undefined;
  const closeStart = performance.now(); await store.close();
  timings.shutdownMs = performance.now() - closeStart;
  assert.ok(timings.shutdownMs < 10000, 'cooperative shutdown budget');
  assert.equal(cleanup, 66, 'all successfully owned profiles cleaned once');
  store = await Store.open(options);
  assert.deepEqual(store.list(), ordered, 'all saved rows, including exact provider/model, survive reopen');
  for (const row of store.list()) {
    assert.equal((await store.resolveAgent(row.id, 'main')).c.id, roots[row.id], 'native root ID survives reopen');
  }
  checks.push('67 exact session/root conversation IDs survive reopen; 66 owned profiles cleaned once');
  await store.close(); store = undefined;
  const afterCatalog = new DatabaseSync(join(options.dataDir, 'catalog.sqlite'), { readOnly: true });
  const profilesAfter = afterCatalog.prepare('SELECT * FROM session_profiles ORDER BY sessionId').all();
  afterCatalog.close();
  assert.deepEqual(profilesAfter, profilesBefore, 'exact saved profile IDs survive reopen');
  checks.push('all 67 exact provider/model rows and saved profile IDs survive reopen');
  const afterHashes = await hash();
  assert.deepEqual(afterHashes, beforeHashes, 'candidate changed during QA; result cannot be accepted');
  Object.assign(report, { result: 'PASS', peakInitializers: peak, afterHashes, sessionRootIds: roots });
} catch (error) {
  report.error = String(error);
  throw error;
} finally {
  clearTimeout(timer); release?.();
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  await store?.close();
  await writeFile(join(root, 'result.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ ...report, sessionRootIds: report.sessionRootIds ? '67 retained in result.json' : undefined, timings: { catalogOpenMs: timings.catalogOpenMs, firstSessionHttpMs: timings.firstSessionHttpMs, allSettledMs: timings.allSettledMs, shutdownMs: timings.shutdownMs } }, null, 2));
}
