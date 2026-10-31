// Disposable, no-network fixture exercising the REAL DurableTui and ProcessTerminal.
import { Text } from "@earendil-works/pi-tui";
import { initTheme } from "../src/ui/modes/interactive/theme/theme.ts";
import { DurableTui, runDurableTui } from "../src/ui/experimental/durable/tui.ts";
import type { DurableView, EntryRecord } from "../src/types.js";

initTheme();
const view: DurableView = {
  session: { id: "fixture", directory: process.env.HOME!, cwd: process.cwd(), name: "OSC fixture" },
  conversation: { conversation: { id: 1 }, entries: [], docs: {} },
  conversations: [{ id: 1, label: "main" }], models: [], notices: [],
  automation: { scheduled: 0, failed: 0 }, connection: "online",
};
const failureMode = process.argv.find(arg => ["--failure", "--late-failure", "--published-failure", "--setup-failure", "--subscribe-failure", "--unsubscribe-failure"].includes(arg));
if (failureMode) {
  const failure = Error("fixture-apply-failure");
  if (failureMode === "--failure") {
    Object.defineProperty(view.conversation, "docs", { get() { throw failure; } });
  }
  if (failureMode === "--published-failure" || failureMode === "--unsubscribe-failure") {
    Object.defineProperty(view, "automation", { get() { throw failure; } });
  }
  let unsubscribed = false;
  const noop = async () => {};
  try {
    await runDurableTui({ current: () => view, subscribe(listener) {
      if (failureMode === "--subscribe-failure") throw failure;
      const timer = failureMode === "--late-failure" ? setTimeout(() => {
        view.conversation.docs["pi.live"] = { run: { inputs: [] } };
        Object.defineProperty(view, "automation", { get() { throw failure; } });
        listener();
        listener(); // A source may already have another notification queued after the first fault.
      }, 500) : undefined;
      return () => {
        unsubscribed = true;
        clearTimeout(timer);
        if (failureMode === "--unsubscribe-failure") throw failure;
      };
    } }, {
      submit: noop, compact: noop, abort: noop, reload: noop, cycleThinking: noop,
      setModel: noop, toggleTasks: noop, switchConversation: noop,
      listSessions: async () => [], renameSession: async name => name,
    }, {
      getTerminalCapabilityOverrides: () => ({}), getEnableSkillCommands: () => {
        if (failureMode === "--setup-failure") throw failure;
        return true;
      },
      getAutocompleteMaxVisible: () => 10, getThemeSetting: () => undefined,
    });
    throw Error("Expected UI apply failure");
  } catch (error) {
    if (error !== failure) throw error;
    if (failureMode !== "--setup-failure" && failureMode !== "--subscribe-failure" && !unsubscribed) {
      throw Error("Source subscription was not released");
    }
    console.log("CLEANUP_FAILURE_CAUGHT");
  }
} else {
const ui = new DurableTui(process.cwd(), process.env.HOME!, {
  submit() {}, followUp() {}, abort() {}, openAgent() {}, selectModel() {}, cycleThinking() {},
});
const pause = () => new Promise(resolve => setTimeout(resolve, 180));
const answer = (stopReason: string): EntryRecord => ({ id: 1, conversationId: 1, kind: "pi.assistant", model: [{
  role: "assistant", provider: "faux", model: "echo", stopReason,
  content: [{ type: "text", text: "PRIVATE_ANSWER" }], errorMessage: stopReason === "error" ? "Fixture failure" : undefined,
  usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
}] });
try {
  ui.start();
  // Let ProcessTerminal finish its support query before sending any state transitions.
  await pause(); await pause();
  ui.apply(view); await pause();
  view.conversation.docs["pi.live"] = { run: { inputs: [] } };
  ui.apply(view); await pause();
  ui.mount(new Text("Select model"), "Select model"); await pause();
  ui.restoreEditor(); await pause();
  view.conversation.docs["pi.live"] = {}; view.conversation.entries = [answer("stop")];
  ui.apply(view); await pause();
  view.conversation.entries = [answer("error")]; ui.apply(view); await pause();
  view.conversation.entries = [answer("aborted")]; ui.apply(view); await pause();
} finally {
  ui.stop();
}
}
