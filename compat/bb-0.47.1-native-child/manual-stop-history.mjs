// SPDX-License-Identifier: MIT
/** Core lifecycle rows are retained verbatim, outside the native transcript CAS.
 * lifecycleData is Core's existing exact-scope canonical validator. The caller
 * MUST keep its original owned-row fingerprint check after excluding these IDs.
 */
export function manualStopLifecycleIds(stored, receipt, lifecycleData, hash, lifecycleIds) {
  const canonical = stored.filter(row => lifecycleIds.has(row.id) ||
    (row.type === 'turn/started' && row.scopeKind === 'turn' && lifecycleData(row)) ||
    (row.type === 'system/thread/interrupted' && row.scopeKind === 'thread' && lifecycleData(row)?.reason === 'manual-stop') ||
    (row.type === 'turn/completed' && row.scopeKind === 'turn' && lifecycleData(row)?.status === 'interrupted'));
  let through = 0, prior = [];
  if ([receipt.manualStopThroughSequence, receipt.manualStopRowCount, receipt.manualStopRowsDigest].some(value => value !== undefined)) {
    through = receipt.manualStopThroughSequence;
    if (!Number.isSafeInteger(through) || through < 0 || !Number.isSafeInteger(receipt.manualStopRowCount) || receipt.manualStopRowCount < 0 ||
        typeof receipt.manualStopRowsDigest !== 'string' || !/^[a-f0-9]{64}$/.test(receipt.manualStopRowsDigest)) return;
    prior = canonical.filter(row => row.sequence <= through);
    if (prior.length !== receipt.manualStopRowCount || hash(prior) !== receipt.manualStopRowsDigest) return;
  }
  const ids = new Set([...prior.map(row => row.id), ...lifecycleIds]);
  const stops = canonical.filter(row => row.type === 'system/thread/interrupted');
  for (const stop of stops) if (stop.sequence > through) ids.add(stop.id);
  if (receipt.nativeStatus !== 'working') return ids;
  for (const row of canonical) {
    if (row.type !== 'turn/completed' || row.sequence <= through) continue;
    const start = stored.find(candidate => candidate.type === 'turn/started' &&
      candidate.scopeKind === 'turn' && candidate.turnId === row.turnId && lifecycleData(candidate));
    if (start && stops.some(stop => start.sequence < stop.sequence && stop.sequence < row.sequence)) ids.add(row.id);
  }
  return ids;
}

/** Call ONLY AFTER the original owned-row fingerprint/admission gates succeed.
 * Keep the ORIGINAL native-projection header used by a retained Core interruption,
 * otherwise the real timeline reader sees turn/completed without turn/started.
 */
export function retainLifecycleTurnHeaders(stored, ids, lifecycleData) {
  for (const completion of stored) {
    if (!ids.has(completion.id) || completion.type !== 'turn/completed') continue;
    const start = stored.find(row => row.type === 'turn/started' && row.scopeKind === 'turn' &&
      row.turnId === completion.turnId && row.sequence < completion.sequence && lifecycleData(row));
    if (start) ids.add(start.id);
  }
}

/** Written ONLY by the authorized existing Core history transaction, not a client. */
export function manualStopLifecycleReceipt(stored, ids, hash) {
  const rows = stored.filter(row => ids.has(row.id));
  return { manualStopThroughSequence: rows.reduce((max, row) => Math.max(max, row.sequence), 0),
    manualStopRowCount: rows.length, manualStopRowsDigest: hash(rows) };
}
