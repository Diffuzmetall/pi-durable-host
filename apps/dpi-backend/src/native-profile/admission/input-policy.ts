// Localized actual iii worker input-policy.ts; provenance and limits: NOTICE.md.
import { realpath } from 'node:fs/promises';
import { relative, isAbsolute } from 'node:path';
import { defineDoc, defineExtension, hook, ToolTask, LiveDoc, type Harness, type ConversationId, type Tx } from '@earendil-works/pi-durable';
import { NodeExecutionEnv } from '@earendil-works/pi-durable/env/node';
import type { Context } from '@earendil-works/chord';
import { resolveReadToolPath } from './read-path.js';

export type InputPolicy = { workspace: string; policy: string; tools: string[]; parent?: ConversationId };
export type InputPolicyOwner = {
  session: Harness;
  /** Trusted current grant/revision lookup. Missing or false fails closed. */
  authorize(policy: Readonly<InputPolicy>, conversationId: ConversationId, context: Context): boolean | Promise<boolean>;
};
export const ExistingInputs = defineDoc<{ inputs: Record<string, InputPolicy> }>({
  kind: 'durable-pi.existing-inputs', version: 1, scope: 'conversation', history: 'latest', fork: 'initial', checkpointWhen: () => false, initial: () => ({ inputs: {} }),
});

/** Trusted host call in the native admission transaction; key is the native submission request ID. */
export async function bindExistingInput(tx: Tx, conversationId: ConversationId, requestId: string, policy: Readonly<InputPolicy>) {
  const inputs = (await tx.doc(ExistingInputs, conversationId)).inputs;
  const previous = inputs[requestId];
  if (previous && (previous.workspace !== policy.workspace || previous.policy !== policy.policy ||
      JSON.stringify([...previous.tools].sort()) !== JSON.stringify([...policy.tools].sort()) || previous.parent !== policy.parent))
    throw Error('DELEGATED_INPUT_POLICY_CONFLICT');
  inputs[requestId] = { workspace: policy.workspace, policy: policy.policy, tools: [...policy.tools],
    ...(policy.parent === undefined ? {} : { parent: policy.parent }) };
}

export async function scopedRead(workspace: string, path: unknown, context: Context): Promise<string> {
  if (typeof path !== 'string') throw Error('BRIDGE_READ_DENIED');
  const env = new NodeExecutionEnv({ cwd: workspace });
  const target = await realpath(await resolveReadToolPath(env, path, context));
  const within = relative(workspace, target);
  if (within === '..' || within.startsWith('../') || isAbsolute(within) || await realpath(await resolveReadToolPath(env, target, context)) !== target)
    throw Error('BRIDGE_READ_DENIED');
  return target;
}

/** Policies apply to the active native input IDs, not permanently to the human conversation. */
export function existingInputGuard(owner: () => InputPolicyOwner | undefined) {
  return defineExtension({ name: 'durable-pi.existing-input-policy', hooks: [hook(ToolTask, { async beforeTool(call, api, context) {
    const inputs = (await api.snapshot(ExistingInputs, api.conversationId, context))?.inputs;
    if (!inputs || Object.keys(inputs).length === 0) return;
    const live = await api.snapshot(LiveDoc, api.conversationId, context);
    if (!live?.run) return;
    const host = owner();
    if (!host) throw Error('DELEGATED_INPUT_OWNER_UNAVAILABLE');
    // Native receipts cover the submit-before-index window and remain authoritative after restart.
    const active = await host.session.commit(async tx => {
      const result: InputPolicy[] = [];
      for (const [key, policy] of Object.entries(inputs)) {
        const submission = await tx.submissionByRequest(api.conversationId, key);
        if (submission && live.run!.inputs.includes(submission.id)) result.push(policy);
      }
      return result;
    }, context);
    if (!active.length) return;
    if (typeof host.authorize !== 'function') throw Error('DELEGATED_INPUT_POLICY_UNAVAILABLE');
    for (const policy of active) {
      if (!await host.authorize(policy, api.conversationId, context)) throw Error('DELEGATED_INPUT_POLICY_REVOKED');
    }
    if (!active.every(policy => policy.tools.includes(call.name))) throw Error('DELEGATED_INPUT_TOOL_DENIED');
    if (call.name !== 'read') return;
    const workspace = active[0].workspace;
    if (active.some(policy => policy.workspace !== workspace)) throw Error('DELEGATED_INPUT_SCOPE_CONFLICT');
    return { arguments: { ...call.arguments, path: await scopedRead(workspace, call.arguments.path, context) } };
  } })] });
}
