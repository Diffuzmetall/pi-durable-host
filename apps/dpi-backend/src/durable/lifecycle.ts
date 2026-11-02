import { BACKGROUND_CONTEXT as ctx } from "@earendil-works/chord/context";
import type { Harness, Storage } from "@earendil-works/pi-durable";

/** Trusted native composition hooks. These hooks never cross the public session boundary. */
export interface NativeSessionLifecycle {
  bind?(harness: Harness, storage: Storage): Promise<void>;
  shutdown?(): Promise<void>;
  beforeClose?(): Promise<void>;
  cleanup?(): Promise<void>;
}

/** Preserve shutdown, consumer cleanup, native storage close and profile cleanup even after failures. */
export async function closeNativeResources(harness: Harness | undefined, storage: Storage,
  lifecycle: NativeSessionLifecycle | undefined): Promise<void> {
  const errors: unknown[] = [];
  for (const operation of [() => lifecycle?.shutdown?.(), () => lifecycle?.beforeClose?.(),
    () => harness ? harness.close(ctx) : storage.close(ctx), () => lifecycle?.cleanup?.()]) {
    try { await operation(); } catch (error) { errors.push(error); }
  }
  if (errors.length === 1) throw errors[0];
  if (errors.length) throw new AggregateError(errors, "Runtime shutdown failed");
}
