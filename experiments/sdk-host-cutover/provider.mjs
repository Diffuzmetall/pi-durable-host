import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

/** External OAuth store stays read-only; availability never refreshes credentials. */
export function createAntigravityAccess({ agentDir, getApiKey, refreshToken }) {
  let cached;
  async function account() {
    try {
      const bytes = await readFile(join(agentDir, 'antigravity-accounts.json'), 'utf8');
      const saved = JSON.parse(bytes);
      const accounts = saved?.accounts;
      const selected = accounts?.[saved.activeAccountId] ?? Object.values(accounts ?? {})[0];
      if (!selected || typeof selected.access !== 'string' || typeof selected.refresh !== 'string' ||
          !selected.refresh || !Number.isFinite(selected.expires)) return undefined;
      return { value: selected, fingerprint: createHash('sha256').update(bytes).digest('hex') };
    } catch { return undefined; }
  }
  return {
    available: async () => !!await account(),
    resolveApiKey: async ({ abortSignal } = {}) => {
      abortSignal?.throwIfAborted();
      const saved = await account();
      abortSignal?.throwIfAborted();
      if (!saved) throw Error('ANTIGRAVITY_ACCOUNT_UNAVAILABLE');
      if (cached?.fingerprint === saved.fingerprint && cached.expires > Date.now() + 60_000) return cached.key;
      let selected = saved.value;
      if (!selected.access || selected.expires <= Date.now() + 300_000)
        selected = { ...selected, ...await refreshToken(selected) };
      abortSignal?.throwIfAborted();
      const key = getApiKey({ ...selected, type: 'oauth' });
      cached = { key, fingerprint: saved.fingerprint, expires: selected.expires };
      return key;
    },
  };
}

/** Native public Provider interface; protocol/catalog remain owned by pi-antigravity. */
export function createAntigravityProvider({ models, stream, access, baseUrl = 'https://daily-cloudcode-pa.googleapis.com' }) {
  const catalogue = models.map(model => ({ ...model, provider: 'antigravity', api: 'antigravity-api', baseUrl }));
  return {
    id: 'antigravity', name: 'Antigravity', baseUrl,
    auth: { apiKey: {
      name: 'Existing Antigravity OAuth account',
      check: async ({ signal }) => {
        signal.throwIfAborted();
        return await access.available() ? { type: 'api_key', source: 'Antigravity OAuth store' } : undefined;
      },
      resolve: async ({ signal }) => {
        if (!await access.available()) return undefined;
        return { auth: { apiKey: await access.resolveApiKey({ abortSignal: signal }) }, source: 'Antigravity OAuth store' };
      },
    } },
    getModels: () => catalogue,
    stream: (model, context, options) => stream(model, context, options),
    streamSimple: (model, context, options) => stream(model, context, options),
  };
}
