import type { ThreadEvent } from '@bb/domain';
import type { ScopedNativeHistoryRequest, NativeHistoryReceipt } from './native-history-request.js';

interface RoutingShape {
  bridgeLaunch: unknown;
  skillRoots: readonly unknown[];
  contributedEnv: readonly unknown[];
  environmentId: string;
  envVars: Record<string, string>;
  instructionMode: string;
  processKey: string;
  projectId?: string;
  providerId: string;
  sessionRestorable: boolean;
}

export function initializeRegisteredChildRouting<T extends RoutingShape>(args: {
  parent: T | undefined;
  existing: T | undefined;
  parentThreadId: string;
  childThreadId: string;
  providerId: string;
  processKey: string;
  resolveEnvironment(args: { contributedEnv: T['contributedEnv']; environmentId: string; projectId: string; threadId: string }): { envVars: Record<string, string> };
}): Pick<T, keyof RoutingShape>;

export function committedNativeHistoryTurn(request: ScopedNativeHistoryRequest,
  receipt: NativeHistoryReceipt & { deferred?: boolean; turnId?: string }):
  Extract<ThreadEvent, { type: 'turn/started' | 'turn/completed' }> | undefined;
