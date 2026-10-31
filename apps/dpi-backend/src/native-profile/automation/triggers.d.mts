import type { Context, JsonObject } from '@earendil-works/chord';
import type { ConversationDocToken, ConversationHandle, ConversationId } from '@earendil-works/pi-durable';
import { defineExtension } from '@earendil-works/pi-durable';

export interface TriggerCapabilities {
  requester(api: { conversationId: ConversationId }, context: Context): Promise<string | null>;
  authorize(request: { operation: string; conversationId: ConversationId; requester: string; watch?: JsonObject }, context: Context): Promise<boolean>;
  provider: { poll(query: JsonObject, context: Context): Promise<{ events: JsonObject[]; cursor: string | null }> };
  acceptEvent(event: JsonObject, watch: JsonObject, context: Context): Promise<boolean>;
  admission: { admit(conversation: ConversationHandle, requestId: string, context: Context): Promise<void> };
}
export const WatchesDoc: ConversationDocToken<{ items: Record<string, JsonObject> }>;
export const LIMITS: Readonly<Record<string, number>>;
export function createTriggersExtension(host?: Partial<TriggerCapabilities>): ReturnType<typeof defineExtension>;
