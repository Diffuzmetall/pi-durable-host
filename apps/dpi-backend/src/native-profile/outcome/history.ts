import type { Context } from '@earendil-works/chord';
import { LiveDoc, InboxDoc, type ConversationId, type Harness, type Storage, type Cursor } from '@earendil-works/pi-durable';
import type { OutcomeHistory } from './coherent.js';

/** Original local-host read-service capture, using the existing owner's public Harness and Storage. */
export async function readOutcomeHistory(h: Harness, storage: Storage, id: ConversationId,
  requested: string | readonly string[], context: Context): Promise<OutcomeHistory> {
  const requestIds = typeof requested === 'string' ? [requested] : requested;
  if (!Number.isSafeInteger(id) || id <= 0 || !Array.isArray(requestIds) || !requestIds.length || requestIds.length > 1000 ||
    requestIds.some(value => typeof value !== 'string' || !value.trim() || value.length > 1024))
    throw Error('READ_SERVICE_INVALID_OUTCOME_TARGET');
  let changed = false;
  const unsubscribe = h.subscribeCommits(publication => {
    if (publication.changes.some(change => (change.type === 'document' || change.type === 'document.copy'
      ? change.conversationId : change.type === 'conversation' ? change.value.id : change.value.conversationId) === id)) changed = true;
  });
  try {
    const conversation = await h.conversation(id, context);
    const configuration = conversation && await conversation.agent(context);
    const agent = configuration?.model ? { model: `${configuration.model.provider}/${configuration.model.modelId}`,
      thinkingLevel: configuration.thinkingLevel ?? 'off' } : undefined;
    const live = await h.snapshot(LiveDoc, id, context);
    const inbox = await h.snapshot(InboxDoc, id, context);
    let latestRequest: string | undefined;
    let sawLatestInput = false;
    const inputs: { entryId: string; requestId: string }[] = [];
    let cursor: Cursor | undefined;
    let submissionScanTruncated = false;
    for (let pageIndex = 0; pageIndex < 16; pageIndex++) {
      const page = await storage.scanSubmissions({ conversationId: id, order: 'descending' }, 64, cursor, context);
      for (const submission of page.items) if (submission.type === 'input') {
        if (!sawLatestInput) { sawLatestInput = true; latestRequest = submission.requestId; }
        if (submission.requestId !== undefined && 'entry' in submission && submission.entry !== undefined)
          inputs.push({ entryId: String(submission.entry), requestId: submission.requestId });
      }
      if (page.next === undefined) break;
      cursor = page.next;
      if (pageIndex === 15) submissionScanTruncated = true;
    }
    const frame = await h.commit(async tx => {
      const conversation = await tx.conversation(id);
      if (!conversation) return { conversation, submission: undefined, entries: [], truncated: false };
      const receipts = await Promise.all(requestIds.map(requestId => tx.submissionByRequest(id, requestId)));
      const original = receipts[0];
      const submission = original?.type === 'input' && latestRequest !== undefined ? await tx.submissionByRequest(id, latestRequest) : undefined;
      const page = await tx.scanEntries({ conversationId: id, order: 'ascending' }, 1000);
      return { conversation, submission, entries: page.items, inputs,
        pendingAdmission: receipts.slice(1).some(receipt => receipt === undefined),
        truncated: page.next !== undefined || submissionScanTruncated };
    }, context);
    return { ...frame, ...(agent ? { agent } : {}), stable: !changed, unsupported: live?.compactionFailure !== undefined,
      active: live?.run !== undefined || (inbox?.items.length ?? 0) > 0 || (live?.compactions?.length ?? 0) > 0 };
  } finally { unsubscribe(); }
}
