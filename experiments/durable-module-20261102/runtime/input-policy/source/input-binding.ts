import type { ConversationId, Tx } from "@earendil-works/pi-durable";
import type { AdmissionIdentity } from "../idempotency.js";

/** Native profile seam, not a Host/HTTP port. The runtime calls this inside its admission commit.
 * submit() has already performed table reads/writes: a binding may update documents, but must not
 * read tables, open another commit, publish resources, or perform external effects here.
 * A failure rolls back the input, submission, scheduled task, policy and receipt together. */
export interface NativeInputBinding {
  prepareInput?(tx: Tx, conversation: ConversationId, nativeRequestId: string, identity: AdmissionIdentity): Promise<void>;
}
