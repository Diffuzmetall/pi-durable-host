import test from 'node:test';
import assert from 'node:assert/strict';
const { createMcpManager } = await import(process.env.MCP_TEST_BUNDLE ?? '../sdk-host-cutover/compiled/nico.mjs');

// Protocol fixture only: no real server, credentials, process or model. Exercise
// the actual pinned manager/adapter using its public transport contract.
function fixture(failClose, onCall, onClose) {
  const census = { opened: 0, closed: 0, closeFailures: 0, live: 0 };
  const spec = revision => ({
    name: 'fixture', revision: String(revision), lifecycle: 'keep-alive',
    createTransport: async () => {
      let closed = false;
      census.opened++;
      census.live++;
      return {
        async start() {},
        async send(message) {
          if (message.id === undefined) return;
          let result = {};
          if (message.method === 'initialize') result = {
            protocolVersion: '2025-03-26', capabilities: { tools: {} },
            serverInfo: { name: 'fixture', version: '1' },
          };
          if (message.method === 'tools/list') result = {
            tools: [{ name: 'echo', inputSchema: { type: 'object' } }],
          };
          if (message.method === 'tools/call') {
            await onCall?.(revision);
            result = { content: [{ type: 'text', text: String(revision) }] };
          }
          queueMicrotask(() => this.onmessage?.({ jsonrpc: '2.0', id: message.id, result }));
        },
        async close() {
          if (closed) return;
          if (failClose) {
            census.closeFailures++;
            throw new Error('FIXTURE_TRANSPORT_CLEANUP_FAILED');
          }
          closed = true;
          census.live--;
          census.closed++;
          this.onclose?.();
          onClose?.(revision);
        },
      };
    },
  });
  return { census, spec };
}

for (const mode of ['staged', 'legacy']) {
  test(`${mode} publication isolates throwing observers and still notifies the next subscriber`, async t => {
    const { spec, census } = fixture(false);
    const manager = createMcpManager({ servers: [spec(0)], authorize: async () => {} });
    t.after(() => manager.close());
    await manager.ready();
    const original = manager.catalog()[0];
    let notifications = 0;
    manager.onChange(() => { throw Error('FIXTURE_OBSERVER_FAILURE'); });
    manager.onChange(() => { notifications++; });
    if (mode === 'staged') {
      const candidate = await manager.prepareReload([spec(1)]);
      candidate.validate();
      assert.doesNotThrow(() => candidate.publish());
      await candidate.drain();
    } else {
      await assert.doesNotReject(manager.reload([spec(1)]));
      await new Promise(resolve => setImmediate(resolve));
    }
    assert.equal(notifications, 1, 'one failing observer must not skip the next subscriber');
    const current = manager.catalog()[0];
    assert.notEqual(current, original);
    assert.equal((await manager.call(current, {}, { callId: `${mode}-after-observer-failure` })).content[0].text, '1');
    await assert.rejects(manager.call(original, {}, { callId: `${mode}-old-generation` }), /NOT_SENT/);
    assert.equal(census.live, 1);
    // A notification failure must not poison the owner or wedge its next candidate.
    const next = await manager.prepareReload([spec(2)]);
    next.publish(); await next.drain();
    assert.equal(notifications, 2);
    assert.equal((await manager.call(manager.catalog()[0], {}, { callId: `${mode}-next-generation` })).content[0].text, '2');
  });
}

async function replaceTwenty(manager, spec) {
  await manager.ready();
  for (let revision = 1; revision <= 20; revision++) {
    await manager.reload([spec(revision)]);
    await new Promise(resolve => setImmediate(resolve));
  }
}

test('MCP manager exposes unpublished preparation on its existing owner', async t => {
  const { spec } = fixture(false);
  const manager = createMcpManager({ servers: [spec(0)], authorize: async () => {} });
  t.after(() => manager.close());
  await manager.ready();
  assert.equal(typeof manager.prepareReload, 'function',
    'native validation needs staged catalogue without publishing active slots');
});

test('twenty healthy replacements keep one transport and final close drains it', async t => {
  const { spec, census } = fixture(false);
  const manager = createMcpManager({ servers: [spec(0)], authorize: async () => {} });
  t.after(() => manager.close());
  await replaceTwenty(manager, spec);
  assert.deepEqual(census, { opened: 21, closed: 20, closeFailures: 0, live: 1 });
  await manager.close();
  assert.deepEqual(census, { opened: 21, closed: 21, closeFailures: 0, live: 0 });
  console.log('HEALTHY_CENSUS', JSON.stringify(census));
});

test('cleanup failure must fence subsequent replacement instead of accumulating transports', async t => {
  const { spec, census } = fixture(true);
  const manager = createMcpManager({ servers: [spec(0)], authorize: async () => {} });
  t.after(() => assert.rejects(manager.close(), /CLEANUP_FAILED/));
  let failure;
  try {
    await replaceTwenty(manager, spec);
  } catch (error) {
    failure = error;
  }
  console.log('CLEANUP_FAILURE_CENSUS', JSON.stringify(census), 'surfaced', Boolean(failure));
  assert(failure, 'transport cleanup error must remain visible; later replacements must not proceed');
  assert(census.opened <= 2, 'no third generation after first failed cleanup');
  await assert.rejects(manager.prepareReload([spec(22)]), /CLEANUP_FAILED/);
  assert.equal(manager.status()[0].error, 'cleanup_failed');
});

test('unsettled transport factory is failed cleanup, never permission for another generation', async t => {
  let releaseFactory, lateClosed;
  const gate = new Promise(resolve => { releaseFactory = resolve; });
  const late = new Promise(resolve => { lateClosed = resolve; });
  const { spec, census } = fixture(false, undefined, revision => { if (revision === 1) lateClosed(); });
  const manager = createMcpManager({ servers: [spec(0)], authorize: async () => {} });
  t.after(() => assert.rejects(manager.close(), /CLEANUP_FAILED/));
  t.after(() => releaseFactory());
  await manager.ready();
  const original = manager.catalog()[0];
  await assert.rejects(manager.prepareReload([{ ...spec(1), timeoutMs: 20,
    async createTransport(context) { await gate; return spec(1).createTransport(context); },
  }]), /CLEANUP_FAILED/);
  assert.equal(manager.catalog()[0], original);
  await assert.rejects(manager.prepareReload([spec(2)]), /CLEANUP_FAILED/);
  assert.equal(census.opened, 1);
  releaseFactory();
  await late;
  assert.equal(census.live, 1, 'late factory result closed without adoption');
});

test('staging and discarded native candidate leave active descriptors callable', async t => {
  const { spec, census } = fixture(false);
  const manager = createMcpManager({ servers: [spec(0)], authorize: async () => {} });
  t.after(() => manager.close());
  await manager.ready();
  const original = manager.catalog()[0];
  const prepared = await manager.prepareReload([spec(1)]);
  const candidate = prepared.catalog()[0];
  assert.equal(manager.catalog()[0], original);
  assert.notEqual(candidate, original);
  assert.equal((await manager.call(original, {}, { callId: 'old-while-staged' })).content[0].text, '0');
  await assert.rejects(manager.call(candidate, {}, { callId: 'unpublished' }), /NOT_SENT/);
  await prepared.discard();
  assert.equal(manager.catalog()[0], original);
  assert.equal(census.live, 1);
  assert.throws(() => prepared.publish(), /NOT_SENT/);
  assert.equal((await manager.call(original, {}, { callId: 'after-native-rejection' })).content[0].text, '0');
});

test('published replacement drains admitted call without aborting or replacing its result', async t => {
  let release, entered;
  const held = new Promise(resolve => { release = resolve; });
  const started = new Promise(resolve => { entered = resolve; });
  const { spec, census } = fixture(false, async revision => {
    if (revision === 0) { entered(); await held; }
  });
  const manager = createMcpManager({ servers: [spec(0)], authorize: async () => {} });
  t.after(() => manager.close());
  t.after(() => release());
  await manager.ready();
  const original = manager.catalog()[0];
  const call = manager.call(original, {}, { callId: 'admitted-v0' });
  await started;
  const prepared = await manager.prepareReload([spec(1)]);
  prepared.publish();
  assert.equal(census.live, 2, 'old transport lives until its admitted call settles');
  await assert.rejects(manager.prepareReload([spec(2)]), /CONFIG_ERROR/);
  assert.equal(census.opened, 2, 'no further generation while cleanup is pending');
  assert.equal((await manager.call(manager.catalog()[0], {}, { callId: 'new-v1' })).content[0].text, '1');
  await assert.rejects(manager.call(original, {}, { callId: 'late-v0' }), /NOT_SENT/);
  release();
  assert.equal((await call).content[0].text, '0');
  await prepared.drain();
  assert.equal(census.live, 1);
});

test('legacy reload returns before drain and final close sweeps retired generations', async t => {
  let release, entered;
  const held = new Promise(resolve => { release = resolve; });
  const started = new Promise(resolve => { entered = resolve; });
  const { spec, census } = fixture(false, async revision => {
    if (revision === 0) { entered(); await held; }
  });
  const manager = createMcpManager({ servers: [spec(0)], authorize: async () => {} });
  t.after(() => manager.close());
  t.after(() => release());
  await manager.ready();
  const pending = manager.call(manager.catalog()[0], {}, { callId: 'retired-on-final-close' })
    .then(() => 'fulfilled', () => 'rejected');
  await started;
  await manager.reload([spec(1)]);
  assert.equal(census.live, 2);
  await manager.close();
  assert.equal(await pending, 'rejected');
  assert.equal(census.live, 0);
  assert.equal(census.opened, 2);
});

test('failed preparation preserves active generation and policy revoke still denies', async t => {
  let allowed = true;
  const { spec, census } = fixture(false);
  const manager = createMcpManager({ servers: [spec(0)], authorize: async () => {
    if (!allowed) throw new Error('PRIVATE_POLICY_DETAIL');
  } });
  t.after(() => manager.close());
  await manager.ready();
  const original = manager.catalog()[0];
  const broken = { ...spec(1), createTransport() { throw new Error('PRIVATE_CREDENTIAL_DETAIL'); } };
  await assert.rejects(manager.prepareReload([broken]), error => {
    assert(!error.message.includes('PRIVATE_'));
    return true;
  });
  assert.equal(manager.catalog()[0], original);
  assert.equal(census.live, 1);
  await manager.reload([spec(2)]);
  allowed = false;
  await assert.rejects(manager.call(manager.catalog()[0], {}, { callId: 'revoked' }), error => {
    assert(!error.message.includes('PRIVATE_'));
    return /NOT_SENT/.test(error.message);
  });
});
