// Public BB delta shapes localized from the selected provider; no provider runtime dependency.
export interface CumulativeUsageMetrics {
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
  cacheWriteInputTokens?: number;
}
export interface RunnerEvent {
  type: string;
  providerCheckpointId?: string;
  cumulativeUsage?: CumulativeUsageMetrics;
  aborted?: boolean;
  stopReason?: string;
  [key: string]: unknown;
}
export interface ThreadDelta { kind: string; [key: string]: unknown }
