import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cp, mkdir, readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, relative, isAbsolute } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Store, DURABLE_VERSION } from "../src/store.js";
import { playgroundProfile } from "../src/runtime-profile.js";
import { JOB_RUNS_DOC, type JobRunsDoc } from "../../dpi-sdk/src/jobs.js";
import { faux, tempStore, until } from "./helpers.js";

async function treeDigest(root: string): Promise<string> {
  const hash = createHash("sha256");
  const visit = async (directory: string) => {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(directory, entry.name);
      hash.update(relative(root, path));
      if (entry.isDirectory()) await visit(path);
      else {
        assert.ok(entry.isFile(), "fixture backup contains only directories and regular files");
        hash.update(await readFile(path));
      }
    }
  };
  await visit(root);
  return hash.digest("hex");
}

test("offline P6 fixture: closed-owner copy resumes native IDs; restore excludes candidate changes", async () => {
  const temporary = await tempStore();
  const originalHome = process.env.HOME;
  process.env.HOME = join(temporary.root, "isolated-home");
  await mkdir(process.env.HOME);
  const options = { ...temporary.options, profile: playgroundProfile };
  const originalVersion = DURABLE_VERSION;
  const backup = join(temporary.root, "immutable-backup");
  let store: Store | undefined = await Store.open(options);
  const close = async () => {
    const current = store;
    store = undefined;
    await current?.close();
  };
  // This remap is test-only and accepts only paths in the generated fixture tree.
  const openBackupCopy = async (destination: string) => {
    assert.ok(destination.startsWith(temporary.root + "/"));
    await cp(backup, destination, { recursive: true, errorOnExist: true, force: false });
    const catalog = new DatabaseSync(join(destination, "catalog.sqlite"));
    try {
      const rows = catalog.prepare("SELECT id,dbPath FROM sessions").all() as Array<{ id: string; dbPath: string }>;
      for (const row of rows) {
        const path = relative(options.dataDir, row.dbPath);
        assert.ok(path && !path.startsWith("..") && !isAbsolute(path));
        catalog.prepare("UPDATE sessions SET dbPath=? WHERE id=?").run(join(destination, path), row.id);
      }
    } finally { catalog.close(); }
    return Store.open({ ...options, dataDir: destination });
  };
  try {
    const session = await store.create({ name: "offline-source", cwd: temporary.work, model: faux });
    const source = await store.resolveAgent(session.id, "main");
    const { taskId } = await store.startJob(source.row, source.h, source.c, { job: "change-watch", input: { checks: 3, interval_seconds: 2 } });
    const readRun = async (owner: Store) => {
      const { h, c } = await owner.resolveAgent(session.id, "main");
      return ((await owner.agentDoc(h, c, JOB_RUNS_DOC)) as JobRunsDoc).items[taskId];
    };
    await until(async () => ((await readRun(store!))?.phases[1].progress?.done ?? 0) >= 1, 15000, "original native checkpoint");
    await close();
    for (const path of [join(options.dataDir, "catalog.sqlite.lock"), join(options.dataDir, "app-state.sqlite.lock"), `${session.dbPath}.lock`])
      assert.equal(existsSync(path), false, "source owner must release locks before snapshot");
    await cp(options.dataDir, backup, { recursive: true, errorOnExist: true, force: false });
    const originalDigest = await treeDigest(backup);
    store = await openBackupCopy(join(temporary.root, "candidate-copy"));
    assert.equal((await store.resolveAgent(session.id, "main")).c.id, source.c.id);
    assert.equal((await readRun(store)).id, taskId);
    await until(async () => (await readRun(store!)).status === "completed", 20000, "candidate resumes copied task");
    assert.equal((await readRun(store)).phases[1].steps.filter((step) => step.kind === "checkpoint" && step.status === "done").length, 3);
    const candidate = await store.resolveAgent(session.id, "main");
    const sent = await store.send(candidate.c, { content: "CANDIDATE_ONLY_HISTORY", requestId: "candidate-only" });
    assert.equal((await store.settled(candidate.h, Number(sent.id), 5000)).status, "done");
    await close();
    assert.equal(await treeDigest(backup), originalDigest, "candidate must not write its backup");
    store = await openBackupCopy(join(temporary.root, "restored-original-copy"));
    assert.equal(DURABLE_VERSION, originalVersion, "restore uses the original pinned fixture runtime, not a downgrade");
    assert.equal((await readRun(store)).id, taskId);
    await until(async () => (await readRun(store!)).status === "completed", 20000, "restored original resumes its checkpoint");
    const restored = await store.resolveAgent(session.id, "main");
    assert.equal(restored.c.id, source.c.id);
    assert.equal((await readRun(store)).phases[1].steps.filter((step) => step.kind === "checkpoint" && step.status === "done").length, 3);
    assert.ok(!JSON.stringify((await store.entries(restored.c, undefined, 500)).items).includes("CANDIDATE_ONLY_HISTORY"));
    await close();
    assert.equal(await treeDigest(backup), originalDigest, "restore also leaves backup immutable");
  } finally {
    await close();
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
    await temporary.cleanup();
  }
});
