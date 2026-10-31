/** Load the bundled upstream extension; do not start a Pi agent or own model auth. */
export async function loadModelSwitch() {
  return (await import('./upstream.mjs')).default;
}

/** Only the Pi extension methods actually used by model-switch 0.3.0. */
export function createModelSwitch(extension, { snapshot, setModel, ui, matchesKey }) {
  const commands = new Map();
  const shortcuts = new Map();
  let active;

  const register = () => extension({
    registerCommand: (name, command) => commands.set(name, command),
    registerShortcut: (key, shortcut) => shortcuts.set(key, shortcut),
    async setModel(target) {
      // A picker belongs to the conversation that opened it, not a later selection.
      if (!active || snapshot().conversationId !== active.conversationId) {
        ui.notify('Conversation changed; no model was switched.', 'warning');
        return false;
      }
      // Remote configuration must reject on refusal; the host remains the authority.
      await setModel({ provider: target.provider, modelId: target.id });
      return true;
    },
  });
  register();

  async function invoke(handler, args) {
    if (active) { ui.notify('Model switch is already open.', 'warning'); return; }
    const state = snapshot();
    const models = state.models.filter(model => model.available !== false)
      .map(model => ({ ...model, id: model.modelId }));
    active = { conversationId: state.conversationId };
    const find = (provider, id) => models.find(model => model.provider === provider && model.id === id);
    const ctx = {
      hasUI: true,
      mode: 'tui',
      model: state.model && { ...state.model, id: state.model.modelId },
      ui,
      modelRegistry: {
        find,
        getAvailable: () => models,
        // Availability is host-scoped; never load credentials or a global catalogue here.
        getApiKeyAndHeaders: async model => ({ ok: !!find(model.provider, model.id) }),
      },
    };
    try { await handler(args, ctx); }
    catch (error) { ui.notify(`Model switch failed: ${error instanceof Error ? error.message : String(error)}`, 'warning'); }
    finally { active = undefined; }
  }

  return {
    commands: [...commands].map(([name, command]) => ({ name, description: command.description, getArgumentCompletions: command.getArgumentCompletions })),
    command(text) {
      const match = /^\/([^\s]+)(?:\s+([\s\S]*))?$/.exec(text);
      const command = match && commands.get(match[1]);
      if (!command) return false;
      void invoke(command.handler, match[2] ?? '');
      return true;
    },
    shortcut(data) {
      // Upstream reads keybindings on registration; re-register without reloading the runtime.
      shortcuts.clear();
      register();
      for (const [key, shortcut] of shortcuts) {
        if (!matchesKey(data, key)) continue;
        void invoke((_args, ctx) => shortcut.handler(ctx), '');
        return true;
      }
      return false;
    },
  };
}
