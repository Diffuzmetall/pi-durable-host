import type { execFile } from 'node:child_process';
import type { Context } from '@earendil-works/chord';
import type { ConversationId } from '@earendil-works/pi-durable';
import type { TriggerCapabilities } from './triggers.mjs';

export interface GitHubCapabilitiesOptions {
  authorizeRoot?: (id: ConversationId, context: Context) => boolean | Promise<boolean>;
  admission?: TriggerCapabilities['admission'];
  env?: Record<string, string>;
  execFile?: typeof execFile;
}
export function createGitHubTriggerCapabilities(options?: GitHubCapabilitiesOptions): Omit<TriggerCapabilities, 'admission'> & { admission?: TriggerCapabilities['admission'] };
