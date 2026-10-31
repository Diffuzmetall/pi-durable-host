export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type Input = { requestId: string; content: string; mode: 'followUp' | 'steer'; jobId?: string; operation?: 'start' | 'follow_up' | 'steer' };
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
