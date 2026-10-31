#!/usr/bin/env node
/** Read-only retained-state check. Additional accepted entries are allowed, never mistaken for loss. */
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { resolve, join } from 'node:path';
import { homedir } from 'node:os';

const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export async function capture(client) {
  const sessions = [];
  for (const session of await client.sessions()) {
    const agents = [];
    for (const agent of await client.session(session.id).agents()) {
      const handle = client.agent(session.id, agent.id), detail = await handle.get();
      const entries = {};
      let cursor;
      do {
        const page = await handle.entries({ scope: 'all', limit: 500, ...(cursor ? { cursor } : {}) });
        for (const entry of page.items) { assert(Number.isSafeInteger(entry.id)); entries[entry.id] = hash(entry); }
        cursor = page.next;
      } while (cursor);
      agents.push({ id: agent.id, config: detail.config, busy: detail.busy,
        tools: detail.tools.map(tool => tool.name).sort(), entries });
    }
    sessions.push({ id: session.id, cwd: session.cwd, agents });
  }
  return { checkedAt: new Date().toISOString(), sessions };
}
export function retained(before, after) {
  for (const previous of before.sessions) {
    const current = after.sessions.find(session => session.id === previous.id);
    assert(current, 'Existing session missing'); assert.equal(current.cwd, previous.cwd);
    for (const agent of previous.agents) {
      const actual = current.agents.find(value => value.id === agent.id);
      assert(actual, 'Existing conversation missing'); assert.deepEqual(actual.config, agent.config);
      for (const tool of agent.tools) assert(actual.tools.includes(tool), `Previously offered tool missing: ${previous.id}/${agent.id}/${tool}`);
      for (const [id, digest] of Object.entries(agent.entries)) assert.equal(actual.entries[id], digest, 'Existing entry missing or changed');
    }
  }
  return { passed: true, retainedSessions: before.sessions.length, additionalEntriesAllowed: true };
}
async function main() {
  const [output, beforePath] = process.argv.slice(2);
  assert(output);
  const base = join(homedir(), '.local/share/pi-durable-host/releases/c0019d7-sse1');
  const { DpiClient } = await import(pathToFileURL(join(base, 'node_modules/dpi-sdk/dist/client.js')).href);
  const config = JSON.parse(await readFile(join(base, 'terminal-client.json'), 'utf8'));
  const state = await capture(new DpiClient(new URL(config.url).origin, config.token));
  await writeFile(output, JSON.stringify(state, null, 2) + '\n', { flag: 'wx', mode: 0o600, flush: true });
  const result = beforePath ? retained(JSON.parse(await readFile(beforePath, 'utf8')), state) : { captured: true, sessions: state.sessions.length };
  console.log(JSON.stringify(result));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  await main().catch(() => { console.error('DeLM retained-state verification failed; private evidence retained.'); process.exitCode = 1; });
