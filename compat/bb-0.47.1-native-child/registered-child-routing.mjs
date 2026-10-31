// SPDX-License-Identifier: MIT
/**
 * Complete a registered native alias's Core routing, not its native execution.
 * All values and the environment resolver come from authenticated Core runtime state.
 * No provider request, prompt, history write or credential projection occurs here.
 */
export function initializeRegisteredChildRouting({ parent, existing, parentThreadId, childThreadId, providerId, processKey, resolveEnvironment }) {
  const deny = () => { throw Error('Registered native child routing refused'); };
  if (!parent || !parentThreadId || !childThreadId || childThreadId === parentThreadId ||
      parent.providerId !== providerId || parent.processKey !== processKey ||
      !parent.projectId || !parent.environmentId) deny();
  if (existing) {
    if (existing.providerId !== providerId || existing.processKey !== processKey ||
        existing.projectId !== parent.projectId || existing.environmentId !== parent.environmentId ||
        existing.envVars?.BB_THREAD_ID !== childThreadId) deny();
    return existing; // Registration retry must not reset an already configured child.
  }
  const { envVars } = resolveEnvironment({
    contributedEnv: parent.contributedEnv ?? [],
    environmentId: parent.environmentId,
    projectId: parent.projectId,
    threadId: childThreadId,
  });
  if (envVars?.BB_THREAD_ID !== childThreadId || envVars.BB_PROJECT_ID !== parent.projectId ||
      envVars.BB_ENVIRONMENT_ID !== parent.environmentId) deny();
  // Route on the same process, but do not inherit Root execution options, instructions,
  // dynamic tools or resolved envVars. The native child retains its own model/policy.
  return {
    bridgeLaunch: parent.bridgeLaunch,
    skillRoots: parent.skillRoots,
    contributedEnv: parent.contributedEnv,
    environmentId: parent.environmentId,
    envVars,
    instructionMode: parent.instructionMode,
    processKey,
    projectId: parent.projectId,
    providerId,
    sessionRestorable: true,
  };
}

/** A committed history receipt updates Core bookkeeping, never re-emits persisted events. */
export function committedNativeHistoryTurn(request, receipt) {
  if (!request.snapshot || receipt.deferred || receipt.threadId !== request.threadId ||
      typeof receipt.turnId !== 'string' || !receipt.turnId) return;
  const status = request.snapshot.status;
  if (!['working', 'completed', 'failed', 'interrupted'].includes(status)) return;
  const base = { threadId: request.threadId, providerThreadId: request.providerThreadId,
    scope: { kind: 'turn', turnId: receipt.turnId } };
  return status === 'working' ? { ...base, type: 'turn/started' } : { ...base, type: 'turn/completed', status };
}
