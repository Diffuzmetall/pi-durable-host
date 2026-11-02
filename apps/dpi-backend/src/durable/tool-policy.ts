/** Historical Host tools that can create, update, or delete state.
 * A native profile can supply its explicit read-only allowlist instead. */
export const WRITE_TOOLS = new Set([
  "bash", "write", "edit", "update_state", "run_durable_job",
  "ping_on_call_engineer", "subagent", "start_session",
]);
