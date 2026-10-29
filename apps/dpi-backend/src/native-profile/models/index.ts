import {
  createModels,
  getSupportedThinkingLevels,
  type AuthContext,
  type AuthOperationOptions,
  type CredentialStore,
  type ModelThinkingLevel,
  type ModelsStore,
  type Provider,
} from '@earendil-works/pi-ai';
import { builtinProviders } from '@earendil-works/pi-ai/providers/all';

export interface NativeModelReference {
  readonly provider: string;
  readonly modelId: string;
}

export interface NativeModelDescriptor {
  id: string;
  provider: string;
  name: string;
  contextWindow: number;
  reasoning: boolean;
  supportedThinkingLevels: ModelThinkingLevel[];
  available: boolean;
  cost: { input: number; output: number; cacheRead: number; cacheWrite: number };
}

export interface NativeModelsOptions {
  /** Explicit server capability. No auth.json, process environment or interactive login fallback. */
  credentials: CredentialStore;
  /** Complete native provider list. Omit to use the same public builtins as the selected host. */
  providers?: readonly Provider[];
  authContext?: AuthContext;
  modelsStore?: ModelsStore;
  defaultModel?: NativeModelReference;
}

/** The selected host's public SDK ownership seam, not a second model runtime. */
export async function createNativeModels(options: NativeModelsOptions) {
  if (!options?.credentials) throw new Error('NATIVE_CREDENTIAL_STORE_REQUIRED');
  const models = createModels({
    credentials: options.credentials,
    modelsStore: options.modelsStore,
    authContext: options.authContext ?? { env: async () => undefined, fileExists: async () => false },
  });
  const ids = new Set<string>();
  for (const provider of options.providers ?? builtinProviders()) {
    if (!provider.id.trim() || ids.has(provider.id)) throw new Error(`Duplicate or empty native provider ID: ${provider.id}`);
    ids.add(provider.id);
    models.setProvider(provider);
  }
  // Same cache-only startup phase as ModelRuntime.create; never resolve/refresh OAuth or fetch catalogs here.
  const refresh = await models.refresh({ allowNetwork: false });
  if (refresh.aborted || refresh.errors.size) throw new Error('Native model cache initialization failed');

  async function requireModel(reference: NativeModelReference, operation?: AuthOperationOptions) {
    const { provider, modelId } = reference;
    operation?.signal?.throwIfAborted();
    if (!models.getModel(provider, modelId)) throw new Error(`Native model is unavailable: ${provider}/${modelId}`);
    const model = (await models.getAvailable(provider, operation)).find(model => model.id === modelId);
    if (!model) throw new Error(`Native model credentials or availability are missing: ${provider}/${modelId}`);
    return model;
  }

  async function catalogue(operation?: AuthOperationOptions): Promise<NativeModelDescriptor[]> {
    const available = new Set((await models.getAvailable(undefined, operation)).map(model => JSON.stringify([model.provider, model.id])));
    return models.getModels().map(model => ({
      id: model.id,
      provider: model.provider,
      name: model.name,
      contextWindow: model.contextWindow,
      reasoning: model.reasoning,
      supportedThinkingLevels: getSupportedThinkingLevels(model),
      available: available.has(JSON.stringify([model.provider, model.id])),
      // Never serialize model/auth/provider objects, headers, URLs, tokens or arbitrary metadata.
      cost: { input: model.cost.input, output: model.cost.output, cacheRead: model.cost.cacheRead, cacheWrite: model.cost.cacheWrite },
    }));
  }

  const defaultModel = options.defaultModel ? Object.freeze({ provider: options.defaultModel.provider, modelId: options.defaultModel.modelId }) : undefined;
  if (defaultModel) await requireModel(defaultModel);
  return { models, defaultModel, requireModel, catalogue };
}
