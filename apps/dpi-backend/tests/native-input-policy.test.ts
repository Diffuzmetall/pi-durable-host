import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BACKGROUND_CONTEXT as ctx, withAbortSignal } from '@earendil-works/chord/context';
import { createModels } from '@earendil-works/pi-ai/models';
import { fauxProvider, fauxAssistantMessage, fauxToolCall, fauxText } from '@earendil-works/pi-ai/providers/faux';
import { Harness, createRegistry } from '@earendil-works/pi-durable';
import { CodingTools } from '@earendil-works/pi-durable/tools';
import { NodeExecutionEnv } from '@earendil-works/pi-durable/env/node';
import { openNodeSqliteStorage } from '@earendil-works/pi-durable/storage/sqlite/node';
import { bindExistingInput, existingInputGuard, ExistingInputs, type InputPolicy, type InputPolicyOwner } from '../src/native-profile/admission/input-policy.js';

async function open(root: string, authorize: InputPolicyOwner['authorize']) {
  const workspace = join(root, 'workspace');
  await mkdir(workspace, { recursive: true });
  const models = createModels();
  const provider = fauxProvider({ provider: 'faux-policy', models: [{ id: 'fixture', contextWindow: 32000, maxTokens: 2048 }], tokensPerSecond: 100000 });
  models.setProvider(provider.provider);
  let host: InputPolicyOwner | undefined;
  const registry = createRegistry();
  registry.install(CodingTools);
  registry.install(existingInputGuard(() => host));
  const h = await Harness.open(await openNodeSqliteStorage(join(root, 'session.sqlite')), {
    models, registry, env: () => new NodeExecutionEnv({ cwd: workspace }),
  }, ctx);
  host = { session: h, authorize };
  const c = await h.root(ctx, { agent: { model: { provider: 'faux-policy', modelId: 'fixture' }, cwd: workspace } });
  let calls = 0;
  const tool = async (name: string, args: Record<string, string>, key: string, policy?: InputPolicy) => {
    provider.setResponses([
      () => { calls++; return fauxAssistantMessage(fauxToolCall(name, args), { stopReason: 'toolUse' }); },
      () => { calls++; return fauxAssistantMessage(fauxText('fixture complete')); },
    ]);
    if (policy) await h.commit(tx => bindExistingInput(tx, c.id, key, policy), ctx);
    const submission = await c.submit({ type: 'input', content: key, requestId: key }, ctx);
    const result = await submission.wait(withAbortSignal(AbortSignal.timeout(10000), ctx));
    assert.equal(result.status, 'done');
    return { submission, entries: (await c.entries({}, 100, undefined, ctx)).items };
  };
  return { h, c, workspace, tool, calls: () => calls, unbind: () => { host = undefined; } };
}

test('actual native delegated policy permits scoped read, denies bash, and leaves later human work unchanged', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dpi-input-policy-'));
  let authorizations = 0;
  const f = await open(root, policy => { authorizations++; return policy.policy === 'revision-1'; });
  const policy = { workspace: f.workspace, policy: 'revision-1', tools: ['read'] };
  try {
    await writeFile(join(f.workspace, 'allowed.txt'), 'ALLOWED_FILE_SENTINEL');
    const read = await f.tool('read', { path: 'allowed.txt' }, 'delegated-read', policy);
    assert.match(JSON.stringify(read.entries), /ALLOWED_FILE_SENTINEL/);
    const denied = await f.tool('bash', { command: 'printf should-not-run > blocked.txt' }, 'delegated-bash', policy);
    assert.match(JSON.stringify(denied.entries), /DELEGATED_INPUT_TOOL_DENIED/);
    assert.equal(existsSync(join(f.workspace, 'blocked.txt')), false);
    await f.tool('bash', { command: 'printf human-ok > human.txt' }, 'human-request');
    assert.equal(await readFile(join(f.workspace, 'human.txt'), 'utf8'), 'human-ok');
    assert.equal(authorizations, 2, 'only active delegated inputs require current delegated policy');
    assert.equal((await f.h.snapshot(ExistingInputs, f.c.id, ctx))?.inputs['delegated-read'].policy, 'revision-1');
  } finally {
    await f.h.close(ctx);
    await rm(root, { recursive: true, force: true });
  }
});

test('actual native input hook rejects escaped/symlink reads, revoked policy and absent owner', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dpi-input-scope-'));
  let current = true;
  const f = await open(root, () => current);
  const policy = { workspace: f.workspace, policy: 'revision-1', tools: ['read'] };
  try {
    await writeFile(join(root, 'outside.txt'), 'OUTSIDE_SECRET_SENTINEL');
    await writeFile(join(f.workspace, 'allowed.txt'), 'READ_AFTER_REVOKE_SENTINEL');
    await symlink(join(root, 'outside.txt'), join(f.workspace, 'escape.txt'));
    const escaped = await f.tool('read', { path: '../outside.txt' }, 'escaped', policy);
    assert.match(JSON.stringify(escaped.entries), /BRIDGE_READ_DENIED/);
    const linked = await f.tool('read', { path: 'escape.txt' }, 'symlink', policy);
    assert.match(JSON.stringify(linked.entries), /BRIDGE_READ_DENIED/);
    assert.ok(!JSON.stringify(linked.entries).includes('OUTSIDE_SECRET_SENTINEL'));
    current = false;
    const revoked = await f.tool('read', { path: 'allowed.txt' }, 'revoked', policy);
    assert.match(JSON.stringify(revoked.entries), /DELEGATED_INPUT_POLICY_REVOKED/);
    assert.ok(!JSON.stringify(revoked.entries).includes('READ_AFTER_REVOKE_SENTINEL'));
    f.unbind();
    const missing = await f.tool('read', { path: 'allowed.txt' }, 'missing-owner', policy);
    assert.match(JSON.stringify(missing.entries), /DELEGATED_INPUT_OWNER_UNAVAILABLE/);
  } finally {
    await f.h.close(ctx);
    await rm(root, { recursive: true, force: true });
  }
});

test('native policy doc and canonical request survive SQLite reopen without model replay', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dpi-input-reopen-'));
  let f = await open(root, () => true);
  const policy = { workspace: f.workspace, policy: 'revision-1', tools: ['read'] };
  try {
    await writeFile(join(f.workspace, 'allowed.txt'), 'REOPEN_FILE_SENTINEL');
    const original = await f.tool('read', { path: 'allowed.txt' }, 'persisted-input', policy);
    assert.equal(f.calls(), 2);
    const before = await f.h.snapshot(ExistingInputs, f.c.id, ctx);
    await f.h.close(ctx);
    f = await open(root, () => false);
    assert.deepEqual(await f.h.snapshot(ExistingInputs, f.c.id, ctx), before);
    const again = await f.c.submit({ type: 'input', content: 'persisted-input', requestId: 'persisted-input' }, ctx);
    assert.equal(again.id, original.submission.id);
    assert.equal((await again.wait(ctx)).status, 'done');
    assert.equal(f.calls(), 0);
    await assert.rejects(() => f.h.commit(tx => bindExistingInput(tx, f.c.id, 'persisted-input', { ...policy, tools: ['bash'] }), ctx), /POLICY_CONFLICT/);
    assert.deepEqual(await f.h.snapshot(ExistingInputs, f.c.id, ctx), before);
  } finally {
    await f.h.close(ctx);
    await rm(root, { recursive: true, force: true });
  }
});
