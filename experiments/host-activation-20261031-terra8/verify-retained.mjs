#!/usr/bin/env node
// Persisted/native parity gates cutover; external MCP availability is a separate explicit verdict.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { capture, retained } from '../sdk-host-cutover/delm-cutover-state.mjs';
import { DpiClient } from './host/node_modules/dpi-sdk/dist/client.js';

export function retainedStatus(before, after) {
  const core = structuredClone(before);
  for (const session of core.sessions) for (const agent of session.agents)
    agent.tools = agent.tools.filter(name => !name.startsWith('mcp__'));
  retained(core, after); // History, exact configurations, ownership and native tools still fail closed.
  const mcpDifferences = [];
  for (const session of before.sessions) for (const agent of session.agents) {
    const current = after.sessions.find(item => item.id === session.id).agents.find(item => item.id === agent.id);
    const missing = agent.tools.filter(name => name.startsWith('mcp__') && !current.tools.includes(name));
    if (missing.length) mcpDifferences.push({ sessionId: session.id, conversationId: agent.id,
      servers: [...new Set(missing.map(name => name.split('__')[1]))], missingTools: missing.length });
  }
  return { dataAndNativeParity: true, retainedSessions: before.sessions.length,
    mcpParity: mcpDifferences.length === 0, mcpDifferences };
}

async function main() {
  const [output, beforePath] = process.argv.slice(2);
  assert(output);
  let client, before;
  try {
    const config = JSON.parse(await readFile('/home/ubuntu/.local/share/pi-durable-host/releases/c0019d7-sse1/terminal-client.json', 'utf8'));
    const endpoint = new URL(config.url);
    assert(endpoint.protocol === 'http:' && endpoint.hostname === '127.0.0.1' && !endpoint.username && !endpoint.password);
    client = new DpiClient(endpoint.origin, config.token);
    if (beforePath) before = JSON.parse(await readFile(beforePath, 'utf8'));
  } catch { throw Error('PRIVATE_PARITY_INPUT_INVALID'); }
  const state = await capture(client);
  await writeFile(output, JSON.stringify(state, null, 2) + '\n', { flag: 'wx', mode: 0o600, flush: true });
  console.log(JSON.stringify(before ? retainedStatus(before, state) : { captured: true, sessions: state.sessions.length }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  await main().catch(error => { console.error(`Retained-state verification failed: ${error.name}: ${error.message}`); process.exitCode = 1; });
