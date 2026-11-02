# Staged MCP in the common native profile and Store

Task `6e669bcd68b8465ab4e72605745cc311`; Carol owns the shared profile/Store integration. Inputs: source parent DONE460, resource lifecycle DONE457, memory wiring DONE471. This is source integration evidence, not whole-S5 or installed acceptance.

## Existing ownership and publication

The common profile calls the existing session MCP owner's `prepareReload()`. It installs that ticket's sources through the existing native MCP/CodeMode bridge, retaining `requireOwner`, source authorization, the existing manager, task IDs and Harness. Only a session owner that supports preparation enables the `mcp-codemode` trusted replacement. Arbitrary explicit MCP replacements are refused.

Native compatibility and MCP ticket validation occur before the synchronous commit publication. Unpublished candidates are discarded on preparation or native rejection. If discard also fails, both errors remain in an AggregateError. After publication, retirement runs outside the native commit while the reload fence remains held. Store initial-open now also validates/publishes/drains or discards the preparation before resource closure.

A failed retirement is an **applied** result, not rollback. Store returns HTTP 200 and optional `cleanup: 'failed'`; it does not serialize the private error. The existing manager prevents a further generation after failed retirement. The SDK/TUI warning is tracked separately by task `24e3680f1e4e40a4bc8e24e7d04fb769`.

The profile also publishes the prepared shell environment into the existing session-local object. SessionExecutionEnv retains that owned object, but captures a copy for each invocation. The existing DCG guard captures it before asynchronous evaluation. Already-admitted work keeps its environment; subsequent commands on the same cached guard see changed or removed MCP variables. Memory log paths retain their protected precedence. No global process environment, second guard, or second manager is introduced.

## Fresh physical-sandbox checks

Sandbox `/tmp/hot-update-sandbox-4zu6fdqo`: negative isolation self-check PASS; process exit 0; **25 PASS / 0 FAIL**. Exact argv and full output: `command.json`, `run.log`; self-check: `work/sandbox-check.json` in that sandbox. Strict backend typecheck (`apps/dpi-backend/node_modules/.bin/tsc -p /tmp/carol-hot-update-backend-tsconfig.json`, source-package paths) and scoped `git diff --check` PASS.

Suites:

- `hot-update-mcp-profile.test.mjs`: six cases using the repaired actual manager, real native Harness/SQLite/Store, HTTP/SDK, local synthetic MCP endpoint and faux model. No external model or paid API is used.
- Existing `hot-update-core.test.mjs`, `hot-update-memory-profile.test.mjs`, `hot-update-trusted.test.mjs`, `hot-update-resource-lifecycle.test.mjs`, and `native-guards.test.ts`.

The MCP cases verify twenty catalogue/config replacements through one actual session owner, old accepted HTTP tool-call completion, subsequent v2 dispatch, retained native task/root/guard identities, discard after incompatible native schema, sanitized applied cleanup failure with bounded generations, initial-open discard/owner closure, shell environment publication/removal, and environment capture while DCG evaluation is pending. Synthetic DCG fixture responses are not evidence for the installed DCG binary.

Witnesses:

```json
{"owners":1,"opens":21,"calls":2,"replacements":20}
{"replacements":21,"aSubscriptions":1,"bSubscriptions":1,"bAliveAfterAClose":true}
```

Tests resolve `@local/pi-durable-reload` to the source package. The session wrapper's `./compiled/nico.mjs` import is redirected **only inside the sandbox resolver** to the repaired `mcp-source/build-observer/nico.mjs`. Direct manager tests import that same repaired bundle. The old `mcp-source/build/` is not an accepted input.

Initial checkpoint `/tmp/hot-update-sandbox-dseuh5wp`: 8 PASS before shell-environment integration. The 25-case sandbox above supersedes that checkpoint for final source hashes.

## Exact SHA256 of the tested source

- `apps/dpi-backend/src/native-profile/profile.ts`: `8e8025115db43278fdc6f6676c15ed97c7cc0e0c1fda78152352898a3c9329b9`
- `apps/dpi-backend/src/runtime-profile.ts`: `7dea01e7bf3ccb2eeb929aa2f3f5b858369d9a2f0298a243d14798de99b49e94`
- `apps/dpi-backend/src/store.ts`: `8c4be0e0fcf6eb3190e489cb454f153c19c97abfe26950483b6e6e476f6fa2a8`
- `apps/dpi-backend/src/session-env.ts`: `91ceb42d79ea4ae171928ac32852295102b75108edb6ebec0eddc30dc013e164`
- `apps/dpi-backend/src/native-profile/guards/dcg/environment.ts`: `04494aa2eeba53f1896b0dc6f9752ec888812285c3bf5eaca2530faf7710590f`
- `apps/dpi-backend/tests/hot-update-mcp-profile.test.mjs`: `bdb9b4bbd6dd9e10533320e6defd0ce795c4f10ccc4b99ea363cc5ab499c481c`
- `experiments/hot-update-20261101/mcp-source/build-observer/nico.mjs`: `4ac012202ca81685dd1e21fb1a7aa665cfe30a2b42cc08c37214118a89caca52`

## Remaining gates and limits

Correction after source reconciliation: `attachDelm` in `experiments/sdk-host-cutover/delm-profile.mjs:83–85` already spreads the prepared candidate, so it already forwards discard/drain. The previous version of this report and FACT `dc93dafb28f147dba06b5d7c69a6a406` incorrectly described those callbacks as missing; CORRECTION `1fbf558a6f43456082ca82d0205e3d6a` supersedes that claim. No wrapper source edit is needed without a demonstrated defect. Frank's follow-up `a1c7c4c153b547e88bc5dd081a8f467a` now verifies the existing wrapper with the new core lifecycle, including apply rejection/discard, both errors on failed discard, retirement and retained DeLM IDs, before full operational acceptance. Grace source gate `a5aa5d6dc2994316bb0e698edf210d64` must review the changed startup/guard boundaries. Heidi must check the exact packaged installed candidate; source aliases are not installed acceptance.

No production configuration, credentials, installed runtime, live Host or live DeLM was modified or exercised. No reload, restart, release switch or production database operation was performed. Previous-full-release compatibility remains UNKNOWN, switch remains prohibited, and the existing auth incident remains open. Production activation **NOT RUN**.
