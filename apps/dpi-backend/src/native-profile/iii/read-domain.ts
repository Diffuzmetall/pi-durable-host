// Original I/read-domain.ts target identity only; no read-model/tree API is advertised.
export type TargetRef = { binding: string; session: string; conversationId: number } & (
  { type: 'conversation' } | { type: 'task'; taskId: number } |
  { type: 'child'; parentConversationId: number; childKey: string } |
  { type: 'execution'; parentConversationId: number; childKey: string; executionId: string; childRequestId: string } |
  { type: 'entry'; entryId: number });
