import assert from 'node:assert/strict';
import { BACKGROUND_CONTEXT as ctx } from '@earendil-works/chord/context';
import { UserEntry, watchEvents } from '@earendil-works/pi-durable';
import { Store } from '../../src/store.js';
import { minimalProfile } from '../../src/runtime-profile.js';
import { nativeRequestKey } from '../../src/idempotency.js';
import { faux, tempStore } from '../helpers.js';

/** Test-only native producer. No native imports belong in the BB client package. */
export async function captureBbHistoryWire() {
  const temp = await tempStore();
  const store = await Store.open({ ...temp.options, profile: minimalProfile });
  try {
    const session = await store.create({ name: 'bb-history-wire', cwd: temp.work, model: faux });
    const { h, c, row } = await store.resolveAgent(session.id, 'main');
    const actor = 'bb-fixture-actor';
    const requestId = 'bb-root:wire-key';
    const sent = await store.send(c, { content: '!printf bb-history-wire-ok', requestId }, {
      actor, source: 'bb', authority: 'human', assertCurrent() {},
    }, row);
    const settled = await store.settled(h, sent.id as number, 15000);
    assert.equal(settled.status, 'done');
    const receipt = await h.commit(tx => tx.submissionByRequest(c.id, nativeRequestKey(actor, 'message', requestId)), ctx);
    if (receipt?.type !== 'input' || receipt.status !== 'done' || receipt.answer === undefined) throw new Error('Native input has no terminal answer receipt');
    assert.equal(receipt.id, sent.id);
    const stream = await watchEvents(h, c.id, ctx);
    try {
      assert.equal(stream.snapshot.run, undefined);
      assert.equal(stream.snapshot.generation, undefined);
      const input = stream.snapshot.entries.find(entry => entry.id === receipt.entry);
      assert.ok(input && (input.kind === 'host.input' || input.kind === 'pi.user'));
      assert.ok(stream.snapshot.entries.some(entry => entry.id === receipt.answer && entry.kind === 'pi.assistant'));
      // Exact JSON serialization used by agentStream; no native objects cross.
      const wire = JSON.parse(JSON.stringify(stream.snapshot)) as { entries: unknown; [key: string]: unknown };
      return {
        frame: { status: 'completed', entries: wire.entries, inputs: [{ entryId: String(receipt.entry), requestId }] },
        wire,
        submissionId: receipt.id as number,
        inputEntryId: receipt.entry as number,
        answerEntryId: receipt.answer as number,
        requestId,
        inputKind: input.kind,
        inputIsNativeUser: UserEntry.is(input),
      };
    } finally {
      await stream.stop();
    }
  } finally {
    await store.close();
    await temp.cleanup();
  }
}
