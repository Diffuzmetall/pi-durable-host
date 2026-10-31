import assert from 'node:assert/strict';
import { constants, openSync, writeSync, fsyncSync, closeSync } from 'node:fs';
import { open } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { zstdDecompressSync } from 'node:zlib';

export const savedModel = Object.freeze({ provider: 'openai-codex', modelId: 'gpt-6.1-sol' });
export const probeStages = Object.freeze(['terminal', 'selected-copy', 'iii']);

// This is a bounded acceptance capability, NOT the production OAuth refresh owner.
export function subscriptionCredentials(authPath) {
  return {
    async read(provider, options) {
      options?.signal?.throwIfAborted();
      if (provider !== savedModel.provider) return undefined;
      const file = await open(authPath, constants.O_RDONLY | constants.O_NOFOLLOW);
      let credential;
      try {
        const stat = await file.stat();
        assert(stat.isFile() && (stat.mode & 0o077) === 0, 'PRIVATE_AUTH_FILE_REQUIRED');
        const content = await file.readFile('utf8');
        let parsed;
        try { parsed = JSON.parse(content); }
        catch { throw Error('AUTH_JSON_INVALID'); }
        assert(parsed && typeof parsed === 'object' && !Array.isArray(parsed), 'AUTH_OBJECT_REQUIRED');
        credential = parsed[provider];
      } finally { await file.close(); }
      options?.signal?.throwIfAborted();
      assert(credential?.type === 'oauth', 'SUBSCRIPTION_OAUTH_REQUIRED');
      assert(typeof credential.access === 'string' && credential.access.length > 0, 'OAUTH_ACCESS_REQUIRED');
      assert(typeof credential.refresh === 'string' && credential.refresh.length > 0, 'OAUTH_REFRESH_REQUIRED');
      assert(Number.isFinite(credential.expires) && credential.expires > Date.now() + 300_000, 'OAUTH_REFRESH_REQUIRED_BEFORE_PROBE');
      return credential;
    },
    async list(options) {
      await this.read(savedModel.provider, options);
      return [{ providerId: savedModel.provider, type: 'oauth' }];
    },
    async modify() { throw Error('PROBE_MUST_NOT_REFRESH_OR_WRITE_AUTH'); },
    async delete() { throw Error('PROBE_MUST_NOT_DELETE_AUTH'); },
  };
}

// Keep ONE private ledger directory for this authorization across all processes/restarts.
// A consumed slot is never removed, even on timeout or failure before an HTTP response.
export function subscriptionProbeFetch(ledgerDirectory, stage, transport = globalThis.fetch) {
  assert(probeStages.includes(stage), 'UNAPPROVED_PROBE_STAGE');
  return async (input, init) => {
    assert.equal(String(input), 'https://chatgpt.com/backend-api/codex/responses', 'SUBSCRIPTION_ENDPOINT_REQUIRED');
    assert.equal(init?.method, 'POST', 'GENERATION_POST_REQUIRED');
    const encoding = new Headers(init.headers).get('content-encoding');
    assert(encoding === null || encoding === 'zstd', 'UNSUPPORTED_REQUEST_ENCODING');
    const serialized = encoding === 'zstd' ? zstdDecompressSync(init.body).toString('utf8') : init.body;
    assert.equal(typeof serialized, 'string', 'SERIALIZED_REQUEST_REQUIRED');
    const body = JSON.parse(serialized);
    assert.equal(body.model, savedModel.modelId, 'SAVED_MODEL_REQUIRED');
    assert.equal(body.tool_choice, 'none', 'TEXT_ONLY_PROBE_REQUIRED');
    assert(body.service_tier === undefined || body.service_tier === 'default', 'NO_EXTRA_SERVICE_TIER');
    const signal = init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(90_000)]) : AbortSignal.timeout(90_000);
    signal.throwIfAborted();
    const record = {
      stage, attemptedAt: new Date().toISOString(), provider: savedModel.provider, modelId: body.model,
      requestSha256: createHash('sha256').update(serialized).digest('hex'),
      outcome: 'dispatch_reserved_may_have_run',
    };
    // O_EXCL is the admission gate, including concurrent processes and uncertain retries.
    const fd = openSync(join(ledgerDirectory, `${stage}.json`), 'wx', 0o600);
    try { writeSync(fd, JSON.stringify(record) + '\n'); fsyncSync(fd); }
    finally { closeSync(fd); }
    const directory = openSync(ledgerDirectory, constants.O_RDONLY | constants.O_DIRECTORY);
    try { fsyncSync(directory); } finally { closeSync(directory); }
    return transport(input, { ...init, signal, redirect: 'error' });
  };
}
