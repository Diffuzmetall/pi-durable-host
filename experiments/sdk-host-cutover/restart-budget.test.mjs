import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('voice activation covers the full systemd restart budget and gates settings on readiness', async () => {
  const source = await readFile(new URL('../gippity-voice/enable-context.mjs', import.meta.url), 'utf8');
  const unit = await readFile(new URL('../host-retry-20261031-pinkhare/host-lifecycle.conf', import.meta.url), 'utf8');
  const stop = Number(/TimeoutStopSec=(\d+)/.exec(unit)[1]);
  const start = Number(/TimeoutStartSec=(\d+)/.exec(unit)[1]);
  const retry = /for \(let i = 0; i < (\d+); i\+\+\) \{\s*await delay\((\d+)\)/.exec(source);
  assert.ok(retry);
  assert.ok(Number(retry[1]) * Number(retry[2]) >= (start + stop + 60) * 1000);
  assert.ok(source.indexOf("if (active !== 'active') continue;") < source.indexOf("state.phase = 'saving-settings'"));
  assert.equal((source.match(/'--no-block', 'restart'/g) ?? []).length, 1, 'one restart, never a retry storm');
});
