// Presentation models consume our public state contract, never native execution events.
import type {
  AgentEndFrame, AgentScope, AgentSummary, DeviceStatus, Frame, InboxItem, NetworkDevice,
  Page, SessionSummary, TaskNode, UsageTotals, WireAgentState, WireEntry, WireUsageState,
} from "./api.js";
import { AgentStateReducer } from "./observation.js";
import { toTranscript, type LiveTool, type TranscriptItem } from "./transcript.js";

type Listener = () => void;
class Emitter {
  private listeners = new Set<Listener>();
  subscribe(fn: Listener) { this.listeners.add(fn); return () => void this.listeners.delete(fn); }
  protected emit() { for (const fn of this.listeners) fn(); }
}

export interface AgentViewState {
  /** Visible history window plus explicitly loaded pages, not the model's active context. */
  items: TranscriptItem[];
  entries: WireEntry[];
  contextEntryIds: readonly number[];
  inputEntryIds: readonly number[];
  historyCursor?: string;
  running: boolean;
  generating: boolean;
  inbox: InboxItem[];
  agent: WireAgentState;
  usage: WireUsageState;
  retry?: { at: number; error: string };
  compactions: number[];
  notices: string[];
  docs: Record<string, unknown>;
  ready: boolean;
  needsResync: boolean;
  end?: AgentEndFrame["reason"];
}
const emptyAgentState = (): AgentViewState => ({
  items: [], entries: [], contextEntryIds: [], inputEntryIds: [], running: false, generating: false,
  inbox: [], agent: {}, usage: { models: {}, tools: {} }, compactions: [], notices: [], docs: {},
  ready: false, needsResync: false,
});

export class AgentModel extends Emitter {
  state: AgentViewState = emptyAgentState();
  observation?: AgentStateReducer;
  private readonly pages = new Map<number, WireEntry>();
  constructor(private readonly scope?: AgentScope) { super(); }

  apply(frame: Frame): boolean {
    if (frame.type === "agent.state" || frame.type === "agent.update" || frame.type === "agent.end") {
      this.observation ??= new AgentStateReducer(this.scope ?? { sessionId: frame.sessionId, conversationId: frame.conversationId });
      const result = this.observation.apply(frame);
      if (result === "ignored") return false;
      if (this.observation.end === "revoked") {
        this.pages.clear();
        this.state = emptyAgentState();
      }
      this.state.needsResync = this.observation.needsResync;
      this.state.end = this.observation.end;
      this.rebuild();
    } else if (frame.type === "inbox") {
      if (this.state.end === "revoked") return false;
      this.state.inbox = frame.items;
    } else if (frame.type === "doc") {
      if (this.state.end === "revoked") return false;
      this.state.docs = { ...this.state.docs, [frame.kind]: frame.value };
    } else return false;
    this.emit();
    return true;
  }

  private rebuild() {
    const current = this.observation?.state;
    const entries = new Map(this.pages);
    if (current) for (const entry of current.history.items) entries.set(entry.id, entry);
    this.state.entries = [...entries.values()].sort((a, b) => a.id - b.id);
    if (current) {
      this.state.contextEntryIds = current.contextEntryIds;
      this.state.inputEntryIds = current.execution.inputEntryIds;
      this.state.historyCursor = current.history.next;
      this.state.running = current.execution.busy;
      this.state.generating = current.assistant?.message != null;
      this.state.inbox = [...current.inbox];
      this.state.agent = current.config;
      this.state.usage = current.usage;
      this.state.retry = current.assistant?.retry ? { at: current.assistant.retry.at, error: current.assistant.retry.message } : undefined;
      this.state.compactions = current.compactions.map(item => item.taskId);
      this.state.notices = [...current.notices];
    }
    this.state.ready = !!current && !this.state.needsResync && !this.state.end;
    const tools = new Map<string, LiveTool>((current?.tools ?? []).map(slot => [slot.callId, {
      name: slot.name, status: slot.status, output: slot.output ?? "",
    }]));
    this.state.items = toTranscript(this.state.entries, current?.assistant?.message ?? undefined, tools);
  }

  /** Retain an explicitly fetched history page across reset, compaction and full resync. */
  addHistoryPage(page: Page<WireEntry>) {
    if (this.state.end === "revoked") return;
    for (const entry of page.items) {
      if (this.scope && entry.conversationId !== this.scope.conversationId) continue;
      this.pages.set(entry.id, structuredClone(entry));
    }
    this.rebuild();
    this.emit();
  }
  touch() { this.emit(); }
  clear() {
    this.observation = undefined;
    this.pages.clear();
    this.state = emptyAgentState();
    this.emit();
  }
}

// ---------------------------------------------------------------- session
export interface SessionViewState { agents: AgentSummary[]; tasks: TaskNode[]; usage: UsageTotals; ready: boolean; }
export function agentLabel(agent: Pick<AgentSummary, "id" | "name">) { return agent.name; }
export class SessionModel extends Emitter {
  state: SessionViewState = { agents: [], tasks: [], usage: { models: {}, tools: {} }, ready: false };
  apply(frame: Frame): boolean {
    if (frame.type === "session") this.state = { agents: frame.agents, tasks: frame.tasks, usage: frame.usage, ready: true };
    else if (frame.type === "agents") this.state = { ...this.state, agents: frame.agents };
    else if (frame.type === "tasks") this.state = { ...this.state, tasks: frame.tasks };
    else if (frame.type === "usage") this.state = { ...this.state, usage: frame.usage };
    else return false;
    this.emit(); return true;
  }
  clear() { this.state = { agents: [], tasks: [], usage: { models: {}, tools: {} }, ready: false }; this.emit(); }
  agent(id: number) { return this.state.agents.find(a => a.id === id); }
  lineage(id: number): AgentSummary[] { return lineage(this.state.agents, id); }
  foregroundBusy(agentId: number) { return this.state.tasks.some(t => !t.background && t.conversationId === agentId); }
  backgroundTasks(agentId?: number) { return this.state.tasks.filter(t => t.background && (agentId === undefined || t.conversationId === agentId)); }
}
export function lineage(agents: readonly AgentSummary[], id: number): AgentSummary[] {
  const byId = new Map(agents.map(a => [a.id, a]));
  const out: AgentSummary[] = [], seen = new Set<number>();
  let current: number | undefined = id;
  while (current !== undefined && !seen.has(current)) {
    seen.add(current);
    const agent = byId.get(current);
    if (!agent) break;
    out.unshift(agent); current = agent.parentId;
  }
  return out;
}

// ---------------------------------------------------------------- network tree
export type TreeNode =
  | { type: "device"; key: string; device: NetworkDevice; status: DeviceStatus; stale: boolean; children: TreeNode[] }
  | { type: "session"; key: string; deviceId: string; session: SessionSummary; stale: boolean; children: TreeNode[] }
  | { type: "agent"; key: string; deviceId: string; sessionId: string; agent: AgentSummary; stale: boolean; children: TreeNode[] };
export const deviceKey = (deviceId: string) => deviceId;
export const sessionKey = (deviceId: string, sessionId: string) => `${deviceId}/s/${sessionId}`;
export const agentKey = (deviceId: string, sessionId: string, agentId: number) => `${deviceId}/s/${sessionId}/a/${agentId}`;
export function agentTree(deviceId: string, session: SessionSummary, stale: boolean): TreeNode[] {
  const nodes = new Map<number, Extract<TreeNode, { type: "agent" }>>();
  for (const agent of session.agents) nodes.set(agent.id, {
    type: "agent", key: agentKey(deviceId, session.id, agent.id), deviceId, sessionId: session.id, agent, stale, children: [],
  });
  const roots: TreeNode[] = [];
  for (const node of nodes.values()) {
    const parent = nodes.get(node.agent.parentId ?? node.agent.ownerAgentId ?? -1);
    if (parent && parent !== node) parent.children.push(node); else roots.push(node);
  }
  return roots;
}
export function networkTree(devices: readonly NetworkDevice[]): TreeNode[] {
  return devices.map(device => {
    const stale = device.status !== "online";
    return { type: "device", key: deviceKey(device.id), device, status: device.status, stale,
      children: (device.tree?.sessions ?? []).map(session => ({
        type: "session" as const, key: sessionKey(device.id, session.id), deviceId: device.id,
        session, stale, children: agentTree(device.id, session, stale),
      })),
    };
  });
}
export class NetworkModel extends Emitter {
  devices: NetworkDevice[] = [];
  apply(frame: Frame): boolean { if (frame.type !== "network") return false; this.devices = frame.devices; this.emit(); return true; }
  device(id: string) { return this.devices.find(d => d.id === id); }
  tree() { return networkTree(this.devices); }
}
