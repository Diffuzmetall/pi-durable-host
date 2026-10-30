interface StoredLifecycleRow {
  id: string;
  type: string;
  sequence: number;
  scopeKind: string;
  turnId: string | null;
}
type CanonicalData<R> = (row: R) => Record<string, unknown> | undefined;
export function manualStopLifecycleIds<R extends StoredLifecycleRow>(stored: readonly R[], receipt: Readonly<Record<string, unknown>>,
  lifecycleData: CanonicalData<R>, hash: (value: unknown) => string, lifecycleIds: ReadonlySet<string>): Set<string> | undefined;
export function retainLifecycleTurnHeaders<R extends StoredLifecycleRow>(stored: readonly R[], ids: Set<string>, lifecycleData: CanonicalData<R>): void;
export function manualStopLifecycleReceipt<R extends StoredLifecycleRow>(stored: readonly R[], ids: ReadonlySet<string>, hash: (value: unknown) => string): {
  manualStopThroughSequence: number;
  manualStopRowCount: number;
  manualStopRowsDigest: string;
};
