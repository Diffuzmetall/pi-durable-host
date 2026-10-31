import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RootDeltas } from '../src/root-deltas.js';
import type { Frame, WireSnapshotEvent, WireAssistantMessage } from 'dpi-sdk/api';

const usage = { input: 1, output: 2, cacheRead: 0, cacheWrite: 0, totalTokens: 3, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
const message = (text: string, stopReason = 'stop'): WireAssistantMessage => ({ role: 'assistant', content: [{ type: 'text', text }], model: 'exact-id', provider: 'faux', usage, stopReason });
const snapshot = (patch: Partial<WireSnapshotEvent> = {}): Frame => ({ type: 'snapshot', inbox: [], snapshot: { type: 'snapshot', entries: [], tools: [], compactions: [], inbox: [], agent: {}, usage: { models: {}, tools: {} }, ...patch } });

test('source BB presentations retain partial/final, exact checkpoint dedup, opaque thinking exclusion and unknown tool fallback', () => {
  const projection = new RootDeltas('/fixture');
  const initial = projection.apply({ type: 'batch', events: [
    { type: 'run_start', inputs: [4] },
    { type: 'message_update', usage, changes: [{ type: 'text_delta', contentIndex: 0, delta: 'part' }] },
    { type: 'tool_execution_start', toolCallId: 'unknown', toolName: 'custom-tool', args: { role: 'assistant', stopReason: 'error', secretShape: { keep: true } } },
    { type: 'tool_execution_update', toolCallId: 'unknown', toolName: 'custom-tool', output: { set: 'first' } },
    { type: 'tool_execution_update', toolCallId: 'unknown', toolName: 'custom-tool', output: { trimStart: 2, append: '-last' } },
    { type: 'tool_execution_end', toolCallId: 'unknown', toolName: 'custom-tool', entry: { id: 8, conversationId: 1, kind: 'pi.tool-result', model: [{ role: 'toolResult', toolCallId: 'unknown', toolName: 'custom-tool', content: [{ type: 'text', text: 'actual-result' }] }] } },
    { type: 'message_end', entry: { id: 9, conversationId: 1, kind: 'pi.assistant', model: [message('final')] } },
    { type: 'run_end', inputs: [4] },
  ] });
  assert.equal(initial.filter(d => d.kind === 'turn.open').length, 1);
  assert.ok(initial.some(d => d.kind === 'item.textDelta' && d.text === 'part'));
  assert.ok(initial.some(d => d.kind === 'item.textClose' && d.text === 'final'));
  assert.ok(initial.some(d => d.kind === 'item.progress' && d.message === 'rst-last'));
  const tool = initial.find(d => d.kind === 'item.open' && (d.key as any)?.providerItemId === 'unknown');
  assert.deepEqual((tool!.item as any).args, { role: 'assistant', stopReason: 'error', secretShape: { keep: true } });
  assert.equal((tool!.item as any).tool, 'custom-tool');
  assert.ok(initial.some(d => d.kind === 'item.close' && d.resultText === 'actual-result'));
  assert.ok(initial.some(d => d.kind === 'turn.boundary' && d.providerCheckpointId === '9' && d.status === 'completed'));
  assert.deepEqual(projection.apply(snapshot({ entries: [{ id: 9, conversationId: 1, kind: 'pi.assistant', model: [message('final')] }] })), []);
  assert.deepEqual(projection.apply(snapshot()), [], 'no run is not success');
  assert.deepEqual(projection.apply(snapshot({ entries: [{ id: 11, conversationId: 1, kind: 'pi.assistant', model: [message('nonterminal', 'toolUse')] }] })).filter(d => d.kind === 'turn.boundary'), []);
  const opaque = projection.apply(snapshot({ generation: { attempt: 1, message: { ...message('visible'), content: [{ type: 'thinking', thinking: 'opaque-signature', redacted: true }, { type: 'text', text: 'visible' }] } } }));
  assert.ok(!JSON.stringify(opaque).includes('opaque-signature'));
  assert.ok(!opaque.some(d => d.kind === 'turn.boundary'));
});

test('reconnect rebuilds active native tool slots and does not turn partial/error into successful completion', () => {
  const projection = new RootDeltas('/fixture');
  const active = projection.apply(snapshot({ run: { inputs: [1] }, tools: [{ callId: 'cmd', name: 'bash', status: 'running', output: 'still-running' }] }));
  assert.ok(active.some(d => d.kind === 'item.open' && (d.item as any).type === 'command'));
  assert.ok(active.some(d => d.kind === 'command.outputSnapshot' && d.text === 'still-running'));
  assert.ok(!active.some(d => d.kind === 'turn.boundary'));
  const failed = projection.apply(snapshot({ entries: [{ id: 20, conversationId: 1, kind: 'pi.assistant', model: [message('error safely projected', 'error')] }] }));
  assert.ok(failed.some(d => d.kind === 'turn.boundary' && d.status === 'failed'));
  const aborted = projection.apply(snapshot({ entries: [{ id: 22, conversationId: 1, kind: 'pi.assistant', model: [message('', 'aborted')] }] }));
  assert.ok(aborted.some(d => d.kind === 'turn.boundary' && d.status === 'interrupted'));
});
