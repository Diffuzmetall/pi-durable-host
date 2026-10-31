// ../../.pi/agent/npm/node_modules/@nicknisi/pi-model-switch/dist/config.js
import { randomUUID } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join as join2 } from "node:path";

// durable:agent-dir
import { homedir } from "node:os";
import { join } from "node:path";
var getAgentDir = () => process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent");

// ../../.pi/agent/npm/node_modules/@nicknisi/pi-model-switch/dist/config.js
var DEFAULT_MODEL_CYCLE_KEYBINDINGS = {
  forward: "ctrl+shift+m",
  backward: "ctrl+shift+alt+m",
  select: "ctrl+shift+l"
};
var FORWARD_KEYBINDING = "model-switch.cycleForward";
var BACKWARD_KEYBINDING = "model-switch.cycleBackward";
var SELECT_KEYBINDING = "model-switch.select";
function modelCycleConfigPath() {
  return join2(getAgentDir(), "configs", "model-switch.json");
}
function modelCycleKeybindingsPath() {
  return join2(getAgentDir(), "keybindings.json");
}
function loadModelSwitchKeybindings(path = modelCycleKeybindingsPath()) {
  if (!existsSync(path))
    return { ...DEFAULT_MODEL_CYCLE_KEYBINDINGS };
  let value;
  try {
    value = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return { ...DEFAULT_MODEL_CYCLE_KEYBINDINGS };
  }
  if (!value || typeof value !== "object")
    return { ...DEFAULT_MODEL_CYCLE_KEYBINDINGS };
  const bindings = value;
  const forward = bindings[FORWARD_KEYBINDING];
  const backward = bindings[BACKWARD_KEYBINDING];
  const select = bindings[SELECT_KEYBINDING];
  return {
    forward: typeof forward === "string" && forward.trim().length > 0 ? forward.trim() : DEFAULT_MODEL_CYCLE_KEYBINDINGS.forward,
    backward: typeof backward === "string" && backward.trim().length > 0 ? backward.trim() : DEFAULT_MODEL_CYCLE_KEYBINDINGS.backward,
    select: typeof select === "string" && select.trim().length > 0 ? select.trim() : DEFAULT_MODEL_CYCLE_KEYBINDINGS.select
  };
}
function validateModelStrings(raw, path, context) {
  if (!Array.isArray(raw)) {
    return { error: `Invalid model-switch config at ${path}: expected "${context}" to be a string[]` };
  }
  if (raw.some((model) => typeof model !== "string" || model.trim().length === 0)) {
    return { error: `Invalid model-switch config at ${path}: every model in "${context}" must be a non-empty string` };
  }
  return raw.map((model) => model.trim());
}
function loadModelSwitchConfig(path = modelCycleConfigPath()) {
  if (!existsSync(path)) {
    return { ok: true, config: { sections: [] } };
  }
  let value;
  try {
    value = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `Invalid model-switch config at ${path}: ${message}` };
  }
  return parseModelSwitchConfig(value, path);
}
function parseModelSwitchConfig(value, path) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: `Invalid model-switch config at ${path}: expected an object` };
  }
  const obj = value;
  if ("sections" in obj) {
    if (!obj.sections || typeof obj.sections !== "object" || Array.isArray(obj.sections)) {
      return { ok: false, error: `Invalid model-switch config at ${path}: expected "sections" to be an object` };
    }
    const sectionsRaw = obj.sections;
    const sections = [];
    for (const [name, modelsRaw] of Object.entries(sectionsRaw)) {
      const result = validateModelStrings(modelsRaw, path, `sections.${name}`);
      if (!Array.isArray(result))
        return { ok: false, error: result.error };
      sections.push({ name, models: result });
    }
    if (sections.length === 0) {
      return {
        ok: false,
        error: `Invalid model-switch config at ${path}: "sections" must define at least one section`
      };
    }
    return { ok: true, config: { sections } };
  }
  if ("models" in obj) {
    const result = validateModelStrings(obj.models, path, "models");
    if (!Array.isArray(result))
      return { ok: false, error: result.error };
    return { ok: true, config: { sections: [{ name: "models", models: result }] } };
  }
  return {
    ok: false,
    error: `Invalid model-switch config at ${path}: expected { "sections": { ... } } or { "models": [...] }`
  };
}
function addModelToSection(reference, sectionName, path = modelCycleConfigPath()) {
  try {
    const existing = lstatSync(path, { throwIfNoEntry: false });
    const target = existing ? realpathSync(path) : path;
    const value = existing ? JSON.parse(readFileSync(target, "utf8")) : { sections: { [sectionName]: [] } };
    const loaded = parseModelSwitchConfig(value, path);
    if (!loaded.ok)
      return loaded;
    const section = loaded.config.sections.find((item) => item.name === sectionName);
    if (!section) {
      return { ok: false, error: `Section "${sectionName}" no longer exists in ${path}` };
    }
    if (section.models.includes(reference))
      return { ok: true, added: false };
    const models = "sections" in value ? value.sections[sectionName] : value.models;
    models.push(reference);
    mkdirSync(dirname(target), { recursive: true });
    const temporaryPath = `${target}.${randomUUID()}.tmp`;
    try {
      writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}
`, {
        flag: "wx",
        mode: existing ? statSync(target).mode & 511 : 384
      });
      renameSync(temporaryPath, target);
    } finally {
      rmSync(temporaryPath, { force: true });
    }
    return { ok: true, added: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `Could not update model-switch config at ${path}: ${message}` };
  }
}

// ../../.pi/agent/npm/node_modules/@nicknisi/pi-model-switch/dist/cycle.js
function parseModelReference(value) {
  const separator = value.indexOf("/");
  if (separator <= 0 || separator === value.length - 1)
    return void 0;
  return {
    provider: value.slice(0, separator),
    modelId: value.slice(separator + 1)
  };
}
async function resolveAvailableModels(references, registry) {
  const available = [];
  for (const value of references) {
    const reference = parseModelReference(value);
    if (!reference)
      continue;
    const model = registry.find(reference.provider, reference.modelId);
    if (!model)
      continue;
    const auth = await registry.getApiKeyAndHeaders(model);
    if (auth.ok)
      available.push(model);
  }
  return available;
}
function findActiveSection(sections, current) {
  if (sections.length === 0)
    return void 0;
  if (!current)
    return sections[0];
  const found = sections.find((section) => section.models.some((value) => {
    const ref = parseModelReference(value);
    return ref?.provider === current.provider && ref?.modelId === current.id;
  }));
  return found ?? sections[0];
}
function selectCycleTarget(current, available, direction) {
  if (available.length === 0)
    return void 0;
  const currentIndex = current ? available.findIndex((model) => model.provider === current.provider && model.id === current.id) : -1;
  if (currentIndex === -1) {
    return direction === "forward" ? available[0] : available[available.length - 1];
  }
  const offset = direction === "forward" ? 1 : -1;
  const nextIndex = (currentIndex + offset + available.length) % available.length;
  return available[nextIndex];
}

// ../../.pi/agent/npm/node_modules/@nicknisi/pi-model-switch/dist/section-picker.js
import { Container, Input, SelectList, Text, getKeybindings, matchesKey } from "@earendil-works/pi-tui";
var SectionPicker = class {
  sections;
  theme;
  done;
  container = new Container();
  tabBar = new Text("", 0, 0);
  searchInput = new Input();
  selectList;
  activeSectionIndex = 0;
  selectTheme;
  constructor(sections, theme, done) {
    this.sections = sections;
    this.theme = theme;
    this.done = done;
    this.selectTheme = {
      selectedPrefix: (text) => theme.fg("accent", text),
      selectedText: (text) => theme.fg("accent", text),
      description: (text) => theme.fg("muted", text),
      scrollInfo: (text) => theme.fg("dim", text),
      noMatch: (text) => theme.fg("warning", text)
    };
    this.selectList = new SelectList(sections[0]?.items ?? [], 10, this.selectTheme);
    this.wireSelectList();
    this.container.addChild(this.tabBar);
    this.container.addChild(this.searchInput);
    this.container.addChild(this.selectList);
    this.renderTabBar();
  }
  renderTabBar() {
    const parts = this.sections.map((section, index) => {
      const label = section.name;
      return index === this.activeSectionIndex ? this.theme.fg("accent", this.theme.bold(`[${label}]`)) : this.theme.fg("dim", ` ${label} `);
    });
    this.tabBar.setText(parts.join(""));
  }
  wireSelectList() {
    this.selectList.onSelect = (item) => this.done(item.value);
    this.selectList.onCancel = () => this.done(null);
  }
  switchSection(direction) {
    this.activeSectionIndex = (this.activeSectionIndex + direction + this.sections.length) % this.sections.length;
    this.searchInput.setValue("");
    this.rebuildList();
  }
  filteredItems() {
    const query = this.searchInput.getValue().trim().toLowerCase();
    if (query.length === 0)
      return this.sections[this.activeSectionIndex]?.items ?? [];
    const seen = /* @__PURE__ */ new Set();
    const matches = [];
    for (const section of this.sections) {
      for (const item of section.items) {
        if (seen.has(item.value) || !item.value.toLowerCase().includes(query))
          continue;
        seen.add(item.value);
        matches.push({ ...item, description: section.name });
      }
    }
    return matches;
  }
  rebuildList() {
    this.selectList = new SelectList(this.filteredItems(), 10, this.selectTheme, {
      minPrimaryColumnWidth: 1,
      maxPrimaryColumnWidth: Number.MAX_SAFE_INTEGER
    });
    this.wireSelectList();
    this.container.clear();
    this.container.addChild(this.tabBar);
    this.container.addChild(this.searchInput);
    this.container.addChild(this.selectList);
    this.renderTabBar();
  }
  render(width) {
    return this.container.render(width);
  }
  invalidate() {
    this.container.invalidate();
  }
  handleInput(data) {
    if (matchesKey(data, "tab")) {
      this.switchSection(1);
      return;
    }
    const kb = getKeybindings();
    if (kb.matches(data, "tui.select.up") || kb.matches(data, "tui.select.down") || kb.matches(data, "tui.select.confirm") || kb.matches(data, "tui.select.cancel")) {
      this.selectList.handleInput(data);
    } else {
      this.searchInput.handleInput(data);
      this.rebuildList();
    }
  }
};

// ../../.pi/agent/npm/node_modules/@nicknisi/pi-model-switch/dist/index.js
async function resolveSectionModels(references, ctx) {
  return resolveAvailableModels(references, ctx.modelRegistry);
}
async function switchModel(pi, ctx, target) {
  if (!await pi.setModel(target)) {
    ctx.ui.notify(`Could not switch to ${target.provider}/${target.id}`, "warning");
  }
}
async function cycleConfiguredModel(pi, ctx, direction) {
  const loaded = loadModelSwitchConfig();
  if (!loaded.ok) {
    ctx.ui.notify(loaded.error, "warning");
    return;
  }
  const activeSection = findActiveSection(loaded.config.sections, ctx.model);
  if (!activeSection) {
    ctx.ui.notify(`No configured models are available in ${modelCycleConfigPath()}`, "warning");
    return;
  }
  const available = await resolveSectionModels(activeSection.models, ctx);
  if (available.length === 0) {
    ctx.ui.notify(`No usable models in section "${activeSection.name}" (${modelCycleConfigPath()})`, "warning");
    return;
  }
  const target = selectCycleTarget(ctx.model, available, direction);
  if (target)
    await switchModel(pi, ctx, target);
}
function buildSectionItems(models, current) {
  return models.map((model) => {
    const isCurrent = model.provider === current?.provider && model.id === current.id;
    return {
      value: `${model.provider}/${model.id}`,
      label: `${isCurrent ? "\u25CF" : " "} ${model.provider}/${model.id}`
    };
  });
}
async function showModelPicker(pi, ctx) {
  if (!ctx.hasUI)
    return;
  const loaded = loadModelSwitchConfig();
  if (!loaded.ok) {
    ctx.ui.notify(loaded.error, "warning");
    return;
  }
  const pickerSections = [];
  const modelByReference = /* @__PURE__ */ new Map();
  for (const section of loaded.config.sections) {
    const available = await resolveSectionModels(section.models, ctx);
    if (available.length > 0) {
      pickerSections.push({
        name: section.name,
        items: buildSectionItems(available, ctx.model)
      });
      for (const model of available) {
        modelByReference.set(`${model.provider}/${model.id}`, model);
      }
    }
  }
  if (pickerSections.length === 0) {
    ctx.ui.notify(`No configured models are available in ${modelCycleConfigPath()}`, "warning");
    return;
  }
  const selected = await ctx.ui.custom((tui, theme, _keybindings, done) => {
    return new SectionPicker(pickerSections, theme, done);
  });
  if (!selected)
    return;
  const target = modelByReference.get(selected);
  if (target)
    await switchModel(pi, ctx, target);
}
async function addConfiguredModel(ctx, useCurrent) {
  if (!ctx.hasUI)
    return;
  if (!useCurrent && ctx.mode !== "tui") {
    ctx.ui.notify("/model-switch add requires the terminal UI", "warning");
    return;
  }
  const loaded = loadModelSwitchConfig();
  if (!loaded.ok) {
    ctx.ui.notify(loaded.error, "warning");
    return;
  }
  let target = ctx.model;
  if (!useCurrent) {
    const available = ctx.modelRegistry.getAvailable();
    if (available.length === 0) {
      ctx.ui.notify("No available models to add. Configure a provider with /login first.", "warning");
      return;
    }
    const selected = await ctx.ui.custom((_tui, theme, _keybindings, done) => {
      return new SectionPicker([{ name: "Add a model", items: buildSectionItems(available, ctx.model) }], theme, done);
    });
    if (!selected)
      return;
    target = available.find((model) => `${model.provider}/${model.id}` === selected);
  }
  if (!target) {
    ctx.ui.notify("No model selected to add", "warning");
    return;
  }
  const reference = `${target.provider}/${target.id}`;
  const sections = loaded.config.sections.map((section) => section.name);
  const sectionName = sections.length > 0 ? await ctx.ui.select(`Add ${reference} to section`, sections) : (await ctx.ui.input("Name your first model-switch section", "models"))?.trim();
  if (sectionName === void 0)
    return;
  if (sections.length === 0 && !sectionName) {
    ctx.ui.notify("Section name must not be empty", "warning");
    return;
  }
  const result = addModelToSection(reference, sectionName);
  if (!result.ok) {
    ctx.ui.notify(result.error, "warning");
    return;
  }
  ctx.ui.notify(result.added ? `Added ${reference} to "${sectionName}"` : `${reference} is already in "${sectionName}"`, "info");
}
function modelCycle(pi) {
  const keybindings = loadModelSwitchKeybindings();
  pi.registerShortcut(keybindings.forward, {
    description: "Cycle configured models forward",
    handler: async (ctx) => cycleConfiguredModel(pi, ctx, "forward")
  });
  pi.registerShortcut(keybindings.backward, {
    description: "Cycle configured models backward",
    handler: async (ctx) => cycleConfiguredModel(pi, ctx, "backward")
  });
  pi.registerShortcut(keybindings.select, {
    description: "Select a configured model",
    handler: async (ctx) => showModelPicker(pi, ctx)
  });
  pi.registerCommand("model-switch", {
    description: "Select configured models, add a model, or add-current",
    getArgumentCompletions: (prefix) => {
      const items = [
        { value: "add", label: "add", description: "Pick an available model to save" },
        { value: "add-current", label: "add-current", description: "Save the current model" }
      ].filter((item) => item.value.startsWith(prefix));
      return items.length > 0 ? items : null;
    },
    handler: async (args, ctx) => {
      switch (args.trim()) {
        case "":
          return showModelPicker(pi, ctx);
        case "add":
          return addConfiguredModel(ctx, false);
        case "add-current":
          return addConfiguredModel(ctx, true);
        default:
          ctx.ui.notify("Usage: /model-switch [add | add-current]", "warning");
      }
    }
  });
}
export {
  modelCycle as default
};
