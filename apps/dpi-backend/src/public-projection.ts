import type { WireAssistantMessage, WireEntry, WireAgentEvent } from '../../dpi-sdk/src/api.js';

/** Coarsen private native failures, never recursively interpret application/tool JSON. */
export function publicProjection<T>(value: T, domain: 'entries' | 'events'): T {
  const copy: unknown = JSON.parse(JSON.stringify(value));
  const failure = 'Provider request failed; details are private.';
  const message = (item: WireAssistantMessage): WireAssistantMessage =>
    item.stopReason === 'error' || typeof item.errorMessage === 'string' ? {
      ...item,
      ...(item.stopReason === 'error' ? { content: [] } : {}),
      errorMessage: item.stopReason === 'aborted' ? 'Request interrupted' : failure,
    } : item;
  const entry = (item: WireEntry): WireEntry => item.kind === 'pi.assistant' && item.model
    ? { ...item, model: item.model.map(value => message(value as WireAssistantMessage)) } : item;
  const event = (item: WireAgentEvent): WireAgentEvent => {
    switch (item.type) {
      case 'snapshot': return {
        ...item, entries: item.entries.map(entry),
        ...(item.generation ? { generation: { ...item.generation,
          ...(item.generation.message ? { message: message(item.generation.message) } : {}),
          ...(item.generation.retry ? { retry: { ...item.generation.retry, error: failure } } : {}),
        } } : {}),
        compactions: item.compactions.map(state => state.retry ? { ...state, retry: { ...state.retry, error: failure } } : state),
      };
      case 'message_start': return item.message.role === 'assistant'
        ? { ...item, message: message(item.message as WireAssistantMessage) } : item;
      case 'message_update': return { ...item, changes: item.changes.map(change =>
        change.type === 'message' ? { ...change, message: message(change.message) } : change) };
      case 'message_end':
      case 'entry_appended': return { ...item, entry: entry(item.entry) };
      case 'tool_execution_end': return item.entry ? { ...item, entry: entry(item.entry) } : item;
      case 'auto_retry_start': return { ...item, errorMessage: failure };
      case 'submission': return { ...item, record: { id: item.record.id, status: item.record.status } };
      default: return item;
    }
  };
  return (domain === 'entries' ? (copy as WireEntry[]).map(entry)
    : Array.isArray(copy) ? (copy as WireAgentEvent[]).map(event) : event(copy as WireAgentEvent)) as T;
}
