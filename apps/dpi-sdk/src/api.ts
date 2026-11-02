// The Durable Agent Network wire contract: every JSON body and stream frame between
// dpi-backend and its clients. Types only, so browsers, Node and the TUI share it.
//
// Agent events follow pi-durable 1.4.0's `watchEvents()` shape. Private provider
// failure details are coarsened at the host's public projection boundary.
// The Wire* event types below copy their JSON shape; apps/dpi-backend/src/contract-check.ts
// fails the build if pi-durable's own types stop fitting them.

import type { JobDef } from "./jobs.js";
export type { NativeIiiJson, NativeIiiInput, NativeIiiInfo, NativeIiiRequest, NativeIiiResultInfo, NativeIiiResultQuery, NativeIiiResultPage, NativeIiiControlOperation, NativeIiiTarget, NativeIiiJobStop, NativeIiiJobStopReceipt } from './iii.js';

export const API_VERSION = 2 as const;
/** Sent by protocol-2 clients; Host rejects missing/unsupported versions before mutation. */
export const API_VERSION_HEADER = "x-dpi-api-version" as const;

/** Public discovery metadata; contains no host paths, credentials or session data. */
export interface ProtocolInfo {
  apiVersion: number;
  capabilities: readonly string[];
}

export type DeviceKind = "local" | "ssh" | "exe-dev" | "url";
export type DeviceStatus =
  | "checking"
  | "online"
  | "offline"
  | "unauthorized"
  | "mismatch"
  | "incompatible";
export type ErrorCode =
  | "unauthorized"
  | "not_found"
  | "invalid"
  | "busy"
  | "conflict"
  | "ambiguous"
  | "unavailable"
  | "internal"
  | "offline";
export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
export const THINKING_LEVELS: readonly ThinkingLevel[] = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
];
export type WhenBusy = "followUp" | "steer" | "reject";

/** Existing session reload receipt. Counts describe the published inventory, not revision IDs. */
export interface ReloadResult {
  sessionId: string;
  models: number;
  extensions: number;
  /** Publication succeeded, but retiring the previous resources failed. No rollback is implied. */
  cleanup?: 'failed';
}

export interface ApiErrorBody {
  error: { code: ErrorCode; message: string };
}

// ---------------------------------------------------------------- device

export interface ModelInfo {
  id: string;
  provider: string;
  name: string;
  tier: string;
  icon: string;
  contextWindow: number;
  reasoning: boolean;
  /** Authoritative native model levels; optional only for older v1 hosts. */
  supportedThinkingLevels?: readonly ThinkingLevel[];
  /** Discovery metadata only; actual session authorization is checked before use. */
  available?: boolean;
  cost: { input: number; output: number };
}

export interface NativeParentTarget {
  key: string;
  conversationId: number;
  executionId?: string;
  requestId?: string;
}
export type NativeParentCommand = { controlId: string; expectedRevision: string } & (
  | { action: 'spawn'; name: string; task: string; tools?: string[] }
  | { action: 'send'; target: NativeParentTarget; task: string; followUp?: boolean }
  | { action: 'stop'; target: NativeParentTarget; scope: 'child-tree' }
  | { action: 'reply'; target: NativeParentTarget; replyTo: string; message: string }
);
export interface NativeBbBinding {
  providerId: string;
  sessionId: string;
  conversationId: number;
  bbThreadId: string;
  parentThreadId?: string;
}
export type NativeBbOutcome =
  | { status: 'unknown'; reason: string }
  | { status: 'working'; reason: string; entries?: readonly WireEntry[]; inputs?: readonly { entryId: string; requestId: string }[]; agent?: { model: string; thinkingLevel: string } }
  | { status: 'completed' | 'failed' | 'interrupted'; conversationId: number; parentConversationId: number; anchorTaskId: number;
      requestId: string; submissionId: number; entries: readonly WireEntry[]; inputs?: readonly { entryId: string; requestId: string }[];
      agent?: { model: string; thinkingLevel: string }; answer?: number };
export type NativeBbBindingCommand = { kind: 'root' } | { kind: 'child'; target: Required<NativeParentTarget> };
export interface NativeParentState { parentId: number; revision: string }
export interface NativeParentReceipt {
  version: 'native-parent-control/v1';
  controlId: string;
  action: 'spawn' | 'send' | 'stop' | 'reply';
  parentId: number;
  conversationId?: number;
  childKey?: string;
  executionId?: string;
  requestId?: string;
  priorExecutionId?: string;
  retryContext?: { expectedRevision: string; target: Required<NativeParentTarget> };
  replyTo?: string;
  admitted?: boolean;
  scope?: 'child-tree';
  stopped?: boolean;
}

export interface SkillInfo {
  name: string;
  description: string;
  filePath: string;
  baseDir: string;
  disableModelInvocation: boolean;
}
export interface SkillBody extends SkillInfo {
  content: string;
}

export interface DeviceInfo {
  uid: string;
  name: string;
  hostname: string;
  platform: string;
  apiVersion: typeof API_VERSION;
  durableVersion: string;
  startedAt: number;
  /** Where new sessions start: the directory browser opens here, relative cwds resolve against the first. */
  startDirs: string[];
  models: ModelInfo[];
  defaultModel: string;
  /** Exact configured default; disambiguates identical IDs in different providers. */
  defaultModelRef?: { provider: string; modelId: string };
  storage: { dataDir: string; catalogPath: string; appStatePath: string };
  /** The checkout the backend runs from (repo root locally, `code_dir` on deployed devices). */
  codeDir?: string;
  capabilities: string[];
  /** Durable jobs any agent on this device can run (`POST .../demo/jobs` or the run_durable_job tool). */
  jobs?: JobDef[];
}

export interface DirListing {
  path: string;
  parent?: string;
  dirs: { name: string; path: string }[];
}

// ---------------------------------------------------------------- sessions and agents

export type AgentKind = "root" | "fork" | "subagent";

/** An agent is a pi-durable conversation; `id` is the conversation id. */
export interface AgentRef {
  id: number;
  name: string;
  /** True when `name` was set by a person rather than derived from the id. */
  named: boolean;
  kind: AgentKind;
  parentId?: number;
  forkedAt?: number;
  ownerAgentId?: number;
  ownerTaskId?: number;
}

export interface AgentStatus {
  busy: boolean;
  background: number;
}

export type AgentSummary = AgentRef & AgentStatus;

export interface SessionSummary {
  id: string;
  name: string;
  cwd: string;
  model: string;
  createdAt: number;
  dbPath: string;
  busy: boolean;
  /** Runtime availability; absent on older v1 hosts. Never grants permission to mutate. */
  readiness?: "restoring" | "ready" | "failed";
  error?: string;
  agents: AgentSummary[];
  /** Automatic compaction thresholds, shared by every agent of the session. */
  compaction?: CompactionSettings;
}

/**
 * pi-durable's compaction policy. Above `contextWindow - reserveTokens` the next request waits for a summary;
 * `backgroundTokens` below that, a summary starts in the background (0 disables it).
 */
export interface CompactionSettings {
  enabled: boolean;
  reserveTokens: number;
  backgroundTokens: number;
  keepRecentTokens: number;
}

export const DEFAULT_COMPACTION: CompactionSettings = {
  enabled: true,
  reserveTokens: 16384,
  backgroundTokens: 32768,
  keepRecentTokens: 2000,
};

/** The playground's default marker positions: a summary starts in the background at 200k tokens, and the next
 * request waits for it at 250k. */
export const DEFAULT_COMPACTION_AT = { auto: 200_000, wait: 250_000 };

/** Default thresholds for a model window: the positions above, or pi-durable's own margins when the window is smaller. */
export function defaultCompaction(window: number): CompactionSettings {
  if (!(window > 0)) return { ...DEFAULT_COMPACTION };
  const wait = Math.min(DEFAULT_COMPACTION_AT.wait, window - DEFAULT_COMPACTION.reserveTokens);
  const auto = Math.min(DEFAULT_COMPACTION_AT.auto, wait - DEFAULT_COMPACTION.backgroundTokens);
  return { ...DEFAULT_COMPACTION, reserveTokens: window - wait, backgroundTokens: wait - auto };
}

/** False when the thresholds leave a model with this window under 32k tokens before every request waits for a summary. */
export const compactionFits = (window: number, s: CompactionSettings) => window - s.reserveTokens >= 32_768;

/** Context sizes where compaction starts for a model window: `auto` in the background, `wait` blocking. */
export function compactionThresholds(window: number, s: CompactionSettings) {
  const wait = Math.max(0, window - s.reserveTokens);
  return { wait, auto: s.backgroundTokens > 0 ? Math.max(0, wait - s.backgroundTokens) : undefined };
}

export interface DeviceTree {
  uid: string;
  name: string;
  sessions: SessionSummary[];
  at: number;
}

export interface AgentConfig {
  model?: { provider: string; modelId: string };
  thinkingLevel?: ThinkingLevel;
  instructions?: string;
  cwd?: string;
  /** Offer only tools that read: tools that create, update or delete leave the agent's requests. */
  readOnly?: boolean;
}

/** A custom harness extension an agent can turn on or off: `GET / PATCH .../agents/:a/extensions`. */
export interface HarnessExtensionInfo {
  name: string;
  title: string;
  description: string;
  enabled: boolean;
  /** For system-prompts: the built-in prompts and which ones this agent renders. */
  prompts?: { id: string; title: string; description: string; enabled: boolean; text: string }[];
}

export interface AgentExtensions {
  extensions: HarnessExtensionInfo[];
  /** Extensions every agent runs, which cannot be turned off here. */
  builtIn: string[];
}

export interface AgentDetail extends AgentSummary {
  sessionId: string;
  /** Only these profile-owned kinds may be requested from docs/events. */
  documentKinds?: readonly string[];
  config: AgentConfig;
  /**
   * Every tool of the agent's extensions. `parameters` is its JSON Schema, as the model sees it; `writes` marks tools
   * that create, update or delete; `offered` is false for tools the agent's tool filter removes (read only).
   */
  tools: {
    name: string;
    description: string;
    replay: "safe" | "unsafe";
    parameters?: unknown;
    writes: boolean;
    offered: boolean;
  }[];
  extensions: string[];
}

export interface RuntimeRefreshResult {
  sessionId: string;
  refreshed: true;
}

export interface CreateSessionBody {
  name: string;
  cwd: string;
  model: { provider: string; modelId: string };
  thinkingLevel?: ThinkingLevel;
}

export interface CreateAgentBody {
  from?: number | string;
  name?: string;
}

export interface SendMessageBody {
  content: string;
  whenBusy?: WhenBusy;
  requestId: string;
  waitMs?: number;
}

export type SendResult =
  | { submissionId: number; status: "queued" | "pending" }
  | { submissionId: number; status: "done"; answer: { entryId: number; text: string } }
  | { submissionId: number; status: "unanswered"; reason: string };

/** Actor-scoped lookup of the original submission. HTTP absence/timeout is not proof of non-admission. */
export type MessageReceiptResult =
  | { submissionId: number; status: Exclude<SendResult["status"], "unanswered"> }
  | Extract<SendResult, { status: "unanswered" }>;

/** accepted:false is issued only after atomic reconciliation has retired this actor/request key. */
export type MessageReconciliationResult = { conversationId: number; requestId: string } & (
  | ({ accepted: true } & MessageReceiptResult)
  | { accepted: false }
);

export interface GoalOperatorReceipt {
  /** Canonical native request key, not a credential. */
  requestId: string;
  conversationId: number;
  taskId: number;
  status: "queued" | "started" | "done" | "failed" | "uncertain";
  text?: string;
  error?: string;
}

export interface ForkBody {
  entryId: number;
  name?: string;
}

export interface Page<T> {
  items: T[];
  next?: string;
}

// ---------------------------------------------------------------- tasks and usage

export interface TaskNode {
  id: number;
  kind: string;
  conversationId: number;
  owner?: number;
  background: boolean;
  aborting?: boolean;
  state: { status: string; phase?: string; on?: number[]; policy?: string };
  conversations: number[];
  /** What the task is: the tool name of a `pi.tool` task, or the job title of a durable job. */
  label?: string;
  /** For `pi.tool` tasks: the tool call id in the transcript. */
  callId?: string;
}

export interface TaskOutcome {
  id: number;
  kind: string;
  conversationId?: number;
  state: {
    status: string;
    outcome?: { status: string; result?: unknown; error?: { message: string } };
  };
}

// ---------------------------------------------------------------- pi-ai / pi-durable JSON shapes

export interface WireText {
  type: "text";
  text: string;
}
export interface WireThinking {
  type: "thinking";
  thinking: string;
  redacted?: boolean;
}
export interface WireToolCall {
  type: "toolCall";
  id: string;
  name: string;
  arguments: unknown;
}
export interface WireImage {
  type: "image";
  data: string;
  mimeType: string;
}
export type WireAssistantBlock = WireText | WireThinking | WireToolCall;

export interface WireUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  cost: { input: number; output: number; cacheRead: number; cacheWrite: number; total: number };
}

export interface WireUserMessage {
  role: "user";
  content: string | readonly (WireText | WireImage)[];
  timestamp?: number;
}
export interface WireAssistantMessage {
  role: "assistant";
  content: readonly WireAssistantBlock[];
  provider: string;
  model: string;
  usage: WireUsage;
  stopReason: string;
  errorMessage?: string;
  timestamp?: number;
}
export interface WireToolResultMessage {
  role: "toolResult";
  toolCallId: string;
  toolName: string;
  content: readonly (WireText | WireImage)[];
  isError: boolean;
  details?: unknown;
  timestamp?: number;
}
export interface WireOtherMessage {
  role: string;
}
export type WireMessage =
  | WireUserMessage
  | WireAssistantMessage
  | WireToolResultMessage
  | WireOtherMessage;

export interface WireEntry {
  id: number;
  conversationId: number;
  kind: string;
  model?: readonly WireMessage[];
  data?: unknown;
  head?: number;
  byTaskId?: number;
}

export interface WireToolSlot {
  callId: string;
  name: string;
  taskId?: number;
  status: "pending" | "running" | "done";
  output?: string;
  droppedBytes?: number;
  droppedLines?: number;
  details?: unknown;
  entry?: number;
}

export interface WireCompaction {
  taskId: number;
  reason: string;
  blocking: boolean;
  attempt: number;
  retry?: { at: number; error: string };
}

export interface WireAgentState {
  model?: { provider: string; modelId: string };
  thinkingLevel?: string;
  extensions?: unknown;
  tools?: unknown;
  instructions?: string;
  cwd?: string;
}

export interface WireUsageState {
  models: Readonly<Record<string, WireUsage>>;
  tools: Readonly<Record<string, WireUsage>>;
}

/** Non-secret session Mail binding exposed by the optional `host.agent-mail` document (null when unconfigured). */
export interface AgentMailIdentity {
  name: string;
  project: string;
}

/** A queued submission with its content, read from the conversation's `pi.inbox` document. */
export interface InboxItem {
  id: number;
  mode: "steer" | "followUp" | "write";
  content?: string;
}

// ---------------------------------------------------------------- application-owned agent observation

export const AGENT_STATE_CAPABILITY = "agent-state.v1" as const;
/** Per-frame public history window. Older history is fetched with entries({scope:"all",cursor}). */
export const AGENT_HISTORY_LIMIT = 100;

export interface AgentScope {
  sessionId: string;
  conversationId: number;
}

export interface AgentHistoryPage {
  /** Committed history, ascending native entry ID; reset/compaction do not erase history. */
  items: readonly WireEntry[];
  /** Opaque cursor for the preceding history page; omitted only at the beginning of history. */
  next?: string;
}

/** Presentation of an unfinished response, not a native generation document. */
export interface AgentAssistantState {
  message: WireAssistantMessage | null;
  retry: { at: number; message: string } | null;
  pollAt: number | null;
}

export interface AgentPublicState {
  history: AgentHistoryPage;
  /** Model-active context IDs are independent of the history window and older history pages. */
  contextEntryIds: readonly number[];
  /** An answered submission can coexist with busy:true while native child work finishes. */
  execution: { busy: boolean; inputEntryIds: readonly number[] };
  assistant: AgentAssistantState | null;
  tools: readonly WireToolSlot[];
  compactions: readonly WireCompaction[];
  config: WireAgentState;
  usage: WireUsageState;
  inbox: readonly InboxItem[];
  /** Safe user-facing notices only; never provider errors or raw runFailure details. */
  notices: readonly string[];
}

/** Replace only named public sections. Null clears assistant; omission leaves a section unchanged.
 * No arbitrary paths, native deltas, document trees, or synthetic execution events are accepted.
 * A history replacement is a bounded window, not permission to discard separately paged history.
 */
export type AgentStateChanges = Partial<AgentPublicState>;

export type AgentStateFrame = AgentScope & { type: "agent.state"; revision: string; state: AgentPublicState };
export type AgentUpdateFrame = AgentScope & {
  type: "agent.update"; baseRevision: string; revision: string; changes: AgentStateChanges;
};
/** Application observation outcomes, not upstream WatchEnd. Revoked readers must not reconnect automatically. */
export type AgentEndFrame = AgentScope & {
  type: "agent.end"; reason: "closed" | "resync" | "revoked" | "unavailable";
};
export type AgentObservationFrame = AgentStateFrame | AgentUpdateFrame | AgentEndFrame;

// ---------------------------------------------------------------- stream frames

export interface StreamScope {
  kind: "device" | "session" | "agent";
  sessionId?: string;
  agentId?: number;
}

export interface Activity {
  type: "agent.started" | "agent.finished";
  sessionId: string;
  agentId: number;
  at: number;
  preview?: string;
}

export interface UsageTotals {
  models: Record<string, WireUsage>;
  tools: Record<string, WireUsage>;
}

/** The public view of a registry device (the token never leaves the hub or TUI process). */
export interface NetworkDevice {
  id: string;
  name: string;
  kind: DeviceKind;
  url: string;
  source: "config" | "ui";
  hasToken: boolean;
  status: DeviceStatus;
  error?: string;
  lastSeenAt?: number;
  info?: DeviceInfo;
  tree?: DeviceTree;
}

export type Frame =
  | { type: 'bb.outcome'; threadId: string; outcome: NativeBbOutcome }
  | { type: "hello"; apiVersion: typeof API_VERSION; serverTime: number; scope: StreamScope }
  | { type: "fault"; error: { code: ErrorCode; message: string } }
  // device scope
  | { type: "tree"; tree: DeviceTree }
  | { type: "activity"; items: Activity[] }
  // session scope
  | { type: "session"; agents: AgentSummary[]; tasks: TaskNode[]; usage: UsageTotals }
  | { type: "agents"; agents: AgentSummary[] }
  | { type: "tasks"; tasks: TaskNode[] }
  | { type: "usage"; usage: UsageTotals }
  // agent scope
  | AgentObservationFrame
  | { type: "inbox"; items: InboxItem[] }
  // any scope that asked for documents
  | { type: "doc"; kind: string; value: unknown; revision?: number }
  // hub mux only
  | { type: "network"; devices: NetworkDevice[] }
  | { type: "disconnected"; reason: string };

/** One frame of the hub's multiplexed browser stream. */
export interface MuxFrame {
  sub: string;
  frame: Frame | { type: "stream"; streamId: string };
}
