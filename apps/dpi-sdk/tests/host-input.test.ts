import { test } from "node:test";
import assert from "node:assert/strict";
import { toTranscript } from "../src/transcript.js";
import type { WireEntry } from "../src/api.js";

test("authenticated host input renders as user without changing native metadata", () => {
  const entry: WireEntry = {
    id: 7, conversationId: 1, kind: "host.input",
    data: { actor: "human-fixture", source: "terminal", authority: "human" },
    model: [{ role: "user", content: "hello", timestamp: 0 }],
  };
  assert.deepEqual(toTranscript([entry]), [{ kind: "user", id: 7, text: "hello" }]);
  assert.equal(entry.kind, "host.input");
  assert.equal((entry.data as { actor: string }).actor, "human-fixture");
});

test("unknown entry kinds retain a safe textual fallback", () => {
  const entry: WireEntry = { id: 8, conversationId: 1, kind: "future.render", data: { text: "<script>not executable</script>" } };
  const item = toTranscript([entry])[0];
  assert.equal(item.kind, "event");
  if (item.kind === "event") {
    assert.equal(item.entryKind, "future.render");
    assert.equal(item.text, "<script>not executable</script>");
  }
});
