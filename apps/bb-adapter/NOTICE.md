# BB SDK client provenance

This package adapts the **selected projection path** of the MIT-labelled `Diffuzmetall/bb-plugin-provider-pi-durable` baseline, not its legacy provider runtime. Copyright (c) 2026 Diffuzmetall. The complete selected MIT grant is retained in `LICENSE`.

Read-only donor: `/home/ubuntu/Projects/master/experiments/pi-durable-1.4-upgrade/provider-lane`. Exact source hashes are in `SOURCE.json`.

## What is retained

- Actual BB JSON-RPC framing, reverse request lifecycle, method names and identity lifecycle from `src/projection/host/bridge.ts`. The native-only request handlers are adapted to the public SDK, not a copied runner/registry.
- `src/projection/host/session.ts` current Root/child Core scope checks, selected-native readiness, read-only attachment, native child registration request namespace, explicit reconnect and observation ownership semantics.
- Actual message and tool presentations and file/diff algorithms from `src/provider/host/{message-delta-translator,tool-delta-translator,diff-utils}.ts`. Imports are localized; the message-end content type becomes readonly. Their function algorithms are otherwise retained. `root-deltas.ts` is the new public native-wire glue, including reconnect/checkpoint handling and redacted-thinking exclusion; it is not a child outcome resolver.
- The strict four-field `ownerScopeFrom` response boundary from `bootstrap/provider-grant.ts`. Its private socket/grant-file provisioner is **not** copied. The server issues the actual BB credential and owns its native scope.
- The genuine Core CREQ syntax from `provider/host/bridge-router.ts`, rather than conflating those IDs with registration keys.
- Existing localized native-child routing and original immutable history CAS sink/projector. See the two component notices for their original checks and the corrected canonical receipt-membership presentation boundary.

The SDK/native backend remains responsible for actual current policy references, owner/execution checks, transactional admission, canonical receipts, pending stops, coherent result selection, credential privacy and native recovery. Document IDs are locators only; native exact target inspection must succeed before Core registration. No caller-supplied worker/source/grant/module/tools field becomes authority.

## Intentional boundaries

There is no RunnerProcess, SharedHostClient, legacy provider session, local Harness/SQLite, backend import or private extension loader in client runtime source. No new execution queue or native command ledger is introduced. The new Root/child view maps and pending reverse RPCs only track observation/delivery. Model selection uses the actual native model catalogue and exact native reasoning levels, without inferred replacements.

The selected BB compatibility archive, BB application, global native composition, auth files, live session data and personal banks are not included. No BB runtime dependency closure is copied. Tests read the original Core history schema and pure admission predicate as read-only evidence; those fixtures are not shipped. The package is private and local packaging is not authorization to publish, deploy or activate it.

`dpi-sdk` is a peer, not a bundled server. Its MIT license and Disler/upstream notices remain in that package. The existing terminal artifact and SDK version can remain independently installed; no terminal files are changed by this adapter.

Full BB milestone acceptance requires the exact installed client/backend/SDK tuple and an independent peer's checks. Source edits, component compilation and faux results are not evidence of live BB, real model or production compatibility. Real historical aliases/data and activation remain outside this deliverable.
