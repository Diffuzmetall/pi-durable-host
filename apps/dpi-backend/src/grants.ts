import { createHash } from "node:crypto";

export type GrantAction = "read" | "write" | "control" | "filesystem" | "human-accept";
export type GrantTarget = { sessionId?: string; conversationId?: number };
export type BbGrantScope = Readonly<{ providerId: string; threadId: string }>;
export type IiiGrantScope = Readonly<{ bindingId: string; namespace: string; configHash: string; workerId: string }>;
export type GrantIdentity = Readonly<{
  actor: string;
  source: "terminal" | "bb" | "iii";
  authority: "human" | "delegated" | "observer";
}>;

/** Server configuration only. Never construct this from a command body. */
export type GrantSpec = {
  id: string;
  token: string;
  actor: string;
  source: GrantIdentity["source"];
  authority: GrantIdentity["authority"];
  permissions: readonly GrantAction[];
  binding: GrantTarget & { bb?: BbGrantScope; iii?: IiiGrantScope };
};

/** Object identity is checked, so an ID or a JSON copy is not an authorization handle. */
export type GrantHandle = Readonly<{ id: string }>;

type GrantRecord = {
  id: string;
  identity: GrantIdentity;
  permissions: ReadonlySet<GrantAction>;
  binding: Readonly<GrantTarget & { bb?: BbGrantScope; iii?: IiiGrantScope }>;
  revoked: AbortController;
};

export class GrantDenied extends Error {
  constructor(readonly status: 401 | 403) {
    super(status === 401 ? "Missing, invalid or revoked credential" : "Grant does not permit this operation");
  }
}

/** Policy seam: transport must authenticate, authorize each operation, and bind observation to signal(). */
export class GrantPolicy {
  private readonly tokens = new Map<string, GrantRecord>();
  private readonly ids = new Map<string, GrantRecord>();
  private readonly handles = new WeakMap<GrantHandle, GrantRecord>();

  constructor(specs: readonly GrantSpec[]) {
    for (const spec of specs) {
      if (!spec.id.trim() || !spec.token.trim() || !spec.actor.trim()) throw Error("Grant id, token and actor must be nonempty");
      if (spec.source === "iii" && spec.authority !== "delegated") throw Error("iii grants require delegated authority");
      if (spec.binding.conversationId !== undefined && !spec.binding.sessionId) throw Error("Conversation binding requires a session");
      if (spec.binding.bb && (spec.source !== 'bb' || !spec.binding.sessionId || !Number.isSafeInteger(spec.binding.conversationId) || spec.binding.conversationId! < 1 || !spec.binding.bb.providerId?.trim() || !spec.binding.bb.threadId?.trim()))
        throw Error('BB scope requires a BB source, session/conversation, provider and thread');
      if (spec.binding.iii) {
        const scope = spec.binding.iii;
        if (spec.source !== 'iii' || spec.authority !== 'delegated' || !spec.binding.sessionId || !Number.isSafeInteger(spec.binding.conversationId) || spec.binding.conversationId! < 1 ||
          !scope.bindingId?.trim() || scope.bindingId.length > 128 || !scope.workerId?.trim() || scope.workerId.length > 128 ||
          !/^[a-f0-9]{64}$/.test(scope.configHash) || scope.namespace !== 'default' && !/^durable-pi-test-[a-zA-Z0-9-]+$/.test(scope.namespace))
          throw Error('iii scope requires explicit delegated native root, binding, namespace, config hash and worker');
        if ([...this.ids.values()].some(record => record.binding.sessionId === spec.binding.sessionId && record.binding.iii?.bindingId === scope.bindingId))
          throw Error('Duplicate iii binding');
      }
      const digest = createHash("sha256").update(spec.token).digest("hex");
      if (this.ids.has(spec.id) || this.tokens.has(digest)) throw Error("Duplicate grant id or credential");
      const record: GrantRecord = {
        id: spec.id,
        identity: Object.freeze({ actor: spec.actor, source: spec.source, authority: spec.authority }),
        permissions: new Set(spec.permissions),
        binding: Object.freeze({ ...spec.binding, ...(spec.binding.bb ? { bb: Object.freeze({ ...spec.binding.bb }) } : {}), ...(spec.binding.iii ? { iii: Object.freeze({ bindingId: spec.binding.iii.bindingId, namespace: spec.binding.iii.namespace, configHash: spec.binding.iii.configHash, workerId: spec.binding.iii.workerId }) } : {}) }),
        revoked: new AbortController(),
      };
      this.tokens.set(digest, record);
      this.ids.set(spec.id, record);
    }
  }

  authenticate(token: string): GrantHandle {
    const digest = createHash("sha256").update(token).digest("hex");
    const record = this.tokens.get(digest);
    if (!record || record.revoked.signal.aborted) throw new GrantDenied(401);
    const handle = Object.freeze({ id: record.id });
    this.handles.set(handle, record);
    return handle;
  }

  /** Recheck inside queued native admission too; an earlier HTTP check is not sufficient. */
  assert(handle: GrantHandle, action: GrantAction, target: GrantTarget): GrantIdentity {
    return this.assertRecord(this.handles.get(handle), action, target);
  }

  /** Server-owned native policy reference, not a transport credential. Stable across equivalent policy reloads. */
  reference(handle: GrantHandle): string {
    const record = this.handles.get(handle);
    if (!record || record.revoked.signal.aborted) throw new GrantDenied(401);
    return this.referenceOf(record);
  }

  /** Server-configured BB selectors; possession of selectors is never authorization. */
  bbScope(handle: GrantHandle): BbGrantScope | undefined {
    const record = this.handles.get(handle);
    if (!record || record.revoked.signal.aborted) throw new GrantDenied(401);
    return record.binding.bb;
  }

  iiiScope(handle: GrantHandle): IiiGrantScope | undefined {
    const record = this.handles.get(handle);
    if (!record || record.revoked.signal.aborted) throw new GrantDenied(401);
    return record.binding.iii;
  }

  /** Trusted startup inventory, without transport credentials or caller-selected identities. */
  iiiBindings(sessionId: string) {
    return [...this.ids.values()].filter(record => !record.revoked.signal.aborted && record.binding.sessionId === sessionId && record.binding.iii)
      .map(record => ({ scope: record.binding.iii!, conversationId: record.binding.conversationId!, policy: this.referenceOf(record) }));
  }

  /** Only for policy references previously committed by trusted native admission, never HTTP-supplied IDs. */
  assertReference(reference: string, action: GrantAction, target: GrantTarget): GrantIdentity {
    const record = [...this.ids.values()].find((candidate) => this.referenceOf(candidate) === reference);
    return this.assertRecord(record, action, target);
  }

  private referenceOf(record: GrantRecord): string {
    return `policy:${createHash("sha256").update(JSON.stringify({
      id: record.id, identity: record.identity, permissions: [...record.permissions].sort(),
      session: record.binding.sessionId, conversation: record.binding.conversationId, bb: record.binding.bb, iii: record.binding.iii,
    })).digest("hex")}`;
  }

  private assertRecord(record: GrantRecord | undefined, action: GrantAction, target: GrantTarget): GrantIdentity {
    if (!record || record.revoked.signal.aborted) throw new GrantDenied(401);
    const { identity, binding } = record;
    if (
      !record.permissions.has(action) ||
      (identity.authority === "observer" && action !== "read") ||
      (action === "human-accept" && identity.authority !== "human") ||
      (binding.sessionId !== undefined && binding.sessionId !== target.sessionId) ||
      (binding.conversationId !== undefined && binding.conversationId !== target.conversationId)
    ) throw new GrantDenied(403);
    return identity;
  }

  /** Attach close/unsubscribe before sending protected data and check aborted before each emission. */
  signal(handle: GrantHandle): AbortSignal {
    const record = this.handles.get(handle);
    if (!record) throw new GrantDenied(401);
    return record.revoked.signal;
  }

  revoke(id: string): boolean {
    const record = this.ids.get(id);
    if (!record || record.revoked.signal.aborted) return false;
    record.revoked.abort();
    return true;
  }
}
