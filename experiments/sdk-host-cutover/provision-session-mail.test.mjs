import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, writeFile, readFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { provisionNewSessionMail } from './provision-session-mail.mjs';

test('operator provisioning preserves server-issued identity and never retries unknown registration', async t => {
  let registrations = 0, refuse = false;
  const server = createServer(async (request, response) => {
    if (request.method !== 'POST') { response.writeHead(405).end(); return; }
    let raw = ''; for await (const chunk of request) raw += chunk;
    const message = JSON.parse(raw);
    if (message.id === undefined) { response.writeHead(202).end(); return; }
    let result = {};
    if (message.method === 'initialize') result = { protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'mail', version: '1' } };
    if (message.method === 'tools/list') result = { tools: ['register_agent', 'ensure_project'].map(name => ({ name, inputSchema: { type: 'object' } })) };
    if (message.method === 'resources/list') result = { resources: [] };
    if (message.method === 'resources/templates/list') result = { resourceTemplates: [] };
    if (message.method === 'tools/call') {
      if (message.params.name === 'register_agent') {
        registrations++;
        assert.equal(message.params.arguments.name, undefined);
        result = refuse ? { isError: true, content: [{ type: 'text', text: 'synthetic uncertain refusal' }] }
          : { content: [{ type: 'text', text: JSON.stringify({ name: 'ServerChosenActor', registration_token: 'synthetic-proof' }) }] };
      } else result = { content: [{ type: 'text', text: '{}' }] };
    }
    response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }));
  }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const root = await mkdtemp(join(tmpdir(), 'mail-provision-'));
  await writeFile(join(root, 'mcp.json'), JSON.stringify({ mcpServers: { 'mcp-agent-mail': { url: `http://127.0.0.1:${server.address().port}/mcp` } } }));
  const directory = join(root, 'new'); await mkdir(directory);
  const input = { agentDir: root, directory, cwd: root, stage: 'terminal' };
  await assert.rejects(provisionNewSessionMail({ ...input, stage: 'selected-copy' }), /ONLY_EXPLICIT_NEW/);
  assert.equal((await provisionNewSessionMail(input)).status, 'identity-persisted');
  assert.deepEqual(JSON.parse(await readFile(join(directory, 'agent-mail-identity.json'), 'utf8')), { project: root, name: 'ServerChosenActor', token: 'synthetic-proof' });
  await assert.rejects(provisionNewSessionMail(input), /EXISTING_IDENTITY/);
  refuse = true;
  const second = join(root, 'uncertain'); await mkdir(second);
  await assert.rejects(provisionNewSessionMail({ ...input, directory: second }), /NOT_ADMITTED/);
  await assert.rejects(provisionNewSessionMail({ ...input, directory: second }), { code: 'EEXIST' });
  await assert.rejects(access(join(second, 'agent-mail-identity.json')), { code: 'ENOENT' });
  assert.equal(registrations, 2);
});
