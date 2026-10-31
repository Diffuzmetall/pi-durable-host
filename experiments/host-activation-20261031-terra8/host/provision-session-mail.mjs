import { open, lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { loadMcpConfig, McpServerConnection, McpOAuthCredentialStore, FileAuthStorageBackend, createDefaultTransport } from './compiled/bindings.mjs';

/** Operator-only provisioning for an explicitly new SDK session. Never call this for an imported/resumed session. */
export async function provisionNewSessionMail({ cwd, directory, agentDir, stage }) {
  if (!['terminal', 'iii', 'new-sdk-session'].includes(stage)) throw Error('ONLY_EXPLICIT_NEW_SESSION_MAY_REGISTER');
  const loaded = loadMcpConfig({ agentDir, cwd, projectTrusted: false });
  if (loaded.errors.length) throw Error('MCP_CONFIG_INVALID');
  const entry = loaded.servers.find(entry => entry.name === 'mcp-agent-mail' && entry.config.enabled !== false);
  if (!entry) return { status: 'not-configured' };
  if ('url' in entry.config && (entry.config.auth || entry.config.oauth)) throw Error('MAIL_AUTH_BINDING_UNSUPPORTED');
  const identityPath = join(directory, 'agent-mail-identity.json');
  const existing = await lstat(identityPath).catch(error => { if (error.code !== 'ENOENT') throw error; });
  if (existing) throw Error('EXISTING_IDENTITY_MUST_NOT_BE_REPLACED');
  const intent = await open(join(directory, 'agent-mail-registration.intent.json'), 'wx', 0o600);
  try { await intent.writeFile(JSON.stringify({ stage, project: cwd, status: 'registration_may_have_run' })); await intent.sync(); }
  finally { await intent.close(); }
  const folder = await open(directory, 'r'); try { await folder.sync(); } finally { await folder.close(); }
  const connection = new McpServerConnection({ entry, cwd, createTransport: createDefaultTransport,
    credentials: new McpOAuthCredentialStore(new FileAuthStorageBackend(join(agentDir, 'mcp-auth.json')), agentDir), onTools() {} });
  try {
    await connection.getClient();
    if (!connection.tools.some(tool => tool.name === 'register_agent')) throw Error('MAIL_REGISTRATION_UNAVAILABLE');
    const project = await connection.callTool('ensure_project', { human_key: cwd }, {});
    if (project.isError) throw Error('MAIL_PROJECT_NOT_ADMITTED');
    const result = await connection.callTool('register_agent', { project_key: cwd, program: 'pi-durable-host', model: 'openai-codex/gpt-6.1-sol' }, {});
    if (result.isError) throw Error('MAIL_REGISTRATION_NOT_ADMITTED');
    const value = result.structuredContent ?? JSON.parse(result.content.find(item => item.type === 'text')?.text ?? 'null');
    if (typeof value?.name !== 'string' || !value.name.trim() || (value.registration_token !== undefined && typeof value.registration_token !== 'string'))
      throw Error('MAIL_REGISTRATION_RECEIPT_INVALID');
    const file = await open(identityPath, 'wx', 0o600);
    try { await file.writeFile(JSON.stringify({ project: cwd, name: value.name, ...(value.registration_token ? { token: value.registration_token } : {}) })); await file.sync(); }
    finally { await file.close(); }
    const folder = await open(directory, 'r'); try { await folder.sync(); } finally { await folder.close(); }
    return { status: 'identity-persisted' };
  } finally { await connection.close(); }
}
