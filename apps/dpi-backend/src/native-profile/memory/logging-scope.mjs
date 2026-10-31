import { AsyncLocalStorage } from 'node:async_hooks';

const logs = new AsyncLocalStorage();
export function withSessionLogs(paths, run) {
  return logs.run(paths, run);
}
export function sessionLogPaths() {
  const paths = logs.getStore();
  if (!paths?.log || !paths?.diag || !paths?.usage) throw Error('SESSION_MEMORY_LOG_SCOPE_REQUIRED');
  return paths;
}
