import assert from 'node:assert/strict';
import { test } from 'node:test';
import { once } from 'node:events';
import { join } from 'node:path';
import { BACKGROUND_CONTEXT as ctx } from '@earendil-works/chord/context';
import { fauxProvider, fauxAssistantMessage, fauxToolCall } from '@earendil-works/pi-ai/providers/faux';
import { Store } from '../src/store.ts';
import { GrantPolicy } from '../src/grants.ts';
import { createHttpServer } from '../src/http-server.ts';
import { createNativeProfile } from '../src/native-profile/profile.ts';
import { createGitHubTriggerCapabilities } from '../src/native-profile/automation/github-triggers.mjs';
import { WatchesDoc } from '../src/native-profile/automation/triggers.mjs';
import { DpiClient } from '../../dpi-sdk/src/client.ts';
import { tempStore, faux, until } from './helpers.ts';

const owner = { id: 'operator', token: 'fixture-native-observability', actor: 'operator', source: 'terminal', authority: 'human',
  permissions: ['read', 'write', 'control', 'filesystem', 'human-accept'], binding: {} };

test('GitHub transport refuses implicit HOME/config before any external operation', () => {
  assert.throws(() => createGitHubTriggerCapabilities(), /GITHUB_EXPLICIT_ENV_REQUIRED/);
});

test('native triggers/tracing compose with Store: isolated metadata, durable watch/reopen and current revoke', { timeout: 35000 }, async () => {
  const temp = await tempStore();
  const policy = new GrantPolicy([owner]);
  const traceRecords = [], closed = [], reads = [];
  let issue = 1, available = true;
  const profile = createNativeProfile({ policy, owner: policy.authenticate(owner.token),
    connectMcp: async () => ({ sources: [], close: async () => {} }),
    github: context => ({ env: { HOME: context.directory, GH_CONFIG_DIR: join(context.directory, 'github'), GH_TOKEN: `fixture-${context.sessionId}` },
      execFile(command, args, options, callback) {
        assert.equal(command, 'gh'); assert.deepEqual(args.slice(0, 5), ['api', '--hostname', 'github.com', '--method', 'GET']);
        assert.equal(options.shell, false); assert.equal(options.env.GH_TOKEN, `fixture-${context.sessionId}`);
        assert.equal(options.env.HOME, context.directory); assert.equal(options.env.GH_DEBUG, undefined);
        const endpoint = args[5]; reads.push({ session: context.sessionId, endpoint });
        const row = { id: issue, number: issue, updated_at: new Date().toISOString(), user: { id: 1, login: 'fixture' } };
        let response;
        if (endpoint === 'user') response = { id: 1, login: 'fixture' };
        else if (endpoint === 'repos/fixture/project') response = { full_name: 'fixture/project', permissions: { push: true } };
        else if (endpoint.includes('/collaborators/')) response = { permission: 'write', user: { id: 1, login: 'fixture' } };
        else if (endpoint.includes('/issues?')) response = available ? [row] : [];
        else if (endpoint === `repos/fixture/project/issues/${issue}`) { response = row; available = false; }
        else throw Error(`Unexpected fixture endpoint: ${endpoint}`);
        queueMicrotask(() => callback(null, JSON.stringify(response), ''));
        return { kill() {} };
      },
    }),
    tracing: context => ({ sdk: {
      start(name, type, input, parent) {
        assert.equal(input.metadata.session_id, context.sessionId);
        const record = { session: context.sessionId, name, type, input, parent: parent?.id, updates: [], ended: false };
        traceRecords.push(record);
        return { id: traceRecords.length, update(value) { record.updates.push(value); }, end() { record.ended = true; } };
      },
      async flush() {}, async close() { closed.push(context.sessionId); },
    } }),
  });
  let store, server;
  const scripted = fauxProvider({ provider: 'faux', models: [{ id: 'echo', contextWindow: 128000, maxTokens: 8192 }], tokensPerSecond: 100000 });
  const start = async () => {
    store = await Store.open({ ...temp.options, profile }); store.models.setProvider(scripted.provider);
    server = createHttpServer(store, policy).listen(0, '127.0.0.1'); await once(server, 'listening');
    return new DpiClient(`http://127.0.0.1:${server.address().port}`, owner.token);
  };
  const stop = async () => {
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); server = undefined; }
    if (store) { await store.close(); store = undefined; }
  };
  try {
    let client = await start();
    const A = await store.create({ cwd: temp.work, name: 'trace-A', model: faux });
    const B = await store.create({ cwd: temp.work, name: 'trace-B', model: faux });
    scripted.setResponses([fauxAssistantMessage(fauxToolCall('repo_watch', { action: 'add', repo: 'fixture/project', events: ['issues'],
      instructions: 'Report local fixture event only', maxMessages: 3, maxWakes: 20, intervalMs: 1000, lifetimeMs: 30000 }), { stopReason: 'toolUse' }),
      ...Array.from({ length: 20 }, () => fauxAssistantMessage('FIXTURE_PRIVATE_RESPONSE'))]);
    await client.agent(A.id, 1).send('FIXTURE_PRIVATE_INPUT', 'followUp', 'watch-add', 10000);
    let watch;
    await until(async () => {
      watch = Object.values((await client.agent(A.id, 1).doc('durable.triggers.watches')).value.items)[0];
      return watch?.sent === 1;
    }, 10000, 'native trigger admits one screened event');
    const { id, taskId } = watch;
    await client.agent(B.id, 1).send('B_PRIVATE_INPUT', 'followUp', 'trace-b', 10000);
    assert.deepEqual((await client.agent(B.id, 1).doc('durable.triggers.watches')).value?.items ?? {}, {});
    assert.ok(traceRecords.some(r => r.session === A.id && r.type === 'tool'));
    assert.ok(traceRecords.some(r => r.session === B.id && r.type === 'generation'));
    assert.ok(!JSON.stringify(traceRecords).includes('PRIVATE_'), 'traces contain no prompts, outputs or arguments');
    assert.ok(!JSON.stringify(traceRecords).includes(`fixture-${A.id}`), 'no GitHub credential in tracing');
    await stop();
    assert.ok(closed.includes(A.id) && closed.includes(B.id));
    issue = 2; available = true;
    scripted.setResponses(Array.from({ length: 20 }, () => fauxAssistantMessage('FIXTURE_PRIVATE_RESPONSE')));
    client = await start();
    await until(async () => {
      watch = Object.values((await client.agent(A.id, 1).doc('durable.triggers.watches')).value.items)[0];
      return watch?.sent === 2;
    }, 10000, 'same native watch resumes and admits second event');
    assert.equal(watch.id, id); assert.equal(watch.taskId, taskId);
    const { h, c } = await store.resolveAgent(A.id, 'main');
    policy.revoke(owner.id);
    const before = reads.length;
    await until(async () => (await h.snapshot(WatchesDoc, c.id, ctx)).items[id].note !== null, 5000, 'revoked poll fails closed');
    assert.equal(reads.length, before, 'revoked owner cannot perform even GitHub account lookup');
    assert.equal((await h.snapshot(WatchesDoc, c.id, ctx)).items[id].sent, 2);
    await assert.rejects(client.agent(A.id, 1).get(), { status: 401 });
  } finally { await stop(); await temp.cleanup(); }
});
