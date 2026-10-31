import type { AgentMailIdentity, InboxItem, SessionSummary, TaskNode, WireAgentState, WireAssistantMessage, WireEntry, WireMessage, WireSnapshotEvent, WireToolResultMessage, WireUserMessage } from "dpi-sdk/api";

export type { WireImage as ImageContent, WireText as TextContent, ThinkingLevel } from "dpi-sdk/api";
export type ConversationId = number;
export type RenderableMessage = WireUserMessage | AssistantMessage | WireToolResultMessage;
export type EntryRecord = Omit<WireEntry, "model"> & { model?: readonly RenderableMessage[] };

/** Unknown wire roles remain plain entries; only known message shapes enter native renderer components. */
export function isRenderableMessage(message: WireMessage): message is RenderableMessage {
  if (!("content" in message)) return false;
  const content = message.content;
  if (message.role === "user" && typeof content === "string") return true;
  if (!Array.isArray(content)) return false;
  const blocks = content.every((block: unknown) => {
    if (!block || typeof block !== "object" || !("type" in block)) return false;
    if (block.type === "text") return "text" in block && typeof block.text === "string";
    if (message.role === "assistant" && block.type === "thinking") return "thinking" in block && typeof block.thinking === "string";
    if (message.role === "assistant" && block.type === "toolCall") return "id" in block && typeof block.id === "string" && "name" in block && typeof block.name === "string" && "arguments" in block;
    return message.role !== "assistant" && block.type === "image" && "data" in block && typeof block.data === "string" && "mimeType" in block && typeof block.mimeType === "string";
  });
  if (!blocks) return false;
  if (message.role === "user") return true;
  if (message.role === "toolResult") return "toolCallId" in message && typeof message.toolCallId === "string" && "toolName" in message && typeof message.toolName === "string" && "isError" in message && typeof message.isError === "boolean";
  return message.role === "assistant" && "provider" in message && typeof message.provider === "string" && "model" in message && typeof message.model === "string" && "usage" in message && !!message.usage && typeof message.usage === "object" && "stopReason" in message && typeof message.stopReason === "string";
}
export type AgentState = WireAgentState;
export type AssistantMessage = WireAssistantMessage & { durationMs?: number };
export type ToolResultMessage = WireToolResultMessage;
export type UserMessage = WireUserMessage;
export type LiveState = Partial<Pick<WireSnapshotEvent, "run" | "generation" | "tools" | "compactions">> & { nestedTools?: readonly (WireSnapshotEvent["tools"][number] & { arguments?: unknown })[] };
export type InboxState = { items: readonly (InboxItem & { entry: { kind: string } })[] };
export type TaskGraphNode = Omit<TaskNode, "state"> & { abortRequested: boolean; state: TaskNode["state"] & { on: readonly number[]; outcome?: string } };
export type TaskGraph = { tasks: Readonly<Record<string, TaskGraphNode>> };
export type ConversationView = { conversation: { id: number }; entries: readonly EntryRecord[]; docs: Record<string, unknown> & { "pi.agent"?: AgentState } };
export interface Skill { name: string; description: string; filePath: string; baseDir: string; content?: string }
export interface Notice { id: number; level: "info" | "warning" | "error"; message: string; transient?: boolean }
export type CommitChange =
  | { type: "conversation"; value: { id: number } }
  | { type: "document"; conversationId?: number; record: { kind: string; key?: unknown }; value: unknown }
  | { type: "task"; value: { id: number; kind: string; conversationId: number; state: { outcome?: { status: string } } } }
  | { type: "entry"; value: EntryRecord };

/** Read-only presentation subset. No native task or authority implementation is included. */
export interface NativeGoal {
  id: string; objective: string;
  status: "draft" | "running" | "checking" | "reporting" | "waiting" | "paused" | "completed" | "cancelled";
  createdAt: number; updatedAt: number; revision: number; callsUsed: number; activeMsUsed: number;
  limits: "none" | { maxCalls?: number; activeMs?: number; tokens?: number };
  reason?: string; criteria?: readonly { id: string; text: string; human?: boolean }[];
  evidence?: readonly { criterionId: string; revision: number; outcome: string; check: string; proof: string; humanApproved?: boolean }[];
  skills?: readonly string[]; permissions?: { scope?: readonly string[] }; reportPath?: string;
}
export interface NativeGoalsState { active?: string; goals: Record<string, NativeGoal> }
export interface ConversationSummary {
  id: number; label: string; title?: string; role?: string; live?: LiveState; inbox?: InboxState;
  lastStop?: string; runTaskId?: number; runOutcome?: string; callHints?: Readonly<Record<string, string>>;
  ownerTaskId?: number; reporter?: number; key?: string; parentId?: number; reporters?: readonly number[]; hold?: string; deliveryPending?: boolean;
}
export interface AttentionView {
  requests: readonly { id: string; child: number; name: string; reason: "need_decision" | "interview_request"; message: string }[];
  unavailable?: boolean;
}
export interface DurableView {
  session: { id: string; directory: string; cwd: string; name: string };
  conversation: ConversationView;
  conversations: readonly ConversationSummary[];
  models: readonly { provider: string; modelId: string; name: string; contextWindow: number }[];
  notices: readonly Notice[];
  attention?: AttentionView;
  skills?: readonly Skill[];
  tasks?: TaskGraph; tasksExpanded?: boolean;
  agentMail?: AgentMailIdentity;
  externalDirectories?: readonly import('./external-directories.js').ExternalDirectory[];
  automation: { scheduled: number; failed: number; unavailable?: boolean; goal?: { status: string; attempts: number; maxAttempts: number }; nativeGoals?: NativeGoalsState };
  connection: "connecting" | "online" | "reconnecting" | "offline";
}
export interface DurableViewSource { current(): DurableView; subscribe(listener: () => void): () => void }
export interface DurableController {
  submit(text: string, whenBusy: "steer" | "followUp"): Promise<void>;
  compact(instructions?: string): Promise<void>; abort(): Promise<void>; reload(path?: string): Promise<void>;
  cycleThinking(): Promise<void>; setModel(model: { provider: string; modelId: string }): Promise<void>;
  toggleTasks(): Promise<void>; switchConversation(id: number): Promise<void>;
  listSessions(): Promise<SessionSummary[]>; renameSession(name: string): Promise<string>;
}
export const agentOf = (view: ConversationView): AgentState => view.docs["pi.agent"] ?? {};
export const ROOT_CONVERSATION_ID = 1;
