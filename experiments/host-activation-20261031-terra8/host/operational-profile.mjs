import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { lstat, readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { createNativeProfile, createNativeModels, resolveAvailableModel, saveGeneratedImages, loadRegistryAdapters } from 'dpi-backend/native-profile';
import { defineExtension, defineTool } from '@earendil-works/pi-durable';
import { Type } from '@earendil-works/pi-ai';
import {
  AuthStorage, executeAntigravitySearch, generateAntigravityImageContent,
  antigravityApiKey, refreshAntigravityToken, loadTracingConfig, createSessionTracing,
  resolveMemoryBinding, resolveMemoryClient,
} from './compiled/bindings.mjs';
import { connectSessionMcp } from './session-mcp.mjs';
import { provisionNewSessionMail } from './provision-session-mail.mjs';
import { attachDelm } from './delm-profile.mjs';
import { operationalModelOptions } from './operational-models.mjs';

/** Trusted server bootstrap. Callers supply grants, never module paths or credentials over HTTP. */
export async function createOperationalProfile({ policy, owner, models, trustedWorkspaces = [], nativeExtensions = [] }) {
  const home = homedir();
  const agentDir = process.env.PI_CODING_AGENT_DIR || join(home, '.pi', 'agent');
  const defaultModel = { provider: 'openai-codex', modelId: 'gpt-6.1-sol' };
  if (!models) {
    const authPath = join(agentDir, 'auth.json');
    const info = await lstat(authPath);
    if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o077)) throw Error('PRIVATE_NATIVE_AUTH_FILE_REQUIRED');
    const credentials = AuthStorage.create(authPath);
    const modelOptions = () => operationalModelOptions({ agentDir, credentials });
    const discovery = await createNativeModels(modelOptions);
    await discovery.requireModel(defaultModel);
    models = { defaultModel, catalogue: discovery.catalogue, create: () => createNativeModels(modelOptions) };
  }
  const trusted = new Set(trustedWorkspaces.map(path => resolve(path)));
  const mcpOwners = new WeakMap();
  const native = createNativeProfile({
    policy, owner, models, resolveModel: resolveAvailableModel,
    loadAdapters: context => loadRegistryAdapters(nativeExtensions, context.cwd),
    dcg: { binaryPath: process.env.DCG_BIN || join(home, '.local/bin/dcg'),
      envSource: () => ({ HOME: home, PATH: '/usr/bin:/bin' }) },
    skills: context => ({ homeDir: home, agentDir, projectRoot: context.cwd, projectTrusted: trusted.has(resolve(context.cwd)) }),
    connectMcp: async context => {
      // Store.openAgent holds this lock and requires an existing DB for resume;
      // only its new-session path invokes the factory before creating agent.sqlite.
      const database = join(context.directory, 'agent.sqlite');
      const existing = await lstat(database).catch(error => { if (error.code !== 'ENOENT') throw error; });
      if (!existing && !context.offline) {
        if (await readFile(`${database}.lock`, 'utf8') !== String(process.pid)) throw Error('NATIVE_CREATION_OWNER_REQUIRED');
        await provisionNewSessionMail({ cwd: context.cwd, directory: context.directory, agentDir, stage: 'new-sdk-session' });
      }
      const mcp = await connectSessionMcp(context, {
        agentDir, projectTrusted: trusted.has(resolve(context.cwd)),
        authorize: async () => policy.assert(owner, 'write', { sessionId: context.sessionId, conversationId: 1 }),
        providerToken: async provider => (await context.models?.models.getAuth(provider))?.auth?.apiKey,
      });
      mcpOwners.set(context, mcp);
      return mcp;
    },
    codex: context => ({
      authorize: async ({ conversationId }) => {
        const identity = policy.assert(owner, 'write', { sessionId: context.sessionId, conversationId });
        return identity.authority === 'human';
      },
    }),
    context7: () => ({ resolveCredential: async () => {
      const environment = process.env.CONTEXT7_API_KEY;
      if (environment?.trim()) return environment;
      const file = process.env.CONTEXT7_KEY_FILE || join(home, '.config/pi-durable/extensions/context7.env');
      let contents;
      try { contents = await readFile(file, 'utf8'); }
      catch (error) { if (error.code === 'ENOENT') return undefined; throw Error('CONTEXT7_CREDENTIAL_UNAVAILABLE'); }
      return parseEnv(contents).CONTEXT7_API_KEY?.trim() || undefined;
    } }),
    antigravity: () => {
      let cached;
      return {
        resolveApiKey: async context => {
          context.abortSignal?.throwIfAborted();
          if (cached?.expires > Date.now() + 60_000) return cached.key;
          let saved;
          try { saved = JSON.parse(await readFile(join(agentDir, 'antigravity-accounts.json'), 'utf8')); }
          catch { throw Error('ANTIGRAVITY_ACCOUNT_UNAVAILABLE'); }
          const entries = Object.values(saved.accounts ?? {});
          let account = saved.accounts?.[saved.activeAccountId] ?? entries[0];
          if (!account) throw Error('ANTIGRAVITY_ACCOUNT_UNAVAILABLE');
          // Preserve the native shim's selected account and memory-only refresh semantics.
          if (!account.access || account.expires <= Date.now() + 300_000)
            account = { ...account, ...await refreshAntigravityToken(account) };
          context.abortSignal?.throwIfAborted();
          const key = antigravityApiKey({ ...account, type: 'oauth' });
          cached = { key, expires: account.expires > 0 ? account.expires : Date.now() + 300_000 };
          return key;
        },
        search: executeAntigravitySearch,
        image: async input => {
          const result = await generateAntigravityImageContent(input);
          return { ...result, ...await saveGeneratedImages(input.cwd, input.path, result.images) };
        },
      };
    },
    github: context => ({ env: { HOME: join(context.directory, 'github-home'),
      GH_CONFIG_DIR: process.env.GH_CONFIG_DIR || join(home, '.config/gh'), PATH: '/usr/bin:/bin',
      ...(process.env.GH_TOKEN ? { GH_TOKEN: process.env.GH_TOKEN } : {}),
      ...(process.env.GITHUB_TOKEN ? { GITHUB_TOKEN: process.env.GITHUB_TOKEN } : {}),
    } }),
    tracing: () => {
      const config = loadTracingConfig({ env: process.env, path: join(agentDir, 'langfuse.json') });
      return config ? { sdk: createSessionTracing(config) } : {};
    },
    memory: () => ({
      resolveBinding: cwd => resolveMemoryBinding(cwd),
      resolveClient: (binding, cfg) => {
        const resolved = resolveMemoryClient('pi', binding.cwd);
        if (resolved.bankId !== binding.bankId || (cfg && resolved.cfg.apiUrl !== cfg.apiUrl)) throw Error('MEMORY_BINDING_CHANGED');
        return resolved.client;
      },
      // Native lifecycle owns durable effects. No legacy fire-and-forget runtime is installed.
      lifecycleEffects: { env: { HINDSIGHT_DISABLE_HOOKS: process.env.HINDSIGHT_DISABLE_HOOKS } },
    }),
  });
  return Object.assign(async context => {
    const composition = await native(context);
    const mcp = mcpOwners.get(context);
    for (const server of mcp.status().servers)
      if (server.state !== 'connected') composition.native.inventory.unavailable.push(`MCP ${server.server}: ${server.state}`);
    const status = defineExtension({ name: 'host-mcp-status', tools: [defineTool({
      name: 'mcp_status', description: 'Show this session’s actual MCP connection states and admitted Mail identity without credentials.',
      parameters: Type.Object({}), replay: 'safe',
      execute: async () => ({ output: [{ type: 'text', text: JSON.stringify(mcp.status()) }] }),
    })] });
    composition.registry.install(status);
    composition.extensions.push(status);
    if (process.env.DELM_BINDINGS_FILE) await attachDelm(composition, context, {
      bindingFile: process.env.DELM_BINDINGS_FILE,
      modulePath: new URL('./delm-engine/index.js', import.meta.url).pathname,
    });
    return composition;
  }, native);
}
