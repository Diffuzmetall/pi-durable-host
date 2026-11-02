import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { Store } from "../src/store.js";
import { minimalProfile, type RuntimeProfileContext, type RuntimeProfileFactory } from "../src/runtime-profile.js";
import { faux, tempStore } from "./helpers.js";

test("a failed initializer does not prevent sibling recovery and diagnostics are redacted", async () => {
  const fixture = await tempStore();
  let store = await Store.open({ ...fixture.options, profile: minimalProfile });
  const bad = await store.create({ name: "bad", cwd: fixture.work, model: faux });
  const good = await store.create({ name: "good", cwd: fixture.work, model: faux });
  await store.close();
  const profile: RuntimeProfileFactory = Object.assign((context: RuntimeProfileContext) => {
    if (context.sessionId === bad.id) throw Error("private-initializer-sentinel");
    return minimalProfile(context);
  }, { id: minimalProfile.id });
  try {
    store = await Store.openCatalog({ ...fixture.options, profile });
    await store.whenRestored();
    assert.equal(store.sessionReadiness(bad.id), "failed");
    assert.equal(store.sessionReadiness(good.id), "ready");
    assert.equal(store.errors.get(bad.id), "Internal error");
    await store.resolveAgent(good.id, "main");
    await assert.rejects(() => store.resolveAgent(bad.id, "main"), { status: 503 });
    assert.deepEqual(store.recoveryStatus(), { state: "ready", total: 2, restoring: 0, ready: 1, failed: 1 });
  } finally { await store.close().catch(() => {}); await fixture.cleanup(); }
});

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>(r => { resolve = r; });
  return { promise, resolve };
};

test("catalog returns before blocked recovery; fast sessions work and initializers stay bounded", async () => {
  const fixture = await tempStore();
  let store = await Store.open({ ...fixture.options, profile: minimalProfile });
  const sessions: Awaited<ReturnType<Store["create"]>>[] = [];
  for (let i = 0; i < 8; i++) sessions.push(await store.create({ name: `session-${i}`, cwd: fixture.work, model: faux }));
  await store.close();
  const gate = deferred(), fast = deferred();
  let active = 0, peak = 0;
  const profile: RuntimeProfileFactory = Object.assign(async (context: RuntimeProfileContext) => {
    active++; peak = Math.max(peak, active);
    try {
      if (context.sessionId !== sessions[7].id) await gate.promise;
      return minimalProfile(context);
    } finally { active--; }
  }, { id: minimalProfile.id });
  try {
    store = await Store.openCatalog({ ...fixture.options, profile });
    const unsubscribe = store.subscribe(() => {
      if (store.sessionReadiness(sessions[7].id) === "ready") fast.resolve();
    });
    if (store.sessionReadiness(sessions[7].id) === "ready") fast.resolve();
    await fast.promise;
    assert.equal(store.sessionReadiness(sessions[0].id), "restoring");
    await store.resolveAgent(sessions[7].id, "main");
    assert.ok(peak <= 4);
    gate.resolve();
    await store.whenRestored();
    unsubscribe();
    assert.deepEqual(store.recoveryStatus(), { state: "ready", total: 8, restoring: 0, ready: 8, failed: 0 });
  } finally { gate.resolve(); await store.close().catch(() => {}); await fixture.cleanup(); }
});

test("close waits for in-flight recovery and retains owner locks until cleanup", async () => {
  const fixture = await tempStore();
  let store = await Store.open({ ...fixture.options, profile: minimalProfile });
  const session = await store.create({ name: "blocked", cwd: fixture.work, model: faux });
  const path = store.row(session.id).dbPath;
  const rootId = (await store.resolveAgent(session.id, "main")).c.id;
  await store.close();
  const entered = deferred(), gate = deferred();
  let cleanup = 0, closed = false;
  const profile: RuntimeProfileFactory = Object.assign(async (context: RuntimeProfileContext) => {
    entered.resolve(); await gate.promise;
    return { ...minimalProfile(context), cleanup: async () => { cleanup++; } };
  }, { id: minimalProfile.id });
  try {
    store = await Store.openCatalog({ ...fixture.options, profile });
    await entered.promise;
    const existing = store.openAgent(store.row(session.id));
    assert.equal(store.openAgent(store.row(session.id)), existing);
    const closing = store.close();
    assert.equal(store.close(), closing);
    await assert.rejects(async () => store.create({ name: "denied", cwd: fixture.work, model: faux }), /closing/);
    const close = closing.then(() => { closed = true; });
    await Promise.resolve();
    assert.equal(closed, false);
    assert.ok(existsSync(`${path}.lock`));
    await assert.rejects(Store.open(fixture.options), /already owned/);
    gate.resolve(); await close;
    assert.equal(cleanup, 1);
    assert.equal(existsSync(`${path}.lock`), false);
    await store.close();
    store = await Store.open({ ...fixture.options, profile: minimalProfile });
    assert.equal((await store.resolveAgent(session.id, "main")).c.id, rootId);
  } finally { gate.resolve(); await store.close().catch(() => {}); await fixture.cleanup(); }
});
