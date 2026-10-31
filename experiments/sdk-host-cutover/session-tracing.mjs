// Use the installed v6 attribute/export APIs, but never a process-global Langfuse tracer.
import { LangfuseSpanProcessor } from '@langfuse/otel';
import { createObservationAttributes } from '@langfuse/tracing';
import { NodeTracerProvider, ParentBasedSampler, TraceIdRatioBasedSampler } from '@opentelemetry/sdk-trace-node';
import { ROOT_CONTEXT, trace } from '@opentelemetry/api';
import { ProblemTraceProcessor } from '/home/ubuntu/.local/share/pi-durable/tui-releases/20261030-headless-48a55067/extensions-lane/packages/langfuse/src/problem-traces.mjs';

export function createSessionTracing(config, { exporter } = {}) {
  const secrets = [config.publicKey, config.secretKey].filter(Boolean);
  const processor = new LangfuseSpanProcessor({ ...config, exporter, timeout: 2,
    flushInterval: 5, flushAt: 64, mediaUploadEnabled: false,
    shouldExportSpan: ({ otelSpan }) => Boolean(otelSpan.attributes['pi.durable.tracing']),
    mask: ({ data }) => typeof data === 'string' ? secrets.reduce((text, secret) => text.split(secret).join('[REDACTED]'), data) : data,
  });
  const problems = config.traceMode === 'problems';
  const selected = problems ? new ProblemTraceProcessor(processor) : processor;
  const provider = new NodeTracerProvider({ spanProcessors: [selected],
    sampler: new ParentBasedSampler({ root: new TraceIdRatioBasedSampler(problems ? 1 : config.sampleRate ?? 1) }) });
  const tracer = provider.getTracer('pi-durable-host');
  let closed = false;
  return {
    start(name, type, attributes, parent) {
      if (closed) throw Error('SESSION_TRACING_CLOSED');
      const span = tracer.startSpan(name, { attributes: {
        ...createObservationAttributes(type, attributes), 'pi.durable.tracing': true,
        'langfuse.trace.name': 'run-agent', 'langfuse.trace.tags': ['pi-durable'],
        'langfuse.session.id': attributes.metadata.session_id,
        ...(config.userId ? { 'langfuse.user.id': config.userId } : {}),
      } }, parent ? trace.setSpanContext(ROOT_CONTEXT, parent.otelSpan.spanContext()) : ROOT_CONTEXT);
      return { otelSpan: span,
        update(next) { span.setAttributes(createObservationAttributes(type, next)); },
        end() { span.end(); },
      };
    },
    flush: () => provider.forceFlush(),
    async close() { if (!closed) { closed = true; await provider.shutdown(); } },
  };
}
