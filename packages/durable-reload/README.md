# Durable reload integration

Transport-independent companion to Pi Durable 1.4.0, integrated with the native profile, Host, SDK and terminal adapter. HTTP `runtime/refresh` and `reload` are aliases for the same operation; no second Host loader or runtime is created. Activation/evidence is tracked in `INTEGRATION.md` in the source checkout.

## API

- `createNativeModels(options | asyncOptionsFactory)` provides a stable pi-ai Models facade, catalogue, exact saved-model validation and staged replacement. The factory re-reads trusted local provider/account/cache configuration. Discovery never refreshes OAuth or fetches a model catalogue over the network.
- `ReloadableRegistry(base)` retains one registry reader for an existing Harness. `prepare(adapters, additions?)` validates a candidate before synchronous publication. Server-owned late-bound native services may join the protected base; adapters cannot replace existing base extensions/tasks and duplicate tools are rejected.
- `loadRegistryAdapters(paths, cwd)` re-evaluates server-configured native registry adapters, including nested `.mjs` imports. Modules must have no top-level await or external resources; factories may be asynchronous. This is a Durable registry-adapter contract, **not arbitrary Pi ExtensionAPI compatibility**.
- `reloadDurable({harness, context, models, prepareExtensions, assertCurrent})` fences concurrent reloads, scans every persisted native task, validates every conversation's exact saved model, prepares both candidates, rechecks authorization/idleness and publishes synchronously. It never opens/closes/replaces Harness/storage, changes saved models or persists credentials.

Preparation callbacks are trusted, resource-free server code, not security sandboxes. An optional `apply` phase may select an already-prepared late-bound native service (DeLM) on the same Harness; it runs only after model/adapter preparation succeeds. Publishers must be synchronous and nonthrowing. Host mutation admission uses the same per-Harness fence. Active generations, suspended native work and future persisted schedules prevent reload; nothing is aborted automatically.

## Packaging and verification

Native Durable/pi-ai/Chord are exact `1.4.0` peers: registry definitions must share the consumer's SDK instance. The backend bundles this local companion and its Jiti loader, not another native SDK. Source backend installs use `.npmrc` `install-links=true`; after editing an already-installed local package, reinstall that generated package so its bytes are refreshed before building.

With a temporary HOME, `node --test packages/durable-reload/direct.test.mjs packages/durable-reload/reload-safety.test.mjs` exercises actual SQLite/Harness dispatch, model/ID preservation, concurrency/revocation, preparation rollback, nested imports and protected late-bound native additions. Host tests cover both HTTP aliases, active/background tasks including pagination, policy fencing, other sessions and terminal catalogues. Operational fixtures cover Antigravity's frozen protocol without external calls, Nico replay/reopen, memory/guards and DeLM same-Harness late attach plus native work wait/wake.

All verification uses isolated HOME/data directories, faux providers and local endpoints, never live models or operational session data. Prior candidate results are not evidence for new installed bytes.

The loader derives from the local `.pi/extensions/durable-reload/index.ts`; the MIT license is retained. Existing native model registration/metadata logic is shared rather than reimplemented by a second provider runtime.
