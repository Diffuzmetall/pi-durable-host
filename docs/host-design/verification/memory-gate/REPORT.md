# Independent native memory gate — original candidate

What this change does: the local factories put Hindsight context, durable retention, logs and Agent Mail into one existing native Harness per session. The intended change removes the installed adapter's process-global log paths without replacing native authority or scheduling.

**Verdict: not accepted. Fix finding 1, build a successor candidate, then rerun the independent probe.**

## Candidate and independence

- Backend: `/tmp/dpi-packed-dUBp45/artifacts/dpi-backend-0.1.0.tgz`, SHA-256 `379cf10a81e9ec340b7401c62046e3cd7284586d06fc951e7593700c9e839d84`.
- SDK: same directory, `dpi-sdk-0.1.0.tgz`, SHA-256 `d98831740905de74cffc64243d1b2c54cd83e8e76a34c927fa2b5f139e1cdd43`.
- Both hashes were checked in this review. Tests import the already installed immutable package's `dist/dpi-backend/src/` implementation and its installed dependencies, not a rebuilt working tree.
- Reviewer Dave did not author Alice's memory implementation. Dave previously authored parts of Store/root profile composition and grants; independent source acceptance of those parts is excluded here and belongs to the separate native-profile gate. Their actual composed runtime behavior is exercised here, not self-certified as independent source review.
- Expected load: multiple concurrent local sessions in one process, with explicit trusted callbacks, separate accounts, independent close and supported registry reload. No live bank, Mail service, model, credentials or production database is used.

## Must fix

### 1. Explicit registry reload removes the memory session boundary

`apps/dpi-backend/src/native-profile/memory/session-memory.mjs:22-58`; `hindsight/index.mjs:161-172`; `hindsight/extension.mjs:34-38`.

**What this is:** `createSessionMemory` decorates tools, sections, hooks and task callbacks so each callback restores its session's AsyncLocalStorage paths. The raw native controller supports `reload(targetRegistry)`.

**Problem:** the wrapper forwards an explicit target unchanged. The native reload then calls `target.install(freshExtension)` directly, bypassing `scopedRegistry.install` and its decoration. A normal native wrapper that invokes the memory section from a neutral caller scope works before reload, but the reloaded section cannot pass `sessionLogPaths()` and stops retrieving context for a fresh native conversation/input.

**Fix:** keep the decorator at the owning wrapper boundary for every supported reload target, including explicit targets. Preserve real registry method receivers and native delivery-task closures, kinds and versions. Do not hide the defect by skipping reload or adding process globals.

**If skipped:** configured memory can stop supplying context after an advertised reload. The successful default/inherited-context path masks the missing boundary. No actual A-to-B disclosure was demonstrated; this is a scoped-callback and availability regression, not an invented credential breach.

### Correlated evidence

- Installed-package baseline: `node --test /tmp/dpi-memory-gate.UtQGmD/baseline.test.mjs` — **2/2 PASS**, `/tmp/dave-memory-gate-baseline.log`.
- Ordinary explicit reload with inherited scope also passes. This is insufficient boundary evidence; it explains why the regression escaped the baseline.
- Adversarial actual native section caller: a test-only public `defineExtension({wraps:[{section:'hindsight_memory', ...}]})` calls the section through `withSessionLogs(undefined, ...)`. The original decorated callback restores its own scope. After `controller.reload(actualRegistry)`, a fresh native fork/input no longer reaches the matching loopback recall query.
- Exact RED: `node --test /tmp/dpi-memory-gate.UtQGmD/reload-neutral-fork.test.mjs` — **exit 1**, `/tmp/dave-memory-gate-reload-fork.log`.
- Counterfactual: identical public wrapper, fork and input, removing only the explicit reload — **2/2 PASS**, `/tmp/dave-memory-gate-no-reload-fork.log`.
- A separate actual tool-wrapper probe records one unscoped resolver call after reload, compared with zero before: `/tmp/dave-memory-gate-reload-neutral.log`. This supports the cause; the section/fork probe above demonstrates the actual retrieval effect.
- An intermediate second-input recall assertion was unsuitable because native recall is cached per conversation. It was discarded in favor of a fresh native fork and the matching no-reload control; no product code was changed to force a result.

Reproduction sources are retained beside this report. They deliberately reference this exact disposable installed candidate; replace the candidate prefix in a derived temporary copy to test a named successor. They are review fixtures, not product runtime dependencies. To reproduce without changing either installed package:

```sh
review=$(mktemp -d /tmp/dpi-memory-recheck.XXXXXX)
cp docs/host-design/verification/memory-gate/*.test.mjs "$review/"
ln -s /tmp/dpi-packed-dUBp45/install/node_modules "$review/node_modules"
node --test "$review/baseline.test.mjs" "$review/no-reload-neutral-fork.test.mjs"
node --test "$review/reload-neutral-fork.test.mjs" # expected RED for this original archive
```

## Other fresh evidence

### Source and provenance

All **21 local** SOURCE records and **7 original** records match their recorded hashes; installed retained files match too. The selected source remains read-only. The vendor diff has 47 context lines: one AsyncLocalStorage import, three log-path getters, scoped log level and explicit existing client/config exports. Native controller reconciliation adds only scope entry. Native extension adds the owned scope check. Delivery's only algorithm delta recognizes actual accepted input receipts rather than treating an arbitrary user-shaped model message as admission.

Native document kinds/versions, delivery task/outbox operation identity and lifecycle intent-before-effect algorithms remain unchanged in those diffs. Original Vectorize AI and Mario Zechner MIT notices and vendor provenance are retained. This is one integration closure, not a copied Durable runtime.

No assignment to `process.env`, `globalThis.fetch`, or explicit global dispatcher setter exists in the memory closure. The pinned client reads/derives an existing dispatcher; it does not replace it. Baseline runtime confirms the five session-related environment keys remain unchanged. Optional startup/update/seed/survey effects are disabled in these tests; arbitrary optional live effects are not accepted by this review.

### Composed native runtime

`node --import /tmp/dpi-packed-dUBp45/install/node_modules/tsx/dist/loader.mjs --test --test-name-pattern='combined native Store/HTTP profile' /tmp/dpi-memory-gate.UtQGmD/composed.test.ts` — **1/1 PASS**, `/tmp/dave-memory-gate-composed-002.log`.

This uses the completed installed backend/SDK and actual native Store/Harness/SQLite/HTTP/faux flow. Separate session banks appear in their own contexts; retained memory reaches the recording endpoint; two Mail clients use session identity/current grant; a revoked nested call has no second effect. Native reopen retains committed policy/schedule/submission identity. A temporary fixture initially lacked ESM package metadata and failed before executing; adding `type:module` to its private temporary directory fixed fixture loading, not the product.

## ISA mapping and remaining work

| Criterion | Observed result on original candidate | Limit |
|---|---|---|
| ISC-14.1 | PASS for concurrent baseline and installed composed A/B context separation | Explicit-target reload regression prevents accepting the complete local factory contract |
| ISC-14.2 | PASS for distinct log/diagnostic/usage files and no foreign prompt/bank markers | No wrong-path write was observed; reload can instead lose the required scope and fail closed |
| ISC-43 | PASS for two real recording MCP clients, matching identities/tokens, cross-project denial, revoke and close-A/leaves-B | No production Mail service or live account was tested |
| Supporting ISC-2/4/5 | Baseline sentinels and composed current-grant negatives pass in the executed paths | Not universal credential redaction or whole native authority acceptance |

The one-process decision is supported only for these explicit local factories under the verified paths. It does not make the unchanged installed adapter or arbitrary private composers safe. Current canonical all-53 accounting remains **20 PASS / 24 PARTIAL / 9 UNKNOWN** until the separately leased evidence owner incorporates accepted gates; this report changes no ISA checkbox.

Corrective output: board task `86cc7259f9cb4761a728065ab307ff30`. Active unresolved gate finding: `f344716b781340e8953252c688b52b96` (publication 451); earlier finding 447 was replaced only to correct an overbroad prerequisite-blocking publication scope, never as a code fix. A successor source, native regression and immutable package must pass before independent acceptance. Product source, original archives and installed releases were not edited by this reviewer.

Not checked: live extraction/provider services, arbitrary historical registries, memory-specific SIGKILL fault matrix, every optional startup effect, or independent source acceptance of Dave-authored Store/grant composition. Terminal, BB, iii and production migration remain separate.
