import assert from 'node:assert/strict';
import test from 'node:test';
import { projectChildHistory, projectCoherentHistory, projectHostHistory } from '../src/history-projector.js';
import { openHistorySink, type HistoryRequester } from '../src/history-sink.js';
import { captureBbHistoryWire } from './native-history-wire.mjs';

const user = (): Record<string, unknown> => ({
  id: 1, conversationId: 7, kind: 'host.input',
  data: { actor: 'private-actor-metadata', source: 'bb', authority: 'human', requestId: 'bb-root:stable' },
  model: [{ role: 'user', content: 'hello' }],
});
const assistant = (id: number, blocks: unknown[], extra = {}): Record<string, unknown> => ({
  id, conversationId: 7, kind: 'pi.assistant', model: [{ role: 'assistant', content: blocks, ...extra }],
});
const thinking = () => ({ type: 'thinking', thinking: 'opaque-thinking-sentinel', thinkingSignature: 'opaque-signature-sentinel' });
const call = () => ({ type: 'toolCall', id: 'call-1', name: 'bash', arguments: { command: 'globalThis.BB_HISTORY_MUST_NOT_EXECUTE = true' } });
const toolResult = (id = 3, extra = {}): Record<string, unknown> => ({
  id, conversationId: 7, kind: 'pi.tool-result', data: { diagnostics: [] },
  model: [{ role: 'toolResult', toolCallId: 'call-1', toolName: 'bash', isError: false, content: [{ type: 'text', text: 'tool-output' }], ...extra }],
});
const capture = () => ({
  status: 'completed',
  entries: [user(), assistant(2, [thinking(), { type: 'text', text: 'before' }, call()]), toolResult(), assistant(4, [{ type: 'text', text: 'after' }])],
  inputs: [{ entryId: '1', requestId: 'bb-root:stable' }],
  agent: { model: 'original-provider/exact-model-id', thinkingLevel: 'medium' },
  privateContext: 'source-private-sentinel',
});

test('actual source projection preserves source identities/tool lifecycle and omits opaque thinking only', () => {
  const frame = capture();
  const before = structuredClone(frame);
  const projected = projectHostHistory(frame);
  assert.deepEqual(frame, before, 'raw native capture must remain immutable');
  assert.deepEqual(projected.snapshot.items.map(item => item.source), [
    { entryId: '1', messageIndex: 0, blockIndex: 0 },
    { entryId: '2', messageIndex: 0, blockIndex: 1 },
    { entryId: '2', messageIndex: 0, blockIndex: 2 },
    { entryId: '4', messageIndex: 0, blockIndex: 0 },
  ]);
  assert.deepEqual(projected.omissions, [{ source: { entryId: '2', messageIndex: 0, blockIndex: 0 }, kind: 'thinking' }]);
  const tool = projected.snapshot.items.find(item => item.item.type === 'toolCall')?.item;
  assert.ok(tool?.type === 'toolCall');
  assert.equal(tool.status, 'completed');
  assert.deepEqual(tool.result, { output: [{ type: 'text', text: 'tool-output' }] });
  assert.equal(Reflect.get(globalThis, 'BB_HISTORY_MUST_NOT_EXECUTE'), undefined);
  assert.deepEqual(projected.snapshot.agent, frame.agent, 'no model ID substitution');
  assert.deepEqual(projected.snapshot.inputs, frame.inputs);
  const json = JSON.stringify(projected);
  for (const secret of ['opaque-thinking-sentinel', 'opaque-signature-sentinel', 'private-actor-metadata', 'source-private-sentinel']) assert.ok(!json.includes(secret));
  assert.throws(() => projectCoherentHistory(frame), /application data/, 'original strict parser is not relaxed for arbitrary app entries');
});

test('normalization never fabricates receipt bindings or upgrades entry authority', () => {
  const { inputs: _inputs, ...withoutReceipts } = capture();
  assert.throws(() => projectHostHistory(withoutReceipts), /lacks canonical native receipt/, 'passive user-shaped metadata cannot authenticate an input');
  const reserved = capture();
  reserved.entries[0]!.kind = 'pi.user';
  assert.throws(() => projectHostHistory(reserved), /application data/, 'unsupported reserved input-with-data path is not silently admitted');
  const canonical = capture();
  canonical.inputs[0]!.requestId = 'host:' + 'a'.repeat(64);
  assert.deepEqual(projectHostHistory(canonical).snapshot.inputs, canonical.inputs, 'native receipt is preserved, not equated to raw caller metadata');
  const duplicate = capture();
  duplicate.inputs.push({ entryId: '1', requestId: 'second-request-for-same-entry' });
  assert.throws(() => projectHostHistory(duplicate), /duplicate native input entry identity/);
  const wrongEntry = capture();
  wrongEntry.inputs[0]!.entryId = '4';
  assert.throws(() => projectHostHistory(wrongEntry), /lacks canonical native receipt/);
  for (const authority of ['human', 'delegated', 'observer']) {
    const frame = capture();
    frame.entries[0]!.data = { actor: 'test', source: 'bb', authority, requestId: 'bb-root:stable' };
    const result = projectHostHistory(frame);
    assert.equal(result.snapshot.items[0]?.item.type, 'userMessage');
    assert.ok(!JSON.stringify(result).includes('authority'), 'presentation metadata never becomes an auth grant');
  }
});

test('unknown or malformed host metadata rejects the whole projection', () => {
  const valid = { actor: 'actor', source: 'bb', authority: 'human', requestId: 'bb-root:stable' };
  for (const data of [
    undefined, null, [], {},
    { ...valid, actor: '' }, { ...valid, actor: 1 },
    { ...valid, source: 'unknown' }, { ...valid, authority: 'root' },
    { ...valid, requestId: '' }, { ...valid, requestId: 'x'.repeat(129) },
    { ...valid, token: 'must-not-be-ignored' },
  ]) {
    const frame = capture();
    frame.entries[0]!.data = data;
    assert.throws(() => projectHostHistory(frame), /Unsupported child history/);
  }
  const wrongRole = capture();
  wrongRole.entries[0]!.model = [{ role: 'assistant', content: [{ type: 'text', text: 'spoof' }] }];
  assert.throws(() => projectHostHistory(wrongRole), /role must be user/);
});

test('in-flight and terminal tool/error semantics match selected source without success inference', () => {
  for (const status of ['working', 'failed', 'interrupted']) {
    const frame = { status, entries: [user(), assistant(2, [call()])], inputs: capture().inputs };
    const item = projectHostHistory(frame).snapshot.items[1]?.item;
    assert.ok(item?.type === 'toolCall');
    assert.equal(item.status, status === 'working' ? 'pending' : 'interrupted');
  }
  assert.throws(() => projectHostHistory({ status: 'completed', entries: [user(), assistant(2, [call()])], inputs: capture().inputs }), /unsettled tool call/);
  const failedTool = capture();
  failedTool.entries[2] = toolResult(3, { isError: true });
  const item = projectHostHistory(failedTool).snapshot.items[2]?.item;
  assert.ok(item?.type === 'toolCall');
  assert.equal(item.status, 'failed');
  const error = projectHostHistory({ status: 'failed', entries: [user(), assistant(2, [], { errorMessage: 'fixture native failure' })], inputs: capture().inputs });
  assert.deepEqual(error.snapshot.items[1]?.item, { type: 'agentMessage', text: 'Native model error: fixture native failure' });
  assert.throws(() => projectHostHistory({ status: 'unknown', reason: 'receipt-unavailable', entries: [] }), /terminal status/);
});

test('unsupported entries, compaction/context edits, orphan tools and malformed thinking never return partial history', () => {
  const badEntries: Record<string, unknown>[][] = [
    [user(), { ...assistant(2, [{ type: 'text', text: 'x' }]), kind: 'unknown.render' }],
    [user(), { ...assistant(2, [{ type: 'text', text: 'x' }]), head: 1 }],
    [user(), { ...assistant(2, [{ type: 'text', text: 'x' }]), edits: [] }],
    [user(), { ...assistant(2, [{ type: 'text', text: 'x' }]), data: {} }],
    [user(), toolResult()],
    [user(), assistant(2, [call(), call()])],
    [user(), assistant(2, [call()]), toolResult(), toolResult(4)],
    [user(), assistant(2, [call()]), toolResult(3, { toolName: 'other-tool' })],
    [user(), assistant(2, [{ ...thinking(), unknown: true }])],
    [user(), assistant(2, [{ ...thinking(), thinking: 42 }])],
    [user(), assistant(2, [{ type: 'image', data: 'not-supported' }])],
    [user(), assistant(2, [{ type: 'text', text: 'not-terminal' }], { deferred: { pollAt: 1 } })],
    [user(), assistant(1, [{ type: 'text', text: 'duplicate-native-id' }])],
    [{ ...user(), id: -1 }],
  ];
  for (const entries of badEntries) assert.throws(() => projectHostHistory({ status: 'completed', entries }), /Unsupported child history/);
});

test('raw or live snapshot is not accepted as a coherent outcome; original settled snapshot guard stays strict', () => {
  for (const field of ['type', 'run', 'generation', 'compactionFailure']) assert.throws(() => projectHostHistory({ ...capture(), [field]: {} }), /raw\/live snapshot/);
  const simpleUser = { ...user(), kind: 'pi.user', data: undefined };
  const settled = { type: 'snapshot', entries: [simpleUser], tools: [], nestedTools: [], compactions: [], inbox: [] };
  assert.equal(projectChildHistory(settled, 'completed').items.length, 1);
  for (const field of ['run', 'generation', 'compactionFailure']) assert.throws(() => projectChildHistory({ ...settled, [field]: {} }, 'completed'), /live run/);
  for (const field of ['tools', 'nestedTools', 'compactions', 'inbox']) assert.throws(() => projectChildHistory({ ...settled, [field]: [{}] }, 'completed'), /not settled/);
});

test('actual native Harness/SQLite/faux receipt and tool history survive exact public snapshot serialization', async () => {
  const captured = await captureBbHistoryWire();
  const before = JSON.stringify(captured);
  const projected = projectHostHistory(captured.frame);
  assert.equal(JSON.stringify(captured), before);
  assert.equal(projected.snapshot.status, 'completed');
  assert.deepEqual(projected.snapshot.inputs, [{ entryId: String(captured.inputEntryId), requestId: captured.requestId }]);
  assert.ok(projected.snapshot.items.some(item => item.source.entryId === String(captured.inputEntryId) && item.item.type === 'userMessage'));
  assert.ok(projected.snapshot.items.some(item => item.source.entryId === String(captured.answerEntryId) && item.item.type === 'agentMessage'));
  const tool = projected.snapshot.items.find(item => item.item.type === 'toolCall')?.item;
  assert.ok(tool?.type === 'toolCall');
  assert.equal(tool.status, 'completed');
  assert.match(JSON.stringify(tool.result), /bb-history-wire-ok/);
  assert.ok(!JSON.stringify(projected).includes('bb-fixture-actor'));
  const threadId = 'wire-fixture-thread';
  const requests: Parameters<HistoryRequester>[1][] = [];
  let mutations = 0;
  const sink = await openHistorySink({ threadId, request: async (_method, params) => {
    requests.push(params);
    if (!params.snapshot) return { threadId, digest: null, changed: false };
    assert.deepEqual(params.snapshot, projected.snapshot);
    if (mutations === 0) { mutations++; throw new Error('fixture ACK lost after history commit'); }
    return { threadId, digest: 'a'.repeat(64), changed: false };
  } });
  await assert.rejects(sink.apply(projected.snapshot), /ACK lost/);
  assert.equal((await sink.apply(projected.snapshot)).changed, false);
  assert.equal(mutations, 1, 'same actual native IDs do not produce a second history mutation');
  assert.deepEqual(requests[1], requests[2]);
});
