#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { DpiClient } from '/home/ubuntu/.local/share/pi-durable-host/releases/c0019d7-sse1/node_modules/dpi-sdk/dist/client.js';

async function main() {
  const evidence = resolve(process.argv[2]);
  assert(evidence.startsWith(join(homedir(), '.local/state/pi-durable-host/cutovers/') ));
  const binding = JSON.parse(await readFile(join(homedir(), '.local/share/pi-durable-host/releases/c0019d7-sse1/terminal-client.json'), 'utf8'));
  const endpoint = new URL(binding.url);
  assert(endpoint.protocol === 'http:' && endpoint.hostname === '127.0.0.1' && !endpoint.username && !endpoint.password);
  const client = new DpiClient(endpoint.origin, binding.token);
  const before = JSON.parse(await readFile(join(evidence, 'before.json'), 'utf8'));
  const choices = before.sessions.flatMap(session => session.agents.map(agent => ({ sessionId: session.id, agentId: agent.id, entries: Object.keys(agent.entries).length })))
    .sort((a, b) => b.entries - a.entries);
  const wanted = ['durable-goals.native-goals', 'durable.schedules', 'host.agent-mail', 'durable.triggers.watches'];
  const results = [];
  for (const choice of choices.slice(0, 4)) {
    const agent = client.agent(choice.sessionId, choice.agentId);
    const detail = await agent.get();
    const kinds = wanted.filter(kind => detail.documentKinds.includes(kind));
    assert.equal(kinds.length, 4);
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]);
    const result = { sessionId: choice.sessionId, agentId: choice.agentId, snapshots: 0, snapshotBytes: 0, documents: [] };
    try {
      for await (const frame of agent.events(signal, kinds)) {
        if (frame.type === 'snapshot') { result.snapshots++; result.snapshotBytes = Buffer.byteLength(JSON.stringify(frame)); }
        if (frame.type === 'doc') result.documents.push(frame.kind);
        if (result.documents.length === kinds.length) break;
      }
    } finally { controller.abort(); }
    assert.equal(result.snapshots, 1, 'Reconnect cannot substitute for one-connection delivery');
    assert.deepEqual(result.documents, kinds);
    results.push(result);
    if (result.snapshotBytes > 2_000_000) break;
  }
  assert(results.some(result => result.snapshotBytes > 2_000_000), 'A real snapshot over the backlog bound is required');
  await writeFile(join(evidence, 'LIVE-SSE.json'), JSON.stringify({ passed: true, readOnly: true, modelCallsSent: 0, results }, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  console.log(JSON.stringify({ passed: true, snapshots: results.length, largestSnapshotBytes: Math.max(...results.map(result => result.snapshotBytes)), documentsPerConnection: 4, modelCallsSent: 0 }));
}
await main().catch(error => { console.error('LIVE_SSE_PROBE_FAILED: ' + error.name); process.exitCode = 1; });
