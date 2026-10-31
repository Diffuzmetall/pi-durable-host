import { randomUUID } from "node:crypto";
import type { ErrorRequestHandler } from "express";
import { ConversationBusy } from "@earendil-works/pi-durable";
import type { ErrorCode } from "../../dpi-sdk/src/api.js";
import { GrantDenied } from "./grants.js";

const STATUS: Record<ErrorCode, number> = {
  unauthorized: 401, not_found: 404, invalid: 400, busy: 409, conflict: 409,
  ambiguous: 409, unavailable: 503, internal: 500, offline: 503,
};

export class ApiFault extends Error {
  readonly status: number;
  constructor(readonly code: ErrorCode, message: string) {
    super(message);
    this.status = STATUS[code];
  }
}

export const invalid = (message: string) => new ApiFault("invalid", message);
export const notFound = (message: string) => new ApiFault("not_found", message);

/** Only explicit client faults may carry application-owned explanations; internal causes never do. */
export function publicErrorMessage(error: unknown): string {
  if (error instanceof GrantDenied) return error.status === 401
    ? "Missing, invalid or revoked credential" : "Grant does not permit this operation";
  if (error instanceof ApiFault) {
    if (error.status < 500) return error.message;
    return error.code === "internal" ? "Internal error" : "Service unavailable";
  }
  return "Internal error";
}

/** Structural diagnostics only. operation is a static server label, never a request path or error text. */
export function reportError(error: unknown, operation: string): string {
  const id = randomUUID();
  const kind = error instanceof TypeError ? "TypeError" : error instanceof RangeError ? "RangeError"
    : error instanceof SyntaxError ? "SyntaxError" : error instanceof Error ? "Error" : "non-error";
  console.error(`[dpi-backend] ${JSON.stringify({ event: "operation_failed", id, operation, kind })}`);
  return id;
}

export const errorMiddleware: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof GrantDenied) {
    if (res.headersSent) return void res.end();
    res.status(err.status).json({ error: { code: "unauthorized", message: publicErrorMessage(err) } });
    return;
  }
  let fault: ApiFault;
  if (err instanceof ApiFault) fault = new ApiFault(err.code, publicErrorMessage(err));
  else if (err instanceof ConversationBusy) fault = new ApiFault("busy", "The agent is busy and the input asked to be rejected while busy");
  else if (err?.type === "entity.parse.failed") fault = invalid("Body must be valid JSON");
  else if (err?.type === "entity.too.large") fault = invalid("Body too large");
  else if (/App State changed while you were editing/.test(String(err?.message)))
    fault = new ApiFault("conflict", "App State changed while you were editing; reload and retry");
  else if (err instanceof Error && /^(Field|Invalid|Use a JSON Pointer|Increment|The state root|State path|Parent must|Value must|Reserved field|App State must|State is too)/.test(err.message))
    fault = invalid("Invalid request");
  else fault = new ApiFault("internal", "Internal error");
  // No arbitrary exception message/stack, request path, provider URL, headers or credentials in logs.
  const incident = fault.status >= 500 ? reportError(err, `http.${["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].includes(req.method) ? req.method : "OTHER"}`) : undefined;
  if (res.headersSent) return void res.end();
  if (incident) res.setHeader("x-dpi-error-id", incident);
  res.status(fault.status).json({ error: { code: fault.code, message: fault.message } });
};
