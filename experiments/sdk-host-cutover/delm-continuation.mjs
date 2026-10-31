#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile, writeFile, lstat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';

/** Recovery is separate from deployment. Exact approved bytes/key survive ambiguous HTTP outcomes. */
export async function deliverContinuation(client, evidence, { attempts = 5, delayMs = 2000 } = {}) {
  const path = join(evidence, 'continuation-intent.json');
  const info = await lstat(path);
  assert(info.isFile() && !info.isSymbolicLink() && info.uid === process.getuid() && !(info.mode & 0o077));
  const intent = JSON.parse(await readFile(path, 'utf8'));
  assert(typeof intent.content === 'string' && intent.content.length > 0 && typeof intent.requestId === 'string' && typeof intent.parentSession === 'string');
  assert.equal(createHash('sha256').update(intent.content).digest('hex'), intent.contentSha256);
  const receiptPath = join(evidence, 'continuation-receipt.json');
  const existing = await readFile(receiptPath, 'utf8').catch(error => { if (error.code !== 'ENOENT') throw error; });
  if (existing) {
    const receipt = JSON.parse(existing); assert.equal(receipt.requestId, intent.requestId); return receipt;
  }
  let failure;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const result = await client.agent(intent.parentSession, 1).send(intent.content, 'followUp', intent.requestId, 0);
      assert(Number.isSafeInteger(result.submissionId));
      const receipt = { requestId: intent.requestId, submissionId: result.submissionId, status: result.status };
      await writeFile(receiptPath, JSON.stringify(receipt) + '\n', { flag: 'wx', mode: 0o600, flush: true });
      return receipt;
    } catch (error) { failure = error; if (attempt + 1 < attempts) await sleep(delayMs); }
  }
  throw failure;
}
async function main() {
  const evidence = resolve(process.argv[2]);
  const base = join(homedir(), '.local/share/pi-durable-host/releases/c0019d7-sse1');
  const { DpiClient } = await import(pathToFileURL(join(base, 'node_modules/dpi-sdk/dist/client.js')).href);
  const config = JSON.parse(await readFile(join(base, 'terminal-client.json'), 'utf8'));
  const receipt = await deliverContinuation(new DpiClient(new URL(config.url).origin, config.token), evidence);
  console.log(JSON.stringify({ requestId: receipt.requestId, accepted: true }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  await main().catch(() => { console.error('Continuation delivery unresolved; retry this helper with the SAME evidence directory, never repeat deployment.'); process.exitCode = 1; });
