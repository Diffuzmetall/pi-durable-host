# S1-C: existing reload seam

Owner: Carol. Scope: contract-ready output, not integrated R4 acceptance.

## Reuse chain

Old Durable adapter loader/runtime reload → `packages/durable-reload` fresh Jiti loader and `reloadDurable` → Store → existing HTTP/SDK command. Native Durable 1.4.0 owns phase snapshots. The current broad idle barrier and frozen facade reader are S1 defects; no replacement transport, scheduler or generic revision manager is required.

## Consumers

- SDK: `client.session(sessionId).reload()`.
- Wire: `POST /v1/sessions/:s/reload`, body `{}`, capability `profile-reload.v1`.
- Success: `{sessionId: string, models: number, extensions: number}`. Counts are inventory, not revision IDs.
- Existing compatibility route: `POST /v1/sessions/:s/runtime/refresh`. This is the same operation, not another loader.
- Authorization: current session target, human authority, both write and control. The server rechecks authorization during preparation and before publication.
- Sources: server-owned profile configuration only. Requests with paths/settings/options are rejected with 400. Existing `createOperationalProfile({nativeExtensions})` accepts paths or an async callback; it rereads that callback on reload. Packaging can select a sealed artifact through this callback without a raw-path HTTP endpoint.
- Scope: only the selected open session. Do not open sleeping/failed siblings or fan out.
- Current failures: HTTP 409 for concurrent/busy, 503 for failed preparation/unsupported, 401/403 for missing/revoked/insufficient authorization. Existing error envelope/code/message carry the reason; no new status protocol is needed.
- Runtime API: `reloadDurable({harness, context, models, prepareExtensions, assertCurrent})`. Preparation returns optional async `apply()` and synchronous nonthrowing `publish()`; native selection is not a transaction with in-memory publication.
- Shared writers: Carol owns core/profile/Store/routes. Dave owns models; Bob owns discovery/memory/MCP/voice; Frank owns DeLM/automation; Eve owns SDK/TUI. Integration owners supply narrowly scoped changes to Carol for shared files.

## Safety

No Harness/storage reopen, implicit login, model turn, network/download, production activation, or native task replay is part of reload. SDK/TUI must not retry a lost response as an external action. Incompatible changes must be rejected with a concrete maintenance reason, not reported as applied.

S1 will separate compatible definition publication from unrelated provider/resource barriers within the existing operation. S3 supplies schema/task/recovery compatibility checks. This contract does not claim these slices already pass.

## Verification

Static inspection: existing `auth.ts`, `routes.ts`, `store.ts`, SDK `client.ts`, native profile preparation, and `packages/durable-reload/src/index.ts` agree with the interface above.

Runtime contract probe PASS: `python3 experiments/hot-update-20261101/sandbox/run.py --repo "$PWD" -- sh -c 'cd /repo/apps/dpi-backend && node --import tsx --test tests/profile-reload.test.mjs'`, exit 0, 8/8 tests. Sandbox negative parent/child self-check passed before the command. Evidence: `/tmp/hot-update-sandbox-t81pk_cg/{run.log,command.json,work/sandbox-check.json}`.

Probes cover real Store/Harness/SQLite/HTTP/SDK, session-local publication, server-only sources, authority, failure preservation, concurrent reload/revoke, nested imports and current TUI transport. Providers are faux and credentials synthetic/in-memory. The current busy rejection is a reproduced S1 gap, not R4 busy acceptance. Source baseline: index `e962820f0e6abd20da3a0d432857ef1087e7964ab459360a98dd3bcf0af028d1`, registry `9fbf88e22afaba99c19f1954ff92c8266d5af0ed18983e309e0a83b7ec9e32f4`, profile `5cbb2b7dfb8166fcb5cef2652b6599b57b51326e519e9a059897ea0b6333de9d`, probe `46f5354c680f8815373654ff2e17e9a18891be539a1e0d073e86273b37998840`.

S1-C contract verified. Integrated R4 product acceptance: NOT RUN. Production activation: NOT RUN.
