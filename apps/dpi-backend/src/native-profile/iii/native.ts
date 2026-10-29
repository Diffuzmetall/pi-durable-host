// Selected I/native.ts guard/documents; launcher and v1 transport are deliberately excluded.
import { defineDoc, defineExtension, hook, ToolTask, type ConversationId, type Harness } from '@earendil-works/pi-durable';
import type { Context } from '@earendil-works/chord';
import { ChildBindingDoc } from '../subagents/supervisor.js';
import { scopedRead } from './input-policy.js';

export const TOOLS = ['read', 'subagent', 'subagent_models', 'contact_supervisor', 'subagent_supervisor'] as const;
export const GUARD_NAME = 'durable-pi.guard';
export type Scope = { sessionId?: string; workspace?: string; policy?: string; anchor?: ConversationId };
export const JobScope = defineDoc<Scope>({ kind: 'durable-pi.scope', scope: 'conversation', history: 'latest', fork: 'initial', version: 1, checkpointWhen: () => false, initial: () => ({}) });
export const LegacyRequests = defineDoc<{ binding?: { sessionId: string; conversationId: ConversationId }; requests: Record<string, { fingerprint: string }> }>({ kind: 'durable-pi.requests', scope: 'session', version: 1, checkpointWhen: () => false, initial: () => ({ requests: {} }) });

/** Original workspace/tool guard, with a trusted current-policy check that survives owner reopen. */
export function createJobGuard(authorize: (scope: Readonly<Scope>, tool: string) => void) {
  return defineExtension({ name: GUARD_NAME, hooks: [hook(ToolTask, { async beforeTool(call, api, context) {
    let id = api.conversationId;
    const seen = new Set<number>();
    while (!seen.has(id)) {
      seen.add(id);
      const scope = await api.snapshot(JobScope, id, context);
      if (scope?.sessionId) {
        if (!scope.workspace) throw Error('BRIDGE_SCOPE_MISSING');
        authorize(scope, call.name);
        if (!(TOOLS as readonly string[]).includes(call.name)) throw Error('BRIDGE_TOOL_DENIED');
        if (call.name === 'read') {
          const path = await scopedRead(scope.workspace, call.arguments.path, context);
          authorize(scope, call.name);
          return { arguments: { ...call.arguments, path } };
        }
        return;
      }
      const parent = (await api.snapshot(ChildBindingDoc, id, context))?.binding;
      if (!parent) return;
      id = parent.parent;
    }
    throw Error('INVALID_NATIVE_PARENT_CYCLE');
  } })] });
}
export type Host = {
  session: Harness; context: Context; directory: string;
  scope: { policy: string; anchor: ConversationId };
  authorize(action: 'read' | 'write' | 'control'): void;
};
export type Controller = { admit(conversation: Awaited<ReturnType<Harness['createConversation']>>, requestId: string, context: Context): Promise<void> };
