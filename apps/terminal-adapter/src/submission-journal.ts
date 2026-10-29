import { randomUUID } from "node:crypto";
import { mkdir, open, readdir, readFile, unlink } from "node:fs/promises";
import { join } from "node:path";

export type DeliveryKind = "message" | "goal-command" | "goal-inspect";
export interface PendingSubmission { requestId: string; conversationId: number; text: string; whenBusy: "steer" | "followUp"; kind: DeliveryKind; wireText?: string }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Private client delivery journal, not a task queue. Reopen only reconciles receipts; never auto-submits. */
export class SubmissionJournal {
  readonly pending = new Map<string, PendingSubmission>();
  private readonly inFlight = new Set<string>();
  private constructor(readonly directory: string) {}

  static async open(directory: string): Promise<SubmissionJournal> {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const journal = new SubmissionJournal(directory);
    for (const name of await readdir(directory)) {
      if (!name.endsWith(".json") || !UUID.test(name.slice(0, -5))) continue;
      const value: unknown = JSON.parse(await readFile(join(directory, name), "utf8"));
      if (!value || typeof value !== "object" || !("requestId" in value) || value.requestId !== name.slice(0, -5) ||
          !("conversationId" in value) || typeof value.conversationId !== "number" || !Number.isSafeInteger(value.conversationId) || value.conversationId <= 0 ||
          !("text" in value) || typeof value.text !== "string" || !value.text.trim() || value.text.length > 100000 ||
          !("whenBusy" in value) || (value.whenBusy !== "steer" && value.whenBusy !== "followUp")) throw Error("Invalid pending submission journal; no input was replayed");
      const kind = "kind" in value ? value.kind : "message";
      if (kind !== "message" && kind !== "goal-command" && kind !== "goal-inspect") throw Error("Invalid pending delivery kind; no request was replayed");
      const wireText = 'wireText' in value ? value.wireText : undefined;
      if (wireText !== undefined && (kind !== 'message' || typeof wireText !== 'string' || !wireText.trim() || wireText.length > 100000)) throw Error('Invalid frozen message body; no input was replayed');
      journal.pending.set(value.requestId, { requestId: value.requestId, conversationId: value.conversationId, text: value.text, whenBusy: value.whenBusy, kind, ...(wireText === undefined ? {} : { wireText }) });
    }
    return journal;
  }

  async begin(conversationId: number, text: string, whenBusy: "steer" | "followUp", kind: DeliveryKind = "message", wireText?: string): Promise<PendingSubmission> {
    if (!text.trim() || text.length > 100000) throw Error("Input must be nonempty and under 100,000 characters");
    const previous = [...this.pending.values()].filter((item) => item.conversationId === conversationId && item.kind === kind && !this.inFlight.has(item.requestId));
    if (previous.length) {
      if (previous.length === 1 && previous[0].text === text && previous[0].whenBusy === whenBusy) {
        this.inFlight.add(previous[0].requestId);
        return previous[0];
      }
      throw Error("Previous delivery is uncertain. Reconnect to reconcile it, or retry the unchanged input; a new request key was not created.");
    }
    if (wireText !== undefined && (kind !== 'message' || !wireText.trim() || wireText.length > 100000)) throw Error('Expanded skill must be nonempty and under 100,000 characters');
    const item: PendingSubmission = { requestId: randomUUID(), conversationId, text, whenBusy, kind, ...(wireText === undefined ? {} : { wireText }) };
    const file = await open(join(this.directory, `${item.requestId}.json`), "wx", 0o600);
    try { await file.writeFile(JSON.stringify(item)); await file.sync(); }
    finally { await file.close(); }
    this.pending.set(item.requestId, item);
    this.inFlight.add(item.requestId);
    return item;
  }

  get uncertain(): readonly PendingSubmission[] {
    return [...this.pending.values()].filter((item) => !this.inFlight.has(item.requestId));
  }

  markUncertain(requestId: string): void { this.inFlight.delete(requestId); }

  async accepted(requestId: string): Promise<void> {
    if (!UUID.test(requestId) || !this.pending.has(requestId)) throw Error("Unknown journal submission");
    await unlink(join(this.directory, `${requestId}.json`));
    this.pending.delete(requestId);
    this.inFlight.delete(requestId);
  }
}
