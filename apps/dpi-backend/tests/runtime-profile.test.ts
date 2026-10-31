import { test } from "node:test";
import assert from "node:assert/strict";
import { BACKGROUND_CONTEXT as ctx } from "@earendil-works/chord/context";
import { defineExtension, defineTool } from "@earendil-works/pi-durable";
import { Type } from "@earendil-works/pi-ai";
import { Store, DURABLE_VERSION } from "../src/store.js";
import { minimalProfile, type RuntimeProfileContext, type RuntimeProfileFactory } from "../src/runtime-profile.js";
import { faux, tempStore } from "./helpers.js";

test("minimal profile runs native coding tools and reopens without playground/jobs/add-ons", async () => {
  const t = await tempStore();
  const options = { ...t.options, profile: minimalProfile };
  let store = await Store.open(options);
  try {
    assert.equal(DURABLE_VERSION, "1.4.0");
    assert.deepEqual(store.deviceInfo().capabilities, ["events", "docs", "runtime-refresh.v1"]);
    assert.deepEqual(store.deviceInfo().jobs, []);
    const session = await store.create({ name: "minimal", cwd: t.work, model: faux });
    let { row, h, c } = await store.resolveAgent(session.id, "main");
    const detail = await store.agentDetail(row, c);
    assert.deepEqual(detail.tools.map((tool) => tool.name).sort(), ["bash", "edit", "read", "write"]);
    assert.deepEqual((await store.extensionsOf(row, c)).extensions, []);
    assert.equal(await h.snapshot((await import("../src/jobs.js")).JobRuns, c.id, ctx), undefined);
    const sent = await store.send(c, { content: "!printf minimal-profile-ok", requestId: "minimal-tool" });
    assert.equal((await store.settled(h, sent.id as number, 15000)).status, "done");
    assert.match(JSON.stringify((await store.entries(c, undefined, 100)).items), /minimal-profile-ok/);
    await store.close();
    store = await Store.open(options);
    ({ row, h, c } = await store.resolveAgent(session.id, "main"));
    const retry = await store.send(c, { content: "!printf minimal-profile-ok", requestId: "minimal-tool" });
    assert.equal(retry.id, sent.id);
    assert.equal((await store.settled(h, retry.id as number, 1000)).status, "done");
    await assert.rejects(() => store.setExtension(row, c, { name: "system-prompts", enabled: true }), /no demo add-ons/);
  } finally {
    await store.close();
    await t.cleanup();
  }
});

test("incompatible persisted profile refuses before construction or resume", async () => {
  const t = await tempStore();
  let store = await Store.open({ ...t.options, profile: minimalProfile });
  try {
    const session = await store.create({ name: "pinned", cwd: t.work, model: faux });
    await store.close();
    let constructed = 0;
    const changed: RuntimeProfileFactory = Object.assign((context: RuntimeProfileContext) => {
      constructed++;
      return minimalProfile(context);
    }, { id: "incompatible@2" });
    store = await Store.open({ ...t.options, profile: changed });
    assert.equal(constructed, 0);
    assert.equal(store.opened.size, 0);
    assert.equal(store.errors.get(session.id), "Service unavailable", "cached public failures must not expose initialization details");
    await assert.rejects(() => store.resolveAgent(session.id, "main"), { code: "unavailable", status: 503 });
    assert.equal((store.catalog.prepare("SELECT profileId FROM session_profiles WHERE sessionId=?").get(session.id) as { profileId: string }).profileId, "minimal@1");
  } finally {
    await store.close();
    await t.cleanup();
  }
});

test("trusted alternative profile adds a native extension without changing Store", async () => {
  const t = await tempStore();
  const extra = defineExtension({
    name: "fixture.extra",
    tools: [defineTool({
      name: "bash",
      description: "Local profile seam fixture",
      parameters: Type.Object({ command: Type.String() }),
      replay: "safe",
      execute: async () => ({ output: [{ type: "text", text: "fixture-result" }] }),
    })],
  });
  const profile: RuntimeProfileFactory = Object.assign((context: RuntimeProfileContext) => {
    const composition = minimalProfile(context);
    composition.registry.install(extra);
    return { ...composition, extensions: [...composition.extensions, extra] };
  }, { id: "fixture-extra@1" });
  const store = await Store.open({ ...t.options, profile });
  try {
    const session = await store.create({ name: "alternative", cwd: t.work, model: faux });
    const { h, c } = await store.resolveAgent(session.id, "main");
    assert.ok((await c.agent(ctx)).extensions.some((extension) => extension.name === "fixture.extra"));
    const sent = await store.send(c, { content: "!not-a-real-shell-command", requestId: "alternative-roundtrip" });
    assert.equal((await store.settled(h, sent.id as number, 15000)).status, "done");
    assert.match(JSON.stringify((await store.entries(c, undefined, 100)).items), /fixture-result/);
  } finally {
    await store.close();
    await t.cleanup();
  }
});
