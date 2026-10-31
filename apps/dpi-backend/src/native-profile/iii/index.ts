import { ROOT_CONVERSATION_ID, type Harness, type ConversationId, type RegistryReader } from '@earendil-works/pi-durable';
import type { Context } from '@earendil-works/chord';
import { GrantDenied, type GrantHandle, type GrantPolicy, type IiiGrantScope } from '../../grants.js';
import { createJobGuard, JobScope, type Controller } from './native.js';
import { jobPort } from './jobs.js';
import type { NativePort } from './domain.js';

/** One scoped view of the existing owner; all execution and durable state stay in the original Harness. */
export function createNativeIii(options: {
  policy: GrantPolicy; nativeSessionId: string; workspace: string; directory: string; registry: RegistryReader;
  assertOwner(action: 'read' | 'write' | 'control'): void; controller: Controller;
}) {
  let session: Harness | undefined, context: Context | undefined, closed = false;
  const ports = new Map<string, Promise<{ port: NativePort; scope: IiiGrantScope; ownerConversationId: number }>>();
  const guard = createJobGuard((scope, tool) => {
    options.assertOwner(tool === 'subagent' || tool === 'subagent_supervisor' ? 'control' : 'write');
    if (!scope.policy || !scope.anchor || scope.workspace !== options.workspace || !scope.sessionId) throw Error('BRIDGE_SCOPE_MISSING');
    const target = { sessionId: options.nativeSessionId, conversationId: scope.anchor as number };
    const identity = options.policy.assertReference(scope.policy, 'write', target);
    if (identity.source !== 'iii' || identity.authority !== 'delegated') throw new GrantDenied(403);
    const configured = options.policy.iiiBindings(options.nativeSessionId).find(record => record.policy === scope.policy);
    if (!configured || configured.scope.bindingId !== scope.sessionId || configured.conversationId !== scope.anchor) throw new GrantDenied(403);
    if (tool === 'subagent' || tool === 'subagent_supervisor') options.policy.assertReference(scope.policy, 'control', target);
  });
  function open(record: ReturnType<GrantPolicy['iiiBindings']>[number]) {
    if (closed || !session || !context) throw Error('NATIVE_PROFILE_NOT_BOUND');
    let pending = ports.get(record.scope.bindingId);
    if (!pending) {
      const owner = session, ctx = context;
      pending = (async () => {
        const target = { sessionId: options.nativeSessionId, conversationId: record.conversationId };
        const authorize = (action: 'read' | 'write' | 'control') => {
          options.assertOwner(action);
          if (closed) throw Error('BRIDGE_CLOSED');
          const identity = options.policy.assertReference(record.policy, action, target);
          if (identity.source !== 'iii' || identity.authority !== 'delegated') throw new GrantDenied(403);
        };
        authorize('read');
        const root = await owner.commit(tx => tx.conversation(record.conversationId as ConversationId), ctx);
        const delegated = await owner.snapshot(JobScope, record.conversationId as ConversationId, ctx);
        if (!root || root.owner || delegated?.sessionId) throw Error('III_NATIVE_OWNER_ROOT_REQUIRED');
        const port = await jobPort({ session: owner, context: ctx, directory: options.directory,
          scope: { policy: record.policy, anchor: record.conversationId as ConversationId }, authorize,
          controlPolicy: () => { authorize('read'); return { revision: record.policy, active: true, existing: [] }; },
        }, options.registry, options.controller, record.scope.bindingId, options.workspace, guard);
        authorize('read');
        return { port, scope: record.scope, ownerConversationId: record.conversationId };
      })();
      ports.set(record.scope.bindingId, pending);
      const attempt = pending;
      void pending.catch(() => { if (ports.get(record.scope.bindingId) === attempt) ports.delete(record.scope.bindingId); });
    }
    return pending;
  }
  return {
    guard,
    async bind(owner: Harness, ctx: Context) {
      session = owner; context = ctx;
      // Recover configured native journals before ordinary scheduling, without launching another session.
      for (const record of options.policy.iiiBindings(options.nativeSessionId)) await open(record);
    },
    async forGrant(handle: GrantHandle, conversationId: number) {
      const target = { sessionId: options.nativeSessionId, conversationId };
      const identity = options.policy.assert(handle, 'read', target), scope = options.policy.iiiScope(handle);
      if (identity.source !== 'iii' || identity.authority !== 'delegated') throw new GrantDenied(403);
      if (!scope) throw Error('III_SERVER_BINDING_REQUIRED');
      const policy = options.policy.reference(handle);
      const record = options.policy.iiiBindings(options.nativeSessionId).find(value => value.policy === policy && value.conversationId === conversationId);
      if (!record) throw new GrantDenied(403);
      const result = await open(record);
      options.policy.assert(handle, 'read', target);
      return result;
    },
    async close() {
      closed = true;
      await Promise.allSettled([...ports.values()].map(async value => (await value).port.close()));
      ports.clear();
    },
  };
}
export type NativeIii = ReturnType<typeof createNativeIii>;
export { JobJournal } from './jobs.js';
export { JobScope, TOOLS } from './native.js';
export { JobControls } from './job-control.js';
