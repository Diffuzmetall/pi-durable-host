import type { Context } from '@earendil-works/chord';
import { defineExtension, type Harness } from '@earendil-works/pi-durable';

export interface TraceObservation {
  update(value: Record<string, unknown>): void;
  end(): void;
}
export interface TraceSdk {
  start(name: string, type: 'agent' | 'generation' | 'tool', value: Record<string, unknown>, parent?: TraceObservation): TraceObservation;
  flush(): Promise<void>;
  close(): Promise<void>;
}
export function createLangfuseTracing(options?: {
  sessionId?: string;
  sdk?: TraceSdk;
  report?: (error: Error) => void;
}): Promise<{
  enabled: boolean;
  extension?: ReturnType<typeof defineExtension>;
  bind(harness: Harness, context: Context): Promise<void>;
  close(): Promise<void>;
}>;
