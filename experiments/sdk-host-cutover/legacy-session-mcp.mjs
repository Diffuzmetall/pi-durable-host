import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { openSessionMail } from 'dpi-backend/native-profile';
import {
  loadMcpConfig, getMcpToolExposure, McpServerConnection,
  McpOAuthCredentialStore, FileAuthStorageBackend, createDefaultTransport,
} from './compiled/bindings.mjs';

/** Preserve the legacy startup policy: separate session connections; unavailable servers are visible, not fatal or silently omitted. */
export async function connectSessionMcp(context, { agentDir, projectTrusted, authorize, providerToken }) {
  const load = () => {
    const config = loadMcpConfig({ agentDir, cwd: context.cwd, projectTrusted });
    if (config.errors.length) throw Error('MCP_CONFIG_INVALID');
    return config.servers;
  };
  const entries = load().filter(entry => entry.config.enabled !== false);
  const connections = [];
  const sources = [];
  const states = [];
  const credentials = new McpOAuthCredentialStore(new FileAuthStorageBackend(join(agentDir, 'mcp-auth.json')), join(agentDir, 'mcp-auth-locks'));
  let closed = false;
  let agentMail = null;
  let shellEnv = {};
  const close = async () => {
    if (closed) return;
    closed = true;
    await Promise.allSettled(connections.map(connection => connection.close()));
  };
  await Promise.all(entries.map(async entry => {
    const record = { server: entry.name, state: 'connecting', tools: 0, read: undefined };
    states.push(record);
    const expected = JSON.stringify(entry.config);
    const current = async (tool, args, api, taskContext) => {
      if (closed) throw Error('MCP_SESSION_CLOSED');
      await authorize(entry.name, tool?.name, args, api, taskContext);
      if (closed) throw Error('MCP_SESSION_CLOSED');
      const actual = load().find(value => value.name === entry.name);
      if (!actual || actual.config.enabled === false || JSON.stringify(actual.config) !== expected)
        throw Error('MCP_CONFIGURATION_CHANGED_REOPEN_REQUIRED');
    };
    let connection;
    try {
      await current();
      let identity;
      if (entry.name === 'mcp-agent-mail') {
        // Existing admitted identity only: no hidden registration or cross-session actor reuse.
        try { identity = JSON.parse(await readFile(join(context.directory, 'agent-mail-identity.json'), 'utf8')); }
        catch { throw Error('MCP_MAIL_EXISTING_IDENTITY_REQUIRED'); }
        if (identity.project !== context.cwd || typeof identity.name !== 'string' || !identity.name.trim() ||
          (identity.token !== undefined && typeof identity.token !== 'string')) throw Error('MCP_MAIL_IDENTITY_INVALID');
        if ('url' in entry.config && (entry.config.auth || entry.config.oauth))
          throw Error('MCP_MAIL_TRANSPORT_REQUIRES_EXPLICIT_AUTH_BINDING');
      }
      connection = new McpServerConnection({ entry, cwd: context.cwd, createTransport: createDefaultTransport,
        credentials, providerToken, onTools() {} });
      connections.push(connection);
      await connection.getClient();
      const allowedTools = connection.tools.filter(tool => getMcpToolExposure(entry.config, tool.name) !== 'hidden').map(tool => tool.name);
      if (allowedTools.some(name => !['codemode', 'direct'].includes(getMcpToolExposure(entry.config, name))))
        throw Error('MCP_EXPOSURE_NOT_SUPPORTED_BY_NATIVE_HOST');
      record.read = () => ({ server: connection.name, state: connection.state, tools: connection.tools.length });
      if (!allowedTools.length) return;
      const directTools = allowedTools.filter(name => getMcpToolExposure(entry.config, name) === 'direct');
      if (identity) {
        await connection.close();
        const mail = await openSessionMail({ project: identity.project, agent: identity.name, registrationToken: identity.token,
          allowedTools, authorize: () => current(), transport: () => createDefaultTransport(entry, context.cwd, undefined) });
        connections.push(mail);
        agentMail = mail.identity;
        record.read = () => ({ server: entry.name, state: mail.source.client.connectionState, tools: allowedTools.length });
        sources.push({ ...mail.source, directTools });
        shellEnv = mail.shellEnv;
      } else {
        sources.push({ server: entry.name, allowedTools, directTools,
          client: { listTools: async () => (await connection.getClient()).listTools(),
            callTool: (name, args, options) => connection.callTool(name, args, options) }, authorize: current });
      }
    } catch (error) {
      // Match the original manager's redaction: no URLs, headers, stderr or registration credentials.
      record.read = undefined; record.state = 'failed';
      record.reason = ['MCP_MAIL_EXISTING_IDENTITY_REQUIRED', 'MCP_MAIL_IDENTITY_INVALID',
        'MCP_MAIL_TRANSPORT_REQUIRES_EXPLICIT_AUTH_BINDING', 'MCP_EXPOSURE_NOT_SUPPORTED_BY_NATIVE_HOST'].includes(error.message)
        ? error.message : 'MCP_SERVER_UNAVAILABLE';
      await Promise.allSettled(connection ? [connection.close()] : []);
    }
  }));
  return { sources, shellEnv, close, status: () => ({
    servers: states.map(record => closed ? { server: record.server, state: 'closed', tools: 0 }
      : record.read ? record.read() : { server: record.server, state: record.state, tools: record.tools, reason: record.reason }),
    agentMail,
  }) };
}
