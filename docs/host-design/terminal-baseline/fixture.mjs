// Actual installed TUI, synthetic view/controller only: no Harness, providers, MCP or network.
import { appendFileSync, mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const root = process.env.BASELINE_RELEASE;
const home = process.env.HOME;
if (!root || !home || !process.env.BASELINE_EVENTS) throw Error('Use probe.py with an isolated HOME');
const source = path.join(root, 'host-lane/host/packages/coding-agent/src');
const { runDurableTui } = await import(pathToFileURL(path.join(source, 'experimental/durable/tui.ts')));
const { SettingsManager } = await import(pathToFileURL(path.join(source, 'core/settings-manager.ts')));
const settings = SettingsManager.inMemory({ enableSkillCommands: false });
const cwd = path.join(home, 'workspace');
const directory = path.join(home, 'session');
mkdirSync(cwd, { recursive: true });
mkdirSync(directory, { recursive: true });
const event = (type, data = {}) => appendFileSync(process.env.BASELINE_EVENTS, JSON.stringify({ type, ...data }) + '\n');
const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
const assistant = { role: 'assistant', api: 'faux', provider: 'faux', model: 'baseline-model', timestamp: 0, content: [{ type: 'text', text: 'BASELINE_STREAM' }, { type: 'toolCall', id: 'call-1', name: 'baseline_tool', arguments: { path: 'fixture.txt' } }], usage, stopReason: 'toolUse' };
let shown = 1;
let live = {};
let entries = [];
let expanded = false;
const listeners = new Set();
const current = () => ({
  session: { id: 'baseline', directory, cwd },
  conversation: { conversation: { id: shown }, entries: shown === 1 ? entries : [{ id: 90, kind: 'pi.user', model: [{ role: 'user', content: 'CHILD_TRANSCRIPT', timestamp: 0 }] }], docs: { 'pi.agent': { model: { provider: 'faux', modelId: 'baseline-model' }, thinkingLevel: 'off' }, 'pi.live': shown === 1 ? live : {}, 'pi.inbox': { items: [] } } },
  conversations: [{ id: 1, label: 'main', live }, { id: 2, label: 'baseline child' }],
  models: [{ provider: 'faux', modelId: 'baseline-model', name: 'Baseline', contextWindow: 32000 }],
  notices: [], tasksExpanded: expanded, automation: { scheduled: 0, failed: 0 },
});
const emit = () => { for (const listener of listeners) listener(); };
const controller = {
  async submit(text, whenBusy) {
    event('submit', { text, whenBusy, shown });
    if (/^latency \d+$/.test(text)) {
      const sample = Number(text.slice(8));
      const marker = `LATENCY_RENDER_${String(sample).padStart(3, '0')}`;
      entries = [{ id: 100 + sample, kind: 'pi.assistant', model: [{ ...assistant, content: [{ type: 'text', text: marker }], stopReason: 'stop' }] }];
      live = {};
      event('latency-commit', { marker, committedNs: process.hrtime.bigint().toString() });
      emit();
      return;
    }
    if (!entries.length) {
      entries = [{ id: 1, kind: 'pi.user', model: [{ role: 'user', content: text, timestamp: 0 }] }];
      live = { run: { taskId: 1 }, generation: { message: assistant }, tools: [{ status: 'running', name: 'baseline_tool', callId: 'call-1', output: 'TOOL_PARTIAL_ONE' }] };
    } else live = { ...live, tools: [{ status: 'running', name: 'baseline_tool', callId: 'call-1', output: 'TOOL_PARTIAL_TWO' }] };
    emit();
  },
  async abort() {
    event('abort', { shown });
    entries = [...entries, { id: 2, kind: 'pi.assistant', model: [assistant] }, { id: 3, kind: 'pi.tool-result', model: [{ role: 'toolResult', toolCallId: 'call-1', toolName: 'baseline_tool', content: [{ type: 'text', text: 'TOOL_FINAL' }], isError: false, timestamp: 0 }] }];
    live = {};
    emit();
  },
  async switchConversation(id) { shown = id; event('switch', { id }); emit(); },
  async toggleTasks() { expanded = !expanded; event('tasks', { expanded }); emit(); },
  async setModel(model) { event('model', { model }); },
  async cycleThinking() { event('thinking'); },
  async compact(instructions) { event('compact', { instructions }); },
  async reload(adapter) { event('reload', { adapter }); },
};
const result = await runDurableTui({ current, subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); event('unsubscribe'); }; } }, controller, settings);
event('exit', { result: result ?? 'quit', listeners: listeners.size });
console.log('BASELINE_CLEAN_EXIT');
