# Native staged resource lifecycle

Owner Carol; task `bbd5f179bbb54fa6aff00ac83a9febd7`.

## Implemented callable

Existing `DurableReloadPreparation` now accepts optional `discard(): Promise<void>` and `drain(): Promise<void>`; old resource-free preparers remain compatible.

`reloadDurable` retains the staged extension candidate across model, state, owner and synchronous validation. A rejection before publication awaits discard. If discard fails, `AggregateError.errors` retains both the original rejection and cleanup error. Preparation must clean up any resources it creates before throwing without returning its ticket.

Publication remains synchronous on the existing native commit line. Afterwards drain runs outside the commit, retaining accepted old calls and the reload fence until retirement settles. A rejected drain returns `{ models, cleanupError }`: publication **applied**, not rollback. Consumers must map this internal error to a fixed public diagnostic, never serialize raw provider/transport errors or use Store's old "previous runtime remains active" rejection message.

## Fresh verification

- Package build: `npm --prefix packages/durable-reload run build` PASS.
- Backend strict typecheck: `apps/dpi-backend/node_modules/.bin/tsc -p /tmp/carol-hot-update-backend-tsconfig.json` PASS.
- Physical sandbox `/tmp/hot-update-sandbox-1zyre1ud/run.log`: negative self-check PASS; six new native lifecycle tests plus seven existing trusted replacement tests, **13 PASS / 0 FAIL**.
- Real Harness/SQLite checks cover state/synchronous/authority rejection with exactly one discard; accepted old task and result retained during publication; nested native commit from drain proves it runs outside the mutation line; concurrent reload refuses during drain; retirement failure remains applied; both rejection/discard errors survive failed cleanup.
- Scoped `git diff --check` PASS.

SHA256:

- `packages/durable-reload/src/index.ts`: `1f42e1402630ef3c5b3ddf485740754273a59a0cffc289addaff8d12492af3cd`.
- `apps/dpi-backend/tests/hot-update-resource-lifecycle.test.mjs`: `c1cd2b93385e0d40258222362edad038be9277389001c04e1cbac6289bbb3931`.

## Remaining integration and input blocker

This is the missing library lifecycle output, not duplicate memory/profile wiring. No Store/profile/native bridge, SDK/TUI, MCP source or accepted artifact was changed. Store initial-open, profile forwarding, trusted MCP catalogue compatibility, and sanitized HTTP cleanup outcome must still be integrated after its own authorized task is ready.

During verification Grace published FAIL `b4d6a08923a3499e9c0dc1c7ac37d6dc`: a throwing MCP onChange observer violated the required nonthrowing publication contract in the baseline bundle. Dave repaired the owning boundary in DONE434, Grace independently resolved that exact finding in RESOLUTION `5fb3cb5858474ceb97ee88b710260881` and DONE450, and Eve completed follow-up `c86f7fc30e834857bb567ac93d80ca22` in DONE452. Carol read the complete repair/interface reports, checked final manager source and verified manager, bundle, provenance and report hashes. This reconciles the input blocker, not installed integration.

Consumers must use `mcp-source/build-observer/nico.mjs` SHA256 `4ac012202ca81685dd1e21fb1a7aa665cfe30a2b42cc08c37214118a89caca52`, with provenance SHA256 `e4f780e57e6f4a62d7860a26f21be89a7cab1a3336f3d4e137c6dcfc2255e10d`. Baseline `build/` remains defective. The library checks remain applicable because the staged interface is unchanged; no duplicate runtime run was needed. Source output complete; shared Store/profile integration remains separate.

Installed package and complete native MCP/HTTP acceptance remain NOT TESTED. Source alias is not installed acceptance. Existing release/auth blockers remain. Production activation NOT RUN.
