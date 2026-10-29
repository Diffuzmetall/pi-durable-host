import { DpiClient, type AgentHandle } from 'dpi-sdk';
import { registerWorker, type IIIClient } from 'iii-sdk';
import { Admission, fingerprint } from './auth.js';
import { workerConfig, type WorkerConfig } from './config.js';
import { input, record, requestKey, string, type Json } from './domain.js';

/** Original I/worker function IDs; only the supported native job/control surface is registered. */
export const CONTROL_OPERATIONS = ['controls::inspect', 'subagents::spawn', 'subagents::send', 'subagents::stop', 'supervisor::reply', 'conversations::follow_up', 'conversations::steer'] as const;
export const FUNCTIONS = ['info', 'start', 'task', 'run', 'follow_up', 'steer', 'requests::get', 'requests::result', 'controls::get', 'stop', ...CONTROL_OPERATIONS] as const;
export type Operation = typeof FUNCTIONS[number];

export class IiiAdapter {
  readonly config: Readonly<Omit<WorkerConfig, 'host'>> & { readonly host: Readonly<WorkerConfig['host']> };
  readonly configHash: string;
  readonly workerId: string;
  readonly #admission: Admission;
  readonly #agent: AgentHandle;

  constructor(config: unknown, token: string) {
    const parsed = workerConfig(config);
    this.config = Object.freeze({ ...parsed.value, host: Object.freeze(parsed.value.host) });
    this.configHash = parsed.configHash;
    this.workerId = fingerprint(this.config.publicKey);
    this.#admission = new Admission(this.config.publicKey, this.config.sessionId);
    this.#agent = new DpiClient(this.config.host.baseUrl, string(token, 8192), { requiredCapabilities: ['native-iii.v2'] })
      .agent(this.config.host.sessionId, this.config.host.agentId);
  }

  async verifyBinding() {
    const info = await this.#agent.iiiInfo();
    if (info.source !== 'iii' || info.authority !== 'delegated' || info.sessionId !== this.config.sessionId
      || info.workspace !== this.config.workspace || info.namespace !== this.config.namespace || info.configHash !== this.configHash
      || info.workerId !== this.workerId || info.nativeSessionId !== this.config.host.sessionId || info.ownerConversationId !== this.config.host.agentId) {
      throw Error('PERSISTED_BINDING_CONFLICT');
    }
    return info;
  }

  async invoke(functionId: string, envelope: unknown): Promise<unknown> {
    const operation = FUNCTIONS.find(name => functionId === `durable-pi::${name}`);
    if (!operation) throw Error('UNSUPPORTED_FUNCTION');
    const payload = this.#admission.authorize(functionId, envelope);
    // Never derive credentials, signer, namespace, source, tools or parent authority from this JSON.
    const body = record(payload);
    if (['start', 'task', 'run', 'follow_up', 'steer'].includes(operation)) {
      const command = input(payload, operation === 'steer' ? 'steer' : 'followUp',
        operation === 'follow_up' ? 'follow_up' : operation === 'steer' ? 'steer' : 'start');
      await this.verifyBinding();
      return operation === 'run' ? this.#agent.iiiRun(command) : this.#agent.iiiSubmit(command);
    }
    if (operation === 'info') {
      if (Object.keys(body).length) throw Error('UNKNOWN_INPUT_FIELD');
      return this.verifyBinding();
    }
    if (operation === 'requests::get' || operation === 'controls::get') {
      const key = operation === 'requests::get' ? 'requestId' : 'controlId';
      if (Object.keys(body).join(',') !== key) throw Error('UNKNOWN_INPUT_FIELD');
      const id = requestKey(body[key]);
      await this.verifyBinding();
      if (operation === 'requests::get') return this.#agent.iiiRequest(id);
      const [child, job] = await Promise.all([this.#agent.iiiControlReceipt(id), this.#agent.iiiJobStopReceipt(id)]);
      if (child && job) throw Error('CONTROL_ID_CONFLICT');
      return child ?? job;
    }
    if (operation === 'requests::result') {
      if (Object.keys(body).some(key => !['requestId', 'answerRef', 'cursor', 'limit'].includes(key))) throw Error('UNKNOWN_INPUT_FIELD');
      const requestId = requestKey(body.requestId), answerRef = string(body.answerRef, 256);
      const cursor = body.cursor === undefined ? undefined : string(body.cursor, 4096);
      if (body.limit !== undefined && (!Number.isSafeInteger(body.limit) || (body.limit as number) < 1 || (body.limit as number) > 16384)) throw Error('INVALID_RESULT_LIMIT');
      await this.verifyBinding();
      return this.#agent.iiiResult({ requestId, answerRef, ...(cursor === undefined ? {} : { cursor }), ...(body.limit === undefined ? {} : { limit: body.limit as number }) });
    }
    if (operation === 'stop') {
      if (Object.keys(body).sort().join(',') !== 'controlId,expectedGeneration,jobId') throw Error('UNKNOWN_INPUT_FIELD');
      const jobId = requestKey(body.jobId), controlId = requestKey(body.controlId);
      if (!Number.isSafeInteger(body.expectedGeneration) || (body.expectedGeneration as number) < 0) throw Error('INVALID_JOB_GENERATION');
      await this.verifyBinding();
      return this.#agent.iiiJobStop({ jobId, controlId, expectedGeneration: body.expectedGeneration as number });
    }
    // The actual native owner parses exact TargetRef/control revisions and decides permissions once.
    await this.verifyBinding();
    return this.#agent.iiiControl(operation as typeof CONTROL_OPERATIONS[number], payload as Json);
  }
}

export function registerBoundary(client: IIIClient, adapter: IiiAdapter) {
  let closed = false;
  const refs = FUNCTIONS.map(operation => {
    const functionId = `durable-pi::${operation}`;
    return client.registerFunction(functionId, envelope => {
      if (closed) throw Error('BRIDGE_CLOSED');
      return adapter.invoke(functionId, envelope);
    }, { description: 'Signed Ed25519 session-scoped delegated operation. Native host receipt is authoritative; transport timeout/disconnect does not cancel native work. Caller metadata grants no authority.' });
  });
  return {
    async close() {
      if (closed) return;
      closed = true;
      const failures: unknown[] = [];
      for (const ref of refs.reverse()) { try { ref.unregister(); } catch (error) { failures.push(error); } }
      try { await client.shutdown(); } catch (error) { failures.push(error); }
      if (failures.length) throw new AggregateError(failures, 'iii transport cleanup failed');
    },
  };
}

export async function connect(adapter: IiiAdapter) {
  await adapter.verifyBinding();
  const client = registerWorker(adapter.config.url, { workerName: 'durable-pi', namespace: adapter.config.namespace,
    otel: { enabled: false }, enableMetricsReporting: false, invocationTimeoutMs: 3000,
    reconnectionConfig: { maxRetries: Number.MAX_SAFE_INTEGER } });
  try { return registerBoundary(client, adapter); }
  catch (error) { await client.shutdown(); throw error; }
}
