// Native Durable presentation adapter. Never registers or executes a tool.
import { stripVTControlCharacters } from 'node:util';
import { truncateToWidth } from '@earendil-works/pi-tui';
import {
  bashTool, editTool, writeTool, readTool, grepTool, findTool, lsTool,
  renderFallbackCall, renderFallbackResult, closeActiveBatch, isBatchableTool,
  resetBatchRegistry, resetGrepRegistry, resetReadChunkCandidates,
  setToolsRenderConfig, stopAllElapsedTickers,
} from './vendor.mjs';

setToolsRenderConfig({ collapseAfterTurn: false, mergedTurnSummary: false });
const tools = { bash: bashTool, edit: editTool, write: writeTool, read: readTool, grep: grepTool, find: findTool, ls: lsTool };
const SAFE_PARAMS = new Set(['path', 'file_path', 'pattern', 'query', 'location', 'libraryName', 'action', 'name', 'repo', 'pr']);
const definitions = new Map();
let nextCard = 0;
const CARD_ID = Symbol('native-tool-card');

// Terminal text is data, never control sequences. Keep multiline commands/output.
function clean(text) {
  return stripVTControlCharacters(text).replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '');
}
function displayValue(value) {
  if (typeof value === 'string') return clean(value);
  if (Array.isArray(value)) return value.map(displayValue);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [clean(key), displayValue(item)]));
  return value;
}
// pi-style's boxes have a 12-column minimum. Native ScrollView may allocate
// less during resize: clip at this presentation boundary, never overflow it.
function fit(component, theme, context) {
  let sourceRows = [];
  let sourceHeight = 0;
  return {
    render(width) {
      sourceRows = [];
      if (width <= 0) return [];
      const token = context.isPartial ? 'toolPendingBg' : context.isError ? 'toolErrorBg' : 'toolSuccessBg';
      const background = theme.getBgAnsi(token);
      const blank = () => theme.bg(token, ' '.repeat(width));
      const lines = component.render(Math.max(12, width));
      sourceHeight = lines.length;
      const output = [];
      const previous = this.clippingCache?.width === width ? this.clippingCache.rows : new Map();
      const next = new Map();
      for (const [row, line] of lines.entries()) {
        const plain = stripVTControlCharacters(line);
        if (plain.startsWith('╭')) { output.push(blank()); sourceRows.push(undefined); }
        // Clipping is pure; retain only this frame's rows, never component state.
        const clipped = previous.get(line) ?? truncateToWidth(line, width, '');
        next.set(line, clipped);
        // Native truncation emits SGR 0 before an ellipsis; inner diff/style
        // segments can emit SGR 49. Restore the enclosing surface after both,
        // without stripping explicit added/removed-line backgrounds.
        output.push(/^[╭│├╰]/u.test(plain)
          ? theme.bg(token, clipped.replace(/\x1b\[(?:0|49)?m/g, reset => reset + background))
          : clipped);
        sourceRows.push(row);
        if (plain.startsWith('╰')) { output.push(blank()); sourceRows.push(undefined); }
      }
      this.clippingCache = { width, rows: next };
      return output;
    },
    invalidate() { this.clippingCache = undefined; component.invalidate(); },
    handleMouse(event) {
      const row = sourceRows[event.y];
      return row === undefined ? undefined : component.handleMouse?.({ ...event, y: row, height: sourceHeight });
    },
  };
}
function cardContext(context) {
  // Providers may reuse call IDs in later turns. This ID belongs only to the
  // renderer state; the real execution/transcript ID is never changed.
  context.state[CARD_ID] ??= `native-card-${++nextCard}`;
  return { ...context, toolCallId: context.state[CARD_ID], args: displayValue(context.args) };
}

/** Select a self-framed renderer, including unknown/MCP tools. */
export function toolCardRenderer(name) {
  if (definitions.has(name)) return definitions.get(name);
  const tool = Object.hasOwn(tools, name) ? tools[name] : undefined;
  const title = clean(name).replace(/\n|\t/g, ' ').slice(0, 120);
  const definition = {
    renderShell: 'self',
    renderCall(args, theme, context) {
      const view = cardContext(context);
      if (!isBatchableTool(name)) closeActiveBatch();
      if (tool) return fit(tool.call(displayValue(args), theme, view), theme, view);
      // Do not dump arbitrary MCP arguments (headers, credentials, payloads).
      const safe = Object.fromEntries(Object.entries(args ?? {}).filter(([key, value]) => SAFE_PARAMS.has(key) && ['string', 'number', 'boolean'].includes(typeof value)));
      return fit(renderFallbackCall(title, displayValue(safe), theme, view), theme, view);
    },
    renderResult(result, options, theme, context) {
      const view = cardContext(context);
      const shown = { ...result, content: result.content?.map(block => block.type === 'text' ? { ...block, text: clean(block.text ?? '') } : block),
        details: displayValue(result.details) };
      return fit(tool ? tool.result(shown, options, theme, view) : renderFallbackResult(title, shown, options, theme, view), theme, view);
    },
  };
  definitions.set(name, definition);
  return definition;
}

/** A new user request cannot join an older request's compact read group. */
export function toolCardBoundary() {
  resetReadChunkCandidates();
}

/** Called after native cards are finalized on rebuild, switch and shutdown. */
export function resetToolCards() {
  stopAllElapsedTickers();
  resetBatchRegistry();
  resetGrepRegistry();
}
