// Original canonical fingerprint only; signature/engine admission remains in the iii client component.
import { createHash } from 'node:crypto';
import { record } from './domain.js';

export function canonical(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const v = record(value);
  if (Object.getPrototypeOf(v) !== Object.prototype && Object.getPrototypeOf(v) !== null) throw Error('INVALID_JSON');
  return `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
}
export const fingerprint = (value: unknown) => createHash('sha256').update(canonical(value)).digest('hex');
