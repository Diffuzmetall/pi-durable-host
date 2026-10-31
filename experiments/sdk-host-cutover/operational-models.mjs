import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { builtinProviders } from '@earendil-works/pi-ai/providers/all';
import { createAntigravityAccess, createAntigravityProvider } from './provider.mjs';
import { antigravityApiKey, refreshAntigravityToken } from './compiled/bindings.mjs';
import { getCurrentAntigravityModels, hydrateAntigravityCatalog, streamAntigravity, DEFAULT_ENDPOINT } from './compiled/antigravity.mjs';

/** Explicitly bind the CLI account store; never persist its OAuth token via AuthStorage. */
export async function operationalModelOptions({ agentDir, credentials }) {
  const access = createAntigravityAccess({ agentDir, getApiKey: antigravityApiKey, refreshToken: refreshAntigravityToken });
  // Restore the latest existing offline catalogue through upstream's validator/routing hydrator.
  const snapshots = [];
  for (const name of ['models-store.json', 'antigravity-model-catalog.json']) {
    try {
      const saved = JSON.parse(await readFile(join(agentDir, name), 'utf8'));
      const entry = name === 'models-store.json' ? saved.antigravity : { 'pi-antigravity': { catalog: saved, checkedAt: saved.checkedAt } };
      if (entry?.['pi-antigravity']) snapshots.push(entry);
    } catch (error) { if (error.code !== 'ENOENT') throw Error('ANTIGRAVITY_CATALOG_UNREADABLE'); }
  }
  snapshots.sort((a, b) => (a['pi-antigravity'].checkedAt ?? 0) - (b['pi-antigravity'].checkedAt ?? 0));
  for (const snapshot of snapshots) hydrateAntigravityCatalog(snapshot);
  const provider = createAntigravityProvider({ models: getCurrentAntigravityModels(), stream: streamAntigravity, access, baseUrl: DEFAULT_ENDPOINT });
  return {
    credentials: {
      read: (id, options) => id === 'antigravity' ? Promise.resolve(undefined) : credentials.read(id, options),
      list: async options => (await credentials.list(options)).filter(item => item.providerId !== 'antigravity'),
      modify: (id, fn, options) => {
        if (id === 'antigravity') throw Error('ANTIGRAVITY_ACCOUNT_STORE_READ_ONLY');
        return credentials.modify(id, fn, options);
      },
      delete: (id, options) => {
        if (id === 'antigravity') throw Error('ANTIGRAVITY_ACCOUNT_STORE_READ_ONLY');
        return credentials.delete(id, options);
      },
    },
    providers: [...builtinProviders(), provider],
    authContext: { env: async () => undefined, fileExists: async () => false },
  };
}
