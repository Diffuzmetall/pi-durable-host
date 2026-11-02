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

/** One session transport owner; native registration and validation remain Host-owned. */
export async function connectSessionMcp(context, { agentDir, projectTrusted, authorize, providerToken }) {
  const load = () => {
    const native = loadMcpConfig({ agentDir, cwd: context.cwd, projectTrusted });
    if (native.errors.length) throw Error('MCP_CONFIG_INVALID');
    const global = { mcpServers: {} }, project = { mcpServers: {} };
    for (const entry of native.servers) (entry.scope === 'project' ? project : global).mcpServers[entry.name] = entry.config;
    const adapter = readJson(join(agentDir, 'mcp-adapter.json'));
    if (adapter && (typeof adapter !== 'object' || !adapter.mcpServers || typeof adapter.mcpServers !== 'object')) throw Error('MCP_CONFIG_INVALID');
    const additions = { mcpServers: Object.fromEntries(Object.entries(adapter?.mcpServers ?? {})
      .filter(([name]) => !native.servers.some(entry => entry.name === name))) };
    const snapshot = resolveMcpSnapshot({ global, adapter: additions, project, projectTrusted });
    if (!snapshot.ok) throw Error('MCP_CONFIG_INVALID');
    return snapshot;
  };
  const initial = load();
  let closed = false, closePromise, identity, active;
  if (initial.servers['mcp-agent-mail']?.disposition === 'ready') {
    try { identity = JSON.parse(await readFile(join(context.directory, 'agent-mail-identity.json'), 'utf8')); }
    catch { /* An absent existing identity never authorizes registration. */ }
    if (identity && (identity.project !== context.cwd || typeof identity.name !== 'string' || !identity.name.trim() ||
      (identity.token !== undefined && typeof identity.token !== 'string'))) throw Error('MCP_MAIL_IDENTITY_INVALID');
    if (identity) Object.freeze(identity);
  }
  const current = async (server, tool, args, api, taskContext, expected = active.snapshot) => {
    if (closed) throw Error('MCP_SESSION_CLOSED');
    await authorize(server, tool?.name, args, api, taskContext);
    if (closed) throw Error('MCP_SESSION_CLOSED');
    const actual = load().servers[server];
    const captured = expected.servers[server];
    if (!actual || actual.disposition !== 'ready' || !captured || digest(actual.config) !== digest(captured.config))
      throw Error('MCP_CONFIGURATION_CHANGED_REOPEN_REQUIRED');
    if (server === 'mcp-agent-mail' && tool) {
      if (!identity) throw Error('MCP_MAIL_EXISTING_IDENTITY_REQUIRED');
      authorizeAgentMail(tool.name, args, identity.project, identity.name);
    }
  };
  const project = snapshot => {
    // Credentials and their request hooks are bound to the source configuration
    // that created this transport, not to a mutable global candidate.
    const check = server => current(server, undefined, undefined, undefined, undefined, snapshot);
    const credentials = createCredentialResolver({ environment: { ...process.env, ...context.shellEnv },
      execute: async ({ server, command, env, signal }) => {
        await check(server);
        const { stdout } = await execute('/bin/sh', ['-c', command], { cwd: context.cwd, env, signal, timeout: 10_000, maxBuffer: 1_048_576 });
        return stdout;
      },
      providerToken: async ({ server, url, provider }) => {
        await check(server);
        const token = await providerToken?.(provider);
        return token ? { server, url, token } : undefined;
      },
      oauthStore: { read: server => {
        const config = snapshot.servers[server]?.config;
        if (!config?.url) return undefined;
        const url = String(new URL(config.url));
        // Existing native store only: no refresh, login, migration or alternate owner.
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
    const failures = snapshot.servers['mcp-agent-mail']?.disposition === 'ready' && !identity
      ? [{ server: 'mcp-agent-mail', state: 'failed', tools: 0, reason: 'MCP_MAIL_EXISTING_IDENTITY_REQUIRED' }] : [];
    return { snapshot, projection, failures,
      specs: projection.servers.filter(server => server.name !== 'mcp-agent-mail' || identity) };
  };
  active = project(initial);
  const manager = createMcpManager({ servers: active.specs,
    canonicalize: call => {
      if (call.server !== 'mcp-agent-mail' || !identity) return { ...call.arguments };
      // Preserve the validation-only (void) policy API as well as returned canonical args.
      const args = authorizeAgentMail(call.tool, call.arguments, identity.project, identity.name) ?? { ...call.arguments };
      return identity.token && (args.project_key ?? identity.project) === identity.project && ['send_message', 'reply_message'].includes(call.tool)
        ? { ...args, sender_token: identity.token } : args;
    },
    authorize: async call => {
      await current(call.server, { name: call.tool }, call.arguments);
      await active.projection.preflight(call);
      await current(call.server, { name: call.tool }, call.arguments);
    },
  });
  const makeSources = (state, catalogue) => state.specs.flatMap(spec => {
    const tools = catalogue.filter(tool => tool.server === spec.name);
    if (!tools.length) return [];
    if (tools.some(tool => !['codemode', 'direct'].includes(tool.exposure))) throw Error('MCP_EXPOSURE_NOT_SUPPORTED_BY_NATIVE_HOST');
    const byName = new Map(tools.map(tool => [tool.definition.name, tool]));
    return [{ server: spec.name, allowedTools: [...byName.keys()],
      directTools: tools.filter(tool => tool.exposure === 'direct').map(tool => tool.definition.name),
      authorize: (tool, args, api, taskContext) => current(spec.name, tool, args, api, taskContext, state.snapshot),
      client: { listTools: async () => tools.map(tool => tool.definition),
        callTool: (name, args, options = {}) => manager.call(byName.get(name), args, { callId: randomUUID(), signal: options.signal }) },
    }];
  });
  const mailState = state => identity && state.sources.some(source => source.server === 'mcp-agent-mail')
    ? Object.freeze({ project: identity.project, name: identity.name }) : null;
  const env = state => mailState(state) ? { AGENT_MAIL_AGENT: identity.name, AGENT_MAIL_PROJECT: identity.project } : {};
  const status = (state, servers) => ({ manager: 'nico',
    configuredServers: Object.values(state.snapshot.servers).map(server => ({ server: server.name, disposition: server.disposition })),
    servers: closed ? state.specs.map(spec => ({ server: spec.name, state: 'closed', tools: 0 })) : [...servers, ...state.failures],
    agentMail: mailState(state) });
  const close = () => {
    closePromise ??= (async () => { closed = true; await manager.close(); })();
    return closePromise;
  };
  try {
    for (const spec of active.specs) await current(spec.name);
    await manager.ready();
    active.sources = makeSources(active, manager.catalog());
    return {
      get sources() { return active.sources; },
      get shellEnv() { return env(active); },
      close,
      status: () => status(active, manager.status()),
      async prepareReload() {
        if (closed) throw Error('MCP_SESSION_CLOSED');
        const next = project(load());
        if (next.failures.length) throw Error('MCP_MAIL_EXISTING_IDENTITY_REQUIRED');
        for (const spec of next.specs) await current(spec.name, undefined, undefined, undefined, undefined, next.snapshot);
        const prepared = await manager.prepareReload(next.specs);
        try {
          next.sources = makeSources(next, prepared.catalog());
          let validated = false;
          const validate = () => {
            validated = false;
            if (closed || digest(load().servers) !== digest(next.snapshot.servers))
              throw Error('MCP_CONFIG_CHANGED_DURING_PREPARE');
            prepared.validate();
            validated = true;
          };
          return { sources: next.sources, shellEnv: env(next), status: () => status(next, prepared.status()),
            validate,
            // Call validate at the final native fence, then publish in the same
            // synchronous commit. Publication performs no filesystem or network I/O.
            publish() {
              if (!validated) throw Error('MCP_CANDIDATE_NOT_VALIDATED');
              prepared.publish();
              active = next;
            },
            discard: () => prepared.discard(), drain: () => prepared.drain(),
          };
        } catch (error) { await prepared.discard(); throw error; }
      },
    };
  } catch (error) { await close(); throw error; }
}
