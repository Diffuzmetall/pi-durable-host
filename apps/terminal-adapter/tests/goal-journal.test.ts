import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { SubmissionJournal } from "../src/submission-journal.js";

test("uncertain Goal mutation keeps its key/body while read-only inspection and ordinary model input remain independent", async () => {
  const root = await mkdtemp(join(tmpdir(), "dpi-goal-journal-"));
  try {
    const journal = await SubmissionJournal.open(root);
    const command = await journal.begin(1, "/goal approve saved human", "steer", "goal-command");
    journal.markUncertain(command.requestId);
    await assert.rejects(() => journal.begin(1, "/goal cancel saved --confirm", "steer", "goal-command"), /uncertain/);
    const inspect = await journal.begin(1, "/goal status saved", "steer", "goal-inspect");
    const message = await journal.begin(1, "inspect the saved state", "steer");
    assert.equal(new Set([command.requestId, inspect.requestId, message.requestId]).size, 3);
    const reopened = await SubmissionJournal.open(root);
    assert.equal(reopened.pending.get(command.requestId)?.kind, "goal-command");
    assert.equal((await reopened.begin(1, command.text, "steer", "goal-command")).requestId, command.requestId);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("legacy message journals remain readable and unsupported delivery kinds fail closed", async () => {
  const root = await mkdtemp(join(tmpdir(), "dpi-journal-legacy-"));
  const requestId = "12345678-1234-1234-1234-123456789012";
  const value = { requestId, conversationId: 1, text: "legacy input", whenBusy: "steer" };
  try {
    const file = join(root, `${requestId}.json`);
    await writeFile(file, JSON.stringify(value));
    assert.equal((await SubmissionJournal.open(root)).pending.get(requestId)?.kind, "message");
    await writeFile(file, JSON.stringify({ ...value, kind: "unsupported-kind" }));
    await assert.rejects(() => SubmissionJournal.open(root), /Invalid pending/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
