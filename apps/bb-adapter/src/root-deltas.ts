import type { Frame, WireAssistantMessage, WireEntry, WireToolSlot } from 'dpi-sdk/api';
import { translateMessageUpdate, translateMessageEnd, translateAgentEnd } from './message-delta-translator.js';
import { translateToolStart, translateToolUpdate, translateToolEnd } from './tool-delta-translator.js';
import type { ThreadDelta } from './types.js';

/** Existing BB message/tool presentations over public native frames. Never a child outcome resolver. */
export class RootDeltas {
  private state = { currentThinkingIndex: 0, currentAgentText: '', openThinkingChannels: new Set<string>() };
  private tools = new Map<string, { shape: Record<string, unknown>; output: string }>();
  private last?: { entry: number; message: WireAssistantMessage };
  private checkpoint?: number;
  private open = false;
  private redactedThinking = new Set<number>();
  constructor(private readonly cwd: string, private readonly providerOptions?: Record<string, unknown>) {}
  get checkpointId(): string | undefined { return this.checkpoint === undefined ? undefined : String(this.checkpoint); }

  apply(frame: Frame): ThreadDelta[] {
    const deltas: ThreadDelta[] = [];
    const start = () => { if (!this.open) { this.open = true; deltas.push({ kind: 'turn.open' }); } };
    const message = (entry: WireEntry) => {
      const item = entry.model?.[0];
      if (entry.kind !== 'pi.assistant' || item?.role !== 'assistant') return;
      const assistant = item as WireAssistantMessage;
      this.last = { entry: entry.id, message: assistant };
      if (this.checkpoint === entry.id) return;
      start();
      const result = translateMessageEnd(assistant, this.state.currentAgentText, this.state.openThinkingChannels);
      this.state.currentAgentText = result.nextAgentText;
      deltas.push(...result.deltas);
    };
    const finish = () => {
      if (!this.last || this.checkpoint === this.last.entry || !['stop', 'error', 'aborted'].includes(this.last.message.stopReason)) return;
      const result = translateAgentEnd({ type: 'agent_end', message: this.last.message, providerCheckpointId: String(this.last.entry) }, '', false);
      deltas.push(...result.deltas.map(d => d.kind === 'turn.boundary' && this.last!.message.stopReason === 'error' ? { ...d, status: 'failed' } : d));
      this.checkpoint = this.last.entry; this.open = false;
    };
    const toolStart = (slot: Pick<WireToolSlot, 'callId' | 'name'>, args: unknown) => {
      const translated = translateToolStart({ type: 'tool_execution_start', toolCallId: slot.callId, toolName: slot.name, args }, this.cwd);
      this.tools.set(slot.callId, { shape: translated.shape, output: '' }); deltas.push(translated.delta);
    };
    if (frame.type === 'snapshot') {
      const snapshot = frame.snapshot;
      this.state = { currentThinkingIndex: 0, currentAgentText: '', openThinkingChannels: new Set() };
      this.tools.clear(); this.redactedThinking.clear(); this.last = undefined; this.open = false;
      if (snapshot.run || snapshot.generation || snapshot.tools.length) start();
      for (const tool of snapshot.tools) {
        const call = snapshot.entries.flatMap(e => e.model ?? []).filter(m => m.role === 'assistant')
          .flatMap(m => (m as WireAssistantMessage).content).find(b => b.type === 'toolCall' && b.id === tool.callId);
        toolStart(tool, call?.type === 'toolCall' ? call.arguments : {});
        const cached = this.tools.get(tool.callId)!; cached.output = tool.output ?? '';
        const progress = translateToolUpdate({ type: 'tool_execution_update', toolCallId: tool.callId, toolName: tool.name, partialResult: cached.output });
        if (progress) deltas.push(progress);
      }
      const tail = snapshot.entries.at(-1);
      if (tail && !snapshot.run && !snapshot.generation && !snapshot.tools.length && !snapshot.inbox.length && !snapshot.compactions.length) { message(tail); finish(); }
      const live = snapshot.generation?.message;
      if (live) for (const [index, block] of live.content.entries()) {
        if (block.type === 'text') deltas.push(...translateMessageUpdate({ type: 'text_delta', delta: block.text, contentIndex: index }, this.state, this.providerOptions));
        else if (block.type === 'thinking' && !block.redacted && typeof block.thinking === 'string') deltas.push(...translateMessageUpdate({ type: 'thinking_delta', delta: block.thinking, contentIndex: index }, this.state, this.providerOptions));
      }
    } else if (frame.type === 'batch') {
      for (const event of frame.events) switch (event.type) {
        case 'run_start': this.last = undefined; start(); break;
        case 'message_start': this.redactedThinking.clear(); break;
        case 'message_update':
          for (const change of event.changes) {
            if (change.type === 'thinking_start' && change.block.type === 'thinking' && change.block.redacted) this.redactedThinking.add(change.contentIndex);
            if ((change.type === 'thinking_start' || change.type === 'thinking_delta') && this.redactedThinking.has(change.contentIndex)) continue;
            if (['text_start','text_delta','thinking_start','thinking_delta'].includes(change.type))
              deltas.push(...translateMessageUpdate(change as unknown as Record<string, unknown>, this.state, this.providerOptions));
          }
          break;
        case 'message_end': message(event.entry); break;
        case 'tool_execution_start': toolStart({ callId: event.toolCallId, name: event.toolName }, event.args); break;
        case 'tool_execution_update': {
          const tool = this.tools.get(event.toolCallId);
          if (!tool) break;
          if (event.details && typeof event.details === 'object' && 'conversationId' in event.details && event.details.conversationId !== undefined)
            tool.shape.childRef = String(event.details.conversationId); // Presentation only, never child ownership proof.
          if (!event.output) break;
          tool.output = 'set' in event.output ? event.output.set : tool.output.slice(event.output.trimStart ?? 0) + (event.output.append ?? '');
          const progress = translateToolUpdate({ type: 'tool_execution_update', toolCallId: event.toolCallId, toolName: event.toolName, partialResult: tool.output });
          if (progress) deltas.push(progress);
          break;
        }
        case 'tool_execution_end': {
          const tool = this.tools.get(event.toolCallId), result = event.entry?.model?.[0];
          const record = result?.role === 'toolResult' ? result as { content: readonly { type: string; text?: string }[]; isError?: boolean; details?: unknown } : undefined;
          deltas.push(translateToolEnd({ type: 'tool_execution_end', toolCallId: event.toolCallId, toolName: event.toolName,
            result: record?.content.filter(b => b.type === 'text').map(b => b.text ?? '').join('\n') ?? tool?.output,
            isError: record?.isError, details: record?.details }, tool?.shape, this.cwd));
          this.tools.delete(event.toolCallId); break;
        }
        case 'run_end': finish(); break;
      }
    }
    return deltas;
  }
}
