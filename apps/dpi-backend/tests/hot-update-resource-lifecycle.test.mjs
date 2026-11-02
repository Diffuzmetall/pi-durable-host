import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { BACKGROUND_CONTEXT as context, withAbortSignal } from '@earendil-works/chord/context';
import { createModels } from '@earendil-works/pi-ai/models';
import { Harness, createRegistry, defineExtension, defineTask } from '@earendil-works/pi-durable';
import { openNodeSqliteStorage } from '@earendil-works/pi-durable/storage/sqlite/node';
import { ReloadableRegistry, reloadDurable, isDurableReloading } from '@local/pi-durable-reload';

const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'native-resource-lifecycle-'));
  const gate = deferred(), started = deferred();
  const task = defineTask({ name: 'resource.accepted', version: 1, initial: () => ({ phase: 'wait' }), phases: {
    wait: async (_task, runtime, ctx) => {
      started.resolve(); await gate.promise;
      await runtime.commit(() => ({ status: 'terminal', outcome: { status: 'completed', result: 'old-result' } }), ctx);
    },
  }, abort: async (_task, runtime, ctx) => runtime.commit(() => ({ status: 'terminal', outcome: { status: 'aborted' } }), ctx) });
  const extension = version => defineExtension({ name: 'resource-contract', description: `version-${version}`, tasks: [task] });
  const base = createRegistry(); base.install(extension(1));
  const registry = new ReloadableRegistry(base, ['resource-contract']);
  const storage = await openNodeSqliteStorage(join(directory, 'native.sqlite'));
  const harness = await Harness.open(storage, { registry, models: createModels() }, context);
  const root = await harness.root(context, { agent: { cwd: directory } });
  harness.resume();
  return { gate, started, task, extension, registry, storage, harness, root,
    async stage() {
      const staged = await registry.prepare([], [], [{ extension: extension(2), documents: [] }]);
      return { ...staged, validateState: reader => staged.validateState(reader, storage, context) };
    },
    async close() { gate.resolve(); await harness.close(context); await rm(directory, { recursive: true, force: true }); },
  };
}

for (const phase of ['state', 'sync', 'authority']) test(`native ${phase} rejection discards only the unpublished candidate`, { timeout: 10000 }, async () => {
  const f = await fixture();
  try {
    const before = f.registry.snapshot(); let discards = 0, drains = 0, current = true;
    await assert.rejects(reloadDurable({ harness: f.harness, context,
      assertCurrent() { if (!current) throw Error('rejected-authority'); },
      prepareExtensions: async () => {
        const staged = await f.stage();
        if (phase === 'authority') current = false;
        return { ...staged,
          validateState: phase === 'state' ? async () => { throw Error('rejected-state'); } : staged.validateState,
          validate: phase === 'sync' ? () => { throw Error('rejected-sync'); } : staged.validate,
          discard: async () => { discards++; assert.equal(f.registry.snapshot(), before); },
          drain: async () => { drains++; },
        };
      },
    }), new RegExp(`rejected-${phase}`));
    assert.equal(discards, 1); assert.equal(drains, 0);
    assert.equal(f.registry.snapshot(), before); assert.equal(isDurableReloading(f.harness), false);
  } finally { await f.close(); }
});

test('published native candidate drains outside commit while an accepted old task retains its result', { timeout: 10000 }, async () => {
  const f = await fixture();
  try {
    const id = await f.harness.commit(tx => tx.createTask(f.task, {}, { conversationId: f.root.id, ownership: { kind: 'conversation' }, background: true }), context);
    await f.started.promise;
    const draining = deferred(); let discarded = false;
    const reload = reloadDurable({ harness: f.harness, context, assertCurrent() {}, prepareExtensions: async () => ({
      ...await f.stage(), discard: async () => { discarded = true; }, drain: async () => {
        // This commit cannot complete if drain is accidentally inside the native mutation line.
        await f.harness.commit(() => {}, context); draining.resolve();
        await f.harness.waitForTask(id, withAbortSignal(AbortSignal.timeout(3000), context));
      },
    }) });
    await draining.promise;
    assert.equal(f.registry.snapshot().extension('resource-contract').description, 'version-2');
    assert.equal(isDurableReloading(f.harness), true);
    await assert.rejects(reloadDurable({ harness: f.harness, context, assertCurrent() {}, prepareExtensions: () => f.stage() }), /already in progress/);
    f.gate.resolve();
    assert.equal((await reload).cleanupError, undefined); assert.equal(discarded, false);
    const result = await f.harness.waitForTask(id, context);
    assert.equal(result.state.outcome.result, 'old-result'); assert.equal(isDurableReloading(f.harness), false);
  } finally { await f.close(); }
});

test('retirement failure is returned as applied cleanupError, never rejection or discard', { timeout: 10000 }, async () => {
  const f = await fixture();
  try {
    const failure = Error('private transport diagnostic'); let discarded = false;
    const result = await reloadDurable({ harness: f.harness, context, assertCurrent() {}, prepareExtensions: async () => ({
      ...await f.stage(), discard: async () => { discarded = true; }, drain: async () => { throw failure; },
    }) });
    assert.equal(result.cleanupError, failure); assert.equal(discarded, false);
    assert.equal(f.registry.snapshot().extension('resource-contract').description, 'version-2');
    assert.equal(isDurableReloading(f.harness), false);
  } finally { await f.close(); }
});

test('candidate discard failure preserves both errors without publishing', { timeout: 10000 }, async () => {
  const f = await fixture();
  try {
    const before = f.registry.snapshot(), rejected = Error('rejected'), cleanup = Error('cleanup');
    await assert.rejects(reloadDurable({ harness: f.harness, context, assertCurrent() {}, prepareExtensions: async () => ({
      ...await f.stage(), validate() { throw rejected; }, discard: async () => { throw cleanup; },
    }) }), error => error instanceof AggregateError && error.errors[0] === rejected && error.errors[1] === cleanup);
    assert.equal(f.registry.snapshot(), before); assert.equal(isDurableReloading(f.harness), false);
  } finally { await f.close(); }
});
