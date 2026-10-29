import type { Context } from '@earendil-works/chord';
import { join } from 'node:path';
import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context';
import { CodingTools } from '@earendil-works/pi-durable/tools';
import { createRegistry, defineExtension, hook, GenerationTask, ToolTask, ROOT_CONVERSATION_ID, type Harness, type Conversation, type ConversationId } from '@earendil-works/pi-durable';
import type { RuntimeComposition, RuntimeModelProfile, RuntimeProfileContext, RuntimeProfileFactory } from '../runtime-profile.js';
import { GrantDenied, type GrantHandle, type GrantPolicy } from '../grants.js';
import { existingInputGuard, bindExistingInput } from './admission/input-policy.js';
import installSubagents from './subagents/registry.js';
import { bindParentControl, type ParentAuthorize, type SubagentOptions, type SubagentAdmission } from './subagents/index.js';
import { SubagentsDoc } from './subagents/documents.js';
import { TeamDoc, SupervisorDoc, ChildBindingDoc } from './subagents/supervisor.js';
import { createGoalOperator } from './operator/goal-operator.js';
import { createAutomation } from './automation/automation.js';
import { NativeGoalsDoc } from './automation/native-contract.js';
import { NativeGoalRuntime } from './automation/native-goals.js';
import { ScheduleDoc } from './automation/schedules.js';
import { createDcgEnvironmentFactory } from './guards/dcg/index.js';
import type { DcgEvaluatorOptions } from './guards/dcg/evaluator.js';
import { createMultiMcpCodemodeExtension, type McpCodemodeOptions } from './guards/mcp-codemode.js';
import { createSessionMemory, type SessionMemory } from './memory/session-memory.mjs';
import createSearchHistory from './tools/search-history/index.js';
import createContext7, { type Context7Options } from './tools/context7/context7-mcp.js';
import createAntigravityTools, { type AntigravityOperations } from './tools/antigravity/index.js';
import createWebTools, { type WebToolsOptions } from './tools/web/web-tools.js';
import createCodexApi, { type CodexHost } from './tools/codex/index.js';
import { createNativeSkills, type NativeSkillsOptions } from './skills/index.js';
import { createNativeIii } from './iii/index.js';

export { resolveAvailableModel } from './subagents/model-policy.js';
export { createNativeModels } from './models/index.js';
export type { NativeModelsOptions } from './models/index.js';
export type { RuntimeModelProfile } from '../runtime-profile.js';
export type { NativeSkillsOptions } from './skills/index.js';
export { HindsightClient, resolveConfig } from './memory/session-memory.mjs';
export { openSessionMail } from './memory/mail.js';
export { saveGeneratedImages } from './tools/antigravity/save.js';
export type { AntigravityOperations } from './tools/antigravity/index.js';
export type { Context7Options } from './tools/context7/context7-mcp.js';
export type { WebToolsOptions } from './tools/web/web-tools.js';
export type { CodexHost } from './tools/codex/index.js';

const DELEGATED_TOOLS = ['read', 'contact_supervisor'] as const;
const READ_ONLY_TOOLS = [...DELEGATED_TOOLS, 'search_history', 'context7_resolve_library_id', 'context7_query_docs', 'google_search'] as const;

export interface NativeProfileOptions {
  policy: GrantPolicy;
  /** Server-held operator capability. Never a body-provided handle or a memory controller. */
  owner: GrantHandle;
  resolveModel?: SubagentOptions['resolveModel'];
  models?: RuntimeModelProfile;
  resolveSkill?: Parameters<typeof createAutomation>[0]['resolveSkill'];
  skills?(context: RuntimeProfileContext): Omit<NativeSkillsOptions, 'cwd'> | Promise<Omit<NativeSkillsOptions, 'cwd'>>;
  dcg?: DcgEvaluatorOptions;
  context7?(context: RuntimeProfileContext): Context7Options | Promise<Context7Options>;
  antigravity?(context: RuntimeProfileContext): AntigravityOperations | Promise<AntigravityOperations>;
  web?(context: RuntimeProfileContext): Omit<WebToolsOptions, 'directory'> | Promise<Omit<WebToolsOptions, 'directory'>>;
  codex?(context: RuntimeProfileContext): CodexHost | Promise<CodexHost>;
  memory?(context: RuntimeProfileContext): Omit<Parameters<typeof createSessionMemory>[1], 'directory'> | Promise<Omit<Parameters<typeof createSessionMemory>[1], 'directory'>>;
  /** A new, explicitly configured connection set per session; close belongs to this composition. */
  connectMcp(context: RuntimeProfileContext): Promise<{
    sources: readonly McpCodemodeOptions[];
    shellEnv?: Readonly<Record<string, string>>;
    close(context: Context): Promise<void>;
  }>;
}

export interface NativeComposition extends RuntimeComposition {
  native: {
    goals: ReturnType<typeof createAutomation>['goals'];
    parentControl(authorize: ParentAuthorize, context: Context): ReturnType<typeof bindParentControl>;
    inventory: { present: readonly string[]; unavailable: readonly string[] };
  };
}

/** One native registry, one existing Harness. No private installed runtime, implicit connections or fallback owner. */
export function createNativeProfile(options: NativeProfileOptions) {
  return Object.assign(async (context: RuntimeProfileContext): Promise<NativeComposition> => {
    let host: Harness | undefined;
    let memory: SessionMemory | undefined;
    let closed = false;
    const target = { sessionId: context.sessionId, conversationId: ROOT_CONVERSATION_ID as number };
    const assertOwner = () => {
      if (closed) throw Error('NATIVE_PROFILE_CLOSED');
      const identity = options.policy.assert(options.owner, 'write', target);
      if (identity.authority !== 'human') throw Error('NATIVE_PROFILE_HUMAN_OWNER_REQUIRED');
    };
    const requireOwner = async (id: ConversationId, ctx: Context) => {
      assertOwner();
      if (!host) throw Error('NATIVE_PROFILE_NOT_BOUND');
      if (id !== ROOT_CONVERSATION_ID && !await host.commit(tx => tx.conversation(id), ctx))
        throw Error('NATIVE_PROFILE_FOREIGN_CONVERSATION');
      assertOwner();
    };
    const admit: SubagentAdmission = async (conversation, request, ctx) => {
      await requireOwner(conversation.id, ctx);
      await memory?.controller.admit(conversation, request, ctx);
      await requireOwner(conversation.id, ctx);
    };
    const mcp = await options.connectMcp(context);
    try {
      const registry = createRegistry();
      registry.install(CodingTools);
      registry.install(createSearchHistory());
      const skills = options.skills ? createNativeSkills({ ...await options.skills(context), cwd: context.cwd }) : undefined;
      if (skills) {
        options.policy.assert(options.owner, 'filesystem', target);
        registry.install(skills.extension);
      }
      registry.install(createWebTools({ ...await options.web?.(context), directory: join(context.directory, 'web') }));
      const codex = await options.codex?.(context);
      if (codex) registry.install(createCodexApi({ ...codex,
        authorize: async request => {
          await requireOwner(request.conversationId, BACKGROUND_CONTEXT);
          return await codex.authorize(request) === true;
        },
      }));
      const context7 = await options.context7?.(context);
      registry.install(createContext7(context7));
      const antigravity = await options.antigravity?.(context);
      if (antigravity) {
        options.policy.assert(options.owner, 'filesystem', target);
        registry.install(createAntigravityTools({ ...antigravity,
          search: async input => { assertOwner(); return antigravity.search(input); },
          image: async input => {
            assertOwner(); options.policy.assert(options.owner, 'filesystem', target);
            return antigravity.image(input);
          },
        }));
      }
      registry.install(defineExtension({ name: 'host.native-current-owner', hooks: [hook(GenerationTask, {
        beforeRequest: async (_request, api, ctx) => {
          await requireOwner(api.conversationId, ctx);
          if (skills) options.policy.assert(options.owner, 'filesystem', target);
          return undefined;
        },
      }), hook(ToolTask, {
        beforeTool: async (call, api, ctx) => {
          await requireOwner(api.conversationId, ctx);
          if (['web_fetch', 'batch_web_fetch', 'codex_image'].includes(call.name) ||
            (call.name === 'codex_ask' && (call.arguments.image_paths !== undefined || call.arguments.num_last_images_to_include !== undefined)))
            options.policy.assert(options.owner, 'filesystem', target);
          return undefined;
        },
      })] }));
      registry.install(await createMultiMcpCodemodeExtension(mcp.sources.map(source => ({
        ...source,
        authorize: async (tool, args, api, ctx) => {
          await requireOwner(api.conversationId, ctx);
          await source.authorize(tool, args, api, ctx);
        },
      }))));
      const composed = installSubagents(registry, admit, { resolveModel: options.resolveModel });
      const subagent = composed.snapshot().installed().find(extension => extension.name === 'subagent')!;
      const automation = createAutomation({
        admit,
        authorize: async id => {
          if (closed || !host || id !== ROOT_CONVERSATION_ID) return false;
          try { return options.policy.assert(options.owner, 'human-accept', target).authority === 'human'; }
          catch (error) { if (error instanceof GrantDenied) return false; throw error; }
        },
        tools: composed.snapshot().tools().map(({ tool }) => tool.name),
        resolveSkill: skills?.resolveGoalSkill ?? options.resolveSkill ?? (async () => { throw Error('NATIVE_SKILLS_UNCONFIGURED'); }),
      });
      const operator = createGoalOperator({ authorize: ({ conversationId, policyRef }) => {
        if (closed || !host || conversationId !== ROOT_CONVERSATION_ID) return false;
        try {
          for (const action of ['human-accept', 'write', 'control'] as const) options.policy.assertReference(policyRef, action, target);
          return true;
        }
        catch (error) { if (error instanceof GrantDenied) return false; throw error; }
      } });
      const complete = createRegistry();
      for (const extension of composed.snapshot().installed()) complete.install(extension);
      for (const extension of automation.extensions) complete.install(extension);
      complete.install(operator.extension);
      complete.install(existingInputGuard(() => !closed && host ? {
        session: host,
        authorize: async (policy, id) => {
          if (policy.workspace !== context.cwd) return false;
          const parent = policy.parent;
          if (parent !== undefined && !await host!.commit(async tx => {
            const child = await tx.conversation(id);
            const binding = (await tx.doc(ChildBindingDoc, id)).binding;
            return child?.owner?.conversationId === parent && binding?.parent === parent && child.owner.taskId === binding.anchor;
          }, BACKGROUND_CONTEXT)) return false;
          try {
            const scope = { sessionId: context.sessionId, conversationId: parent ?? id };
            if (parent !== undefined) options.policy.assertReference(policy.policy, 'control', scope);
            return options.policy.assertReference(policy.policy, 'write', scope).authority === 'delegated';
          }
          catch (error) { if (error instanceof GrantDenied) return false; throw error; }
        },
      } : undefined));
      const iii = createNativeIii({ policy: options.policy, nativeSessionId: context.sessionId, workspace: context.cwd,
        directory: context.directory, registry: complete,
        assertOwner: action => { assertOwner(); options.policy.assert(options.owner, action, target); }, controller: { admit } });
      complete.install(iii.guard);
      if (options.memory) memory = await createSessionMemory(complete, { ...await options.memory(context), directory: join(context.directory, 'memory') });
      const shellEnv = { ...context.shellEnv, ...mcp.shellEnv, ...(memory ? {
        HINDSIGHT_LOG_FILE: memory.paths.log, HINDSIGHT_DIAG_FILE: memory.paths.diag, HINDSIGHT_USAGE_FILE: memory.paths.usage,
      } : {}) };
      const guard = createDcgEnvironmentFactory({ defaultCwd: context.cwd, shellEnv, evaluatorOptions: options.dcg });
      const documentReaders = new Map<string, (h: Harness, c: Conversation, ctx: Context) => Promise<unknown>>([
        ['bb.subagents', (h, c, ctx) => h.snapshot(SubagentsDoc, c.id, ctx)],
        ['bb.subagent-team', (h, c, ctx) => h.snapshot(TeamDoc, c.id, ctx)],
        ['bb.subagent-supervisor', (h, c, ctx) => h.snapshot(SupervisorDoc, c.id, ctx)],
        ['bb.subagent-parent', (h, c, ctx) => h.snapshot(ChildBindingDoc, c.id, ctx)],
        ['durable.schedules', (h, c, ctx) => h.snapshot(ScheduleDoc, c.id, ctx)],
        ['durable-goals.runtime', async (h, c, ctx) => {
          const owners = await h.snapshot(NativeGoalsDoc, ctx);
          const runtime = await h.snapshot(NativeGoalRuntime, ctx);
          const owned = new Set(Object.values(owners?.goals ?? {}).filter(goal => goal.ownerConversationId === c.id).map(goal => goal.id));
          return {
            goals: Object.fromEntries(Object.entries(runtime?.goals ?? {}).filter(([id]) => owned.has(id)).map(([id, goal]) => {
              const { skillText: _privateSkillBodies, ...metadata } = goal;
              return [id, metadata];
            })),
            links: Object.fromEntries(Object.entries(runtime?.links ?? {}).filter(([, id]) => owned.has(id))),
          };
        }],
        ['durable-goals.native-goals', async (h, c, ctx) => {
          const value = await h.snapshot(NativeGoalsDoc, ctx);
          const goals = Object.fromEntries(Object.entries(value?.goals ?? {}).filter(([, goal]) => goal.ownerConversationId === c.id));
          return { goals, ...(value?.active && goals[value.active] ? { active: value.active } : {}) };
        }],
      ]);
      const parentControl: NonNullable<RuntimeComposition['parentControl']> = (authorize, ctx) => {
        if (closed || !host) throw Error('NATIVE_PROFILE_NOT_BOUND');
        return bindParentControl(subagent, host, ctx, async (tx, parent, action) => {
          assertOwner();
          options.policy.assert(options.owner, 'control', target);
          const grant = await authorize(tx, parent, action);
          return { ...grant, assertCurrent: () => {
            assertOwner();
            options.policy.assert(options.owner, 'control', target);
            grant.assertCurrent?.();
          } };
        });
      };
      return {
        registry: complete,
        extensions: [...complete.snapshot().installed()],
        skills,
        env: (target, ctx) => guard.env(target, ctx),
        documentReaders,
        goalOperator: operator,
        parentControl,
        iii,
        readOnlyTools: READ_ONLY_TOOLS,
        async bind(value, ctx, storage) {
          if (host || closed) throw Error('NATIVE_PROFILE_ALREADY_BOUND_OR_CLOSED');
          host = value;
          if (memory) {
            if (!storage) throw Error('NATIVE_PROFILE_ORIGINAL_STORAGE_REQUIRED');
            await memory.bind({ session: value, storage, context: ctx });
          }
          await automation.bind(value);
          operator.bind(value, automation.goals, ROOT_CONVERSATION_ID);
          await iii.bind(value, ctx);
        },
        admitInput: admit,
        protectsExecution: (conversation, ctx) => operator.protectsExecution(conversation, ctx),
        async prepareInput(tx, conversation, request, identity) {
          if (closed || !host) throw Error('NATIVE_PROFILE_NOT_BOUND');
          identity.assertCurrent();
          if (identity.authority !== 'delegated') return;
          if (!identity.policyReference) throw Error('DELEGATED_INPUT_POLICY_REQUIRED');
          const current = options.policy.assertReference(identity.policyReference, 'write', { sessionId: context.sessionId, conversationId: conversation });
          if (current.authority !== 'delegated' || current.actor !== identity.actor || current.source !== identity.source)
            throw Error('DELEGATED_INPUT_IDENTITY_CONFLICT');
          await bindExistingInput(tx, conversation, request, {
            workspace: context.cwd, policy: identity.policyReference, tools: [...DELEGATED_TOOLS],
          });
          identity.assertCurrent();
        },
        async shutdown(ctx) {
          closed = true;
          operator.shutdown();
          try { await iii.close(); await automation.shutdown(ctx); } finally { await memory?.close(); }
        },
        async cleanup(ctx) {
          try { await mcp.close(ctx); } finally { await guard.cleanup(ctx); }
        },
        native: {
          goals: automation.goals,
          parentControl,
          inventory: {
            present: [...(context.models ? ['native session-local provider/auth catalogue'] : []), 'native CodingTools', 'native own-conversation search_history', 'native Web tools', ...(skills ? ['native skills/context/Goal resolver'] : []), ...(codex ? ['native Codex tools'] : []), 'native Context7 tools', ...(antigravity ? ['native Antigravity tools'] : []), 'native ExistingInputs policy', 'native subagents/parent-control', 'native Goal/operator', 'native schedules', 'DCG fail-closed env', 'native CodeMode/models:false', ...(memory ? ['session-local native Hindsight'] : []), ...mcp.sources.map(source => `MCP:${source.server}`)],
            unavailable: [...(context7?.resolveCredential ? [] : ['Context7 credential resolver unconfigured']), ...(antigravity ? [] : ['Antigravity operations unconfigured']), ...(codex ? [] : ['CodexHost explicitly unconfigured']), ...(skills ? [] : ['native skills explicitly unconfigured']), ...(memory ? [] : ['Hindsight explicitly unconfigured']), ...(mcp.sources.some(source => source.server === 'mcp-agent-mail') ? [] : ['Mail explicitly unconfigured']), ...(context.models ? [] : ['selected host provider/auth catalogue unconfigured']), 'legacy arbitrary registries'],
          },
        },
      };
    } catch (error) {
      try { await memory?.close(); } finally { await mcp.close(BACKGROUND_CONTEXT); }
      throw error;
    }
  }, { id: 'native@1', models: options.models, capabilities: ['delegated-input.v1', 'profile-documents.v1', 'goal-operator.v1', 'native-parent-control.v1', 'native-bb-binding.v1', 'native-bb-outcome.v1', 'native-parent-target.v1', 'native-bb-input.v1', 'native-iii.v2', ...(options.skills ? ['skills.v1'] : [])] }) satisfies RuntimeProfileFactory;
}
