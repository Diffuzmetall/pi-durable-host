import { randomUUID } from 'node:crypto';
import { AgentDoc, LiveDoc, GenerationTask, ToolTask, defineExtension, hook } from '@earendil-works/pi-durable';

export function usageDetails(usage = {}) {
  const n = key => Number.isFinite(usage[key]) && usage[key] > 0 ? usage[key] : 0;
  const output = n('output');
  const reasoning = n('reasoning') <= output ? n('reasoning') : 0;
  return Object.fromEntries(Object.entries({ input: n('input'), output: output - reasoning,
    output_reasoning_tokens: reasoning, cache_read_input_tokens: n('cacheRead'),
    cache_creation_input_tokens: n('cacheWrite') }).filter(([, value]) => value > 0));
}

/** Metadata only: intentionally never serialize messages, arguments, results, or error text. */
export async function createLangfuseTracing({ sessionId, sdk, report = () => {} } = {}) {
  const warn = () => { try { report(new Error('Langfuse tracing unavailable; agent execution is unaffected')); } catch {} };
  // The server supplies a session-local SDK; never read ambient credentials or global config.
  if (!sdk) return { enabled: false, bind: async () => {}, close: async () => {} };
  const roots = new Map();
  const generations = new Map();
  const tools = new Map();
  const processId = randomUUID();
  let graph;
  let unsubscribe = () => {};
  let closed = false;
  let flushing;
  let failed = false;
  const safe = operation => async (...args) => {
    if (closed || failed) return;
    try { return await operation(...args); } catch { failed = true; warn(); }
  };
  const meta = (api, extra = {}) => ({ session_id: sessionId, conversation_id: String(api.conversationId),
    task_id: String(api.taskId), process_id: processId, payload_policy: 'metadata-only', ...extra });
  const finish = (obs, status) => {
    if (status) obs.update({ level: 'WARNING', statusMessage: status });
    obs.end();
  };
  const flush = () => {
    flushing ??= Promise.resolve().then(() => sdk.flush()).catch(warn).finally(() => { flushing = undefined; });
    return flushing;
  };
  const rootFor = async (api, context) => {
    const live = await api.snapshot(LiveDoc, api.conversationId, context);
    const runId = String(live?.run?.inputs?.[0] ?? api.taskId);
    let root = roots.get(api.conversationId);
    if (root && root.runId !== runId) {
      finish(root.obs, 'Run superseded');
      roots.delete(api.conversationId);
      root = undefined;
    }
    if (root) return root;
    const owner = Object.values(graph?.value.tasks ?? {}).find(task => task.conversations.includes(api.conversationId));
    const parent = owner && roots.get(owner.conversationId);
    const obs = sdk.start('run-agent', 'agent', { input: '[not captured: metadata-only]',
      metadata: meta(api, { run_id: runId, ...(parent ? { parent_conversation_id: String(owner.conversationId) } : {}) }) }, parent?.obs);
    root = { runId, obs, answered: false, error: false };
    roots.set(api.conversationId, root);
    return root;
  };
  const extension = defineExtension({ name: 'langfuse-tracing', hooks: [
    hook(GenerationTask, {
      beforeRequest: safe(async (_request, api, context) => {
        const root = await rootFor(api, context);
        const previous = generations.get(api.taskId);
        if (previous) finish(previous.obs, 'Attempt superseded');
        const agent = await api.snapshot(AgentDoc, api.conversationId, context);
        const obs = sdk.start('generate-response', 'generation', { model: agent?.model?.modelId,
          input: '[not captured: metadata-only]', metadata: meta(api, { provider: agent?.model?.provider }) }, root.obs);
        generations.set(api.taskId, { obs, conversationId: api.conversationId });
      }),
      afterResponse: safe(async (message, api, context) => {
        const root = await rootFor(api, context);
        let generation = generations.get(api.taskId);
        // Deferred responses/recovery may have no beforeRequest in this process. Never invent their latency.
        if (!generation) generation = { obs: sdk.start('generate-response', 'generation', {
          metadata: meta(api, { timing_incomplete: true }) }, root.obs) };
        const isError = ['error', 'aborted'].includes(message.stopReason);
        root.error ||= isError;
        const cost = message.usage?.cost?.total;
        generation.obs.update({ model: message.responseModel || message.model,
          usageDetails: usageDetails(message.usage),
          // Preserve explicit zero spend (subscriptions) instead of server-side API repricing.
          ...(Number.isFinite(cost) && cost >= 0 ? { costDetails: { total: cost } } : {}),
          output: '[not captured: metadata-only]',
          ...(isError ? { level: 'ERROR', statusMessage: `Provider ${message.stopReason}` } : {}),
          metadata: meta(api, { provider: message.provider, stop_reason: message.stopReason }) });
        generation.obs.end();
        generations.delete(api.taskId);
      }),
      onYield: safe(async (_answer, api) => {
        const root = roots.get(api.conversationId);
        if (root) { root.answered = true; root.obs.update({ output: '[not captured: metadata-only]' }); }
      }),
    }),
    hook(ToolTask, {
      beforeTool: safe(async (call, api, context) => {
        const root = await rootFor(api, context);
        const parent = call.parent && tools.get(call.parent.taskId);
        const obs = sdk.start(`execute-${call.name}`, 'tool', { input: '[not captured: metadata-only]',
          metadata: meta(api, { call_id: call.id, tool_name: call.name,
            ...(call.parent ? { parent_task_id: String(call.parent.taskId) } : {}) }) }, parent?.obs ?? root.obs);
        tools.set(api.taskId, { obs, conversationId: api.conversationId });
      }),
      afterTool: safe(async (call, result, api) => {
        const tool = tools.get(api.taskId);
        if (!tool) return;
        const root = roots.get(api.conversationId);
        const error = Boolean(result.isError) || result.diagnostics?.some(item => item.severity === 'error');
        const warning = result.diagnostics?.some(item => item.severity === 'warn');
        if (root) root.error ||= Boolean(error);
        if (result.usage) {
          const cost = result.usage.cost?.total;
          const usage = sdk.start('generate-tool-response', 'generation', {
            usageDetails: usageDetails(result.usage),
            ...(Number.isFinite(cost) && cost >= 0 ? { costDetails: { total: cost } } : {}),
            metadata: meta(api, { model_unknown: true, timing_incomplete: true }) }, tool.obs);
          usage.end();
        }
        tool.obs.update({ output: '[not captured: metadata-only]',
          ...(error ? { level: 'ERROR', statusMessage: 'Tool failed or reported an error' }
            : warning ? { level: 'WARNING', statusMessage: 'Tool reported a warning' } : {}),
          metadata: meta(api, { call_id: call.id, is_error: Boolean(result.isError) }) });
        tool.obs.end(); tools.delete(api.taskId);
      }),
    }),
  ] });
  const reconcile = () => {
    if (closed || failed) return;
    try {
      const tasks = graph.value.tasks;
      for (const pending of [generations, tools]) for (const [id, entry] of pending) {
        if (!tasks[id] || tasks[id].abortRequested) {
          finish(entry.obs, 'Interrupted or blocked'); pending.delete(id);
        }
      }
      for (const [id, root] of roots) {
        const active = Object.values(tasks).some(task => task.conversationId === id && ['pi.generation', 'pi.tool'].includes(task.kind));
        if (active) continue;
        root.obs.update({ ...(root.error ? { level: 'ERROR', statusMessage: 'Run contained errors' } : {}),
          metadata: { completed_answer: root.answered } });
        finish(root.obs, !root.answered && !root.error ? 'Run ended without answer' : undefined);
        roots.delete(id);
        void flush();
      }
    } catch { failed = true; warn(); }
  };
  return { enabled: true, extension,
    async bind(harness, context) {
      try {
        graph = await harness.taskGraph(context);
        unsubscribe = graph.subscribe(reconcile);
      } catch { failed = true; warn(); }
    },
    async close() {
      if (closed) return;
      closed = true;
      try {
        unsubscribe(); graph?.dispose();
        for (const pending of [generations, tools]) for (const { obs } of pending.values()) finish(obs, 'Host closed');
        for (const root of roots.values()) finish(root.obs, 'Host closed');
      } catch { warn(); }
      finally {
        roots.clear(); generations.clear(); tools.clear();
        await flushing;
        await sdk.close().catch(warn);
      }
    },
  };
}
