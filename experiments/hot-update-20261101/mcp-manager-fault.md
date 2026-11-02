# MCP S5: source regression GREEN; shared integration pending

Current source contract: `mcp-source/README.md`.
Current artifact: **`mcp-source/build-observer/nico.mjs`**, SHA256
`4ac012202ca81685dd1e21fb1a7aa665cfe30a2b42cc08c37214118a89caca52`.
Do not package the retained defective baseline `mcp-source/build/`.

Dave's repair DONE434 includes RED reproduction in sandbox `2oh5f_fw` and
GREEN in `/tmp/hot-update-sandbox-r_sfrnks`: isolation PASS, strict typecheck
PASS, **18 tests PASS / 0 FAIL**, combined exit **0**. Grace independently
resolved the synchronous observer finding in publication
`5fb3cb5858474ceb97ee88b710260881`, sequence 445. Eve verified the source,
supplied logs, eight repair hashes and bundle/provenance correspondence.
This follow-up does not repeat Dave's runtime tests or accept installed Host.
Exact commands, hashes, injection witness and async-subscriber limitation:
`mcp-source/OBSERVER-REPAIR.md`.

The earlier sandbox `/tmp/hot-update-sandbox-823mg6ri` had 12 passing tests
but did not cover throwing observers; it is historical baseline evidence.
Source overlays were built through `build-nico.mjs`; the accepted tree and
old compiled bundle were not modified. Full provenance, unified patches
and integration interface remain in `mcp-source/`.

Cleanup failure now fences another generation. Twenty healthy replacements,
real HTTP/SSE closure, held old calls, pending factories, failed preparation,
Mail scope/revoke and config-race rejection are covered. Shared native/profile
integration, final packaging and independent installed QA remain outstanding.
Production activation **NOT RUN**.

## Historical RED checkpoint — retained evidence, superseded by GREEN above

Owner: Eve; task `3101d74151814d14871189b969a5a78a`, generation 1.
Production activation **NOT RUN**. Pinned manager and session composition unchanged.

## Existing path and demonstrated gap

`experiments/sdk-host-cutover/session-mcp.mjs` uses the existing Nico MCP manager in
`experiments/sdk-host-cutover/compiled/nico.mjs`. The manager owns slots, transports,
catalogue and calls. Creating a second manager or replacing its private slots is not
an acceptable solution.

Current source boundaries:

- `createManagedMcpAdapter.shutdown` around line 227733 uses `Promise.allSettled`
  and a deadline, then clears connections without reporting unsuccessful close.
- `McpManager.retire` around line 229391 suppresses close failures and removes the
  adapter from draining in `finally`.
- `McpManager.reload` around line 229403 publishes slots and retires previous
  adapters immediately; no unpublished native-validation boundary is provided.
- `McpManager.close` around line 229517 suppresses adapter failures as well.

A staged dependency patch must address the adapter as well as the manager:
changing only manager error handling cannot recover a failure already swallowed
by adapter shutdown. No local bundle/dependency patch has been authorized by the
source owners in this checkpoint. Scope question is publication
`61722ee27db54dcdb1ed87ad8fa659c2`.

## Reproduction

```sh
python3 experiments/hot-update-20261101/sandbox/run.py --repo "$PWD" -- \
  sh -c 'node --test /repo/experiments/hot-update-20261101/mcp-manager-fault.test.mjs'
```

Evidence: `/tmp/hot-update-sandbox-c8xhnaba/{command.json,run.log}`.
Negative physical sandbox self-check **PASS**. Command exit **1**;
three tests, **1 PASS / 2 FAIL**. These are intentional RED regression assertions,
not passing acceptance tests or a repaired implementation.

1. Unpublished `prepareReload` API assertion **FAIL**: method is undefined.
   This checks the proposed public seam specifically, not every possible reuse API.
2. Twenty healthy manager replacements **PASS**: 21 transports opened, 20 closed,
   one remained active; final manager close left zero active and 21 closed.
3. Injected transport close rejection **FAIL**: twenty replacements still resolve;
   21 transports opened, zero successfully closed, twenty cleanup failures,
   21 logical live resources; no error surfaced from replacement.

The fixture implements the MCP transport protocol and runs the actual pinned
manager/adapter. Its resource counter represents instrumented fixture transports,
**not real sockets, processes, production leaks or a complete OS census**. It does
not use models, credentials, Mail registration or real external MCP servers.

## Hashes at execution

- `experiments/hot-update-20261101/mcp-manager-fault.test.mjs`:
  `afb84c1fd4c015cb80f3b9f6b1df996fd3a964c13f93ae69ba4c958afba2e3b6`
- `experiments/sdk-host-cutover/compiled/nico.mjs`:
  `2b7a49479a5a2909cfa321e685ab275b0606244fb0fdbc854f05aa278db089bd`

## Remaining contract

Need source-scope transfer for session MCP composition and an agreed minimal patch
of the existing pinned manager/adapter, with reproducible provenance. Carol owns
shared native/profile integration. Staging must preserve the active generation on
native rejection; retirement must preserve admitted-call outcomes and fence further
resource replacement after failed cleanup. Candidate and old calls must remain
subject to existing policy and Mail identity checks.

Still **NOT TESTED**: corrected transactional reload, changed MCP config/schema,
Mail continuity across reload, in-flight retirement, cleanup-failure fencing after
repair, complete memory/MCP resource census and independently installed acceptance.
Parent S5 and existing MCP FAIL remain open. This checkpoint does not authorize
production reload, installed artifact edits, upstream/global changes or deployment.
