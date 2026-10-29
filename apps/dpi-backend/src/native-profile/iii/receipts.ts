import { createHash } from 'node:crypto';
import type { ConversationId, EntryId, Harness } from '@earendil-works/pi-durable';
import type { Context } from '@earendil-works/chord';
import type { Request, ResultInfo } from './domain.js';

/** Public answer text only: never thinking, tool calls, entry data or checkpoints. */
export async function readAnswer(session: Harness, context: Context, conversationId: ConversationId, answerId: number): Promise<string> {
  const entry = await session.commit(tx => tx.entry(answerId as EntryId), context);
  if (!entry || entry.conversationId !== conversationId) throw Error('RESULT_UNAVAILABLE');
  return (entry.model ?? []).filter(m => m.role === 'assistant').flatMap(m =>
    Array.isArray(m.content) ? m.content.filter(p => p.type === 'text').map(p => p.text) : []).join('\n');
}
export function resultInfo(conversationId: number, answerId: number, text: string, truncated: boolean): ResultInfo {
  return { answerRef: `durable:${conversationId}:${answerId}`, sha256: createHash('sha256').update(text).digest('hex'),
    totalChars: text.length, truncated, pageOperation: 'requests::result' };
}
/** UTF-16 offsets, but never separate a valid surrogate pair between transport pages. */
export function textEnd(text: string, offset: number, limit: number): number {
  let end = Math.min(text.length, offset + limit);
  if (end < text.length && end > offset && /[\uD800-\uDBFF]/.test(text[end - 1]) && /[\uDC00-\uDFFF]/.test(text[end])) end++;
  return end;
}

/** Canonical native receipt projection, shared by legacy readback and isolated jobs. */
export async function readRequest(session: Harness, context: Context, conversationId: ConversationId,
  requestId: string, key: string, fingerprint: string, includeResult = true): Promise<Request> {
  const canonical = await session.commit(tx => tx.submissionByRequest(conversationId, key), context);
  const result: Request = { requestId, fingerprint, ...(canonical ? { submissionId: canonical.id } : {}), receipt: canonical ? {
    id: canonical.id, conversationId: canonical.conversationId, type: canonical.type, status: canonical.status,
    ...(canonical.entry === undefined ? {} : { entry: canonical.entry }),
    ...(canonical.answer === undefined ? {} : { answer: canonical.answer }),
    ...(canonical.reason === undefined ? {} : { reason: canonical.reason }),
  } : null };
  if (includeResult && canonical?.status === 'done' && canonical.type === 'input') {
    const text = await readAnswer(session, context, conversationId, canonical.answer);
    const end = textEnd(text, 0, 16384);
    result.result = text.slice(0, end);
    result.resultInfo = resultInfo(conversationId, canonical.answer, text, end < text.length);
  }
  return result;
}
