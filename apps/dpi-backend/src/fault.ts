import type { ErrorCode } from "../../dpi-sdk/src/api.js";

const STATUS: Record<ErrorCode, number> = {
  unauthorized: 401, not_found: 404, invalid: 400, busy: 409, conflict: 409,
  ambiguous: 409, unavailable: 503, internal: 500, offline: 503,
};

/** Application-owned failures contain only an explicitly safe explanation. No HTTP or native dependency. */
export class ApiFault extends Error {
  readonly status: number;
  constructor(readonly code: ErrorCode, message: string) {
    super(message);
    this.status = STATUS[code];
  }
}

export const invalid = (message: string) => new ApiFault("invalid", message);
export const notFound = (message: string) => new ApiFault("not_found", message);
