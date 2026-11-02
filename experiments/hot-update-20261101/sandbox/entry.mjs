import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { selfCheck } from './check.mjs';

const [sentinel, command, ...args] = process.argv.slice(2);
assert.ok(sentinel && command, 'Sandbox sentinel and explicit command are required');
// Fail closed before importing or starting any product fixture in this namespace.
await selfCheck(sentinel);
console.log('SANDBOX_NEGATIVE_SELF_CHECK_PASS');
const child = spawn(command, args, {stdio: 'inherit'});
const [code, signal] = await once(child, 'exit');
if (signal) {
  console.error(`ISOLATED_COMMAND_SIGNAL:${signal}`);
  process.exitCode = 1;
} else {
  process.exitCode = code;
}
