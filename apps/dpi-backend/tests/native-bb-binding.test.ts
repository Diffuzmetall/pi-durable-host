import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Context } from '@earendil-works/chord';
import { BACKGROUND_CONTEXT as ctx } from '@earendil-works/chord/context';
import { Harness, createRegistry, defineExtension, defineTool, type ToolExecutionApi, type ConversationId } from '@earendil-works/pi-durable';
import { NodeExecutionEnv } from '@earendil-works/pi-durable/env/node';
import { openNodeSqliteStorage } from '@earendil-works/pi-durable/storage/sqlite/node';
import { Type } from '@earendil-works/pi-ai';
import { createModels } from '@earendil-works/pi-ai/models';
import { fauxProvider, fauxAssistantMessage, fauxToolCall } from '@earendil-works/pi-ai/providers/faux';
import { createDurableBindingReader, createDurableBindingStore, type DurableBinding } from '../src/native-profile/bb-binding/binding-store.js';
import { until } from './helpers.js';

test('actual BB binding docs/index preserve native CAS identity, negatives and reopen through active tool API', { timeout: 20000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'dpi-native-bb-binding-'));
  let host: Harness | undefined;
  let step: ((api: ToolExecutionApi, context: Context) => Promise<void>) | undefined;
  let failure: unknown;
  let sequence = 0;
  const captured: Array<{ kind: string; version: number; scope: string }> = [];
  const tool = defineTool({ name: 'fixture_binding', description: 'Disposable test-only trusted callback', parameters: Type.Object({}), replay: 'safe',
    execute: async (_args, api, context) => {
      try {
        assert.ok(step);
        // Record definitions from the REAL active ToolExecutionApi. No fake DB,
        // retained invocation or product model-callable binding tool is shipped.
        const observed: Pick<ToolExecutionApi, 'commit' | 'snapshot'> = {
          commit: api.commit.bind(api),
          snapshot: ((token: { definition: { kind: string; version: number; scope: string } }, ...args: unknown[]) => {
            const { kind, version, scope } = token.definition; captured.push({ kind, version, scope });
            return Reflect.apply(api.snapshot, api, [token, ...args]);
          }) as ToolExecutionApi['snapshot'],
        };
        await step({ ...api, ...observed }, context);
      } catch (error) { failure = error; throw error; }
      return { output: [{ type: 'text' as const, text: 'BINDING_FIXTURE_OK' }] };
    },
  });
  const registry = createRegistry(); registry.install(defineExtension({ name: 'bb-binding-fixture-only', tools: [tool] }));
  const models = createModels();
  const provider = fauxProvider({ provider: 'faux-bb-binding', models: [{ id: 'fixture', contextWindow: 32000, maxTokens: 2048 }], tokensPerSecond: 100000 });
  models.setProvider(provider.provider);
  const open = async () => {
    host = await Harness.open(await openNodeSqliteStorage(join(root, 'native.sqlite')), { registry, models, env: () => new NodeExecutionEnv({ cwd: root }) }, ctx);
    const conversation = await host.root(ctx, { agent: { model: { provider: provider.provider.id, modelId: 'fixture' }, cwd: root } });
    host.resume(); return conversation;
  };
  try {
    let conversation = await open();
    const run = async (callback: NonNullable<typeof step>) => {
      step = callback; failure = undefined;
      provider.setResponses([fauxAssistantMessage(fauxToolCall('fixture_binding', {}), { stopReason: 'toolUse' }), fauxAssistantMessage('fixture complete')]);
      const submission = await conversation.submit({ type: 'input', content: 'Run the trusted fixture callback', requestId: `binding-${++sequence}` }, ctx);
      await until(async () => (await submission.status(ctx)).status === 'done', 10000, 'native binding fixture');
      step = undefined;
      if (failure) throw failure;
    };
    const other = await host!.commit(async tx => (await tx.createConversation({ ownership: { kind: 'ownerless' } })).id, ctx);
    const binding: DurableBinding = { providerId: 'fixture-provider', sessionId: 'fixture-session', conversationId: conversation.id,
      bbThreadId: 'fixture-bb-root', parentThreadId: 'fixture-bb-parent' };
    const secondary: DurableBinding = { ...binding, conversationId: other, bbThreadId: 'fixture-bb-secondary' };
    await run(async (api, context) => {
      const store = createDurableBindingStore(api, context);
      assert.equal(await store.get(conversation.id), undefined);
      await store.put(binding); await store.put(binding); // lost ACK replay
      assert.deepEqual(await store.get(conversation.id), binding);
      assert.deepEqual(await store.findByThread(binding), binding);
      assert.equal(await store.findByThread({ ...binding, providerId: 'foreign-provider' }), undefined);
      assert.equal(await store.findByThread({ ...binding, sessionId: 'foreign-session' }), undefined);
      await assert.rejects(store.put({ ...binding, conversationId: other }), /already bound to another/);
      await assert.rejects(store.put({ ...binding, bbThreadId: 'rebound' }), /already has a different BB binding/);
      await assert.rejects(store.put({ ...binding, conversationId: 999999 as ConversationId }), /does not exist/);
      await assert.rejects(store.put({ ...binding, conversationId: 0 as ConversationId }), /Invalid durable child binding/);
      await assert.rejects(store.get(0 as ConversationId), /Invalid Durable conversation ID/);
      await assert.rejects(store.findByThread({ ...binding, bbThreadId: '' }), /Invalid BB thread identity/);
      assert.deepEqual(await store.get(conversation.id), binding, 'failed writes leave original binding unchanged');
      await store.put(secondary);
      assert.deepEqual(await store.get(other), secondary, 'conversation doc scope remains independent');
      const reader = createDurableBindingReader(api, context);
      assert.equal('put' in reader, false);
    });
    const page = await conversation.entries({}, 100, undefined, ctx);
    assert.ok(page.items[0]);
    const forked = await host!.commit(async tx => (await tx.forkConversation(conversation.id, page.items[0].id, { ownership: { kind: 'ownerless' } })).id, ctx);
    const contenders = await host!.commit(async tx => [
      (await tx.createConversation({ ownership: { kind: 'ownerless' } })).id,
      (await tx.createConversation({ ownership: { kind: 'ownerless' } })).id,
    ], ctx);
    await run(async (api, context) => {
      const store = createDurableBindingStore(api, context);
      assert.equal(await store.get(forked), undefined, 'fork:initial must not inherit/promote the parent BB binding');
      const race = contenders.map(conversationId => ({ ...binding, bbThreadId: 'concurrent-thread', conversationId }));
      const results = await Promise.allSettled(race.map(value => store.put(value)));
      assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
      assert.equal(results.filter(result => result.status === 'rejected').length, 1);
      const selected = await store.findByThread(race[0]);
      assert.ok(selected && contenders.includes(selected.conversationId));
      const otherId = contenders.find(id => id !== selected.conversationId)!;
      assert.equal(await store.get(otherId), undefined, 'losing concurrent transaction leaves no partial binding');
    });
    assert.ok(captured.some(d => d.kind === 'bb.native-child-binding' && d.version === 2 && d.scope === 'conversation'));
    assert.ok(captured.some(d => d.kind === 'bb.native-child-binding-index' && d.version === 1 && d.scope === 'session'));
    await host!.close(ctx); host = undefined;
    conversation = await open();
    await run(async (api, context) => {
      const store = createDurableBindingStore(api, context);
      assert.deepEqual(await store.findByThread(binding), binding);
      assert.deepEqual(await store.findByThread(secondary), secondary);
      await store.put(binding);
      assert.deepEqual(await store.get(binding.conversationId), binding);
    });
    // Corruption handling is a narrow data-boundary unit check, not a fake
    // persistence or authority acceptance. Main persistence checks above are real.
    const corruptReader = createDurableBindingReader({ snapshot: (async () => ({ binding: { ...binding, conversationId: other, parentThreadId: null } })) as ToolExecutionApi['snapshot'] }, ctx);
    await assert.rejects(corruptReader.get(binding.conversationId), /Corrupt durable child binding/);
  } finally { if (host) await host.close(ctx); await rm(root, { recursive: true, force: true }); }
});
