import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { ConversationId, Harness } from '@earendil-works/pi-durable';
import type { Context } from '@earendil-works/chord';
import { fingerprint } from './auth.js';
import { record, requestKey, string, type Request, type ResultPage } from './domain.js';
import { readAnswer, resultInfo, textEnd } from './receipts.js';

/** Rebuildable cursors: after detach/reopen restart paging at the same immutable answerRef, never resubmit. */
export function createResultPages(session: Harness, context: Context, binding: string,
  request: (requestId: string, includeResult: boolean) => Promise<Request | null>, authorize: (revision?: string) => string | undefined = () => undefined) {
  const secret = randomBytes(32);
  return async (value: unknown): Promise<ResultPage> => {
    const revision = authorize();
    const p = record(value);
    if (Object.keys(p).some(k => !['requestId', 'answerRef', 'cursor', 'limit'].includes(k))) throw Error('UNKNOWN_INPUT_FIELD');
    const requestId = requestKey(p.requestId), answerRef = string(p.answerRef, 256);
    const limit = p.limit ?? 8192;
    if (!Number.isSafeInteger(limit) || (limit as number) < 1 || (limit as number) > 16384) throw Error('INVALID_RESULT_LIMIT');
    if (p.cursor !== undefined) string(p.cursor, 4096);
    const saved = await request(requestId, false);
    const r = saved?.receipt;
    if (!saved || !r) throw Error('RESULT_NOT_FOUND');
    if (r.type !== 'input' || r.status !== 'done' || !Number.isSafeInteger(r.answer) || r.id !== saved.submissionId) throw Error('RESULT_NOT_READY');
    if (answerRef !== `durable:${r.conversationId}:${r.answer}`) throw Error('RESULT_REFERENCE_CONFLICT');
    const text = await readAnswer(session, context, r.conversationId as ConversationId, r.answer!);
    const info = resultInfo(r.conversationId, r.answer!, text, false);
    const query = fingerprint({ binding, requestId, submissionId: r.id, answerRef, sha256: info.sha256, revision: revision ?? 'legacy-binding', limit });
    let offset = 0;
    if (p.cursor !== undefined) {
      try {
        const bytes = Buffer.from(p.cursor as string, 'base64url');
        if (bytes.length < 29 || bytes.toString('base64url') !== p.cursor) throw Error();
        const decipher = createDecipheriv('aes-256-gcm', secret, bytes.subarray(0, 12));
        decipher.setAuthTag(bytes.subarray(12, 28));
        const c = JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8'));
        if (c.query !== query || !Number.isSafeInteger(c.offset) || c.offset < 1 || c.offset >= text.length) throw Error();
        offset = c.offset;
      } catch { throw Error('CURSOR_CONFLICT'); }
    }
    const end = textEnd(text, offset, limit as number);
    let cursor: string | null = null;
    if (end < text.length) {
      const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', secret, iv);
      const body = Buffer.concat([cipher.update(JSON.stringify({ query, offset: end }), 'utf8'), cipher.final()]);
      cursor = Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64url');
    }
    authorize(revision);
    return { requestId, answerRef, sha256: info.sha256, totalChars: text.length, offset,
      text: text.slice(offset, end), hasMore: cursor !== null, cursor };
  };
}
