import type { Context } from '@earendil-works/chord';
import type { ConversationHandle, Harness, Registry, Storage, Submission } from '@earendil-works/pi-durable';

export interface MemoryConfig {
  apiUrl: string;
  apiToken?: string;
  disabled: boolean;
  retainSessions: boolean;
  autoInject: string;
  [key: string]: unknown;
}
export interface MemoryBinding { cwd: string; bankId: string; }
export interface MemoryStatus {
  conversationId: number;
  pending: number;
  uncertain: number;
  accepted: number;
  acceptance: string;
  diagnostics: unknown[];
}
export class HindsightClient {
  constructor(options: { apiUrl: string; apiToken?: string; bank: string; project?: string; log?: (message: string) => void; tokenProvider?: () => string | undefined; [key: string]: unknown });
  readonly apiUrl: string;
  readonly bank: string;
  fetchWithAuth(url: string, init: RequestInit): Promise<Response>;
  listPages(): Promise<{ items: unknown[] }>;
  recallObservations(query: string, options: { timeoutMs: number }): Promise<string[]>;
}
export function resolveConfig(raw: Record<string, unknown>): MemoryConfig;
export interface SessionMemory {
  controller: {
    bind(host: { session: Harness; storage: Storage; directory: string; context: Context }): Promise<void>;
    admit(conversation: ConversationHandle, requestId: string, context?: Context): Promise<void>;
    submit(conversation: ConversationHandle, content: string, whenBusy?: 'followUp' | 'steer' | 'reject', requestId?: string): Promise<Submission>;
    reload(target?: Registry): Promise<void>;
    drain(timeoutMs?: number): Promise<MemoryStatus[]>;
    close(timeoutMs?: number): Promise<void>;
  };
  readonly paths: Readonly<{ log: string; diag: string; usage: string }>;
  bind(host: { session: Harness; storage: Storage; context: Context }): Promise<void>;
  drain(timeoutMs?: number): Promise<MemoryStatus[]>;
  close(timeoutMs?: number): Promise<void>;
}
export function createSessionMemory(registry: Registry, options: {
  directory: string;
  resolveBinding(cwd: string): { cfg: MemoryConfig; bankId: string } | Promise<{ cfg: MemoryConfig; bankId: string }>;
  resolveClient(binding: MemoryBinding, cfg?: MemoryConfig): HindsightClient | Promise<HindsightClient>;
  lifecycleEffects?: Record<string, unknown>;
  diagnostic?: (event: string, data?: unknown) => void;
}): Promise<SessionMemory>;
