import assert from 'node:assert/strict';
import { once } from 'node:events';
import { DpiClient } from 'dpi-sdk/client';
const { BACKGROUND_CONTEXT: ctx } = await import(new URL('../../dpi-backend/node_modules/@earendil-works/chord/dist/context/index.js', import.meta.url).href);
const { UserEntry, watchEvents } = await import(new URL('../../dpi-backend/node_modules/@earendil-works/pi-durable/dist/index.js', import.meta.url).href);
const { Store } = await import(new URL('../../dpi-backend/src/store.ts', import.meta.url).href);
const { minimalProfile } = await import(new URL('../../dpi-backend/src/runtime-profile.ts', import.meta.url).href);
const { nativeRequestKey } = await import(new URL('../../dpi-backend/src/idempotency.ts', import.meta.url).href);
const { GrantPolicy } = await import(new URL('../../dpi-backend/src/grants.ts', import.meta.url).href);
const { createHttpServer } = await import(new URL('../../dpi-backend/src/http-server.ts', import.meta.url).href);
const { faux, tempStore } = await import(new URL('../../dpi-backend/tests/helpers.ts', import.meta.url).href);

/** Actual authenticated HTTP admission + native receipt + exact watchEvents JSON; fixture only, never client runtime. */
export async function captureBbHistoryWire() {
  const temp = await tempStore();
  const store = await Store.open({ ...temp.options, profile: minimalProfile });
  const actor = 'bb-fixture-actor';
  const policy = new GrantPolicy([{ id: actor, token: 'DISPOSABLE_WIRE_TOKEN', actor, source: 'bb', authority: 'human', permissions: ['read','write','control'], binding: {} }]);
  const server = createHttpServer(store, policy).listen(0, '127.0.0.1'); await once(server, 'listening');
  try {
    const session = await store.create({ name: 'bb-history-wire', cwd: temp.work, model: faux });
    const address = server.address(); assert.ok(address && typeof address === 'object');
    const inputKey = 'bb-root:wire-key';
    const sent = await new DpiClient(`http://127.0.0.1:${address.port}`, 'DISPOSABLE_WIRE_TOKEN').agent(session.id, 1).send('!printf bb-history-wire-ok', 'followUp', inputKey, 15000);
    assert.equal(sent.status, 'done');
    const { h, c } = await store.resolveAgent(session.id, 'main');
    const receipt = await h.commit((tx: any) => tx.submissionByRequest(c.id, nativeRequestKey(actor, 'message', inputKey)), ctx);
    if (receipt?.type !== 'input' || receipt.status !== 'done' || receipt.answer === undefined || typeof receipt.requestId !== 'string') throw Error('Native input has no terminal answer receipt');
    assert.equal(receipt.id, sent.submissionId);
    assert.notEqual(receipt.requestId, inputKey, 'canonical receipt is native hash, raw metadata is not an alias');
    const stream = await watchEvents(h, c.id, ctx);
    try {
      assert.equal(stream.snapshot.run, undefined); assert.equal(stream.snapshot.generation, undefined);
      const input = stream.snapshot.entries.find((entry: any) => entry.id === receipt.entry);
      assert.ok(input && input.kind === 'host.input');
      assert.ok(stream.snapshot.entries.some((entry: any) => entry.id === receipt.answer && entry.kind === 'pi.assistant'));
      const wire = JSON.parse(JSON.stringify(stream.snapshot));
      return { frame: { status: 'completed', entries: wire.entries, inputs: [{ entryId: String(receipt.entry), requestId: receipt.requestId }] },
        wire, submissionId: receipt.id as number, inputEntryId: receipt.entry as number, answerEntryId: receipt.answer as number,
        requestId: receipt.requestId as string, inputKind: input.kind, inputIsNativeUser: UserEntry.is(input) };
    } finally { await stream.stop(); }
  } finally {
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    await store.close(); await temp.cleanup();
  }
}
