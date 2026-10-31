import test from 'node:test';
import assert from 'node:assert/strict';
import { retainedStatus } from './verify-retained.mjs';
import { retained } from '../sdk-host-cutover/delm-cutover-state.mjs';

const fixture = () => ({ sessions: [{ id: 'fixture', cwd: '/tmp/fixture', agents: [{
  id: 1, config: { model: { provider: 'fixture', modelId: 'unchanged' } },
  tools: ['read', 'mcp__langfuse__read'], entries: { 1: 'unchanged-entry-digest' },
}] }] });

test('complete restoration reports both independent verdicts true', () => {
  const before = fixture(), after = structuredClone(before);
  assert.deepEqual(retainedStatus(before, after), { dataAndNativeParity: true, retainedSessions: 1, mcpParity: true, mcpDifferences: [] });
});

test('missing external MCP remains an explicit failed MCP verdict, never full parity', () => {
  const before = fixture(), after = structuredClone(before);
  after.sessions[0].agents[0].tools = ['read'];
  const result = retainedStatus(before, after);
  assert.equal(result.dataAndNativeParity, true);
  assert.equal(result.mcpParity, false);
  assert.deepEqual(result.mcpDifferences, [{ sessionId: 'fixture', conversationId: 1, servers: ['langfuse'], missingTools: 1 }]);
  assert.throws(() => retained(before, after), /Previously offered tool missing/, 'original full-parity guard is unchanged');
});

test('missing native tools still prevent activation', () => {
  const before = fixture(), after = structuredClone(before);
  after.sessions[0].agents[0].tools = ['mcp__langfuse__read'];
  assert.throws(() => retainedStatus(before, after), /Previously offered tool missing/);
});

for (const kind of ['configuration', 'history', 'session', 'conversation']) test(`${kind} loss still prevents activation`, () => {
  const before = fixture(), after = structuredClone(before);
  if (kind === 'configuration') after.sessions[0].agents[0].config.model.modelId = 'wrong';
  if (kind === 'history') delete after.sessions[0].agents[0].entries[1];
  if (kind === 'session') after.sessions = [];
  if (kind === 'conversation') after.sessions[0].agents = [];
  assert.throws(() => retainedStatus(before, after));
});
