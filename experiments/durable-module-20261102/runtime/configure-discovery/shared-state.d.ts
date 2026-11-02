import { type AppState, type StateChange } from "../../../dpi-sdk/src/app-state.js";
/** Device document storage only. No agent scheduler is resumed and no native handle leaves this owner. */
export declare class SharedState {
    #private;
    private constructor();
    static open(path: string): Promise<SharedState>;
    subscribe(listener: () => void): () => void;
    initialized(): Promise<boolean>;
    initialize(seed: AppState): Promise<void>;
    snapshot(): Promise<{
        value: AppState;
        revision: number;
    }>;
    change(change: StateChange, receiptKey?: string, expectedRevision?: number): Promise<AppState>;
    close(): Promise<void>;
}
