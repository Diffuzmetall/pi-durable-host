import type { NativeParentTarget } from 'dpi-sdk/api';

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('BB_NATIVE_CHILD_LOCATORS_UNAVAILABLE');
  return value as Record<string, unknown>;
}
/** Public native documents supply LOCATORS only. The caller MUST use native inspect(target) before any Core/effect. */
export function childLocators(subagents: unknown, team: unknown): Required<NativeParentTarget>[] {
  // Native snapshot may omit an unmaterialized document; use its declared empty initial value, not a terminal inference.
  const agents = record(record(subagents === undefined ? { agents: {} } : subagents).agents);
  const executions = record(record(team === undefined ? { executions: {} } : team).executions);
  const targets: Required<NativeParentTarget>[] = [];
  for (const [executionId, raw] of Object.entries(executions)) {
    const execution = record(raw);
    if (!executionId || typeof execution.key !== 'string' || !execution.key || !Object.hasOwn(agents, execution.key) ||
      typeof execution.child !== 'number' || !Number.isSafeInteger(execution.child) || execution.child < 1 || typeof execution.requestId !== 'string' || !execution.requestId)
      throw Error('BB_NATIVE_CHILD_LOCATORS_UNAVAILABLE');
    const child = record(agents[execution.key]);
    if (child.conversationId !== execution.child) throw Error('BB_NATIVE_CHILD_LOCATORS_UNAVAILABLE');
    targets.push({ key: execution.key, conversationId: execution.child, executionId, requestId: execution.requestId });
  }
  return targets;
}
