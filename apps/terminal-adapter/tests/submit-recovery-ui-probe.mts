// Actual editor fixture. No backend, models, credentials or production state.
import { appendFileSync } from 'node:fs';
import { runDurableTui } from '../src/ui/experimental/durable/tui.js';
import { SubmitDeliveryError, type DurableView } from '../src/types.js';
const log = (value: object) => appendFileSync(process.env.SUBMIT_RECOVERY_LOG!, JSON.stringify(value) + '\n');
const listeners = new Set<() => void>();
const snapshot: DurableView = {
  session: { id: 'fixture', directory: process.env.HOME!, cwd: process.cwd(), name: 'Recovery fixture' },
  conversation: { conversation: { id: 1 }, entries: [], docs: {} },
  conversations: [{ id: 1, label: 'main' }], models: [], notices: [], skills: [],
  automation: { scheduled: 0, failed: 0 }, connection: 'online', delivery: { uncertainRequestIds: [] },
};
const emit = () => { for (const listener of listeners) listener(); };
const noop = async () => {};
let attempts = 0;
const timers: ReturnType<typeof setTimeout>[] = [];
timers.push(setTimeout(() => log({ ready: true }), 700));
try {
  await runDurableTui({ current: () => snapshot, subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); } }, {
    submit: async text => {
      log({ submitted: text });
      if (++attempts !== 1) return;
      snapshot.delivery = { uncertainRequestIds: ['request-1'] };
      snapshot.connection = 'reconnecting';
      emit();
      timers.push(setTimeout(() => {
        snapshot.connection = 'online';
        emit();
        log({ onlineButUncertain: true });
      }, 800));
      timers.push(setTimeout(() => {
        snapshot.delivery = { uncertainRequestIds: [] };
        emit();
        log({ reconciled: true });
      }, 1800));
      throw new SubmitDeliveryError('fixture', 1, 'request-1');
    }, compact: noop, abort: noop, reload: noop, cycleThinking: noop,
    setModel: noop, toggleTasks: noop, switchConversation: noop, listSessions: async () => [], renameSession: async name => name,
  }, { getTerminalCapabilityOverrides: () => ({}), getEnableSkillCommands: () => true,
    getAutocompleteMaxVisible: () => 10, getThemeSetting: () => undefined });
  log({ exited: true });
} finally { timers.forEach(clearTimeout); }
