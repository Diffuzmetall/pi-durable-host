import { fingerprint } from './auth.js';
import type { Completion, Request } from './domain.js';
export function canonicalCompletion(request: Request | null, nativeSessionId: string, conversationId: number): Completion | null {
  const r = request?.receipt;
  if (!request || !r || r.type !== 'input' || (r.status !== 'done' && r.status !== 'unanswered')) return null;
  if (r.conversationId !== conversationId || request.submissionId !== r.id) throw Error('COMPLETION_SCOPE_DENIED');
  const outcome = r.status === 'done' ? { status: 'done' as const, answerId: r.answer } : { status: 'unanswered' as const, reason: r.reason };
  if (r.status === 'done' ? !Number.isSafeInteger(r.answer) : typeof r.reason !== 'string') throw Error('INVALID_CANONICAL_COMPLETION');
  const body = { version: 1 as const, kind: 'request-completed' as const, nativeSessionId, conversationId,
    requestId: request.requestId, submissionId: r.id,
    ...(request.jobId === undefined ? {} : { jobId: request.jobId, jobGeneration: request.jobGeneration }), ...outcome };
  return { ...body, eventId: fingerprint(body) } as Completion;
}

