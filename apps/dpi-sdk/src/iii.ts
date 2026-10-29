// Selected iii worker's public JSON shapes. No native runtime, session files or engine dependency.
export type NativeIiiJson = null | boolean | number | string | NativeIiiJson[] | { [key: string]: NativeIiiJson };
export interface NativeIiiInput {
  requestId: string; content: string; operation?: 'start' | 'follow_up' | 'steer'; jobId?: string; mode?: 'followUp' | 'steer';
}
export interface NativeIiiInfo {
  sessionId: string; nativeSessionId: string; ownerConversationId: number; namespace: string; configHash: string; workerId: string;
  source: 'iii'; workspace: string; authority: 'delegated'; tools: readonly string[]; contractVersion: 2; runtimeVersion: string; jobCount: number; capabilities: Record<string, boolean>;
}
export interface NativeIiiResultInfo { answerRef: string; sha256: string; totalChars: number; truncated: boolean; pageOperation: 'requests::result' }
export interface NativeIiiRequest {
  requestId: string; fingerprint: string; submissionId?: number; jobId?: string; jobGeneration?: number; conversationId?: number; contractVersion?: 1 | 2;
  receipt: null | { id: number; conversationId: number; type: string; status: string; entry?: number; answer?: number; reason?: string };
  result?: string; resultInfo?: NativeIiiResultInfo;
}
export interface NativeIiiResultQuery { requestId: string; answerRef: string; cursor?: string; limit?: number }
export interface NativeIiiResultPage { requestId: string; answerRef: string; sha256: string; totalChars: number; offset: number; text: string; hasMore: boolean; cursor: string | null }
export type NativeIiiControlOperation = 'controls::inspect' | 'subagents::spawn' | 'subagents::send' | 'subagents::stop' | 'supervisor::reply' | 'conversations::follow_up' | 'conversations::steer';
export type NativeIiiTarget = { binding: string; session: string; conversationId: number } & (
  { type: 'conversation' } | { type: 'child'; parentConversationId: number; childKey: string } |
  { type: 'execution'; parentConversationId: number; childKey: string; executionId: string; childRequestId: string });
export interface NativeIiiJobStop { jobId: string; controlId: string; expectedGeneration: number }
export interface NativeIiiJobStopReceipt extends NativeIiiJobStop { conversationId: number; stopRequested: boolean; stopped: boolean; outcome: 'pending' | 'stopped' }
