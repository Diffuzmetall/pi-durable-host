import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { StreamableHttpTransport } from '@earendil-works/pi-mcp';
import { authorizeAgentMail, openSessionMail } from '../src/native-profile/memory/mail.js';

const workspace = '/home/ubuntu/Projects';
const actor = 'TanBay';

test('Mail project scope canonicalizes workspace directories but preserves actor/admin boundaries', async t => {
  const root = await mkdtemp(join(workspace, '.mail-scope-test-'));
  const outside = await mkdtemp(join(tmpdir(), 'mail-outside-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  t.after(() => rm(outside, { recursive: true, force: true }));
  const home = join(root, 'home'), other = join(root, 'other');
  await mkdir(home); await mkdir(other);
  await symlink(other, join(root, 'alias'));
  await symlink(outside, join(root, 'escape'));
  await writeFile(join(root, 'file'), 'not a directory');

  await t.test('same actor can ensure, register and manage leases in the target project', () => {
    for (const [name, args] of [
      ['ensure_project', { human_key: other }],
      ['register_agent', { project_key: other, name: actor }],
      ['macro_start_session', { human_key: other, agent_name: actor }],
      ...['file_reservation_paths', 'renew_file_reservations', 'release_file_reservations', 'check_file_reservation_conflicts']
        .map(name => [name, { project_key: other, agent_name: actor }]),
    ] as Array<[string, Record<string, unknown>]>) {
      assert.doesNotThrow(() => authorizeAgentMail(name, args, home, actor));
    }
  });
  await t.test('canonical paths share one lease namespace', () => {
    for (const requested of [join(root, 'alias'), `${other}/../other/`]) {
      const args = Object.freeze({ project_key: requested, agent_name: actor });
      const canonical = authorizeAgentMail('file_reservation_paths', args, home, actor);
      assert.equal(canonical.project_key, other);
      assert.equal(args.project_key, requested, 'authorization must accept immutable Nico arguments');
    }
  });
  await t.test('outside paths, prefix siblings, traversal, symlink escapes, files and missing directories fail closed', () => {
    for (const requested of [outside, `${workspace}-other/repo`, `${workspace}/../.config`, join(root, 'escape'),
      join(root, 'file'), join(root, 'missing'), workspace, '../other', '', null, 42]) {
      assert.throws(() => authorizeAgentMail('file_reservation_paths', { project_key: requested, agent_name: actor }, home, actor), /project mismatch/);
    }
  });
  await t.test('sessions outside the workspace retain their own project but cannot borrow workspace authority', () => {
    assert.doesNotThrow(() => authorizeAgentMail('fetch_inbox', { project_key: outside, agent_name: actor }, outside, actor));
    assert.throws(() => authorizeAgentMail('fetch_inbox', { project_key: other, agent_name: actor }, outside, actor), /project mismatch/);
  });
  await t.test('foreign and omitted actor fields are rejected in the other project', () => {
    for (const [name, field] of [['register_agent', 'name'], ['macro_start_session', 'agent_name'],
      ['file_reservation_paths', 'agent_name'], ['send_message', 'sender_name'], ['reply_message', 'sender_name']]) {
      for (const value of ['OtherActor', undefined]) {
        assert.throws(() => authorizeAgentMail(name!, { project_key: other, [field!]: value }, home, actor), /identity mismatch/);
      }
    }
  });
  await t.test('administrative operations still require separate approval', () => {
    for (const name of ['deregister_agent', 'force_release_file_reservation', 'cleanup_pane_identities',
      'install_precommit_guard', 'uninstall_precommit_guard', 'retire_agent', 'create_agent_identity']) {
      assert.throws(() => authorizeAgentMail(name, { project_key: other, agent_name: actor }, home, actor), /separate operator approval/);
    }
  });
  await t.test('conflicting project selectors cannot pick two namespaces', () => {
    assert.throws(() => authorizeAgentMail('ensure_project', { project_key: home, human_key: other }, home, actor), /must agree/);
  });
});

test('native Mail transport keeps home tokens project-local and checks revocation', async t => {
  const root = await mkdtemp(join(workspace, '.mail-native-test-'));
  const home = join(root, 'home'), other = join(root, 'other');
  await mkdir(home); await mkdir(other);
  t.after(() => rm(root, { recursive: true, force: true }));
  const calls: Array<Record<string, unknown>> = [];
  const endpoint = createServer(async (request, response) => {
    if (request.method !== 'POST') { response.writeHead(405).end(); return; }
    let raw = ''; for await (const chunk of request) raw += chunk;
    const message = JSON.parse(raw);
    if (message.id === undefined) { response.writeHead(202).end(); return; }
    let result = {};
    if (message.method === 'initialize') result = { protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'mail-scope-fixture', version: '1' } };
    if (message.method === 'tools/list') result = { tools: ['send_message', 'reply_message'].map(name => ({ name, inputSchema: { type: 'object', properties: {} } })) };
    if (message.method === 'tools/call') { calls.push(message.params.arguments); result = { content: [{ type: 'text', text: 'accepted' }] }; }
    response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }));
  }).listen(0, '127.0.0.1');
  await once(endpoint, 'listening');
  t.after(() => { endpoint.closeAllConnections(); endpoint.close(); });
  let active = true;
  const address = endpoint.address();
  assert(address && typeof address !== 'string');
  const mail = await openSessionMail({ project: home, agent: actor, registrationToken: 'home-fixture-token',
    allowedTools: ['send_message', 'reply_message'], authorize: () => { if (!active) throw Error('GRANT_REVOKED'); },
    transport: () => new StreamableHttpTransport({ url: `http://127.0.0.1:${address.port}/mcp` }),
  });
  t.after(() => mail.close());
  for (const name of ['send_message', 'reply_message']) {
    for (const project of [home, other]) {
      const args = { project_key: project, sender_name: actor, sender_token: 'target-fixture-token' };
      await mail.source.authorize!({ name } as never, args, undefined as never, undefined as never);
      await mail.source.client.callTool(name, args);
      assert.equal(calls.at(-1)!.sender_token, project === home ? 'home-fixture-token' : 'target-fixture-token');
    }
  }
  assert.deepEqual(mail.shellEnv, { AGENT_MAIL_PROJECT: home, AGENT_MAIL_AGENT: actor });
  active = false;
  await assert.rejects(async () => mail.source.authorize!({ name: 'send_message' } as never,
    { project_key: other, sender_name: actor }, undefined as never, undefined as never), /GRANT_REVOKED/);
  assert.equal(calls.length, 4);
});

for (const facade of ['session-mcp.mjs', 'nico-session-mcp.mjs']) {
  test(`${facade}: same-actor registration and leases reach Nico; denied calls have zero server effects`, async t => {
    const root = await mkdtemp(join(workspace, '.mail-nico-test-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    const home = join(root, 'home'), other = join(root, 'other'), stage = join(root, 'stage');
    await mkdir(home); await mkdir(other); await mkdir(join(stage, 'compiled'), { recursive: true });
    await symlink(other, join(root, 'alias'));
    const source = new URL('../../../experiments/sdk-host-cutover/', import.meta.url);
    // Use the unchanged accepted Nico dependency with the current source policy, not an old bundled guard.
    await writeFile(join(stage, 'session-mcp.mjs'), await readFile(new URL(facade, source)));
    await writeFile(join(stage, 'compiled/bindings.mjs'), `export * from ${JSON.stringify(new URL('compiled/bindings.mjs', source).href)};\n`);
    await writeFile(join(stage, 'compiled/nico.mjs'), `export * from ${JSON.stringify(new URL('compiled/nico.mjs', source).href)};\nexport { authorizeAgentMail } from ${JSON.stringify(new URL('../src/native-profile/memory/mail.ts', import.meta.url).href)};\n`);
    const calls: Array<{ name: string; arguments: Record<string, unknown> }> = [];
    const endpoint = createServer(async (request, response) => {
      if (request.method !== 'POST') { response.writeHead(405).end(); return; }
      let raw = ''; for await (const chunk of request) raw += chunk;
      const message = JSON.parse(raw);
      if (message.id === undefined) { response.writeHead(202).end(); return; }
      let result = {};
      if (message.method === 'initialize') result = { protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'mail-nico-fixture', version: '1' } };
      if (message.method === 'tools/list') result = { tools: ['ensure_project', 'register_agent', 'file_reservation_paths',
        'renew_file_reservations', 'release_file_reservations', 'send_message', 'reply_message', 'create_agent_identity']
        .map(name => ({ name, inputSchema: { type: 'object', properties: {} } })) };
      if (message.method === 'resources/list') result = { resources: [] };
      if (message.method === 'resources/templates/list') result = { resourceTemplates: [] };
      if (message.method === 'tools/call') {
        calls.push(message.params);
        const conflict = message.params.arguments.paths?.includes('held.md');
        result = { content: [{ type: 'text', text: JSON.stringify(conflict
          ? { granted: [], conflicts: [{ path: 'held.md', holders: ['OtherActor'] }] }
          : { ok: true }) }] };
      }
      response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }));
    }).listen(0, '127.0.0.1');
    await once(endpoint, 'listening');
    t.after(() => { endpoint.closeAllConnections(); endpoint.close(); });
    const address = endpoint.address(); assert(address && typeof address !== 'string');
    await writeFile(join(home, 'mcp.json'), JSON.stringify({ mcpServers: {
      'mcp-agent-mail': { url: `http://127.0.0.1:${address.port}/mcp`, exposure: 'codemode' },
    } }));
    await writeFile(join(home, 'agent-mail-identity.json'), JSON.stringify({ project: home, name: actor, token: 'home-fixture-token' }));
    let active = true;
    const { connectSessionMcp } = await import(pathToFileURL(join(stage, 'session-mcp.mjs')).href);
    const mcp = await connectSessionMcp({ cwd: home, directory: home }, { agentDir: home, projectTrusted: false,
      authorize: () => { if (!active) throw Error('GRANT_REVOKED'); } });
    t.after(() => mcp.close());
    const mail = mcp.sources.find((s: { server: string }) => s.server === 'mcp-agent-mail');
    assert(mail);
    assert.equal(calls.length, 0, 'opening a session must not auto-register another identity');
    await mail.authorize({ name: 'ensure_project' }, { human_key: other });
    await mail.client.callTool('ensure_project', { human_key: other });
    await mail.client.callTool('register_agent', { project_key: other, name: actor, program: 'pi', model: 'fixture' });
    await mail.client.callTool('file_reservation_paths', { project_key: join(root, 'alias'), agent_name: actor, paths: ['own.md'], exclusive: true });
    assert.equal(calls.at(-1)!.arguments.project_key, other, 'canonical target reaches the actual transport');
    assert.deepEqual(calls.at(-1)!.arguments.paths, ['own.md']);
    for (const name of ['renew_file_reservations', 'release_file_reservations'])
      await mail.client.callTool(name, { project_key: other, agent_name: actor, paths: ['own.md'] });
    const conflict = await mail.client.callTool('file_reservation_paths', { project_key: other, agent_name: actor, paths: ['held.md'], exclusive: true });
    assert.deepEqual(JSON.parse(conflict.content[0].text).granted, []);
    assert.equal(JSON.parse(conflict.content[0].text).conflicts[0].holders[0], 'OtherActor', 'server conflict must be returned unchanged');
    for (const name of ['send_message', 'reply_message']) {
      await mail.client.callTool(name, { project_key: home, sender_name: actor, sender_token: 'spoof' });
      assert.equal(calls.at(-1)!.arguments.sender_token, 'home-fixture-token');
      await mail.client.callTool(name, { project_key: other, sender_name: actor, sender_token: 'target-fixture-token' });
      assert.equal(calls.at(-1)!.arguments.sender_token, 'target-fixture-token');
      await mail.client.callTool(name, { project_key: other, sender_name: actor });
      assert.equal(calls.at(-1)!.arguments.sender_token, undefined);
    }
    const beforeDenied = calls.length;
    await assert.rejects(mail.authorize({ name: 'file_reservation_paths' }, { project_key: other, agent_name: 'OtherActor' }), /identity mismatch/);
    // Nico intentionally classifies rejected direct dispatches without exposing their internal cause.
    await assert.rejects(mail.client.callTool('file_reservation_paths', { project_key: other, agent_name: 'OtherActor' }), /MCP_NOT_SENT/);
    await assert.rejects(mail.client.callTool('register_agent', { project_key: other, name: 'OtherActor' }), /MCP_NOT_SENT/);
    await assert.rejects(mail.client.callTool('file_reservation_paths', { project_key: '/tmp', agent_name: actor }), /MCP_NOT_SENT/);
    await assert.rejects(mail.client.callTool('create_agent_identity', { project_key: other }), /MCP_NOT_SENT/);
    active = false;
    await assert.rejects(mail.authorize({ name: 'file_reservation_paths' }, { project_key: other, agent_name: actor }), /GRANT_REVOKED/);
    await assert.rejects(mail.client.callTool('file_reservation_paths', { project_key: other, agent_name: actor }), /MCP_NOT_SENT/);
    assert.equal(calls.length, beforeDenied);
    assert.deepEqual(mcp.status().agentMail, { project: home, name: actor });
    assert(!JSON.stringify(mcp.status()).includes('home-fixture-token'));
    await mcp.close();
    await assert.rejects(mail.client.callTool('file_reservation_paths', { project_key: other, agent_name: actor }), /MCP_NOT_SENT/);
    assert.equal(calls.length, beforeDenied);
  });
}
