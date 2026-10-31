// No-network fixture for the actual integrated TUI. Evidence contains only fixture values.
import { appendFileSync } from 'node:fs';
const { runDurableTui }: typeof import('../src/ui/experimental/durable/tui.js') = await import(
  process.env.MODEL_SWITCH_TUI_ENTRY ?? '../src/ui/experimental/durable/tui.js');
import type { DurableView } from '../src/types.js';
const evidence = process.env.MODEL_SWITCH_PROBE_LOG!;
const listeners = new Set<() => void>();
const snapshot: DurableView = {
  session: { id: 'fixture', directory: process.env.HOME!, cwd: process.cwd(), name: 'Skill fixture' },
  conversation: { conversation: { id: 1 }, entries: [], docs: { 'pi.agent': { model: { provider: 'p', modelId: 'a' } } } },
  conversations: [{ id: 1, label: 'main' }], models: [
    { provider: 'p', modelId: 'a', name: 'A', contextWindow: 10000 }, { provider: 'p', modelId: 'b', name: 'B', contextWindow: 10000 }], notices: [],
  skills: [{ name: 'alpha', description: 'Alpha fixture', filePath: '/fixture/alpha/SKILL.md', baseDir: '/fixture/alpha' },
    { name: 'beta', description: 'Beta fixture', filePath: '/fixture/beta/SKILL.md', baseDir: '/fixture/beta' }],
  automation: { scheduled: 0, failed: 0 }, connection: 'online',
};
const noop = async () => {};
const log = (value: object) => appendFileSync(evidence, JSON.stringify(value) + '\n');
const ready = setTimeout(() => log({ ready: true }), 700);
try {
  await runDurableTui({ current: () => snapshot, subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); } }, {
    submit: async text => { log({ submitted: text }); }, compact: noop, abort: noop, reload: noop, cycleThinking: noop,
    setModel: async model => { snapshot.conversation.docs['pi.agent'] = { model }; log({ model }); for (const listener of listeners) listener(); },
    toggleTasks: noop, switchConversation: noop, listSessions: async () => [], renameSession: async name => name,
  }, {
    getTerminalCapabilityOverrides: () => ({}), getEnableSkillCommands: () => true,
    getAutocompleteMaxVisible: () => 10, getThemeSetting: () => undefined,
  });
  log({ exited: true });
} finally { clearTimeout(ready); }
