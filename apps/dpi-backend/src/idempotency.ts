import { createHash } from "node:crypto";
import { invalid } from "./errors.js";

/** Supplied by trusted server policy, never copied from an HTTP request body. */
export interface AdmissionIdentity {
  actor: string;
  source: string;
  authority: string;
  assertCurrent: () => void;
  signal?: AbortSignal;
  /** Semantic server policy reference, generated from the authenticated handle, never the body. */
  policyReference?: string;
}

export function requestKey(key: unknown): string {
  if (typeof key !== "string" || !key || key.length > 128)
    throw invalid("requestId or Idempotency-Key is required (≤128 chars)");
  return key;
}

/** JSON-equivalent bodies compare equally despite object property order. */
export function fingerprint(value: unknown): string {
  const canonical = JSON.stringify(value, (_key, item: unknown) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0))
      : item,
  );
  return createHash("sha256").update(canonical).digest("hex");
}

export function nativeRequestKey(actor: string, operation: string, key: string): string {
  return `host:${fingerprint([actor, operation, requestKey(key)])}`;
}
