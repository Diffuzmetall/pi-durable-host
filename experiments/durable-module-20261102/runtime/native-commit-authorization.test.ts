import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { BACKGROUND_CONTEXT as ctx, createContextKey, withContextValue, withAbortSignal } from "@earendil-works/chord/context";
import { Harness, createRegistry, defineDocFamily } from "@earendil-works/pi-durable";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
import { createModels } from "@earendil-works/pi-ai/models";
import { installFaux } from "../../../apps/dpi-backend/src/faux.js";

const authorization = createContextKey<() => void>("test.commit-authorization");
const Probe = defineDocFamily<{ count: number }, null>({
  kind: "test.commit-authorization", version: 1, scope: "conversation", family: true,
  history: "latest", fork: "initial", checkpointWhen: () => true, initial: () => ({ count: 0 }),
});

async function fixture() {
  const cwd = await mkdtemp(join(process.cwd(), "native-authorization-"));
  const storage = await openNodeSqliteStorage(join(cwd, "native.db"));
  const models = createModels();
  installFaux(models);
  const harness = await Harness.open(storage, {
    models, registry: createRegistry(), settings: { progress: { persistWithinMs: 0 } },
    beforeCommit(context) { context.value(authorization)?.(); },
  }, ctx);
  const conversation = await harness.root(ctx, { agent: { model: { provider: "faux", modelId: "echo" }, cwd } });
  let revoked = false;
  const stop = new AbortController();
  const request = withContextValue(authorization, () => { if (revoked) throw Error("REVOKED"); }, withAbortSignal(stop.signal, ctx));
  return { harness, conversation, storage, request, revoke() { revoked = true; stop.abort(); } };
}

test("native commit rolls back a document after awaited authorization loss and stays healthy", async () => {
  const f = await fixture();
  try {
    const count = () => f.harness.commit(async tx => (await tx.doc(Probe, f.conversation.id, "probe", null)).count, ctx);
    assert.equal(await count(), 0);
    let failure: unknown;
    try {
      await f.harness.commit(async tx => {
        const document = await tx.doc(Probe, f.conversation.id, "probe", null);
        document.count = 99;
        await Promise.resolve();
        f.revoke();
      }, f.request);
    } catch (error) { failure = error; }
    assert.equal(await count(), 0, "Unauthorized document must not persist");
    assert.ok(failure instanceof Error, "The request must fail, not silently succeed");
    await f.harness.commit(async tx => { (await tx.doc(Probe, f.conversation.id, "probe", null)).count = 7; }, ctx);
    assert.equal(await count(), 7, "A rolled-back request must not poison the native session");
  } finally { await f.harness.close(ctx); }
});

test("native abort cannot persist marks after revocation inside its awaited storage scan", async () => {
  const f = await fixture();
  try {
    const submission = await f.conversation.submit({ type: "input", content: "pending", requestId: "native-abort", whenBusy: "followUp" }, ctx);
    const before = await submission.status(ctx);
    assert.equal(before.status, "placed");
    const beforeTasks = (await f.storage.scanTasks({}, 100, undefined, ctx)).items;
    assert.ok(beforeTasks.length > 0);
    let reached = false;
    const scan = f.storage.scanSubmissions.bind(f.storage);
    f.storage.scanSubmissions = async (...args) => {
      const rows = await scan(...args);
      if (!reached && args[0].status === "queued") { reached = true; f.revoke(); }
      return rows;
    };
    let failure: unknown;
    try { await f.conversation.abort(f.request); } catch (error) { failure = error; }
    assert.equal(reached, true, "The fixture must revoke inside native abort, not before it starts");
    assert.deepEqual(await submission.status(ctx), before, "Unauthorized abort must not withdraw the submission");
    assert.deepEqual((await f.storage.scanTasks({}, 100, undefined, ctx)).items, beforeTasks,
      "Unauthorized abort must not persist task marks");
    assert.ok(failure instanceof Error, "The request must fail, not silently succeed");
    await f.conversation.abort(ctx);
    assert.ok((await f.storage.scanTasks({}, 100, undefined, ctx)).items.some(task => task.abortRequested),
      "Authorized abort still persists its mark after rollback");
  } finally { await f.harness.close(ctx); }
});
