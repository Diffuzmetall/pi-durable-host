// Actual Core client IDs, B/provider/host/bridge-router.ts:51; not native registration IDs.
export function bbInputRequestId(value: string, scope: 'root' | 'child'): string {
  if (typeof value !== 'string' || !/^creq_[23456789abcdefghijkmnpqrstuvwxyz]{10}$/u.test(value))
    throw Error('BB_CLIENT_REQUEST_ID_INVALID');
  return `bb-${scope}:${value}`;
}
