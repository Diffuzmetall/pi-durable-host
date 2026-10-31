const { InMemoryCredentialStore } = await import("file:///tmp/dpi-bb-packed-ji7o5v/fresh/node_modules/@earendil-works/pi-ai/dist/index.js");
const { fauxProvider } = await import("file:///tmp/dpi-bb-packed-ji7o5v/fresh/node_modules/@earendil-works/pi-ai/dist/providers/faux.js");
const { createNativeModels } = await import("file:///tmp/dpi-bb-packed-ji7o5v/fresh/node_modules/dpi-backend/dist/dpi-backend/src/native-profile/models/index.js");
const { createNativeProfile } = await import("file:///tmp/dpi-bb-packed-ji7o5v/fresh/node_modules/dpi-backend/dist/dpi-backend/src/native-profile/profile.js");
const { installFaux } = await import("file:///tmp/dpi-bb-packed-ji7o5v/fresh/node_modules/dpi-backend/dist/dpi-backend/src/faux.js");

/** Real native per-session Models factory; only the deterministic provider is faux. No ambient credentials/network. */
export async function fixtureProfileFactory(policy: unknown, ownerToken: string) {
  const reference = { provider: 'faux', modelId: 'echo' };
  const create = async () => {
    const runtime = await createNativeModels({ credentials: new InMemoryCredentialStore(), defaultModel: reference,
      providers: [fauxProvider({ provider: 'faux', models: [{ id: 'echo', name: 'Native Faux Echo', reasoning: true, contextWindow: 128000, maxTokens: 8192 }] }).provider] });
    installFaux(runtime.models); // Actual backend response factory; an empty faux provider proves only failure delivery.
    return runtime;
  };
  const device = await create();
  const base = createNativeProfile({ policy, owner: (policy as { authenticate(token: string): unknown }).authenticate(ownerToken),
    models: { defaultModel: reference, catalogue: device.catalogue, create },
    resolveSkill: async () => { throw Error('No fixture skills'); }, connectMcp: async () => ({ sources: [], close: async () => {} }) });
  return Object.assign(async (context: any) => {
    const model = context.models.models.getModel('faux', 'echo');
    model.reasoning = true; model.thinkingLevelMap = { max: 'max', xhigh: null };
    return base(context);
  }, { id: base.id, capabilities: base.capabilities, models: base.models });
}
