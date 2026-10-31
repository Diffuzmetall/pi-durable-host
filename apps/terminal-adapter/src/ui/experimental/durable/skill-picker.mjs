// ../../.pi/agent/npm/node_modules/@ramarivera/pi-skill-selector/src/index.ts
import {
  fuzzyFilter,
  Input,
  decodeKittyPrintable,
  deleteAllKittyImages,
  deleteKittyImage,
  Key,
  matchesKey,
  truncateToWidth,
  visibleWidth
} from "@earendil-works/pi-tui";
var MAX_VISIBLE_SKILLS = 8;
var PANEL_MIN_WIDTH = 44;
var PANEL_MAX_WIDTH = 58;
function fitVisible(text, width) {
  return truncateToWidth(text, Math.max(width, 0), "\u2026");
}
function parseTruecolorBg(ansi) {
  const match = ansi?.match(/\u001b\[48;2;(\d+);(\d+);(\d+)m/);
  if (!match) return null;
  return { r: Number(match[1]), g: Number(match[2]), b: Number(match[3]) };
}
function luminance(color) {
  return (0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b) / 255;
}
function mixRgb(from, to, amount) {
  return {
    r: Math.round(from.r + (to.r - from.r) * amount),
    g: Math.round(from.g + (to.g - from.g) * amount),
    b: Math.round(from.b + (to.b - from.b) * amount)
  };
}
function truecolorFg(color, text) {
  return `\x1B[38;2;${color.r};${color.g};${color.b}m${text}\x1B[39m`;
}
function safeBg(theme, color, text) {
  try {
    return theme.bg?.(color, text) ?? text;
  } catch {
    return text;
  }
}
function cardBorderStyle(theme, surface) {
  const surfaceRgb = theme.getColorMode?.() === "truecolor" ? parseTruecolorBg(theme.getBgAnsi?.(surface)) : null;
  if (!surfaceRgb) return (text) => theme.fg("border", text);
  const target = luminance(surfaceRgb) > 0.55 ? { r: 0, g: 0, b: 0 } : { r: 255, g: 255, b: 255 };
  const border = mixRgb(surfaceRgb, target, 0.45);
  return (text) => truecolorFg(border, text);
}
function panelBorderLine(left, label, right, width, styleBorder, styleLabel) {
  const safeLabel = fitVisible(label, Math.max(width - 6, 0));
  if (!safeLabel) return styleBorder(`${left}${"\u2500".repeat(Math.max(width - 2, 0))}${right}`);
  const prefix = `${left}\u2500 `;
  const suffixStart = " ";
  const fillWidth = Math.max(width - visibleWidth(prefix) - visibleWidth(safeLabel) - visibleWidth(suffixStart) - visibleWidth(right), 0);
  const suffix = `${suffixStart}${"\u2500".repeat(fillWidth)}${right}`;
  return `${styleBorder(prefix)}${styleLabel(safeLabel)}${styleBorder(suffix)}`;
}
function panelRow(content, width, styleBorder, styleContent) {
  const innerWidth = Math.max(width - 4, 0);
  const visible = truncateToWidth(content, innerWidth, "\u2026");
  const padding = " ".repeat(Math.max(innerWidth - visibleWidth(visible), 0));
  return `${styleBorder("\u2502 ")}${styleContent(visible)}${padding}${styleBorder(" \u2502")}`;
}
function formatSkillPickerPanel(options) {
  const width = Math.max(Math.floor(options.width), PANEL_MIN_WIDTH);
  const rows = [
    panelBorderLine("\u256D", options.title, "\u256E", width, options.styleAccentBorder, options.styleTitle),
    panelRow(options.subtitle, width, options.styleBorder, options.styleMuted),
    panelBorderLine("\u251C", "", "\u2524", width, options.styleBorder, options.styleBorder),
    ...options.body.map((line) => panelRow(line, width, options.styleBorder, (text) => text)),
    panelBorderLine("\u2570", options.footer, "\u256F", width, options.styleAccentBorder, options.styleMuted)
  ];
  return rows.map(options.styleSurface);
}
function filterSkills(skills, query) {
  return fuzzyFilter(skills, query, (skill) => `${skill.name} ${skill.description}`);
}
function skillPromptInsertion(skillName) {
  return `/skill:${skillName} `;
}
function isSkillPickerConfirmKey(data) {
  return matchesKey(data, Key.enter) || matchesKey(data, Key.tab);
}
function clamp(value, min, max) {
  return Math.max(min, Math.min(value, max));
}
function padVisible(text, width) {
  return `${text}${" ".repeat(Math.max(width - visibleWidth(text), 0))}`;
}
function formatSkillRow(skill, width, selected, theme) {
  const prefix = selected ? theme.fg("accent", "\u203A ") : "  ";
  const nameWidth = Math.max(width - visibleWidth(prefix), 1);
  const rawName = fitVisible(skill.name, nameWidth);
  const name = selected ? theme.fg("accent", theme.bold(rawName)) : rawName;
  const row = padVisible(`${prefix}${name}`, width);
  return selected && theme.bg ? theme.bg("selectedBg", row) : row;
}
function formatSelectedSkillDescription(skill, width, theme) {
  if (!skill) return [];
  const description = skill.description || skill.source;
  return ["", theme.fg("dim", fitVisible(description, width))];
}
function formatSkillRows(skills, selectedIndex, width, theme) {
  if (skills.length === 0) {
    return [theme.fg("warning", "  No matching skills")];
  }
  const visibleCount = Math.min(skills.length, MAX_VISIBLE_SKILLS);
  const normalizedSelectedIndex = clamp(selectedIndex, 0, skills.length - 1);
  const startIndex = clamp(normalizedSelectedIndex - Math.floor(visibleCount / 2), 0, Math.max(skills.length - visibleCount, 0));
  const endIndex = Math.min(startIndex + visibleCount, skills.length);
  const rows = skills.slice(startIndex, endIndex).map((skill, offset) => {
    const index = startIndex + offset;
    return formatSkillRow(skill, width, index === normalizedSelectedIndex, theme);
  });
  if (skills.length > visibleCount) {
    rows.push(theme.fg("dim", `  ${normalizedSelectedIndex + 1}/${skills.length}`));
  }
  rows.push(...formatSelectedSkillDescription(skills[normalizedSelectedIndex], width, theme));
  return rows;
}
var SkillPickerComponent = class {
  constructor(skills, initialQuery, theme, done) {
    this.skills = skills;
    this.theme = theme;
    this.done = done;
    this.query = initialQuery;
    this.input.setValue(initialQuery);
    this.filtered = filterSkills(skills, initialQuery);
  }
  skills;
  theme;
  done;
  input = new Input();
  query;
  filtered;
  selectedIndex = 0;
  _focused = false;
  get focused() {
    return this._focused;
  }
  set focused(value) {
    this._focused = value;
    this.input.focused = value;
  }
  render(width) {
    const panelWidth = clamp(Math.floor(width), PANEL_MIN_WIDTH, PANEL_MAX_WIDTH);
    const bodyWidth = Math.max(panelWidth - 4, 1);
    const queryLabel = this.query ? `matching "${this.query}"` : "type to filter";
    const body = [
      this.theme.fg("dim", "Search"),
      ...this.input.render(bodyWidth),
      "",
      ...formatSkillRows(this.filtered, this.selectedIndex, bodyWidth, this.theme)
    ].map((line) => truncateToWidth(line, bodyWidth, ""));
    const cardSurface = "toolPendingBg";
    const styleCardBorder = cardBorderStyle(this.theme, cardSurface);
    return formatSkillPickerPanel({
      width: panelWidth,
      title: "Skills",
      subtitle: `${this.filtered.length}/${this.skills.length} \xB7 ${queryLabel}`,
      body,
      footer: "tab/enter select \xB7 \u2191\u2193 move \xB7 esc",
      styleSurface: (text) => safeBg(this.theme, cardSurface, text),
      styleBorder: styleCardBorder,
      styleAccentBorder: styleCardBorder,
      styleTitle: (text) => this.theme.fg("accent", this.theme.bold(text)),
      styleMuted: (text) => this.theme.fg("muted", text)
    });
  }
  handleInput(data) {
    if (matchesKey(data, Key.escape)) {
      this.done(null);
      return;
    }
    if (matchesKey(data, Key.up)) {
      this.moveSelection(-1);
      return;
    }
    if (matchesKey(data, Key.down)) {
      this.moveSelection(1);
      return;
    }
    if (isSkillPickerConfirmKey(data)) {
      this.selectCurrentSkill();
      return;
    }
    this.input.handleInput(data);
    const nextQuery = this.input.getValue();
    if (nextQuery !== this.query) {
      this.query = nextQuery;
      this.filtered = filterSkills(this.skills, this.query);
      this.selectedIndex = 0;
    }
  }
  invalidate() {
    this.input.invalidate();
  }
  moveSelection(delta) {
    if (this.filtered.length === 0) return;
    this.selectedIndex = (this.selectedIndex + delta + this.filtered.length) % this.filtered.length;
  }
  selectCurrentSkill() {
    const skill = this.filtered[this.selectedIndex];
    if (skill) this.done(skill.name);
  }
};
function getDollarShortcutQuery(data) {
  if (data.startsWith("$")) return data.slice(1);
  return decodeKittyPrintable(data) === "$" ? "" : null;
}
export {
  SkillPickerComponent,
  getDollarShortcutQuery,
  skillPromptInsertion
};
