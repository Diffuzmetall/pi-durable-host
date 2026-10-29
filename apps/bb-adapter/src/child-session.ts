import { createHash } from 'node:crypto';
import type { NativeBbBinding, NativeBbOutcome, NativeParentCommand, NativeParentTarget } from 'dpi-sdk/api';
import type { BbThreadSession } from './session.js';
import { openHistorySink, type CoreResult } from './history-sink.js';
import { projectHostHistory, type CoherentHistoryProjection } from './history-projector.js';
import type { HistoricalSnapshot } from './history-types.js';
import { bbInputRequestId } from './request-key.js';

type ExactTarget = Required<NativeParentTarget>;
export interface ChildCapture {
  frame: NativeBbOutcome;
  applied?: CoreResult;
  omissions?: CoherentHistoryProjection['omissions'];
}
/** An existing child BB alias. All execution goes through its current native parent, never child promotion. */
export class BbChildSession {
  readonly providerThreadId: string;
  private busy = false;
  private watching = false;
  private pending?: HistoricalSnapshot;
  private readonly lifetime = new AbortController();
  private constructor(readonly parent: BbThreadSession, readonly binding: Readonly<NativeBbBinding>,
    private readonly sink: Awaited<ReturnType<typeof openHistorySink>>) {
    this.providerThreadId = `${binding.sessionId}:${binding.conversationId}`;
  }
  static async open(parent: BbThreadSession, threadId: string): Promise<BbChildSession> {
    const binding = await parent.bindingForChild(threadId);
    await parent.options.client.protocol({ requiredCapabilities: ['native-bb-outcome.v1', 'native-parent-target.v1', 'native-bb-input.v1'] });
    // Core authorizes digest BEFORE any native capture/observation; no rebase after an uncertain apply.
    const sink = await openHistorySink({ threadId, request: (method, params) => parent.options.core.reconcileExisting(method, params) });
    if (parent.signal.aborted) throw Error('BB_SESSION_DETACHED');
    parent.options.core.notify('thread/identity', { threadId, providerThreadId: `${binding.sessionId}:${binding.conversationId}`, sessionRestorable: true });
    return new BbChildSession(parent, Object.freeze({ ...binding }), sink);
  }
  private assertOpen() {
    if (this.lifetime.signal.aborted || this.parent.signal.aborted) throw Error('BB_SESSION_DETACHED');
  }
  private async checkBinding() {
    this.assertOpen();
    const current = await this.parent.bindingForChild(this.binding.bbThreadId);
    if (current.conversationId !== this.binding.conversationId || current.parentThreadId !== this.binding.parentThreadId)
      throw Error('BB_OWNER_CHILD_SCOPE_MISMATCH');
    this.assertOpen();
  }
  private async execute(command: NativeParentCommand) {
    const envelope = structuredClone(command);
    if (envelope.action === 'spawn' || envelope.target.conversationId !== this.binding.conversationId || !envelope.target.executionId || !envelope.target.requestId)
      throw Error('BB_EXACT_EXISTING_CHILD_REQUIRED');
    await this.checkBinding();
    return this.parent.control(envelope);
  }
  private async send(text: string, clientRequestId: string, followUp: boolean) {
    const controlId = bbInputRequestId(clientRequestId, 'child');
    await this.checkBinding();
    const previous = await this.parent.controlReceipt(controlId);
    if (previous && (previous.action !== 'send' || previous.conversationId !== this.binding.conversationId)) throw Error('BB_REQUEST_SCOPE_CONFLICT');
    const context = previous ? previous.retryContext : await this.parent.childControlContext(this.binding.conversationId);
    if (!context || context.target.conversationId !== this.binding.conversationId) throw Error('BB_NATIVE_RETRY_CONTEXT_UNAVAILABLE');
    // Original native fingerprint rechecks text/mode + stored revision/target, including across process reopen.
    return this.execute({ action: 'send', controlId, expectedRevision: context.expectedRevision, target: context.target, task: text, followUp });
  }
  async prompt(text: string, clientRequestId: string) { return this.send(text, clientRequestId, true); }
  async steer(text: string, clientRequestId: string) { return this.send(text, clientRequestId, false); }
  async interrupt(intentKey: string) {
    if (!intentKey) throw Error('BB_STOP_INTENT_REQUIRED');
    const controlId = `bb-stop:${createHash('sha256').update(JSON.stringify([this.binding.bbThreadId, intentKey])).digest('hex')}`;
    await this.checkBinding();
    const previous = await this.parent.controlReceipt(controlId);
    if (previous) {
      if (previous.action !== 'stop' || previous.conversationId !== this.binding.conversationId || previous.scope !== 'child-tree') throw Error('BB_REQUEST_SCOPE_CONFLICT');
      await this.parent.reconcileParent();
      return this.parent.controlReceipt(controlId); // SAME pending barrier, never a second stop admission.
    }
    const context = await this.parent.childControlContext(this.binding.conversationId);
    return this.execute({ action: 'stop', controlId, ...context, scope: 'child-tree' });
  }
  async stop(controlId: string, expectedRevision: string, target: ExactTarget) {
    return this.execute({ action: 'stop', controlId, expectedRevision, target, scope: 'child-tree' });
  }
  async reply(controlId: string, expectedRevision: string, target: ExactTarget, replyTo: string, message: string) {
    return this.execute({ action: 'reply', controlId, expectedRevision, target, replyTo, message });
  }
  async captureHistory(): Promise<ChildCapture> {
    if (this.busy) throw Error('BB_CONCURRENT_CAPTURE_REFUSED');
    if (this.pending) throw Error('BB_HISTORY_UNCONFIRMED_RETRY_IDENTICAL_ONLY');
    this.busy = true;
    try {
      await this.checkBinding();
      const frame = await this.parent.native.bbOutcome(this.binding.bbThreadId);
      return await this.applyFrame(frame);
    } finally { this.busy = false; }
  }
  private async applyFrame(frame: NativeBbOutcome): Promise<ChildCapture> {
    this.assertOpen();
    if (frame.status === 'unknown' || frame.status === 'working' && !frame.entries) return { frame };
    if (frame.status !== 'working' && (frame.conversationId !== this.binding.conversationId || frame.parentConversationId !== this.parent.options.conversationId))
      throw Error('BB_COHERENT_SCOPE_MISMATCH');
    if (frame.entries!.some(entry => entry.conversationId !== this.binding.conversationId)) throw Error('BB_COHERENT_SCOPE_MISMATCH');
    const projection = projectHostHistory(frame);
    this.pending = structuredClone(projection.snapshot);
    const applied = await this.sink.apply(this.pending);
    this.pending = undefined;
    return { frame, applied, omissions: projection.omissions };
  }
  /** One awaited coherent capture/apply at a time. EOF/error ends observation; caller reconnects explicitly. */
  async observe(signal: AbortSignal, onCapture: (capture: ChildCapture) => void | Promise<void> = () => {}): Promise<void> {
    if (this.busy) throw Error('BB_CONCURRENT_CAPTURE_REFUSED');
    if (this.pending) throw Error('BB_HISTORY_UNCONFIRMED_RETRY_IDENTICAL_ONLY');
    this.busy = true;
    const combined = AbortSignal.any([signal, this.lifetime.signal, this.parent.signal]);
    this.watching = true;
    try {
      await this.checkBinding();
      for await (const frame of this.parent.native.bbOutcomes(this.binding.bbThreadId, combined)) {
        combined.throwIfAborted();
        await onCapture(await this.applyFrame(frame));
      }
    } finally { this.busy = false; this.watching = false; }
  }
  async retryHistory(): Promise<CoreResult> {
    if (this.busy) throw Error('BB_CONCURRENT_CAPTURE_REFUSED');
    if (!this.pending) throw Error('BB_NO_UNCONFIRMED_HISTORY');
    this.busy = true;
    try {
      await this.checkBinding();
      const result = await this.sink.apply(this.pending); // ORIGINAL snapshot/digest, no recapture/read/rebase.
      this.pending = undefined;
      return result;
    } finally { this.busy = false; }
  }
  get observing(): boolean { return this.watching; }
  get closed(): boolean { return this.lifetime.signal.aborted || this.parent.signal.aborted; }
  close(): void { this.lifetime.abort(); }
}
