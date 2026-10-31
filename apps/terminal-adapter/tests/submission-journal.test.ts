import assert from "node:assert/strict";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { SubmissionJournal } from "../src/submission-journal.js";

test("delivery key persists before send, reopens unchanged, and uncertain payload cannot be replaced", async () => {
  const root = await mkdtemp(join(tmpdir(), "dpi-journal-"));
  try {
    const journal = await SubmissionJournal.open(root);
    const first = await journal.begin(1, "unchanged input", "steer");
    assert.equal((await stat(join(root, `${first.requestId}.json`))).mode & 0o777, 0o600);
    const reopened = await SubmissionJournal.open(root);
    assert.deepEqual([...reopened.pending.values()], [first]);
    await assert.rejects(() => reopened.begin(1, "different input", "steer"), /uncertain/);
    await assert.rejects(() => reopened.begin(1, first.text, "followUp"), /uncertain/);
    assert.deepEqual(await reopened.begin(1, first.text, first.whenBusy), first);
    await reopened.accepted(first.requestId);
    assert.equal((await SubmissionJournal.open(root)).pending.size, 0);
    const next = await reopened.begin(1, first.text, first.whenBusy);
    assert.notEqual(next.requestId, first.requestId);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("explicit inputs during an in-flight ACK get distinct keys; only uncertain delivery constrains retry", async () => {
  const root = await mkdtemp(join(tmpdir(), "dpi-journal-"));
  try {
    const journal = await SubmissionJournal.open(root);
    const first = await journal.begin(1, "first", "steer");
    const second = await journal.begin(1, "second", "followUp");
    assert.notEqual(first.requestId, second.requestId);
    journal.markUncertain(first.requestId);
    await assert.rejects(() => journal.begin(1, "third", "steer"), /uncertain/);
    assert.equal((await journal.begin(1, "first", "steer")).requestId, first.requestId);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("corrupted journal fails closed instead of replaying any input", async () => {
  const root = await mkdtemp(join(tmpdir(), "dpi-journal-"));
  try {
    await writeFile(join(root, "12345678-1234-1234-1234-123456789012.json"), JSON.stringify({ requestId: "different", conversationId: 1, text: "do not replay", whenBusy: "steer" }));
    await assert.rejects(() => SubmissionJournal.open(root), /Invalid pending/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
