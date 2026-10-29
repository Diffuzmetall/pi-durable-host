import type { ChildControlPort } from './control-domain.js';
import type { JobStopReceipt } from './job-control.js';
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type BoundSession = { sessionId: string; conversationId?: number; authority: 'delegated'; tools: readonly string[];
  contractVersion?: 1 | 2; runtimeVersion?: string; jobCount?: number; capabilities?: Record<string, boolean> };
export type Input = { requestId: string; content: string; mode: 'followUp' | 'steer'; jobId?: string; operation?: 'start' | 'follow_up' | 'steer' };
export type Request = { requestId: string; fingerprint: string; submissionId?: number; jobId?: string; jobGeneration?: number; conversationId?: number; contractVersion?: 1 | 2; receipt: null | {
  id: number; conversationId: number; type: string; status: string; entry?: number; answer?: number; reason?: string;
}; result?: string; resultInfo?: ResultInfo };
export type ResultInfo = { answerRef: string; sha256: string; totalChars: number; truncated: boolean; pageOperation: 'requests::result' };
export type ResultPageInput = { requestId: string; answerRef: string; cursor?: string; limit?: number };
export type ResultPage = { requestId: string; answerRef: string; sha256: string; totalChars: number; offset: number; text: string; hasMore: boolean; cursor: string | null };
export type RuntimeTask = { id: number; conversationId: number; kind: string; status: string; scheduling: string; owner?: number; background: boolean; abortRequested: boolean };
export type Subagent = { activity: 'waiting' | 'active' | 'idle'; key: string; name: string; conversationId: number; role: string; background: boolean; settled: boolean;
  executions: { key: string; requestId: string; answered: boolean; answerRef?: string }[];
  waiting: { id: string; reason: string; state: string }[]; hasReport: boolean; hasProgress: boolean; updates: { id: string; state: string }[] };
export type Completion = { version: 1; kind: 'request-completed'; eventId: string; nativeSessionId: string; conversationId: number;
  requestId: string; submissionId: number; jobId?: string; jobGeneration?: number } & ({ status: 'done'; answerId: number } | { status: 'unanswered'; reason: string });
export type EventKind = 'agent-event' | 'tasks-changed' | 'subagents-changed' | 'request-completed' | 'tree-changed';
export type AgentEvent = { epoch: string; sequence: number; cursor?: string; sourceRevision?: string | null; sessionId: string; kind: EventKind; resync: boolean; data: Json };
export interface NativePort {
  readonly contractVersion?: 1 | 2;
  readonly childControl?: ChildControlPort;
  readonly controls?: { stop(value: unknown): Promise<JobStopReceipt>; get(controlId: string): Promise<JobStopReceipt | null> };
  info(): Promise<BoundSession>;
  tasks(): Promise<RuntimeTask[]>;
  subagents(): Promise<Subagent[]>;
  submit(input: Input): Promise<Request>;
  run(input: Input, waitSignal?: AbortSignal): Promise<Request>;
  request(id: string): Promise<Request | null>;
  resultPage?(value: unknown): Promise<ResultPage>;
  completion(id: string): Promise<Completion | null>;
  requests(): Promise<Request[]>;
  stop(id: string): Promise<{ outcome: string }>;
  listen(listener: (kind: EventKind, data: Json) => void): () => void;
  close(): Promise<void>;
}
export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('INVALID_OBJECT');
  return value as Record<string, unknown>;
}
export function string(value: unknown, max = 128): string {
  if (typeof value !== 'string' || !value.length || value.length > max) throw Error('INVALID_STRING');
  return value;
}
export function requestKey(value: unknown): string {
  const key = string(value);
  if (!/^[a-zA-Z0-9._:-]+$/.test(key) || ['__proto__', 'constructor', 'prototype'].includes(key)) throw Error('INVALID_REQUEST_ID');
  return key;
}
export function input(value: unknown, mode: Input['mode'] = 'followUp', operation?: Input['operation']): Input {
  if (mode !== 'followUp' && mode !== 'steer') throw Error('INVALID_INPUT_MODE');
  if (operation !== undefined && !['start', 'follow_up', 'steer'].includes(operation)) throw Error('INVALID_INPUT_OPERATION');
  const v = record(value);
  if (Object.keys(v).some(k => !['requestId', 'content', 'jobId'].includes(k))) throw Error('UNKNOWN_INPUT_FIELD');
  const requestId = requestKey(v.requestId);
  return { requestId, content: string(v.content, 32768), mode,
    ...(v.jobId === undefined ? {} : { jobId: requestKey(v.jobId) }), ...(operation === undefined ? {} : { operation }) };
}
