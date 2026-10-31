import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BACKGROUND_CONTEXT as ctx, withAbortSignal } from '@earendil-works/chord/context';
import { createModels } from '@earendil-works/pi-ai/models';
import { fauxProvider, fauxAssistantMessage } from '@earendil-works/pi-ai/providers/faux';
import { Harness, createRegistry, defineExtension } from '@earendil-works/pi-durable';
import { NodeExecutionEnv } from '@earendil-works/pi-durable/env/node';
import { openNodeSqliteStorage } from '@earendil-works/pi-durable/storage/sqlite/node';
import { createSessionMemory, HindsightClient, resolveConfig } from '/tmp/dpi-packed-y88Lnt/install/node_modules/dpi-backend/dist/dpi-backend/src/native-profile/memory/session-memory.mjs';
import { withSessionLogs } from '/tmp/dpi-packed-y88Lnt/install/node_modules/dpi-backend/dist/dpi-backend/src/native-profile/memory/logging-scope.mjs';

test('actual explicit-registry reload restores callback scope under neutral native callers and independent sessions', { timeout: 20000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dpi-memory-reload-'));
  const calls = [], sessions = [];
  const endpoint = createServer(async (request, response) => {
    let raw = ''; for await (const bytes of request) raw += bytes;
    const match = request.url.match(/^\/v1\/default\/banks\/([^/]+)(.*)$/);
    assert.ok(match); const bank = decodeURIComponent(match[1]);
    assert.equal(request.headers.authorization, `Bearer synthetic-${bank}`);
    const body = raw ? JSON.parse(raw) : undefined;
    calls.push({ bank, path: match[2], body }); response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify(match[2] === '/memories/recall' ? { results: [{ text: `RECALL_${bank}_ONLY` }] } : {}));
  }).listen(0, '127.0.0.1'); await once(endpoint, 'listening');
  const base = `http://127.0.0.1:${endpoint.address().port}`;
  async function open(label) {
    const work = join(directory, label, 'work'), state = join(directory, label, 'state'); await mkdir(work, { recursive: true });
    const registry = createRegistry();
    registry.install(defineExtension({ name: 'neutral-native-section-caller', wraps: [{ section: 'hindsight_memory',
      wrap: section => ({ ...section, render: (...args) => withSessionLogs(undefined, () => section.render(...args)) }),
    }] }));
    const cfg = resolveConfig({ apiUrl: base, apiToken: `synthetic-${label}`, serverMode: 'remote', autoInject: 'recall', retainSessions: false,
      autoSeed: false, autoUpdate: false, codebaseSurvey: false, gitIngest: 'none', manageBankConfig: false });
    const client = new HindsightClient({ apiUrl: base, apiToken: cfg.apiToken, bank: label, project: work });
    const memory = await createSessionMemory(registry, { directory: state,
      resolveBinding: cwd => { assert.equal(cwd, work); return { cfg, bankId: label }; }, resolveClient: () => client,
      lifecycleEffects: { env: {}, hasGit: () => false },
    });
    const models = createModels(), provider = fauxProvider({ provider: `reload-${label}`, models: [{ id: 'fixture' }], tokensPerSecond: 100000 });
    models.setProvider(provider.provider);
    const storage = await openNodeSqliteStorage(join(state, 'native.sqlite'));
    const host = await Harness.open(storage, { registry, models, env: () => new NodeExecutionEnv({ cwd: work }) }, ctx);
    let conversation = await host.root(ctx, { agent: { cwd: work, model: { provider: `reload-${label}`, modelId: 'fixture' } } });
    await memory.bind({ session: host, storage, context: ctx });
    const value = { memory, host,
      async run(marker) {
        provider.setResponses([fauxAssistantMessage(`ANSWER_${label}`)]);
        const submission = await memory.controller.submit(conversation, marker, 'followUp', `${label}-${marker}`);
        assert.equal((await submission.wait(withAbortSignal(AbortSignal.timeout(5000), ctx))).status, 'done');
        assert.ok(calls.some(call => call.bank === label && call.path === '/memories/recall' && call.body.query.includes(marker)), marker);
      },
      async reloadFresh(explicit) {
        await (explicit ? memory.controller.reload(registry) : memory.controller.reload());
        const page = await conversation.entries({}, 200, undefined, ctx);
        conversation = await conversation.fork(page.items.at(-1).id, { ownership: { kind: 'ownerless' } }, ctx);
      },
      async close() { await memory.close(); await host.close(ctx); },
    }; sessions.push(value); return value;
  }
  try {
    const a = await open('A'), b = await open('B');
    await a.run('BEFORE_A'); await b.run('BEFORE_B');
    await a.reloadFresh(true); await a.run('EXPLICIT_RELOAD_A');
    await b.reloadFresh(false); await b.run('DEFAULT_RELOAD_B');
    assert.ok(calls.every(call => !JSON.stringify(call.body ?? null).includes(call.bank === 'A' ? 'BEFORE_B' : 'BEFORE_A')));
    assert.notEqual(a.memory.paths.log, b.memory.paths.log);
  } finally {
    for (const session of sessions) await session.close();
    endpoint.closeAllConnections(); await new Promise(resolve => endpoint.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
});
