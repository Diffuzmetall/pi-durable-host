# Native guard / CodeMode slice

These are localized existing implementations, not a new security framework.
Upstream MIT notice is retained in `LICENSE`. The private canonical DCG addon has
no separate copyright header; its exact source provenance is recorded below.
No installed source, runtime, auth, MCP configuration or global guard was changed.

## Provenance

DCG source: `donor-source://durable-dcg`.
The installed TUI `dcg/index.ts` is a Jiti startup bridge; its sibling evaluator and
environment are inactive placeholders. The canonical policy is the addon copied
here, which already imports only public SDK APIs and Node builtins.

| Source | SHA-256 before localization |
|---|---|
| `index.ts` | `39c6399bda5530410a04a5cc2136496de5c175047d229c7d11592e258f035492` |
| `environment.ts` | `4b8a6c18b4bfb4075dbc87ec17c7e5c49a5a2ac5b3d545f90921a58204d881a8` |
| `evaluator.ts` | `1facd0917d688bf4687669918d1987f139eb8b2cd6643a6809e9aa497723d901` |
| `diagnostics.ts` | `34172dc61aac40f6fe0ce67b28a1b981a3138f222329ed27be5620dd7a83a5c3` |

MCP source: selected release `20261028-4rmMfRfc`,
`host-lane/host/packages/durable/src/mcp-codemode.ts`, SHA-256
`750bb03ea8002e4f67c73d928fb4ffb79e7a01699141411e16127741d4f4fbe9`.
That unpublished SDK subpath is bundled locally unchanged; its native executor is
the published Durable 1.4 `createCodemodeExtension`, not a substitute runner.

Localization changes: relative DCG `.ts` imports become `.js`; the wrapper delegates
SDK 1.4's new required filesystem `watch` capability to its existing Node env.
No DCG policy decision, command quoting, cancellation or cleanup rule was changed.
The owning profile additionally supplies `shellEnv`; the default local Node subclass
is `SessionExecutionEnv` from `../../../session-env.js`. SDK 1.4 otherwise overlays
all of `process.env`, so this boundary passes only admitted base/session variables
and explicit per-command env with `inheritEnv: false`. It does not mutate globals,
change command argv, bypass evaluation, or alter the native executor.
The actual canonical evaluator expects DCG **0.15.3**, schema 1; its old README says
0.10.0 and is stale. Existing validated operator warn/log semantics are preserved;
this port adds no bypass, allow-once, decision cache, retry or unguarded fallback.

## Callable profile seams

- `dcg/index.js`: `createDcgEnvironmentFactory({ defaultCwd, evaluatorOptions, shellEnv })`
  gives synchronous `env(target, context)` and idempotent `cleanup(context)`.
  Bind this trusted factory as the session's final Harness `env` provider before
  scheduling. Missing/error/invalid DCG results deny exec while filesystem methods
  remain usable. It is not an ordinary Pi extension or registry reload adapter.
- `mcp-codemode.js`: `createMcpCodemodeExtension(options)` or
  `createMultiMcpCodemodeExtension(sources)`. Each host-owned connected MCP client
  supplies exact allowed tools and an `authorize` callback. This callback runs on
  **every nested call**, before MCP I/O. Calls are `replay: unsafe`; model operations
  are disabled. Connections/config/auth/lifecycle remain owned by profile composition.
- Direct dependencies: public Durable/Chord/pi-ai 1.4, pi-codemode 1.4 and pi-mcp
  1.0.2, plus Node builtins. No installed-runtime imports, Jiti, global settings,
  personal identities, provider credentials or external services are required.

DCG is command-text policy, not a sandbox. Denial reasons are bounded inert untrusted
prose, not a semantic secret detector. A host must not expose trusted startup options
or replace its execution environment from untrusted requests.

## Fresh checks

From `apps/dpi-backend`:

```sh
node --import tsx --test tests/native-guards.test.ts
```

Machine-local verification artifacts are not distributed. See the public status and reproducible package tests.

This completes a usable ISC-12/13 implementation slice, **not full profile acceptance**.
Parent assembly now binds these seams and verifies explicit session env without
host credentials or foreign identity/log variables. Its combined source checks are
in `tests/native-profile-composition.test.ts`; installed-candidate and independent
milestone acceptance remain separate from this component result.
