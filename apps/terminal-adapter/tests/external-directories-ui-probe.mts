// Real TUI, synthetic view only: no backend, models or personal configuration.
import { appendFileSync } from 'node:fs';
import { runDurableTui } from '../src/ui/experimental/durable/tui.js';
import type { DurableView } from '../src/types.js';
const log = (event: object) => appendFileSync(process.env.DIRECTORY_UI_LOG!, JSON.stringify(event) + '\n');
const listeners = new Set<() => void>();
const snapshot: DurableView = {
  session: { id: 'directory-fixture', directory: process.env.HOME!, cwd: '/fixture', name: 'Directory fixture' },
  conversation: { conversation: { id: 1 }, entries: [], docs: { 'pi.agent': { model: { provider: 'fixture', modelId: 'none' } } } },
  conversations: [{ id: 1, label: 'main' }], models: [], notices: [],
  externalDirectories: ['pi-durable-host', 'pi-durable-delm', 'delm-runs'].map(label => ({ label, absolutePath: `/fixture/${label}` })),
  automation: { scheduled: 0, failed: 0 }, connection: 'online',
};
const noop = async () => {};
const timer = setTimeout(() => log({ ready: true }), 700);
try {
  await runDurableTui({ current: () => snapshot, subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); } }, {
    submit: async text => { log({ submitted: text }); },
    compact: noop, abort: noop, reload: noop, cycleThinking: noop, setModel: noop,
    toggleTasks: noop, switchConversation: noop, listSessions: async () => [], renameSession: async name => name,
  }, {
    getTerminalCapabilityOverrides: () => ({}), getEnableSkillCommands: () => true,
    getAutocompleteMaxVisible: () => 10, getThemeSetting: () => undefined,
  });
  log({ exited: true });
} finally { clearTimeout(timer); }
