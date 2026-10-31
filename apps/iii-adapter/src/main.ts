#!/usr/bin/env node
import { readWorkerConfig } from './config.js';
import { IiiAdapter, connect } from './worker.js';

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--help') {
    console.log('Usage: dpi-iii-worker --config /absolute/path/to/owner-private-worker.json\nThe selected tokenEnv supplies a delegated host bearer. This starts only the iii function transport, never a Durable host.');
    return;
  }
  if (args.length !== 2 || args[0] !== '--config') throw Error('Usage: dpi-iii-worker --config /path/to/worker.json');
  const { value } = await readWorkerConfig(args[1]!);
  const token = process.env[value.host.tokenEnv];
  if (!token) throw Error(`Missing delegated host credential in ${value.host.tokenEnv}`);
  const adapter = new IiiAdapter(value, token), transport = await connect(adapter);
  console.log(JSON.stringify({ transport: 'starting', namespace: value.namespace, bindingId: value.sessionId, configHash: adapter.configHash,
    source: 'iii', authority: 'delegated', note: 'Host binding verified; engine registration is asynchronous. Closing this transport does not stop native jobs.' }));
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    await transport.close();
  };
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => {
    void stop().catch(error => { console.error(error instanceof Error ? error.message : 'iii transport shutdown failed'); process.exitCode = 1; });
  });
}

void main().catch(error => {
  console.error(error instanceof Error ? error.message : 'iii transport startup failed');
  process.exitCode = 1;
});
