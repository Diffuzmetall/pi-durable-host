import { registerWorker } from 'iii-sdk';
import { Admission } from '../../src/auth.js';

const admission = new Admission(process.env.III_FIXTURE_PUBLIC_KEY, 'fixture-binding');
const client = registerWorker(process.env.III_FIXTURE_ENGINE, {
  workerName: 'disposable-fixture', namespace: 'durable-pi-test-transport',
  otel: { enabled: false }, enableMetricsReporting: false,
  headers: { authorization: '' },
  reconnectionConfig: { maxRetries: 3, initialDelayMs: 20, maxDelayMs: 40, jitterFactor: 0 },
});
client.registerFunction('durable-pi::fixture', payload => admission.authorize('durable-pi::fixture', payload));
process.on('message', async command => {
  if (command === 'close') { await client.shutdown(); process.disconnect(); }
});
