import { createRegistry, type Extension, type HarnessOptions, type Harness, type Conversation, type ConversationId, type Tx, type Storage } from "@earendil-works/pi-durable";
import { CodingTools } from "@earendil-works/pi-durable/tools";
import { createPlayground, Workspace, type SpawnSession } from "./extensions.js";
import { createJobs, JobRuns, type Jobs } from "./jobs.js";
import { createAddons, type Addons } from "./addons.js";
import type { SharedState } from "./shared-state.js";
import type { Context } from "@earendil-works/chord";
import type { AdmissionIdentity } from "./idempotency.js";
import type { createGoalOperator } from "./native-profile/operator/goal-operator.js";
import type { createNativeModels, NativeModelReference } from "./native-profile/models/index.js";
import type { createNativeSkills } from "./native-profile/skills/index.js";
import type { ParentAuthorize, ParentControl } from "./native-profile/subagents/parent-control.js";
import type { NativeIii } from './native-profile/iii/index.js';

export type RuntimeModels = Awaited<ReturnType<typeof createNativeModels>>;

/** Device discovery is not authority; create returns the actual isolated session capability. */
export interface RuntimeModelProfile {
  defaultModel: NativeModelReference;
  catalogue: RuntimeModels['catalogue'];
  create(context: RuntimeProfileContext): RuntimeModels | Promise<RuntimeModels>;
}

export interface RuntimeProfileContext {
  sessionId: string;
  cwd: string;
  directory: string;
  shellEnv: Readonly<Record<string, string>>;
  shared: SharedState;
  spawn: SpawnSession;
  offline: boolean;
  models?: RuntimeModels;
}

export interface RuntimeComposition {
  registry: ReturnType<typeof createRegistry>;
  extensions: Extension[];
  skills?: Pick<ReturnType<typeof createNativeSkills>, 'catalogue' | 'getSkill'>;
  conversationCreated?: HarnessOptions["conversationCreated"];
  jobs?: Jobs;
  addons?: Addons;
  env?: HarnessOptions["env"];
  bind?(harness: Harness, context: Context, storage?: Storage): Promise<void>;
  shutdown?(context: Context): Promise<void>;
  cleanup?(context: Context): Promise<void>;
  readOnlyTools?: readonly string[];
  goalOperator?: Pick<ReturnType<typeof createGoalOperator>, "command" | "receipt">;
  parentControl?(authorize: ParentAuthorize, context: Context): ParentControl;
  iii?: NativeIii;
  protectsExecution?(conversation: ConversationId, context: Context): Promise<boolean>;
  admitInput?(conversation: Conversation, nativeRequestId: string, context: Context): Promise<void>;
  prepareInput?(tx: Tx, conversation: ConversationId, nativeRequestId: string, identity: AdmissionIdentity): Promise<void>;
  documentReaders?: ReadonlyMap<string, (harness: Harness, conversation: Conversation, context: Context) => Promise<unknown>>;
}

/** Trusted server code only: callers cannot select module paths over HTTP. */
export type RuntimeProfileFactory = ((context: RuntimeProfileContext) => RuntimeComposition | Promise<RuntimeComposition>) & {
  readonly id: string;
  readonly capabilities?: readonly string[];
  readonly models?: RuntimeModelProfile;
};

export const minimalProfile = Object.assign((_context: RuntimeProfileContext): RuntimeComposition => {
  const registry = createRegistry();
  registry.install(CodingTools);
  return { registry, extensions: [CodingTools] };
}, { id: "minimal@1" }) satisfies RuntimeProfileFactory;

/** Preserve upstream demos explicitly; they are not dependencies of the minimal composition. */
export const playgroundProfile = Object.assign((context: RuntimeProfileContext): RuntimeComposition => {
  const composition = minimalProfile(context);
  const jobs = createJobs({ shared: context.shared, sessionId: context.sessionId });
  const playground = createPlayground(context.shared, context.sessionId, context.spawn, jobs);
  composition.registry.install(playground);
  const addons = createAddons({ offline: context.offline });
  for (const extension of addons.list) composition.registry.install(extension);
  return {
    ...composition,
    extensions: [CodingTools, playground],
    jobs,
    addons,
    conversationCreated: async (tx, conversation) => {
      await tx.doc(Workspace, conversation.id);
      await tx.doc(JobRuns, conversation.id);
    },
  };
}, { id: "playground@1" }) satisfies RuntimeProfileFactory;
