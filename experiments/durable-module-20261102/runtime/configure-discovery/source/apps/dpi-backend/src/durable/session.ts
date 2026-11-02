import type {
  API_VERSION,
  AgentConfig,
  AgentSummary,
  AgentObservationFrame,
  CreateSessionBody,
  Frame,
  MessageReceiptResult,
  MessageReconciliationResult,
  NativeParentCommand,
  NativeParentReceipt,
  NativeParentState,
  NativeParentTarget,
  Page,
  ReloadResult,
  SendMessageBody,
  SendResult,
  TaskNode,
  WireEntry,
} from "../../../dpi-sdk/src/api.js";

export type SessionAction =
  | "send" | "receipt" | "reconcile" | "submission" | "interrupt"
  | "history" | "context" | "observe" | "configure" | "reload" | "agents" | "tasks"
  | "parentState" | "parentCommand" | "parentReceipt" | "reconcileParent";

export interface SessionAccess {
  readonly actor: string;
  readonly source: string;
  readonly authority: string;
  readonly policyReference?: string;
  readonly signal?: AbortSignal;
  readonly client: {
    readonly apiVersion: typeof API_VERSION;
    readonly capabilities: readonly string[];
  };
  assertCurrent(action: SessionAction, target: { readonly sessionId: string; readonly conversationId?: number }): void;
}

export interface HistoryQuery {
  readonly cursor?: string;
  readonly limit?: number;
}

export interface ContextSelection {
  readonly entryIds: readonly number[];
}

export interface ObservationQuery {
  readonly documents?: readonly string[];
}

export type SessionObservationFrame = AgentObservationFrame | Extract<Frame, { type: "doc" }>;

export interface SessionObservation {
  readonly frames: AsyncIterable<SessionObservationFrame>;
  close(): Promise<void>;
}

export interface DurableSession {
  readonly sessionId: string;
  readonly rootConversationId: number;

  /** Native identity and liveness only. Store applies its catalog-owned custom names. */
  agents(access: SessionAccess): Promise<AgentSummary[]>;
  liveTasks(access: SessionAccess): Promise<TaskNode[]>;
  send(access: SessionAccess, conversationId: number, body: SendMessageBody): Promise<SendResult>;
  receipt(access: SessionAccess, conversationId: number, requestId: string): Promise<MessageReceiptResult>;
  reconcile(access: SessionAccess, conversationId: number, requestId: string): Promise<MessageReconciliationResult>;
  submission(access: SessionAccess, submissionId: number, waitMs: number): Promise<SendResult>;
  interrupt(access: SessionAccess, conversationId: number, background: boolean): Promise<{ ok: true }>;
  history(access: SessionAccess, conversationId: number, query: HistoryQuery): Promise<Page<WireEntry>>;
  context(access: SessionAccess, conversationId: number): Promise<ContextSelection>;
  observe(access: SessionAccess, conversationId: number, query: ObservationQuery): Promise<SessionObservation>;
  configure(access: SessionAccess, conversationId: number, patch: Partial<AgentConfig>): Promise<AgentConfig>;
  reload(access: SessionAccess): Promise<ReloadResult>;

  parentState(access: SessionAccess, parentId: number, target?: Required<NativeParentTarget>): Promise<NativeParentState>;
  parentCommand(access: SessionAccess, parentId: number, command: NativeParentCommand): Promise<NativeParentReceipt>;
  parentReceipt(access: SessionAccess, parentId: number, controlId: string): Promise<NativeParentReceipt | null>;
  reconcileParent(access: SessionAccess, parentId: number): Promise<{ reconciled: true }>;

  close(): Promise<void>;
}

export type SessionOpenRequest = {
  readonly sessionId: string;
  readonly directory: string;
} & (
  | { readonly mode: "create"; readonly initial: Pick<CreateSessionBody, "cwd" | "model" | "thinkingLevel"> }
  | { readonly mode: "resume" }
);

export type OpenDurableSession = (request: SessionOpenRequest) => Promise<DurableSession>;
