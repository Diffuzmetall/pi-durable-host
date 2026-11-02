import { Harness, createRegistry, defineDoc, defineDocFamily } from "@earendil-works/pi-durable";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
import { createModels } from "@earendil-works/pi-ai/models";
import { BACKGROUND_CONTEXT as ctx } from "@earendil-works/chord/context";
import { changeState, replaceState, type AppState, type StateChange } from "../../../dpi-sdk/src/app-state.js";

const Data = defineDoc<AppState>({
  kind: "app.shared-state", version: 1, scope: "session",
  checkpointWhen: () => true, initial: () => ({}),
});
const Meta = defineDoc<{ initialized: boolean; revision: number }>({
  kind: "app.shared-state-meta", version: 1, scope: "session",
  checkpointWhen: () => true, initial: () => ({ initialized: false, revision: 0 }),
});
const Receipts = defineDocFamily<{ applied: boolean; result: string }, null>({
  kind: "app.shared-state-receipt", version: 1, scope: "session",
  checkpointWhen: () => true, family: true, initial: () => ({ applied: false, result: "" }),
});

/** Device document storage only. No agent scheduler is resumed and no native handle leaves this owner. */
export class SharedState {
  readonly #harness: Harness;
  private constructor(harness: Harness) { this.#harness = harness; }

  static async open(path: string): Promise<SharedState> {
    return new SharedState(await Harness.open(await openNodeSqliteStorage(path),
      { models: createModels(), registry: createRegistry() }, ctx));
  }

  subscribe(listener: () => void): () => void {
    const observation = this.#harness.observeCommits({ advance: listener, end() {} });
    return () => observation.detach();
  }

  async initialized(): Promise<boolean> {
    return (await this.#harness.snapshot(Meta, ctx))?.initialized === true;
  }

  async initialize(seed: AppState): Promise<void> {
    await this.#harness.commit(async tx => {
      const meta = await tx.doc(Meta);
      if (meta.initialized) return;
      const data = await tx.doc(Data);
      replaceState(data, seed);
      meta.initialized = true;
    }, ctx);
  }

  async snapshot(): Promise<{ value: AppState; revision: number }> {
    return this.#harness.commit(async tx => {
      const data = await tx.doc(Data);
      const meta = await tx.doc(Meta);
      return { value: JSON.parse(JSON.stringify(data)) as AppState, revision: meta.revision };
    }, ctx);
  }

  async change(change: StateChange, receiptKey?: string, expectedRevision?: number): Promise<AppState> {
    return this.#harness.commit(async tx => {
      const receipt = receiptKey ? await tx.doc(Receipts, receiptKey, null) : undefined;
      if (receipt?.applied) return JSON.parse(receipt.result) as AppState;
      const data = await tx.doc(Data);
      const meta = await tx.doc(Meta);
      if (expectedRevision !== undefined && expectedRevision !== meta.revision)
        throw Error("App State changed while you were editing. Load the latest JSON before saving.");
      const next = changeState(data, change);
      replaceState(data, next);
      meta.revision++;
      if (receipt) {
        receipt.applied = true;
        receipt.result = JSON.stringify(next);
      }
      return next;
    }, ctx);
  }

  async close(): Promise<void> {
    await this.#harness.close(ctx);
  }
}
