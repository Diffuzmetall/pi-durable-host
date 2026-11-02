// Compile-time checks for the semantic boundary, not upstream event passthrough.
import type { openNativeSession } from "./durable/native-session.js";
import type { DurableSession } from "./durable/session.js";

type Assert<T extends true> = T;
type RuntimeSession = Awaited<ReturnType<typeof openNativeSession>>;
// Parent control and profile reload are separate Host-integration gates, not component claims.
type ComponentSession = Omit<DurableSession,
  "reload" | "parentState" | "parentCommand" | "parentReceipt" | "reconcileParent">;

export type SessionOperationsFit = Assert<RuntimeSession extends ComponentSession ? true : false>;
// Reject additional public native handles, transaction methods or observation owners.
export type SessionSurfaceFits = Assert<Exclude<keyof RuntimeSession, keyof DurableSession> extends never ? true : false>;
