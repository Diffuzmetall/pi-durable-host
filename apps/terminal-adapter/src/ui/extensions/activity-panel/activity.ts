import { stripVTControlCharacters } from 'node:util';
import { ROOT_CONVERSATION_ID, type CommitChange, type ConversationId, type EntryRecord, type InboxState, type LiveState, type TaskGraph, type TaskGraphNode } from '../../native-types.ts';

/** Small, read-only projection. No scheduler, polling, tool output or transcript copies. */
export interface ActivitySummary {
  readonly id: ConversationId;
  readonly label: string;
  readonly title?: string;
  readonly role?: string;
  readonly live?: LiveState;
  readonly inbox?: InboxState;
  readonly lastStop?: string;
  readonly runTaskId?: number;
  readonly runOutcome?: string;
  readonly callHints?: Readonly<Record<string, string>>;
  readonly ownerTaskId?: number;
  readonly reporter?: number;
  readonly key?: string;
  readonly parentId?: ConversationId;
  readonly reporters?: readonly number[];
  readonly hold?: string;
  readonly deliveryPending?: boolean;
}
export const clean = (value: unknown): string => stripVTControlCharacters(String(value ?? ''))
  .replace(/[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/g, ' ').replace(/\s+/g, ' ').trim();

function argumentHint(args: unknown): string {
  if (!args || typeof args !== 'object') return '';
  const a = args as Record<string, unknown>;
  // Only the operation target, never arbitrary tool output or credential fields.
  return clean(a.path ?? a.command ?? a.query ?? a.name ?? '').slice(0, 180);
}
export function assistantActivity(entry: EntryRecord | undefined): Pick<ActivitySummary, 'lastStop' | 'callHints'> {
  const message = entry?.model?.[0];
  if (message?.role !== 'assistant') return {};
  return { lastStop: message.stopReason, callHints: Object.fromEntries(message.content
    .filter(block => block.type === 'toolCall')
    .map(block => [block.id, argumentHint(block.arguments)])) };
}

type AgentDocument = {
  agents?: Record<string, { conversationId: ConversationId; name: string; task: string; role: string; ownerTaskId: number; reporter?: number }>;
  outbox?: { name: string }[];
  sending?: { reports: { name: string }[] };
  deliveryHold?: { reason: string };
};
type RequestDocument = { requests?: Record<string, { key: string; task: string; reporter?: number }> };
export function agentMetadata(input: readonly ActivitySummary[], doc: AgentDocument | undefined, parentId: ConversationId): ActivitySummary[] {
  return input.map(row => {
    const found = Object.entries(doc?.agents ?? {}).find(([, agent]) => agent.conversationId === row.id);
    if (!found) return row;
    const [key, agent] = found;
    const sending = doc?.sending?.reports.some(report => report.name === agent.name) ?? false;
    const queued = doc?.outbox?.some(report => report.name === agent.name) ?? false;
    return { ...row, key, parentId, label: agent.name, title: row.title ?? agent.task, role: agent.role,
      ownerTaskId: agent.ownerTaskId, reporter: agent.reporter,
      deliveryPending: sending || queued, hold: sending ? doc?.deliveryHold?.reason : undefined };
  });
}
export function requestMetadata(input: readonly ActivitySummary[], doc: RequestDocument | undefined, parentId: ConversationId): ActivitySummary[] {
  return input.map(row => {
    const receipts = Object.values(doc?.requests ?? {}).filter(receipt => receipt.key === row.key && row.parentId === parentId);
    return receipts.length ? { ...row, title: receipts.at(-1)!.task,
      reporters: receipts.flatMap(receipt => receipt.reporter === undefined ? [] : [receipt.reporter]) } : row;
  });
}

/** Process complete publications in passes: SDK change order is unspecified. */
export function projectActivity(input: readonly ActivitySummary[], changes: readonly CommitChange[], rootId: ConversationId): ActivitySummary[] {
  const rows = new Map(input.map(row => [row.id, row]));
  for (const change of changes) {
    if (change.type === 'conversation' && !rows.has(change.value.id)) rows.set(change.value.id, {
      id: change.value.id, label: change.value.id === rootId ? 'main' : `subagent ${change.value.id}`,
    });
  }
  for (const kind of ['bb.subagents', 'bb.subagent-requests']) {
    for (const change of changes) {
      if (change.type !== 'document' || change.conversationId === undefined || change.record.kind !== kind || change.record.key !== undefined) continue;
      const next = kind === 'bb.subagents' ? agentMetadata([...rows.values()], change.value as AgentDocument | undefined, change.conversationId)
        : requestMetadata([...rows.values()], change.value as RequestDocument | undefined, change.conversationId);
      for (const row of next) rows.set(row.id, row);
    }
  }
  const patch = (id: ConversationId, value: Partial<ActivitySummary>) => {
    const row = rows.get(id);
    if (row) rows.set(id, { ...row, ...value });
  };
  for (const change of changes) {
    if (change.type === 'task' && change.value.kind === 'pi.generation') {
      const task = change.value;
      const row = rows.get(task.conversationId);
      if (row && task.id >= (row.runTaskId ?? 0)) patch(task.conversationId, {
        runTaskId: task.id, runOutcome: task.state.outcome?.status,
      });
    }
    if (change.type === 'document' && change.conversationId !== undefined && change.record.key === undefined) {
      const value = change.value;
      if (change.record.kind === 'pi.live') patch(change.conversationId, { live: (value ?? {}) as LiveState });
      if (change.record.kind === 'pi.inbox') patch(change.conversationId, { inbox: (value ?? { items: [] }) as InboxState });
    }
  }
  for (const change of changes.filter(change => change.type === 'entry').sort((a, b) => a.value.id - b.value.id)) {
    if (change.type === 'entry') {
      const entry = change.value;
      const message = entry.model?.[0];
      if (entry.kind === 'pi.assistant') patch(entry.conversationId, assistantActivity(entry));
      if (entry.kind === 'pi.user' && message?.role === 'user' && entry.conversationId !== rootId) {
        const title = typeof message.content === 'string' ? message.content : message.content
          .flatMap(block => block.type === 'text' ? [block.text] : []).join(' ');
        patch(entry.conversationId, { title });
      }
    }
  }
  return [...rows.values()];
}

export type ActivityKind = 'working' | 'queued' | 'reporting' | 'held' | 'idle' | 'stopped' | 'failed' | 'done';
export interface ActivityStatus { kind: ActivityKind; label: string; glyph: string; color: 'accent' | 'warning' | 'success' | 'error' | 'dim'; active: boolean }
export function activityStatus(row: ActivitySummary, graph?: TaskGraph): ActivityStatus {
  const live = row.live;
  const running = live?.nestedTools?.filter(slot => slot.status === 'running') ?? [];
  const tools = running.length ? running : live?.tools?.filter(slot => slot.status === 'running') ?? [];
  if (tools.length) return { kind: 'working', label: tools.map(slot => {
    const hint = 'arguments' in slot ? argumentHint(slot.arguments) : row.callHints?.[slot.callId];
    return `${slot.name}${hint ? ` ${hint}` : ''}`;
  }).join(' · '), glyph: '◐', color: 'accent', active: true };
  if (live?.generation?.retry) return { kind: 'queued', label: `retrying · ${clean(live.generation.retry.error)}`, glyph: '!', color: 'warning', active: true };
  if (live?.generation?.deferred) return { kind: 'queued', label: 'waiting for provider', glyph: '○', color: 'warning', active: true };
  if (live?.compactions?.length) return { kind: 'working', label: 'compacting context', glyph: '◐', color: 'accent', active: true };
  if (live?.generation || live?.run) return { kind: 'working', label: 'working', glyph: '◐', color: 'accent', active: true };
  if (row.inbox?.items.length) return { kind: 'queued', label: 'queued', glyph: '○', color: 'warning', active: true };
  if (row.hold) return { kind: 'held', label: `report held · ${clean(row.hold)}`, glyph: '!', color: 'warning', active: true };
  if (row.deliveryPending) return { kind: 'reporting', label: 'report ready · awaiting parent acknowledgement', glyph: '↑', color: 'dim', active: true };
  const nodes = Object.values(graph?.tasks ?? {});
  const reporter = nodes.find(node => node.id === row.reporter || row.reporters?.includes(node.id));
  const pending = reporter ?? nodes.find(node => node.id === row.ownerTaskId);
  if (pending?.abortRequested) return { kind: 'queued', label: 'stopping', glyph: '○', color: 'warning', active: true };
  if (reporter) return { kind: 'reporting', label: 'preparing report · awaiting parent acknowledgement', glyph: '↑', color: 'dim', active: true };
  if (pending) return { kind: 'queued', label: 'waiting for start', glyph: '○', color: 'warning', active: true };
  if (row.runOutcome === 'aborted') return { kind: 'stopped', label: 'stopped', glyph: '■', color: 'dim', active: false };
  if (row.runOutcome && ['failed', 'faulted', 'orphaned'].includes(row.runOutcome)) return { kind: 'failed', label: 'failed', glyph: '✗', color: 'error', active: false };
  if (row.lastStop === 'error') return { kind: 'failed', label: 'failed', glyph: '✗', color: 'error', active: false };
  if (row.lastStop === 'aborted') return { kind: 'stopped', label: 'stopped', glyph: '■', color: 'dim', active: false };
  if (row.lastStop === 'stop') return { kind: 'done', label: 'done', glyph: '✓', color: 'success', active: false };
  return { kind: 'idle', label: 'idle', glyph: '○', color: 'dim', active: false };
}

export function activityCounts(rows: readonly ActivitySummary[], graph?: TaskGraph): Record<ActivityKind, number> {
  const counts = { working: 0, queued: 0, reporting: 0, held: 0, idle: 0, stopped: 0, failed: 0, done: 0 };
  for (const row of rows) if (row.id !== ROOT_CONVERSATION_ID) counts[activityStatus(row, graph).kind]++;
  return counts;
}

export interface PanelView {
  readonly conversation: { readonly conversation: { readonly id: ConversationId } };
  readonly conversations: readonly ActivitySummary[];
  readonly tasks?: TaskGraph;
  readonly tasksExpanded?: boolean;
  readonly agentsCollapsed?: boolean;
}
type Theme = { fg(color: ActivityStatus['color'] | 'muted', text: string): string; bold(text: string): string };
const taskNames: Record<string, string> = {
  'pi.run': 'Conversation', 'pi.generation': 'Model response', 'pi.tool': 'Tool',
  'bb.subagent-anchor': 'Child lifetime', 'bb.subagent-reporter': 'Child report',
  'bb.subagent-courier': 'Report delivery', 'pi.compaction': 'Context compaction',
};
function taskDetail(node: TaskGraphNode): string {
  const state = node.state;
  const status = node.abortRequested ? 'stopping' : state.status === 'waiting' ? `waiting for ${state.on.map(id => `#${id}`).join(', ')}`
    : state.status === 'completing' ? `finishing · ${state.outcome}` : `${state.status} · ${state.phase}`;
  return `${taskNames[node.kind] ?? clean(node.kind)} #${node.id} · ${status} · conversation ${node.conversationId}`;
}

/** rpiv-todo's bounded tree + pi-subagents' identity / operation hierarchy, using native state. */
function sortedActivityRows(view: PanelView) {
  const rows = view.conversations.filter(row => row.id !== ROOT_CONVERSATION_ID)
    .map(row => ({ row, status: activityStatus(row, view.tasks) }));
  rows.sort((a, b) => Number(b.status.kind === 'working') - Number(a.status.kind === 'working') || Number(b.status.active) - Number(a.status.active) || Number(b.status.color === 'error') - Number(a.status.color === 'error') || b.row.id - a.row.id);
  return rows;
}

export function activityRowAt(view: PanelView, y: number): ConversationId | undefined {
  if (view.agentsCollapsed || y < 1) return undefined;
  const rows = sortedActivityRows(view);
  let line = 1;
  for (const { row } of rows.slice(0, view.tasksExpanded ? 6 : 4)) {
    if (y === line || (row.title && y === line + 1)) return row.id;
    line += row.title ? 2 : 1;
  }
  return undefined;
}

export function renderActivity(view: PanelView, width: number, theme: Theme, truncate: (text: string, width: number) => string): string[] {
  if (width <= 0) return [];
  const graph = view.tasks;
  const nodes = Object.values(graph?.tasks ?? {});
  const children = view.conversations.filter(row => row.id !== ROOT_CONVERSATION_ID);
  const states = sortedActivityRows(view);
  const counts = activityCounts(children, graph);
  const marker = view.agentsCollapsed ? '▸' : '▾';
  const shownCounts = Object.entries(counts).filter(([kind, count]) => count > 0 || kind === 'working');
  const full = `${marker} Agents · ${shownCounts.map(([kind, count]) => `${count} ${kind}`).join(' · ')}`;
  const short = `${marker} ${shownCounts.map(([kind, count]) => `${count} ${kind}`).join(' · ')}`;
  const compact = `${marker} ●${counts.working} ◷${counts.queued} ↑${counts.reporting} !${counts.held} ○${counts.idle} ■${counts.stopped} ✗${counts.failed} ✓${counts.done}`;
  // Counter strings contain only ASCII and fixed single-column glyphs, before applying ANSI colors.
  const heading = [full, short, compact].find(text => text.length <= width) ?? compact;
  const lines = [theme.fg(counts.working ? 'accent' : 'dim', theme.bold(heading))];
  if (view.agentsCollapsed) return lines.map(line => truncate(line, width));
  const selected = states.slice(0, view.tasksExpanded ? 6 : 4);
  for (const { row, status } of selected) {
    const shown = row.id === view.conversation.conversation.id ? ' ›' : '';
    lines.push(theme.fg('dim', '├─ ') + theme.fg(status.color, `${status.glyph} ${clean(row.label)}${shown}`) + theme.fg('muted', `${row.role ? ` · ${clean(row.role)}` : ''} · ${clean(status.label)}`));
    if (row.title) lines.push(theme.fg('dim', '│  ') + theme.fg(status.active ? 'accent' : 'muted', clean(row.title)));
  }
  if (states.length > selected.length) lines.push(theme.fg('dim', `├─ +${states.length - selected.length} agents`));
  if (view.tasksExpanded) {
    lines.push(theme.fg('accent', `Tasks · ${nodes.length} live (runtime work, not project todos)`));
    const sorted = [...nodes].sort((a, b) => Number(b.abortRequested) - Number(a.abortRequested) || Number(b.state.status === 'running') - Number(a.state.status === 'running') || a.id - b.id);
    for (const node of sorted.slice(0, 8)) lines.push(theme.fg(node.abortRequested ? 'warning' : 'muted', `  ${node.state.status === 'running' ? '◐' : '○'} ${taskDetail(node)}`));
    if (nodes.length > 8) lines.push(theme.fg('dim', `  +${nodes.length - 8} runtime tasks`));
    if (!nodes.length) lines.push(theme.fg('dim', '  No live runtime tasks'));
  } else if (nodes.length) {
    // Show meaningful foreground activity instead of an anchor/reporter implementation tree.
    const current = view.conversations.find(row => row.id === view.conversation.conversation.id);
    const status = current && activityStatus(current, graph);
    lines.push(theme.fg('dim', `└─ ${nodes.length} runtime tasks`) + (status?.active ? theme.fg('muted', ` · ${current?.id === ROOT_CONVERSATION_ID ? 'main' : 'shown'}: ${clean(status.label)}`) : ''));
  } else if (!children.length) lines.push(theme.fg('dim', '└─ No subagents · no live runtime tasks'));
  return lines.map(line => truncate(line, width));
}
