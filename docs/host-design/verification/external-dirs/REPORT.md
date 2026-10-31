# Pi Durable external directories — native hot-adapter milestone

## Verdict

**Local native hot attachment: PASS. Installed activation and terminal parity: NOT DONE.**

This is an adapter for the existing native Durable 1.4.0 registry and Harness,
not another runtime or Pi ExtensionAPI emulation. No active service, private host
configuration, live session database, auth, global settings or installed release
was changed. No real models, paid APIs, personal memory banks, commit or push.

## Implemented

- `apps/dpi-backend/src/native-profile/external-dirs/index.ts`: native session
  document partitioned by conversation; add/remove/list; explicit skill metadata
  and body reads; AGENTS/CLAUDE context; bounded filename search. Current-grant
  callback is called on access and inside mutation transactions. Trusted roots
  remain an independent operator boundary. No automatic external code execution.
- `.../external-dirs/adapter.ts`: resource-free registry adapter, exported by
  `.../native-profile/profile.ts`. Every callback uses its own native invocation
  document capabilities. No retained tool API, captured old Harness or global
  cwd-keyed temporary file is needed for hot attachment.
- `.../external-dirs/NOTICE.md`: pi-add-dir 1.3.1 provenance, upstream MIT license,
  intentional differences and explicit incomplete terminal surface.
- `apps/terminal-adapter/src/skill-input.d.mts`: declaration for the existing JS
  skill expander, necessary for the backend's cross-project TypeScript check.
- Local bootstrap under `experiments/sdk-host-cutover/`: `operational-host.mjs`
  now forwards a server-owned native extension list supplier;
  `operational-profile.mjs` calls it on each reload. `native-extensions.mjs`
  re-reads ONLY nativeExtensions from the original private server config, not
  auth, grants or unrelated settings. It refuses symlinks/non-private files,
  relative/non-string paths, malformed config and oversized files. No live
  configuration was edited.

## Fresh checks (2026-10-31)

All commands executed locally using disposable directories, faux providers and
loopback HTTP endpoints:

```
cd apps/dpi-backend
npm run check
node --import tsx --test tests/native-external-dirs.test.ts tests/native-external-dirs-reload.test.ts
node --import tsx --test tests/profile-reload.test.mjs tests/native-memory-reload.test.mjs tests/native-skills.test.ts
npm run build
node --input-type=module -e 'import {createExternalDirectoryAdapter} from "./dist/dpi-backend/src/native-profile/profile.js"; if(typeof createExternalDirectoryAdapter!=="function") throw Error("missing adapter export"); console.log("built_adapter_export=ok")'
cd ../..
node --test experiments/sdk-host-cutover/native-extensions.test.mjs
node --check experiments/sdk-host-cutover/operational-host.mjs
node --check experiments/sdk-host-cutover/operational-profile.mjs
```

Results: check PASS; 6/6 external-directory tests; 13/13 reload/memory/skill
regressions; build PASS; built module export PASS; 2/2 private-list tests; both
bootstrap syntax checks PASS. Total 21 tests, zero failed. This is not a full
repository test-suite claim. Expected negative-path logs in the reload suite
were test-covered refusals, not failing tests.

### What the hot test actually proves

`tests/native-external-dirs-reload.test.ts` starts a real local native-profile
HTTP server. It creates two disposable sessions, initially without this adapter.
A trusted .mjs adapter importing the actual TypeScript implementation is loaded
through `loadRegistryAdapters`; HTTP/SDK reload attaches it to the SAME Harness.
Actual faux generation dispatches native `add_directory`, which persists the
selection without a manually bound service. The test removes the adapter through
reload, edits external AGENTS.md, reattaches it, then generates another real
native request. That request contains the changed context and skill metadata,
not automatic skill bodies. The selected directory survives; the other session
never gets the added tool; MCP/resource close count remains zero throughout.

The regression suite separately verifies busy reload refusal, unchanged native
model IDs, failed preparation rollback, current human authority, revocation during
preparation, no arbitrary module paths over HTTP, transitive import refresh and
native memory callback scope after explicit registry reload.

### Core negative checks

Outside-root additions, escaped context/skill-directory symlinks, duplicate skill
names at selection, revoked mutations/reads, ignored directories and search input
limits are refused. Persistence across close/reopen and isolation between real
conversations and same-cwd sessions are exercised. Skill bodies are fetched live;
external .pi/extensions files are not executed.

## Boundaries and remaining work

1. Terminal `/add-dir`, `/dirs`, `/remove-dir`, `/suggest-dirs` and interactive
   suggestions are NOT wired. External skill metadata/body operations exist in
   the native service, but they are NOT integrated into the existing terminal
   `$` catalogue/authorized skill-body transport. Do not advertise full upstream
   command compatibility or an installed end-to-end feature.
2. The actual installed bootstrap was inspected read-only using systemctl show
   and the installed profile source. It still runs
   `releases/c0019d7-delm2/operational-service.mjs`, using
   `host-bindings-v16/operational-profile.mjs`, which has no loadRegistryAdapters
   hookup. It cannot inject this new adapter merely because source files changed.
3. Initial installed-bootstrap upgrade/activation is not authorized by this
   milestone and was NOT performed. No forced session stop/restart. Once a
   compatible bootstrap is explicitly activated, changing its trusted adapter
   list and invoking native /reload while idle is the tested hot path.
4. Production adapters must provide a real CURRENT authorization callback. The
   no-op callback generated in the disposable fixture is synthetic, NOT a
   production template or suggested guard relaxation.

## Candidate fingerprints

- external-dirs/index.ts: bdf48986ffa9ee7aaab0ba051e6d1f66dc3bdbaff9bce82c9e4b678c54a344cf
- external-dirs/adapter.ts: 408d012b2712fb3a48d92d8c588651246d93e1834bcc3db8cd46ef9ecea61e72
- external-dirs/NOTICE.md: 1134263215f5a4136cd10cf3670f77552cab76314769cab8d6c97c448cd4d428
- native-external-dirs.test.ts: 130b2c824f958c6977007d7959e47177d89ee866565e295ab906f7fddff01e89
- native-external-dirs-reload.test.ts: 275c8680109eac0ce16bddb0f62ce3405360fafef8f45279c32730e669d68956
- native-profile/profile.ts: 24cc93d0e7f2d41f2e11f9a8082e99c8bdec282bd2c2c028e7d56bb381385154
- skill-input.d.mts: dd0495fe560326a624a883a38968a873ce9c86608601248ca1d7425d1d513f78
- operational-host.mjs: e7d5fa15ea36f97bd376102eb49155d8f9d194558ca71ec573d3d3b32780997c
- operational-profile.mjs: 653a4b3f4ad4ac7d11247c17f0bd768aa3ecfada2e1150d038928b3a5f99dc15
- native-extensions.mjs: dc77313ffd0692a3df6038a3d8304c65b8f6a7e0b74c992fdc1da22b2e579966
- native-extensions.test.mjs: 675a525e77ebfbae0eee3fc94ede7e3393e033eca1ba1a0972a1a19d8aecbb41
