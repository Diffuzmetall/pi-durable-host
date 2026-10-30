import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, realpath, rm, stat, symlink, writeFile, rename } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store, lockFile, type SessionRow } from "../src/store.js";
import { playgroundProfile, type RuntimeProfileFactory } from "../src/runtime-profile.js";

const owned = /owned|ownership|lock|already.*open/i;

async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), "dpi-ownership-")));
  const work = join(root, "work");
  await mkdir(work);
  let initializations = 0;
  const profile: RuntimeProfileFactory = Object.assign(async (...args: Parameters<RuntimeProfileFactory>) => {
    initializations++;
    return playgroundProfile(...args);
  }, { id: playgroundProfile.id });
  const stores = new Set<Store>();
  return {
    root, work, profile,
    initializations: () => initializations,
    async open(catalog = "data") {
      const store = await Store.open({ dataDir: join(root, catalog), startDirs: [work], name: "ownership", provider: "faux", profile });
      stores.add(store);
      return store;
    },
    async close(store: Store) {
      await store.close();
      stores.delete(store);
    },
    async cleanup() {
      try { for (const store of stores) await store.close(); }
      finally { await rm(root, { recursive: true, force: true }); }
    },
  };
}

// Separate catalogs must not make the same native database a different resource.
function register(store: Store, row: SessionRow, profileId: string) {
  store.catalog.prepare("INSERT INTO sessions VALUES(?,?,?,?,?,?,?)")
    .run(row.id, row.name, row.cwd, row.dbPath, row.createdAt, row.model, row.provider);
  store.catalog.prepare("INSERT INTO session_profiles VALUES(?,?)").run(row.id, profileId);
}

const create = (store: Store, cwd: string) => store.create({
  name: "Single owner", cwd, model: { provider: "faux", modelId: "echo" },
});

test("same-PID second Store.open rejects without replacing owner locks or initializing another profile", async () => {
  const f = await fixture();
  try {
    const owner = await f.open();
    const session = await create(owner, f.work);
    const original = await owner.resolveAgent(session.id, "main");
    const lock = `${owner.catalogPath}.lock`;
    const before = { inode: (await stat(lock)).ino, contents: await readFile(lock, "utf8"), initializations: f.initializations() };
    // Retain any incorrectly accepted contender so RED runs still close disposable resources.
    await assert.rejects(() => f.open(), owned);
    assert.equal((await stat(lock)).ino, before.inode);
    assert.equal(await readFile(lock, "utf8"), before.contents);
    assert.equal(f.initializations(), before.initializations);
    assert.equal((await owner.resolveAgent(session.id, "main")).h, original.h);
  } finally { await f.cleanup(); }
});

for (const alias of [false, true]) test(`separate catalogs reject an owned session DB${alias ? " through a file symlink" : ""} without releasing its lock`, async () => {
  const f = await fixture();
  try {
    const owner = await f.open("first");
    const session = await create(owner, f.work);
    const row = { ...owner.resolveSession(session.id) };
    const original = await owner.resolveAgent(session.id, "main");
    const other = await f.open("second");
    if (alias) {
      row.dbPath = join(f.root, "session-alias.sqlite");
      await symlink(session.dbPath, row.dbPath);
    }
    register(other, row, f.profile.id);
    const lock = `${session.dbPath}.lock`;
    const before = { inode: (await stat(lock)).ino, contents: await readFile(lock, "utf8"), initializations: f.initializations() };
    await assert.rejects(() => other.openAgent(row), owned);
    assert.equal(other.opened.has(row.id), false);
    assert.equal(f.initializations(), before.initializations);
    await f.close(other);
    assert.equal((await stat(lock)).ino, before.inode);
    assert.equal(await readFile(lock, "utf8"), before.contents);
    assert.equal((await owner.resolveAgent(row.id, "main")).h, original.h);
  } finally { await f.cleanup(); }
});

test("concurrent openAgent calls admit at most one native initialization and one Harness", async () => {
  const f = await fixture();
  try {
    const owner = await f.open("first");
    const session = await create(owner, f.work);
    const row = owner.resolveSession(session.id);
    const other = await f.open("second");
    register(other, row, f.profile.id);
    await f.close(owner);
    const before = f.initializations();
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => other.openAgent(row)));
    const opened = results.flatMap((r) => r.status === "fulfilled" ? [r.value] : []);
    assert.ok(opened.length > 0, "one caller must acquire the released native database");
    assert.equal(new Set(opened).size, 1, "concurrent callers must not obtain distinct native owners");
    assert.equal(f.initializations() - before, 1, "ownership must be exclusive before profile initialization");
    assert.equal(other.opened.get(row.id)?.harness, opened[0]);
    for (const result of results) if (result.status === "rejected") assert.match(String(result.reason), owned);
  } finally { await f.cleanup(); }
});

test("normal close releases catalog and native DB ownership for reopen with stable native IDs", async () => {
  const f = await fixture();
  try {
    const first = await f.open();
    const session = await create(first, f.work);
    const before = await first.resolveAgent(session.id, "main");
    await f.close(first);
    const reopened = await f.open();
    assert.equal(reopened.errors.size, 0);
    const after = await reopened.resolveAgent(session.id, "main");
    assert.equal(after.row.id, before.row.id);
    assert.equal(after.row.dbPath, before.row.dbPath);
    assert.equal(after.c.id, before.c.id);
    assert.notEqual(after.h, before.h);
  } finally { await f.cleanup(); }
});

test("constructor failure releases its catalog lock before a corrected open retries", async () => {
  const f = await fixture();
  try {
    const catalog = join(f.root, "data", "catalog.sqlite");
    await mkdir(join(f.root, "data"));
    await writeFile(catalog, "not a SQLite database");
    await assert.rejects(() => f.open(), /database|sqlite/i);
    assert.equal(f.initializations(), 0);
    await assert.rejects(() => stat(`${catalog}.lock`), { code: "ENOENT" });
    await rename(catalog, `${catalog}.malformed`);
    const repaired = await f.open();
    assert.deepEqual(repaired.list(), []);
    assert.equal(repaired.errors.size, 0);
  } finally { await f.cleanup(); }
});

test("an old idempotent unlock cannot remove a newer same-PID ownership lock", async () => {
  const f = await fixture();
  const lock = join(f.root, "ownership.lock");
  let release: (() => void) | undefined;
  try {
    const oldRelease = lockFile(lock);
    oldRelease();
    release = lockFile(lock);
    const before = { inode: (await stat(lock)).ino, contents: await readFile(lock, "utf8") };
    oldRelease();
    assert.equal((await stat(lock)).ino, before.inode);
    assert.equal(await readFile(lock, "utf8"), before.contents);
    assert.throws(() => lockFile(lock), owned);
    release();
    await assert.rejects(() => stat(lock), { code: "ENOENT" });
  } finally {
    release?.();
    await f.cleanup();
  }
});

for (const resource of ["catalog.sqlite", "app-state.sqlite"]) test(`catalog/shared file aliases refuse an owned ${resource} and allow transfer after close`, async () => {
  const f = await fixture();
  try {
    const owner = await f.open("first");
    await create(owner, f.work);
    const original = resource === "catalog.sqlite" ? owner.catalogPath : owner.sharedStatePath;
    const otherDir = join(f.root, "second");
    await mkdir(otherDir);
    await symlink(original, join(otherDir, resource));
    const lock = `${original}.lock`;
    const before = { inode: (await stat(lock)).ino, contents: await readFile(lock, "utf8"), initializations: f.initializations() };
    await assert.rejects(() => f.open("second"), owned);
    assert.equal((await stat(lock)).ino, before.inode);
    assert.equal(await readFile(lock, "utf8"), before.contents);
    assert.equal(f.initializations(), before.initializations);
    await f.close(owner);
    const replacement = await f.open("second");
    assert.equal(replacement.errors.size, 0, "failed acquisition must not strand the other catalog lock");
  } finally { await f.cleanup(); }
});
