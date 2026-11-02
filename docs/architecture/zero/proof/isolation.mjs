import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
for (const path of ['/home/ubuntu/.pi', '/home/ubuntu/.config', '/home/ubuntu/Projects/pi-durable-host', '/run/user/1000']) {
  assert.equal(existsSync(path), false, `Forbidden host path visible: ${path}`);
}
console.log('PASS: four forbidden host paths absent; runtime probe uses no model, Harness, or database.');
