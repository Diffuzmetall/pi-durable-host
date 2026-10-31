#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
const [output, beforePath] = process.argv.slice(2);
if (!output) throw Error('Usage: nico-state.mjs PRIVATE_OUTPUT [PRIVATE_PREIMAGE]');
const home = homedir(), root = join(home, '.config/pi-durable-host');
const { DpiClient } = await import(pathToFileURL(join(home, '.local/share/pi-durable-host/releases/c0019d7-sse1/node_modules/dpi-sdk/dist/client.js')));
const config = JSON.parse(readFileSync(join(root, 'host.json'), 'utf8'));
const client = new DpiClient(`http://127.0.0.1:${config.port}`, config.grants.find(g => g.id === config.ownerGrantId).token);
const pid = Number(execFileSync('systemctl', ['--user','show','pi-durable-host.service','-p','MainPID','--value'], { encoding: 'utf8' }).trim());
assert(pid > 1);
const command = readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0').filter(Boolean);
assert.equal(command[0], '/home/ubuntu/.nvm/versions/node/v24.19.0/bin/node');
assert.equal(command[2], join(root, 'host.json'));
const sessions = [];
for (const session of await client.sessions()) {
  assert.equal((await client.session(session.id).tasks('live', 100)).length, 0, 'Native tasks must be idle');
  const agents = [];
  for (const agent of await client.session(session.id).agents()) {
    const handle = client.agent(session.id, agent.id), detail = await handle.get();
    assert.equal(detail.busy, false, 'Agent must be idle');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    let checkedInbox = false;
    try {
      for await (const event of handle.events(controller.signal)) if (event.type === 'snapshot') {
        assert.equal(event.inbox.length, 0, 'Native inbox must be empty'); checkedInbox = true; break;
      }
    } finally { clearTimeout(timer); controller.abort(); }
    assert(checkedInbox, 'Native SSE snapshot required');
    const hash = createHash('sha256'); let cursor, count = 0;
    do {
      const page = await handle.entries({ scope: 'all', limit: 500, ...(cursor ? { cursor } : {}) });
      for (const entry of page.items) { hash.update(JSON.stringify(entry)); count++; }
      cursor = page.next;
    } while (cursor);
    agents.push({ id: agent.id, config: detail.config, entries: count, entriesSha256: hash.digest('hex'),
      tools: detail.tools.map(tool => tool.name).sort() });
  }
  sessions.push({ id: session.id, cwd: session.cwd, agents });
}
const locks = [join(config.dataDir, 'catalog.sqlite.lock'), ...readdirSync(join(config.dataDir, 'sessions')).map(name => join(config.dataDir, 'sessions', name, 'agent.sqlite.lock'))];
for (const lock of locks) assert.equal(Number(readFileSync(lock, 'utf8')), pid);
const ledger = join(home, '.local/share/pi-durable-host/releases/c0019d7-dadd5534/live-acceptance-ledger');
const reservations = readdirSync(ledger).filter(name => name.endsWith('.json')).sort().map(name => ({ name,
 sha256: createHash('sha256').update(readFileSync(join(ledger, name))).digest('hex') }));
assert.equal(reservations.length, 3);
const result = { checkedAt: new Date().toISOString(), pid, command, sessions, reservations, sqliteLocks: locks.length };
if (beforePath) {
  const before = JSON.parse(readFileSync(beforePath, 'utf8'));
  assert.deepEqual(result.reservations, before.reservations);
  assert.deepEqual(sessions.map(s => s.id).sort(), before.sessions.map(s => s.id).sort());
  for (const previous of before.sessions) {
    const current = sessions.find(s => s.id === previous.id);
    assert.equal(current.cwd, previous.cwd);
    assert.deepEqual(current.agents.map(a => a.id).sort(), previous.agents.map(a => a.id).sort());
    for (const agent of previous.agents) {
      const actual = current.agents.find(a => a.id === agent.id);
      assert.deepEqual(actual.config, agent.config);
      assert.equal(actual.entries, agent.entries);
      assert.equal(actual.entriesSha256, agent.entriesSha256);
      const missing = agent.tools.filter(tool => !actual.tools.includes(tool));
      assert.deepEqual(missing, [], 'Previously available tools must remain available');
    }
  }
}
writeFileSync(output, JSON.stringify(result,null,2)+'\n', { flag: 'wx', mode: 0o600, flush: true });
console.log(JSON.stringify({ passed: true, sessions: sessions.length, agents: sessions.reduce((n,s)=>n+s.agents.length,0), oneSqliteOwner: true,
 idle: true, providerReservations: reservations.length, comparison: Boolean(beforePath) }));
