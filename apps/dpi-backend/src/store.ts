import { SharedState } from "./shared-state.js";
import { reloadDurable, isDurableReloading, DurableReloadError } from '@local/pi-durable-reload';
import { initializeCatalog } from "./catalog.js";
import type { StateChange } from "../../dpi-sdk/src/app-state.js";
import type {
  AgentDetail,
  AgentExtensions,
  AgentRef,
  AgentSummary,
  CreateSessionBody,
  DeviceInfo,
  DeviceTree,
  DirListing,
  InboxItem,
  ModelInfo,
  Page,
  SendResult,
  SessionSummary,
  TaskNode,
  TaskOutcome,
  ThinkingLevel,
  UsageTotals,
  WhenBusy,
  WireEntry,
  SkillInfo,
  SkillBody,
} from "../../dpi-sdk/src/api.js";
import {
  compactionFits,
  DEFAULT_COMPACTION,
  defaultCompaction,
  THINKING_LEVELS,
  type CompactionSettings,
} from "../../dpi-sdk/src/api.js";
import { lastAssistantText, messageText, toMarkdown, toTranscript } from "../../dpi-sdk/src/transcript.js";
import { GrantDenied } from "./grants.js";
import { ApiFault, invalid, notFound, publicErrorMessage, reportError } from "./errors.js";
import { DatabaseSync } from "node:sqlite";
import { mkdir, readdir, realpath, rename as renamePath, stat } from "node:fs/promises";
import { mkdirSync, writeFileSync, readFileSync, realpathSync, lstatSync, unlinkSync } from "node:fs";
import { join, dirname, basename, resolve, relative, isAbsolute, sep } from "node:path";
import { homedir, hostname, platform } from "node:os";
import { randomUUID } from "node:crypto";
import { BACKGROUND_CONTEXT as ctx, withAbortSignal } from "@earendil-works/chord/context";
import { createModels, getSupportedThinkingLevels, clampThinkingLevel } from "@earendil-works/pi-ai/models";
import { openrouterProvider } from "@earendil-works/pi-ai/providers/openrouter";
import { curatedModels, defaultModelId } from "./model-catalog.js";
import { fauxModels, installFaux } from "./faux.js";
import {
  Harness,
  InboxDoc,
  configure as configureNative,
  defineDocFamily,
  type Conversation,
  type ConversationId,
  type ConversationRecord,
  type EntryId,
  type TaskId,
  type SubmissionId,
  type ModelRef,
  type ToolRegistration,
  type Storage,
  type Tx,
} from "@earendil-works/pi-durable";
import { SessionExecutionEnv, baseShellEnv } from "./session-env.js";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
import { Workspace, type SpawnSession } from "./extensions.js";
import { JobRuns, JOB_DEFS, jobDef, resolveJobInput } from "./jobs.js";
import { ADDON_INFO, PROMPTS, PromptChecklist } from "./addons.js";
import { playgroundProfile, type RuntimeComposition, type RuntimeModels, type RuntimeProfileFactory } from "./runtime-profile.js";
import { publicProjection, publicTaskState, publicInspection } from "./public-projection.js";
import type { Authorization } from './auth.js';
import { selectChildTools, validateParentCommand, validateParentTarget, ownedChild, type ParentCommand } from './native-profile/subagents/parent-control.js';
import { bindExistingInput } from './native-profile/admission/input-policy.js';
import { BindingDoc, createDurableBindingReader, putDurableBinding, type DurableBinding } from './native-profile/bb-binding/binding-store.js';
import { ChildBindingDoc, TeamDoc } from './native-profile/subagents/supervisor.js';
import type { NativeBbBindingCommand } from '../../dpi-sdk/src/api.js';
import { readCoherentOutcome } from './native-profile/outcome/coherent.js';
import { readOutcomeHistory } from './native-profile/outcome/history.js';
import { record as iiiRecord, requestKey as iiiRequestKey, type Json as IiiJson, type Input as IiiInput } from './native-profile/iii/domain.js';
import { CONTROL_OPERATIONS, type ControlOperation as IiiControlOperation } from './native-profile/iii/control-domain.js';
import { JOB_RUNS_DOC } from "../../dpi-sdk/src/jobs.js";
import { fingerprint, nativeRequestKey, requestKey, type AdmissionIdentity } from "./idempotency.js";
export type { AdmissionIdentity } from "./idempotency.js";

export const DURABLE_VERSION = "1.4.0";

/** Metadata boundary: never serialize the native resource sourceInfo or a body. */
function skillInfo(skill: SkillInfo): SkillInfo {
  const { name, description, filePath, baseDir, disableModelInvocation } = skill;
  return { name, description, filePath, baseDir, disableModelInvocation };
}

/** Tools that create, update or delete: shell, files, App State, job runs, sessions, pages and subagents. */
export const WRITE_TOOLS = new Set([
  "bash",
  "write",
  "edit",
  "update_state",
  "run_durable_job",
  "ping_on_call_engineer",
  "subagent",
  "start_session",
]);

export type SessionRow = {
  id: string;
  name: string;
  cwd: string;
  dbPath: string;
  createdAt: number;
  model: string;
  provider: string;
};

export interface StoreOptions {
  dataDir: string;
  startDirs: string[];
  name: string;
  provider: "openrouter" | "faux";
  profile?: RuntimeProfileFactory;
}

/** Agent documents a client may read or stream, by kind. */
/** apps/dpi-backend/src → the checkout root. */
const CODE_DIR = resolve(import.meta.dirname, "../../..");
const AGENT_DOCS = { [JOB_RUNS_DOC]: JobRuns, "demo.workspace": Workspace } as const;
export const AGENT_DOC_KINDS = Object.keys(AGENT_DOCS);
export const DEVICE_DOC_KINDS = ["app.shared-state"];

/** Lock and open the same physical SQLite path, including existing file symlinks. */
function databasePath(path: string): string {
  try { return realpathSync(path); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT" || lstatSync(path, { throwIfNoEntry: false })?.isSymbolicLink()) throw error;
    return join(databasePath(dirname(path)), basename(path));
  }
}

export function lockFile(path: string) {
  mkdirSync(dirname(path), { recursive: true });
  const take = () => writeFileSync(path, String(process.pid), { flag: "wx", mode: 0o600 });
  try {
    take();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
    const pid = Number(readFileSync(path, "utf8"));
    let alive = false;
    try {
      process.kill(pid, 0);
      alive = true;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ESRCH") alive = true;
    }
    if (alive) throw Error(`Database already owned by process ${pid}: ${path}`);
    unlinkSync(path);
    take();
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    try {
      if (readFileSync(path, "utf8") === String(process.pid)) unlinkSync(path);
    } catch {}
  };
}

type Opened = { harness: Harness; storage: Storage; profile: RuntimeComposition; models?: RuntimeModels; unlock: () => void; unsubscribe: () => void };
type Resolved = { row: SessionRow; h: Harness; c: Conversation };

const MessageReceipts = defineDocFamily<{ fingerprint: string }, null>({
  kind: "host.message-receipts", version: 1, scope: "conversation", family: true,
  history: "latest", fork: "initial", checkpointWhen: () => true,
  initial: () => ({ fingerprint: "" }),
});
const CreationReceipts = defineDocFamily<{ fingerprint: string; conversationId: number }, null>({
  kind: "host.creation-receipts", version: 1, scope: "session", family: true,
  checkpointWhen: () => true, initial: () => ({ fingerprint: "", conversationId: 0 }),
});

type SessionIntent = { actor: string; key: string; fingerprint: string; resourceId: string; state: "intent" | "done" | "gone" };

const encodeCursor = (cursor: unknown) =>
  cursor === undefined ? undefined : Buffer.from(JSON.stringify(cursor)).toString("base64url");
const decodeCursor = (cursor?: string) => {
  if (!cursor) return undefined;
  try {
    return JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
  } catch {
    throw invalid("Invalid cursor");
  }
};

export class Store {
  readonly models = createModels();
  readonly opened = new Map<string, Opened>();
  readonly errors = new Map<string, string>();
  readonly catalog: DatabaseSync;
  readonly startedAt = Date.now();
  shared!: SharedState;
  uid!: string;
  modelList: ModelInfo[] = [];
  private readonly directory: string;
  private unlockCatalog: () => void;
  private unlockShared?: () => void;
  private listeners = new Set<() => void>();
  /** Saved thresholds per session; null when the session uses the defaults for its model. */
  private compactions = new Map<string, Partial<CompactionSettings> | null>();
  /** Task labels never change once known: tool names of pi.tool tasks, job titles of job runs. */
  private taskLabels = new Map<string, { label?: string; callId?: string }>();
  private sessionCreates = new Map<string, Promise<SessionSummary>>();

  get catalogPath() {
    return join(this.options.dataDir, "catalog.sqlite");
  }
  get sharedStatePath() {
    return join(this.directory, "app-state.sqlite");
  }
  get sessionsDir() {
    return join(this.directory, "sessions");
  }
  get archiveDir() {
    return join(this.directory, "archive");
  }
  get name() {
    return this.options.name;
  }
  get startDirs() {
    return this.options.startDirs;
  }

  private constructor(readonly options: StoreOptions) {
    if (!options.profile?.models && options.provider === "faux") installFaux(this.models);
    else if (!options.profile?.models) {
      const provider = openrouterProvider();
      const catalog = provider.getModels();
      for (const model of curatedModels)
        if (!catalog.some((m) => m.id === model.id)) throw Error(`OpenRouter catalog missing ${model.id}`);
      this.models.setProvider({
        ...provider,
        getModels: () => catalog.filter((m) => curatedModels.some((c) => c.id === m.id)),
      });
    }
    mkdirSync(options.dataDir, { recursive: true, mode: 0o700 });
    const catalogPath = databasePath(this.catalogPath);
    this.directory = dirname(catalogPath);
    this.unlockCatalog = lockFile(`${catalogPath}.lock`);
    let catalog: DatabaseSync | undefined;
    try {
      this.catalog = catalog = new DatabaseSync(catalogPath);
      initializeCatalog(this.catalog);
      const uid = this.catalog.prepare("SELECT value FROM meta WHERE key='device_uid'").get() as
        | { value: string }
        | undefined;
      this.uid = uid?.value ?? randomUUID();
      if (!uid) this.catalog.prepare("INSERT INTO meta(key,value) VALUES('device_uid',?)").run(this.uid);
      this.catalog.prepare("DELETE FROM requests WHERE createdAt < ?").run(Date.now() - 24 * 3600_000);
    } catch (error) {
      catalog?.close();
      this.unlockCatalog();
      throw error;
    }
  }

  static async open(options: StoreOptions) {
    const store = new Store({ ...options, dataDir: resolve(options.dataDir) });
    // Start dirs are where new sessions begin; create any that do not exist yet.
    await Promise.all(options.startDirs.map((dir) => mkdir(dir, { recursive: true }).catch(() => {})));
    try {
      const sharedStatePath = databasePath(store.sharedStatePath);
      store.unlockShared = lockFile(`${sharedStatePath}.lock`);
      store.shared = await SharedState.open(sharedStatePath);
      store.shared.harness.subscribeCommits(() => store.notify());
      for (const row of store.list()) {
        try {
          await store.openAgent(row);
        } catch (e) {
          store.errors.set(row.id, publicErrorMessage(e));
          reportError(e, "session.restore");
        }
      }
      if (!(await store.shared.initialized()))
        await store.shared.initialize({ goal: "Explore durable agents", counter: 0, notes: [] });
      store.modelList = await store.loadModels();
      for (const { harness } of store.opened.values()) harness.resume();
      return store;
    } catch (e) {
      await store.close().catch(() => {});
      throw e;
    }
  }

  // ------------------------------------------------------------ change feed

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  }
  notify = () => {
    for (const fn of this.listeners) fn();
  };

  // ------------------------------------------------------------ device

  deviceInfo(): DeviceInfo {
    const playground = !this.options.profile || this.options.profile === playgroundProfile;
    return {
      uid: this.uid,
      name: this.name,
      hostname: hostname(),
      platform: `${platform()}-${process.arch} node ${process.version}`,
      apiVersion: 1,
      durableVersion: DURABLE_VERSION,
      startedAt: this.startedAt,
      startDirs: this.startDirs,
      models: this.modelList,
      defaultModel: this.defaultModel(),
      ...(this.options.profile?.models ? { defaultModelRef: {
        provider: this.options.profile.models.defaultModel.provider,
        modelId: this.options.profile.models.defaultModel.modelId,
      } } : {}),
      storage: { dataDir: this.options.dataDir, catalogPath: this.catalogPath, appStatePath: this.sharedStatePath },
      codeDir: CODE_DIR,
      capabilities: [...this.protocolInfo().capabilities, ...(playground ? ["demo", "jobs"] : [])],
      jobs: playground ? JOB_DEFS : [],
    };
  }

  protocolInfo() {
    return { apiVersion: 1, capabilities: ["events", "docs", "runtime-refresh.v1", ...(this.options.profile?.capabilities ?? []), ...(this.options.profile?.models ? ['scoped-models.v1', 'agent-models.v1'] : [])] };
  }

  private defaultModel() {
    return this.options.profile?.models?.defaultModel.modelId ?? (this.options.provider === "faux" ? fauxModels[0].id : defaultModelId);
  }

  private async loadModels(scoped?: Pick<RuntimeModels, 'catalogue'>): Promise<ModelInfo[]> {
    const native = scoped ?? this.options.profile?.models;
    if (native) return (await native.catalogue({ signal: AbortSignal.timeout(10000) })).map(model => ({
      id: model.id, provider: model.provider, name: model.name, tier: 'native', icon: '',
      contextWindow: model.contextWindow, reasoning: model.reasoning,
      supportedThinkingLevels: model.supportedThinkingLevels, available: model.available,
      cost: { input: model.cost.input, output: model.cost.output },
    }));
    if (this.options.provider === "faux")
      return fauxModels.map((m) => ({
        id: m.id,
        provider: "faux",
        name: m.name,
        tier: "T",
        icon: "lab.png",
        contextWindow: 128000,
        reasoning: false,
        supportedThinkingLevels: getSupportedThinkingLevels(this.models.getModel("faux", m.id)!),
        cost: { input: 0, output: 0 },
      }));
    const available = await this.models.getAvailable("openrouter", { signal: AbortSignal.timeout(10000) });
    return curatedModels.flatMap((c) => {
      const m = available.find((m) => m.id === c.id);
      return m
        ? [
            {
              id: m.id,
              provider: "openrouter",
              name: c.name,
              tier: c.tier,
              icon: c.icon,
              contextWindow: m.contextWindow,
              reasoning: m.reasoning,
              supportedThinkingLevels: getSupportedThinkingLevels(m),
              cost: { input: m.cost.input, output: m.cost.output },
            },
          ]
        : [];
    });
  }

  routedModel(model?: ModelRef): ModelRef {
    return this.validateModel(model);
  }

  async sessionModels(row: SessionRow): Promise<ModelInfo[]> {
    this.harness(row);
    const scoped = this.opened.get(row.id)?.models;
    return scoped ? this.loadModels(scoped) : this.modelList;
  }

  async skills(row: SessionRow): Promise<SkillInfo[]> {
    const skills = this.runtime(row).profile.skills;
    if (!skills) throw new ApiFault('unavailable', 'Native skills are explicitly unconfigured');
    return (await skills.catalogue()).skills.map(skillInfo);
  }

  async skill(row: SessionRow, name: string): Promise<SkillBody> {
    const skills = this.runtime(row).profile.skills;
    if (!skills) throw new ApiFault('unavailable', 'Native skills are explicitly unconfigured');
    const skill = await skills.getSkill(name).catch(error => {
      if (error instanceof Error && error.message.startsWith('GOAL_SKILL_UNAVAILABLE:'))
        throw notFound('Requested configured skill is unavailable');
      throw error;
    });
    return { ...skillInfo(skill), content: skill.content };
  }

  validateModel(model: unknown, row?: SessionRow): ModelRef {
    const m = model as ModelRef | undefined;
    if (!m || typeof m.provider !== "string" || typeof m.modelId !== "string")
      throw invalid("model must be { provider, modelId }");
    const scoped = row && this.opened.get(row.id)?.models;
    const known = scoped ? !!scoped.models.getModel(m.provider, m.modelId) : this.options.profile?.models
      ? this.modelList.some(item => item.provider === m.provider && item.id === m.modelId)
      : this.options.provider === "faux"
        ? m.provider === "faux" && fauxModels.some((f) => f.id === m.modelId)
        : m.provider === "openrouter" &&
          curatedModels.some((c) => c.id === m.modelId) &&
          !!this.models.getModel(m.provider, m.modelId);
    if (!known) throw invalid(`Unknown model ${m.provider}/${m.modelId}. Choose one from GET /v1/device models`);
    return { provider: m.provider, modelId: m.modelId };
  }

  // ------------------------------------------------------------ directories

  async directories(): Promise<DirListing> {
    const dirs: { name: string; path: string }[] = [];
    for (const root of this.startDirs) {
      try {
        dirs.push({ name: root, path: await realpath(root) });
      } catch {}
    }
    return { path: "", dirs };
  }

  async browse(path: string): Promise<DirListing> {
    if (!path) return this.directories();
    const expanded = path === "~" ? homedir() : path.startsWith("~/") ? join(homedir(), path.slice(2)) : path;
    let real: string;
    try {
      real = await realpath(resolve(expanded));
      if (!(await stat(real)).isDirectory()) throw Error();
    } catch {
      throw notFound(`Not a directory on ${this.name}: ${path}`);
    }
    const dirs: { name: string; path: string }[] = [];
    try {
      for (const entry of await readdir(real, { withFileTypes: true })) {
        if (!entry.isDirectory() || entry.name.startsWith(".") || entry.name === "node_modules") continue;
        dirs.push({ name: entry.name, path: join(real, entry.name) });
      }
    } catch (e) {
      reportError(e, "filesystem.list");
      throw new ApiFault("unavailable", "Directory listing is unavailable");
    }
    dirs.sort((a, b) => a.name.localeCompare(b.name));
    return { path: real, parent: dirname(real) !== real ? dirname(real) : undefined, dirs: dirs.slice(0, 500) };
  }

  // ------------------------------------------------------------ sessions

  list(): SessionRow[] {
    return this.catalog.prepare("SELECT * FROM sessions ORDER BY createdAt DESC").all() as SessionRow[];
  }

  row(id: string): SessionRow {
    const row = this.catalog.prepare("SELECT * FROM sessions WHERE id=?").get(id) as SessionRow | undefined;
    if (!row) throw notFound(`No session ${id}`);
    return row;
  }

  /** A session by UUID or unique case-insensitive name. */
  resolveSession(ref: string): SessionRow {
    const byId = this.catalog.prepare("SELECT * FROM sessions WHERE id=?").get(ref) as SessionRow | undefined;
    if (byId) return byId;
    const matches = this.catalog
      .prepare("SELECT * FROM sessions WHERE lower(name)=lower(?)")
      .all(ref) as SessionRow[];
    if (matches.length === 1) return matches[0];
    if (matches.length > 1)
      throw new ApiFault("ambiguous", `${matches.length} sessions are named "${ref}"; use the session id`);
    throw notFound(`No session "${ref}" on ${this.name}`);
  }

  private runtime(row: SessionRow): Opened {
    const runtime = this.opened.get(row.id);
    if (!runtime) throw new ApiFault("unavailable", this.errors.get(row.id) ?? `Session ${row.name} is unavailable`);
    return runtime;
  }

  harness(row: SessionRow): Harness { return this.runtime(row).harness; }

  async refreshRuntime(row: SessionRow, body: unknown, identity: AdmissionIdentity) {
    identity.assertCurrent();
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length)
      throw invalid("Runtime refresh accepts only an empty object");
    await this.reloadProfile(row, identity.assertCurrent.bind(identity));
    return { sessionId: row.id, refreshed: true as const };
  }

  /** `spawnKey` records which tool call created the session, in the same transaction as the session row. */
  async create(body: CreateSessionBody, spawnKey?: string, resourceId: string = randomUUID()): Promise<SessionSummary> {
    if (typeof body?.name !== "string") throw invalid("name is required");
    if (typeof body.cwd !== "string" || !body.cwd.trim()) throw invalid("cwd is required");
    const path = body.cwd.trim();
    const expanded = path === "~" ? homedir() : path.startsWith("~/") ? join(homedir(), path.slice(2)) : path;
    let cwd: string;
    try {
      cwd = await realpath(resolve(this.startDirs[0] ?? homedir(), expanded));
      if (!(await stat(cwd)).isDirectory()) throw Error();
    } catch {
      throw invalid(`cwd must be an existing folder on ${this.name}`);
    }
    const model = this.validateModel(body.model);
    if (body.thinkingLevel !== undefined && !THINKING_LEVELS.includes(body.thinkingLevel))
      throw invalid("Invalid thinking level");
    const id = resourceId;
    const row: SessionRow = {
      id,
      name: body.name.trim().slice(0, 100) || "Untitled session",
      cwd,
      dbPath: join(this.sessionsDir, id, "agent.sqlite"),
      createdAt: Date.now(),
      model: model.modelId,
      provider: model.provider,
    };
    await this.openAgent(row, true, body.thinkingLevel ?? "low");
    this.catalog.exec("BEGIN");
    try {
      this.catalog
        .prepare("INSERT INTO sessions VALUES(?,?,?,?,?,?,?)")
        .run(id, row.name, cwd, row.dbPath, row.createdAt, row.model, row.provider);
      if (spawnKey) this.catalog.prepare("INSERT OR REPLACE INTO session_spawns VALUES(?,?)").run(spawnKey, id);
      this.catalog.exec("COMMIT");
    } catch (e) {
      this.catalog.exec("ROLLBACK");
      throw e;
    }
    this.notify();
    return this.sessionSummary(row);
  }

  /** Catalog intent is committed before native creation and never expires with the HTTP cache. */
  async createSessionRequest(body: CreateSessionBody, key: string, identity: AdmissionIdentity): Promise<SessionSummary> {
    identity.assertCurrent();
    requestKey(key);
    const hash = fingerprint({ body, source: identity.source, authority: identity.authority });
    let intent = this.catalog.prepare("SELECT * FROM session_create_intents WHERE actor=? AND key=?")
      .get(identity.actor, key) as SessionIntent | undefined;
    if (intent && intent.fingerprint !== hash) throw new ApiFault("conflict", "Request key has a different payload");
    if (!intent) {
      intent = { actor: identity.actor, key, fingerprint: hash, resourceId: randomUUID(), state: "intent" };
      this.catalog.prepare("INSERT INTO session_create_intents VALUES(?,?,?,?,?)")
        .run(intent.actor, intent.key, intent.fingerprint, intent.resourceId, intent.state);
    }
    if (intent.state === "gone") throw notFound("result-gone: the session for this request was archived");
    const resourceId = intent.resourceId;
    const mapKey = nativeRequestKey(identity.actor, "create-session", key);
    let pending = this.sessionCreates.get(mapKey);
    if (!pending) {
      pending = (async () => {
        identity.assertCurrent();
        const row = this.catalog.prepare("SELECT * FROM sessions WHERE id=?").get(resourceId) as SessionRow | undefined;
        if (!row && intent.state === "done") throw notFound("result-gone: the session for this request no longer exists");
        const result = row ? await this.sessionSummary(row) : await this.create(body, undefined, resourceId);
        this.catalog.prepare("UPDATE session_create_intents SET state='done' WHERE actor=? AND key=?")
          .run(identity.actor, key);
        return result;
      })().finally(() => this.sessionCreates.delete(mapKey));
      this.sessionCreates.set(mapKey, pending);
    }
    const result = await pending;
    identity.assertCurrent();
    return result;
  }

  /**
   * The start_session tool. A replay of the same tool call (same `key`) finds the session it created, and the first
   * prompt reuses its requestId, so a crash never starts a second session or sends the prompt twice.
   */
  spawnSession: SpawnSession = async (input) => {
    const found = this.catalog.prepare("SELECT sessionId FROM session_spawns WHERE key=?").get(input.key) as
      | { sessionId: string }
      | undefined;
    const existing = found && this.list().find((r) => r.id === found.sessionId);
    const session = existing
      ? await this.sessionSummary(existing)
      : await this.create(
          { name: input.name, cwd: input.cwd, model: input.model, thinkingLevel: input.thinkingLevel },
          input.key,
        );
    if (!input.prompt) return { session };
    const { c } = await this.resolveAgent(session.id, "main");
    const submission = await this.send(c, { content: input.prompt, requestId: `${input.key}:prompt` });
    return { session, submissionId: submission.id as number };
  };

  rename(row: SessionRow, name: unknown) {
    if (typeof name !== "string" || !name.trim()) throw invalid("A name is required");
    this.catalog.prepare("UPDATE sessions SET name=? WHERE id=?").run(name.trim().slice(0, 100), row.id);
    this.notify();
    return this.sessionSummary(this.row(row.id));
  }

  private sessionPath(row: SessionRow): string {
    const path = databasePath(row.dbPath);
    const suffix = relative(this.sessionsDir, path);
    if (!suffix || suffix === ".." || suffix.startsWith(`..${sep}`) || isAbsolute(suffix))
      throw new ApiFault("unavailable", "Session database is outside this Store's ownership directory");
    return path;
  }

  /** Stop all work, close the harness and move its files to archive/. Nothing is deleted. */
  async archive(row: SessionRow) {
    const path = this.sessionPath(row);
    const opened = this.opened.get(row.id);
    if (opened) {
      this.opened.delete(row.id);
      opened.unsubscribe();
      try {
        await this.closeRuntime(opened.harness, opened.profile, async () => {
          for (const record of await this.scanAll(opened.harness)) {
            const c = await opened.harness.conversation(record.id, ctx);
            if (c) await c.abort(ctx, { background: true }).catch(() => {});
          }
        });
      } finally { opened.unlock(); }
    }
    await mkdir(this.archiveDir, { recursive: true });
    const target = join(this.archiveDir, `${row.id}-${Date.now()}`);
    try {
      await renamePath(dirname(path), target);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
    this.catalog.prepare("DELETE FROM conversation_names WHERE sessionId=?").run(row.id);
    this.catalog.prepare("UPDATE session_create_intents SET state='gone' WHERE resourceId=?").run(row.id);
    this.catalog.prepare("DELETE FROM sessions WHERE id=?").run(row.id);
    this.errors.delete(row.id);
    this.notify();
    return { archived: target };
  }

  async openAgent(row: SessionRow, create = false, thinkingLevel: ThinkingLevel = "low"): Promise<Harness> {
    const path = this.sessionPath(row);
    const current = this.opened.get(row.id);
    if (current) return current.harness;
    if (!create) await stat(path);
    await mkdir(dirname(path), { recursive: true });
    const unlock = lockFile(`${path}.lock`);
    let harness: Harness | undefined;
    let storage: Storage | undefined;
    let profile: RuntimeComposition | undefined;
    let initializing = false;
    try {
      const factory: RuntimeProfileFactory = this.options.profile ?? playgroundProfile;
      if (!factory.models) this.validateModel({ provider: row.provider, modelId: row.model });
      if (!factory.id) throw invalid("Runtime profile needs a stable id");
      const saved = this.catalog.prepare("SELECT profileId FROM session_profiles WHERE sessionId=?").get(row.id) as
        { profileId: string } | undefined;
      if ((!saved && !create) || (saved && saved.profileId !== factory.id))
        throw new ApiFault("unavailable", `Incompatible runtime profile: session requires ${saved?.profileId ?? "an explicitly migrated legacy profile"}, selected ${factory.id}`);
      if (!saved) this.catalog.prepare("INSERT INTO session_profiles VALUES(?,?)").run(row.id, factory.id);
      const shellEnv = baseShellEnv();
      const profileContext = {
        shared: this.shared, sessionId: row.id, cwd: row.cwd, directory: dirname(path),
        shellEnv, spawn: this.spawnSession, offline: this.options.provider === "faux",
      };
      // External initializers can throw even an ApiFault containing private provider data.
      initializing = true;
      const scopedModels = await factory.models?.create(profileContext);
      await scopedModels?.requireModel({ provider: row.provider, modelId: row.model });
      profile = await factory({ ...profileContext, models: scopedModels });
      (await profile.prepareReload?.())?.publish();
      const compaction = () => this.compactionOf(row.id);
      storage = await openNodeSqliteStorage(path);
      harness = await Harness.open(
        storage,
        {
          models: scopedModels?.models ?? this.models,
          registry: profile.registry,
          env: profile.env ?? (({ cwd }) => new SessionExecutionEnv({ cwd: cwd ?? row.cwd, shellEnv })),
          conversationCreated: profile.conversationCreated,
          settings: {
            get extensions() { return profile!.extensions; },
            // Read at every use, so a PATCH .../compaction applies from the next request.
            get compaction() {
              return compaction();
            },
            progress: { partialIntervalMs: 100, outputIntervalMs: 100 },
          },
          onReport: (e) => { reportError(e, "durable.report"); },
        },
        ctx,
      );
      await harness.root(ctx, {
        agent: {
          cwd: row.cwd,
          model: { provider: row.provider, modelId: row.model },
          thinkingLevel,
        },
      });
      // Validate every saved choice before recovery; never rewrite a missing model.
      for (const record of await this.scanAll(harness)) {
        const conversation = (await harness.conversation(record.id, ctx))!;
        const savedModel = (await conversation.agent(ctx)).model;
        if (scopedModels) {
          if (!savedModel) throw new ApiFault('unavailable', 'Native conversation has no saved model');
          await scopedModels.requireModel(savedModel);
        } else this.validateModel(savedModel);
      }
      const rootModel = (await (await harness.root(ctx)).agent(ctx)).model!;
      row.provider = rootModel.provider;
      row.model = rootModel.modelId;
      this.catalog.prepare("UPDATE sessions SET provider=?,model=? WHERE id=?").run(row.provider, row.model, row.id);
      await profile.bind?.(harness, ctx, storage);
      const unsubscribe = harness.subscribeCommits(() => this.notify());
      this.opened.set(row.id, { harness, storage, profile, models: scopedModels, unlock, unsubscribe });
      this.errors.delete(row.id);
      if (create) harness.resume();
      return harness;
    } catch (e) {
      let failure = e;
      try { await this.closeRuntime(harness, profile, undefined, storage); }
      catch (cleanup) { failure = new AggregateError([e, cleanup], "Runtime open and cleanup failed"); }
      finally { unlock(); }
      if (initializing) {
        reportError(failure, "session.initialize");
        throw new ApiFault("internal", "Session initialization failed");
      }
      throw failure;
    }
  }

  assertNotReloading(row: SessionRow) {
    const opened = this.opened.get(row.id);
    if (opened && isDurableReloading(opened.harness)) throw new ApiFault('conflict', 'Session profile reload is in progress');
  }

  async reloadProfile(row: SessionRow, assertCurrent: () => unknown) {
    assertCurrent();
    const opened = this.runtime(row);
    try {
      const result = await reloadDurable({ harness: opened.harness, context: ctx, models: opened.models,
        prepareExtensions: opened.profile.prepareReload?.bind(opened.profile),
        assertCurrent: () => {
          assertCurrent();
          if (this.opened.get(row.id) !== opened) throw new ApiFault('conflict', 'Session changed during reload');
        },
      });
      if (result.models) this.modelList = await this.loadModels({ catalogue: async () => result.models! });
      this.notify();
      return { sessionId: row.id, models: result.models?.length ?? this.modelList.length,
        extensions: opened.profile.registry.snapshot().installed().length };
    } catch (error) {
      assertCurrent();
      if (error instanceof DurableReloadError) throw new ApiFault(error.reason === 'busy' ? 'conflict' : 'unavailable', error.message);
      if (error instanceof ApiFault && error.code === 'conflict') throw error;
      reportError(error, 'profile.reload');
      throw new ApiFault('unavailable', 'Profile reload rejected; previous runtime remains active');
    }
  }

  async scanAll(h: Harness): Promise<ConversationRecord[]> {
    return h.commit(async (tx) => {
      let page = await tx.scanConversations({}, 1000);
      const records = [...page.items];
      while (page.next) {
        page = await tx.scanConversations({}, 1000, page.next);
        records.push(...page.items);
      }
      return records;
    }, ctx);
  }

  // ------------------------------------------------------------ agents

  private names(sessionId: string) {
    return new Map(
      (
        this.catalog
          .prepare("SELECT conversationId,name FROM conversation_names WHERE sessionId=?")
          .all(sessionId) as { conversationId: number; name: string }[]
      ).map((r) => [r.conversationId, r.name]),
    );
  }

  private agentRef(record: ConversationRecord, names: Map<number, string>): AgentRef {
    const id = record.id as number;
    const kind = record.parent ? "fork" : record.owner ? "subagent" : "root";
    const custom = names.get(id);
    const derived =
      id === 1 ? "Main" : kind === "fork" ? `Fork #${id}` : kind === "subagent" ? `Subagent #${id}` : `Root #${id}`;
    return {
      id,
      name: custom ?? derived,
      named: custom !== undefined,
      kind,
      ...(record.parent ? { parentId: record.parent.conversationId as number, forkedAt: record.parent.at as number } : {}),
      ...(record.owner
        ? { ownerAgentId: record.owner.conversationId as number, ownerTaskId: record.owner.taskId as number }
        : {}),
    };
  }

  async agents(row: SessionRow, tasks?: TaskNode[]): Promise<AgentSummary[]> {
    const h = this.harness(row);
    const names = this.names(row.id);
    const records = await this.scanAll(h);
    const live = tasks ?? (await this.liveTasks(h));
    return records.map((record) => {
      const own = live.filter((t) => t.conversationId === (record.id as number));
      return {
        ...this.agentRef(record, names),
        busy: own.some((t) => !t.background),
        background: own.filter((t) => t.background).length,
      };
    });
  }

  async liveTasks(h: Harness): Promise<TaskNode[]> {
    const graph = await h.taskGraph(ctx);
    try {
      return await this.labelTasks(h, Object.values(graph.value.tasks).map((t) => this.taskNode(t)));
    } finally {
      graph.dispose();
    }
  }

  taskNode(t: unknown): TaskNode {
    const n = t as {
      id: number;
      kind: string;
      conversationId: number;
      owner?: number;
      background: boolean;
      abortRequested?: boolean;
      state: { status: string; phase?: string; on?: readonly number[]; policy?: string; outcome?: string };
      conversations?: readonly number[];
    };
    return {
      id: n.id,
      kind: n.kind,
      conversationId: n.conversationId,
      ...(n.owner !== undefined ? { owner: n.owner } : {}),
      background: !!n.background,
      ...(n.abortRequested ? { aborting: true } : {}),
      state: {
        status: n.state.status,
        ...(n.state.phase ? { phase: n.state.phase } : {}),
        ...(n.state.on ? { on: [...n.state.on] } : {}),
        ...(n.state.policy ? { policy: n.state.policy } : {}),
      },
      conversations: [...(n.conversations ?? [])],
    };
  }

  /** Agent by numeric id, `main`, or unique name (custom or derived, case-insensitive). */
  async resolveAgent(sessionRef: string, agentRef: string): Promise<Resolved> {
    const row = this.resolveSession(sessionRef);
    const h = this.harness(row);
    let id: number | undefined;
    if (/^\d+$/.test(agentRef)) id = Number(agentRef);
    else if (agentRef.toLowerCase() === "main") id = 1;
    else {
      const wanted = agentRef.toLowerCase();
      const names = this.names(row.id);
      const matches = (await this.scanAll(h))
        .map((r) => this.agentRef(r, names))
        .filter((a) => a.name.toLowerCase() === wanted);
      if (matches.length > 1) throw new ApiFault("ambiguous", `${matches.length} agents are named "${agentRef}"`);
      id = matches[0]?.id;
    }
    const c = id === undefined ? undefined : await h.conversation(id as ConversationId, ctx);
    if (!c) throw notFound(`No agent "${agentRef}" in session ${row.name}`);
    return { row, h, c };
  }

  async agentSummary(row: SessionRow, c: Conversation): Promise<AgentSummary> {
    const agents = await this.agents(row);
    return agents.find((a) => a.id === (c.id as number))!;
  }

  /** Every tool of the agent's selected extensions, first definition per name, and the names it is offered. */
  private async toolsOf(c: Conversation) {
    const agent = await c.agent(ctx);
    const all = new Map<string, ToolRegistration>();
    for (const extension of agent.extensions)
      for (const tool of extension.tools ?? []) if (!all.has(tool.name)) all.set(tool.name, tool as ToolRegistration);
    return { agent, all: [...all.values()], offered: new Set(agent.tools.map((t) => t.name)) };
  }

  async agentDetail(row: SessionRow, c: Conversation): Promise<AgentDetail> {
    const { agent, all, offered } = await this.toolsOf(c);
    const writers = all.filter((t) => this.toolWrites(row, t.name));
    return {
      ...(await this.agentSummary(row, c)),
      sessionId: row.id,
      documentKinds: this.agentDocKinds(this.harness(row)),
      config: {
        model: agent.model,
        thinkingLevel: agent.thinkingLevel as ThinkingLevel | undefined,
        instructions: agent.instructions,
        cwd: agent.cwd,
        readOnly: writers.length > 0 && writers.every((t) => !offered.has(t.name)),
      },
      tools: all.map((t) => ({
        name: t.name,
        description: t.description,
        replay: (t.replay ?? "unsafe") as "safe" | "unsafe",
        parameters: JSON.parse(JSON.stringify(t.parameters ?? {})),
        writes: this.toolWrites(row, t.name),
        offered: offered.has(t.name),
      })),
      extensions: agent.extensions.map((e) => e.name),
    };
  }

  setAgentName(row: SessionRow, agentId: number, name: unknown) {
    if (typeof name !== "string" || !name.trim()) throw invalid("A name is required");
    const clean = name.trim().slice(0, 100);
    if (/^\d+$/.test(clean) || clean.toLowerCase() === "main" && agentId !== 1)
      throw invalid("Agent names cannot be numbers or 'main'");
    this.catalog
      .prepare(
        "INSERT INTO conversation_names VALUES(?,?,?) ON CONFLICT(sessionId,conversationId) DO UPDATE SET name=excluded.name",
      )
      .run(row.id, agentId, clean);
    this.notify();
  }

  async createAgent(row: SessionRow, body: { from?: unknown; name?: unknown }) {
    const h = this.harness(row);
    const source = await this.resolveAgent(row.id, String(body.from ?? 1));
    const agent = await source.c.agent(ctx);
    const other = await h.createConversation(
      {
        ownership: { kind: "ownerless" },
        agent: {
          model: agent.model,
          cwd: agent.cwd,
          thinkingLevel: agent.thinkingLevel,
          instructions: agent.instructions,
        },
      },
      ctx,
    );
    if (typeof body.name === "string" && body.name.trim()) this.setAgentName(row, other.id as number, body.name);
    this.notify();
    return this.agentSummary(row, other);
  }

  async fork(row: SessionRow, c: Conversation, body: { entryId?: unknown; name?: unknown }) {
    const at = Number(body.entryId);
    if (!Number.isSafeInteger(at)) throw invalid("entryId is required");
    if (body.name !== undefined && typeof body.name !== "string") throw invalid("Invalid fork name");
    const fork = await c.fork(at as EntryId, { ownership: { kind: "ownerless" } }, ctx);
    const agent = await fork.agent(ctx);
    await fork.configure({ model: this.validateModel(agent.model, row) }, ctx);
    if (typeof body.name === "string" && body.name.trim()) this.setAgentName(row, fork.id as number, body.name);
    this.notify();
    return this.agentSummary(row, fork);
  }

  /** Native resource and receipt are created together, so a lost catalog/name ACK cannot create another. */
  async createAgentRequest(row: SessionRow, body: { from?: unknown; name?: unknown }, key: string, identity: AdmissionIdentity) {
    identity.assertCurrent();
    const h = this.harness(row);
    const source = await this.resolveAgent(row.id, String(body.from ?? 1));
    const agent = await source.c.agent(ctx);
    const request = nativeRequestKey(identity.actor, `create-agent:${row.id}`, key);
    const hash = fingerprint({ body, source: identity.source, authority: identity.authority });
    const context = identity.signal ? withAbortSignal(identity.signal, ctx) : ctx;
    const id = await h.commit(async (tx) => {
      identity.assertCurrent();
      const receipt = await tx.doc(CreationReceipts, request, null);
      if (receipt.fingerprint && receipt.fingerprint !== hash) throw new ApiFault("conflict", "Request key has a different payload");
      if (receipt.conversationId) return receipt.conversationId;
      const created = await tx.createConversation({ ownership: { kind: "ownerless" } });
      await configureNative(tx, created.id, {
        model: agent.model, cwd: agent.cwd, thinkingLevel: agent.thinkingLevel, instructions: agent.instructions,
      });
      receipt.fingerprint = hash;
      receipt.conversationId = created.id as number;
      return receipt.conversationId;
    }, context);
    identity.assertCurrent();
    const conversation = await h.conversation(id as ConversationId, ctx);
    if (!conversation) throw notFound("result-gone: the conversation for this request no longer exists");
    if (typeof body.name === "string" && body.name.trim()) this.setAgentName(row, id, body.name);
    this.notify();
    return this.agentSummary(row, conversation);
  }

  async forkRequest(row: SessionRow, parent: Conversation, body: { entryId?: unknown; name?: unknown }, key: string, identity: AdmissionIdentity) {
    identity.assertCurrent();
    const at = Number(body.entryId);
    if (!Number.isSafeInteger(at)) throw invalid("entryId is required");
    if (body.name !== undefined && typeof body.name !== "string") throw invalid("Invalid fork name");
    const h = this.harness(row);
    const request = nativeRequestKey(identity.actor, `fork:${row.id}:${parent.id}`, key);
    const hash = fingerprint({ body, source: identity.source, authority: identity.authority });
    const context = identity.signal ? withAbortSignal(identity.signal, ctx) : ctx;
    const id = await h.commit(async (tx) => {
      identity.assertCurrent();
      const receipt = await tx.doc(CreationReceipts, request, null);
      if (receipt.fingerprint && receipt.fingerprint !== hash) throw new ApiFault("conflict", "Request key has a different payload");
      if (receipt.conversationId) return receipt.conversationId;
      const created = await tx.forkConversation(parent.id, at as EntryId, { ownership: { kind: "ownerless" } });
      receipt.fingerprint = hash;
      receipt.conversationId = created.id as number;
      return receipt.conversationId;
    }, context);
    identity.assertCurrent();
    const conversation = await h.conversation(id as ConversationId, ctx);
    if (!conversation) throw notFound("result-gone: the fork for this request no longer exists");
    this.validateModel((await conversation.agent(ctx)).model, row);
    if (typeof body.name === "string" && body.name.trim()) this.setAgentName(row, id, body.name);
    this.notify();
    return this.agentSummary(row, conversation);
  }

  private toolWrites(row: SessionRow, name: string): boolean {
    const reads = this.runtime(row).profile.readOnlyTools;
    return reads ? !reads.includes(name) : WRITE_TOOLS.has(name);
  }

  async configure(row: SessionRow, c: Conversation, body: Record<string, unknown>) {
    const model = body.model === undefined ? undefined : this.validateModel(body.model, row);
    if (model) await this.opened.get(row.id)?.models?.requireModel(model);
    if (body.thinkingLevel !== undefined && !THINKING_LEVELS.includes(body.thinkingLevel as ThinkingLevel))
      throw invalid("Invalid thinking level");
    let thinking = body.thinkingLevel as ThinkingLevel | undefined;
    if (model || thinking !== undefined) {
      const selected = model ?? (await c.agent(ctx)).model;
      const models = this.opened.get(row.id)?.models?.models ?? this.models;
      const native = selected && models.getModel(selected.provider, selected.modelId);
      if (!native) throw new ApiFault("unavailable", "Selected model is not registered");
      thinking = clampThinkingLevel(native, thinking ?? (await c.agent(ctx)).thinkingLevel ?? "off");
    }
    if (body.instructions !== undefined && typeof body.instructions !== "string")
      throw invalid("instructions must be a string");
    let cwd: string | undefined;
    if (body.cwd !== undefined) {
      if (typeof body.cwd !== "string") throw invalid("cwd must be a string");
      cwd = (await this.browse(body.cwd)).path;
    }
    if (body.readOnly !== undefined && typeof body.readOnly !== "boolean") throw invalid("readOnly must be a boolean");
    // Read only filters the agent's tools: the model is never offered the ones that create, update or delete.
    const tools =
      body.readOnly === true
        ? { tools: { remove: (await this.toolsOf(c)).all.filter((t) => this.toolWrites(row, t.name)) } }
        : body.readOnly === false
          ? { tools: null }
          : {};
    await c.configure(
      {
        ...tools,
        ...(model ? { model } : {}),
        ...(thinking ? { thinkingLevel: thinking } : {}),
        ...(typeof body.instructions === "string" ? { instructions: body.instructions.slice(0, 12000) } : {}),
        ...(cwd ? { cwd } : {}),
      },
      ctx,
    );
    if (model && (c.id as number) === 1)
      this.catalog.prepare("UPDATE sessions SET model=?,provider=? WHERE id=?").run(model.modelId, model.provider, row.id);
    // Thresholds are shared by the session's agents; refit them when this model's window is too small for them.
    const window = model ? this.windowOf(model, row.id) : 0;
    if (window && !compactionFits(window, this.compactionOf(row.id))) {
      const fitted = defaultCompaction(window);
      this.setCompaction(row, { reserveTokens: fitted.reserveTokens, backgroundTokens: fitted.backgroundTokens });
    }
    this.notify();
    return (await this.agentDetail(row, c)).config;
  }

  async send(c: Conversation, body: Record<string, unknown>, identity?: AdmissionIdentity, row?: SessionRow) {
    if (typeof body.content !== "string" || !body.content.trim() || body.content.length > 100000)
      throw invalid("content must be a message under 100,000 characters");
    const whenBusy = (body.whenBusy ?? "followUp") as WhenBusy;
    if (!["steer", "followUp", "reject"].includes(whenBusy)) throw invalid("whenBusy must be followUp, steer or reject");
    if (typeof body.requestId !== "string" || !body.requestId || body.requestId.length > 128)
      throw invalid("requestId is required (≤128 chars) so retries never submit twice");
    identity?.assertCurrent();
    const profile = row ? this.runtime(row).profile : undefined;
    if (identity?.authority === "delegated" && (!profile?.prepareInput || !identity.policyReference))
      throw new ApiFault("unavailable", "Selected profile has no native delegated input policy");
    const actor = identity?.actor ?? "local";
    const request = nativeRequestKey(actor, "message", body.requestId);
    const hash = fingerprint({ content: body.content, whenBusy, source: identity?.source, authority: identity?.authority });
    const context = identity?.signal ? withAbortSignal(identity.signal, ctx) : ctx;
    await c.commit(async (tx) => {
      identity?.assertCurrent();
      const receipt = await tx.doc(MessageReceipts, c.id, request, null);
      if (receipt.fingerprint && receipt.fingerprint !== hash) throw new ApiFault("conflict", "Request key has a different payload");
      if (row) this.harness(row);
      if (identity) await profile?.prepareInput?.(tx, c.id, request, identity);
      receipt.fingerprint = hash;
    }, context);
    identity?.assertCurrent();
    if (row) this.harness(row);
    await profile?.admitInput?.(c, request, context);
    identity?.assertCurrent();
    if (row) this.harness(row);
    return c.submit({
      type: "input", content: body.content, requestId: request, whenBusy,
      ...(identity ? { entry: { kind: "host.input", data: { actor, source: identity.source, authority: identity.authority, requestId: body.requestId } } } : {}),
    }, context);
  }

  async messageReceipt(row: SessionRow, c: Conversation, key: string, identity: AdmissionIdentity) {
    identity.assertCurrent();
    const request = nativeRequestKey(identity.actor, "message", key);
    const h = this.harness(row);
    const record = await h.commit(async (tx) => {
      identity.assertCurrent();
      return tx.submissionByRequest(c.id, request);
    }, identity.signal ? withAbortSignal(identity.signal, ctx) : ctx);
    identity.assertCurrent();
    if (!record) throw notFound("No native submission for this actor/requestId");
    return { submissionId: record.id as number, status: record.status };
  }

  async goalCommand(row: SessionRow, c: Conversation, body: Record<string, unknown>, identity: AdmissionIdentity) {
    if (typeof body.line !== "string") throw invalid("line must be a /goal operator command");
    return this.goalOperation(row, c, requestKey(body.requestId), identity, body.line);
  }

  async goalReceipt(row: SessionRow, c: Conversation, key: string, identity: AdmissionIdentity) {
    return this.goalOperation(row, c, requestKey(key), identity);
  }

  private async goalOperation(row: SessionRow, c: Conversation, key: string, identity: AdmissionIdentity, line?: string) {
    identity.assertCurrent();
    if (identity.authority !== "human" || !identity.policyReference) throw new GrantDenied(403);
    const operator = this.runtime(row).profile.goalOperator;
    if (!operator) throw new ApiFault("unavailable", "Selected profile has no native Goal operator");
    const request = { conversationId: c.id, requestId: nativeRequestKey(identity.actor, "goal-operator", key), policyRef: identity.policyReference };
    try {
      const result = line === undefined ? await operator.receipt(request, ctx) : await operator.command({ ...request, line }, ctx);
      identity.assertCurrent();
      if (!result) throw notFound("Unknown Goal operator request");
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message === "GOAL_OPERATOR_REQUEST_CONFLICT") throw new ApiFault("conflict", message);
      if (message.startsWith("GOAL_OPERATOR_INVALID_")) throw invalid("Invalid native Goal operator request");
      if (message === "GOAL_OPERATOR_HUMAN_AUTHORITY_REQUIRED") throw new GrantDenied(403);
      if (message === "GOAL_OPERATOR_UNAVAILABLE") throw new ApiFault("unavailable", message);
      throw error;
    }
  }

  async iiiOperation(row: SessionRow, c: Conversation, authorization: Authorization, kind: 'info' | 'submit' | 'run' | 'request' | 'result' | 'control' | 'controlReceipt' | 'jobStop' | 'jobStopReceipt', value?: unknown, waitSignal?: AbortSignal) {
    authorization.recheck();
    if (authorization.identity.source !== 'iii' || authorization.identity.authority !== 'delegated') throw new GrantDenied(403);
    const service = this.runtime(row).profile.iii;
    if (!service) throw new ApiFault('unavailable', 'Selected profile has no native iii jobs');
    try {
      const { port, scope, ownerConversationId } = await service.forGrant(authorization.handle, c.id as number);
      const target = { sessionId: row.id, conversationId: c.id as number };
      authorization.recheck();
      let result: unknown;
      if (kind === 'info') result = { ...await port.info(), namespace: scope.namespace, configHash: scope.configHash,
        workerId: scope.workerId, nativeSessionId: row.id, ownerConversationId, source: authorization.identity.source, workspace: row.cwd };
      else if (kind === 'request') result = await port.request(iiiRequestKey(value));
      else if (kind === 'result') result = await port.resultPage!(value);
      else if (kind === 'controlReceipt') result = await port.childControl!.get(iiiRequestKey(value));
      else if (kind === 'jobStopReceipt') result = await port.controls!.get(iiiRequestKey(value));
      else if (kind === 'jobStop') {
        authorization.policy.assert(authorization.handle, 'control', target);
        result = await port.controls!.stop(value);
      } else if (kind === 'submit' || kind === 'run') {
        authorization.policy.assert(authorization.handle, 'write', target);
        const input = iiiRecord(value);
        if (Object.keys(input).some(key => !['requestId', 'content', 'jobId', 'operation', 'mode'].includes(key))) throw Error('UNKNOWN_INPUT_FIELD');
        const operation = input.operation ?? (input.mode === 'steer' ? 'steer' : input.jobId ? 'follow_up' : 'start');
        if (!['start', 'follow_up', 'steer'].includes(operation as string)) throw Error('INVALID_INPUT_OPERATION');
        const mode = operation === 'steer' ? 'steer' : 'followUp';
        if (input.mode !== undefined && input.mode !== mode) throw Error('INVALID_INPUT_MODE');
        const request: IiiInput = { requestId: input.requestId as string, content: input.content as string, mode,
          operation: operation as 'start' | 'follow_up' | 'steer', ...(input.jobId === undefined ? {} : { jobId: input.jobId as string }) };
        result = kind === 'run' ? await port.run(request, waitSignal) : await port.submit(request);
      } else {
        const command = iiiRecord(value);
        if (Object.keys(command).sort().join(',') !== 'operation,payload' || !CONTROL_OPERATIONS.includes(command.operation as IiiControlOperation)) throw Error('INVALID_CONTROL_FIELDS');
        authorization.policy.assert(authorization.handle, command.operation === 'controls::inspect' ? 'read' : 'control', target);
        result = await port.childControl!.execute(command.operation as IiiControlOperation, command.payload as IiiJson);
      }
      authorization.recheck();
      return result;
    } catch (error) {
      authorization.recheck();
      if (error instanceof GrantDenied || error instanceof ApiFault) throw error;
      const message = error instanceof Error ? error.message : '';
      if (message === 'III_SERVER_BINDING_REQUIRED') throw new ApiFault('unavailable', message);
      if (/CONFLICT|FENCED|IN_PROGRESS|INDEX_FULL|EXHAUSTED|SCOPE_CHANGED|RESULT_NOT_READY|STOPPED_EXPLICIT|in progress|index full|already exists|binding is stale|admission limit/i.test(message)) throw new ApiFault('conflict', 'Native iii request conflicts with saved state');
      if (/NOT_FOUND/.test(message)) throw notFound('Native iii target was not found');
      if (/DENIED|REVOKED|SCOPE_MISSING|OWNER_ROOT_REQUIRED|GUARD_REQUIRED|FOREIGN|owner mismatch|parent-only/i.test(message)) throw new GrantDenied(403);
      if (/^INVALID_|^UNKNOWN_|^INITIAL_|^JOB_REQUIRED|^Exact |^Invalid |^USE_JOB_|^V2_/.test(message)) throw invalid('Invalid native iii request');
      throw error;
    }
  }

  async bbBinding(row: SessionRow, c: Conversation, authorization: Authorization, threadId: string, value?: unknown) {
    authorization.recheck();
    if (!this.runtime(row).profile.parentControl) throw new ApiFault('unavailable', 'Selected profile has no native BB binding capability');
    const scope = authorization.policy.bbScope(authorization.handle);
    if (authorization.identity.source !== 'bb') throw new GrantDenied(403);
    if (!scope) throw new ApiFault('unavailable', 'No server-owned BB provider/thread scope');
    if (!threadId.trim() || threadId.length > 512) throw invalid('Invalid BB thread ID');
    const h = this.harness(row), operationContext = withAbortSignal(authorization.signal, ctx);
    let command: NativeBbBindingCommand | undefined;
    if (value !== undefined) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid('Invalid BB binding command');
      command = value as NativeBbBindingCommand;
      if (!['root', 'child'].includes(command.kind) || Object.keys(command).some(key => !(command!.kind === 'root' ? ['kind'] : ['kind', 'target']).includes(key)))
        throw invalid('Invalid BB binding command fields');
      if (command.kind === 'child') {
        const t = command.target;
        if (!t || typeof t !== 'object' || Array.isArray(t) || Object.keys(t).some(key => !['key', 'conversationId', 'executionId', 'requestId'].includes(key)) ||
          !Number.isSafeInteger(t.conversationId) || t.conversationId < 1 || [t.key, t.executionId, t.requestId].some(item => typeof item !== 'string' || !item || item.length > 512))
          throw invalid('Exact native child target required');
      }
    }
    const verify = async (tx: Tx, binding: DurableBinding) => {
      authorization.recheck();
      const grantTarget = { sessionId: row.id, conversationId: c.id as number };
      authorization.policy.assert(authorization.handle, 'read', grantTarget);
      if (command) {
        authorization.policy.assert(authorization.handle, 'write', grantTarget);
        authorization.policy.assert(authorization.handle, 'control', grantTarget);
      }
      if (binding.providerId !== scope.providerId || binding.sessionId !== row.id || binding.bbThreadId !== threadId) throw new GrantDenied(403);
      const actual = await tx.conversation(binding.conversationId);
      if (!actual) throw new GrantDenied(403);
      if (binding.parentThreadId === undefined) {
        if (threadId !== scope.threadId || binding.conversationId !== c.id || actual.owner || (await tx.doc(ChildBindingDoc, c.id)).binding)
          throw new GrantDenied(403);
      } else {
        const childBinding = (await tx.doc(ChildBindingDoc, binding.conversationId)).binding;
        if (!actual.owner || !childBinding) throw new GrantDenied(403);
        const parent = actual.owner.conversationId;
        const owned = await ownedChild(tx, parent, childBinding.key);
        const root = (await tx.doc(BindingDoc, parent)).binding;
        if (owned.conversationId !== binding.conversationId || !root || root.providerId !== scope.providerId || root.sessionId !== row.id ||
          root.bbThreadId !== binding.parentThreadId || root.conversationId !== parent || root.parentThreadId !== null ||
          !(c.id === parent && scope.threadId === binding.parentThreadId || c.id === binding.conversationId && scope.threadId === threadId))
          throw new GrantDenied(403);
        if (command?.kind === 'child') {
          const target = command.target;
          const execution = (await tx.doc(TeamDoc, parent)).executions[target.executionId];
          if (c.id !== parent || owned.conversationId !== target.conversationId || childBinding.key !== target.key ||
            !execution || execution.key !== target.key || execution.child !== target.conversationId || execution.requestId !== target.requestId)
            throw new GrantDenied(403);
        }
      }
    };
    try {
      let binding: DurableBinding | undefined;
      if (!command) {
        binding = await createDurableBindingReader(h, operationContext).findByThread({ providerId: scope.providerId, sessionId: row.id, bbThreadId: threadId });
        if (!binding && threadId !== scope.threadId) throw new GrantDenied(403);
        if (binding) await h.commit(tx => verify(tx, binding!), operationContext);
      } else {
        if (command.kind === 'root' ? threadId !== scope.threadId : threadId === scope.threadId) throw new GrantDenied(403);
        binding = { providerId: scope.providerId, sessionId: row.id, bbThreadId: threadId,
          conversationId: command.kind === 'root' ? c.id : command.target.conversationId as ConversationId,
          ...(command.kind === 'child' ? { parentThreadId: scope.threadId } : {}) };
        const selected = binding;
        // Genuine existing Harness owner Tx; never construct or retain a ToolExecutionApi for HTTP.
        await h.commit(async tx => {
          await verify(tx, selected);
          await putDurableBinding(tx, selected);
          authorization.recheck();
        }, operationContext);
      }
      authorization.recheck();
      return binding ?? null;
    } catch (error) {
      authorization.recheck();
      if (error instanceof Error && /already bound|different BB binding/.test(error.message)) throw new ApiFault('conflict', 'Native BB binding conflicts with saved state');
      if (error instanceof Error && /foreign|binding is stale/.test(error.message)) throw new GrantDenied(403);
      throw error;
    }
  }

  async bbOutcome(row: SessionRow, c: Conversation, authorization: Authorization, threadId: string) {
    const binding = await this.bbBinding(row, c, authorization, threadId);
    if (!binding) throw notFound('Unknown authorized BB binding');
    const { harness, storage } = this.runtime(row);
    const operationContext = withAbortSignal(authorization.signal, ctx);
    const outcome = await readCoherentOutcome({ snapshot: harness.snapshot.bind(harness),
      readOutcomeHistory: (id, requests, context) => readOutcomeHistory(harness, storage, id, requests, context),
    }, binding.conversationId, operationContext);
    const current = await this.bbBinding(row, c, authorization, threadId);
    authorization.recheck();
    if (!current || JSON.stringify(current) !== JSON.stringify(binding)) throw new ApiFault('conflict', 'BB binding changed during capture');
    return { ...outcome, ...('entries' in outcome && outcome.entries ? { entries: publicProjection(outcome.entries, 'entries') as unknown as WireEntry[] } : {}) };
  }

  async parentOperation(row: SessionRow, c: Conversation, authorization: Authorization, operation:
    | { kind: 'inspect'; target?: unknown } | { kind: 'command'; value: unknown } | { kind: 'receipt'; controlId: string } | { kind: 'reconcile' }) {
    authorization.recheck();
    const bind = this.runtime(row).profile.parentControl;
    if (!bind) throw new ApiFault('unavailable', 'Selected profile has no native parent-control capability');
    const agent = await c.agent(ctx);
    const control = bind(async (tx, parent, action) => {
      authorization.recheck();
      const target = { sessionId: row.id, conversationId: parent as number };
      const identity = authorization.policy.assert(authorization.handle, 'read', target);
      if (action !== 'read') {
        authorization.policy.assert(authorization.handle, 'control', target);
        if (action !== 'stop') authorization.policy.assert(authorization.handle, 'write', target);
      }
      const reference = authorization.policy.reference(authorization.handle);
      return {
        binding: JSON.stringify([row.id, parent, identity.actor, identity.source, identity.authority]),
        policyReference: reference,
        assertCurrent: () => { authorization.recheck(); },
        ...(identity.source === 'bb' && authorization.policy.bbScope(authorization.handle) ? {
          inputRequestId: (controlId: string) => controlId.startsWith('bb-child:') ? controlId : undefined,
        } : {}),
        tools: identity.authority === 'delegated' ? ['read'] : selectChildTools(agent, 'worker').map(tool => tool.name),
        ...(identity.authority === 'delegated' ? { prepareChild: async (transaction: Tx, child: ConversationId, input: { requestId: string }) => {
          authorization.recheck();
          authorization.policy.assertReference(reference, 'write', target);
          authorization.policy.assertReference(reference, 'control', target);
          await bindExistingInput(transaction, child, input.requestId, { workspace: row.cwd, policy: reference,
            tools: ['read', 'contact_supervisor'], parent });
        } } : {}),
      };
    }, withAbortSignal(authorization.signal, ctx));
    try {
      let result;
      if (operation.kind === 'inspect') {
        if (operation.target !== undefined) validateParentTarget(operation.target, true);
        result = await control.inspect(c.id, operation.target);
      }
      else if (operation.kind === 'receipt') result = await control.get(c.id, requestKey(operation.controlId));
      else if (operation.kind === 'command') {
        const command = operation.value as ParentCommand;
        validateParentCommand(command);
        result = await control.execute(c.id, command, async () => { authorization.recheck(); });
      } else {
        authorization.policy.assert(authorization.handle, 'control', { sessionId: row.id, conversationId: c.id as number });
        await control.inspect(c.id);
        await control.reconcile(c.id);
        result = { reconciled: true as const };
      }
      authorization.recheck();
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      authorization.recheck();
      if (/conflict|fenced|in progress|index full|already exists|binding is stale|admission limit/i.test(message)) throw new ApiFault('conflict', 'Native parent control conflicts with saved state');
      if (/foreign|denied|owner mismatch|parent-only/i.test(message)) throw new GrantDenied(403);
      if (/^Invalid |^Exact |^Explicit |tool unavailable|Role not allowed/.test(message)) throw invalid('Invalid native parent control request');
      throw error;
    }
  }

  async settled(h: Harness, submissionId: number, waitMs = 0, signal?: AbortSignal): Promise<SendResult> {
    const submission = await h.submission(submissionId as SubmissionId, ctx);
    if (!submission) throw notFound(`No submission ${submissionId}`);
    let record = await submission.status(ctx);
    if (waitMs > 0 && record.status !== "done" && record.status !== "unanswered") {
      const timeout = AbortSignal.timeout(Math.min(waitMs, 300_000));
      const stop = signal ? AbortSignal.any([timeout, signal]) : timeout;
      try {
        record = await submission.wait(withAbortSignal(stop, ctx));
      } catch (e) {
        if (!stop.aborted) throw e;
      }
    }
    if (record.status === "done" && record.answer !== undefined) {
      const entry = await h.commit((tx) => tx.entry(record.answer as EntryId), ctx);
      const text = (entry?.model ?? []).map((m) => messageText(m as never)).join("").trim();
      return { submissionId, status: "done", answer: { entryId: record.answer as number, text } };
    }
    if (record.status === "unanswered") return { submissionId, status: "unanswered", reason: record.reason };
    return { submissionId, status: record.status === "queued" ? "queued" : "pending" };
  }

  async abort(c: Conversation, background: boolean, row?: SessionRow) {
    if (row && await this.runtime(row).profile.protectsExecution?.(c.id, ctx))
      throw new ApiFault("conflict", "Native Goal protects this execution; use its operator control");
    await c.abort(ctx, { background });
    return { ok: true as const };
  }

  async withdraw(h: Harness, c: Conversation, submissionId: number) {
    return { status: await h.abortSubmission(submissionId as SubmissionId, ctx, c.id) };
  }

  async compact(c: Conversation, instructions?: unknown) {
    return { taskId: (await c.compact(typeof instructions === "string" && instructions.trim() ? instructions : undefined, ctx)) as number };
  }

  async reset(c: Conversation, note?: unknown) {
    await c.reset(typeof note === "string" && note.trim() ? note : undefined, ctx);
    return { ok: true as const };
  }

  async tasks(h: Harness, status: string, limit: number): Promise<TaskOutcome[]> {
    const items = await h.commit(async (tx) => {
      let page = await tx.scanTasks({}, 500);
      let all = [...page.items];
      while (page.next) {
        page = await tx.scanTasks({}, 500, page.next);
        all = [...all, ...page.items].slice(-2000);
      }
      return all;
    }, ctx);
    const wanted = items.filter((t) =>
      status === "terminal" ? t.state.status === "terminal" : t.state.status !== "terminal",
    );
    return wanted.slice(-Math.min(Math.max(limit, 1), 200)).reverse().map((t) => {
      const kind = (t as { kind?: string }).kind ?? (t as { definition?: string }).definition ?? "task";
      return {
        id: t.id as number,
        kind,
        conversationId: (t as { conversationId?: number }).conversationId,
        state: publicTaskState(t.state, kind),
      };
    });
  }

  async abortTask(h: Harness, taskId: number) {
    const task = await h.getTask(taskId as TaskId, ctx);
    if (!task) throw notFound(`No task ${taskId}`);
    return { status: await h.abortTask(task.id, ctx) };
  }

  async inspect(h: Harness) {
    return publicInspection(await h.inspect(ctx));
  }

  async entries(c: Conversation, cursor: string | undefined, limit: number): Promise<Page<WireEntry>> {
    const page = await c.entries({}, Math.min(Math.max(limit, 1), 2000), decodeCursor(cursor), ctx);
    return { items: publicProjection(page.items, 'entries') as unknown as WireEntry[], next: encodeCursor(page.next) };
  }

  async activeEntries(c: Conversation): Promise<WireEntry[]> {
    const view = await c.viewState(ctx);
    try {
      return publicProjection(view.value.entries, 'entries') as unknown as WireEntry[];
    } finally {
      view.dispose();
    }
  }

  async transcript(c: Conversation, format: string) {
    const items = toTranscript(await this.activeEntries(c));
    return format === "markdown" ? { format: "markdown", text: toMarkdown(items) } : { format: "json", items };
  }

  async preview(row: SessionRow, agentId: number) {
    const h = this.opened.get(row.id)?.harness;
    const c = h ? await h.conversation(agentId as ConversationId, ctx) : undefined;
    if (!c) return undefined;
    return lastAssistantText(await this.activeEntries(c))?.slice(0, 200);
  }

  async inbox(h: Harness, c: Conversation): Promise<InboxItem[]> {
    const doc = await h.snapshot(InboxDoc, c.id, ctx);
    return (doc?.items ?? []).map((item) => {
      if (item.mode === "write") return { id: item.id as number, mode: "write" as const, content: "Context update" };
      const content = item.content as unknown;
      const text =
        typeof content === "string"
          ? content
          : Array.isArray(content)
            ? content.map((b: { type?: string; text?: string }) => (b.type === "text" ? b.text : "")).join("")
            : undefined;
      return { id: item.id as number, mode: item.mode, content: text };
    });
  }

  private compositionOf(h: Harness): RuntimeComposition {
    const runtime = [...this.opened.values()].find(opened => opened.harness === h);
    if (!runtime) throw new ApiFault("unavailable", "Native runtime is unavailable");
    return runtime.profile;
  }

  agentDocKinds(h: Harness): string[] {
    const profile = this.compositionOf(h);
    return [...(profile.jobs ? AGENT_DOC_KINDS : []), ...(profile.documentReaders?.keys() ?? [])];
  }

  async agentDoc(h: Harness, c: Conversation, kind: string) {
    const profile = this.compositionOf(h);
    const reader = profile.documentReaders?.get(kind);
    if (reader) return reader(h, c, ctx);
    const token = profile.jobs ? AGENT_DOCS[kind as keyof typeof AGENT_DOCS] : undefined;
    if (!token) throw notFound(`Unknown agent document ${kind}. Known: ${this.agentDocKinds(h).join(", ")}`);
    const value = await h.snapshot(token as typeof JobRuns, c.id, ctx);
    return JSON.parse(JSON.stringify(value ?? (kind === JOB_RUNS_DOC ? { counts: {}, items: {} } : {}))) as unknown;
  }

  async deviceDoc(kind: string) {
    if (kind !== "app.shared-state") throw notFound(`Unknown device document ${kind}`);
    const { value, revision } = await this.shared.snapshot();
    return { value, revision };
  }

  async usage(h: Harness): Promise<UsageTotals> {
    return JSON.parse(JSON.stringify(await h.usage(ctx))) as UsageTotals;
  }

  // ------------------------------------------------------------ custom extensions (per agent)

  async extensionsOf(row: SessionRow, c: Conversation): Promise<AgentExtensions> {
    const active = new Set((await c.agent(ctx)).extensions.map((e) => e.name));
    const addons = this.opened.get(row.id)?.profile.addons;
    const checked = addons ? (await this.harness(row).snapshot(PromptChecklist, c.id, ctx))?.enabled ?? [PROMPTS[0].id] : [];
    return {
      builtIn: [...active].filter((name) => !ADDON_INFO.some((a) => a.name === name)),
      extensions: (addons ? ADDON_INFO : []).map((info) => ({
        ...info,
        enabled: active.has(info.name),
        ...(info.name === "system-prompts"
          ? { prompts: PROMPTS.map(({ id, title, description, text }) => ({ id, title, description, text, enabled: checked.includes(id) })) }
          : {}),
      })),
    };
  }

  /** `{name, enabled}` edits the agent's extension selection; `{prompt, enabled}` edits its prompt checklist. */
  async setExtension(row: SessionRow, c: Conversation, body: Record<string, unknown>) {
    if (typeof body.enabled !== "boolean") throw invalid("enabled must be a boolean");
    const enabled = body.enabled;
    const addons = this.opened.get(row.id)?.profile.addons;
    if (!addons) throw invalid("This runtime profile has no demo add-ons");
    if (typeof body.name === "string") {
      const extension = addons.all[body.name];
      if (!extension) throw invalid(`Unknown extension ${body.name}. Known: ${ADDON_INFO.map((a) => a.name).join(", ")}`);
      // An array is the agent's whole selection. An { add | remove } object would edit the host default instead and
      // replace the previous edit, so turning one extension on would turn the other off.
      const rank = (name: string) => ADDON_INFO.findIndex((a) => a.name === name);
      const others = (await c.agent(ctx)).extensions.filter((e) => e.name !== extension.name);
      const next = (enabled ? [...others, extension] : others).sort((a, b) => rank(a.name) - rank(b.name));
      await c.configure({ extensions: next }, ctx);
    } else if (typeof body.prompt === "string") {
      const prompt = body.prompt;
      if (!PROMPTS.some((p) => p.id === prompt)) throw invalid(`Unknown prompt ${prompt}. Known: ${PROMPTS.map((p) => p.id).join(", ")}`);
      await c.commit(async (tx) => {
        const doc = await tx.doc(PromptChecklist, c.id);
        const next = new Set(doc.enabled);
        if (enabled) next.add(prompt);
        else next.delete(prompt);
        doc.enabled = PROMPTS.map((p) => p.id).filter((id) => next.has(id));
      }, ctx);
    } else throw invalid("name or prompt is required");
    this.notify();
    return this.extensionsOf(row, c);
  }

  // ------------------------------------------------------------ compaction settings (per session)

  private windowOf(model: ModelRef, sessionId?: string) {
    const scoped = sessionId && this.opened.get(sessionId)?.models;
    return scoped ? scoped.models.getModel(model.provider, model.modelId)?.contextWindow ?? 0
      : this.modelList.find(m => m.provider === model.provider && m.id === model.modelId)?.contextWindow ?? 0;
  }

  /** Saved thresholds, or the defaults for the session model's window (200k background, 250k wait when it fits). */
  compactionOf(sessionId: string): CompactionSettings {
    if (!this.compactions.has(sessionId)) {
      const row = this.catalog.prepare("SELECT settings FROM session_compaction WHERE sessionId=?").get(sessionId) as
        | { settings: string }
        | undefined;
      this.compactions.set(sessionId, row ? (JSON.parse(row.settings) as Partial<CompactionSettings>) : null);
    }
    const saved = this.compactions.get(sessionId);
    if (saved) return { ...DEFAULT_COMPACTION, ...saved };
    const session = this.catalog.prepare("SELECT provider,model FROM sessions WHERE id=?").get(sessionId) as { provider: string; model: string } | undefined;
    return defaultCompaction(session ? this.windowOf({ provider: session.provider, modelId: session.model }, sessionId) : 0);
  }

  /** Validate and store new thresholds; pi-durable reads them at its next use, so they apply from the next request. */
  setCompaction(row: SessionRow, body: Record<string, unknown>): CompactionSettings {
    const next = this.compactionOf(row.id);
    const int = (key: "reserveTokens" | "backgroundTokens" | "keepRecentTokens", min: number, max: number) => {
      if (body[key] === undefined) return;
      const n = Number(body[key]);
      if (!Number.isInteger(n) || n < min || n > max) throw invalid(`${key} must be an integer from ${min} to ${max}`);
      next[key] = n;
    };
    if (body.enabled !== undefined) {
      if (typeof body.enabled !== "boolean") throw invalid("enabled must be a boolean");
      next.enabled = body.enabled;
    }
    int("reserveTokens", 1024, 1_000_000);
    int("backgroundTokens", 0, 1_000_000);
    int("keepRecentTokens", 500, 200_000);
    this.catalog
      .prepare("INSERT INTO session_compaction VALUES(?,?) ON CONFLICT(sessionId) DO UPDATE SET settings=excluded.settings")
      .run(row.id, JSON.stringify(next));
    this.compactions.set(row.id, next);
    this.notify();
    return { ...next };
  }

  /** Name every pi.tool task by its tool and every job run by its title, so a task list reads like the transcript. */
  async labelTasks(h: Harness, nodes: TaskNode[]): Promise<TaskNode[]> {
    return Promise.all(
      nodes.map(async (node) => {
        const key = `${node.conversationId}:${node.id}`;
        let known = this.taskLabels.get(key);
        if (!known) {
          known = await this.taskLabel(h, node).catch(() => undefined);
          if (!known) return node;
          this.taskLabels.set(key, known);
          if (this.taskLabels.size > 5000) this.taskLabels.delete(this.taskLabels.keys().next().value!);
        }
        return { ...node, ...known };
      }),
    );
  }

  private async taskLabel(h: Harness, node: TaskNode): Promise<{ label?: string; callId?: string } | undefined> {
    if (node.kind.startsWith("demo.job.")) {
      const run = (await h.snapshot(JobRuns, node.conversationId as ConversationId, ctx))?.items[String(node.id)];
      const def = jobDef(node.kind.slice("demo.job.".length));
      return def ? { label: run ? `${def.title} #${run.run}` : def.title } : undefined;
    }
    if (node.kind !== "pi.tool") return undefined;
    const task = await h.getTask(node.id as TaskId, ctx);
    const input = task?.input as { assistant?: number; callId?: string } | undefined;
    if (!input?.callId || input.assistant === undefined) return undefined;
    const entry = await h.commit((tx) => tx.entry(input.assistant as EntryId), ctx);
    for (const m of (entry?.model ?? []) as unknown as { role: string; content?: { type: string; id?: string; name?: string }[] }[])
      for (const b of m.role === "assistant" ? (m.content ?? []) : [])
        if (b.type === "toolCall" && b.id === input.callId) return { label: b.name, callId: input.callId };
    return { callId: input.callId };
  }

  // ------------------------------------------------------------ tree

  sessionSummaryBase(row: SessionRow) {
    return {
      id: row.id,
      name: row.name,
      cwd: row.cwd,
      model: row.model,
      createdAt: row.createdAt,
      dbPath: row.dbPath,
      compaction: this.compactionOf(row.id),
    };
  }

  async sessionSummary(row: SessionRow): Promise<SessionSummary> {
    if (!this.opened.has(row.id))
      return { ...this.sessionSummaryBase(row), busy: false, agents: [], error: this.errors.get(row.id) ?? "Session unavailable" };
    const agents = await this.agents(row);
    return { ...this.sessionSummaryBase(row), busy: agents.some((a) => a.busy), agents };
  }

  async tree(): Promise<DeviceTree> {
    const sessions = await Promise.all(this.list().map((row) => this.sessionSummary(row)));
    return { uid: this.uid, name: this.name, sessions, at: Date.now() };
  }

  // ------------------------------------------------------------ demo extension

  async demoState(c: Conversation, body: Record<string, unknown>) {
    let change = body as unknown as StateChange;
    if (body.operation === undefined) {
      const { value } = await this.shared.snapshot();
      if (typeof body.goal === "string")
        change = { operation: Object.hasOwn(value, "goal") ? "update" : "create", path: "/goal", value: body.goal };
      else if (body.increment === true) change = { operation: "increment", path: "/counter", value: 1 };
      else if (typeof body.note === "string") change = { operation: "create", path: "/notes/-", value: body.note };
      else throw invalid("A state operation is required");
    }
    await this.shared.change(
      change,
      undefined,
      typeof body.expectedRevision === "number" ? body.expectedRevision : undefined,
    );
    await c.commit(
      (tx) =>
        tx.appendEntry(c.id, {
          kind: "demo.state-change",
          data: { text: `Shared App State: ${change.operation} ${change.path || "/"}` },
        }),
      ctx,
    );
    return { ok: true as const, ...(await this.deviceDoc("app.shared-state")) };
  }

  /** Start a durable job from a client: the conversation owns the run, and a transcript entry anchors its card. */
  async startJob(row: SessionRow, h: Harness, c: Conversation, body: Record<string, unknown>) {
    const def = typeof body.job === "string" ? jobDef(body.job) : undefined;
    if (!def) throw invalid(`job must be one of ${JOB_DEFS.map((d) => d.id).join(", ")}`);
    let input;
    try {
      input = resolveJobInput(def, body.input ?? {});
    } catch (e) {
      throw invalid((e as Error).message);
    }
    const jobs = this.opened.get(row.id)?.profile.jobs;
    if (!jobs) throw new ApiFault("unavailable", "Session is not open");
    const taskId = await c.commit(async (tx) => {
      const id = await jobs.start(tx, c.id, { def, input, startedBy: "you", now: Date.now() });
      await tx.appendEntry(c.id, { kind: "demo.job", data: { taskId: id as number, job: def.id, text: `Started ${def.title}` } });
      return id;
    }, ctx);
    h.resume();
    return { taskId: taskId as number };
  }

  async approveJob(c: Conversation, taskId: number, approved: unknown) {
    if (typeof approved !== "boolean") throw invalid("approved must be a boolean");
    await c.commit(async (tx) => {
      const run = (await tx.doc(JobRuns, c.id)).items[String(taskId)];
      if (!run || run.approval !== "pending") throw new ApiFault("conflict", "No pending approval for that run");
      run.approval = approved ? "approved" : "declined";
    }, ctx);
    return { ok: true as const };
  }

  // ------------------------------------------------------------ lifecycle

  private async closeRuntime(harness: Harness | undefined, profile: RuntimeComposition | undefined, beforeClose?: () => Promise<void>, storage?: Storage) {
    const errors: unknown[] = [];
    for (const operation of [() => profile?.shutdown?.(ctx), beforeClose, () => harness ? harness.close(ctx) : storage?.close(ctx), () => profile?.cleanup?.(ctx)]) {
      if (!operation) continue;
      try { await operation(); } catch (error) { errors.push(error); }
    }
    if (errors.length === 1) throw errors[0];
    if (errors.length) throw new AggregateError(errors, "Runtime shutdown failed");
  }

  async close() {
    const sessions = [...this.opened.values()];
    this.opened.clear();
    const errors: unknown[] = [];
    for (const { harness, profile, unlock, unsubscribe } of sessions) {
      unsubscribe();
      try { await this.closeRuntime(harness, profile); }
      catch (error) { errors.push(error); }
      finally { unlock(); }
    }
    for (const operation of [() => this.shared?.close(), () => this.unlockShared?.(), () => this.catalog.close(), () => this.unlockCatalog()]) {
      try { await operation(); } catch (error) { errors.push(error); }
    }
    if (errors.length === 1) throw errors[0];
    if (errors.length) throw new AggregateError(errors, "Store shutdown failed");
  }
}

export type { Resolved };
