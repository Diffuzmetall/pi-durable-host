import { createHash, createPublicKey, sign, verify, type KeyObject } from 'node:crypto';
import { record, string } from './domain.js';
import type { Json } from './domain.js';

export function canonical(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${Array.from({ length: value.length }, (_, index) => canonical(value[index])).join(',')}]`;
  const v = record(value);
  if (Object.getPrototypeOf(v) !== Object.prototype && Object.getPrototypeOf(v) !== null) throw Error('INVALID_JSON');
  return `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
}
export const fingerprint = (value: unknown) => createHash('sha256').update(canonical(value)).digest('hex');
export type Envelope = { version: 1; sessionId: string; functionId: string; expires: number; payload: Json; signature: string };
export function signed(privateKey: KeyObject | string, sessionId: string, functionId: string, payload: Json, expires = Date.now() + 60000): Envelope {
  const body = { version: 1 as const, sessionId, functionId, expires, payload };
  return { ...body, signature: sign(null, Buffer.from(canonical(body)), privateKey).toString('base64url') };
}
export type IngressMode = 'signed' | 'local-iii';
export class Admission {
  readonly mode: IngressMode;
  readonly publicKey: KeyObject;
  readonly sessionId: string;
  readonly now: () => number;
  constructor(publicKey: string | KeyObject, sessionId: string, now = Date.now, mode: IngressMode = 'signed') {
    if (mode !== 'signed' && mode !== 'local-iii') throw Error('INVALID_INGRESS_MODE');
    this.mode = mode;
    this.sessionId = sessionId;
    this.now = now;
    this.publicKey = typeof publicKey === 'string' ? createPublicKey(publicKey) : publicKey;
    if (this.publicKey.asymmetricKeyType !== 'ed25519' || this.publicKey.type !== 'public') throw Error('ED25519_PUBLIC_KEY_REQUIRED');
  }
  authorize(functionId: string, untrusted: unknown): Json {
    if (this.mode === 'local-iii') {
      const { _caller_worker_id: _ignored, ...payload } = record(untrusted);
      if (Buffer.byteLength(canonical(payload)) > 65536) throw Error('PAYLOAD_TOO_LARGE');
      return payload as Json;
    }
    try {
      // iii 0.24.6 adds this authorship hint to object payloads. It is neither signed nor trusted identity.
      const { _caller_worker_id: _ignored, ...e } = record(untrusted);
      if (Buffer.byteLength(JSON.stringify(e)) > 65536 || Object.keys(e).sort().join(',') !== 'expires,functionId,payload,sessionId,signature,version') throw Error();
      const { signature, ...body } = e;
      if (e.version !== 1 || e.sessionId !== this.sessionId || e.functionId !== functionId || typeof e.expires !== 'number'
        || !Number.isSafeInteger(e.expires) || e.expires <= this.now() || e.expires > this.now() + 300000) throw Error();
      if (!verify(null, Buffer.from(canonical(body)), this.publicKey, Buffer.from(string(signature, 128), 'base64url'))) throw Error();
      return e.payload as Json;
    } catch { throw Error('UNAUTHORIZED'); }
  }
}
