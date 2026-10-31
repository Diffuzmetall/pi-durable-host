import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import { buildPatchedServer } from './apply.mjs';
import { manualStopLifecycleIds, manualStopLifecycleReceipt, retainLifecycleTurnHeaders } from './manual-stop-history.mjs';

const baseline = readFileSync(process.env.BB_CORE_SERVER);
const patched = buildPatchedServer(baseline);
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const providerThreadId = 'native-session:24';
const row = (id, type, sequence, turnId, data) => ({ id, type, sequence, turnId,
  scopeKind: turnId ? 'turn' : 'thread', data: JSON.stringify(data), createdAt: 1000 + sequence,
  environmentId: 'environment', providerThreadId: type.startsWith('system/') ? null : providerThreadId,
  itemId: null, itemKind: null, parentToolCallId: null });
const owned = [row('start', 'turn/started', 1, 'opaque-native-turn', { providerThreadId }),
  row('item', 'item/completed', 2, 'opaque-native-turn', { providerThreadId, text: 'owned native input' })];
const stop = row('manual', 'system/thread/interrupted', 3, null, { reason: 'manual-stop' });
const completion = row('interruption', 'turn/completed', 4, 'opaque-native-turn', { providerThreadId, status: 'interrupted' });

// Run the ACTUAL pinned Core transaction/fingerprint gate, not a permissive copy.
// This read-only transaction fixture supplies the existing parser boundary; the
// separate real Core/Chrome probe exercises Core's real parser and SQLite writer.
function inspect(rows, source = patched, nativeStatus = 'working', snapshot, previous = {}, currentOwned = owned) {
  const fn = source.toString().match(/function reconcileNativeHistory\(db, hostId, input2, core\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(fn);
  const reconcile = runInNewContext(`(${fn})`, {
    manualStopLifecycleIds, manualStopLifecycleReceipt, retainLifecycleTurnHeaders, isDeepStrictEqual, hash2: hash,
    REGISTRATION_PLUGIN: 'registration', HISTORY_PLUGIN: 'history',
    NativeHistoryError: class extends Error { constructor(status, message) { super(message); this.status = status; } },
  });
  let committed;
  const events = { id: 'id', threadId: 'threadId', sequence: 'sequence' };
  const tx = {
    select: () => ({ from: () => ({ where: () => ({ orderBy: () => ({ all: () => rows.slice() }) }) }) }),
    update: () => ({ set: () => ({ where: () => ({ run() {} }) }) }),
    delete: table => ({ where: ids => ({ run() {
      if (table === events) for (let i = rows.length - 1; i >= 0; i--) if (ids.includes(rows[i].id)) rows.splice(i, 1);
    } }) }),
    insert: () => ({ values: value => ({ onConflictDoUpdate: () => ({ run() { committed = JSON.parse(value.metadataJson); } }) }) }),
  };
  const core = {
    eq: () => true, and: (...args) => args.find(Array.isArray), inArray: (_column, ids) => ids, events, threadSearchSegments: {},
    threadPluginMetadata: {}, threads: {}, bumpThreadEventRewriteGeneration() {},
    appendStoredThreadEventsInTransaction: (_tx, args) => {
      let sequence = Math.max(0, ...rows.map(row => row.sequence));
      for (const event of args) rows.push(row(`generated-${++sequence}`, event.type, sequence, event.scope.turnId, event.data));
    },
    getThread: (_tx, id) => ({ id, environmentId: 'environment', parentThreadId: 'parent',
      providerId: 'pi-durable', deletedAt: null, archivedAt: null, status: 'idle' }),
    getEnvironment: () => ({ hostId: 'host' }),
    getThreadPluginMetadata: (_tx, _id, plugin) => ({ corrupt: false, metadata: plugin === 'registration' ? {
      kind: 'native-existing', hostId: 'host', providerId: 'pi-durable', sessionId: 'native-session', conversationId: 24, parentThreadId: 'parent',
    } : { version: 1, digest: 'a'.repeat(64), nativeStatus, rowCount: currentOwned.length, rowsDigest: hash(currentOwned), ...previous } }),
    parseStoredThreadEvent: event => {
      const keys = event.type === 'system/thread/interrupted' ? ['reason'] : event.type === 'turn/started' ? ['providerThreadId'] : ['providerThreadId', 'status'];
      if (Object.keys(event.data).some(key => !keys.includes(key))) throw Error('Noncanonical lifecycle');
      return { ...event, ...event.data };
    },
    toStoredThreadEventData: event => event.data,
  };
  const result = reconcile({ transaction: callback => callback(tx) }, 'host', {
    threadId: 'child', providerId: 'pi-durable', providerThreadId, ...snapshot,
  }, core);
  return { ...result, committed }; 
}

test('actual Core gate: baseline rejects authorized stop; overlay keeps exact lifecycle outside the unchanged transcript fingerprint', () => {
  const rows = [...owned, stop, completion], before = JSON.stringify(rows);
  assert.throws(() => inspect(rows, baseline), /Mixed or modified/);
  assert.equal(inspect(rows).digest, 'a'.repeat(64));
  assert.equal(JSON.stringify(rows), before, 'no events rewritten, dropped or treated as native receipt');
});

test('actual Core gate: malformed, foreign, unknown, wrong-turn, wrong-status and reordered events remain protected', () => {
  for (const change of [
    { ...stop, environmentId: 'foreign' }, { ...stop, data: '{"reason":"manual-stop","extra":true}' },
    { ...completion, turnId: 'another-turn' }, { ...completion, data: JSON.stringify({ providerThreadId, status: 'completed' }) },
    { ...completion, sequence: 0 }, { ...completion, providerThreadId: 'foreign:24' },
  ]) assert.throws(() => inspect([...owned, stop, { ...change, id: 'adversarial' }]), /Mixed or modified/);
  assert.throws(() => inspect([...owned, stop, completion, row('unknown', 'plugin/live', 5, null, {})]), /Mixed or modified/);
  const tampered = structuredClone(owned); tampered[1].data = '{"text":"tampered"}';
  assert.throws(() => inspect([...tampered, stop, completion]), /Mixed or modified/);
  assert.throws(() => inspect([...owned, stop, completion], patched, 'completed'), /Mixed or modified/);
});

test('actual Core gate: authorized lifecycle receipt survives the next native projection rewrite without relaxing ownership', () => {
  const initial = [...owned, stop, completion];
  const proof = manualStopLifecycleReceipt(initial, new Set([owned[0].id, stop.id, completion.id]), hash);
  const nextOwned = owned.map((row, index) => ({ ...row, id: `next-${row.id}`, sequence: 5 + index, turnId: 'new-native-turn' }));
  const next = [owned[0], stop, completion, ...nextOwned];
  assert.throws(() => inspect(next, patched, 'working', undefined, {}, nextOwned), /Mixed or modified/);
  assert.equal(inspect(next, patched, 'working', undefined, proof, nextOwned).digest, 'a'.repeat(64));
  const tampered = structuredClone(next); tampered[2].createdAt++;
  assert.throws(() => inspect(tampered, patched, 'working', undefined, proof, nextOwned), /Corrupt manual-stop lifecycle/);
  assert.throws(() => inspect(next.slice(1), patched, 'working', undefined, proof, nextOwned), /Corrupt manual-stop lifecycle/);
  assert.throws(() => inspect(next, patched, 'working', undefined, { ...proof, manualStopRowCount: 0 }, nextOwned), /Corrupt manual-stop lifecycle/);
  const unknown = row('unknown-live', 'plugin/live', 9, null, {});
  assert.throws(() => inspect([...next, unknown], patched, 'working', undefined, proof, nextOwned), /Mixed or modified/);
});

test('actual Core commit preserves the interrupted Core turn header required by the real timeline reader', () => {
  const rows = structuredClone([...owned, stop, completion]);
  const result = inspect(rows, patched, 'working', { expectedDigest: 'a'.repeat(64), snapshot: {
    status: 'working', items: [{ source: { entryId: 'new-native-input', messageIndex: 0, blockIndex: 0 },
      item: { type: 'userMessage', content: [{ type: 'text', text: 'native followup' }] } }],
  } });
  assert.equal(result.changed, true);
  assert.ok(rows.some(row => row.id === owned[0].id), 'retained Core completion must never be left without its ORIGINAL started row');
  assert.deepEqual(rows.find(row => row.id === owned[0].id), owned[0]);
  assert.ok(rows.some(row => row.id === completion.id));
  const currentOwned = rows.filter(row => row.id.startsWith('generated-'));
  assert.equal(inspect(rows, patched, 'working', undefined, result.committed, currentOwned).digest, result.digest);
});

test('actual Core gate: stale CAS remains rejected after recognizing a valid manual lifecycle', () => {
  assert.throws(() => inspect([...owned, stop, completion], patched, 'working', {
    snapshot: { status: 'interrupted', items: [] }, expectedDigest: 'b'.repeat(64),
  }), /stale snapshot refused/);
  assert.throws(() => buildPatchedServer(Buffer.from('another Core build')), /SHA-256 differs/);
});
