import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { loadMcpConfig } from './compiled/bindings.mjs';
import { createMcpManager, createCredentialResolver, snapshotToServerSpecs, resolveMcpSnapshot,
  authorizeAgentMail, mcpNamespace } from './compiled/nico.mjs';
const execute = promisify(execFile);
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const readJson = path => {
  try { return JSON.parse(readFileSync(path, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return undefined; throw Error('MCP_CONFIG_INVALID'); }
};

/** Same native@1 CodeMode bridge and task identities; only the session transport owner changes. */
export async function connectSessionMcp(context, { agentDir, projectTrusted, authorize, providerToken }) {
  const load = () => {
    const native = loadMcpConfig({ agentDir, cwd: context.cwd, projectTrusted });
    if (native.errors.length) throw Error('MCP_CONFIG_INVALID');
    const global = { mcpServers: {} }, project = { mcpServers: {} };
    for (const entry of native.servers) (entry.scope === 'project' ? project : global).mcpServers[entry.name] = entry.config;
    // Durable retains its effective native settings. Pi adapter overrides belong to Pi, not this Host.
    const adapter = readJson(join(agentDir, 'mcp-adapter.json'));
    if (adapter && (typeof adapter !== 'object' || !adapter.mcpServers || typeof adapter.mcpServers !== 'object')) throw Error('MCP_CONFIG_INVALID');
    const additions = { mcpServers: Object.fromEntries(Object.entries(adapter?.mcpServers ?? {})
      .filter(([name]) => !native.servers.some(entry => entry.name === name))) };
    const snapshot = resolveMcpSnapshot({ global, adapter: additions, project, projectTrusted });
    if (!snapshot.ok) throw Error('MCP_CONFIG_INVALID');
    return snapshot;
  };
  const snapshot = load();
  let closed = false, identity;
  const failures = [];
  const mail = snapshot.servers['mcp-agent-mail'];
  if (mail?.disposition === 'ready') {
    try { identity = JSON.parse(await readFile(join(context.directory, 'agent-mail-identity.json'), 'utf8')); }
    catch { failures.push({ server: mail.name, state: 'failed', tools: 0, reason: 'MCP_MAIL_EXISTING_IDENTITY_REQUIRED' }); }
    if (identity && (identity.project !== context.cwd || typeof identity.name !== 'string' || !identity.name.trim() ||
      (identity.token !== undefined && typeof identity.token !== 'string'))) throw Error('MCP_MAIL_IDENTITY_INVALID');
  }
  const current = async (server, tool, args, api, taskContext) => {
    if (closed) throw Error('MCP_SESSION_CLOSED');
    await authorize(server, tool?.name, args, api, taskContext);
    if (closed) throw Error('MCP_SESSION_CLOSED');
    const actual = load().servers[server];
    if (!actual || actual.disposition !== 'ready' || digest(actual.config) !== digest(snapshot.servers[server].config))
      throw Error('MCP_CONFIGURATION_CHANGED_REOPEN_REQUIRED');
    if (server === 'mcp-agent-mail' && tool) {
      if (!identity) throw Error('MCP_MAIL_EXISTING_IDENTITY_REQUIRED');
      authorizeAgentMail(tool.name, args, identity.project, identity.name);
    }
  };
  const credentials = createCredentialResolver({ environment: { ...process.env, ...context.shellEnv },
    execute: async ({ server, command, env, signal }) => {
      await current(server);
      const { stdout } = await execute('/bin/sh', ['-c', command], { cwd: context.cwd, env, signal, timeout: 10_000, maxBuffer: 1_048_576 });
      return stdout;
    },
    providerToken: async ({ server, url, provider }) => {
      await current(server);
      const token = await providerToken?.(provider);
      return token ? { server, url, token } : undefined;
    },
    oauthStore: { read: server => {
      const config = snapshot.servers[server]?.config;
      if (!config?.url) return undefined;
      const url = String(new URL(config.url));
      // Read the existing native store in place. No migration, refresh, login, or alternative credential store.
      const states = readJson(join(agentDir, 'mcp-auth.json')) ?? {};
      const state = states[`${mcpNamespace(server)}|${url}`] ?? states[url];
      if (!state?.tokens || state.serverUrl !== url) return undefined;
      return { serverUrl: config.url, tokens: { accessToken: state.tokens.access_token,
        ...(state.tokensExpireAt === undefined ? {} : { expiresAt: state.tokensExpireAt / 1000 }) } };
    } },
  });
  const projection = snapshotToServerSpecs(snapshot, { cwd: context.cwd, environment: process.env,
    credentials, fetch: globalThis.fetch, revision: server => digest(server.config) });
  if (projection.blockers.length) throw Error(`MCP_UNSUPPORTED_CONFIG: ${JSON.stringify(projection.blockers)}`);
  const specs = projection.servers.filter(server => server.name !== 'mcp-agent-mail' || identity);
  const manager = createMcpManager({ servers: specs,
    canonicalize: call => call.server === 'mcp-agent-mail' && identity?.token && ['send_message', 'reply_message'].includes(call.tool)
      ? { ...call.arguments, sender_token: identity.token } : { ...call.arguments },
    authorize: async call => {
      await current(call.server, { name: call.tool }, call.arguments);
      await projection.preflight(call);
      await current(call.server, { name: call.tool }, call.arguments);
    },
  });
  try {
    for (const spec of specs) await current(spec.name);
    await manager.ready();
    const sources = specs.flatMap(spec => {
      const tools = manager.catalog().filter(tool => tool.server === spec.name);
      if (!tools.length) return [];
      if (tools.some(tool => !['codemode', 'direct'].includes(tool.exposure))) throw Error('MCP_EXPOSURE_NOT_SUPPORTED_BY_NATIVE_HOST');
      // The native bridge owns registration/schema validation/replay policy; keep its immutable catalogue.
      const byName = new Map(tools.map(tool => [tool.definition.name, tool]));
      return [{ server: spec.name, allowedTools: [...byName.keys()],
        directTools: tools.filter(tool => tool.exposure === 'direct').map(tool => tool.definition.name),
        authorize: (tool, args, api, taskContext) => current(spec.name, tool, args, api, taskContext),
        client: { listTools: async () => tools.map(tool => tool.definition),
          callTool: (name, args, options = {}) => manager.call(byName.get(name), args, { callId: randomUUID(), signal: options.signal }) },
      }];
    });
    const agentMail = identity && sources.some(source => source.server === 'mcp-agent-mail')
      ? Object.freeze({ project: identity.project, name: identity.name }) : null;
    return { sources, shellEnv: agentMail ? { AGENT_MAIL_AGENT: agentMail.name, AGENT_MAIL_PROJECT: agentMail.project } : {},
      async close() { if (!closed) { closed = true; await manager.close(); } },
      status: () => ({ manager: 'nico', configuredServers: Object.values(snapshot.servers).map(server => ({ server: server.name, disposition: server.disposition })), servers: closed
        ? specs.map(spec => ({ server: spec.name, state: 'closed', tools: 0 })) : [...manager.status(), ...failures], agentMail }),
    };
  } catch (error) { closed = true; await manager.close(); throw error; }
}
