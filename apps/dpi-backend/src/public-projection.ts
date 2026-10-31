import type { WireAssistantMessage, WireEntry, WireAgentEvent } from '../../dpi-sdk/src/api.js';
import type { AgentEvent, HarnessInspection, SnapshotEvent, TaskState } from '@earendil-works/pi-durable';

// Native 1.4 diagnostics also reach older wire clients; do not change SDK/application payloads.
type ProjectionEvent = Exclude<WireAgentEvent, { type: 'snapshot' | 'compaction_end' }>
  | (Extract<WireAgentEvent, { type: 'snapshot' }> & Partial<Pick<SnapshotEvent, 'compactionFailure' | 'nestedTools'>>)
  | Extract<AgentEvent, { type: 'compaction_end' }>;
const failure = 'Provider request failed; details are private.';
const taskFailure = 'Task failed; details are private.';

/** Project scheduler diagnostics, not task-owned application checkpoints or result JSON. */
export function publicTaskState<S, R>(state: TaskState<S, R>, kind: string): TaskState<S, R> {
  const copy = JSON.parse(JSON.stringify(state)) as TaskState<S, R>;
  if (copy.status === 'terminal' || copy.status === 'completing') {
    const outcome = copy.outcome;
    if (outcome.status === 'failed' || outcome.status === 'faulted') {
      return { ...copy, outcome: { ...outcome, error: { message: taskFailure } } };
    }
    if (outcome.status === 'orphaned') {
      return { ...copy, outcome: { ...outcome, reason: 'Task unavailable; details are private.' } };
    }
    if (outcome.status === 'aborted' && outcome.reason !== undefined) {
      return { ...copy, outcome: { ...outcome, reason: 'Request interrupted' } };
    }
  } else if (kind === 'pi.generation') {
    // Only this registered native task owns prepare.overflow as a provider diagnostic.
    const checkpoint = copy.checkpoint as { phase: string; overflow?: string };
    if (checkpoint.phase === 'prepare' && checkpoint.overflow !== undefined) {
      return { ...copy, checkpoint: { ...checkpoint, overflow: failure } as S };
    }
  }
  return copy;
}

/** The scheduler's inspection errors are diagnostics; input and memos remain application-owned. */
export function publicInspection(value: HarnessInspection): HarnessInspection {
  const copy = JSON.parse(JSON.stringify(value)) as HarnessInspection;
  return { ...copy, tasks: copy.tasks.map(item => ({
    ...item,
    // State status is unchanged, so the record's state/memo lifetime correlation is preserved.
    record: { ...item.record, state: publicTaskState(item.record.state, item.record.kind) } as typeof item.record,
    state: item.state.kind === 'blocked' && item.state.error !== undefined
      ? { ...item.state, error: taskFailure } : item.state,
  })) };
}

/** Coarsen private native failures, never recursively interpret application/tool JSON. */
export function publicProjection<T>(value: T, domain: 'entries' | 'events'): T {
  const copy: unknown = JSON.parse(JSON.stringify(value));
  const message = (item: WireAssistantMessage): WireAssistantMessage =>
    item.stopReason === 'error' || typeof item.errorMessage === 'string' ? {
      ...item,
      ...(item.stopReason === 'error' ? { content: [] } : {}),
      errorMessage: item.stopReason === 'aborted' ? 'Request interrupted' : failure,
    } : item;
  const entry = (item: WireEntry): WireEntry => item.kind === 'pi.assistant' && item.model
    ? { ...item, model: item.model.map(value => message(value as WireAssistantMessage)) } : item;
  const event = (item: ProjectionEvent): ProjectionEvent => {
    switch (item.type) {
      case 'snapshot': return {
        ...item, entries: item.entries.map(entry),
        ...(item.generation ? { generation: { ...item.generation,
          ...(item.generation.message ? { message: message(item.generation.message) } : {}),
          ...(item.generation.retry ? { retry: { ...item.generation.retry, error: failure } } : {}),
        } } : {}),
        compactions: item.compactions.map(state => state.retry ? { ...state, retry: { ...state.retry, error: failure } } : state),
        ...(item.compactionFailure ? { compactionFailure: { ...item.compactionFailure, error: failure } } : {}),
        ...(item.nestedTools ? { nestedTools: item.nestedTools.map(slot => slot.summary?.error !== undefined
          ? { ...slot, summary: { ...slot.summary, error: taskFailure } } : slot) } : {}),
      };
      case 'message_start': return item.message.role === 'assistant'
        ? { ...item, message: message(item.message as WireAssistantMessage) } : item;
      case 'message_update': return { ...item, changes: item.changes.map(change =>
        change.type === 'message' ? { ...change, message: message(change.message) } : change) };
      case 'message_end':
      case 'entry_appended': return { ...item, entry: entry(item.entry) };
      case 'tool_execution_end': return item.entry ? { ...item, entry: entry(item.entry) } : item;
      case 'auto_retry_start': return { ...item, errorMessage: failure };
      case 'compaction_end': return item.error === undefined ? item : { ...item, error: failure };
      case 'task_failed': return { ...item, message: taskFailure };
      case 'submission': return { ...item, record: { id: item.record.id, status: item.record.status } };
      default: return item;
    }
  };
  return (domain === 'entries' ? (copy as WireEntry[]).map(entry)
    : Array.isArray(copy) ? (copy as ProjectionEvent[]).map(event) : event(copy as ProjectionEvent)) as T;
}
