import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

// Run the actual TUI in isolated PTYs, not a mock terminal or source-text assertion.
test("OSC 7501 negotiation and teardown survive startup, subscription and cleanup failures", { timeout: 45_000 }, async () => {
  const { stdout } = await promisify(execFile)("python3", [fileURLToPath(new URL("./program-status-pty.py", import.meta.url))], {
    timeout: 40_000, maxBuffer: 64 * 1024,
  });
  const result = JSON.parse(stdout);
  assert.equal(result.cases, 10);
  assert.equal(result.network_or_model_calls, 0);
});
