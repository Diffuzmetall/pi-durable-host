// Generated from @quandev104/pi-style 0.5.10 (MIT). See NOTICE.md and LICENSE.pi-style.
// Presentation only: no extension coordinator, core patches, tools, editor or footer.

// ../../.pi/agent/npm/node_modules/@quandev104/pi-style/extension-src/pi-style/features/tools/boxed/bash.ts
import { highlightCode as highlightCode2 } from "./syntax.mjs";

// ../../.pi/agent/npm/node_modules/@quandev104/pi-style/extension-src/pi-style/shared/ansi.ts
import { visibleWidth as tuiVisibleWidth } from "@earendil-works/pi-tui";
function isFinal(byte) {
  return byte >= "@" && byte <= "~";
}
function stripAnsi(value) {
  let output = "";
  for (let i = 0; i < value.length; i++) {
    if (value.charCodeAt(i) !== 27) {
      output += value[i];
      continue;
    }
    i++;
    if (value[i] === "[") {
      while (i + 1 < value.length && !isFinal(value[i + 1] ?? "")) i++;
      i++;
    } else if (value[i] === "]") {
      while (i + 1 < value.length && value.charCodeAt(i + 1) !== 7) {
        i++;
        if (value.charCodeAt(i) === 27 && value[i + 1] === "\\") {
          i++;
          break;
        }
      }
      if (i + 1 < value.length && value.charCodeAt(i + 1) === 7) i++;
    }
  }
  return output;
}
var RESET_BACKGROUND = "\x1B[49m";
function isHexColor(value) {
  const cleaned = value.replace("#", "");
  return cleaned.length === 3 ? /^[0-9a-fA-F]{3}$/.test(cleaned) : (cleaned.length === 6 || cleaned.length === 8) && /^[0-9a-fA-F]+$/.test(cleaned);
}
function hexToRgb(hex) {
  const cleaned = hex.replace("#", "");
  if (cleaned.length === 3) {
    const r2 = Number.parseInt((cleaned[0] ?? "") + (cleaned[0] ?? ""), 16);
    const g2 = Number.parseInt((cleaned[1] ?? "") + (cleaned[1] ?? ""), 16);
    const b2 = Number.parseInt((cleaned[2] ?? "") + (cleaned[2] ?? ""), 16);
    return { r: r2, g: g2, b: b2 };
  }
  if (cleaned.length !== 6 && cleaned.length !== 8 || !/^[0-9a-fA-F]+$/.test(cleaned)) {
    return { r: 0, g: 0, b: 0 };
  }
  const r = Number.parseInt(cleaned.slice(0, 2), 16);
  const g = Number.parseInt(cleaned.slice(2, 4), 16);
  const b = Number.parseInt(cleaned.slice(4, 6), 16);
  return { r, g, b };
}
var CUBE_VALUES = [0, 95, 135, 175, 215, 255];
var GRAY_VALUES = Array.from({ length: 24 }, (_, i) => 8 + i * 10);
function colorDistance(r1, g1, b1, r2, g2, b2) {
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return dr * dr * 0.299 + dg * dg * 0.587 + db * db * 0.114;
}
function findClosestCubeIndex(value) {
  let minDist = Number.POSITIVE_INFINITY;
  let minIdx = 0;
  for (let i = 0; i < CUBE_VALUES.length; i++) {
    const dist = Math.abs(value - (CUBE_VALUES[i] ?? 0));
    if (dist < minDist) {
      minDist = dist;
      minIdx = i;
    }
  }
  return minIdx;
}
function findClosestGrayIndex(gray) {
  let minDist = Number.POSITIVE_INFINITY;
  let minIdx = 0;
  for (let i = 0; i < GRAY_VALUES.length; i++) {
    const dist = Math.abs(gray - (GRAY_VALUES[i] ?? 0));
    if (dist < minDist) {
      minDist = dist;
      minIdx = i;
    }
  }
  return minIdx;
}
function rgbTo256(r, g, b) {
  const rIdx = findClosestCubeIndex(r);
  const gIdx = findClosestCubeIndex(g);
  const bIdx = findClosestCubeIndex(b);
  const cubeR = CUBE_VALUES[rIdx] ?? 0;
  const cubeG = CUBE_VALUES[gIdx] ?? 0;
  const cubeB = CUBE_VALUES[bIdx] ?? 0;
  const cubeIndex = 16 + 36 * rIdx + 6 * gIdx + bIdx;
  const cubeDist = colorDistance(r, g, b, cubeR, cubeG, cubeB);
  const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  const grayIdx = findClosestGrayIndex(gray);
  const grayValue = GRAY_VALUES[grayIdx] ?? 0;
  const grayIndex = 232 + grayIdx;
  const grayDist = colorDistance(r, g, b, grayValue, grayValue, grayValue);
  const spread = Math.max(r, g, b) - Math.min(r, g, b);
  if (spread < 10 && grayDist < cubeDist) return grayIndex;
  return cubeIndex;
}
function colorEscapes(mode, hex, kind) {
  if (!isHexColor(hex)) return void 0;
  const { r, g, b } = hexToRgb(hex);
  const cacheKey = `${mode}:${kind}:${hex}`;
  const cache = kind === "fg" ? fgEscapeCache : bgEscapeCache;
  let cached = cache.get(cacheKey);
  if (!cached) {
    if (mode === "256color") {
      const idx = rgbTo256(r, g, b);
      cached = {
        prefix: `\x1B[${kind === "fg" ? 38 : 48};5;${idx}m`,
        suffix: kind === "fg" ? "\x1B[39m" : RESET_BACKGROUND
      };
    } else {
      cached = {
        prefix: `\x1B[${kind === "fg" ? 38 : 48};2;${r};${g};${b}m`,
        suffix: kind === "fg" ? "\x1B[39m" : RESET_BACKGROUND
      };
    }
    cache.set(cacheKey, cached);
  }
  return cached;
}
var fgEscapeCache = /* @__PURE__ */ new Map();
var bgEscapeCache = /* @__PURE__ */ new Map();
function fgHex(theme, hex, text) {
  const mode = typeof theme?.getColorMode === "function" ? theme.getColorMode() : "truecolor";
  const escapes = colorEscapes(mode, hex, "fg");
  if (!escapes) return text;
  return `${escapes.prefix}${text}${escapes.suffix}`;
}

// ../../.pi/agent/npm/node_modules/@quandev104/pi-style/extension-src/pi-style/shared/box.ts
import { homedir } from "node:os";
import { relative, resolve as resolve2 } from "node:path";

// ../../.pi/agent/npm/node_modules/@quandev104/pi-style/extension-src/pi-style/shared/elapsed.ts
var ELAPSED_KEY = "__elapsedMs";
function formatElapsedMs(ms) {
  if (typeof ms !== "number" || !Number.isFinite(ms)) return "";
  if (ms < 1e3) return `${Math.round(ms)}ms`;
  const s = ms / 1e3;
  return s < 10 ? `${s.toFixed(1)}s` : `${Math.round(s)}s`;
}
function getElapsedMs(result) {
  if (!result || typeof result.details !== "object" || result.details === null) return void 0;
  const elapsed = result.details[ELAPSED_KEY];
  return typeof elapsed === "number" && Number.isFinite(elapsed) ? elapsed : void 0;
}

// ../../.pi/agent/npm/node_modules/@quandev104/pi-style/extension-src/pi-style/shared/render-budget.ts
import {
  truncateToWidth as tuiTruncateToWidth,
  visibleWidth as tuiVisibleWidth2,
  wrapTextWithAnsi
} from "@earendil-works/pi-tui";
var MAX_RENDER_LINE_CHARS = 2e3;
var DEFAULT_COLLAPSED_RENDER_LINES = 10;
var MAX_BOXED_RESULT_RENDERED_HEAD_LINES = 40;
var MAX_BOXED_RESULT_RENDERED_TAIL_LINES = 8;
var MAX_BOXED_RESULT_RENDERED_LINES = 160;
var RENDER_TRUNCATION_SUFFIX = "\u2026 (truncated)";
var TRUNCATE_ELLIPSIS = "\u2026";
var ANSI_RESET = "\x1B[0m";
var ESC = "\x1B";
var SGR_PREFIX_PATTERN = new RegExp(`^(?:${ESC}\\[[0-9;]*m)+`);
var SGR_SUFFIX_PATTERN = new RegExp(`(?:${ESC}\\[[0-9;]*m)+$`);
function truncateAtCodePointBoundary(text, maxChars) {
  if (text.length <= maxChars) return text;
  const code = text.charCodeAt(maxChars);
  const end = code >= 56320 && code <= 57343 ? maxChars - 1 : maxChars;
  return text.slice(0, end);
}
function clampRenderLine(line, maxChars = MAX_RENDER_LINE_CHARS) {
  if (line.length <= maxChars) return line;
  return truncateAtCodePointBoundary(line, maxChars) + RENDER_TRUNCATION_SUFFIX;
}
function isPrintableAsciiCode(code) {
  return code >= 32 && code <= 126;
}
function isSimpleWidthOneGlyphCode(code) {
  if (code >= 9472 && code <= 9599) return true;
  if (code >= 9600 && code <= 9631) return true;
  if (code >= 9632 && code <= 9727) return true;
  if (code >= 10240 && code <= 10495) return true;
  return code === 178 || // ²
  code === 183 || // ·
  code === 960 || // π
  code === 8211 || // –
  code === 8212 || // —
  code === 8226 || // •
  code === 8230 || // …
  code === 8593 || // ↑
  code === 8594 || // →
  code === 8595 || // ↓
  code === 8627 || // ↳
  code === 8709 || // ∅
  code === 8776 || // ≈
  code === 8943 || // ⋯
  code === 9095 || // ⎇
  code === 9209 || // ⏹
  code === 9998 || // ✎
  code === 10003 || // ✓
  code === 10007 || // ✗
  code === 10095 || // ❯
  code === 10132;
}
function isSimpleWidthOneCode(code) {
  return isPrintableAsciiCode(code) || isSimpleWidthOneGlyphCode(code);
}
function breakLongAsciiWord(word, width) {
  const lines = [];
  for (let i = 0; i < word.length; i += width) {
    lines.push(word.slice(i, i + width));
  }
  return lines.length > 0 ? lines : [""];
}
function wrapPrintableAsciiLine(line, width) {
  if (!line) return [""];
  if (line.length <= width) return [line];
  const wrapped = [];
  let currentLine = "";
  let currentVisibleLength = 0;
  let tokenStart = 0;
  while (tokenStart < line.length) {
    const tokenIsSpace = line[tokenStart] === " ";
    let tokenEnd = tokenStart + 1;
    while (tokenEnd < line.length && line[tokenEnd] === " " === tokenIsSpace) tokenEnd++;
    const token = line.slice(tokenStart, tokenEnd);
    const tokenVisibleLength = token.length;
    if (tokenVisibleLength > width && !tokenIsSpace) {
      if (currentLine) {
        wrapped.push(currentLine.trimEnd());
        currentLine = "";
        currentVisibleLength = 0;
      }
      const broken = breakLongAsciiWord(token, width);
      wrapped.push(...broken.slice(0, -1));
      currentLine = broken[broken.length - 1] ?? "";
      currentVisibleLength = currentLine.length;
      tokenStart = tokenEnd;
      continue;
    }
    const totalNeeded = currentVisibleLength + tokenVisibleLength;
    if (totalNeeded > width && currentVisibleLength > 0) {
      wrapped.push(currentLine.trimEnd());
      if (tokenIsSpace) {
        currentLine = "";
        currentVisibleLength = 0;
      } else {
        currentLine = token;
        currentVisibleLength = tokenVisibleLength;
      }
    } else {
      currentLine += token;
      currentVisibleLength += tokenVisibleLength;
    }
    tokenStart = tokenEnd;
  }
  if (currentLine) wrapped.push(currentLine);
  return wrapped.length > 0 ? wrapped.map((wrappedLine) => wrappedLine.trimEnd()) : [""];
}
function matchSimpleSgrWrappedText(text) {
  const prefixMatch = SGR_PREFIX_PATTERN.exec(text);
  const suffixMatch = SGR_SUFFIX_PATTERN.exec(text);
  if (!prefixMatch || !suffixMatch) return null;
  const prefix = prefixMatch[0];
  const suffix = suffixMatch[0];
  const bodyStart = prefix.length;
  const bodyEnd = suffixMatch.index;
  if (bodyEnd < bodyStart) return null;
  const body = text.slice(bodyStart, bodyEnd);
  const bodyWidth = knownVisibleWidth(body);
  if (!bodyWidth || bodyWidth.kind === "sgrAscii" || bodyWidth.kind === "sgrSimple") return null;
  return { prefix, body, suffix, kind: bodyWidth.kind === "ascii" ? "sgrAscii" : "sgrSimple" };
}
function wrapSimpleSgrWrappedText(text, width) {
  const match = matchSimpleSgrWrappedText(text);
  if (!match) return null;
  return {
    lines: wrapPrintableAsciiLine(match.body, width).map((line) => `${match.prefix}${line}${match.suffix}`),
    kind: match.kind
  };
}
function readSgrSequenceEnd(text, offset) {
  if (text.charCodeAt(offset) !== 27 || text[offset + 1] !== "[") return -1;
  let cursor = offset + 2;
  while (cursor < text.length) {
    const code = text.charCodeAt(cursor);
    if (code === 109) return cursor + 1;
    if (code !== 59 && (code < 48 || code > 57)) return -1;
    cursor++;
  }
  return -1;
}
function knownVisibleWidth(text) {
  let width = 0;
  let sawSgr = false;
  let sawSimpleGlyph = false;
  for (let i = 0; i < text.length; ) {
    const sgrEnd = readSgrSequenceEnd(text, i);
    if (sgrEnd > i) {
      sawSgr = true;
      i = sgrEnd;
      continue;
    }
    const code = text.charCodeAt(i);
    if (!isSimpleWidthOneCode(code)) return null;
    if (!isPrintableAsciiCode(code)) sawSimpleGlyph = true;
    width++;
    i++;
  }
  if (sawSgr) return { visibleWidth: width, kind: sawSimpleGlyph ? "sgrSimple" : "sgrAscii" };
  return { visibleWidth: width, kind: sawSimpleGlyph ? "simple" : "ascii" };
}
function knownEllipsisWidth(text) {
  if (text === TRUNCATE_ELLIPSIS) return 1;
  return knownVisibleWidth(text)?.visibleWidth ?? null;
}
function truncatePrintableAscii(text, width, ellipsis = TRUNCATE_ELLIPSIS) {
  if (width <= 0) return { text: "", visibleWidth: 0 };
  if (text.length <= width) return { text, visibleWidth: text.length };
  const ellipsisWidth = knownEllipsisWidth(ellipsis);
  if (ellipsisWidth === null) return { text: text.slice(0, width), visibleWidth: width };
  if (ellipsisWidth >= width) {
    if (ellipsis === TRUNCATE_ELLIPSIS) return { text: TRUNCATE_ELLIPSIS, visibleWidth: 1 };
    return { text: ellipsis.slice(0, width), visibleWidth: Math.min(width, ellipsis.length) };
  }
  const targetWidth = Math.max(0, width - ellipsisWidth);
  return { text: `${text.slice(0, targetWidth)}${ellipsis}`, visibleWidth: targetWidth + ellipsisWidth };
}
function truncateSgrAscii(text, width, ellipsis, visibleWidth) {
  if (visibleWidth <= width) return { text, visibleWidth };
  const ellipsisWidth = knownEllipsisWidth(ellipsis);
  if (ellipsisWidth === null) return null;
  if (ellipsisWidth >= width) return truncatePrintableAscii(ellipsis, width, "");
  const targetWidth = Math.max(0, width - ellipsisWidth);
  let keptWidth = 0;
  let output = "";
  for (let i = 0; i < text.length && keptWidth < targetWidth; ) {
    const sgrEnd = readSgrSequenceEnd(text, i);
    if (sgrEnd > i) {
      output += text.slice(i, sgrEnd);
      i = sgrEnd;
      continue;
    }
    const code = text.charCodeAt(i);
    if (!isSimpleWidthOneCode(code)) return null;
    output += text[i] ?? "";
    keptWidth++;
    i++;
  }
  return { text: `${output}${ANSI_RESET}${ellipsis}${ANSI_RESET}`, visibleWidth: keptWidth + ellipsisWidth };
}
function fastTruncateText(text, width, ellipsis = TRUNCATE_ELLIPSIS) {
  const knownWidth = knownVisibleWidth(text);
  if (!knownWidth) return null;
  if (knownWidth.kind === "ascii" || knownWidth.kind === "simple")
    return { ...truncatePrintableAscii(text, width, ellipsis), kind: knownWidth.kind };
  const simple = matchSimpleSgrWrappedText(text);
  if (simple) {
    const truncated2 = truncatePrintableAscii(simple.body, width, ellipsis);
    return {
      text: `${simple.prefix}${truncated2.text}${simple.suffix}`,
      visibleWidth: truncated2.visibleWidth,
      kind: simple.kind
    };
  }
  const truncated = truncateSgrAscii(text, width, ellipsis, knownWidth.visibleWidth);
  return truncated ? { ...truncated, kind: knownWidth.kind } : null;
}
function safeVisibleWidth(text) {
  const fastWidth = knownVisibleWidth(text);
  if (fastWidth) return fastWidth.visibleWidth;
  if (text === TRUNCATE_ELLIPSIS) return 1;
  return tuiVisibleWidth2(text);
}
function safeTruncateToWidth(text, maxWidth, ellipsis = "...", pad = false) {
  const width = Math.floor(maxWidth);
  if (!Number.isFinite(width) || width <= 0) return "";
  if (text.length === 0) return pad ? " ".repeat(width) : "";
  const truncated = fastTruncateText(text, width, ellipsis);
  if (truncated)
    return pad ? `${truncated.text}${" ".repeat(Math.max(0, width - truncated.visibleWidth))}` : truncated.text;
  return tuiTruncateToWidth(text, maxWidth, ellipsis, pad);
}
function fastBoxLineContent(content, width) {
  const contentWidth = Math.floor(width);
  if (!Number.isFinite(contentWidth) || contentWidth <= 0) return null;
  return fastTruncateText(content, contentWidth);
}
function safeWrapTextWithAnsi(text, width, maxChars = MAX_RENDER_LINE_CHARS) {
  const clamped = clampRenderLine(text, maxChars);
  const wrapWidth = Math.floor(width);
  if (!Number.isFinite(wrapWidth) || wrapWidth <= 0) {
    return wrapTextWithAnsi(clamped, width);
  }
  const clampedWidth = knownVisibleWidth(clamped);
  if (clampedWidth?.kind === "ascii" || clampedWidth?.kind === "simple") {
    return wrapPrintableAsciiLine(clamped, wrapWidth);
  }
  const simpleSgrWrapped = wrapSimpleSgrWrappedText(clamped, wrapWidth);
  if (simpleSgrWrapped) {
    return simpleSgrWrapped.lines;
  }
  return wrapTextWithAnsi(clamped, width);
}
function boxedResultRenderBudget(rawLineBudget = DEFAULT_COLLAPSED_RENDER_LINES) {
  const rawLines = Math.max(
    0,
    Math.floor(Number.isFinite(rawLineBudget) ? rawLineBudget : DEFAULT_COLLAPSED_RENDER_LINES)
  );
  const maxRenderedLines = Math.max(1, Math.min(rawLines * 3, MAX_BOXED_RESULT_RENDERED_LINES));
  const tailLines = Math.min(
    Math.ceil(rawLines * 0.15),
    MAX_BOXED_RESULT_RENDERED_TAIL_LINES,
    Math.max(0, maxRenderedLines - 1)
  );
  const headLines = Math.min(
    rawLines,
    MAX_BOXED_RESULT_RENDERED_HEAD_LINES,
    Math.max(1, maxRenderedLines - tailLines - 1)
  );
  return { headLines, tailLines, maxRenderedLines };
}

// ../../.pi/agent/npm/node_modules/@quandev104/pi-style/extension-src/pi-style/shared/theme-extras.ts
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
var extensionDir = dirname(fileURLToPath(import.meta.url));
var THEME_EXTRA_DEFAULTS = Object.freeze({
  assistantPrefix: "\u2022",
  assistantPrefixColor: "",
  dividerChar: "\u2500",
  dividerColor: "",
  showDivider: "true",
  quoteStyle: "false",
  quoteChar: "\u2506",
  quoteColor: "",
  inputBorderColor: "",
  bashPromptColor: "",
  tagBgColor: "",
  parensTextColor: "",
  parensBracketColor: "",
  slashSelectedColor: "",
  slashCommandColor: "",
  slashDescriptionColor: "",
  slashHintColor: "",
  userBoxBorderColor: "",
  compactionBgColor: "",
  gitInsertionColor: "#2ea043",
  gitDeletionColor: "#f85149"
});
var cachedExtras = null;
var cachedVars = null;
var cachedColors = null;
function readThemeToken(name) {
  const varValue = cachedVars && typeof cachedVars[name] === "string" ? cachedVars[name] : "";
  if (varValue) return varValue;
  return cachedColors && typeof cachedColors[name] === "string" ? cachedColors[name] : "";
}
function resolveThemeColorToken(value) {
  let resolved = value;
  const seen = /* @__PURE__ */ new Set();
  for (let depth = 0; depth < 8; depth++) {
    if (!resolved) return "";
    if (isHexColor(resolved)) return resolved;
    if (seen.has(resolved)) return "";
    seen.add(resolved);
    const next = readThemeToken(resolved);
    if (!next) return "";
    resolved = next;
  }
  return "";
}
function resolveThemeExtraValue(key, value) {
  if (!key.endsWith("Color")) return value;
  return resolveThemeColorToken(value) || value;
}
function getThemeExtra(_theme, key) {
  const extraValue = cachedExtras?.[key];
  if (typeof extraValue === "string" || typeof extraValue === "boolean") {
    return resolveThemeExtraValue(key, String(extraValue));
  }
  return resolveThemeExtraValue(key, THEME_EXTRA_DEFAULTS[key] ?? "");
}

// ../../.pi/agent/npm/node_modules/@quandev104/pi-style/extension-src/pi-style/shared/box.ts
function boxedToolBgName(isError, isPartial) {
  return isPartial ? "toolPendingBg" : isError ? "toolErrorBg" : "toolSuccessBg";
}
function applyBgTint(theme, bgName, lines) {
  if (typeof theme.bg !== "function") return lines;
  try {
    return lines.map((line) => theme.bg?.(bgName, line) ?? line);
  } catch {
    return lines;
  }
}
var THEME_CACHE_KEYS = /* @__PURE__ */ new WeakMap();
var nextThemeCacheKey = 1;
function themeCacheKey(theme) {
  const cached = THEME_CACHE_KEYS.get(theme);
  if (cached !== void 0) return cached;
  const created = nextThemeCacheKey++;
  THEME_CACHE_KEYS.set(theme, created);
  return created;
}
function shortenPath(path) {
  const home = homedir();
  if (path.startsWith(home)) return `~${path.slice(home.length)}`;
  return path;
}
function resolveAbsolutePath(rawPath, cwd) {
  const path = rawPath.trim();
  if (!path) return "";
  const home = process.env.HOME;
  if (home && (path === "~" || path.startsWith("~/"))) {
    return path === "~" ? home : resolve2(home, path.slice(2));
  }
  return resolve2(cwd, path);
}
function resolveRelativePath(rawPath, cwd) {
  const absPath = resolveAbsolutePath(rawPath, cwd);
  if (!absPath) return "(unknown)";
  const relPath = relative(cwd, absPath).replace(/\\/g, "/");
  return relPath || ".";
}
function replaceTabs(text) {
  return text.replace(/\t/g, "   ");
}
function getTextOutput(result) {
  if (!result?.content) return "";
  const textBlocks = result.content.filter((contentBlock) => {
    if (!contentBlock || typeof contentBlock !== "object") return false;
    return contentBlock.type === "text";
  });
  return textBlocks.map((contentBlock) => String(contentBlock.text ?? "")).join("\n").replace(/\r/g, "");
}
var WORD_CP_UNKNOWN = 255;
var WORD_CP_SURROGATE = 254;
var WORD_CP_CLASS = new Uint8Array(65536).fill(WORD_CP_UNKNOWN);
for (let code = 48; code <= 57; code++) WORD_CP_CLASS[code] = 1;
for (let code = 65; code <= 90; code++) WORD_CP_CLASS[code] = 1;
for (let code = 97; code <= 122; code++) WORD_CP_CLASS[code] = 1;
WORD_CP_CLASS[39] = 1;
WORD_CP_CLASS[45] = 1;
WORD_CP_CLASS[95] = 1;
WORD_CP_CLASS.fill(WORD_CP_SURROGATE, 55296, 57344);
var NON_ASCII_WORD_RE = /[\p{L}\p{N}]/u;
var ASTRAL_WORD_CP = /* @__PURE__ */ new Map();
function astralWordMembership(codePoint) {
  const cached = ASTRAL_WORD_CP.get(codePoint);
  if (cached !== void 0) return cached;
  const membership = NON_ASCII_WORD_RE.test(String.fromCodePoint(codePoint)) ? 1 : 0;
  ASTRAL_WORD_CP.set(codePoint, membership);
  return membership;
}
function countWords(text) {
  const len = text.length;
  let count = 0;
  let inWord = 0;
  for (let i = 0; i < len; i++) {
    const code = text.charCodeAt(i);
    const membership = WORD_CP_CLASS[code] ?? 0;
    let isWord;
    if (membership <= 1) {
      isWord = membership;
    } else if (membership === WORD_CP_SURROGATE) {
      const next = i + 1 < len ? text.charCodeAt(i + 1) : 0;
      if (code <= 56319 && next >= 56320 && next <= 57343) {
        isWord = astralWordMembership(65536 + (code - 55296 << 10) + (next - 56320));
        i++;
      } else {
        isWord = 0;
      }
    } else {
      isWord = NON_ASCII_WORD_RE.test(String.fromCharCode(code)) ? 1 : 0;
      WORD_CP_CLASS[code] = isWord;
    }
    count += isWord & (inWord ^ 1);
    inWord = isWord;
  }
  return count;
}
function formatCompactCount(value) {
  if (value < 1e3) return `${Math.round(value)}`;
  if (value < 1e4) return `${(value / 1e3).toFixed(1)}k`;
  if (value < 1e6) return `${Math.round(value / 1e3)}k`;
  if (value < 1e7) return `${(value / 1e6).toFixed(1)}M`;
  return `${Math.round(value / 1e6)}M`;
}
function formatBoxedWords(text) {
  return `~${formatCompactCount(countWords(text))} words`;
}
var BOX_HORIZONTAL = "\u2500";
var BOX_VERTICAL = "\u2502";
var BOX_SIDE_PADDING = 2;
var BOX_MIN_WIDTH = 12;
var BOX_ROUND_TOP_LEFT = "\u256D";
var BOX_ROUND_TOP_RIGHT = "\u256E";
var BOX_ROUND_BOTTOM_LEFT = "\u2570";
var BOX_ROUND_BOTTOM_RIGHT = "\u256F";
var BOX_DIVIDER_LEFT = "\u251C";
var BOX_DIVIDER_RIGHT = "\u2524";
var BOX_LABELED_RIGHT_DASH_MIN = 3;
function boxWidth(width) {
  return Math.max(BOX_MIN_WIDTH, width);
}
function boxInnerWidth(width) {
  return Math.max(1, boxWidth(width) - 2 - BOX_SIDE_PADDING * 2);
}
function boxedToolWidthKey(toolName, detail) {
  return `${toolName}:${detail}`;
}
function formatToolName(toolName) {
  const spaced = toolName.replace(/[_-]+/g, " ").replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2").trim();
  return spaced.replace(/\b\w/g, (char) => char.toUpperCase()) || toolName;
}
function formatToolParamName(name) {
  const spaced = name.replace(/[_-]+/g, " ").replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2").trim();
  return spaced ? spaced[0]?.toUpperCase() + spaced.slice(1) : name;
}
var MAX_PARAM_VALUE_LENGTH = 120;
function formatOperationSummary(value) {
  if (!Array.isArray(value) || value.length === 0) return void 0;
  if (!value.every((item) => item && typeof item === "object" && !Array.isArray(item))) return void 0;
  const types = Array.from(new Set(value.map((item) => String(item.type ?? "operation"))));
  const typeSummary = types.length === 1 ? ` (${types[0]})` : types.length > 1 ? ` (${types.slice(0, 3).join(", ")}${types.length > 3 ? ", \u2026" : ""})` : "";
  return `${value.length} ${value.length === 1 ? "operation" : "operations"}${typeSummary}`;
}
function formatToolParamValue(value) {
  if (value === void 0) return "";
  if (value === null) return "null";
  if (typeof value === "string") {
    if (value.length <= MAX_PARAM_VALUE_LENGTH) return value;
    return `${value.slice(0, MAX_PARAM_VALUE_LENGTH)}\u2026`;
  }
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") return String(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    return formatOperationSummary(value) ?? `${value.length} ${value.length === 1 ? "item" : "items"}`;
  }
  if (typeof value === "object" && value !== null) {
    const keys = Object.keys(value);
    if (keys.length === 0) return "{}";
    return `{${keys.length} ${keys.length === 1 ? "key" : "keys"}}`;
  }
  try {
    const json = JSON.stringify(value);
    if (json.length <= MAX_PARAM_VALUE_LENGTH) return json;
    return `${json.slice(0, MAX_PARAM_VALUE_LENGTH)}\u2026`;
  } catch {
    return String(value);
  }
}
function formatToolParamLines(args, theme) {
  if (args === void 0 || args === null) return [];
  if (typeof args !== "object" || Array.isArray(args)) {
    const value = formatToolParamValue(args);
    return value ? [`Params: ${value}`] : [];
  }
  const entries = Object.entries(args).filter(([, value]) => value !== void 0);
  if (entries.length === 0) return [];
  const lines = [];
  for (const [key, value] of entries) {
    const formattedValue = formatToolParamValue(value);
    if (!formattedValue) continue;
    const [firstLine = "", ...restLines] = formattedValue.replace(/\r/g, "").split("\n");
    const keyLabel = formatToolParamName(key);
    if (theme) {
      lines.push(`${theme.fg("dim", `${keyLabel}:`)} ${theme.fg("text", firstLine)}`);
      lines.push(...restLines.map((line) => `  ${theme.fg("text", line)}`));
    } else {
      lines.push(`${keyLabel}: ${firstLine}`);
      lines.push(...restLines.map((line) => `  ${line}`));
    }
  }
  return lines;
}
function colorFromExtra(theme, extraKey, fallbackColor, text) {
  const color = getThemeExtra(theme, extraKey);
  if (color) {
    if (isHexColor(color)) return fgHex(theme, color, text);
    try {
      return theme.fg(color, text);
    } catch {
    }
  }
  return theme.fg(fallbackColor, text);
}
function formatBoxedStatusIcon(theme, isError) {
  const icon = isError ? "\u2717" : "\u2713";
  return theme.fg(isError ? "error" : "success", icon);
}
function formatToolTitlePrefix(theme, name) {
  return colorFromExtra(theme, "bashPromptColor", "bashMode", `\u2794 ${name}`);
}
function formatBoxedToolTitle(theme, name, isError, status) {
  const coloredTitle = isError ? theme.fg("error", `\u2794 ${name} \u2717`) : status === "running" ? `${formatToolTitlePrefix(theme, name)} ${theme.fg("text", "\u25CC")}` : status === "pending" ? formatToolTitlePrefix(theme, name) : `${formatToolTitlePrefix(theme, name)} ${formatBoxedStatusIcon(theme, false)}`;
  return typeof theme?.bold === "function" ? theme.bold(coloredTitle) : coloredTitle;
}
function formatBoxedRunningStatus(theme, elapsedMs) {
  const elapsed = elapsedMs === void 0 ? "" : `${theme.fg("text", ` \xB7 ${(elapsedMs / 1e3).toFixed(1)}s`)}`;
  return `${theme.fg("dim", "\u25CC Running")}${elapsed}`;
}
function dimLine(text) {
  return `\x1B[2m${text}\x1B[22m`;
}
function boxFrameText(_theme, text, color) {
  return color ? _theme.fg(color, text) : dimLine(text);
}
function boxLabeledBorder(theme, start, end, leftLabel, rightLabel, width, frameColor) {
  const renderedWidth = boxWidth(width);
  let left = leftLabel ?? "";
  const right = rightLabel ?? "";
  let leftWidth = safeVisibleWidth(left);
  const rightWidth = safeVisibleWidth(right);
  const leftOverhead = left ? 3 : 0;
  const rightOverhead = right ? 2 : 0;
  let rightFill = right ? BOX_LABELED_RIGHT_DASH_MIN : 0;
  let fill = renderedWidth - start.length - end.length - leftOverhead - leftWidth - rightOverhead - rightWidth - rightFill;
  if (right && fill < 0) {
    rightFill = 1;
    fill = renderedWidth - start.length - end.length - leftOverhead - leftWidth - rightOverhead - rightWidth - rightFill;
  }
  if (fill < 0) {
    const reserved = start.length + end.length + leftOverhead + (right ? rightOverhead + rightWidth + rightFill : 0) + 1;
    const maxLeft = renderedWidth - reserved;
    left = maxLeft > 0 ? safeTruncateToWidth(left, maxLeft, "\u2026") : "";
    leftWidth = safeVisibleWidth(left);
    fill = renderedWidth - start.length - end.length - (left ? leftWidth + leftOverhead : 0) - (right ? rightOverhead + rightWidth + rightFill : 0);
  }
  const parts = [boxFrameText(theme, `${start}${left ? "\u2500 " : ""}`, frameColor)];
  if (left) parts.push(left);
  parts.push(boxFrameText(theme, `${left ? " " : ""}${BOX_HORIZONTAL.repeat(Math.max(0, fill))}`, frameColor));
  if (right) {
    parts.push(
      boxFrameText(theme, " ", frameColor),
      right,
      boxFrameText(theme, ` ${BOX_HORIZONTAL.repeat(rightFill)}`, frameColor)
    );
  }
  parts.push(boxFrameText(theme, end, frameColor));
  return parts.join("");
}
function boxBlankLine(theme, width, frameColor) {
  const renderedWidth = boxWidth(width);
  const contentWidth = boxInnerWidth(renderedWidth);
  const sidePad = " ".repeat(BOX_SIDE_PADDING);
  return `${boxFrameText(theme, BOX_VERTICAL, frameColor)}${sidePad}${" ".repeat(contentWidth)}${sidePad}${boxFrameText(theme, BOX_VERTICAL, frameColor)}`;
}
function boxLine(theme, content, width, frameColor) {
  const renderedWidth = boxWidth(width);
  const contentWidth = boxInnerWidth(renderedWidth);
  const fastContent = fastBoxLineContent(content, contentWidth);
  const sidePad = " ".repeat(BOX_SIDE_PADDING);
  if (fastContent) {
    const fill2 = " ".repeat(Math.max(0, contentWidth - fastContent.visibleWidth));
    return `${boxFrameText(theme, BOX_VERTICAL, frameColor)}${sidePad}${fastContent.text}${fill2}${sidePad}${boxFrameText(theme, BOX_VERTICAL, frameColor)}`;
  }
  const truncated = safeTruncateToWidth(content, contentWidth, "\u2026");
  const fill = " ".repeat(Math.max(0, contentWidth - safeVisibleWidth(truncated)));
  return `${boxFrameText(theme, BOX_VERTICAL, frameColor)}${sidePad}${truncated}${fill}${sidePad}${boxFrameText(theme, BOX_VERTICAL, frameColor)}`;
}
function boxedWrappedLines(theme, content, width, frameColor) {
  return safeWrapTextWithAnsi(content, boxInnerWidth(width)).map((line) => boxLine(theme, line, width, frameColor));
}
function boxedTruncatedLine(theme, content, width, frameColor) {
  return boxLine(theme, safeTruncateToWidth(content, boxInnerWidth(width), "\u2026"), width, frameColor);
}
function pushBoundedLines(target, lines, maxLines) {
  const slots = maxLines - target.length;
  if (slots <= 0) return false;
  if (lines.length > slots) {
    target.push(...lines.slice(0, slots));
    return false;
  }
  target.push(...lines);
  return true;
}
function renderBoxedOutputLines(theme, outputLines, width, rawLineBudget = DEFAULT_COLLAPSED_RENDER_LINES, frameColor) {
  const budget = boxedResultRenderBudget(rawLineBudget);
  const headLimit = Math.max(0, Math.min(budget.headLines, budget.maxRenderedLines));
  const tailLimit = Math.max(0, Math.min(budget.tailLines, Math.max(0, budget.maxRenderedLines - headLimit - 1)));
  const head = [];
  let nextInputIndex = 0;
  let truncated = false;
  for (; nextInputIndex < outputLines.length; nextInputIndex++) {
    const fragments = (outputLines[nextInputIndex] ?? "").split("\n");
    let headExceeded = false;
    for (const fragment of fragments) {
      const line = boxedTruncatedLine(theme, fragment, width, frameColor);
      if (!pushBoundedLines(head, [line], headLimit)) {
        headExceeded = true;
        break;
      }
    }
    if (headExceeded) {
      truncated = true;
      nextInputIndex++;
      break;
    }
  }
  if (!truncated && nextInputIndex >= outputLines.length) return head;
  const tail = [];
  const tailStart = Math.max(nextInputIndex, outputLines.length - tailLimit);
  for (let i = tailStart; i < outputLines.length; i++) {
    const fragments = (outputLines[i] ?? "").split("\n");
    for (const fragment of fragments) {
      const line = boxedTruncatedLine(theme, fragment, width, frameColor);
      tail.push(line);
      if (tail.length > tailLimit) tail.splice(0, tail.length - tailLimit);
    }
  }
  const skippedInputLines = Math.max(0, tailStart - nextInputIndex);
  const skippedText = skippedInputLines > 0 ? `\u2026 rendered output truncated; ${skippedInputLines} input lines skipped before tail` : "\u2026 rendered output truncated";
  return [...head, boxLine(theme, theme.fg("muted", skippedText), width, frameColor), ...tail];
}
function renderBoxedToolCall(theme, toolName, detailLines, options = {}) {
  let cache = null;
  return {
    invalidate() {
      cache = null;
    },
    render(width) {
      if (cache?.width === width) return cache.lines;
      const title = formatBoxedToolTitle(
        theme,
        toolName,
        options.isError,
        options.isPending ? options.running ? "running" : "pending" : void 0
      );
      const renderedWidth = boxWidth(width);
      const detailWidth = Math.max(0, renderedWidth - safeVisibleWidth(title) - 9);
      const headerDetail = typeof options.headerDetail === "function" ? options.headerDetail(detailWidth) : options.headerDetail;
      const headerLabel = headerDetail ? `${title} \xB7 ${headerDetail}` : title;
      const frameColor = options.isError ? "error" : void 0;
      const lines = [
        boxLabeledBorder(
          theme,
          BOX_ROUND_TOP_LEFT,
          BOX_ROUND_TOP_RIGHT,
          headerLabel,
          void 0,
          renderedWidth,
          frameColor
        ),
        boxBlankLine(theme, renderedWidth, frameColor),
        ...detailLines.flatMap((line) => boxedWrappedLines(theme, line, renderedWidth, frameColor))
      ];
      if (options.isPending && !options.resultSeen) {
        const pendingLabel = options.pendingLabel ?? theme.fg("dim", `\u2026 ${options.pendingText ?? "Waiting for output\u2026"}`);
        lines.push(
          boxBlankLine(theme, renderedWidth, frameColor),
          boxLabeledBorder(
            theme,
            BOX_ROUND_BOTTOM_LEFT,
            BOX_ROUND_BOTTOM_RIGHT,
            pendingLabel,
            void 0,
            renderedWidth,
            frameColor
          )
        );
      } else {
        lines.push(boxBlankLine(theme, renderedWidth, frameColor));
      }
      const tinted = applyBgTint(theme, boxedToolBgName(options.isError, options.isPartial), lines);
      cache = { width, lines: tinted };
      return tinted;
    }
  };
}
var COMPACT_FOOTER_KEY = "__piStyleCompactFooter";
var COMPACT_FOOTER_ERROR_KEY = "__piStyleCompactFooterError";
var COMPACT_FOOTER_PARTIAL_KEY = "__piStyleCompactFooterPartial";
function clearCompactBoxedFooter(state) {
  if (!state || typeof state !== "object") return;
  delete state[COMPACT_FOOTER_KEY];
  delete state[COMPACT_FOOTER_ERROR_KEY];
  delete state[COMPACT_FOOTER_PARTIAL_KEY];
}
function renderCompactBoxedToolCall(theme, toolName, detailLine, options = {}) {
  return {
    invalidate() {
    },
    render(width) {
      const renderedWidth = boxWidth(width);
      const title = formatBoxedToolTitle(
        theme,
        toolName,
        options.isError,
        options.isPending ? options.running ? "running" : "pending" : void 0
      );
      const detailWidth = Math.max(0, renderedWidth - safeVisibleWidth(title) - 9);
      const headerDetail = typeof options.headerDetail === "function" ? options.headerDetail(detailWidth) : options.headerDetail ?? detailLine;
      const headerLabel = headerDetail ? `${title} \xB7 ${headerDetail}` : title;
      const compactFooter = typeof options.state?.[COMPACT_FOOTER_KEY] === "string" ? options.state[COMPACT_FOOTER_KEY] : "";
      const _footerIsError = Boolean(options.state?.[COMPACT_FOOTER_ERROR_KEY]);
      const _footerIsPartial = Boolean(options.state?.[COMPACT_FOOTER_PARTIAL_KEY]);
      const bodyLines = options.bodyLines ? options.bodyLines(boxInnerWidth(renderedWidth)) : [];
      const frameColor = options.isError ? "error" : void 0;
      const lines = [
        boxLabeledBorder(
          theme,
          BOX_ROUND_TOP_LEFT,
          BOX_ROUND_TOP_RIGHT,
          headerLabel,
          void 0,
          renderedWidth,
          frameColor
        ),
        ...bodyLines.length > 0 ? bodyLines.map((line) => boxLine(theme, line, renderedWidth, frameColor)) : [boxBlankLine(theme, renderedWidth, frameColor)]
      ];
      if (compactFooter) {
        lines.push(
          boxLabeledBorder(
            theme,
            BOX_ROUND_BOTTOM_LEFT,
            BOX_ROUND_BOTTOM_RIGHT,
            compactFooter,
            options.bottomRightLabel,
            renderedWidth,
            frameColor
          )
        );
      } else if (options.isPending) {
        const pendingLabel = options.pendingLabel ?? (options.running ? formatBoxedRunningStatus(theme, void 0) : theme.fg("dim", `\u2026 ${options.pendingText ?? "Waiting for output\u2026"}`));
        lines.push(
          boxLabeledBorder(
            theme,
            BOX_ROUND_BOTTOM_LEFT,
            BOX_ROUND_BOTTOM_RIGHT,
            pendingLabel,
            options.bottomRightLabel,
            renderedWidth,
            frameColor
          )
        );
      } else {
      }
      return options.tint ? applyBgTint(theme, boxedToolBgName(options.isError, options.isPartial), lines) : lines;
    }
  };
}
function renderBoxedToolResult(theme, body, options = {}) {
  let cache = null;
  return {
    invalidate() {
      cache = null;
      if (typeof body !== "function") body.invalidate();
    },
    render(width) {
      if (cache?.width === width) return cache.lines;
      const renderedWidth = boxWidth(width);
      const maxContentWidth = boxInnerWidth(renderedWidth);
      const bodyLines = typeof body === "function" ? body(maxContentWidth) : body.render(maxContentWidth);
      const errorPrefix = options.isError ? [theme.fg("error", options.errorLabel ?? "\u2717 Error")] : [];
      const outputLines = bodyLines.length > 0 ? [...errorPrefix, ...bodyLines] : [theme.fg("muted", `\u2205 ${options.emptyText ?? "(no output)"}`)];
      const outputFragments = outputLines.flatMap((line) => line.split("\n"));
      const footerText = (options.footerLines ?? []).join(" \xB7 ");
      const frameColor = options.isError ? "error" : void 0;
      const dividerText = typeof options.dividerLabel === "function" ? options.dividerLabel(renderedWidth) : options.dividerLabel ?? "Response";
      const rendered = [
        ...options.showDivider === false ? [] : [
          boxLabeledBorder(
            theme,
            BOX_DIVIDER_LEFT,
            BOX_DIVIDER_RIGHT,
            theme.fg("dim", dividerText),
            options.dividerRightLabel ? theme.fg("dim", options.dividerRightLabel) : void 0,
            renderedWidth,
            frameColor
          )
        ],
        ...options.skipLeadingBlank ? [] : [boxBlankLine(theme, renderedWidth, frameColor)],
        ...renderBoxedOutputLines(
          theme,
          outputFragments,
          renderedWidth,
          options.renderLineBudget ?? outputFragments.length,
          frameColor
        ),
        boxBlankLine(theme, renderedWidth, frameColor),
        boxLabeledBorder(
          theme,
          BOX_ROUND_BOTTOM_LEFT,
          BOX_ROUND_BOTTOM_RIGHT,
          footerText,
          options.expandHint ? theme.fg("dim", options.expandHint) : void 0,
          renderedWidth,
          frameColor
        )
      ];
      const tinted = options.tint === false ? rendered : applyBgTint(theme, boxedToolBgName(options.isError, options.isPartial), rendered);
      cache = { width, lines: tinted };
      return tinted;
    }
  };
}
function formatBoxedFooterFromValues(theme, elapsedMs, output, extraParts = []) {
  const wall = elapsedMs === void 0 ? "--" : `${(elapsedMs / 1e3).toFixed(2)}s`;
  const elapsedPart = theme.fg("text", wall);
  const extraPartList = extraParts.filter(Boolean).map((part) => theme.fg("dim", part));
  const wordsPart = theme.fg("dim", formatBoxedWords(output));
  return [elapsedPart, ...extraPartList, wordsPart].join(theme.fg("dim", " \xB7 "));
}
function formatBoxedFooterParts(theme, result, extraParts = [], elapsedMs) {
  return formatBoxedFooterFromValues(theme, elapsedMs ?? getElapsedMs(result), getTextOutput(result), extraParts);
}
function formatBoxedFooter(theme, result, extraParts = [], elapsedMs) {
  return formatBoxedFooterParts(theme, result, extraParts, elapsedMs);
}
function renderCompactBoxedFooter(theme, result, options = {}) {
  if (options.state && typeof options.state === "object") {
    options.state[COMPACT_FOOTER_KEY] = formatBoxedFooterParts(theme, result, [], options.elapsedMs);
    options.state[COMPACT_FOOTER_ERROR_KEY] = Boolean(options.isError);
    options.state[COMPACT_FOOTER_PARTIAL_KEY] = Boolean(options.isPartial);
    return { invalidate() {
    }, render: () => [] };
  }
  return {
    invalidate() {
    },
    render(width) {
      const renderedWidth = boxWidth(width);
      return [
        boxLabeledBorder(
          theme,
          BOX_ROUND_BOTTOM_LEFT,
          BOX_ROUND_BOTTOM_RIGHT,
          formatBoxedFooterParts(theme, result, [], options.elapsedMs),
          void 0,
          renderedWidth
        )
      ];
    }
  };
}
function formatToolOutputLine(theme, line, color = "toolOutput") {
  if (color === "error") return theme.fg("error", line);
  const clean = stripAnsi(line);
  if (/^##\s/.test(clean)) return theme.fg("muted", line);
  if (/^\?\?\s/.test(clean))
    return theme.bold ? theme.bold(theme.fg("syntaxVariable", line)) : theme.fg("syntaxVariable", line);
  return theme.fg(color, line);
}
function selectRenderLines(text, maxLines, tail = false) {
  const source = text ?? "";
  if (!source) return { lines: [], omitted: 0 };
  const limit = Math.max(0, maxLines);
  const selected = [];
  let lineCount = 0;
  let lineStart = 0;
  for (let i = 0; i <= source.length; i++) {
    if (i < source.length && source[i] !== "\n") continue;
    const rawLine = source.slice(lineStart, i).replace(/\r/g, "");
    lineCount++;
    if (limit > 0) {
      const line = clampRenderLine(rawLine);
      if (tail) {
        selected.push(line);
        if (selected.length > limit) selected.shift();
      } else if (selected.length < limit) {
        selected.push(line);
      }
    }
    lineStart = i + 1;
  }
  if (selected.length === 1 && selected[0] === "") return { lines: [], omitted: 0 };
  return { lines: selected, omitted: Math.max(0, lineCount - selected.length) };
}

// ../../.pi/agent/npm/node_modules/@quandev104/pi-style/extension-src/pi-style/features/tools/boxed/command-shape.ts
var BASH_PREFIX_COMMANDS = /* @__PURE__ */ new Set(["sudo", "env", "time", "nice", "nohup", "command", "stdbuf", "ionice", "watch"]);
var BASH_SHELL_META_CHARS = /* @__PURE__ */ new Set(["<", ">", "(", ")", "`"]);
function tokenizeCommandLine(line) {
  const tokens = [];
  let current = "";
  let inToken = false;
  let quote = null;
  let hasMeta = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i] ?? "";
    if (quote) {
      if (char === "\\" && quote === '"') {
        current += line[++i] ?? "";
        continue;
      }
      if (char === quote) {
        quote = null;
        continue;
      }
      current += char;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      inToken = true;
      continue;
    }
    if (char === " " || char === "	") {
      if (inToken) {
        tokens.push(current);
        current = "";
        inToken = false;
      }
      continue;
    }
    if (BASH_SHELL_META_CHARS.has(char) || char === "$" && (line[i + 1] ?? "") === "(") {
      hasMeta = true;
      continue;
    }
    current += char;
    inToken = true;
  }
  if (quote) return null;
  if (inToken) tokens.push(current);
  return { tokens, hasMeta };
}
function isHeadOrTailTail(tokens) {
  if (tokens.length === 0 || tokens[0] !== "head" && tokens[0] !== "tail") return false;
  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i] ?? "";
    if (token === "-n") continue;
    if (/^\d+$/.test(token)) continue;
    if (/^-\d+$/.test(token)) continue;
    return false;
  }
  return true;
}
function parseSimpleBashCommand(command, options = {}) {
  const commandText = String(command ?? "").trim();
  if (!commandText || commandText.includes("\n")) return null;
  const tokenized = tokenizeCommandLine(commandText);
  if (!tokenized || tokenized.hasMeta || tokenized.tokens.length === 0) return null;
  let tokens = tokenized.tokens;
  if (options.allowTrailingTruncationPipe) {
    const pipes = tokens.flatMap((token, i) => token === "|" ? [i] : []);
    if (pipes.length > 0) {
      if (pipes.length > 1) return null;
      const last = pipes[0] ?? -1;
      if (!isHeadOrTailTail(tokens.slice(last + 1))) return null;
      tokens = tokens.slice(0, last);
    }
  } else if (tokens.includes("|")) {
    return null;
  }
  let index = 0;
  while (index < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[index] ?? "")) index++;
  while (index < tokens.length && BASH_PREFIX_COMMANDS.has(tokens[index] ?? "")) index++;
  let cdDir;
  while (tokens[index] === "cd" && index + 2 < tokens.length && tokens[index + 1] !== void 0 && (tokens[index + 2] === "&&" || tokens[index + 2] === ";")) {
    cdDir = tokens[index + 1];
    index += 3;
  }
  const rest = tokens.slice(index);
  if (rest.length === 0 || rest.some((token) => token === "&&" || token === ";" || token === "&")) return null;
  return { tokens: rest, ...cdDir !== void 0 ? { cdDir } : {} };
}

// ../../.pi/agent/npm/node_modules/@quandev104/pi-style/extension-src/pi-style/features/tools/boxed/path.ts
import { sliceByColumn } from "@earendil-works/pi-tui";
var TOOL_PATH_MAX_WIDTH = 60;
var OMITTED_DIRECTORIES = "../../../";
function compactToolPath(path, availableWidth = TOOL_PATH_MAX_WIDTH) {
  const width = Math.max(0, Math.floor(Math.min(TOOL_PATH_MAX_WIDTH, availableWidth)));
  if (width === 0) return "";
  if (safeVisibleWidth(path) <= width) return path;
  const range = /:\d+(?:-\d*)?$/.exec(path)?.[0] ?? "";
  const body = range ? path.slice(0, -range.length) : path;
  const trailingSlash = /[/\\]$/.test(body) ? "/" : "";
  const parts = body.replace(/\\/g, "/").split("/").filter(Boolean);
  const basename = parts.at(-1) ?? body;
  const suffix = `${trailingSlash}${range}`;
  const tail = `${basename}${suffix}`;
  if (parts.length > 1) {
    const root = `${body.startsWith("/") ? "/" : ""}${parts[0]}/`;
    const compact = `${root}${OMITTED_DIRECTORIES}${tail}`;
    if (safeVisibleWidth(compact) <= width) return compact;
    const compactTail = `.../${tail}`;
    if (safeVisibleWidth(compactTail) <= width) return compactTail;
  }
  if (safeVisibleWidth(tail) <= width) return tail;
  const nameWidth = width - safeVisibleWidth(suffix);
  if (nameWidth <= 3) return sliceByColumn(tail, safeVisibleWidth(tail) - width, width, true);
  const remaining = nameWidth - 3;
  const endWidth = Math.min(Math.ceil(remaining / 2), safeVisibleWidth(basename));
  const start = sliceByColumn(basename, 0, remaining - endWidth, true);
  const end = sliceByColumn(basename, safeVisibleWidth(basename) - endWidth, endWidth, true);
  return `${start}...${end}${suffix}`;
}

// ../../.pi/agent/npm/node_modules/@quandev104/pi-style/extension-src/pi-style/features/tools/boxed/output-tree.ts
var TREE_INDENT = "  ";
var TREE_CHILD_INDENT = "  ";
var OUTPUT_TREE_HEAD_LIMIT = 6;
var NOTICE_LINE_PATTERN = /^\[[^\]]*\]$/;
function stripNotices(text) {
  return text.replace(/\r/g, "").split("\n").map((line) => line.trimEnd()).filter((line) => line.length > 0 && !NOTICE_LINE_PATTERN.test(line.trim()));
}
function parseLsOutput(rawText) {
  return stripNotices(rawText).map((line) => line.trim()).filter((line) => line.length > 0 && line !== "(empty directory)");
}
function parseLsLongOutput(rawText) {
  const entries = [];
  for (const line of stripNotices(rawText)) {
    if (!/^[bcdlsp-][rwxtsST-]{9}/.test(line)) continue;
    const parts = line.split(/\s+/);
    const name = parts.slice(8).join(" ").trim();
    if (!name || name === "." || name === "..") continue;
    const isDir = (parts[0] ?? "").startsWith("d");
    entries.push(isDir ? `${name}/` : name);
  }
  return entries;
}
function parseFindOutput(rawText) {
  return stripNotices(rawText).map((line) => line.trim()).filter((line) => line.length > 0);
}
var GREP_MATCH_PATTERN = /^(.*):(\d+):[ \t]?(.*)$/;
var GREP_BARE_PATTERN = /^(\d+):[ \t]?(.*)$/;
function parseGrepOutput(rawText) {
  const matches = [];
  for (const line of stripNotices(rawText)) {
    const match = GREP_MATCH_PATTERN.exec(line);
    if (!match) continue;
    const [, file, lineNo, content] = match;
    if (!file || lineNo === void 0 || content === void 0) continue;
    const parsed = Number(lineNo);
    if (!Number.isFinite(parsed) || parsed < 1) continue;
    matches.push({ file, line: parsed, content });
  }
  return matches;
}
function parseGrepBareOutput(rawText, file) {
  const matches = [];
  for (const line of stripNotices(rawText)) {
    const match = GREP_BARE_PATTERN.exec(line);
    if (!match) continue;
    const parsed = Number(match[1]);
    if (!Number.isFinite(parsed) || parsed < 1) continue;
    matches.push({ file, line: parsed, content: match[2] ?? "" });
  }
  return matches;
}
function groupMatchesByFile(matches) {
  const order = [];
  const buckets = /* @__PURE__ */ new Map();
  for (const match of matches) {
    let bucket = buckets.get(match.file);
    if (!bucket) {
      bucket = [];
      buckets.set(match.file, bucket);
      order.push(match.file);
    }
    bucket.push(match);
  }
  return order.map((file) => ({ file, matches: buckets.get(file) ?? [] }));
}
function renderOutputTree(theme, header, entries, width, options = {}) {
  const headLimit = options.headLimit ?? OUTPUT_TREE_HEAD_LIMIT;
  const moreUnit = options.moreUnit ?? "file";
  const entryColor = options.entryColor ?? "toolOutput";
  const indent = options.indent ?? TREE_INDENT;
  const safeWidth = Math.max(1, width);
  const label = (entry) => {
    return compactToolPath(entry, safeWidth - safeVisibleWidth(indent) - 3);
  };
  const out = [safeTruncateToWidth(header, safeWidth, "\u2026")];
  if (entries.length === 0) return out;
  const visible = entries.slice(0, headLimit);
  const more = entries.length - visible.length;
  const lastIndex = visible.length - 1;
  for (let i = 0; i < visible.length; i++) {
    const branch = i < lastIndex || more > 0 ? "\u251C\u2500" : "\u2514\u2500";
    const line = `${indent}${dimLine(branch)} ${theme.fg(entryColor, label(visible[i] ?? ""))}`;
    out.push(safeTruncateToWidth(line, safeWidth, "\u2026"));
  }
  if (more > 0) {
    const line = `${indent}${dimLine("\u2514\u2500")} ${theme.fg("dim", `\u2026 ${more} more ${pluralForm(moreUnit, more)}`)}`;
    out.push(safeTruncateToWidth(line, safeWidth, "\u2026"));
  }
  return out;
}
function renderGrepFilesTree(theme, header, matches, width, options = {}) {
  const files = groupMatchesByFile(matches).map((group) => group.file);
  return renderOutputTree(theme, header, files, width, {
    headLimit: options.headLimit ?? OUTPUT_TREE_HEAD_LIMIT,
    moreUnit: "file",
    entryColor: "accent",
    indent: options.indent ?? TREE_INDENT
  });
}
function pluralForm(noun, count) {
  if (count === 1) return noun;
  return /(s|x|z|ch|sh)$/i.test(noun) ? `${noun}es` : `${noun}s`;
}

// ../../.pi/agent/npm/node_modules/@quandev104/pi-style/extension-src/pi-style/features/tools/boxed/session-config.ts
var sessionToolsConfig = {
  maxCollapsedLines: 10,
  maxExpandedLines: 50,
  dimOutput: false,
  showElapsed: true,
  batchOpenGlyph: "\u25CF",
  nerdFonts: false,
  glyphMode: "unicode",
  collapseAfterTurn: true,
  collapseMutatingTools: false,
  mergeChunkedReads: true,
  mergedTurnSummary: true,
  mergedSummaryGlyph: "\u25C8"
};
function setToolsRenderConfig(config) {
  sessionToolsConfig = { ...sessionToolsConfig, ...config, nerdFonts: false };
}
function getToolsRenderConfig() {
  return sessionToolsConfig;
}
function getToolsRenderCacheSignature() {
  return [
    sessionToolsConfig.maxCollapsedLines,
    sessionToolsConfig.maxExpandedLines,
    sessionToolsConfig.dimOutput ? 1 : 0,
    sessionToolsConfig.showElapsed ? 1 : 0,
    sessionToolsConfig.batchOpenGlyph,
    sessionToolsConfig.glyphMode,
    sessionToolsConfig.collapseAfterTurn ? 1 : 0,
    sessionToolsConfig.collapseMutatingTools ? 1 : 0,
    sessionToolsConfig.mergeChunkedReads ? 1 : 0,
    sessionToolsConfig.mergedTurnSummary ? 1 : 0,
    sessionToolsConfig.mergedSummaryGlyph
  ].join("|");
}
var STARTED_AT_KEY = "__piStyleStartedAt";
var ENDED_AT_KEY = "__piStyleEndedAt";
var RESULT_SEEN_KEY = "__piStyleResultSeen";
var TICKER_KEY = "__piStyleElapsedTicker";
function recordExecutionStarted(state, executionStarted) {
  if (!executionStarted || !state || typeof state !== "object") return;
  if (typeof state[STARTED_AT_KEY] !== "number") state[STARTED_AT_KEY] = performance.now();
}
function recordExecutionEnded(state) {
  if (!state || typeof state !== "object") return;
  if (typeof state[ENDED_AT_KEY] !== "number") state[ENDED_AT_KEY] = performance.now();
}
function getStateElapsedMs(state) {
  if (!state || typeof state !== "object") return void 0;
  const started = state[STARTED_AT_KEY];
  if (typeof started !== "number") return void 0;
  const ended = state[ENDED_AT_KEY];
  if (typeof ended === "number") return Math.max(0, ended - started);
  return Math.max(0, performance.now() - started);
}
function isResultSeen(state) {
  return Boolean(state && typeof state === "object" && state[RESULT_SEEN_KEY] === true);
}
function markResultSeen(state) {
  if (!state || typeof state !== "object") return;
  state[RESULT_SEEN_KEY] = true;
}
var tickerEntries = /* @__PURE__ */ new Map();
var sharedTickerHandle;
function ensureSharedTicker() {
  if (sharedTickerHandle !== void 0 || tickerEntries.size === 0) return;
  sharedTickerHandle = setInterval(() => {
    for (const { invalidate } of tickerEntries.values()) invalidate();
  }, 1e3);
}
function stopSharedTickerIfIdle() {
  if (sharedTickerHandle === void 0 || tickerEntries.size > 0) return;
  clearInterval(sharedTickerHandle);
  sharedTickerHandle = void 0;
}
function startElapsedTicker(state, invalidate) {
  if (!state || typeof state !== "object") return;
  state[TICKER_KEY] = true;
  tickerEntries.set(state, { invalidate });
  ensureSharedTicker();
}
function stopElapsedTicker(state) {
  if (!state || typeof state !== "object") return;
  delete state[TICKER_KEY];
  tickerEntries.delete(state);
  stopSharedTickerIfIdle();
}
function stopAllElapsedTickers() {
  for (const state of tickerEntries.keys()) delete state[TICKER_KEY];
  tickerEntries.clear();
  stopSharedTickerIfIdle();
}

// ../../.pi/agent/npm/node_modules/@quandev104/pi-style/extension-src/pi-style/features/tools/boxed/gh.ts
var GH_REPO_VALUE_FLAGS = /* @__PURE__ */ new Set(["-R", "--repo"]);
function stripRepoFlags(args) {
  const out = [];
  for (let i = 0; i < args.length; ) {
    const token = args[i] ?? "";
    if (GH_REPO_VALUE_FLAGS.has(token)) {
      i += 2;
      continue;
    }
    if (token.startsWith("--repo=")) {
      i += 1;
      continue;
    }
    out.push(token);
    i += 1;
  }
  return out;
}
function findJobId(args) {
  for (let i = 0; i < args.length; i++) {
    const token = args[i] ?? "";
    if (token === "--job") return args[i + 1];
    const attached = /^--job=(.+)$/.exec(token);
    if (attached) return attached[1];
  }
  return void 0;
}
function classifyGhCommand(command) {
  const shape = parseSimpleBashCommand(command);
  if (!shape) return null;
  const rest = shape.tokens;
  if ((rest[0] ?? "").split("/").pop() !== "gh") return null;
  const args = rest.slice(1);
  if (args.length === 0) return null;
  const tokens = stripRepoFlags(args);
  const commandWord = tokens[0];
  const subcommand = tokens[1];
  if (commandWord === "pr") {
    if (subcommand === "list") return { kind: "pr-list" };
    if (subcommand === "view") return { kind: "pr-view" };
    if (subcommand === "checks") return { kind: "pr-checks" };
    if (subcommand === "create") return { kind: "pr-create" };
    return null;
  }
  if (commandWord === "issue") {
    if (subcommand === "list") return { kind: "issue-list" };
    if (subcommand === "view") return { kind: "issue-view" };
    return null;
  }
  if (commandWord === "run") {
    if (subcommand === "list") return { kind: "run-list" };
    if (subcommand === "view") {
      const jobId = findJobId(args);
      if (jobId !== void 0) return { kind: "run-job", jobId };
      return { kind: "run-view" };
    }
    return null;
  }
  return null;
}
var GH_STATES = /* @__PURE__ */ new Set(["OPEN", "CLOSED", "MERGED"]);
var GH_CHECK_STATES = /* @__PURE__ */ new Set([
  "pass",
  "fail",
  "pending",
  "skipping",
  "neutral",
  "cancelled",
  "timed_out",
  "startup_failure",
  "stale",
  "action_required"
]);
function probeJson(text) {
  const trimmed = text.trimStart();
  const first = trimmed[0];
  if (first !== "{" && first !== "[") return { notJson: true };
  try {
    return { json: JSON.parse(trimmed) };
  } catch {
    return null;
  }
}
function asString(value) {
  return typeof value === "string" ? value : void 0;
}
function asNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : void 0;
}
function authorOf(value) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") return asString(value.login);
  return void 0;
}
function nameList(value, field = "login") {
  if (!Array.isArray(value) || value.length === 0) return void 0;
  const names = value.map((item) => item && typeof item === "object" ? asString(item[field]) : void 0).filter((name) => typeof name === "string");
  return names.length > 0 ? names.join(", ") : void 0;
}
function parseListTable(text, kind) {
  const rows = [];
  for (const rawLine of text.replace(/\r/g, "").split("\n")) {
    const line = rawLine.trimEnd();
    if (line === "") continue;
    const fields = line.split("	");
    if (fields.length < 4) return null;
    const numberField = fields[0] ?? "";
    if (!/^\d+$/.test(numberField)) return null;
    const title = fields[1] ?? "";
    let stateIndex = -1;
    for (let i = 2; i < fields.length - 1; i++) {
      if (GH_STATES.has((fields[i] ?? "").toUpperCase())) {
        stateIndex = i;
        break;
      }
    }
    if (stateIndex < 0) return null;
    const state = (fields[stateIndex] ?? "").toUpperCase();
    const branch = kind === "pr-list" ? fields[2] ?? "" : "";
    rows.push({
      number: Number(numberField),
      title,
      ...branch ? { branch } : {},
      state
    });
  }
  return { kind, rows };
}
function parseListJson(json, kind) {
  if (!Array.isArray(json)) return null;
  const rows = [];
  for (const item of json) {
    if (!item || typeof item !== "object") return null;
    const obj = item;
    const number = asNumber(obj.number);
    if (number === void 0) return null;
    const title = asString(obj.title);
    if (title === void 0) return null;
    const stateRaw = asString(obj.state);
    if (stateRaw === void 0 || !GH_STATES.has(stateRaw.toUpperCase())) return null;
    const branch = asString(obj.headRefName);
    rows.push({ number, title, state: stateRaw.toUpperCase(), ...branch ? { branch } : {} });
  }
  return { kind, rows };
}
function parseGhList(text, kind) {
  const probe = probeJson(text);
  if (probe === null) return null;
  if ("notJson" in probe) return parseListTable(text, kind);
  return parseListJson(probe.json, kind);
}
var VIEW_FIELD_LINE = /^([a-zA-Z][a-zA-Z0-9-]*?):\t(.*)$/;
function parseViewRich(text, kind) {
  const lines = text.replace(/\r/g, "").split("\n");
  const fields = {};
  let bodyStart = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (line === "--") {
      bodyStart = i + 1;
      break;
    }
    const match = VIEW_FIELD_LINE.exec(line);
    if (!match) {
      if (line.trim() === "") continue;
      return null;
    }
    const key = match[1] ?? "";
    const value = match[2] ?? "";
    if (fields[key] === void 0) fields[key] = value;
  }
  const title = fields.title;
  const stateRaw = fields.state;
  if (!title || !stateRaw) return null;
  const state = stateRaw.toUpperCase();
  const body = bodyStart >= 0 ? lines.slice(bodyStart).join("\n").replace(/\s+$/u, "") : void 0;
  const number = /^\d+$/.test(fields.number ?? "") ? Number(fields.number) : void 0;
  const additions = /^\d+$/.test(fields.additions ?? "") ? Number(fields.additions) : void 0;
  const deletions = /^\d+$/.test(fields.deletions ?? "") ? Number(fields.deletions) : void 0;
  return {
    kind,
    title,
    state,
    ...fields.author ? { author: fields.author } : {},
    ...number !== void 0 ? { number } : {},
    ...fields.url ? { url: fields.url } : {},
    ...additions !== void 0 ? { additions } : {},
    ...deletions !== void 0 ? { deletions } : {},
    ...fields.labels ? { labels: fields.labels } : {},
    ...fields.reviewers ? { reviewers: fields.reviewers } : {},
    ...body?.trim() ? { body } : {}
  };
}
function parseViewJson(json, kind) {
  if (!json || typeof json !== "object" || Array.isArray(json)) return null;
  const o = json;
  const title = asString(o.title);
  const stateRaw = asString(o.state);
  if (!title || !stateRaw || !GH_STATES.has(stateRaw.toUpperCase())) return null;
  const state = stateRaw.toUpperCase();
  const author = authorOf(o.author);
  const number = asNumber(o.number);
  const url = asString(o.url);
  const additions = asNumber(o.additions);
  const deletions = asNumber(o.deletions);
  const changedFiles = asNumber(o.changedFiles);
  const baseRefName = asString(o.baseRefName);
  const headRefName = asString(o.headRefName);
  const mergeable = asString(o.mergeable);
  const reviewDecision = asString(o.reviewDecision);
  const reviewers = nameList(o.reviewRequests) ?? nameList(o.reviews);
  const body = asString(o.body);
  return {
    kind,
    title,
    state,
    ...author ? { author } : {},
    ...number !== void 0 ? { number } : {},
    ...url ? { url } : {},
    ...additions !== void 0 ? { additions } : {},
    ...deletions !== void 0 ? { deletions } : {},
    ...changedFiles !== void 0 ? { changedFiles } : {},
    ...baseRefName ? { baseRefName } : {},
    ...headRefName ? { headRefName } : {},
    ...mergeable ? { mergeable } : {},
    ...reviewDecision ? { reviewDecision } : {},
    ...reviewers ? { reviewers } : {},
    ...body?.trim() ? { body } : {}
  };
}
function parseGhView(text, kind) {
  const probe = probeJson(text);
  if (probe === null) return null;
  if ("notJson" in probe) return parseViewRich(text, kind);
  return parseViewJson(probe.json, kind);
}
function parseChecksTable(text) {
  const rows = [];
  for (const rawLine of text.replace(/\r/g, "").split("\n")) {
    const line = rawLine.trimEnd();
    if (line === "") continue;
    const fields = line.split("	");
    if (fields.length < 2) return null;
    const name = fields[0] ?? "";
    const state = (fields[1] ?? "").toLowerCase();
    if (!GH_CHECK_STATES.has(state)) return null;
    const duration = fields[2] !== void 0 && fields[2] !== "" ? fields[2] : void 0;
    const url = fields[3];
    rows.push({
      name,
      state,
      ...duration ? { duration } : {},
      ...url ? { url } : {}
    });
  }
  return { kind: "pr-checks", rows };
}
var PR_CREATE_URL = /^(https:\/\/github\.com\/[^/\s]+\/[^/\s]+\/pull\/(\d+))/;
function parseGhCreate(text) {
  const trimmed = text.replace(/\r/g, "").trim();
  const match = PR_CREATE_URL.exec(trimmed);
  if (!match) return null;
  const url = match[1] ?? "";
  const number = match[2] !== void 0 ? Number(match[2]) : void 0;
  return { kind: "pr-create", url, ...number !== void 0 ? { number } : {} };
}
function parseRunListTable(text) {
  const rows = [];
  for (const rawLine of text.replace(/\r/g, "").split("\n")) {
    const line = rawLine.trimEnd();
    if (line === "") continue;
    const fields = line.split("	");
    if (fields.length < 7) return null;
    const id = fields[6] ?? "";
    if (!/^\d+$/.test(id)) return null;
    const status = fields[0] ?? "";
    const conclusionField = fields[1] ?? "";
    const conclusion = conclusionField !== "" ? conclusionField : void 0;
    const title = fields[2] ?? "";
    const workflow = fields[3] ?? "";
    const branch = fields[4] ?? "";
    const event = fields[5] ?? "";
    const elapsed = fields[7] !== void 0 && fields[7] !== "" ? fields[7] : void 0;
    rows.push({
      status,
      ...conclusion ? { conclusion } : {},
      title,
      workflow,
      branch,
      event,
      id,
      ...elapsed ? { elapsed } : {}
    });
  }
  return { kind: "run-list", rows };
}
function parseRunListJson(json) {
  if (!Array.isArray(json)) return null;
  const rows = [];
  for (const item of json) {
    if (!item || typeof item !== "object") return null;
    const o = item;
    const status = asString(o.status);
    const id = asNumber(o.databaseId ?? o.id);
    if (status === void 0 || id === void 0) return null;
    const workflow = asString(o.workflowName) ?? asString(o.name) ?? "";
    const title = asString(o.displayTitle) ?? workflow;
    rows.push({
      status,
      ...asString(o.conclusion) ? { conclusion: asString(o.conclusion) } : {},
      title,
      workflow,
      branch: asString(o.headBranch) ?? "",
      event: asString(o.event) ?? "",
      id: String(id),
      ...asString(o.elapsed) ? { elapsed: o.elapsed } : {}
    });
  }
  return { kind: "run-list", rows };
}
function parseGhRunList(text) {
  const probe = probeJson(text);
  if (probe === null) return null;
  if ("notJson" in probe) return parseRunListTable(text);
  return parseRunListJson(probe.json);
}
var RUN_VIEW_STATUS_LINE = /^([✓✗◌*])\s+(\S+)\s+(.+?)\s+·\s+(\d+)\s*$/u;
var RUN_VIEW_JOB_LINE = /^([✓✗◌*])\s+(.+?)\s+\((\d+)\)\s+in\s+(\S+)\s+\(ID\s+(\d+)\)\s*$/u;
function isRunViewHint(line) {
  return line.startsWith("For more information about the job, try:") || line.startsWith("View this run on GitHub:");
}
function parseGhRunView(text) {
  const lines = text.replace(/\r/g, "").split("\n");
  let idx = 0;
  while (idx < lines.length && (lines[idx] ?? "").trim() === "") idx++;
  if (idx >= lines.length) return null;
  const statusMatch = RUN_VIEW_STATUS_LINE.exec(lines[idx] ?? "");
  if (!statusMatch) return null;
  const state = statusMatch[1] ?? "";
  const branch = statusMatch[2] ?? "";
  const workflow = statusMatch[3] ?? "";
  const id = statusMatch[4] ?? "";
  idx++;
  let trigger;
  while (idx < lines.length && (lines[idx] ?? "").trim() === "") idx++;
  if (idx < lines.length && /^Triggered via .+/.test(lines[idx] ?? "")) {
    trigger = lines[idx];
    idx++;
  }
  const jobs = [];
  const annotations = [];
  const skipBlanks = () => {
    while (idx < lines.length && (lines[idx] ?? "").trim() === "") idx++;
  };
  skipBlanks();
  if ((lines[idx] ?? "") === "JOBS") {
    idx++;
    while (idx < lines.length) {
      const line = lines[idx] ?? "";
      if (line === "") {
        idx++;
        break;
      }
      if (line === "ANNOTATIONS" || isRunViewHint(line)) break;
      const jobMatch = RUN_VIEW_JOB_LINE.exec(line);
      if (!jobMatch) return null;
      jobs.push({
        state: jobMatch[1] ?? "",
        name: jobMatch[2] ?? "",
        count: Number(jobMatch[3] ?? 0),
        duration: jobMatch[4] ?? "",
        id: jobMatch[5] ?? ""
      });
      idx++;
    }
  }
  skipBlanks();
  if ((lines[idx] ?? "") === "ANNOTATIONS") {
    idx++;
    while (idx < lines.length) {
      const line = lines[idx] ?? "";
      if (line === "") {
        idx++;
        break;
      }
      if (isRunViewHint(line)) break;
      const annotationMatch = /^!\s+(.+)$/.exec(line);
      if (annotationMatch) {
        annotations.push({ text: annotationMatch[1] ?? "" });
        idx++;
        continue;
      }
      const sourceMatch = /^[A-Za-z0-9_ ./()-]+\(\d+\): \S+#\d+$/.exec(line);
      if (sourceMatch) {
        annotations.push({ text: line });
        idx++;
        continue;
      }
      return null;
    }
  }
  for (let i = idx; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (line.trim() === "") continue;
    if (isRunViewHint(line)) continue;
    return null;
  }
  return {
    kind: "run-view",
    ...state ? { state } : {},
    ...branch ? { branch } : {},
    ...workflow ? { workflow } : {},
    ...id ? { id } : {},
    ...trigger ? { trigger } : {},
    jobs,
    annotations
  };
}
function parseGhRunJob(text, jobId) {
  const body = String(text ?? "").replace(/\r/g, "");
  const lines = body.split("\n");
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return { kind: "run-job", jobId, lines };
}
function parseGhOutput(cls, output) {
  const text = String(output ?? "");
  switch (cls.kind) {
    case "pr-list":
      return parseGhList(text, "pr-list");
    case "issue-list":
      return parseGhList(text, "issue-list");
    case "pr-view":
      return parseGhView(text, "pr-view");
    case "issue-view":
      return parseGhView(text, "issue-view");
    case "pr-checks":
      return parseChecksTable(text);
    case "pr-create":
      return parseGhCreate(text);
    case "run-list":
      return parseGhRunList(text);
    case "run-view":
      return parseGhRunView(text);
    case "run-job":
      return parseGhRunJob(text, cls.jobId);
  }
}
var GH_CARD_HEAD_LIMIT = 6;
var GH_BODY_PREVIEW_LINES = 8;
function ghCardHeader(theme, cls, parsed) {
  let prefix;
  switch (cls.kind) {
    case "pr-list":
      prefix = "PRs";
      break;
    case "pr-view":
      prefix = "PR";
      break;
    case "pr-checks":
      prefix = "PR checks";
      break;
    case "pr-create":
      prefix = "PR created";
      break;
    case "issue-list":
      prefix = "Issues";
      break;
    case "issue-view":
      prefix = "Issue";
      break;
    case "run-list":
      prefix = "Runs";
      break;
    case "run-view":
      prefix = "Run";
      break;
    case "run-job":
      prefix = "Run job";
      break;
  }
  if (parsed) {
    if (parsed.kind === "pr-view" || parsed.kind === "issue-view") {
      if (parsed.number !== void 0) prefix += ` #${parsed.number}`;
      prefix += ` \xB7 ${parsed.title}`;
    } else if (parsed.kind === "pr-create") {
      if (parsed.number !== void 0) prefix += ` #${parsed.number}`;
    } else if (parsed.kind === "run-view") {
      if (parsed.workflow) prefix += ` \xB7 ${parsed.workflow}`;
      if (parsed.id) prefix += ` \xB7 ${parsed.id}`;
    } else if (parsed.kind === "run-job") {
      prefix += ` \xB7 ${parsed.jobId}`;
    }
  }
  return typeof theme?.bold === "function" ? theme.bold(prefix) : prefix;
}
function ghStateColor(state) {
  if (state === "OPEN") return "accent";
  if (state === "MERGED") return "toolDiffAdded";
  return "dim";
}
function runGlyph(theme, status, conclusion) {
  if (status === "completed") {
    if (conclusion === "success") return theme.fg("toolDiffAdded", "\u2713");
    if (conclusion === "failure") return theme.fg("error", "\u2717");
    return theme.fg("dim", "\u25CC");
  }
  return theme.fg("warning", "\u25CC");
}
function runStateGlyph(theme, glyph) {
  if (glyph === "\u2713") return theme.fg("toolDiffAdded", "\u2713");
  if (glyph === "\u2717") return theme.fg("error", "\u2717");
  return theme.fg("warning", "\u25CC");
}
function checkStateColor(state) {
  if (state === "pass") return "toolDiffAdded";
  if (state === "fail") return "error";
  if (state === "pending") return "warning";
  return "dim";
}
function renderMoreRow(theme, unit, more, width) {
  return safeTruncateToWidth(
    `${TREE_INDENT}${dimLine("\u2514\u2500")} ${theme.fg("dim", `\u2026 ${more} more ${pluralForm(unit, more)}`)}`,
    width,
    "\u2026"
  );
}
function renderListCard(theme, parsed, out, width) {
  const rows = parsed.rows;
  const noun = parsed.kind === "pr-list" ? "PR" : "issue";
  if (rows.length === 0) {
    out.push(theme.fg("muted", `  no open ${pluralForm(noun, 2)}`));
    return out;
  }
  out.push(`  ${theme.fg("accent", `${rows.length} ${pluralForm(noun, rows.length)}`)}`);
  const visible = rows.slice(0, GH_CARD_HEAD_LIMIT);
  const more = rows.length - visible.length;
  const lastIndex = visible.length - 1;
  for (let i = 0; i < visible.length; i++) {
    const row = visible[i];
    if (!row) continue;
    const branchGlyph = i < lastIndex || more > 0 ? "\u251C\u2500" : "\u2514\u2500";
    const color = ghStateColor(row.state);
    const num = theme.fg(color, `#${row.number}`);
    const title = theme.fg("toolOutput", row.title);
    const stateSuffix = row.state !== "OPEN" ? theme.fg("dim", ` (${row.state.toLowerCase()})`) : "";
    const branchPart = row.branch ? theme.fg("dim", `  ${row.branch}`) : "";
    const line = `${TREE_INDENT}${dimLine(branchGlyph)} ${num}  ${title}${stateSuffix}${branchPart}`;
    out.push(safeTruncateToWidth(line, width, "\u2026"));
  }
  if (more > 0) out.push(renderMoreRow(theme, noun, more, width));
  return out;
}
function renderBodyPreview(theme, body, out, width) {
  const bodyLines = body.replace(/\s+$/u, "").split("\n");
  const visible = bodyLines.slice(0, GH_BODY_PREVIEW_LINES);
  for (const line of visible) {
    out.push(safeTruncateToWidth(`  ${theme.fg("muted", line)}`, width, "\u2026"));
  }
  const more = bodyLines.length - visible.length;
  if (more > 0) {
    out.push(safeTruncateToWidth(`  ${theme.fg("dim", `\u2026 ${more} more lines \xB7 Ctrl+O`)}`, width, "\u2026"));
  }
  return out;
}
function renderViewCard(theme, parsed, out, width) {
  const stateParts = [theme.fg(ghStateColor(parsed.state), parsed.state)];
  if (parsed.baseRefName && parsed.headRefName) {
    stateParts.push(theme.fg("dim", "\xB7"), theme.fg("text", `${parsed.baseRefName} \u2192 ${parsed.headRefName}`));
  }
  out.push(safeTruncateToWidth(`  ${stateParts.join(theme.fg("dim", " "))}`, width, "\u2026"));
  const summaryParts = [];
  const diffParts = [];
  if (parsed.additions !== void 0 && parsed.additions > 0) {
    diffParts.push(theme.fg("toolDiffAdded", `+${parsed.additions}`));
  }
  if (parsed.deletions !== void 0 && parsed.deletions > 0) {
    diffParts.push(theme.fg("toolDiffRemoved", `-${parsed.deletions}`));
  }
  if (diffParts.length > 0) summaryParts.push(diffParts.join(" "));
  if (parsed.changedFiles !== void 0) {
    summaryParts.push(theme.fg("accent", `${parsed.changedFiles} ${pluralForm("file", parsed.changedFiles)}`));
  }
  if (summaryParts.length > 0) {
    out.push(safeTruncateToWidth(`  ${summaryParts.join(theme.fg("dim", " \xB7 "))}`, width, "\u2026"));
  }
  if (parsed.author) {
    out.push(safeTruncateToWidth(`  ${theme.fg("dim", "author")} ${theme.fg("text", parsed.author)}`, width, "\u2026"));
  }
  if (parsed.reviewers) {
    out.push(
      safeTruncateToWidth(`  ${theme.fg("dim", "reviewers")} ${theme.fg("toolOutput", parsed.reviewers)}`, width, "\u2026")
    );
  } else if (parsed.reviewDecision) {
    out.push(
      safeTruncateToWidth(`  ${theme.fg("dim", "review")} ${theme.fg("text", parsed.reviewDecision)}`, width, "\u2026")
    );
  }
  if (parsed.mergeable) {
    out.push(
      safeTruncateToWidth(`  ${theme.fg("dim", "mergeable")} ${theme.fg("text", parsed.mergeable)}`, width, "\u2026")
    );
  }
  if (parsed.body?.trim()) renderBodyPreview(theme, parsed.body, out, width);
  return out;
}
function renderChecksCard(theme, parsed, out, width) {
  const rows = parsed.rows;
  if (rows.length === 0) {
    out.push(theme.fg("muted", "  no checks reported"));
    return out;
  }
  const visible = rows.slice(0, GH_CARD_HEAD_LIMIT);
  const more = rows.length - visible.length;
  const lastIndex = visible.length - 1;
  for (let i = 0; i < visible.length; i++) {
    const row = visible[i];
    if (!row) continue;
    const branchGlyph = i < lastIndex || more > 0 ? "\u251C\u2500" : "\u2514\u2500";
    const name = theme.fg("toolOutput", row.name);
    const state = theme.fg(checkStateColor(row.state), row.state);
    const duration = row.duration && row.duration !== "0" ? theme.fg("dim", `  ${row.duration}`) : "";
    const line = `${TREE_INDENT}${dimLine(branchGlyph)} ${name}  ${state}${duration}`;
    out.push(safeTruncateToWidth(line, width, "\u2026"));
  }
  if (more > 0) out.push(renderMoreRow(theme, "check", more, width));
  return out;
}
function renderCreateCard(theme, parsed, out, width) {
  out.push(safeTruncateToWidth(`  ${theme.fg("text", parsed.url)}`, width, "\u2026"));
  return out;
}
function renderRunListCard(theme, parsed, out, width) {
  const rows = parsed.rows;
  if (rows.length === 0) {
    out.push(theme.fg("muted", "  no recent runs"));
    return out;
  }
  const visible = rows.slice(0, GH_CARD_HEAD_LIMIT);
  const more = rows.length - visible.length;
  const lastIndex = visible.length - 1;
  for (let i = 0; i < visible.length; i++) {
    const row = visible[i];
    if (!row) continue;
    const branchGlyph = i < lastIndex || more > 0 ? "\u251C\u2500" : "\u2514\u2500";
    const glyph = runGlyph(theme, row.status, row.conclusion);
    const workflow = theme.fg("text", row.workflow || row.title);
    const branch = theme.fg("dim", `  ${row.branch}`);
    const id = theme.fg("dim", `  ${row.id}`);
    const line = `${TREE_INDENT}${dimLine(branchGlyph)} ${glyph} ${workflow}${branch}${id}`;
    out.push(safeTruncateToWidth(line, width, "\u2026"));
  }
  if (more > 0) out.push(renderMoreRow(theme, "run", more, width));
  return out;
}
function renderRunViewCard(theme, parsed, out, width) {
  if (parsed.trigger) {
    out.push(safeTruncateToWidth(`  ${theme.fg("dim", parsed.trigger)}`, width, "\u2026"));
  }
  const visibleJobs = parsed.jobs.slice(0, GH_CARD_HEAD_LIMIT);
  const moreJobs = parsed.jobs.length - visibleJobs.length;
  const lastJobIndex = visibleJobs.length - 1;
  for (let i = 0; i < visibleJobs.length; i++) {
    const job = visibleJobs[i];
    if (!job) continue;
    const branchGlyph = i < lastJobIndex || moreJobs > 0 || parsed.annotations.length > 0 ? "\u251C\u2500" : "\u2514\u2500";
    const glyph = runStateGlyph(theme, job.state);
    const name = theme.fg("toolOutput", `${job.name}${job.count !== void 0 ? ` (${job.count})` : ""}`);
    const detail = theme.fg("dim", `${job.duration ? ` ${job.duration}` : ""}${job.id ? ` \xB7 ${job.id}` : ""}`);
    const line = `${TREE_INDENT}${dimLine(branchGlyph)} ${glyph} ${name}${detail}`;
    out.push(safeTruncateToWidth(line, width, "\u2026"));
  }
  if (moreJobs > 0) out.push(renderMoreRow(theme, "job", moreJobs, width));
  for (let i = 0; i < parsed.annotations.length; i++) {
    const annotation = parsed.annotations[i];
    if (!annotation) continue;
    const branchGlyph = i < parsed.annotations.length - 1 ? "\u251C\u2500" : "\u2514\u2500";
    const line = `${TREE_INDENT}${dimLine(branchGlyph)} ${theme.fg("warning", "!")} ${theme.fg("dim", annotation.text)}`;
    out.push(safeTruncateToWidth(line, width, "\u2026"));
  }
  return out;
}
function renderGhCardLines(theme, state, width) {
  const safeWidth = Math.max(1, width);
  const out = [safeTruncateToWidth(ghCardHeader(theme, state.cls, state.parsed), safeWidth, "\u2026")];
  const parsed = state.parsed;
  if (!parsed) return out;
  if (parsed.kind === "pr-list" || parsed.kind === "issue-list") renderListCard(theme, parsed, out, safeWidth);
  else if (parsed.kind === "pr-view" || parsed.kind === "issue-view") renderViewCard(theme, parsed, out, safeWidth);
  else if (parsed.kind === "pr-checks") renderChecksCard(theme, parsed, out, safeWidth);
  else if (parsed.kind === "pr-create") renderCreateCard(theme, parsed, out, safeWidth);
  else if (parsed.kind === "run-list") renderRunListCard(theme, parsed, out, safeWidth);
  else if (parsed.kind === "run-view") renderRunViewCard(theme, parsed, out, safeWidth);
  return out.map((line) => safeTruncateToWidth(line, safeWidth, "\u2026"));
}
var GH_RUN_JOB_BUDGET_COLLAPSED = 40;
var GH_RUN_JOB_BUDGET_EXPANDED = 200;
function renderGhRunJobResult(theme, parsed, options, context) {
  const expanded = Boolean(options.expanded);
  const elapsedMs = getStateElapsedMs(context.state);
  const footerParts = [];
  if (elapsedMs !== void 0) footerParts.push(theme.fg("text", formatElapsedMs(elapsedMs)));
  const footer = footerParts.join(theme.fg("dim", " \xB7 "));
  const hasLog = parsed.lines.some((line) => line.trim() !== "");
  const budget = expanded ? GH_RUN_JOB_BUDGET_EXPANDED : GH_RUN_JOB_BUDGET_COLLAPSED;
  return renderBoxedToolResult(
    theme,
    () => hasLog ? parsed.lines.map((line) => theme.fg("toolOutput", line)) : [theme.fg("muted", "No log output")],
    {
      dividerLabel: `Log \xB7 ${parsed.jobId}`,
      footerLines: footer ? [footer] : [],
      renderLineBudget: budget
    }
  );
}

// ../../.pi/agent/npm/node_modules/@quandev104/pi-style/extension-src/pi-style/features/tools/boxed/git.ts
import { getLanguageFromPath } from "./syntax.mjs";

// ../../.pi/agent/npm/node_modules/@quandev104/pi-style/extension-src/pi-style/shared/split-diff.ts
import { highlightCode } from "./syntax.mjs";
var ESC2 = "\x1B";
var BG_ANSI_PATTERN = new RegExp(`${ESC2}\\[(?:4\\d|10\\d|48;5;\\d{1,3}|48;2;\\d{1,3};\\d{1,3};\\d{1,3}|49)m`, "g");
var ANSI_SGR_PATTERN = new RegExp(`${ESC2}\\[([0-9;]*)m`, "g");
var CONTROL_CHARS = "\0-\b\v\f-\x7F";
var CONTROL_CHARS_PATTERN = new RegExp(`[${CONTROL_CHARS}]`, "g");
var ADD_ROW_BACKGROUND_MIX_RATIO = 0.24;
var REMOVE_ROW_BACKGROUND_MIX_RATIO = 0.12;
var ADD_INLINE_EMPHASIS_MIX_RATIO = 0.44;
var REMOVE_INLINE_EMPHASIS_MIX_RATIO = 0.26;
var CONTEXT_KEEP_DEFAULT = 2;
var CONTEXT_RUN_SHOW_MAX = 4;
var SPLIT_DIFF_MIN_WIDTH = 114;
function ansi256ToRgb(code) {
  if (code <= 15) {
    const base16 = [
      { r: 0, g: 0, b: 0 },
      { r: 128, g: 0, b: 0 },
      { r: 0, g: 128, b: 0 },
      { r: 128, g: 128, b: 0 },
      { r: 0, g: 0, b: 128 },
      { r: 128, g: 0, b: 128 },
      { r: 0, g: 128, b: 128 },
      { r: 192, g: 192, b: 192 },
      { r: 128, g: 128, b: 128 },
      { r: 255, g: 0, b: 0 },
      { r: 0, g: 255, b: 0 },
      { r: 255, g: 255, b: 0 },
      { r: 0, g: 0, b: 255 },
      { r: 255, g: 0, b: 255 },
      { r: 0, g: 255, b: 255 },
      { r: 255, g: 255, b: 255 }
    ];
    return base16[code] ?? { r: 255, g: 255, b: 255 };
  }
  if (code >= 232) {
    const value = Math.max(0, Math.min(255, 8 + (code - 232) * 10));
    return { r: value, g: value, b: value };
  }
  const cube = code - 16;
  const levels = [0, 95, 135, 175, 215, 255];
  const blue = cube % 6;
  const green = Math.floor(cube / 6) % 6;
  const red = Math.floor(cube / 36) % 6;
  return {
    r: levels[red] ?? 0,
    g: levels[green] ?? 0,
    b: levels[blue] ?? 0
  };
}
function parseAnsiColorCode(ansi) {
  if (!ansi) return null;
  const rgbMatch = new RegExp(`${ESC2}\\[(?:3|4)8;2;(\\d{1,3});(\\d{1,3});(\\d{1,3})m`).exec(ansi);
  if (rgbMatch) {
    const r = Number.parseInt(rgbMatch[1] ?? "0", 10);
    const g = Number.parseInt(rgbMatch[2] ?? "0", 10);
    const b = Number.parseInt(rgbMatch[3] ?? "0", 10);
    return { r, g, b };
  }
  const bitMatch = new RegExp(`${ESC2}\\[(?:3|4)8;5;(\\d{1,3})m`).exec(ansi);
  if (bitMatch) {
    const code = Number.parseInt(bitMatch[1] ?? "0", 10);
    return ansi256ToRgb(code);
  }
  return null;
}
function rgbToBgAnsi(color) {
  const r = Math.max(0, Math.min(255, Math.round(color.r)));
  const g = Math.max(0, Math.min(255, Math.round(color.g)));
  const b = Math.max(0, Math.min(255, Math.round(color.b)));
  return `\x1B[48;2;${r};${g};${b}m`;
}
function mixRgb(base, tint, ratio) {
  const clamped = Math.max(0, Math.min(1, ratio));
  return {
    r: base.r * (1 - clamped) + tint.r * clamped,
    g: base.g * (1 - clamped) + tint.g * clamped,
    b: base.b * (1 - clamped) + tint.b * clamped
  };
}
function resolveDiffPalette(theme) {
  const baseBg = parseAnsiColorCode(theme.getBgAnsi?.("toolSuccessBg")) ?? parseAnsiColorCode(theme.getBgAnsi?.("toolPendingBg")) ?? { r: 32, g: 35, b: 42 };
  const addFg = parseAnsiColorCode(theme.getFgAnsi?.("toolDiffAdded")) ?? { r: 88, g: 173, b: 88 };
  const removeFg = parseAnsiColorCode(theme.getFgAnsi?.("toolDiffRemoved")) ?? { r: 196, g: 98, b: 98 };
  const addRowBg = mixRgb(baseBg, addFg, ADD_ROW_BACKGROUND_MIX_RATIO);
  const removeRowBg = mixRgb(baseBg, removeFg, REMOVE_ROW_BACKGROUND_MIX_RATIO);
  const addEmphasisBg = mixRgb(baseBg, addFg, ADD_INLINE_EMPHASIS_MIX_RATIO);
  const removeEmphasisBg = mixRgb(baseBg, removeFg, REMOVE_INLINE_EMPHASIS_MIX_RATIO);
  return {
    addRowBgAnsi: rgbToBgAnsi(addRowBg),
    removeRowBgAnsi: rgbToBgAnsi(removeRowBg),
    addEmphasisBgAnsi: rgbToBgAnsi(addEmphasisBg),
    removeEmphasisBgAnsi: rgbToBgAnsi(removeEmphasisBg)
  };
}
function keepBackgroundAcrossResets(text, rowBgAnsi) {
  if (!text) return text;
  return text.replace(ANSI_SGR_PATTERN, (sequence, rawCodes) => {
    const split = String(rawCodes ?? "").split(";").filter(Boolean);
    const codes = split.length > 0 ? split : ["0"];
    const hasGlobalReset = codes.includes("0");
    const hasBgReset = codes.includes("49");
    if (!hasGlobalReset && !hasBgReset) return sequence;
    const rebuiltCodes = codes.filter((code) => code !== "49");
    const rebuilt = rebuiltCodes.length > 0 ? `\x1B[${rebuiltCodes.join(";")}m` : "";
    return `${rebuilt}${rowBgAnsi}`;
  });
}
function applyBackgroundToVisibleRange(ansiText, start, end, backgroundAnsi, restoreBackgroundAnsi) {
  if (!ansiText || start >= end || end <= 0) return ansiText;
  let output = "";
  let visibleIndex = 0;
  let index = 0;
  let inRange = false;
  while (index < ansiText.length) {
    if (ansiText[index] === "\x1B") {
      const sequenceEnd = ansiText.indexOf("m", index);
      if (sequenceEnd !== -1) {
        output += ansiText.slice(index, sequenceEnd + 1);
        index = sequenceEnd + 1;
        continue;
      }
    }
    if (visibleIndex === start && !inRange) {
      output += backgroundAnsi;
      inRange = true;
    }
    if (visibleIndex === end && inRange) {
      output += restoreBackgroundAnsi;
      inRange = false;
    }
    output += ansiText[index] ?? "";
    visibleIndex++;
    index++;
  }
  if (inRange) output += restoreBackgroundAnsi;
  return output;
}
function sanitizeSingleLineText(value) {
  return value.replace(/\r/g, "").replace(/\n/g, "").replace(CONTROL_CHARS_PATTERN, "");
}
function stripInlineBreaksPreserveAnsi(value) {
  return value.replace(/\r/g, "").replace(/\n/g, "");
}
function padRight(value, width) {
  const visual = safeVisibleWidth(stripAnsi(value));
  if (visual >= width) return value;
  return value + " ".repeat(width - visual);
}
function fitToWidth(value, width) {
  return padRight(safeTruncateToWidth(value, width), width);
}
function padRenderedLineWidth(line, width) {
  const safeWidth = Math.max(1, width);
  const current = safeVisibleWidth(stripAnsi(line));
  if (current >= safeWidth) return line;
  return line + " ".repeat(safeWidth - current);
}
function wrapPlainText(text, width) {
  const safeWidth = Math.max(1, width);
  const safeText = sanitizeSingleLineText(text);
  if (!safeText) return [""];
  const lines = [];
  let cursor = 0;
  while (cursor < safeText.length) {
    const remaining = safeText.length - cursor;
    if (remaining <= safeWidth) {
      lines.push(safeText.slice(cursor));
      break;
    }
    const window = safeText.slice(cursor, cursor + safeWidth);
    const breakOnSpace = window.lastIndexOf(" ");
    if (breakOnSpace > 0) {
      const next = breakOnSpace + 1;
      lines.push(safeText.slice(cursor, cursor + next));
      cursor += next;
      continue;
    }
    lines.push(window);
    cursor += safeWidth;
  }
  return lines.length > 0 ? lines : [""];
}
function parseLineNumber(value) {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return void 0;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) ? parsed : void 0;
}
function makeDiffLine(prefix, lineNumber, line) {
  return {
    prefix,
    lineNumber: lineNumber === void 0 ? "" : String(lineNumber),
    line
  };
}
function parseDiffLine(rawLine) {
  const match = rawLine.match(/^([+\- ])\s?(.*)$/);
  if (!match) return void 0;
  const [, prefix, rest = ""] = match;
  if (prefix !== "+" && prefix !== "-" && prefix !== " ") return void 0;
  const gutterMatch = rest.match(/^(\d+)\s(.*)$/);
  const lineNumber = gutterMatch?.[1] ?? "";
  const line = gutterMatch?.[2] ?? rest;
  const cleanLineNumber = sanitizeSingleLineText(lineNumber);
  const cleanLine = sanitizeSingleLineText(line).replace(/\t/g, "    ");
  return { prefix, lineNumber: cleanLineNumber, line: cleanLine };
}
function computeInlineDiffSpans(leftLine, rightLine) {
  if (leftLine === rightLine) return { left: [], right: [] };
  let start = 0;
  const minLen = Math.min(leftLine.length, rightLine.length);
  while (start < minLen && leftLine[start] === rightLine[start]) start++;
  let leftEnd = leftLine.length;
  let rightEnd = rightLine.length;
  while (leftEnd > start && rightEnd > start && leftLine[leftEnd - 1] === rightLine[rightEnd - 1]) {
    leftEnd--;
    rightEnd--;
  }
  const leftSpan = leftEnd > start ? [{ start, end: leftEnd }] : [];
  const rightSpan = rightEnd > start ? [{ start, end: rightEnd }] : [];
  return { left: leftSpan, right: rightSpan };
}
function buildSplitRows(diff) {
  const rows = [];
  const pendingLeft = [];
  const pendingRight = [];
  let oldCursor;
  let newCursor;
  const flushPending = () => {
    while (pendingLeft.length > 0 || pendingRight.length > 0) {
      const left = pendingLeft.shift();
      const right = pendingRight.shift();
      if (left && right) rows.push({ kind: "changed", left, right });
      else if (left) rows.push({ kind: "removed", left });
      else if (right) rows.push({ kind: "added", right });
    }
  };
  for (const rawLine of diff.split("\n")) {
    const parsed = parseDiffLine(rawLine);
    if (!parsed) continue;
    const parsedNum = parseLineNumber(parsed.lineNumber);
    if (parsed.prefix === "-") {
      const oldNum2 = parsedNum ?? oldCursor;
      if (oldNum2 !== void 0) oldCursor = oldNum2 + 1;
      pendingLeft.push(makeDiffLine("-", oldNum2, parsed.line));
      continue;
    }
    if (parsed.prefix === "+") {
      const newNum2 = parsedNum ?? newCursor;
      if (newNum2 !== void 0) newCursor = newNum2 + 1;
      pendingRight.push(makeDiffLine("+", newNum2, parsed.line));
      continue;
    }
    flushPending();
    const oldNum = parsedNum ?? oldCursor;
    const newNum = newCursor ?? oldNum;
    if (oldNum !== void 0) oldCursor = oldNum + 1;
    if (newNum !== void 0) newCursor = newNum + 1;
    rows.push({
      kind: "context",
      left: makeDiffLine(" ", oldNum, parsed.line),
      right: makeDiffLine(" ", newNum, parsed.line)
    });
  }
  flushPending();
  return rows;
}
function countDiffStats(diff) {
  let additions = 0;
  let removals = 0;
  for (const line of diff.split("\n")) {
    if (line.startsWith("+++") || line.startsWith("---")) continue;
    if (line.startsWith("+")) additions += 1;
    if (line.startsWith("-")) removals += 1;
  }
  return { additions, removals };
}
function extractEditedPath(message) {
  const m = message.match(/Successfully replaced (?:text|\d+ block\(s\)|lines L\d+-\d+) in (.+)\.$/);
  return m?.[1];
}
function firstText(content) {
  for (const part of content) {
    if (part.type === "text" && typeof part.text === "string") {
      return part.text;
    }
  }
  return "";
}
function longestChangedLineWidth(rows) {
  let longest = 0;
  for (const row of rows) {
    const candidates = [];
    if (row.kind === "changed") {
      if (row.left) candidates.push(row.left.line);
      if (row.right) candidates.push(row.right.line);
    } else if (row.kind === "added" && row.right) {
      candidates.push(row.right.line);
    } else if (row.kind === "removed" && row.left) {
      candidates.push(row.left.line);
    }
    for (const candidate of candidates) {
      longest = Math.max(longest, safeVisibleWidth(candidate));
    }
  }
  return longest;
}
function pickDiffMode(stats, rows, width) {
  if (stats.additions <= 0 || stats.removals <= 0) return "unified";
  if (width < SPLIT_DIFF_MIN_WIDTH) return "unified";
  if (longestChangedLineWidth(rows) > width / 2) return "unified";
  return "split";
}
function collapseContextRows(rows, options) {
  const keep = options.keep;
  const runShowMax = options.runShowMax ?? CONTEXT_RUN_SHOW_MAX;
  const out = [];
  let i = 0;
  while (i < rows.length) {
    const row = rows[i];
    if (row?.kind !== "context") {
      if (row) out.push({ kind: "row", row });
      i++;
      continue;
    }
    let j = i;
    while (j < rows.length && rows[j]?.kind === "context") j++;
    const run = j - i;
    if (run <= runShowMax) {
      for (let k = i; k < j; k++) out.push({ kind: "row", row: rows[k] });
    } else {
      const leading = i === 0;
      const trailing = j >= rows.length;
      const keepHead = leading ? 0 : Math.min(keep, run);
      const keepTail = trailing ? 0 : Math.min(keep, Math.max(0, run - keepHead));
      const hidden = Math.max(0, run - keepHead - keepTail);
      if (keepHead > 0) {
        for (let k = i; k < i + keepHead; k++) out.push({ kind: "row", row: rows[k] });
      }
      if (hidden > 0) out.push({ kind: "gap", hidden });
      if (keepTail > 0) {
        for (let k = j - keepTail; k < j; k++) out.push({ kind: "row", row: rows[k] });
      }
    }
    i = j;
  }
  return out;
}
function planEntries(rows, maxRows) {
  const budget = Math.max(1, maxRows);
  let entries = collapseContextRows(rows, { keep: CONTEXT_KEEP_DEFAULT });
  if (entries.length <= budget) return entries;
  entries = collapseContextRows(rows, { keep: 0, runShowMax: 0 });
  if (entries.length <= budget) return entries;
  const kept = entries.slice(0, Math.max(1, budget - 1));
  const omitted = Math.max(0, entries.length - kept.length);
  if (omitted <= 0) return kept;
  return [...kept, { kind: "omitted", count: omitted }];
}
function formatGapLabel(hidden) {
  return `\u22EF ${hidden} unchanged ${hidden === 1 ? "line" : "lines"} hidden`;
}
function formatOmittedLabel(count) {
  return `\u22EF ${count} ${count === 1 ? "line" : "lines"} omitted \xB7 Ctrl+O to show full diff`;
}
var DiffRenderContext = class {
  constructor(theme, rows, language) {
    this.theme = theme;
    this.language = language;
    let maxDigits = 3;
    for (const row of rows) {
      const leftDigits = row.left?.lineNumber.trim().length ?? 0;
      const rightDigits = row.right?.lineNumber.trim().length ?? 0;
      maxDigits = Math.max(maxDigits, leftDigits, rightDigits);
      if (row.kind === "changed" && row.left && row.right) {
        const spans = computeInlineDiffSpans(row.left.line, row.right.line);
        if (spans.left.length > 0) this.inlineHighlights.set(row.left, spans.left);
        if (spans.right.length > 0) this.inlineHighlights.set(row.right, spans.right);
      }
    }
    this.lineNumberWidth = maxDigits;
    this.palette = resolveDiffPalette(theme);
    this.containerBgAnsi = theme.getBgAnsi?.("toolSuccessBg") ?? "";
  }
  theme;
  language;
  lineNumberWidth;
  palette;
  containerBgAnsi;
  highlightCache = /* @__PURE__ */ new Map();
  inlineHighlights = /* @__PURE__ */ new WeakMap();
  fg(color, text) {
    return this.theme.fg(color, text);
  }
  inlineSpans(line) {
    return this.inlineHighlights.get(line) ?? [];
  }
  syntaxHighlight(line) {
    if (!this.language) return stripInlineBreaksPreserveAnsi(line);
    const safeLine = sanitizeSingleLineText(line);
    const key = `${this.language}
${safeLine}`;
    const cached = this.highlightCache.get(key);
    if (cached) return cached;
    let highlighted = safeLine;
    try {
      highlighted = highlightCode(safeLine, this.language)[0] ?? safeLine;
      highlighted = stripInlineBreaksPreserveAnsi(highlighted).replace(BG_ANSI_PATTERN, "");
    } catch {
      highlighted = safeLine;
    }
    this.highlightCache.set(key, highlighted);
    return highlighted;
  }
};
var UnifiedDiffRenderer = class {
  constructor(ctx, entries) {
    this.ctx = ctx;
    this.entries = entries;
  }
  ctx;
  entries;
  gapLine(entry, width) {
    return padRenderedLineWidth(this.ctx.fg("muted", formatGapLabel(entry.hidden)), width);
  }
  omittedLine(entry, width) {
    return padRenderedLineWidth(this.ctx.fg("muted", formatOmittedLabel(entry.count)), width);
  }
  render(width) {
    const safeWidth = Math.max(20, width);
    const prefixWidth = 1 + 1 + this.ctx.lineNumberWidth + 2;
    const codeWidth = Math.max(1, safeWidth - prefixWidth);
    const lines = [];
    for (const entry of this.entries) {
      if (entry.kind === "gap") {
        lines.push(this.gapLine(entry, safeWidth));
        continue;
      }
      if (entry.kind === "omitted") {
        lines.push(this.omittedLine(entry, safeWidth));
        continue;
      }
      lines.push(...this.rowLines(entry.row, codeWidth, safeWidth));
    }
    return lines;
  }
  rowLines(row, codeWidth, width) {
    const segments = [];
    if (row.kind === "changed") {
      if (row.left) segments.push({ kind: "remove", line: row.left });
      if (row.right) segments.push({ kind: "add", line: row.right });
    } else if (row.kind === "added" && row.right) {
      segments.push({ kind: "add", line: row.right });
    } else if (row.kind === "removed" && row.left) {
      segments.push({ kind: "remove", line: row.left });
    } else {
      const line = row.left ?? row.right;
      if (line) segments.push({ kind: "context", line });
    }
    const out = [];
    for (const segment of segments) {
      out.push(...this.segmentLines(segment.kind, segment.line, codeWidth, width));
    }
    return out;
  }
  segmentLines(kind, line, codeWidth, width) {
    const isAdd = kind === "add";
    const isRemove = kind === "remove";
    const blank = line.line === "";
    const visualKind = kind === "context" || blank ? "context" : kind;
    const markerChar = kind === "context" ? " " : isAdd ? "+" : "-";
    const markerColor = isAdd ? "toolDiffAdded" : isRemove ? "toolDiffRemoved" : "dim";
    const gutterColor = visualKind === "context" ? "dim" : isAdd ? "toolDiffAdded" : "toolDiffRemoved";
    const gutter = line.lineNumber.trim().padStart(this.ctx.lineNumberWidth, " ");
    const firstPrefixAnsi = `${this.ctx.fg(markerColor, markerChar)} ${this.ctx.fg(gutterColor, gutter)}  `;
    const firstPrefixPlain = `${markerChar} ${gutter}  `;
    const contPrefixAnsi = `${this.ctx.fg("dim", " ")} ${this.ctx.fg("dim", " ".repeat(this.ctx.lineNumberWidth))}  `;
    const contPrefixPlain = ` ${" ".repeat(1 + this.ctx.lineNumberWidth)}  `;
    const rowBg = visualKind === "add" ? this.ctx.palette.addRowBgAnsi : visualKind === "remove" ? this.ctx.palette.removeRowBgAnsi : void 0;
    const plainSegments = wrapPlainText(line.line, codeWidth);
    const out = [];
    for (let i = 0; i < plainSegments.length; i++) {
      const prefixAnsi = i === 0 ? firstPrefixAnsi : contPrefixAnsi;
      const prefixPlain = i === 0 ? firstPrefixPlain : contPrefixPlain;
      const plainSegment = plainSegments[i] ?? "";
      let segment = this.ctx.syntaxHighlight(plainSegment);
      segment = fitToWidth(segment, codeWidth);
      let rendered = prefixAnsi + segment;
      const expectedWidth = safeVisibleWidth(prefixPlain) + codeWidth;
      const currentWidth = safeVisibleWidth(stripAnsi(rendered));
      if (currentWidth < expectedWidth) {
        rendered += " ".repeat(expectedWidth - currentWidth);
      }
      if (rowBg) {
        rendered = `${rowBg}${keepBackgroundAcrossResets(rendered, rowBg)}${this.ctx.containerBgAnsi}`;
      }
      out.push(padRenderedLineWidth(rendered, width));
    }
    return out;
  }
};
var SplitDiffRenderer = class {
  constructor(ctx, entries) {
    this.ctx = ctx;
    this.entries = entries;
  }
  ctx;
  entries;
  getCellLineKind(kind, side) {
    if (kind === "changed") return side === "left" ? "remove" : "add";
    if (kind === "removed" && side === "left") return "remove";
    if (kind === "added" && side === "right") return "add";
    return "context";
  }
  getVisualLineKind(kind, side, line) {
    const base = this.getCellLineKind(kind, side);
    if ((kind === "added" || kind === "removed") && (line?.line ?? "") === "") {
      return "context";
    }
    return base;
  }
  getNumberColor(lineKind) {
    if (lineKind === "remove") return "toolDiffRemoved";
    if (lineKind === "add") return "toolDiffAdded";
    return "dim";
  }
  getRowBackground(lineKind) {
    if (lineKind === "add") return this.ctx.palette.addRowBgAnsi;
    if (lineKind === "remove") return this.ctx.palette.removeRowBgAnsi;
    return void 0;
  }
  getEmphasisBackground(lineKind) {
    if (lineKind === "add") return this.ctx.palette.addEmphasisBgAnsi;
    if (lineKind === "remove") return this.ctx.palette.removeEmphasisBgAnsi;
    return void 0;
  }
  getCellFillBackground(kind, side) {
    switch (kind) {
      case "changed":
        return side === "left" ? this.ctx.palette.removeRowBgAnsi : this.ctx.palette.addRowBgAnsi;
      case "removed":
        return side === "left" ? this.ctx.palette.removeRowBgAnsi : void 0;
      case "added":
        return side === "right" ? this.ctx.palette.addRowBgAnsi : void 0;
      default:
        return void 0;
    }
  }
  blankCell(kind, side, columnWidth) {
    const lineKind = this.getCellLineKind(kind, side);
    const markerChar = lineKind === "add" || lineKind === "remove" ? "\u258C" : " ";
    const markerColor = lineKind === "add" ? "toolDiffAdded" : lineKind === "remove" ? "toolDiffRemoved" : "borderMuted";
    const marker = this.ctx.fg(markerColor, markerChar);
    const lineNumber = this.ctx.fg("dim", " ".repeat(this.ctx.lineNumberWidth));
    const divider = dimLine(" \u2502 ");
    const prefix = `${marker} ${lineNumber}${divider}`;
    const prefixPlain = `${markerChar} ${" ".repeat(this.ctx.lineNumberWidth)} \u2502 `;
    const tailWidth = Math.max(0, columnWidth - safeVisibleWidth(prefixPlain));
    let rendered = prefix + " ".repeat(tailWidth);
    const bg = this.getCellFillBackground(kind, side);
    if (!bg) return padRenderedLineWidth(rendered, columnWidth);
    rendered = `${bg}${keepBackgroundAcrossResets(rendered, bg)}${this.ctx.containerBgAnsi}`;
    return padRenderedLineWidth(rendered, columnWidth);
  }
  formatCellLines(kind, side, line, columnWidth) {
    if (!line) return [this.blankCell(kind, side, columnWidth)];
    const lineKind = this.getVisualLineKind(kind, side, line);
    const markerChar = lineKind === "add" || lineKind === "remove" ? "\u258C" : " ";
    const markerColor = lineKind === "add" ? "toolDiffAdded" : lineKind === "remove" ? "toolDiffRemoved" : "borderMuted";
    const lineNumber = line.lineNumber.trim().padStart(this.ctx.lineNumberWidth, " ");
    const firstPrefixAnsi = this.ctx.fg(markerColor, markerChar) + " " + this.ctx.fg(this.getNumberColor(lineKind), lineNumber) + dimLine(" \u2502 ");
    const firstPrefixPlain = `${markerChar} ${lineNumber} \u2502 `;
    const contPrefixAnsi = this.ctx.fg(markerColor, markerChar) + " " + this.ctx.fg("dim", " ".repeat(this.ctx.lineNumberWidth)) + dimLine(" \u2502 ");
    const contPrefixPlain = `${markerChar} ${" ".repeat(this.ctx.lineNumberWidth)} \u2502 `;
    const codeWidth = Math.max(1, columnWidth - safeVisibleWidth(firstPrefixPlain));
    const rowBg = this.getRowBackground(lineKind);
    const emphasisBg = this.getEmphasisBackground(lineKind);
    const plainSegments = wrapPlainText(line.line, codeWidth);
    const lines = [];
    const spans = this.ctx.inlineSpans(line);
    let consumed = 0;
    for (let i = 0; i < plainSegments.length; i++) {
      const prefixAnsi = i === 0 ? firstPrefixAnsi : contPrefixAnsi;
      const prefixPlain = i === 0 ? firstPrefixPlain : contPrefixPlain;
      const plainSegment = plainSegments[i] ?? "";
      let segment = this.ctx.syntaxHighlight(plainSegment);
      if (spans.length > 0 && emphasisBg) {
        const segmentStart = consumed;
        for (let si = spans.length - 1; si >= 0; si--) {
          const span = spans[si];
          if (!span) continue;
          const localStart = Math.max(0, span.start - segmentStart);
          const localEnd = Math.min(plainSegment.length, span.end - segmentStart);
          if (localEnd > localStart) {
            segment = applyBackgroundToVisibleRange(
              segment,
              localStart,
              localEnd,
              emphasisBg,
              rowBg ?? this.ctx.containerBgAnsi
            );
          }
        }
      }
      segment = fitToWidth(segment, codeWidth);
      let rendered = prefixAnsi + segment;
      const expectedWidth = safeVisibleWidth(prefixPlain) + codeWidth;
      const currentWidth = safeVisibleWidth(stripAnsi(rendered));
      if (currentWidth < expectedWidth) {
        rendered += " ".repeat(expectedWidth - currentWidth);
      }
      if (rowBg) {
        rendered = `${rowBg}${keepBackgroundAcrossResets(rendered, rowBg)}${this.ctx.containerBgAnsi}`;
      }
      lines.push(padRenderedLineWidth(rendered, columnWidth));
      consumed += plainSegment.length;
    }
    return lines;
  }
  gapLine(entry, width) {
    return padRenderedLineWidth(this.ctx.fg("muted", formatGapLabel(entry.hidden)), width);
  }
  omittedLine(entry, width) {
    return padRenderedLineWidth(this.ctx.fg("muted", formatOmittedLabel(entry.count)), width);
  }
  render(width) {
    const safeWidth = Math.max(20, width);
    const columnSeparator = dimLine(" \u2502 ");
    const separatorWidth = safeVisibleWidth(stripAnsi(columnSeparator));
    const leftWidth = Math.max(20, Math.floor((safeWidth - separatorWidth) / 2));
    const rightWidth = Math.max(20, safeWidth - separatorWidth - leftWidth);
    const formatBorderCell = (columnWidth, junction) => {
      const safeColumnWidth = Math.max(1, columnWidth);
      const chars = "\u2500".repeat(safeColumnWidth).split("");
      const dividerIndex = this.ctx.lineNumberWidth + 3;
      if (dividerIndex >= 0 && dividerIndex < chars.length) {
        chars[dividerIndex] = junction;
      }
      return dimLine(chars.join(""));
    };
    const formatHeaderCell = (label, columnWidth) => {
      const markerPad = "  ";
      const lineNumberLabel = fitToWidth(label, this.ctx.lineNumberWidth);
      const prefixAnsi = dimLine(markerPad) + this.ctx.fg("dim", lineNumberLabel) + dimLine(" \u2502 ");
      const prefixPlain = `${markerPad}${stripAnsi(lineNumberLabel)} \u2502 `;
      const codeWidth = Math.max(0, columnWidth - safeVisibleWidth(prefixPlain));
      return padRenderedLineWidth(prefixAnsi + " ".repeat(codeWidth), columnWidth);
    };
    const lines = [];
    lines.push(
      padRenderedLineWidth(
        formatBorderCell(leftWidth, "\u252C") + dimLine("\u2500\u252C\u2500") + formatBorderCell(rightWidth, "\u252C"),
        safeWidth
      )
    );
    lines.push(
      padRenderedLineWidth(
        formatHeaderCell("old", leftWidth) + columnSeparator + formatHeaderCell("new", rightWidth),
        safeWidth
      )
    );
    for (const entry of this.entries) {
      if (entry.kind === "gap") {
        lines.push(this.gapLine(entry, safeWidth));
        continue;
      }
      if (entry.kind === "omitted") {
        lines.push(this.omittedLine(entry, safeWidth));
        continue;
      }
      const row = entry.row;
      const leftCellLines = this.formatCellLines(row.kind, "left", row.left, leftWidth);
      const rightCellLines = this.formatCellLines(row.kind, "right", row.right, rightWidth);
      const rowHeight = Math.max(leftCellLines.length, rightCellLines.length);
      for (let i = 0; i < rowHeight; i++) {
        const fallbackKind = row.kind === "changed" ? "context" : row.kind;
        const leftCell = leftCellLines[i] ?? this.blankCell(fallbackKind, "left", leftWidth);
        const rightCell = rightCellLines[i] ?? this.blankCell(fallbackKind, "right", rightWidth);
        const joined = padRenderedLineWidth(leftCell + columnSeparator + rightCell, safeWidth);
        lines.push(joined);
      }
    }
    lines.push(
      padRenderedLineWidth(
        formatBorderCell(leftWidth, "\u2534") + dimLine("\u2500\u2534\u2500") + formatBorderCell(rightWidth, "\u2534"),
        safeWidth
      )
    );
    return lines;
  }
};
var AdaptiveDiffComponent = class {
  constructor(theme, rows, maxRows, language) {
    this.rows = rows;
    this.ctx = new DiffRenderContext(theme, rows, language);
    this.stats = { additions: 0, removals: 0 };
    for (const row of rows) {
      if (row.kind === "added" || row.kind === "changed") this.stats.additions++;
      if (row.kind === "removed" || row.kind === "changed") this.stats.removals++;
    }
    const entries = planEntries(rows, maxRows);
    this.collapsed = entries.some((entry) => entry.kind !== "row");
    this.unified = new UnifiedDiffRenderer(this.ctx, entries);
    this.split = new SplitDiffRenderer(this.ctx, entries);
  }
  rows;
  cacheWidth;
  cacheLines;
  ctx;
  stats;
  unified;
  split;
  collapsed;
  /** True when any unchanged context was collapsed or rows were omitted. */
  hasCollapsed() {
    return this.collapsed;
  }
  modeForWidth(width) {
    return pickDiffMode(this.stats, this.rows, Math.max(20, width));
  }
  render(width) {
    if (this.cacheWidth === width && this.cacheLines) return this.cacheLines;
    const safeWidth = Math.max(20, width);
    const mode = this.modeForWidth(safeWidth);
    const lines = mode === "split" ? this.split.render(safeWidth) : this.unified.render(safeWidth);
    this.cacheWidth = width;
    this.cacheLines = lines;
    return lines;
  }
  invalidate() {
    this.cacheWidth = void 0;
    this.cacheLines = void 0;
  }
};

// ../../.pi/agent/npm/node_modules/@quandev104/pi-style/extension-src/pi-style/features/tools/boxed/shared.ts
function pendingFlag(context) {
  return Boolean(context.isPartial);
}
function displayPath(rawPath, context) {
  const path = String(rawPath ?? "");
  if (!path) return "(unknown)";
  return shortenPath(resolveRelativePath(path, context.cwd));
}
function pathRangeDetail(rawPath, offset, limit, context) {
  const path = displayPath(rawPath, context);
  let range = "";
  if (offset !== void 0 || limit !== void 0) {
    const start = offset ?? 1;
    const end = limit !== void 0 ? Number(start) + Number(limit) - 1 : "";
    range = `:${start}${end ? `-${end}` : ""}`;
  }
  return path ? `${path}${range}` : "(unknown)";
}
function compactCall(theme, toolName, detailLine, options) {
  return renderCompactBoxedToolCall(theme, toolName, detailLine, {
    widthKey: boxedToolWidthKey(toolName, options.detailKey),
    ...options.headerDetail ? { headerDetail: options.headerDetail } : {},
    state: options.context.state,
    isError: Boolean(options.context.isError),
    isPartial: Boolean(options.context.isPartial),
    isPending: pendingFlag(options.context),
    running: Boolean(options.context.executionStarted)
  });
}
function noteExecutionStart(context) {
  recordExecutionStarted(context.state, context.executionStarted);
}
function noteBoxedCallState(context) {
  if (!context.executionStarted) return;
  if (context.isPartial) startElapsedTicker(context.state, context.invalidate);
  else {
    recordExecutionEnded(context.state);
    stopElapsedTicker(context.state);
  }
}
function noteBoxedResultPhase(context, isPartial) {
  const firstResultPass = !isResultSeen(context.state);
  markResultSeen(context.state);
  if (isPartial) startElapsedTicker(context.state, context.invalidate);
  else {
    recordExecutionEnded(context.state);
    stopElapsedTicker(context.state);
  }
  return firstResultPass;
}
function stateElapsedMs(context) {
  return getStateElapsedMs(context.state);
}
var DIFF_HEADER_STATS_KEY = "__piStyleDiffHeaderStats";
function noteDiffHeaderStats(context, stats) {
  context.state[DIFF_HEADER_STATS_KEY] = { additions: stats.additions, removals: stats.removals };
}
function clearDiffHeaderStats(context) {
  delete context.state[DIFF_HEADER_STATS_KEY];
}
function formatDiffStatsPair(theme, additions, removals) {
  const plus = additions > 0 ? theme.fg("toolDiffAdded", `+${additions}`) : theme.fg("dim", "+0");
  const minus = removals > 0 ? theme.fg("toolDiffRemoved", `-${removals}`) : theme.fg("dim", "-0");
  return `${plus} ${minus}`;
}
function diffHeaderStatsSuffix(theme, context) {
  const stats = context.state[DIFF_HEADER_STATS_KEY];
  if (!stats || typeof stats !== "object") return "";
  const additions = Number(stats.additions);
  const removals = Number(stats.removals);
  if (!Number.isFinite(additions) || !Number.isFinite(removals)) return "";
  return ` \xB7 ${formatDiffStatsPair(theme, additions, removals)}`;
}
function compactFooterWithState(theme, result, context, options = {}) {
  const elapsedMs = stateElapsedMs(context);
  return renderCompactBoxedFooter(theme, result, {
    state: context.state,
    isError: Boolean(options.isError ?? context.isError),
    isPartial: Boolean(options.isPartial ?? context.isPartial),
    ...elapsedMs === void 0 ? {} : { elapsedMs }
  });
}
function resultFooterLines(theme, result, context, extraParts = []) {
  return [formatBoxedFooter(theme, result, extraParts, stateElapsedMs(context))];
}
var CACHE_KEY_LONG_PART_THRESHOLD = 64;
function fnv1aHex(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}
function boundedCacheKeyPart(part) {
  if (typeof part !== "string" || part.length <= CACHE_KEY_LONG_PART_THRESHOLD) return part;
  return `${part.length}:${fnv1aHex(part)}`;
}
function getRenderCacheKey(prefix, theme, ...parts) {
  const pieces = [prefix, themeCacheKey(theme), getToolsRenderCacheSignature()];
  for (const part of parts) pieces.push(boundedCacheKeyPart(part));
  return pieces.join("|");
}
function memoizedStateComponent(state, slot, key, build) {
  if (!state || typeof state !== "object") return build();
  const cached = state[slot];
  if (cached && cached.key === key) return cached.component;
  const component = build();
  state[slot] = { key, component };
  return component;
}
function clearFooterState(context) {
  clearCompactBoxedFooter(context.state);
}
function truncationOutputLines(result) {
  if (!result) return void 0;
  const details = result.details;
  const value = details?.truncation?.outputLines;
  return typeof value === "number" && Number.isFinite(value) ? value : void 0;
}

// ../../.pi/agent/npm/node_modules/@quandev104/pi-style/extension-src/pi-style/features/tools/boxed/git.ts
var GIT_SHORT_STATUS_FLAGS = /* @__PURE__ */ new Set(["-s", "--short", "--porcelain"]);
var GIT_DIFF_FORMAT_REJECT = /* @__PURE__ */ new Set([
  "-p",
  "--patch",
  "--numstat",
  "--shortstat",
  "--dirstat",
  "--summary",
  "--name-only",
  "--name-status",
  "--raw",
  "--word-diff"
]);
var GIT_DIFF_PATCH_REJECT = /* @__PURE__ */ new Set([
  "--numstat",
  "--shortstat",
  "--dirstat",
  "--summary",
  "--name-only",
  "--name-status",
  "--raw",
  "--word-diff",
  "--binary",
  "--no-patch",
  "-s",
  "--patch-with-stat",
  "--patch-with-raw"
]);
var GIT_SHOW_REJECT = /* @__PURE__ */ new Set([...GIT_DIFF_PATCH_REJECT, "--stat", "--oneline", "--format", "--pretty"]);
var GIT_SHOW_STAT_REJECT = /* @__PURE__ */ new Set([...GIT_DIFF_PATCH_REJECT, "-p", "--patch", "--oneline"]);
var GIT_LOG_FORMAT_REJECT = /* @__PURE__ */ new Set([
  "-p",
  "--patch",
  "--stat",
  "--numstat",
  "--shortstat",
  "--dirstat",
  "--summary",
  "--name-only",
  "--name-status",
  "--raw",
  "--graph",
  "--format",
  "--pretty",
  "--word-diff",
  "--color",
  "--show-signature"
]);
var GIT_COMMIT_REJECT = /* @__PURE__ */ new Set([
  "-v",
  "--verbose",
  "-p",
  "--patch",
  "-i",
  "--interactive",
  "--porcelain",
  "--dry-run"
]);
var GIT_PUSH_REJECT = /* @__PURE__ */ new Set(["--porcelain", "-v", "--verbose", "--dry-run", "-n"]);
var GIT_PULL_REJECT = /* @__PURE__ */ new Set(["-v", "--verbose", "--rebase"]);
var GIT_FETCH_REJECT = /* @__PURE__ */ new Set(["-v", "--verbose", "--dry-run"]);
var GIT_SWITCH_REJECT = /* @__PURE__ */ new Set(["-p", "--patch", "-i", "--interactive", "--orphan"]);
var GIT_ADD_REJECT = /* @__PURE__ */ new Set(["-p", "--patch", "-i", "--interactive", "-v", "--verbose"]);
var GIT_RESET_REJECT = /* @__PURE__ */ new Set(["-p", "--patch"]);
var GIT_MERGE_REJECT = /* @__PURE__ */ new Set(["-v", "--verbose"]);
var GIT_REBASE_REJECT = /* @__PURE__ */ new Set(["-i", "--interactive", "-x", "--exec"]);
function classifyGitCommand(command) {
  const shape = parseSimpleBashCommand(command);
  if (!shape) return null;
  const rest = shape.tokens;
  if ((rest[0] ?? "").split("/").pop() !== "git") return null;
  const args = rest.slice(1);
  if (args.length === 0) return null;
  const sub = args[0] ?? "";
  if (sub === "status") {
    if (args.some((arg) => arg === "-z" || arg === "--null" || arg.startsWith("--porcelain=v2"))) return null;
    const short = args.some((arg) => GIT_SHORT_STATUS_FLAGS.has(arg) || /^-[sS][a-zA-Z]*$/.test(arg)) || args.some((arg) => arg.startsWith("--porcelain=v1"));
    return { kind: "status", short };
  }
  if (sub === "diff") {
    const hasStat = args.some((arg) => arg === "--stat" || arg.startsWith("--stat="));
    if (hasStat) {
      if (args.some(
        (arg) => GIT_DIFF_FORMAT_REJECT.has(arg) || arg.startsWith("--format=") || arg.startsWith("--pretty=")
      )) {
        return null;
      }
      return { kind: "diff-stat" };
    }
    if (args.some((arg) => GIT_DIFF_PATCH_REJECT.has(arg) || arg.startsWith("--word-diff="))) {
      return null;
    }
    return { kind: "diff", show: false };
  }
  if (sub === "show") {
    const hasStat = args.some((arg) => arg === "--stat" || arg.startsWith("--stat="));
    if (hasStat) {
      if (args.some(
        (arg) => GIT_SHOW_STAT_REJECT.has(arg) || /^-[A-Za-z]*p[A-Za-z]*$/.test(arg) || arg.startsWith("--word-diff=") || arg.startsWith("--format=") || arg.startsWith("--pretty=")
      )) {
        return null;
      }
      return { kind: "show-stat" };
    }
    if (args.some(
      (arg) => GIT_SHOW_REJECT.has(arg) || arg.startsWith("--word-diff=") || arg.startsWith("--format=") || arg.startsWith("--pretty=")
    )) {
      return null;
    }
    return { kind: "diff", show: true };
  }
  if (sub === "log") {
    if (args.some((arg) => GIT_LOG_FORMAT_REJECT.has(arg) || arg.startsWith("--format=") || arg.startsWith("--pretty="))) {
      return null;
    }
    return { kind: "log" };
  }
  if (sub === "commit") {
    if (args.some((arg) => GIT_COMMIT_REJECT.has(arg) || /^-[A-Za-z]*[vpi][A-Za-z]*$/.test(arg))) return null;
    return { kind: "action", command: "commit" };
  }
  if (sub === "push") {
    if (args.some((arg) => GIT_PUSH_REJECT.has(arg) || /^-[A-Za-z]*[vn][A-Za-z]*$/.test(arg))) return null;
    return { kind: "action", command: "push" };
  }
  if (sub === "pull") {
    if (args.some((arg) => GIT_PULL_REJECT.has(arg) || /^-[A-Za-z]*v[A-Za-z]*$/.test(arg))) return null;
    return { kind: "action", command: "pull" };
  }
  if (sub === "fetch") {
    if (args.some((arg) => GIT_FETCH_REJECT.has(arg) || /^-[A-Za-z]*v[A-Za-z]*$/.test(arg))) return null;
    return { kind: "action", command: "fetch" };
  }
  if (sub === "switch" || sub === "checkout") {
    if (args.some((arg) => GIT_SWITCH_REJECT.has(arg) || /^-[A-Za-z]*[pi][A-Za-z]*$/.test(arg))) return null;
    return { kind: "action", command: sub };
  }
  if (sub === "add" || sub === "restore") {
    if (args.some((arg) => GIT_ADD_REJECT.has(arg) || /^-[A-Za-z]*[piv][A-Za-z]*$/.test(arg))) return null;
    return { kind: "action", command: sub };
  }
  if (sub === "reset") {
    if (args.some((arg) => GIT_RESET_REJECT.has(arg) || /^-[A-Za-z]*p[A-Za-z]*$/.test(arg))) return null;
    return { kind: "action", command: "reset" };
  }
  if (sub === "merge") {
    if (args.some((arg) => GIT_MERGE_REJECT.has(arg) || /^-[A-Za-z]*v[A-Za-z]*$/.test(arg))) return null;
    return { kind: "action", command: "merge" };
  }
  if (sub === "rebase") {
    if (args.some(
      (arg) => GIT_REBASE_REJECT.has(arg) || arg.startsWith("--exec=") || /^-[A-Za-z]*[ix][A-Za-z]*$/.test(arg)
    ))
      return null;
    return { kind: "action", command: "rebase" };
  }
  return null;
}
var LONG_STATUS_VERBS = {
  "new file": ["A", " "],
  modified: ["M", " "],
  deleted: ["D", " "],
  renamed: ["R", " "],
  copied: ["C", " "],
  typechange: ["T", " "],
  "both modified": ["U", "U"],
  "both added": ["A", "A"],
  "both deleted": ["D", "D"],
  "added by us": ["A", "U"],
  "added by them": ["U", "A"],
  "deleted by us": ["D", "U"],
  "deleted by them": ["U", "D"],
  unmerged: ["U", "U"]
};
var LONG_SECTION_HEADERS = {
  "Changes to be committed:": "staged",
  "Changes not staged for commit:": "unstaged",
  "Untracked files:": "untracked",
  "Ignored files:": "ignored",
  "Unmerged paths:": "unmerged"
};
var LONG_STATUS_ENTRY = /^([a-z ]+?):\s+(.+)$/;
var LONG_BRANCH = /^On branch (.+)$/;
var LONG_DETACHED = /^HEAD detached at ([0-9a-f]+)/;
var LONG_AHEAD = /^Your branch is ahead of '(.*)' by (\d+) commit/;
var LONG_BEHIND = /^Your branch is behind '(.*)' by (\d+) commit/;
var LONG_DIVERGED = /^Your branch and '(.*)' have diverged/;
var LONG_DIVERGED_COUNTS = /^and have (\d+) and (\d+) different commits each/;
function parseGitStatusLong(text) {
  const files = [];
  let branch;
  let ahead;
  let behind;
  let diverged = false;
  let section = null;
  let divergedNext = false;
  let sawContent = false;
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trimEnd();
    if (line === "") continue;
    const branchMatch = LONG_BRANCH.exec(line);
    if (branchMatch) {
      sawContent = true;
      branch = branchMatch[1];
      continue;
    }
    const detached = LONG_DETACHED.exec(line);
    if (detached) {
      sawContent = true;
      branch = detached[1];
      continue;
    }
    const aheadMatch = LONG_AHEAD.exec(line);
    if (aheadMatch) {
      sawContent = true;
      ahead = Number(aheadMatch[2]);
      continue;
    }
    const behindMatch = LONG_BEHIND.exec(line);
    if (behindMatch) {
      sawContent = true;
      behind = Number(behindMatch[2]);
      continue;
    }
    const divergedMatch = LONG_DIVERGED.exec(line);
    if (divergedMatch) {
      sawContent = true;
      diverged = true;
      divergedNext = true;
      continue;
    }
    if (divergedNext) {
      const counts = LONG_DIVERGED_COUNTS.exec(line);
      if (!counts) return null;
      sawContent = true;
      ahead = Number(counts[1]);
      behind = Number(counts[2]);
      divergedNext = false;
      continue;
    }
    const sectionHeader = LONG_SECTION_HEADERS[line];
    if (sectionHeader !== void 0) {
      sawContent = true;
      section = sectionHeader;
      continue;
    }
    if (/^\s{2}\(/.test(line)) continue;
    if (line.startsWith("no changes added to commit") || line === "nothing to commit, working tree clean" || line === "You have unmerged paths." || line === "No commits yet") {
      sawContent = true;
      continue;
    }
    if (line.startsWith("Your branch is up to date with ")) {
      sawContent = true;
      continue;
    }
    if (line.startsWith("	")) {
      const body = line.slice(1).trimStart();
      if (!body) return null;
      if (section === "untracked" || section === "ignored") {
        const mark = section === "untracked" ? "?" : "!";
        sawContent = true;
        files.push({ x: mark, y: mark, path: body });
        continue;
      }
      const verbMatch = LONG_STATUS_ENTRY.exec(body);
      if (!verbMatch) return null;
      const xy = LONG_STATUS_VERBS[verbMatch[1] ?? ""];
      if (!xy) return null;
      const path = (verbMatch[2] ?? "").trim();
      if (!path) return null;
      sawContent = true;
      if (section === "staged") files.push({ x: xy[0], y: " ", path });
      else if (section === "unstaged") files.push({ x: " ", y: xy[0], path });
      else files.push({ x: xy[0], y: xy[1], path });
      continue;
    }
    return null;
  }
  if (divergedNext) return null;
  if (!sawContent) return null;
  return {
    kind: "status",
    files,
    ...branch !== void 0 ? { branch } : {},
    ...ahead !== void 0 ? { ahead } : {},
    ...behind !== void 0 ? { behind } : {},
    ...diverged ? { diverged: true } : {}
  };
}
var SHORT_STATUS_BRANCH = /^## (.+)$/;
var SHORT_STATUS_BRANCH_DETAIL = /^(.+?)(?:\.\.\.(.+?))?(?: \[([^\]]+)\])?$/;
var SHORT_STATUS_FILE = /^([ MADRCU?!])([ MADRCU?!]) (.*)$/;
function parseGitStatusShort(text) {
  if (text.includes("\0")) return null;
  const files = [];
  let branch;
  let ahead;
  let behind;
  let diverged = false;
  let sawStatus = false;
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trimEnd();
    if (line === "") continue;
    const branchLine = SHORT_STATUS_BRANCH.exec(line);
    if (branchLine) {
      sawStatus = true;
      const detail = SHORT_STATUS_BRANCH_DETAIL.exec(branchLine[1] ?? "");
      if (detail) {
        branch = detail[1];
        const bracket = detail[3];
        if (bracket) {
          const aheadM = /ahead (\d+)/.exec(bracket);
          const behindM = /behind (\d+)/.exec(bracket);
          if (aheadM) ahead = Number(aheadM[1]);
          if (behindM) behind = Number(behindM[1]);
          if (aheadM && behindM) diverged = true;
        }
      }
      continue;
    }
    const fileMatch = SHORT_STATUS_FILE.exec(line);
    if (!fileMatch) return null;
    sawStatus = true;
    files.push({ x: fileMatch[1] ?? "", y: fileMatch[2] ?? "", path: fileMatch[3] ?? "" });
  }
  if (!sawStatus && text.trim() !== "") return null;
  return {
    kind: "status",
    files,
    ...branch !== void 0 ? { branch } : {},
    ...ahead !== void 0 ? { ahead } : {},
    ...behind !== void 0 ? { behind } : {},
    ...diverged ? { diverged: true } : {}
  };
}
function parseGitStatus(cls, text) {
  if (cls.kind !== "status") return null;
  return cls.short ? parseGitStatusShort(text) : parseGitStatusLong(text);
}
var DIFF_STAT_SUMMARY = /^\s*(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?$/;
var DIFF_STAT_FILE = /^(.*)\s+\|\s+(\d+)\s*.*$/;
var DIFF_STAT_BINARY = /^(.*)\s+\|\s+Bin\s+.*$/;
function parseGitDiffStat(text) {
  const files = [];
  let filesChanged;
  let insertions;
  let deletions;
  let sawLine = false;
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trimEnd();
    if (line === "") continue;
    sawLine = true;
    const summary = DIFF_STAT_SUMMARY.exec(line);
    if (summary) {
      filesChanged = Number(summary[1]);
      if (summary[2] !== void 0) insertions = Number(summary[2]);
      if (summary[3] !== void 0) deletions = Number(summary[3]);
      continue;
    }
    const binary = DIFF_STAT_BINARY.exec(line);
    if (binary) {
      const path = (binary[1] ?? "").trim();
      if (!path) return null;
      files.push({ path, binary: true });
      continue;
    }
    const file = DIFF_STAT_FILE.exec(line);
    if (file) {
      const path = (file[1] ?? "").trim();
      if (!path) return null;
      files.push({ path, changes: Number(file[2]) });
      continue;
    }
    return null;
  }
  if (!sawLine) return { kind: "diff-stat", files };
  if (files.length === 0 && filesChanged === void 0) return null;
  return {
    kind: "diff-stat",
    files,
    ...filesChanged !== void 0 ? { filesChanged } : {},
    ...insertions !== void 0 ? { insertions } : {},
    ...deletions !== void 0 ? { deletions } : {}
  };
}
var LOG_COMMIT_LINE = /^commit ([0-9a-f]{4,40})(?: \((.*)\))?$/;
var LOG_ONELINE = /^([0-9a-f]{4,40})(?: \(([^)]*)\))?\s*(.*)$/;
var LOG_HEADER_LINE = /^(?:Author|Date|Merge):/;
var LOG_MESSAGE_LINE = /^\s{4}(.*)$/;
function parseGitLog(text) {
  const lines = text.split("\n").map((line) => line.trimEnd()).filter((line) => line.length > 0);
  if (lines.length === 0) return { kind: "log", commits: [] };
  if (lines.every((line) => LOG_ONELINE.test(line))) {
    const commits2 = lines.map((line) => {
      const match = LOG_ONELINE.exec(line);
      const refs = match?.[2];
      return {
        hash: match?.[1] ?? "",
        ...refs ? { refs } : {},
        subject: (match?.[3] ?? "").trim()
      };
    });
    return { kind: "log", commits: commits2 };
  }
  const commits = [];
  let current = null;
  for (const line of lines) {
    const start = LOG_COMMIT_LINE.exec(line);
    if (start) {
      current = {
        hash: start[1] ?? "",
        ...start[2] ? { refs: start[2] } : {},
        subject: ""
      };
      commits.push(current);
      continue;
    }
    if (!current) return null;
    if (LOG_HEADER_LINE.test(line)) continue;
    const message = LOG_MESSAGE_LINE.exec(line);
    if (message) {
      if (current.subject === "") current.subject = (message[1] ?? "").trim();
      continue;
    }
    return null;
  }
  if (commits.length === 0) return null;
  return { kind: "log", commits };
}
function parseGitShowStat(text) {
  const lines = String(text ?? "").replace(/\r/g, "").split("\n").map((line) => line.trimEnd());
  let i = 0;
  while (i < lines.length && (lines[i] ?? "") === "") i++;
  if (i >= lines.length) return null;
  const commitMatch = LOG_COMMIT_LINE.exec(lines[i] ?? "");
  if (!commitMatch) return null;
  const hash = commitMatch[1] ?? "";
  i++;
  let subject = "";
  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (line === "") {
      i++;
      continue;
    }
    if (LOG_HEADER_LINE.test(line)) {
      i++;
      continue;
    }
    const message = LOG_MESSAGE_LINE.exec(line);
    if (message) {
      if (subject === "") subject = (message[1] ?? "").trim();
      i++;
      continue;
    }
    break;
  }
  const stat = parseGitDiffStat(lines.slice(i).join("\n"));
  if (!stat) return null;
  return {
    kind: "show-stat",
    hash,
    subject,
    files: stat.files,
    ...stat.filesChanged !== void 0 ? { filesChanged: stat.filesChanged } : {},
    ...stat.insertions !== void 0 ? { insertions: stat.insertions } : {},
    ...stat.deletions !== void 0 ? { deletions: stat.deletions } : {}
  };
}
var DIFF_GIT_HEADER = /^diff --git a\/(.*) b\/(.*)$/;
var HUNK_HEADER = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;
var NEW_FILE_MODE = /^new file mode /;
var DELETED_FILE_MODE = /^deleted file mode /;
function stripDiffPathPrefix(rawPath) {
  let path = rawPath;
  if (path.startsWith('"') && path.endsWith('"')) path = path.slice(1, -1);
  if (path.startsWith("a/")) return path.slice(2);
  if (path.startsWith("b/")) return path.slice(2);
  return path;
}
function parseDiffChunk(chunk) {
  const header = chunk[0] ?? "";
  const dgMatch = DIFF_GIT_HEADER.exec(header);
  if (!dgMatch) return null;
  const dgOld = dgMatch[1] ?? void 0;
  const dgNew = dgMatch[2] ?? void 0;
  let oldPath;
  let newPath;
  let status;
  let binary = false;
  let renameDetected = false;
  const bodyLines = [];
  let additions = 0;
  let removals = 0;
  let inHunk = false;
  let oldLine = 0;
  let newLine = 0;
  for (let i = 1; i < chunk.length; i++) {
    const line = chunk[i] ?? "";
    const hunk = HUNK_HEADER.exec(line);
    if (hunk) {
      oldLine = Number(hunk[1] ?? 0);
      newLine = Number(hunk[2] ?? 0);
      inHunk = true;
      continue;
    }
    if (!inHunk) {
      if (line === "") continue;
      if (line.startsWith("index ")) continue;
      if (NEW_FILE_MODE.test(line)) {
        status = "added";
        continue;
      }
      if (DELETED_FILE_MODE.test(line)) {
        status = "deleted";
        continue;
      }
      if (line.startsWith("old mode ") || line.startsWith("new mode ")) continue;
      if (line.startsWith("similarity index ") || line.startsWith("dissimilarity index ")) {
        renameDetected = true;
        continue;
      }
      if (line.startsWith("rename from ")) {
        oldPath = line.slice("rename from ".length);
        renameDetected = true;
        status = "renamed";
        continue;
      }
      if (line.startsWith("rename to ")) {
        newPath = line.slice("rename to ".length);
        renameDetected = true;
        status = "renamed";
        continue;
      }
      if (line.startsWith("copy from ") || line.startsWith("copy to ")) continue;
      if (line.startsWith("--- ")) {
        const value = line.slice(4);
        if (value !== "/dev/null") oldPath = stripDiffPathPrefix(value);
        continue;
      }
      if (line.startsWith("+++ ")) {
        const value = line.slice(4);
        if (value !== "/dev/null") newPath = stripDiffPathPrefix(value);
        continue;
      }
      if (line.startsWith("Binary files ") || line === "Binary files differ") {
        binary = true;
        const bm = line.match(/^Binary files (?:a\/(\S*) )?and (?:b\/(\S*) )?differ/);
        if (bm) {
          if (!oldPath && bm[1]) oldPath = bm[1];
          if (!newPath && bm[2]) newPath = bm[2];
        }
        continue;
      }
      if (line.startsWith("GIT binary patch")) return null;
      return null;
    }
    if (line.startsWith("\\ No newline")) continue;
    if (line.startsWith("+")) {
      bodyLines.push(`+ ${newLine} ${line.slice(1)}`);
      newLine++;
      additions++;
      continue;
    }
    if (line.startsWith("-")) {
      bodyLines.push(`- ${oldLine} ${line.slice(1)}`);
      oldLine++;
      removals++;
      continue;
    }
    if (line.startsWith(" ")) {
      bodyLines.push(` ${oldLine} ${line.slice(1)}`);
      oldLine++;
      newLine++;
      continue;
    }
    if (line === "") {
      bodyLines.push(` ${oldLine} `);
      oldLine++;
      newLine++;
      continue;
    }
    return null;
  }
  if (!newPath) newPath = dgNew;
  if (!oldPath) oldPath = dgOld;
  let displayPath3;
  if (renameDetected && oldPath && newPath && oldPath !== newPath) {
    displayPath3 = `${oldPath} => ${newPath}`;
  } else {
    displayPath3 = newPath ?? oldPath ?? "(unknown)";
  }
  if (!status) {
    if (binary) status = "modified";
    else if (oldPath && newPath) status = "modified";
    else if (newPath && !oldPath) status = "added";
    else if (oldPath && !newPath) status = "deleted";
  }
  return {
    path: displayPath3,
    ...status ? { status } : {},
    ...binary ? { binary: true } : {},
    additions,
    removals,
    body: bodyLines.join("\n")
  };
}
function parseUnifiedDiff(text) {
  if (text === "") return [];
  const lines = text.split("\n");
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  const chunks = [];
  let current = null;
  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      if (current) chunks.push(current);
      current = [line];
    } else if (current) {
      current.push(line);
    } else {
      return null;
    }
  }
  if (current) chunks.push(current);
  if (chunks.length === 0) return null;
  const files = [];
  for (const chunk of chunks) {
    const file = parseDiffChunk(chunk);
    if (!file) return null;
    files.push(file);
  }
  return files;
}
var SHOW_COMMIT_LINE = /^commit ([0-9a-f]{4,40})/;
var SHOW_SUBJECT_LINE = /^ {4}(.+)$/;
function parseGitDiff(text, show) {
  const raw = String(text ?? "").replace(/\r/g, "");
  let body = raw;
  let hash;
  let subject;
  if (show) {
    const diffIndex = raw.indexOf("diff --git");
    if (diffIndex < 0) return null;
    const headerPart = raw.slice(0, diffIndex);
    body = raw.slice(diffIndex);
    const commitMatch = SHOW_COMMIT_LINE.exec(headerPart);
    if (commitMatch) hash = commitMatch[1];
    for (const headerLine of headerPart.split("\n")) {
      const subjectMatch = SHOW_SUBJECT_LINE.exec(headerLine);
      if (subjectMatch) {
        subject = (subjectMatch[1] ?? "").trim();
        break;
      }
    }
  }
  const files = parseUnifiedDiff(body);
  if (!files) return null;
  return {
    kind: "diff",
    show,
    files,
    ...hash !== void 0 ? { hash } : {},
    ...subject !== void 0 ? { subject } : {}
  };
}
var COMMIT_SUCCESS = /^\[(\S+) ([0-9a-f]{7,40})\] (.*)$/;
var REF_CHAR_LABEL = /^([*=.-]) (?:\[([^\]]*)\]|(\S+))\s+(\S+)\s+->\s+(\S+)$/;
var REF_RANGE = /^([0-9a-f]{4,}\.\.[0-9a-f]{4,})\s+(\S+)\s+->\s+(\S+)$/;
function normalizeRefLine(trimmed) {
  const labeled = REF_CHAR_LABEL.exec(trimmed);
  if (labeled) {
    const marker = labeled[1] ?? "";
    const label = labeled[2] !== void 0 ? `[${labeled[2]}]` : labeled[3] ?? "";
    return `${marker} ${label} ${labeled[4]} -> ${labeled[5]}`;
  }
  const range = REF_RANGE.exec(trimmed);
  if (range) return `${range[1]} ${range[2]} -> ${range[3]}`;
  return null;
}
function isProgressNoise(line) {
  return /^(?:Enumerating|Counting|Compressing|Writing|Deltaing|Resolving|Using) objects:/i.test(line) || /^Total \d+/i.test(line) || line.startsWith("remote: ") || line.startsWith("remote:");
}
function parseGitCommit(text) {
  const lines = String(text ?? "").replace(/\r/g, "").split("\n").map((line) => line.trimEnd());
  let start = 0;
  while (start < lines.length && (lines[start] ?? "") === "") start++;
  let end = lines.length;
  while (end > start && (lines[end - 1] ?? "") === "") end--;
  const body = lines.slice(start, end);
  if (body.length === 0) return null;
  const head = COMMIT_SUCCESS.exec(body[0] ?? "");
  if (head) {
    const branch = head[1] ?? "";
    const hash = head[2] ?? "";
    const subject = (head[3] ?? "").trim();
    if (!branch || !hash) return null;
    let filesChanged;
    let insertions;
    let deletions;
    for (const line of body.slice(1)) {
      const summary = DIFF_STAT_SUMMARY.exec(line);
      if (!summary) return null;
      filesChanged = Number(summary[1]);
      if (summary[2] !== void 0) insertions = Number(summary[2]);
      if (summary[3] !== void 0) deletions = Number(summary[3]);
    }
    return {
      kind: "action",
      command: "commit",
      files: [],
      branch,
      hash,
      ...subject ? { subject } : {},
      ...filesChanged !== void 0 ? { filesChanged } : {},
      ...insertions !== void 0 ? { insertions } : {},
      ...deletions !== void 0 ? { deletions } : {}
    };
  }
  const first = body[0] ?? "";
  const last = body[body.length - 1] ?? "";
  const cleanNothing = body.some((line) => line === "nothing to commit, working tree clean");
  const unstagedNothing = last.startsWith("no changes added to commit");
  if (/^On branch .+/.test(first) && (cleanNothing || unstagedNothing)) {
    return { kind: "action", command: "commit", files: [], status: "nothing to commit" };
  }
  return null;
}
function parseGitPush(text) {
  let remote;
  let status;
  const refs = [];
  let sawContent = false;
  for (const rawLine of String(text ?? "").replace(/\r/g, "").split("\n")) {
    const line = rawLine.trimEnd();
    if (line === "") continue;
    if (isProgressNoise(line)) continue;
    if (/^branch '.*' set up to track '.*'\.$/.test(line)) continue;
    if (line.startsWith("Pushing to ")) continue;
    const toLine = /^To (.+)$/.exec(line);
    if (toLine) {
      sawContent = true;
      remote = toLine[1] ?? "";
      continue;
    }
    if (line === "Everything up-to-date") {
      sawContent = true;
      status = "Everything up-to-date";
      continue;
    }
    const ref = normalizeRefLine(line.trim());
    if (ref) {
      sawContent = true;
      refs.push(ref);
      continue;
    }
    return null;
  }
  if (!sawContent) return null;
  return {
    kind: "action",
    command: "push",
    files: [],
    ...remote !== void 0 ? { remote } : {},
    ...status !== void 0 ? { status } : {},
    ...refs.length > 0 ? { refs } : {}
  };
}
function parseGitPull(text) {
  const lines = String(text ?? "").replace(/\r/g, "").split("\n").map((line) => line.trimEnd());
  const nonEmpty = lines.filter((line) => line !== "");
  if (nonEmpty.length === 0) return null;
  if (nonEmpty.length === 1 && nonEmpty[0] === "Already up to date.") {
    return { kind: "action", command: "pull", files: [], status: "Already up to date." };
  }
  let range;
  let ffIndex = -1;
  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx] ?? "";
    if (line === "") continue;
    if (line.startsWith("From ")) continue;
    if (/^\s+[0-9a-f]{4,}\.\.[0-9a-f]{4,}\s+.+ -> .+$/.test(line)) continue;
    const updating = /^Updating ([0-9a-f]{4,}\.\.[0-9a-f]{4,})$/.exec(line);
    if (updating) {
      range = updating[1] ?? "";
      continue;
    }
    if (line === "Fast-forward") {
      ffIndex = idx;
      break;
    }
    return null;
  }
  if (!range || ffIndex < 0) return null;
  const stat = parseGitDiffStat(lines.slice(ffIndex + 1).join("\n"));
  if (!stat) return null;
  return {
    kind: "action",
    command: "pull",
    files: stat.files,
    status: "Fast-forward",
    range,
    ...stat.filesChanged !== void 0 ? { filesChanged: stat.filesChanged } : {},
    ...stat.insertions !== void 0 ? { insertions: stat.insertions } : {},
    ...stat.deletions !== void 0 ? { deletions: stat.deletions } : {}
  };
}
function parseGitFetch(text) {
  let remote;
  const refs = [];
  let sawContent = false;
  for (const rawLine of String(text ?? "").replace(/\r/g, "").split("\n")) {
    const line = rawLine.trimEnd();
    if (line === "") continue;
    if (isProgressNoise(line)) continue;
    const fromLine = /^From (.+)$/.exec(line);
    if (fromLine) {
      sawContent = true;
      remote = fromLine[1] ?? "";
      continue;
    }
    const ref = normalizeRefLine(line.trim());
    if (ref) {
      sawContent = true;
      refs.push(ref);
      continue;
    }
    return null;
  }
  if (!sawContent) return { kind: "action", command: "fetch", files: [], status: "no new refs" };
  return {
    kind: "action",
    command: "fetch",
    files: [],
    ...remote !== void 0 ? { remote } : {},
    ...refs.length > 0 ? { refs } : {}
  };
}
var DIFF_STAT_NOTICE_LINE = /^\s+(?:create|delete) mode \d+ |^\s+(?:old|new) mode |^\s+mode change |^\s+(?:similarity|dissimilarity) index |^\s+(?:rename|copy) (?:from|to) |^\s+rewrite /;
function parseGitDiffStatTolerant(text) {
  const filtered = String(text ?? "").split("\n").filter((line) => !DIFF_STAT_NOTICE_LINE.test(line)).join("\n");
  return parseGitDiffStat(filtered);
}
var SWITCH_NEW_BRANCH = /^Switched to a new branch '(.+)'$/;
var SWITCH_BRANCH = /^Switched to branch '(.+)'$/;
var SWITCH_ALREADY = /^Already on '(.+)'$/;
var CHECKOUT_PATHS = /^Updated (\d+) paths? from the index$/;
function parseGitSwitchCheckout(text, command) {
  const significant = [];
  for (const rawLine of String(text ?? "").replace(/\r/g, "").split("\n")) {
    const line = rawLine.trimEnd();
    if (line === "") continue;
    if (line.startsWith("Your branch ")) continue;
    if (/^\s+\(/.test(line)) continue;
    significant.push(line);
  }
  if (significant.length === 0) {
    return { kind: "action", command, files: [], status: "completed, no output" };
  }
  if (significant.length === 1) {
    const line = significant[0] ?? "";
    const created = SWITCH_NEW_BRANCH.exec(line);
    if (created && created[1] !== void 0)
      return { kind: "action", command, files: [], branch: created[1], created: true };
    const existing = SWITCH_BRANCH.exec(line);
    if (existing && existing[1] !== void 0) return { kind: "action", command, files: [], branch: existing[1] };
    const already = SWITCH_ALREADY.exec(line);
    if (already && already[1] !== void 0) return { kind: "action", command, files: [], branch: already[1] };
    const paths = CHECKOUT_PATHS.exec(line);
    if (paths) {
      const count = Number(paths[1]);
      return {
        kind: "action",
        command,
        files: [],
        status: `Updated ${count} ${pluralForm("file", count)} from the index`
      };
    }
  }
  return null;
}
function parseGitAddRestore(text, command) {
  const body = String(text ?? "").replace(/\r/g, "");
  if (body.trim() === "") {
    return { kind: "action", command, files: [], status: "completed, no output" };
  }
  return null;
}
var RESET_HEAD_NOW = /^HEAD is now at ([0-9a-f]{4,40}) (.*)$/;
var RESET_UNSTAGED_HEADER = "Unstaged changes after reset:";
var RESET_UNSTAGED_ROW = /^([MADRC?!]{1,2})\t(.+)$/;
function parseGitReset(text) {
  const lines = String(text ?? "").replace(/\r/g, "").split("\n").map((line) => line.trimEnd());
  const nonEmpty = lines.filter((line) => line !== "");
  if (nonEmpty.length === 0) {
    return { kind: "action", command: "reset", files: [], status: "completed, no output" };
  }
  if (nonEmpty.length === 1) {
    const head = RESET_HEAD_NOW.exec(nonEmpty[0] ?? "");
    if (head && head[1] !== void 0) {
      const subject = (head[2] ?? "").trim();
      return {
        kind: "action",
        command: "reset",
        files: [],
        hash: head[1],
        ...subject ? { subject } : {}
      };
    }
    return null;
  }
  if ((nonEmpty[0] ?? "") === RESET_UNSTAGED_HEADER) {
    const resetFiles = [];
    for (const row of nonEmpty.slice(1)) {
      const match = RESET_UNSTAGED_ROW.exec(row ?? "");
      if (!match) return null;
      const marker = match[1] ?? "";
      resetFiles.push({ x: marker[0] ?? " ", y: marker[1] ?? " ", path: match[2] ?? "" });
    }
    if (resetFiles.length === 0) return null;
    return { kind: "action", command: "reset", files: [], resetFiles };
  }
  return null;
}
var MERGE_UPDATING = /^Updating ([0-9a-f]{4,}\.\.[0-9a-f]{4,})$/;
var MERGE_MADE = /^Merge made by the '.*' strategy\.$/;
function parseGitMerge(text) {
  const lines = String(text ?? "").replace(/\r/g, "").split("\n").map((line) => line.trimEnd());
  let start = 0;
  while (start < lines.length && (lines[start] ?? "") === "") start++;
  let end = lines.length;
  while (end > start && (lines[end - 1] ?? "") === "") end--;
  const body = lines.slice(start, end);
  if (body.length === 0) return null;
  if (body.length === 1 && (body[0] ?? "") === "Already up to date.") {
    return { kind: "action", command: "merge", files: [], status: "Already up to date." };
  }
  let idx = 0;
  let range;
  const updating = MERGE_UPDATING.exec(body[0] ?? "");
  if (updating) {
    range = updating[1];
    idx = 1;
  }
  const marker = body[idx] ?? "";
  if (range && marker === "Fast-forward") {
    const stat = parseGitDiffStatTolerant(body.slice(idx + 1).join("\n"));
    if (!stat) return null;
    return {
      kind: "action",
      command: "merge",
      files: stat.files,
      status: "Fast-forward",
      range,
      ...stat.filesChanged !== void 0 ? { filesChanged: stat.filesChanged } : {},
      ...stat.insertions !== void 0 ? { insertions: stat.insertions } : {},
      ...stat.deletions !== void 0 ? { deletions: stat.deletions } : {}
    };
  }
  if (MERGE_MADE.exec(marker)) {
    const stat = parseGitDiffStatTolerant(body.slice(idx + 1).join("\n"));
    if (!stat) return null;
    return {
      kind: "action",
      command: "merge",
      files: stat.files,
      status: marker,
      ...stat.filesChanged !== void 0 ? { filesChanged: stat.filesChanged } : {},
      ...stat.insertions !== void 0 ? { insertions: stat.insertions } : {},
      ...stat.deletions !== void 0 ? { deletions: stat.deletions } : {}
    };
  }
  return null;
}
var REBASE_SUCCESS = /^Successfully rebased and updated refs\/heads\/(.+)$/;
var REBASE_UPTODATE = /^Current branch (.+) is up to date\.$/;
function parseGitRebase(text) {
  const significant = [];
  for (const rawLine of String(text ?? "").replace(/\r/g, "\n").split("\n")) {
    const line = rawLine.trimEnd();
    if (line === "") continue;
    if (/^Rebasing \(\d+\/\d+\)/.test(line)) continue;
    if (/^Rewriting commits \(\d+\/\d+\)/.test(line)) continue;
    significant.push(line);
  }
  if (significant.length === 1) {
    const line = significant[0] ?? "";
    const success = REBASE_SUCCESS.exec(line);
    if (success && success[1] !== void 0)
      return {
        kind: "action",
        command: "rebase",
        files: [],
        branch: success[1].replace(/\.$/, ""),
        status: "Rebased"
      };
    const upToDate = REBASE_UPTODATE.exec(line);
    if (upToDate && upToDate[1] !== void 0)
      return { kind: "action", command: "rebase", files: [], branch: upToDate[1], status: "Up to date." };
  }
  return null;
}
function parseGitAction(command, text) {
  if (command === "commit") return parseGitCommit(text);
  if (command === "push") return parseGitPush(text);
  if (command === "pull") return parseGitPull(text);
  if (command === "fetch") return parseGitFetch(text);
  if (command === "switch" || command === "checkout") return parseGitSwitchCheckout(text, command);
  if (command === "add" || command === "restore") return parseGitAddRestore(text, command);
  if (command === "reset") return parseGitReset(text);
  if (command === "merge") return parseGitMerge(text);
  return parseGitRebase(text);
}
var GIT_CARD_HEAD_LIMIT = 6;
var GIT_CONFLICT_PAIRS = /* @__PURE__ */ new Set(["UU", "AA", "DD", "AU", "UA", "DU", "UD"]);
function gitCardHeader(theme, cls, parsed) {
  let prefix;
  if (cls.kind === "diff") {
    const label = cls.show ? "Git show" : "Git diff";
    prefix = label;
    if (cls.show && parsed?.kind === "diff" && parsed.hash) {
      const shortHash = parsed.hash.slice(0, 7);
      prefix += ` \xB7 ${shortHash}`;
      if (parsed.subject) prefix += ` \xB7 ${parsed.subject}`;
    }
  } else if (cls.kind === "show-stat") {
    prefix = "Git show";
    if (parsed?.kind === "show-stat") {
      prefix += ` \xB7 ${parsed.hash.slice(0, 7)}`;
      if (parsed.subject) prefix += ` \xB7 ${parsed.subject}`;
    }
  } else if (cls.kind === "action") {
    const label = cls.command === "commit" ? "Git commit" : cls.command === "push" ? "Git push" : cls.command === "pull" ? "Git pull" : cls.command === "fetch" ? "Git fetch" : cls.command === "switch" ? "Git switch" : cls.command === "checkout" ? "Git checkout" : cls.command === "add" ? "Git add" : cls.command === "restore" ? "Git restore" : cls.command === "reset" ? "Git reset" : cls.command === "merge" ? "Git merge" : "Git rebase";
    prefix = label;
    if (parsed?.kind === "action") {
      if ((parsed.command === "commit" || parsed.command === "reset") && parsed.hash) {
        prefix += ` \xB7 ${parsed.hash.slice(0, 7)}`;
        if (parsed.subject) prefix += ` \xB7 ${parsed.subject}`;
      } else if ((parsed.command === "switch" || parsed.command === "checkout" || parsed.command === "rebase") && parsed.branch) {
        prefix += ` \xB7 ${parsed.branch}`;
      }
    }
  } else {
    const label = cls.kind === "status" ? "Git status" : cls.kind === "diff-stat" ? "Git diff --stat" : "Git log";
    prefix = label;
  }
  return typeof theme?.bold === "function" ? theme.bold(prefix) : prefix;
}
function statusMarker(file) {
  const xy = `${file.x}${file.y}`;
  if (GIT_CONFLICT_PAIRS.has(xy)) return "U";
  if (file.x === "?" || file.x === "!") return file.x;
  const staged = file.x !== " " ? file.x : "";
  const worktree = file.y !== " " && file.y !== "?" && file.y !== "!" ? file.y : "";
  return `${staged}${worktree}` || " ";
}
function statusMarkColor(file) {
  const xy = `${file.x}${file.y}`;
  if (GIT_CONFLICT_PAIRS.has(xy)) return "error";
  if (file.x === "?") return "warning";
  if (file.x === "!") return "dim";
  if (file.x !== " ") return "accent";
  return "toolOutput";
}
function statusCounts(theme, parsed) {
  let staged = 0;
  let modified = 0;
  let untracked = 0;
  let ignored = 0;
  let conflicted = 0;
  for (const file of parsed.files) {
    const xy = `${file.x}${file.y}`;
    if (GIT_CONFLICT_PAIRS.has(xy)) conflicted++;
    else if (file.x === "?" || file.x === "!") {
      if (file.x === "!") ignored++;
      else untracked++;
    } else if (file.x !== " ") staged++;
    else if (file.y !== " ") modified++;
  }
  const parts = [];
  if (conflicted > 0) parts.push(theme.fg("error", `${conflicted} conflicted`));
  if (staged > 0) parts.push(theme.fg("accent", `${staged} staged`));
  if (modified > 0) parts.push(theme.fg("accent", `${modified} modified`));
  if (untracked > 0) parts.push(theme.fg("warning", `${untracked} untracked`));
  if (ignored > 0) parts.push(theme.fg("dim", `${ignored} ignored`));
  return parts;
}
function renderStatusCard(theme, parsed, out, width) {
  const counts = statusCounts(theme, parsed);
  if (counts.length > 0) out.push(`  ${counts.join(theme.fg("dim", " \xB7 "))}`);
  else out.push(theme.fg("muted", "  nothing to commit, working tree clean"));
  if (parsed.branch && (parsed.ahead !== void 0 || parsed.behind !== void 0)) {
    const parts = [theme.fg("text", parsed.branch)];
    if (parsed.ahead !== void 0) parts.push(theme.fg("accent", `ahead ${parsed.ahead}`));
    if (parsed.behind !== void 0) parts.push(theme.fg("warning", `behind ${parsed.behind}`));
    out.push(`  ${parts.join(theme.fg("dim", " \xB7 "))}`);
  }
  const files = parsed.files;
  return renderStatusFileRows(theme, files, out, width);
}
function compactGitPath(path, availableWidth = TOOL_PATH_MAX_WIDTH) {
  const width = Math.max(0, Math.min(TOOL_PATH_MAX_WIDTH, availableWidth));
  if (safeVisibleWidth(path) <= width) return path;
  const arrow = / (?:->|=>) /.exec(path);
  if (!arrow || width < 6) return compactToolPath(path, width);
  const budget = width - arrow[0].length;
  const left = compactToolPath(path.slice(0, arrow.index), Math.floor(budget / 2));
  const right = compactToolPath(path.slice(arrow.index + arrow[0].length), Math.ceil(budget / 2));
  return `${left}${arrow[0]}${right}`;
}
function renderStatusFileRows(theme, files, out, width) {
  const visible = files.slice(0, GIT_CARD_HEAD_LIMIT);
  const more = files.length - visible.length;
  const lastIndex = visible.length - 1;
  for (let i = 0; i < visible.length; i++) {
    const file = visible[i];
    if (!file) continue;
    const branch = i < lastIndex || more > 0 ? "\u251C\u2500" : "\u2514\u2500";
    const mark = statusMarker(file);
    const prefix = `${TREE_INDENT}${dimLine(branch)} ${theme.fg(statusMarkColor(file), mark)}  `;
    const line = `${prefix}${theme.fg("toolOutput", compactGitPath(file.path, width - safeVisibleWidth(prefix)))}`;
    out.push(safeTruncateToWidth(line, width, "\u2026"));
  }
  if (more > 0) {
    out.push(
      safeTruncateToWidth(
        `${TREE_INDENT}${dimLine("\u2514\u2500")} ${theme.fg("dim", `\u2026 ${more} more ${pluralForm("file", more)}`)}`,
        width,
        "\u2026"
      )
    );
  }
  return out;
}
function renderDiffStatCard(theme, parsed, out, width) {
  const summaryParts = [];
  if (parsed.filesChanged !== void 0) {
    summaryParts.push(theme.fg("accent", `${parsed.filesChanged} ${pluralForm("file", parsed.filesChanged)} changed`));
  }
  const diffParts = [];
  if (parsed.insertions !== void 0 && parsed.insertions > 0) {
    diffParts.push(theme.fg("toolDiffAdded", `+${parsed.insertions}`));
  }
  if (parsed.deletions !== void 0 && parsed.deletions > 0) {
    diffParts.push(theme.fg("toolDiffRemoved", `-${parsed.deletions}`));
  }
  if (diffParts.length > 0) summaryParts.push(diffParts.join(" "));
  if (summaryParts.length > 0) out.push(`  ${summaryParts.join(theme.fg("dim", " \xB7 "))}`);
  else out.push(theme.fg("muted", "  no changes"));
  const files = parsed.files;
  const visible = files.slice(0, GIT_CARD_HEAD_LIMIT);
  const more = files.length - visible.length;
  const lastIndex = visible.length - 1;
  for (let i = 0; i < visible.length; i++) {
    const file = visible[i];
    if (!file) continue;
    const branch = i < lastIndex || more > 0 ? "\u251C\u2500" : "\u2514\u2500";
    const changes = file.changes ?? 0;
    const detail = theme.fg("dim", file.binary ? "\xB7 binary" : `\xB7 ${changes} ${pluralForm("change", changes)}`);
    const prefix = `${TREE_INDENT}${dimLine(branch)} `;
    const path = compactGitPath(file.path, width - safeVisibleWidth(prefix) - safeVisibleWidth(detail) - 1);
    const line = `${prefix}${theme.fg("toolOutput", path)} ${detail}`;
    out.push(safeTruncateToWidth(line, width, "\u2026"));
  }
  if (more > 0) {
    out.push(
      safeTruncateToWidth(
        `${TREE_INDENT}${dimLine("\u2514\u2500")} ${theme.fg("dim", `\u2026 ${more} more ${pluralForm("file", more)}`)}`,
        width,
        "\u2026"
      )
    );
  }
  return out;
}
function renderLogCard(theme, parsed, out, width) {
  const commits = parsed.commits;
  if (commits.length === 0) {
    out.push(theme.fg("muted", "  no commits"));
    return out;
  }
  const visible = commits.slice(0, GIT_CARD_HEAD_LIMIT);
  const more = commits.length - visible.length;
  const lastIndex = visible.length - 1;
  for (let i = 0; i < visible.length; i++) {
    const commit = visible[i];
    if (!commit) continue;
    const branch = i < lastIndex || more > 0 ? "\u251C\u2500" : "\u2514\u2500";
    const refs = commit.refs ? ` (${commit.refs})` : "";
    const subject = commit.subject ? `  ${commit.subject}` : "";
    const line = `${TREE_INDENT}${dimLine(branch)} ${theme.fg("accent", commit.hash)}${theme.fg("dim", refs)}${theme.fg("toolOutput", subject)}`;
    out.push(line);
  }
  if (more > 0) {
    out.push(
      safeTruncateToWidth(
        `${TREE_INDENT}${dimLine("\u2514\u2500")} ${theme.fg("dim", `\u2026 ${more} more ${pluralForm("commit", more)}`)}`,
        width,
        "\u2026"
      )
    );
  }
  return out;
}
function renderDiffCard(theme, parsed, out, width) {
  const files = parsed.files;
  if (files.length === 0) {
    out.push(theme.fg("muted", "  no changes"));
    return out;
  }
  let additions = 0;
  let removals = 0;
  for (const file of files) {
    additions += file.additions;
    removals += file.removals;
  }
  const parts = [theme.fg("accent", `${files.length} ${pluralForm("file", files.length)}`)];
  if (additions > 0) parts.push(theme.fg("toolDiffAdded", `+${additions}`));
  if (removals > 0) parts.push(theme.fg("toolDiffRemoved", `-${removals}`));
  out.push(safeTruncateToWidth(`  ${parts.join(" ")}`, width, "\u2026"));
  return out;
}
function renderActionCard(theme, parsed, out, width) {
  if (parsed.command === "commit") {
    if (parsed.status) {
      out.push(theme.fg("muted", `  ${parsed.status}`));
      return out;
    }
    renderDiffStatCard(theme, parsed, out, width);
    return out;
  }
  if (parsed.command === "pull") {
    if (parsed.status === "Already up to date.") {
      out.push(theme.fg("muted", "  Already up to date."));
      return out;
    }
    if (parsed.range) out.push(`  ${theme.fg("text", parsed.range)}`);
    out.push(`  ${theme.fg("accent", "Fast-forward")}`);
    renderDiffStatCard(theme, parsed, out, width);
    return out;
  }
  if (parsed.command === "push") {
    if (parsed.remote) out.push(theme.fg("dim", `  To ${parsed.remote}`));
    for (const ref of parsed.refs ?? []) out.push(safeTruncateToWidth(`  ${theme.fg("toolOutput", ref)}`, width, "\u2026"));
    if (parsed.status) out.push(theme.fg("muted", `  ${parsed.status}`));
    return out;
  }
  if (parsed.command === "fetch") {
    if (parsed.status) {
      out.push(theme.fg("muted", `  ${parsed.status}`));
      return out;
    }
    if (parsed.remote) out.push(theme.fg("dim", `  From ${parsed.remote}`));
    for (const ref of parsed.refs ?? []) out.push(safeTruncateToWidth(`  ${theme.fg("toolOutput", ref)}`, width, "\u2026"));
    return out;
  }
  if (parsed.command === "merge") {
    if (parsed.status === "Already up to date.") {
      out.push(theme.fg("muted", "  Already up to date."));
      return out;
    }
    if (parsed.range) out.push(`  ${theme.fg("text", parsed.range)}`);
    if (parsed.status) out.push(`  ${theme.fg("accent", parsed.status)}`);
    renderDiffStatCard(theme, parsed, out, width);
    return out;
  }
  if (parsed.command === "reset") {
    if (parsed.resetFiles && parsed.resetFiles.length > 0) {
      return renderStatusFileRows(theme, parsed.resetFiles, out, width);
    }
    if (parsed.status) out.push(theme.fg("muted", `  ${parsed.status}`));
    return out;
  }
  if (parsed.status) out.push(theme.fg("muted", `  ${parsed.status}`));
  return out;
}
function parseGitOutput(cls, output) {
  const text = String(output ?? "");
  if (cls.kind === "status") return parseGitStatus(cls, text);
  if (cls.kind === "diff-stat") return parseGitDiffStat(text);
  if (cls.kind === "show-stat") return parseGitShowStat(text);
  if (cls.kind === "diff") return parseGitDiff(text, cls.show);
  if (cls.kind === "action") return parseGitAction(cls.command, text);
  return parseGitLog(text);
}
function renderGitCardLines(theme, state, width) {
  const safeWidth = Math.max(1, width);
  const out = [safeTruncateToWidth(gitCardHeader(theme, state.cls, state.parsed), safeWidth, "\u2026")];
  const parsed = state.parsed;
  if (!parsed) return out;
  if (parsed.kind === "status") renderStatusCard(theme, parsed, out, safeWidth);
  else if (parsed.kind === "diff-stat") renderDiffStatCard(theme, parsed, out, safeWidth);
  else if (parsed.kind === "show-stat") renderDiffStatCard(theme, parsed, out, safeWidth);
  else if (parsed.kind === "diff") renderDiffCard(theme, parsed, out, safeWidth);
  else if (parsed.kind === "action") renderActionCard(theme, parsed, out, safeWidth);
  else renderLogCard(theme, parsed, out, safeWidth);
  return out.map((line) => safeTruncateToWidth(line, safeWidth, "\u2026"));
}
var GIT_DIFF_MAX_HIGHLIGHT_CHARS = 12e3;
var GIT_DIFF_MAX_HIGHLIGHT_ROWS = 120;
var GIT_DIFF_MAX_ROWS_COLLAPSED = 36;
var GIT_DIFF_MAX_ROWS_EXPANDED = 160;
function diffStatsFragment(theme, stats) {
  const plus = stats.additions > 0 ? theme.fg("toolDiffAdded", `+${stats.additions}`) : theme.fg("dim", "+0");
  const minus = stats.removals > 0 ? theme.fg("toolDiffRemoved", `-${stats.removals}`) : theme.fg("dim", "-0");
  return `${plus} ${minus}`;
}
function fileBoxTopLabel(theme, path, stats) {
  const label = compactGitPath(path);
  const body = stats ? `${theme.fg("text", label)} \xB7 ${diffStatsFragment(theme, stats)}` : theme.fg("text", label);
  return typeof theme?.bold === "function" ? theme.bold(body) : body;
}
function binaryBodyLine(theme, status) {
  const verb = status === "added" ? "added" : status === "deleted" ? "removed" : status === "renamed" ? "renamed" : "changed";
  return theme.fg("muted", `Binary file ${verb} (content not shown)`);
}
function renderGitDiffResult(theme, parsed, options, context) {
  const expanded = Boolean(options.expanded);
  let totalAdditions = 0;
  let totalRemovals = 0;
  const sigParts = [];
  for (const file of parsed.files) {
    totalAdditions += file.additions;
    totalRemovals += file.removals;
    sigParts.push(
      `${file.path}:${file.body.length}:${file.additions}:${file.removals}:${file.binary ? 1 : 0}:${file.status ?? ""}`
    );
  }
  const sig = sigParts.join(";").slice(0, 2048);
  return memoizedStateComponent(
    context.state,
    "__piStyleGitDiffResult",
    getRenderCacheKey(
      "git-diff-result",
      theme,
      String(parsed.show),
      String(expanded),
      parsed.files.length,
      totalAdditions,
      totalRemovals,
      sig
    ),
    () => buildGitDiffResultComponent(theme, parsed, expanded, context)
  );
}
function buildGitDiffResultComponent(theme, parsed, expanded, context) {
  const elapsedMs = getStateElapsedMs(context.state);
  const fileCount = parsed.files.length;
  const footerParts = [];
  if (elapsedMs !== void 0) footerParts.push(theme.fg("text", formatElapsedMs(elapsedMs)));
  if (fileCount > 1) footerParts.push(theme.fg("dim", `${fileCount} ${pluralForm("file", fileCount)}`));
  const footer = footerParts.join(theme.fg("dim", " \xB7 "));
  const fileBoxes = [];
  if (parsed.files.length === 0) {
    const emptyFooterParts = [];
    if (elapsedMs !== void 0) emptyFooterParts.push(theme.fg("text", formatElapsedMs(elapsedMs)));
    const emptyFooter = emptyFooterParts.join(theme.fg("dim", " \xB7 "));
    fileBoxes.push({
      topLabel: fileBoxTopLabel(theme, parsed.show ? "Git show" : "Git diff"),
      resultComponent: renderBoxedToolResult(theme, () => [theme.fg("muted", "No changes")], {
        showDivider: false,
        skipLeadingBlank: true,
        footerLines: emptyFooter ? [emptyFooter] : []
      })
    });
  } else {
    for (const file of parsed.files) {
      if (file.binary) {
        fileBoxes.push({
          topLabel: fileBoxTopLabel(theme, file.path),
          resultComponent: renderBoxedToolResult(theme, () => [binaryBodyLine(theme, file.status)], {
            showDivider: false,
            skipLeadingBlank: true,
            footerLines: footer ? [footer] : []
          })
        });
        continue;
      }
      const rows = buildSplitRows(file.body);
      const language = getLanguageFromPath(file.path);
      const shouldHighlight = Boolean(language) && file.body.length <= GIT_DIFF_MAX_HIGHLIGHT_CHARS && rows.length <= GIT_DIFF_MAX_HIGHLIGHT_ROWS;
      const maxRows = expanded ? GIT_DIFF_MAX_ROWS_EXPANDED : GIT_DIFF_MAX_ROWS_COLLAPSED;
      const view = new AdaptiveDiffComponent(theme, rows, maxRows, shouldHighlight ? language : void 0);
      const expandHint = !expanded && view.hasCollapsed() ? "Ctrl+O more" : void 0;
      fileBoxes.push({
        topLabel: fileBoxTopLabel(theme, file.path, countDiffStats(file.body)),
        resultComponent: renderBoxedToolResult(theme, view, {
          // Stats live in the frame's top border (`path · +N -M`) — no divider.
          showDivider: false,
          skipLeadingBlank: true,
          footerLines: footer ? [footer] : [],
          ...expandHint ? { expandHint } : {}
        })
      });
    }
  }
  let cacheWidth;
  let cacheLines;
  return {
    invalidate() {
      cacheWidth = void 0;
      cacheLines = void 0;
      for (const box of fileBoxes) box.resultComponent.invalidate();
    },
    render(width) {
      if (cacheWidth === width && cacheLines) return cacheLines;
      const renderedWidth = boxWidth(width);
      const lines = [];
      for (const box of fileBoxes) {
        lines.push(boxLabeledBorder(theme, "\u256D", "\u256E", box.topLabel, void 0, renderedWidth));
        lines.push(boxBlankLine(theme, renderedWidth));
        lines.push(...box.resultComponent.render(width));
      }
      cacheWidth = width;
      cacheLines = lines;
      return lines;
    }
  };
}

// ../../.pi/agent/npm/node_modules/@quandev104/pi-style/extension-src/pi-style/features/tools/boxed/bash.ts
var MAX_LINE_CHARS = 2e3;
var ESC3 = "\x1B";
var BASH_TOOL_NOTICE_PATTERN = /^\[Showing (?:last|lines)\b.*\. Full output: .+\]$/;
var BG_ANSI_PATTERN2 = new RegExp(`${ESC3}\\[4[0-9;]*m`, "g");
var SHELL_VAR_PATTERN = /\$\{?[A-Za-z_][A-Za-z0-9_]*\}?/;
var SHELL_OP_PATTERN = /^(?:&&|\|\||>>|>&|\|&|[|&;()<>])$/;
function highlightBashFallback(line) {
  try {
    const highlighted = highlightCode2(line, "bash")[0] ?? line;
    return highlighted.replace(BG_ANSI_PATTERN2, "");
  } catch {
    return line;
  }
}
function normalizeShellWord(word) {
  return word.replace(/^(['"])(.*)\1$/, "$2");
}
function colorShellWord(theme, word, commandExpected) {
  const normalized = normalizeShellWord(word);
  if (/^[A-Za-z_][A-Za-z0-9_]*=.*/.test(normalized)) return theme.fg("syntaxVariable", word);
  if (normalized.startsWith("-")) return theme.fg("syntaxKeyword", word);
  if (normalized.includes("/") || /^\.{1,2}(?:\/|$)/.test(normalized)) return theme.fg("syntaxVariable", word);
  if (SHELL_VAR_PATTERN.test(normalized)) return theme.fg("syntaxVariable", word);
  return commandExpected ? theme.fg("syntaxFunction", word) : theme.fg("syntaxString", word);
}
function tokenizeShellLinePreservingText(line) {
  const tokens = [];
  let current = "";
  let quote = null;
  for (let i = 0; i < line.length; i++) {
    const char = line[i] ?? "";
    const next = line[i + 1] ?? "";
    if (quote) {
      current += char;
      if (char === "\\" && next) current += line[++i] ?? "";
      else if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      current += char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) tokens.push(current);
      current = "";
      tokens.push(char);
      continue;
    }
    if (char === "#" && !current) {
      if (current) tokens.push(current);
      tokens.push(line.slice(i));
      return tokens;
    }
    const two = `${char}${next}`;
    if (SHELL_OP_PATTERN.test(two) || SHELL_OP_PATTERN.test(char)) {
      if (current) tokens.push(current);
      current = "";
      if (SHELL_OP_PATTERN.test(two)) {
        tokens.push(two);
        i++;
      } else {
        tokens.push(char);
      }
      continue;
    }
    current += char;
  }
  if (quote) return void 0;
  if (current) tokens.push(current);
  return tokens;
}
function highlightBashLine(line, theme) {
  const tokens = tokenizeShellLinePreservingText(line);
  if (!tokens) return highlightBashFallback(line);
  let commandExpected = true;
  return tokens.map((token) => {
    if (/^\s+$/.test(token)) return token;
    if (token.startsWith("#")) return theme.fg("syntaxComment", token);
    if (SHELL_OP_PATTERN.test(token)) {
      commandExpected = token === "|" || token === "||" || token === "&&" || token === ";" || token === "&";
      return theme.fg("syntaxOperator", token);
    }
    const styled = colorShellWord(theme, token, commandExpected);
    if (!/^[A-Za-z_][A-Za-z0-9_]*=.*/.test(normalizeShellWord(token))) commandExpected = false;
    return styled;
  }).join("");
}
function clampLineLength(line, max = MAX_LINE_CHARS) {
  if (line.length <= max) return line;
  return `${truncateAtCodePointBoundary(line, max)}\u2026 (truncated)`;
}
function countNewlines(text, from, to) {
  let count = 0;
  for (let i = from; i < to; i++) {
    if (text.charCodeAt(i) === 10) count++;
  }
  return count;
}
function findBackwardLineStart(text, need, end = text.length) {
  let found = 0;
  for (let i = end - 1; i >= 0; i--) {
    if (text.charCodeAt(i) === 10 && ++found >= need) return i + 1;
  }
  return 0;
}
function isOutputWhitespaceCode(code) {
  if (code === 32 || code >= 9 && code <= 13) return true;
  if (code === 133 || code === 160 || code === 5760) return true;
  if (code >= 8192 && code <= 8202) return true;
  return code === 8232 || code === 8233 || code === 8239 || code === 8287 || code === 12288 || code === 65279;
}
function lastVisibleEnd(text) {
  for (let i = text.length - 1; i >= 0; i--) {
    if (!isOutputWhitespaceCode(text.charCodeAt(i))) return i + 1;
  }
  return 0;
}
function stripBashToolNoticeLines(text) {
  const filteredLines = text.replace(/\r/g, "").split("\n").filter((line) => !BASH_TOOL_NOTICE_PATTERN.test(line.trim()));
  return filteredLines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd();
}
function bashWidthKey(rawCommand, timeout) {
  return boxedToolWidthKey("Bash", `${rawCommand}|${timeout ?? ""}`);
}
function renderBoxedBashCall(theme, commandLines, context, widthKey) {
  const maxCommandLines = 5;
  const shownCount = Math.min(commandLines.length, maxCommandLines + 1);
  const detailLines = [];
  for (let i = 0; i < shownCount; i++) {
    const prefix = i === 0 ? theme.fg("dim", "$ ") : theme.fg("dim", "> ");
    detailLines.push(`${prefix}${highlightBashLine(commandLines[i] ?? "", theme)}`);
  }
  if (commandLines.length > maxCommandLines + 1) {
    detailLines.push(theme.fg("muted", `... ${commandLines.length - maxCommandLines - 1} more lines`));
  }
  const running = Boolean(context.executionStarted);
  const resultSeen = isResultSeen(context.state);
  const base = {
    widthKey,
    isError: Boolean(context.isError),
    isPartial: Boolean(context.isPartial),
    isPending: Boolean(context.isPartial),
    running
  };
  if (running && context.isPartial && !resultSeen) {
    detailLines.push(theme.fg("dim", "No output received yet"));
    return renderBoxedToolCall(theme, "Bash", detailLines, {
      ...base,
      pendingLabel: formatBoxedRunningStatus(theme, getStateElapsedMs(context.state))
    });
  }
  return renderBoxedToolCall(theme, "Bash", detailLines, { ...base, resultSeen });
}
var BASH_STATUS_PATTERNS = [
  {
    re: /(?:^|\n\n)Command timed out after ([\d.]+) seconds$/i,
    build: (match) => ({ kind: "timeout", seconds: Number(match[1]) })
  },
  { re: /(?:^|\n\n)[^\n]*aborted$/i, build: () => ({ kind: "cancelled" }) },
  {
    re: /(?:^|\n\n)Command exited with code (\d+)$/i,
    build: (match) => ({ kind: "exit", exitCode: Number(match[1]) })
  }
];
function parseBashTerminalStatus(text) {
  const clean = String(text ?? "").replace(/\r/g, "");
  for (const { re, build } of BASH_STATUS_PATTERNS) {
    const match = clean.match(re);
    if (match && match.index !== void 0) {
      return { status: build(match), body: clean.slice(0, match.index).trimEnd() };
    }
  }
  if (/^(?:operation )?aborted(?: after \d+ retry attempts?)?$/i.test(clean.trim())) {
    return { status: { kind: "cancelled" }, body: "" };
  }
  return { status: void 0, body: clean };
}
function bashErrorLabel(status) {
  if (status?.kind === "timeout") return "\u2717 Timed out";
  if (status?.kind === "cancelled") return "\u2717 Cancelled";
  return void 0;
}
function bashEmptyBodyText(status, isError) {
  if (status?.kind === "timeout") return "No output was received before the timeout";
  if (status?.kind === "cancelled") return "Command was cancelled without producing output";
  if (isError) return "Command failed without producing output";
  return "Command completed without producing output";
}
function bashFooter(theme, status, elapsedMs, bodyText, isError) {
  const elapsed = elapsedMs === void 0 ? "--" : `${(elapsedMs / 1e3).toFixed(2)}s`;
  const words = bodyText.trim() ? formatBoxedWords(bodyText) : "";
  if (status?.kind === "timeout") {
    const seconds = Number.isFinite(status.seconds) && status.seconds > 0 ? status.seconds : Number.NaN;
    return theme.fg(
      "warning",
      Number.isFinite(seconds) ? `Terminated after ${seconds.toFixed(1)}s` : "Terminated by timeout"
    );
  }
  if (status?.kind === "cancelled") {
    return [theme.fg("warning", "Cancelled"), theme.fg("text", elapsed)].join(theme.fg("dim", " \xB7 "));
  }
  const exitLabel = status?.kind === "exit" ? `Exit ${status.exitCode}` : isError ? "Failed" : "Exit 0";
  const exitColor = status?.kind === "exit" && status.exitCode !== 0 ? "error" : "text";
  const parts = [theme.fg(exitColor, exitLabel), theme.fg("text", elapsed)];
  if (words) parts.push(theme.fg("dim", words));
  return parts.join(theme.fg("dim", " \xB7 "));
}
var INTERACTIVE_COMMANDS = /* @__PURE__ */ new Set([
  "pi",
  "vim",
  "vi",
  "nvim",
  "nano",
  "less",
  "more",
  "man",
  "top",
  "htop",
  "btop",
  "ssh",
  "telnet",
  "python",
  "python3",
  "node",
  "sqlite3",
  "mysql",
  "psql",
  "redis-cli",
  "mongosh",
  "bc",
  "irssi"
]);
function isInteractiveCommand(command) {
  const base = (String(command ?? "").trim().split(/\s+/)[0] ?? "").split("/").pop() ?? "";
  return INTERACTIVE_COMMANDS.has(base);
}
function bashBodyComponent(preview, emptyLines) {
  if (!emptyLines) return preview;
  return {
    invalidate: () => preview.invalidate(),
    render(width) {
      const lines = preview.render(width);
      return lines.length > 0 ? lines : emptyLines;
    }
  };
}
function renderBashStreamingResult(theme, raw, options, context) {
  const contentEnd = lastVisibleEnd(raw);
  const hasOutput = contentEnd > 0;
  const tailStart = hasOutput ? findBackwardLineStart(raw, getToolsRenderConfig().maxCollapsedLines + 10, contentEnd) : 0;
  const body = stripBashToolNoticeLines(stripAnsi(raw.slice(tailStart, contentEnd)));
  const elapsed = getStateElapsedMs(context.state);
  const emptyLines = [theme.fg("dim", "No output received yet")];
  if (!hasOutput && isInteractiveCommand(context?.args?.command) && (elapsed ?? 0) >= 1e3) {
    emptyLines.push(theme.fg("dim", "The process may be waiting for terminal input"));
  }
  const preview = createBashResultPreview(theme, body, options, "toolOutput");
  const rawCommand = String(context?.args?.command ?? "...");
  return renderBoxedToolResult(theme, bashBodyComponent(preview, hasOutput ? void 0 : emptyLines), {
    widthKey: bashWidthKey(rawCommand, context?.args?.timeout),
    referenceLines: rawCommand.split("\n").map((line, index) => `${index === 0 ? "$ " : "> "}${line}`),
    dividerLabel: "Output",
    showDivider: hasOutput,
    footerLines: [formatBoxedRunningStatus(theme, elapsed)],
    isPartial: true
  });
}
function renderBashFinalResult(theme, raw, options, context) {
  const isError = Boolean(context.isError);
  const clean = stripAnsi(raw);
  const { status, body: statusStripped } = parseBashTerminalStatus(clean);
  const output = stripBashToolNoticeLines(statusStripped);
  const elapsed = getStateElapsedMs(context.state);
  const outputColor = isError ? "error" : "toolOutput";
  const footer = bashFooter(theme, status, elapsed, output, isError);
  const errorLabel = isError ? bashErrorLabel(status) ?? "\u2717 Error" : void 0;
  const rawCommand = String(context?.args?.command ?? "...");
  const widthKey = bashWidthKey(rawCommand, context?.args?.timeout);
  const referenceLines = rawCommand.split("\n").map((line, index) => `${index === 0 ? "$ " : "> "}${line}`);
  if (!options.expanded) {
    const scanLines = getToolsRenderConfig().maxCollapsedLines + 10;
    const tailStart = findBackwardLineStart(statusStripped, scanLines);
    const tail = stripBashToolNoticeLines(stripAnsi(statusStripped.slice(tailStart)));
    const totalLinesBefore = tailStart > 0 ? countNewlines(statusStripped, 0, tailStart) : 0;
    const preview2 = createBashResultPreview(theme, tail, options, outputColor);
    return renderBoxedToolResult(
      theme,
      bashBodyComponent(
        preview2,
        statusStripped.trim() ? void 0 : [theme.fg("muted", bashEmptyBodyText(status, isError))]
      ),
      {
        widthKey,
        referenceLines,
        footerLines: [footer],
        ...totalLinesBefore > 0 ? { expandHint: "Ctrl+O for more" } : {},
        isError,
        isPartial: false,
        ...errorLabel ? { errorLabel } : {}
      }
    );
  }
  const preview = createBashResultPreview(theme, output, options, outputColor);
  return renderBoxedToolResult(
    theme,
    bashBodyComponent(preview, output.trim() ? void 0 : [theme.fg("muted", bashEmptyBodyText(status, isError))]),
    {
      widthKey,
      referenceLines,
      footerLines: [footer],
      isError,
      isPartial: false,
      ...errorLabel ? { errorLabel } : {}
    }
  );
}
var EMPTY_BASH_RESULT = Object.freeze({
  invalidate() {
  },
  render() {
    return [];
  }
});
function createBashResultPreview(theme, text, options, color) {
  let cacheKey = "";
  let cacheLines = null;
  return {
    invalidate() {
      cacheKey = "";
      cacheLines = null;
    },
    render(width) {
      const bodyWidth = Math.max(1, width);
      const cfg = getToolsRenderConfig();
      const expanded = Boolean(options.expanded);
      const cacheId = `${bodyWidth}|${expanded ? 1 : 0}|${cfg.maxExpandedLines}|${cfg.dimOutput ? 1 : 0}`;
      if (cacheLines && cacheKey === cacheId) return cacheLines;
      if (!expanded) {
        const needed = cfg.maxCollapsedLines;
        const scanFrom = findBackwardLineStart(text, needed);
        if (text.length === 0) {
          cacheKey = cacheId;
          cacheLines = [];
          return cacheLines;
        }
        const tail = replaceTabs(text.slice(scanFrom)).replace(/\r/g, "");
        const shownLines = tail ? tail.split("\n").map((l) => clampLineLength(l)) : [];
        if (shownLines.length === 0) {
          cacheKey = cacheId;
          cacheLines = [];
          return cacheLines;
        }
        const truncatedShown = shownLines.map((line) => {
          const truncated = safeTruncateToWidth(line, bodyWidth, "\u2026");
          if (color === "error") return formatToolOutputLine(theme, truncated, "error");
          return cfg.dimOutput ? formatToolOutputLine(theme, truncated) : formatToolOutputLine(theme, truncated, "text");
        });
        cacheKey = cacheId;
        cacheLines = truncatedShown;
        return cacheLines;
      }
      const normalized = replaceTabs(text);
      const rawLines = normalized.split("\n");
      const totalLines = rawLines.length;
      const hasOutput = !(totalLines === 1 && rawLines[0] === "");
      if (!hasOutput) {
        cacheKey = cacheId;
        cacheLines = [];
        return cacheLines;
      }
      const applyColor = (l) => color === "error" ? formatToolOutputLine(theme, l, "error") : cfg.dimOutput ? formatToolOutputLine(theme, l) : formatToolOutputLine(theme, l, "text");
      const renderRawLine = (line) => safeTruncateToWidth(clampLineLength(line), bodyWidth, "\u2026");
      if (cfg.maxExpandedLines > 0 && totalLines > cfg.maxExpandedLines) {
        const truncated = rawLines.slice(-cfg.maxExpandedLines).map((line) => applyColor(renderRawLine(line)));
        const remaining = totalLines - cfg.maxExpandedLines;
        truncated.unshift(theme.fg("dim", `\u2026 ${remaining} earlier lines`));
        cacheKey = cacheId;
        cacheLines = truncated;
        return cacheLines;
      }
      cacheKey = cacheId;
      cacheLines = rawLines.map((line) => applyColor(renderRawLine(line)));
      return cacheLines;
    }
  };
}
var BASH_GREP_COMMANDS = /* @__PURE__ */ new Set(["grep", "egrep", "fgrep", "rg"]);
var GREP_VALUE_FLAGS = /* @__PURE__ */ new Set([
  "-e",
  "--regexp",
  "-g",
  "--glob",
  "--type",
  "-t",
  "--include",
  "--exclude",
  "-C",
  "-A",
  "-B",
  "--context",
  "--after-context",
  "--before-context",
  "-m",
  "--max-count",
  "-M",
  "--max-columns",
  "--ignore-file"
]);
var FIND_VALUE_FLAGS = /* @__PURE__ */ new Set([
  "-type",
  "-mtime",
  "-atime",
  "-ctime",
  "-size",
  "-maxdepth",
  "-mindepth",
  "-perm",
  "-group",
  "-user",
  "-newer"
]);
function classifyByArgs(kind, args) {
  const positionals = [];
  let pattern;
  for (let i = 0; i < args.length; i++) {
    const token = args[i] ?? "";
    if (kind === "grep" && (token === "-e" || token === "--regexp") || kind === "find" && (token === "-name" || token === "-iname" || token === "-path" || token === "-ipath")) {
      pattern = args[++i];
      continue;
    }
    if (kind === "grep" && GREP_VALUE_FLAGS.has(token)) {
      i++;
      continue;
    }
    if (kind === "find" && FIND_VALUE_FLAGS.has(token)) {
      i++;
      continue;
    }
    if (token.startsWith("-")) continue;
    positionals.push(token);
  }
  const rawPath = positionals[0] ?? ".";
  const pathLabel3 = rawPath === "." ? "current directory" : shortenPath(rawPath);
  if (kind === "ls") return { kind, pathLabel: pathLabel3 };
  if (kind === "find") return { kind, ...pattern !== void 0 ? { pattern } : {}, pathLabel: pathLabel3 };
  const grepPattern = pattern ?? positionals[0];
  const pathArgs = pattern !== void 0 ? positionals : positionals.slice(1);
  const grepPath = pathArgs.join(" ");
  const grepPathLabel = !grepPath || grepPath === "." ? "current directory" : shortenPath(grepPath);
  return {
    kind,
    ...grepPattern !== void 0 ? { pattern: grepPattern } : {},
    pathLabel: grepPathLabel,
    ...pathArgs.length === 1 ? { singlePath: pathArgs[0] ?? "" } : {}
  };
}
function classifyBashCommand(command) {
  const shape = parseSimpleBashCommand(command, { allowTrailingTruncationPipe: true });
  if (!shape) return null;
  const rest = shape.tokens;
  const base = (rest[0] ?? "").split("/").pop() ?? "";
  let kind = null;
  if (base === "ls") kind = "ls";
  else if (base === "find") kind = "find";
  else if (BASH_GREP_COMMANDS.has(base)) kind = "grep";
  if (!kind) return null;
  const cls = classifyByArgs(kind, rest.slice(1));
  if (shape.cdDir && cls.pathLabel === "current directory") {
    return {
      kind,
      ...cls.pattern !== void 0 ? { pattern: cls.pattern } : {},
      pathLabel: shortenPath(shape.cdDir),
      ...cls.singlePath !== void 0 ? { singlePath: cls.singlePath } : {}
    };
  }
  return cls;
}
function bashTreeHeader(theme, cls, counts) {
  const label = cls.kind === "find" ? "Find" : cls.kind === "ls" ? "List" : "Grep";
  const hasDetail = Boolean(cls.pattern) || Boolean(counts);
  const prefix = hasDetail ? `${label}:` : label;
  const patternPart = cls.pattern ? ` ${theme.fg("text", cls.pattern)}` : "";
  let middle = "";
  if (counts) {
    if (cls.kind === "grep") {
      const matches = counts.matches ?? 0;
      const files = counts.files ?? 0;
      middle = ` ${theme.fg("accent", `${matches} ${pluralForm("match", matches)}`)}${theme.fg("dim", ` \xB7 ${files} ${pluralForm("file", files)}`)}`;
    } else {
      const files = counts.files ?? 0;
      middle = ` ${theme.fg("accent", `${files} ${pluralForm("file", files)}`)}`;
    }
  }
  const pathPart = cls.pathLabel && cls.pathLabel !== "current directory" ? theme.fg("dim", ` \xB7 in ${compactToolPath(cls.pathLabel)}`) : "";
  return `${typeof theme?.bold === "function" ? theme.bold(prefix) : prefix}${patternPart}${middle}${pathPart}`;
}
function isLongFormatLs(text) {
  const first = text.split("\n").map((line) => line.trim()).find((line) => line.length > 0 && !/^total\s+\d+$/i.test(line));
  return Boolean(first) && /^[bcdlsp-][rwxtsST-]{9}[\s@]/.test(first);
}
function parseBashTreeOutput(cls, output) {
  if (cls.kind === "ls") {
    if (isLongFormatLs(output)) return { entries: parseLsLongOutput(output) };
    return { entries: parseLsOutput(output) };
  }
  if (cls.kind === "find") return { entries: parseFindOutput(output) };
  const matches = parseGrepOutput(output);
  if (matches.length === 0 && output.trim().length > 0) {
    if (cls.singlePath) {
      const bare = parseGrepBareOutput(output, cls.singlePath);
      if (bare.length > 0) return { matches: bare };
    }
    return null;
  }
  return { matches };
}
function classifyBashSemantic(command) {
  return classifyBashCommand(command) ?? classifyGitCommand(command) ?? classifyGhCommand(command);
}
function isBashTreeClass(cls) {
  return cls.kind === "ls" || cls.kind === "find" || cls.kind === "grep";
}
function isGhClass(cls) {
  switch (cls.kind) {
    case "pr-list":
    case "pr-view":
    case "pr-checks":
    case "pr-create":
    case "issue-list":
    case "issue-view":
    case "run-list":
    case "run-view":
    case "run-job":
      return true;
    default:
      return false;
  }
}
function isGhRunJobClass(cls) {
  return cls.kind === "run-job";
}
function isGitDiffClass(cls) {
  return !isBashTreeClass(cls) && cls.kind === "diff";
}
function isGitActionClass(cls) {
  return !isBashTreeClass(cls) && cls.kind === "action";
}
var PARTIAL_REPARSE_THRESHOLD = 4096;
function parseSemanticOutput(cls, output) {
  if (isBashTreeClass(cls)) return parseBashTreeOutput(cls, output);
  if (isGhClass(cls)) return parseGhOutput(cls, output);
  return parseGitOutput(cls, output);
}
var semanticStates = /* @__PURE__ */ new Map();
function renderBashTreeLines(theme, state, width) {
  const safeWidth = Math.max(1, width);
  const cls = state.cls;
  if (state.parsed && "entries" in state.parsed) {
    const entries = state.parsed.entries;
    return renderOutputTree(theme, bashTreeHeader(theme, cls, { files: entries.length }), entries, safeWidth, {
      moreUnit: "file",
      indent: TREE_INDENT
    });
  }
  if (state.parsed && "matches" in state.parsed) {
    const matches = state.parsed.matches;
    return renderGrepFilesTree(
      theme,
      bashTreeHeader(theme, cls, { matches: matches.length, files: groupMatchesByFile(matches).length }),
      matches,
      safeWidth,
      { indent: TREE_INDENT }
    );
  }
  return [safeTruncateToWidth(bashTreeHeader(theme, cls), safeWidth, "\u2026")];
}
var EMPTY_BASH_TREE_RESULT = {
  invalidate() {
  },
  render() {
    return [];
  }
};
function renderSemanticPanel(theme, toolCallId, context) {
  const state = semanticStates.get(toolCallId);
  return {
    invalidate() {
    },
    render(width) {
      if (!state) return [];
      const renderFresh = () => {
        if (state.fallback) {
          return renderBoxedBashCall(
            theme,
            state.command.split("\n"),
            context,
            bashWidthKey(state.command, context?.args?.timeout)
          ).render(width);
        }
        if (isBashTreeClass(state.cls)) {
          const treeState = { cls: state.cls };
          if (state.parsed !== void 0) treeState.parsed = state.parsed;
          return renderBashTreeLines(theme, treeState, width);
        }
        if (isGhClass(state.cls)) {
          const ghState = { cls: state.cls };
          if (state.parsed !== void 0) ghState.parsed = state.parsed;
          return renderGhCardLines(theme, ghState, width);
        }
        const gitState = { cls: state.cls };
        if (state.parsed !== void 0) gitState.parsed = state.parsed;
        return renderGitCardLines(theme, gitState, width);
      };
      if (!state.finished) return renderFresh();
      const cacheKey = [themeCacheKey(theme), getToolsRenderCacheSignature(), width, state.revision].join("|");
      if (state.renderCache?.key === cacheKey) return state.renderCache.lines;
      const lines = renderFresh();
      state.renderCache = { key: cacheKey, lines };
      return lines;
    }
  };
}
var bashTool = {
  call(args, theme, context) {
    noteExecutionStart(context);
    const cls = classifyBashSemantic(String(args?.command ?? ""));
    if (cls) {
      const command = String(args?.command ?? "");
      const existing = semanticStates.get(context.toolCallId);
      if (existing) {
        if (existing.command !== command || existing.cls.kind !== cls.kind) {
          delete existing.parsed;
          delete existing.fallback;
          existing.finished = false;
          existing.revision++;
          delete existing.renderCache;
          delete existing.lastParsedLength;
        }
        existing.command = command;
        existing.cls = cls;
      } else {
        semanticStates.set(context.toolCallId, {
          cls,
          command,
          finished: false,
          revision: 0
        });
      }
      return renderSemanticPanel(theme, context.toolCallId, context);
    }
    noteBoxedCallState(context);
    const rawCommand = String(args?.command ?? "...");
    return renderBoxedBashCall(theme, rawCommand.split("\n"), context, bashWidthKey(rawCommand, args?.timeout));
  },
  result(result, options, theme, context) {
    const firstResultPass = !isResultSeen(context.state);
    markResultSeen(context.state);
    const cls = classifyBashSemantic(String(context?.args?.command ?? ""));
    if (cls && (!context.isError || isGitActionClass(cls))) {
      if (!options.isPartial) {
        recordExecutionEnded(context.state);
        stopElapsedTicker(context.state);
      }
      if (!options.isPartial || isBashTreeClass(cls)) {
        const output = stripBashToolNoticeLines(stripAnsi(getTextOutput(result)));
        const state = semanticStates.get(context.toolCallId);
        const shouldParse = !options.isPartial || state === void 0 || state.lastParsedLength === void 0 || output.length - state.lastParsedLength >= PARTIAL_REPARSE_THRESHOLD;
        const parsed = shouldParse ? parseSemanticOutput(cls, output) : void 0;
        if (parsed) {
          if (state) {
            state.parsed = parsed;
            state.finished = !options.isPartial;
            state.revision++;
            delete state.renderCache;
            if (options.isPartial) state.lastParsedLength = output.length;
          } else
            semanticStates.set(context.toolCallId, {
              cls,
              command: String(context?.args?.command ?? ""),
              parsed,
              finished: !options.isPartial,
              revision: 0,
              ...options.isPartial ? { lastParsedLength: output.length } : {}
            });
          if (isGitDiffClass(cls)) {
            return renderGitDiffResult(theme, parsed, options, context);
          }
          if (isGhRunJobClass(cls)) {
            return renderGhRunJobResult(theme, parsed, options, context);
          }
          return EMPTY_BASH_TREE_RESULT;
        }
        if (!shouldParse) {
          if (state?.parsed !== void 0) return EMPTY_BASH_TREE_RESULT;
        }
        if (shouldParse) {
          if (state) {
            state.fallback = true;
            state.finished = !options.isPartial;
            state.revision++;
            delete state.renderCache;
            if (options.isPartial) state.lastParsedLength = output.length;
          }
        }
      }
    } else if (options.isPartial) {
      startElapsedTicker(context.state, context.invalidate);
    } else {
      recordExecutionEnded(context.state);
      stopElapsedTicker(context.state);
    }
    const raw = getTextOutput(result);
    if (options.isPartial) {
      if (firstResultPass) return EMPTY_BASH_RESULT;
      return renderBashStreamingResult(theme, raw, options, context);
    }
    return memoizedStateComponent(
      context.state,
      "__piStyleBashFinalResult",
      getRenderCacheKey(
        "bash-final-result",
        theme,
        Boolean(options.expanded),
        Boolean(context.isError),
        String(context?.args?.command ?? ""),
        raw,
        getStateElapsedMs(context.state) ?? ""
      ),
      () => renderBashFinalResult(theme, raw, options, context)
    );
  }
};

// ../../.pi/agent/npm/node_modules/@quandev104/pi-style/extension-src/pi-style/features/tools/boxed/edit.ts
import { getLanguageFromPath as getLanguageFromPath2 } from "./syntax.mjs";
var MAX_HIGHLIGHT_DIFF_CHARS = 12e3;
var MAX_HIGHLIGHT_DIFF_ROWS = 120;
var EMPTY_EDIT_RESULT = Object.freeze({
  invalidate() {
  },
  render() {
    return [];
  }
});
function editDiffFooter(theme, result, context) {
  const elapsedMs = getElapsedMs(result) ?? stateElapsedMs(context);
  return elapsedMs === void 0 ? "" : theme.fg("text", formatElapsedMs(elapsedMs));
}
var editTool = {
  call(args, theme, context) {
    noteExecutionStart(context);
    noteBoxedCallState(context);
    const path = displayPath(String(args?.path ?? args?.file_path ?? ""), context);
    return renderBoxedToolCall(theme, "Edit", [], {
      // Lazy: the settled result publishes diff stats into the shared renderer
      // state, and this function resolves at render time — so the header picks
      // up `· +N -M` on the same paint the diff body appears (the write footer
      // uses the same state-sharing contract).
      headerDetail: (width) => {
        const stats = diffHeaderStatsSuffix(theme, context);
        return `${compactToolPath(path, width - safeVisibleWidth(stats))}${stats}`;
      },
      isError: Boolean(context.isError),
      isPartial: Boolean(context.isPartial),
      isPending: Boolean(context.isPartial),
      running: Boolean(context.executionStarted),
      resultSeen: isResultSeen(context.state)
    });
  },
  result(result, options, theme, context) {
    if (options.isPartial) {
      const firstResultPass = noteBoxedResultPhase(context, options.isPartial);
      if (firstResultPass) return EMPTY_EDIT_RESULT;
      return renderBoxedToolResult(theme, () => [`${theme.fg("dim", "\u21B3")} ${theme.fg("muted", "Applying edit...")}`], {
        showDivider: false,
        footerLines: [formatBoxedRunningStatus(theme, stateElapsedMs(context))],
        isPartial: true
      });
    }
    if (context.isError) {
      clearDiffHeaderStats(context);
      const output = getTextOutput(result);
      return renderBoxedToolResult(theme, () => [theme.fg("error", stripAnsi(output).trim() || "Error")], {
        footerLines: resultFooterLines(theme, result, context),
        isError: true
      });
    }
    const details = result.details;
    const diff = details?.diff;
    if (!diff) {
      clearDiffHeaderStats(context);
      const output = stripAnsi(getTextOutput(result)).trim();
      const fallback = `\u21B3 ${output || "Edit applied"}`;
      return renderBoxedToolResult(theme, () => [theme.fg("dim", fallback)], {
        footerLines: resultFooterLines(theme, result, context)
      });
    }
    const message = firstText(result.content);
    const argPath = String(context?.args?.path ?? context?.args?.file_path ?? "");
    const sourcePath = details?.path ?? (argPath || extractEditedPath(message));
    const expanded = options.expanded;
    const stats = countDiffStats(diff);
    noteDiffHeaderStats(context, stats);
    const footer = editDiffFooter(theme, result, context);
    return memoizedStateComponent(
      context.state,
      "__piStyleEditDiffResult",
      getRenderCacheKey("edit-diff-result", theme, Boolean(expanded), diff, sourcePath ?? "", footer),
      () => {
        const language = sourcePath ? getLanguageFromPath2(sourcePath) : void 0;
        const rows = buildSplitRows(diff);
        const shouldHighlight = Boolean(language) && diff.length <= MAX_HIGHLIGHT_DIFF_CHARS && rows.length <= MAX_HIGHLIGHT_DIFF_ROWS;
        const maxRows = expanded ? 160 : 36;
        const diffView = new AdaptiveDiffComponent(theme, rows, maxRows, shouldHighlight ? language : void 0);
        const expandHint = !expanded && diffView.hasCollapsed() ? "Ctrl+O more" : void 0;
        return renderBoxedToolResult(
          theme,
          {
            render(width) {
              return diffView.render(width);
            },
            invalidate() {
              diffView.invalidate();
            }
          },
          {
            // Stats live in the box header (`➔ Edit ✓ · path · +N -M`), so no
            // `Diff` divider: the body continues the open call box directly.
            showDivider: false,
            skipLeadingBlank: true,
            ...expandHint ? { expandHint } : {},
            footerLines: footer ? [footer] : []
          }
        );
      }
    );
  }
};

// ../../.pi/agent/npm/node_modules/@quandev104/pi-style/extension-src/pi-style/features/tools/boxed/write.ts
var WRITE_EXPAND_HINT = "Ctrl+O for more";
var EMPTY_WRITE_RESULT = Object.freeze({
  invalidate() {
  },
  render() {
    return [];
  }
});
function numberedPreviewLines(content) {
  const normalized = replaceTabs(String(content ?? "")).replace(/\r/g, "");
  if (!normalized) return [];
  const lines = normalized.split("\n");
  const gutterWidth = Math.max(1, String(lines.length).length);
  return lines.map((line, index) => ({
    number: String(index + 1).padStart(gutterWidth),
    content: line
  }));
}
function formatNumberedLine(theme, line) {
  return `${dimLine(`${line.number} `)}${theme.fg("toolOutput", line.content)}`;
}
function renderWritePreviewBox(theme, path, content, options) {
  const preview = numberedPreviewLines(content);
  const config = getToolsRenderConfig();
  const budget = options.expanded ? config.maxExpandedLines : config.maxCollapsedLines;
  const truncated = preview.length > budget;
  return renderCompactBoxedToolCall(theme, "Write", "", {
    headerDetail: (width) => `${theme.fg("dim", "Path: ")}${compactToolPath(path, width - 6)}`,
    ...options.state ? { state: options.state } : {},
    isError: options.isError,
    isPending: options.isPending,
    running: Boolean(options.running),
    tint: true,
    // the write preview is a framed box — it owns its status tint
    bodyLines: () => {
      if (preview.length === 0) return [];
      const shown = preview.slice(0, budget).map((line) => formatNumberedLine(theme, line));
      if (!truncated) return shown;
      const omitted = preview.length - budget;
      const note = options.expanded ? `\u2026 ${omitted} more lines omitted by render budget` : `\u2026 ${omitted} more lines`;
      return [...shown, theme.fg("muted", note)];
    },
    ...options.expanded || options.isPending || !truncated ? {} : { bottomRightLabel: WRITE_EXPAND_HINT }
  });
}
var writeTool = {
  call(args, theme, context) {
    noteExecutionStart(context);
    const detail = displayPath(String(args?.path ?? args?.file_path ?? ""), context);
    const detailLine = `${theme.fg("dim", "Path: ")}${compactToolPath(detail)}`;
    if (context.isError) {
      return compactCall(theme, "Write", detailLine, {
        detailKey: detail,
        headerDetail: (width) => `${theme.fg("dim", "Path: ")}${compactToolPath(detail, width - 6)}`,
        context
      });
    }
    return renderWritePreviewBox(theme, detail, String(args?.content ?? ""), {
      state: context.state,
      isError: Boolean(context.isError),
      isPending: Boolean(context.isPartial),
      running: Boolean(context.executionStarted),
      expanded: Boolean(context.expanded)
    });
  },
  result(result, options, theme, context) {
    clearFooterState(context);
    const output = getTextOutput(result);
    const detail = displayPath(String(context?.args?.path ?? context?.args?.file_path ?? ""), context);
    const widthKey = boxedToolWidthKey("Write", detail);
    if (context.isError) {
      return renderBoxedToolResult(theme, () => [theme.fg("error", stripAnsi(output).trim() || "Error")], {
        widthKey,
        footerLines: resultFooterLines(theme, result, context),
        isError: true
      });
    }
    if (options.isPartial) return EMPTY_WRITE_RESULT;
    return compactFooterWithState(theme, result, context);
  }
};

// ../../.pi/agent/npm/node_modules/@quandev104/pi-style/extension-src/pi-style/features/tools/boxed/batch.ts
var BATCHABLE_TOOL_NAMES = /* @__PURE__ */ new Set(["read", "ls", "find", "Agent"]);
function isBatchableTool(toolName) {
  return typeof toolName === "string" && BATCHABLE_TOOL_NAMES.has(toolName);
}
var BATCH_TREE_HEAD_LIMIT = 5;
var BATCH_MEMBER_FILE_HEAD_LIMIT = 4;
var BATCH_ERROR_LINES = 2;
var BATCH_TREE_INDENT = TREE_INDENT;
var EMPTY_BATCH_COMPONENT = Object.freeze({
  invalidate() {
  },
  render() {
    return [];
  }
});
var activeBatch;
var batchByCallId = /* @__PURE__ */ new Map();
var chunkCandidateByPath = /* @__PURE__ */ new Map();
function closeActiveBatch() {
  if (!activeBatch) return;
  activeBatch.closed = true;
  activeBatch = void 0;
}
function resetBatchRegistry() {
  activeBatch = void 0;
  batchByCallId.clear();
  chunkCandidateByPath.clear();
}
function resetReadChunkCandidates() {
  closeActiveBatch();
  chunkCandidateByPath.clear();
}
function chunkContinues(prev, next) {
  if (prev.end !== void 0) return next.start === prev.end + 1;
  return next.start > prev.start;
}
function isContiguousChunkBatch(batch) {
  const first = batch.members[0]?.chunk;
  if (!first) return false;
  let prev = first;
  for (let i = 1; i < batch.members.length; i++) {
    const cur = batch.members[i]?.chunk;
    if (!cur || cur.path !== first.path || !chunkContinues(prev, cur)) return false;
    prev = cur;
  }
  return true;
}
function isChunkReadBatch(batch) {
  return getToolsRenderConfig().mergeChunkedReads && batch.meta.toolName === "read" && batch.members.length >= 2 && isContiguousChunkBatch(batch);
}
function syncChunkCandidacy(batch) {
  if (batch.meta.toolName !== "read") return;
  const first = batch.members[0]?.chunk;
  if (first && batch.members.length >= 1 && isContiguousChunkBatch(batch)) {
    chunkCandidateByPath.set(first.path, batch);
    return;
  }
  for (const [path, candidate] of chunkCandidateByPath) if (candidate === batch) chunkCandidateByPath.delete(path);
}
function createBatch(meta, leaderId, detail, opts = {}) {
  const batch = {
    meta,
    leaderId,
    startedAt: performance.now(),
    closed: false,
    revision: 0,
    open: false,
    members: [
      {
        toolCallId: leaderId,
        detail,
        status: "pending",
        isError: false,
        ...opts.pattern ? { pattern: opts.pattern } : {},
        ...opts.pathLabel ? { pathLabel: opts.pathLabel } : {},
        ...opts.chunk ? { chunk: opts.chunk } : {}
      }
    ]
  };
  activeBatch = batch;
  batchByCallId.set(leaderId, batch);
  syncChunkCandidacy(batch);
  return batch;
}
function bumpBatchRevision(batch) {
  batch.revision++;
  delete batch.renderCache;
}
function registerBatchCall(meta, detail, context, opts = {}) {
  const existing = batchByCallId.get(context.toolCallId);
  if (existing) {
    const member2 = existing.members.find((entry) => entry.toolCallId === context.toolCallId);
    if (member2) {
      const changed = member2.detail !== detail || member2.pattern !== opts.pattern || member2.pathLabel !== opts.pathLabel;
      member2.detail = detail;
      if (opts.pattern !== void 0) member2.pattern = opts.pattern;
      if (opts.pathLabel !== void 0) member2.pathLabel = opts.pathLabel;
      if (changed) bumpBatchRevision(existing);
    }
    return { batch: existing, isLeader: existing.leaderId === context.toolCallId };
  }
  if (opts.chunk && getToolsRenderConfig().mergeChunkedReads) {
    const candidate = chunkCandidateByPath.get(opts.chunk.path);
    const lastChunk = candidate?.members.at(-1)?.chunk;
    if (candidate && lastChunk && lastChunk.path === opts.chunk.path && chunkContinues(lastChunk, opts.chunk)) {
      const member2 = {
        toolCallId: context.toolCallId,
        detail,
        status: "pending",
        isError: false,
        chunk: opts.chunk
      };
      candidate.members.push(member2);
      batchByCallId.set(context.toolCallId, candidate);
      delete candidate.completedAt;
      bumpBatchRevision(candidate);
      syncChunkCandidacy(candidate);
      return { batch: candidate, isLeader: candidate.leaderId === context.toolCallId };
    }
  }
  const current = activeBatch;
  if (!current || current.closed || current.meta.toolName !== meta.toolName) {
    closeActiveBatch();
    return { batch: createBatch(meta, context.toolCallId, detail, opts), isLeader: true };
  }
  const member = {
    toolCallId: context.toolCallId,
    detail,
    status: "pending",
    isError: false,
    ...opts.pattern ? { pattern: opts.pattern } : {},
    ...opts.pathLabel ? { pathLabel: opts.pathLabel } : {},
    ...opts.chunk ? { chunk: opts.chunk } : {}
  };
  current.members.push(member);
  batchByCallId.set(context.toolCallId, current);
  bumpBatchRevision(current);
  syncChunkCandidacy(current);
  return { batch: current, isLeader: false };
}
function registerBatchResult(meta, data, context) {
  const batch = batchByCallId.get(context.toolCallId);
  if (!batch || batch.meta.toolName !== meta.toolName) return { batch: void 0, isLeader: false };
  const member = batch.members.find((entry) => entry.toolCallId === context.toolCallId);
  if (member) {
    const nextStatus = data.isPartial ? "running" : "done";
    const nextIsError = !data.isPartial && data.isError;
    const refinedEnd = member.chunk && data.readOutputLines !== void 0 ? member.chunk.start + data.readOutputLines - 1 : void 0;
    const changed = member.status !== nextStatus || member.isError !== nextIsError || member.errorText !== (nextIsError ? data.errorText : void 0) || member.noticeText !== data.noticeText || member.resultText !== data.resultText || member.receiptText !== data.receiptText || data.entries !== void 0 && member.outputEntries !== data.entries || refinedEnd !== void 0 && member.chunk?.end !== refinedEnd;
    member.status = nextStatus;
    member.isError = nextIsError;
    if (member.isError && data.errorText !== void 0) member.errorText = data.errorText;
    else delete member.errorText;
    if (data.noticeText !== void 0) member.noticeText = data.noticeText;
    else delete member.noticeText;
    if (data.resultText !== void 0) member.resultText = data.resultText;
    else delete member.resultText;
    if (data.receiptText !== void 0) member.receiptText = data.receiptText;
    else delete member.receiptText;
    if (data.entries !== void 0) member.outputEntries = data.entries;
    if (refinedEnd !== void 0 && member.chunk) member.chunk = { ...member.chunk, end: refinedEnd };
    if (changed) bumpBatchRevision(batch);
  }
  if (batch.completedAt === void 0 && batch.members.every((entry) => entry.status === "done")) {
    batch.completedAt = performance.now();
    bumpBatchRevision(batch);
  }
  return { batch, isLeader: batch.leaderId === context.toolCallId };
}
function hasFinalBatchOutput(toolCallId) {
  const batch = batchByCallId.get(toolCallId);
  if (!batch) return false;
  const member = batch.members.find((entry) => entry.toolCallId === toolCallId);
  return member !== void 0 && member.outputEntries !== void 0 && member.status === "done" && !member.isError;
}
function batchStatus(batch) {
  let done = 0;
  let failed = 0;
  for (const member of batch.members) {
    if (member.status !== "done") continue;
    done++;
    if (member.isError) failed++;
  }
  const total = batch.members.length;
  const allDone = done === total;
  return {
    total,
    done,
    failed,
    allDone,
    elapsedMs: allDone && batch.completedAt !== void 0 ? batch.completedAt - batch.startedAt : void 0
  };
}
function formatElapsed(theme, elapsedMs) {
  return theme.fg("dim", ` \xB7 ${(elapsedMs / 1e3).toFixed(2)}s`);
}
function bold(theme, text) {
  return typeof theme?.bold === "function" ? theme.bold(text) : text;
}
function isOutputTool(meta) {
  return meta.toolName === "ls" || meta.toolName === "find";
}
function formatBatchHeader(theme, batch, status) {
  const label = `${batch.meta.headerLabel ?? batch.meta.label} (${status.total})`;
  if (status.failed > 0) return theme.fg("error", bold(theme, `\u2717 ${label} \xB7 ${status.failed} failed`));
  if (status.allDone) {
    const glyph = getToolsRenderConfig().batchOpenGlyph;
    const elapsed = status.elapsedMs === void 0 ? "" : formatElapsed(theme, status.elapsedMs);
    return `${theme.fg("text", bold(theme, `${glyph} ${label}`))}${elapsed}`;
  }
  if (status.done > 0)
    return `${theme.fg("text", bold(theme, `\u25CC ${label}`))}${theme.fg("dim", ` \xB7 ${status.done}/${status.total}`)}`;
  return bold(theme, formatToolTitlePrefix(theme, label));
}
function memberGlyph(theme, member, show) {
  if (!show) return "";
  if (member.isError) return theme.fg("error", "\u2717");
  if (member.status === "done") return theme.fg("success", "\u2713");
  return theme.fg("text", "\u25CC");
}
function renderErrorLines(theme, errorText, width) {
  const raw = stripAnsi(errorText).split("\n").map((line) => line.trim()).filter((line) => line.length > 0);
  if (raw.length === 0) return [];
  const prefix = `${dimLine("  \u2502  ")}`;
  const out = raw.slice(0, BATCH_ERROR_LINES).map((line) => safeTruncateToWidth(`${prefix}${theme.fg("error", line)}`, Math.max(1, width), "\u2026"));
  if (raw.length > BATCH_ERROR_LINES)
    out.push(safeTruncateToWidth(`${prefix}${theme.fg("error", "\u2026")}`, Math.max(1, width), "\u2026"));
  return out;
}
function renderPathRow(theme, prefix, path, color, width, suffix = "") {
  const detail = compactToolPath(path, width - safeVisibleWidth(prefix) - safeVisibleWidth(suffix));
  return safeTruncateToWidth(`${prefix}${theme.fg(color, detail)}${suffix}`, Math.max(1, width), "\u2026");
}
function renderBatchTree(theme, batch, status, width) {
  const showGlyphs = !status.allDone || status.failed > 0;
  const limit = batch.open ? batch.members.length : BATCH_TREE_HEAD_LIMIT;
  const visible = batch.members.slice(0, limit);
  const more = batch.members.length - visible.length;
  const lastIndex = visible.length - 1;
  const out = [];
  for (let i = 0; i < visible.length; i++) {
    const member = visible[i];
    if (!member) continue;
    const branch = i < lastIndex || more > 0 ? "\u251C\u2500" : "\u2514\u2500";
    const glyph = memberGlyph(theme, member, showGlyphs);
    const pathColor = member.isError ? "error" : member.status === "done" ? "accent" : "text";
    const prefix = `${BATCH_TREE_INDENT}${dimLine(branch)}${glyph ? ` ${glyph}` : ""} `;
    out.push(
      batch.meta.toolName === "find" ? safeTruncateToWidth(`${prefix}${theme.fg(pathColor, member.detail)}`, Math.max(1, width), "\u2026") : renderPathRow(theme, prefix, member.detail, pathColor, width)
    );
    if (member.isError && member.errorText) out.push(...renderErrorLines(theme, member.errorText, width));
  }
  if (more > 0) {
    out.push(
      safeTruncateToWidth(
        `${BATCH_TREE_INDENT}${dimLine("\u2514\u2500")} ${theme.fg("dim", `${more} more`)}`,
        Math.max(1, width),
        "\u2026"
      )
    );
  }
  return out;
}
function formatLoneOutputHeader(theme, meta, member) {
  const label = meta.headerLabel ?? meta.label;
  const count = member.outputEntries?.length ?? 0;
  const filesPart = theme.fg("accent", `${count} ${count === 1 ? "file" : "files"}`);
  const patternPart = meta.toolName === "find" && member.pattern ? `${theme.fg("text", member.pattern)} ` : "";
  const pathPart = member.pathLabel ? theme.fg("dim", ` \xB7 in ${compactToolPath(member.pathLabel)}`) : "";
  return `${bold(theme, `${label}:`)} ${patternPart}${filesPart}${pathPart}`;
}
function renderMemberSubtree(theme, member, isLastMember, width, open) {
  const safeWidth = Math.max(1, width);
  const trunk = isLastMember ? " " : dimLine("\u2502");
  const out = [];
  const entries = member.outputEntries ?? [];
  if (member.isError) {
    const prefix2 = `${BATCH_TREE_INDENT}${dimLine(isLastMember ? "\u2514\u2500" : "\u251C\u2500")} ${theme.fg("error", "\u2717")} `;
    out.push(renderPathRow(theme, prefix2, member.pathLabel ?? member.detail, "error", safeWidth));
    if (member.errorText) out.push(...renderErrorLines(theme, member.errorText, width));
    return out;
  }
  if (member.status !== "done" || member.outputEntries === void 0) {
    const glyph = member.status === "done" ? theme.fg("success", "\u2713") : theme.fg("text", "\u25CC");
    const prefix2 = `${BATCH_TREE_INDENT}${dimLine(isLastMember ? "\u2514\u2500" : "\u251C\u2500")} ${glyph} `;
    out.push(renderPathRow(theme, prefix2, member.pathLabel ?? member.detail, "text", safeWidth));
    return out;
  }
  const countLabel = theme.fg("dim", ` \xB7 ${entries.length} ${pluralForm("file", entries.length)}`);
  const prefix = `${BATCH_TREE_INDENT}${dimLine(isLastMember ? "\u2514\u2500" : "\u251C\u2500")} `;
  out.push(renderPathRow(theme, prefix, member.pathLabel ?? member.detail, "accent", safeWidth, countLabel));
  const visible = entries.slice(0, open ? entries.length : BATCH_MEMBER_FILE_HEAD_LIMIT);
  const more = entries.length - visible.length;
  const lastIndex = visible.length - 1;
  for (let i = 0; i < visible.length; i++) {
    const entry = visible[i] ?? "";
    const branch = i < lastIndex || more > 0 ? "\u251C\u2500" : "\u2514\u2500";
    const prefix2 = `${BATCH_TREE_INDENT}${trunk}${TREE_CHILD_INDENT}${dimLine(branch)} `;
    out.push(renderPathRow(theme, prefix2, entry, "toolOutput", safeWidth));
  }
  if (more > 0) {
    const line = `${BATCH_TREE_INDENT}${trunk}${TREE_CHILD_INDENT}${dimLine("\u2514\u2500")} ${theme.fg("dim", `\u2026 ${more} more ${pluralForm("file", more)}`)}`;
    out.push(safeTruncateToWidth(line, safeWidth, "\u2026"));
  }
  return out;
}
function renderOutputBatchPanel(theme, batch, status, width) {
  const safeWidth = Math.max(1, width);
  if (batch.members.length === 1) {
    const member = batch.members[0];
    if (member && member.outputEntries !== void 0 && !member.isError) {
      const header2 = safeTruncateToWidth(formatLoneOutputHeader(theme, batch.meta, member), safeWidth, "\u2026");
      return renderOutputTree(theme, header2, member.outputEntries, safeWidth, {
        headLimit: batch.open ? member.outputEntries.length : OUTPUT_TREE_HEAD_LIMIT,
        moreUnit: "file",
        entryColor: "toolOutput",
        indent: BATCH_TREE_INDENT
      });
    }
  }
  const header = safeTruncateToWidth(formatBatchHeader(theme, batch, status), safeWidth, "\u2026");
  const out = [header];
  const limit = batch.open ? batch.members.length : BATCH_TREE_HEAD_LIMIT;
  const visible = batch.members.slice(0, limit);
  const more = batch.members.length - visible.length;
  visible.forEach((member, index) => {
    const isLast = index === visible.length - 1 && more <= 0;
    out.push(...renderMemberSubtree(theme, member, isLast, safeWidth, batch.open));
  });
  if (more > 0) {
    out.push(
      safeTruncateToWidth(`${BATCH_TREE_INDENT}${dimLine("\u2514\u2500")} ${theme.fg("dim", `${more} more`)}`, safeWidth, "\u2026")
    );
  }
  return out;
}
function isLoneRead(batch) {
  return batch.meta.toolName === "read" && batch.members.length === 1;
}
function mergedChunkDetail(batch) {
  const first = batch.members[0]?.chunk;
  if (!first) return "";
  let end;
  for (const member of batch.members) {
    const memberEnd = member.chunk?.end;
    if (memberEnd !== void 0 && (end === void 0 || memberEnd > end)) end = memberEnd;
  }
  return `${first.path}:${first.start}${end !== void 0 ? `-${end}` : ""}`;
}
function renderMergedChunkPanel(theme, batch, status, width) {
  const prefix = bold(theme, formatToolTitlePrefix(theme, batch.meta.label));
  const glyph = status.failed > 0 ? theme.fg("error", "\u2717") : status.allDone ? "" : theme.fg("text", "\u25CC");
  const detailColor = status.failed > 0 ? "error" : status.allDone ? "accent" : "text";
  const suffix = !status.allDone ? theme.fg("dim", ` \xB7 ${status.done}/${status.total}`) : `${theme.fg("dim", ` \xB7 ${status.total} ${pluralForm("chunk", status.total)}`)}${status.failed > 0 ? theme.fg("error", ` \xB7 ${status.failed} ${pluralForm("failure", status.failed)}`) : status.elapsedMs === void 0 ? "" : formatElapsed(theme, status.elapsedMs)}`;
  const line = renderPathRow(
    theme,
    `${prefix}${glyph ? ` ${glyph}` : ""} `,
    mergedChunkDetail(batch),
    detailColor,
    width,
    suffix
  );
  const out = [line];
  const failedMember = batch.members.find((member) => member.isError);
  if (failedMember?.errorText) out.push(...renderErrorLines(theme, failedMember.errorText, width));
  return out;
}
function renderLoneReadPanel(theme, batch, status, width) {
  const member = batch.members[0];
  if (!member) return [];
  const prefix = bold(theme, formatToolTitlePrefix(theme, batch.meta.label));
  const glyph = memberGlyph(theme, member, !status.allDone || status.failed > 0);
  const pathColor = member.isError ? "error" : member.status === "done" ? "accent" : "text";
  const out = [renderPathRow(theme, `${prefix}${glyph ? ` ${glyph}` : ""} `, member.detail, pathColor, width)];
  if (member.isError && member.errorText) out.push(...renderErrorLines(theme, member.errorText, width));
  return out;
}
function renderBatchPanelLines(theme, batch, status, width) {
  if (isLoneRead(batch)) return renderLoneReadPanel(theme, batch, status, width);
  if (isChunkReadBatch(batch)) return renderMergedChunkPanel(theme, batch, status, width);
  if (isOutputTool(batch.meta) && batch.members.some((member) => member.outputEntries !== void 0)) {
    return renderOutputBatchPanel(theme, batch, status, width);
  }
  const header = safeTruncateToWidth(formatBatchHeader(theme, batch, status), Math.max(1, width), "\u2026");
  const lines = [header];
  lines.push(...renderBatchTree(theme, batch, status, width));
  return lines;
}
function renderBatchAwareCall(theme, batch) {
  return {
    invalidate() {
      delete batch.renderCache;
    },
    render(width) {
      const status = batchStatus(batch);
      if (!status.allDone) return renderBatchPanelLines(theme, batch, status, width);
      const cacheKey = [themeCacheKey(theme), getToolsRenderCacheSignature(), width, batch.revision].join("|");
      if (batch.renderCache?.key === cacheKey) return batch.renderCache.lines;
      const lines = renderBatchPanelLines(theme, batch, status, width);
      batch.renderCache = { key: cacheKey, lines };
      return lines;
    },
    handleMouse(event) {
      if (event.type !== "click" || event.button !== "left") return void 0;
      if (event.y === 0) {
        batch.open = !batch.open;
        delete batch.renderCache;
        return { handled: true };
      }
      return { handled: true };
    }
  };
}
function renderStandaloneMemberCall(theme, label, detail) {
  return {
    invalidate() {
    },
    render(width) {
      const prefix = bold(theme, formatToolTitlePrefix(theme, label));
      return [
        label === "Read" || label === "List" ? renderPathRow(theme, `${prefix} `, detail, "text", width) : safeTruncateToWidth(`${prefix} ${theme.fg("text", detail)}`, Math.max(1, width), "\u2026")
      ];
    }
  };
}
function emptyBatchResult() {
  return {
    invalidate() {
    },
    render() {
      return [];
    }
  };
}

// ../../.pi/agent/npm/node_modules/@quandev104/pi-style/extension-src/pi-style/features/tools/boxed/fallback.ts
var MAX_FALLBACK_PREVIEW_LINES = 10;
function renderFallbackCall(toolName, args, theme, context) {
  noteExecutionStart(context);
  noteBoxedCallState(context);
  return renderBoxedToolCall(theme, formatToolName(String(toolName ?? "Tool")), formatToolParamLines(args, theme), {
    isError: Boolean(context.isError),
    isPartial: Boolean(context.isPartial),
    isPending: Boolean(context.isPartial),
    running: Boolean(context.executionStarted),
    resultSeen: isResultSeen(context.state)
  });
}
function renderFallbackResult(_toolName, result, options, theme, context) {
  const firstResultPass = noteBoxedResultPhase(context, options.isPartial);
  const isError = Boolean(context.isError);
  const expanded = Boolean(options.expanded);
  const maxLines = expanded ? getToolsRenderConfig().maxExpandedLines : MAX_FALLBACK_PREVIEW_LINES;
  const output = getTextOutput(result);
  const elapsedMs = getStateElapsedMs(context.state);
  const { lines, omitted } = selectRenderLines(output, maxLines);
  if (options.isPartial) {
    if (firstResultPass) return EMPTY_FALLBACK_RESULT;
    const hasOutput = output.trim().length > 0;
    return renderBoxedToolResult(
      theme,
      () => {
        const body = lines.map((line) => formatToolOutputLine(theme, line, "toolOutput"));
        if (!hasOutput) body.push(theme.fg("dim", "No output received yet"));
        return body;
      },
      {
        dividerLabel: "Output",
        showDivider: hasOutput,
        footerLines: [formatBoxedRunningStatus(theme, elapsedMs)],
        isPartial: true
      }
    );
  }
  return renderBoxedToolResult(
    theme,
    () => {
      const body = lines.map((line) => formatToolOutputLine(theme, line, isError ? "error" : "toolOutput"));
      if (expanded && omitted > 0) {
        body.push(theme.fg("muted", `\u2026 ${omitted} more lines omitted by render budget`));
      }
      return body;
    },
    {
      footerLines: [formatBoxedFooterWithElapsed(theme, elapsedMs, output)],
      renderLineBudget: maxLines,
      ...expanded || omitted <= 0 ? {} : { expandHint: "Ctrl+O for more" },
      isError,
      isPartial: Boolean(options.isPartial)
    }
  );
}
var EMPTY_FALLBACK_RESULT = Object.freeze({
  invalidate() {
  },
  render() {
    return [];
  }
});
function formatBoxedFooterWithElapsed(theme, elapsedMs, output) {
  const elapsed = elapsedMs === void 0 ? "--" : `${(elapsedMs / 1e3).toFixed(2)}s`;
  const words = output.trim() ? formatBoxedWords(output) : "";
  const parts = [theme.fg("text", elapsed)];
  if (words) parts.push(theme.fg("dim", words));
  return parts.join(theme.fg("dim", " \xB7 "));
}

// ../../.pi/agent/npm/node_modules/@quandev104/pi-style/extension-src/pi-style/features/tools/boxed/read.ts
var READ_META = Object.freeze({
  toolName: "read",
  label: "Read"
});
function toLineNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 1 ? Math.floor(value) : void 0;
}
function readChunkInfo(rawPath, offset, limit, context) {
  if (!rawPath) return void 0;
  const start = toLineNumber(offset) ?? 1;
  const lineLimit = toLineNumber(limit);
  return {
    path: displayPath(rawPath, context),
    start,
    ...lineLimit !== void 0 ? { end: start + lineLimit - 1 } : {}
  };
}
var READ_CONTINUATION_NOTICE = /\n\n\[[^\]\n]*continue\.\]\s*$/;
function countReadOutputLines(result) {
  const details = result.details;
  if (details?.truncation !== void 0) return truncationOutputLines(result);
  const text = getTextOutput(result);
  if (!text || READ_CONTINUATION_NOTICE.test(text)) return void 0;
  return text.split("\n").length;
}
var readTool = {
  call(args, theme, context) {
    noteExecutionStart(context);
    const rawPath = String(args?.path ?? args?.file_path ?? "");
    const detail = pathRangeDetail(rawPath, args?.offset, args?.limit, context);
    const chunk = readChunkInfo(rawPath, args?.offset, args?.limit, context);
    const { isLeader, batch } = registerBatchCall(READ_META, detail, context, chunk ? { chunk } : {});
    if (context.expanded) return renderStandaloneMemberCall(theme, READ_META.label, detail);
    if (!isLeader) return EMPTY_BATCH_COMPONENT;
    return renderBatchAwareCall(theme, batch);
  },
  result(result, options, theme, context) {
    const errorText = context.isError ? stripAnsi(getTextOutput(result)).trimEnd() || void 0 : void 0;
    const readOutputLines = !options.isPartial && !context.isError ? countReadOutputLines(result) : void 0;
    registerBatchResult(
      READ_META,
      {
        isPartial: Boolean(options.isPartial),
        isError: Boolean(context.isError),
        errorText,
        ...readOutputLines !== void 0 ? { readOutputLines } : {}
      },
      context
    );
    if (options.expanded && !options.isPartial)
      return renderFallbackResult(READ_META.label, result, options, theme, context);
    return emptyBatchResult();
  }
};

// ../../.pi/agent/npm/node_modules/@quandev104/pi-style/extension-src/pi-style/features/tools/boxed/grep.ts
var GREP_FILE_HEAD_LIMIT = 6;
var GREP_ERROR_LINES = 2;
var grepPanels = /* @__PURE__ */ new Map();
function resetGrepRegistry() {
  grepPanels.clear();
}
function pathLabel(rawPath) {
  const displayPath3 = String(rawPath ?? ".");
  return displayPath3 === "." || displayPath3 === "" ? "current directory" : compactToolPath(shortenPath(displayPath3));
}
function registerGrepCall(toolCallId, pattern, label) {
  const existing = grepPanels.get(toolCallId);
  if (existing) {
    existing.pattern = pattern;
    existing.pathLabel = label;
    return;
  }
  grepPanels.set(toolCallId, {
    pattern,
    pathLabel: label,
    matches: void 0,
    isError: false,
    errorText: void 0,
    isPartial: true,
    open: false
  });
}
function registerGrepResult(toolCallId, data) {
  const state = grepPanels.get(toolCallId);
  if (!state) return;
  state.matches = data.matches;
  state.isError = data.isError;
  state.errorText = data.errorText;
  state.isPartial = data.isPartial;
}
function bold2(theme, text) {
  return typeof theme?.bold === "function" ? theme.bold(text) : text;
}
function formatGrepHeader(theme, state) {
  const label = bold2(theme, "Grep:");
  const patternPart = state.pattern ? ` ${theme.fg("text", state.pattern)}` : "";
  const pathPart = state.pathLabel ? theme.fg("dim", ` \xB7 in ${state.pathLabel}`) : "";
  if (state.isError) {
    return `${theme.fg("error", bold2(theme, "\u2717 Grep:"))}${state.pattern ? ` ${theme.fg("error", state.pattern)}` : ""}${pathPart}`;
  }
  if (state.matches === void 0) {
    return `${label}${patternPart}${pathPart}`;
  }
  const matchCount = state.matches.length;
  const fileCount = groupMatchesByFile(state.matches).length;
  const matchesPart = theme.fg("accent", `${matchCount} ${pluralForm("match", matchCount)}`);
  const filesPart = theme.fg("dim", ` \xB7 ${fileCount} ${pluralForm("file", fileCount)}`);
  return `${label}${patternPart} ${matchesPart}${filesPart}${pathPart}`;
}
function renderErrorLines2(theme, errorText, width) {
  const raw = stripAnsi(errorText).split("\n").map((line) => line.trim()).filter((line) => line.length > 0);
  if (raw.length === 0) return [];
  const prefix = `${TREE_INDENT}${dimLine("\u2514\u2500")} `;
  const out = raw.slice(0, GREP_ERROR_LINES).map((line) => safeTruncateToWidth(`${prefix}${theme.fg("error", line)}`, Math.max(1, width), "\u2026"));
  if (raw.length > GREP_ERROR_LINES)
    out.push(safeTruncateToWidth(`${prefix}${theme.fg("error", "\u2026")}`, Math.max(1, width), "\u2026"));
  return out;
}
function renderGrepPanelLines(theme, state, width, expanded) {
  const safeWidth = Math.max(1, width);
  const header = safeTruncateToWidth(formatGrepHeader(theme, state), safeWidth, "\u2026");
  if (state.isError) {
    return [header, ...state.errorText ? renderErrorLines2(theme, state.errorText, width) : []];
  }
  if (state.matches === void 0) return [header];
  return renderGrepFilesTree(theme, header, state.matches, safeWidth, {
    headLimit: state.open || expanded ? Number.POSITIVE_INFINITY : GREP_FILE_HEAD_LIMIT
  });
}
function renderGrepPanel(theme, toolCallId, expanded) {
  const state = grepPanels.get(toolCallId);
  return {
    invalidate() {
    },
    render(width) {
      if (!state) return [safeTruncateToWidth(bold2(theme, "Grep:"), Math.max(1, width), "\u2026")];
      return renderGrepPanelLines(theme, state, width, expanded);
    },
    handleMouse(event) {
      if (event.type !== "click" || event.button !== "left" || event.y !== 0) return void 0;
      if (!state || state.matches === void 0 || state.isError) return void 0;
      state.open = !state.open;
      return { handled: true };
    }
  };
}
var EMPTY_GREP_RESULT = {
  invalidate() {
  },
  render() {
    return [];
  }
};
var grepTool = {
  call(args, theme, context) {
    noteExecutionStart(context);
    const pattern = String(args?.pattern ?? "");
    registerGrepCall(context.toolCallId, pattern, pathLabel(String(args?.path ?? ".")));
    return renderGrepPanel(theme, context.toolCallId, Boolean(context.expanded));
  },
  result(result, options, _theme, context) {
    const isError = Boolean(context.isError);
    const isPartial = Boolean(options.isPartial);
    const state = grepPanels.get(context.toolCallId);
    if (!isPartial && !isError && state !== void 0 && state.matches !== void 0 && !state.isPartial) {
      return EMPTY_GREP_RESULT;
    }
    const output = stripAnsi(getTextOutput(result)).trimEnd();
    const matches = isError ? [] : parseGrepOutput(output);
    registerGrepResult(context.toolCallId, {
      matches,
      isError,
      errorText: isError ? output || void 0 : void 0,
      isPartial
    });
    return EMPTY_GREP_RESULT;
  }
};

// ../../.pi/agent/npm/node_modules/@quandev104/pi-style/extension-src/pi-style/features/tools/boxed/find.ts
var FIND_META = Object.freeze({
  toolName: "find",
  label: "Find",
  headerLabel: "Find"
});
function pathLabel2(rawPath) {
  const displayPath3 = String(rawPath ?? ".");
  return displayPath3 === "." || displayPath3 === "" ? "current directory" : compactToolPath(shortenPath(displayPath3));
}
function queryDetail(pattern, rawPath) {
  const path = pathLabel2(rawPath);
  return pattern ? `${pattern} in ${path}` : path;
}
var findTool = {
  call(args, theme, context) {
    noteExecutionStart(context);
    const pattern = String(args?.pattern ?? "");
    const rawPath = String(args?.path ?? ".");
    const detail = queryDetail(pattern, rawPath);
    const { isLeader, batch } = registerBatchCall(FIND_META, detail, context, {
      pattern,
      pathLabel: pathLabel2(rawPath)
    });
    if (context.expanded) return renderStandaloneMemberCall(theme, FIND_META.label, detail);
    if (!isLeader) return EMPTY_BATCH_COMPONENT;
    return renderBatchAwareCall(theme, batch);
  },
  result(result, options, theme, context) {
    const isError = Boolean(context.isError);
    const settled = !options.isPartial && !isError && hasFinalBatchOutput(context.toolCallId);
    const output = settled ? "" : stripAnsi(getTextOutput(result)).trimEnd();
    const entries = settled || isError ? void 0 : parseFindOutput(output);
    registerBatchResult(
      FIND_META,
      {
        isPartial: Boolean(options.isPartial),
        isError,
        errorText: isError ? output || void 0 : void 0,
        ...entries !== void 0 ? { entries } : {}
      },
      context
    );
    if (options.expanded && !options.isPartial)
      return renderFallbackResult(FIND_META.label, result, options, theme, context);
    return emptyBatchResult();
  }
};

// ../../.pi/agent/npm/node_modules/@quandev104/pi-style/extension-src/pi-style/features/tools/boxed/ls.ts
var LIST_META = Object.freeze({
  toolName: "ls",
  label: "List",
  headerLabel: "List"
});
function displayPath2(rawPath) {
  const path = String(rawPath ?? ".");
  if (path === "." || path === "") return "current directory";
  return compactToolPath(shortenPath(path));
}
var lsTool = {
  call(args, theme, context) {
    noteExecutionStart(context);
    const rawPath = String(args?.path ?? ".");
    const detail = displayPath2(rawPath);
    const { isLeader, batch } = registerBatchCall(LIST_META, detail, context, { pathLabel: detail });
    if (context.expanded) return renderStandaloneMemberCall(theme, LIST_META.label, detail);
    if (!isLeader) return EMPTY_BATCH_COMPONENT;
    return renderBatchAwareCall(theme, batch);
  },
  result(result, options, theme, context) {
    const isError = Boolean(context.isError);
    const settled = !options.isPartial && !isError && hasFinalBatchOutput(context.toolCallId);
    const output = settled ? "" : stripAnsi(getTextOutput(result)).trimEnd();
    const entries = settled || isError ? void 0 : parseLsOutput(output);
    registerBatchResult(
      LIST_META,
      {
        isPartial: Boolean(options.isPartial),
        isError,
        errorText: isError ? output || void 0 : void 0,
        ...entries !== void 0 ? { entries } : {}
      },
      context
    );
    if (options.expanded && !options.isPartial)
      return renderFallbackResult(LIST_META.label, result, options, theme, context);
    return emptyBatchResult();
  }
};
export {
  bashTool,
  closeActiveBatch,
  editTool,
  findTool,
  grepTool,
  isBatchableTool,
  lsTool,
  readTool,
  renderFallbackCall,
  renderFallbackResult,
  resetBatchRegistry,
  resetGrepRegistry,
  resetReadChunkCandidates,
  setToolsRenderConfig,
  stopAllElapsedTickers,
  writeTool
};
