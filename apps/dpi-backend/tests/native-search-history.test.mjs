import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { BACKGROUND_CONTEXT as ctx, withAbortSignal } from '@earendil-works/chord/context';
import { createModels } from '@earendil-works/pi-ai/models';
import { fauxProvider, fauxAssistantMessage, fauxToolCall, fauxText } from '@earendil-works/pi-ai/providers/faux';
import { Harness, createRegistry } from '@earendil-works/pi-durable';
import { NodeExecutionEnv } from '@earendil-works/pi-durable/env/node';
import { openNodeSqliteStorage } from '@earendil-works/pi-durable/storage/sqlite/node';
import createSearchHistory from '../src/native-profile/tools/search-history/index.js';
import { searchHistory } from '../src/native-profile/tools/search-history/history.js';
import { Store } from '../src/store.js';
import { minimalProfile } from '../src/runtime-profile.js';
import { tempStore } from './helpers.js';

const entry = (id, kind, model, extra = {}) => ({ id, conversationId: 1, kind, model, ...extra });
const user = (id, text) => entry(id, 'pi.user', [{ role: 'user', content: text }]);
const history = () => [
  user(1, 'Alpha first'),
  entry(2, 'pi.assistant', [{ role: 'assistant', content: [
    { type: 'thinking', thinking: 'OPAQUE_THINKING', thinkingSignature: 'OPAQUE_SIGNATURE' },
    { type: 'text', text: 'Alpha beta answer' }, { type: 'toolCall', id: 'read-1', name: 'read', arguments: { path: 'fixture.txt' } },
  ] }]),
  entry(3, 'pi.tool-result', [{ role: 'toolResult', toolName: 'read', content: [{ type: 'text', text: 'Alpha beta output' }], isError: false }]),
  entry(4, 'host.input', [{ role: 'user', content: 'Authenticated alpha beta' }], { data: { private: 'PRIVATE_DATA_SENTINEL' } }),
  entry(5, 'pi.system', [{ role: 'system', content: 'SYSTEM_SECRET_SENTINEL' }]),
  entry(6, 'pi.reset', []),
  entry(7, 'pi.assistant', [{ role: 'assistant', content: [{ type: 'toolCall', id: 'recursive', name: 'search_history', arguments: { query: 'alpha' } }] }]),
  entry(8, 'pi.tool-result', [{ role: 'toolResult', toolName: 'search_history', content: [{ type: 'text', text: 'alpha previous search output' }], isError: false }]),
];

test('original literal AND, tool/kind/range/entry and recursive-search filters stay exact', () => {
  const entries = history();
  assert.deepEqual(searchHistory(entries, { query: 'alpha beta', tool: 'READ' }).results.map(r => r.entry), [3, 2]);
  assert.deepEqual(searchHistory(entries, { query: 'alpha', kind: 'tool_call' }).results.map(r => r.entry), [2]);
  assert.deepEqual(searchHistory(entries, { query: 'alpha', kind: 'user' }).results.map(r => r.entry), [1]);
  assert.deepEqual(searchHistory(entries, { query: 'alpha', kind: 'user' }, { userInputs: new Set([4]) }).results.map(r => r.entry), [4, 1]);
  assert.deepEqual(searchHistory(entries, { query: 'alpha', from_entry: 2, to_entry: 4, order: 'oldest' }).results.map(r => r.entry), [2, 3, 4]);
  assert.deepEqual(searchHistory(entries, { entry: 2, query: 'absent', kind: 'user', tool: 'absent' }).results.map(r => r.entry), [2]);
  assert.deepEqual(searchHistory(entries, { tool: 'search_history' }).results.map(r => r.entry), [8, 7]);
  const text = JSON.stringify(searchHistory(entries, {}));
  for (const sentinel of ['OPAQUE_THINKING', 'OPAQUE_SIGNATURE', 'PRIVATE_DATA_SENTINEL', 'SYSTEM_SECRET_SENTINEL']) assert.ok(!text.includes(sentinel));
});

test('original paging, reset/compaction marks and text budgets remain bounded', () => {
  const entries = history();
  const first = searchHistory(entries, { query: 'alpha', limit: 2 });
  const next = searchHistory(entries, { query: 'alpha', limit: 2, offset: first.next_offset });
  assert.equal(first.total, 4);
  assert.equal(next.next_offset, null);
  assert.deepEqual([...first.results, ...next.results].map(r => r.entry), [4, 3, 2, 1]);
  assert.equal(searchHistory(entries, { entry: 1 }, { activeFrom: 7, latestMarker: 6, lastReset: 6 }).results[0].context, 'before reset');
  assert.equal(searchHistory(entries, { entry: 7 }, { activeFrom: 8, latestMarker: 8 }).results[0].context, 'historical');
  const long = [user(9, 'x'.repeat(6000))];
  assert.equal(searchHistory(long, {}).results[0].text.length, 360);
  assert.equal(searchHistory(long, { entry: 9 }).results[0].text.length, 4000);
});

test('actual source scan stops at newest 10000 and never claims completeness outside the window', async () => {
  const tool = createSearchHistory().tools[0];
  assert.equal(tool.name, 'search_history');
  assert.equal(tool.replay, 'safe');
  const entries = Array.from({ length: 10001 }, (_, index) => user(10001 - index, 'bounded history'));
  let scans = 0;
  const result = await tool.execute({ entry: 1 }, {
    conversationId: 77,
    commit: async read => read({
      scanEntries: async (query, limit, cursor) => {
        scans++;
        assert.equal(query.conversationId, 77);
        assert.equal(query.order, 'descending');
        assert.ok(limit <= 500);
        const start = cursor ? Number(cursor) : 0;
        return { items: entries.slice(start, start + limit), next: start + limit < entries.length ? String(start + limit) : undefined };
      },
      latestHeadMarker: async () => undefined,
    }),
  }, ctx);
  const page = JSON.parse(result.output[0].text);
  assert.equal(scans, 20);
  assert.equal(page.scanned_entries, 10000);
  assert.equal(page.oldest_scanned_entry, 2);
  assert.equal(page.truncated, true);
  assert.equal(page.total_is_complete, false);
  assert.equal(page.total, 0);
});

test('actual native search_history uses current conversation and proven authenticated input, not metadata hints', { timeout: 30000 }, async () => {
  const temp = await tempStore();
  let store, harness;
  try {
    store = await Store.open({ ...temp.options, profile: minimalProfile });
    const extension = createSearchHistory();
    const registry = createRegistry();
    registry.install(extension);
    const provider = fauxProvider({ provider: 'history-fixture', models: [{ id: 'echo', contextWindow: 128000, maxTokens: 4096 }], tokensPerSecond: 100000 });
    const models = createModels();
    models.setProvider(provider.provider);
    harness = await Harness.open(await openNodeSqliteStorage(join(temp.root, 'history.sqlite')), {
      registry, models, env: () => new NodeExecutionEnv({ cwd: temp.work }),
    }, ctx);
    const agent = { model: { provider: 'history-fixture', modelId: 'echo' }, cwd: temp.work };
    const a = await harness.root(ctx, { agent });
    const b = await harness.createConversation({ ownership: { kind: 'ownerless' }, agent }, ctx);
    let counter = 0;
    async function send(conversation, content, args) {
      provider.setResponses(args === undefined ? [fauxAssistantMessage(fauxText('seed-answer'))]
        : [fauxAssistantMessage(fauxToolCall('search_history', args), { stopReason: 'toolUse' }), fauxAssistantMessage(fauxText('query-answer'))]);
      const accepted = await store.send(conversation, { content, requestId: `history-${++counter}` }, {
        actor: 'history-authenticated', source: 'bb', authority: 'human', assertCurrent() {},
      });
      assert.equal((await accepted.wait(withAbortSignal(AbortSignal.timeout(10000), ctx))).status, 'done');
      const entries = (await conversation.entries({ order: 'ascending' }, 200, undefined, ctx)).items;
      const tool = entries.findLast(entry => entry.kind === 'pi.tool-result' && entry.model?.[0]?.toolName === 'search_history');
      return { entries, tool: tool?.model[0] };
    }
    const foreign = await send(b, 'FOREIGN_CONVERSATION_SENTINEL');
    const foreignEntry = foreign.entries.find(entry => entry.kind === 'host.input');
    const own = await send(a, 'AUTHENTICATED_HISTORY_NEEDLE');
    const genuine = own.entries.find(entry => entry.kind === 'host.input');
    const spoof = await harness.commit(tx => tx.appendEntry(a.id, {
      kind: 'host.input', data: genuine.data, model: [{ role: 'user', content: 'PASSIVE_SPOOF_NEEDLE', timestamp: Date.now() }],
    }), ctx);
    const actual = await send(a, 'run history query', { query: 'AUTHENTICATED_HISTORY_NEEDLE', kind: 'user' });
    assert.equal(actual.tool.isError, false);
    const page = JSON.parse(actual.tool.content[0].text);
    assert.equal(page.conversation, a.id);
    assert.equal(page.total, 1);
    assert.equal(page.results[0].entry, genuine.id);
    assert.equal(page.results[0].kind, 'user');
    const fork = await a.fork(genuine.id, { ownership: { kind: 'ownerless' } }, ctx);
    const inherited = await send(fork, 'query inherited history', { query: 'AUTHENTICATED_HISTORY_NEEDLE', kind: 'user' });
    const inheritedPage = JSON.parse(inherited.tool.content[0].text);
    assert.equal(inheritedPage.conversation, fork.id);
    assert.equal(inheritedPage.total, 1, 'authorized visible fork history keeps its origin receipt');
    assert.equal(inheritedPage.results[0].entry, genuine.id);
    const passive = await send(a, 'check spoof', { query: 'PASSIVE_SPOOF_NEEDLE', kind: 'user' });
    assert.equal(JSON.parse(passive.tool.content[0].text).total, 0);
    const visibleEvent = await send(a, 'read event', { entry: spoof.id });
    assert.equal(JSON.parse(visibleEvent.tool.content[0].text).results[0].kind, 'event');
    const foreignRead = await send(a, 'foreign entry lookup', { entry: foreignEntry.id });
    assert.equal(JSON.parse(foreignRead.tool.content[0].text).total, 0);
    assert.ok(!JSON.stringify(foreignRead.tool).includes('FOREIGN_CONVERSATION_SENTINEL'));
    const extraScope = await send(a, 'try scope override', { conversationId: b.id });
    assert.equal(extraScope.tool.isError, true);
    assert.ok(!JSON.stringify(extraScope.tool).includes('FOREIGN_CONVERSATION_SENTINEL'));
    const invalidRange = await send(a, 'invalid range', { from_entry: 20, to_entry: 1 });
    assert.equal(invalidRange.tool.isError, true);
    assert.match(JSON.stringify(invalidRange.tool.content), /from_entry must not exceed to_entry/);
    assert.equal(store.opened.size, 0);
  } finally {
    await harness?.close(ctx);
    await store?.close();
    await temp.cleanup();
  }
});
