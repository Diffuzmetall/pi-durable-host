# Shared resource modules in the existing fresh evaluator

Task: `096fddafcb6a4aa39b8f7df01fab8908`; owner Carol.

## Callable output

`loadFreshModule<T>(path: string, sharedModules?: Readonly<Record<string, unknown>>): T`

The existing Jiti evaluator accepts namespaces keyed by existing absolute file paths. It canonicalizes keys with `realpathSync`; relative keys fail before evaluation. Jiti checks virtual IDs before resolving imports, so its existing per-file Babel transform canonicalizes only import/require references that resolve to shared physical files. Unrelated behavior remains freshly evaluated, with module/fs caches disabled. Fixed Durable/tools/pi-ai namespaces take priority by package name and by canonical physical entry point, including symlink aliases.

Bob can pass the existing `logging-scope.mjs` namespace (and pinned memory SDK namespace) from the controller. This preserves the existing AsyncLocalStorage owner without creating a global owner or a second loader. Only trusted process-local code supplies paths/namespaces; this is not an HTTP input.

## Evidence

- `npm --prefix packages/durable-reload run build`: PASS.
- `apps/dpi-backend/node_modules/.bin/tsc -p /tmp/carol-hot-update-backend-tsconfig.json`: PASS.
- Final physical sandbox `/tmp/hot-update-sandbox-0aq8k0j1/run.log`: negative isolation self-check PASS; shared-modules, trusted-replacements and actual native-memory suites **10 PASS, 0 FAIL**.
- Regression uses the actual memory logging module, two concurrent ambient scopes, a fresh relative transitive dependency changed from version 1 to 2, and a symlink key. Out-of-scope calls still reject with `SESSION_MEMORY_LOG_SCOPE_REQUIRED`.
- Bob's unchanged actual Harness/SQLite probe now passes: twenty prepared replacements, default/explicit/fresh-target reload, forks, two sessions, retained bank/log/controller/subscription identities, pending delivery across reload, and subscription cleanup. Test SHA256: `e93d5019ebce83749719aeca420907195ac38df112233ecc05eec3f5c5c0a473`.
- Initial absolute-only unit tests passed in `/tmp/hot-update-sandbox-peqags9e`, but the actual memory probe still failed at `PREPARED_A` in `/tmp/hot-update-sandbox-dqdy758p`. Strengthening the unit fixture to use a relative import reproduced `SESSION_MEMORY_LOG_SCOPE_REQUIRED` in `/tmp/hot-update-sandbox-5l3urwgw`. These failures motivated the per-file normalization fix; the initial output/FACT did not establish native memory readiness.
- Fixed SDK namespace override attempts by package name and physical symlink retain exact `AgentDoc` identity. Relative shared keys reject before evaluation.
- `git diff --check` for changed paths: PASS.

Source SHA256:

- `packages/durable-reload/src/loader.ts`: `a124ef50eca9d1eab6f8e307faaa49a90abde375b00999529a90a6836cae03f3`.
- `apps/dpi-backend/tests/hot-update-shared-modules.test.mjs`: `987fb3a44b8888ab73d271b1f1c31f0c16ecb1b3348ffa873cc016c952092d56`.

## Consumer boundary

This is a standalone loader output, not memory integration acceptance. Bob's MCP/memory output currently depends on this task: the loader must complete before that consumer can complete. Profile wiring therefore belongs to a subsequent gated output after Bob's factory and isolated memory regression are ready. No profile or Bob-owned source was changed here. Explicit replacements must retain precedence, and `hindsight.delivery` remains protected.

Installed backend `@local/pi-durable-reload` remains a separate packaging/immutable acceptance concern; these tests explicitly alias the source package. Production activation NOT RUN. Existing auth and previous-release compatibility FAILs remain unresolved.
