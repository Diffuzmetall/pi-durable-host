# Independent native coherent outcome feature check

What this change does: the existing native owner captures one coherent child history and its original receipt/execution identity. The SDK exposes that capture, ongoing scoped SSE outcomes, and exact target inspection without opening client-side Storage or inferring completion from metadata.

**Verdict: Ship this bounded component to the connected BB integration.** No concrete defect found. This is **not** whole-BB, iii, production, or all-profile acceptance.

## Candidate and independence

- Task `52ac38657f094995a73d0d76abb72fec`, Carol; producer `3edc506c4e6c4af0b53438edfeaf92e1` DONE561 by Bob.
- Carol authored earlier terminal implementation, a memory regression, and canonical evidence updates. Carol authored **none** of the outcome/resolver/child-scope/history, native parent-control, Store/route/stream, SDK, or BB history-projector implementation reviewed here. No product code was changed by this check.
- Immutable artifacts under `/tmp/dpi-packed-PupzPZ/artifacts/`:
  - backend `173da9a140e9d2d91b22d25dd71d4609497502fedda8f8763d7cba5cd9a646ac`;
  - SDK `aa29c31337b399c255d5756736ad3b6565c8be686967a654c232611a11f6f173`.
- Independently hashed both archives and compared **249 backend + 23 SDK installed files** byte-for-byte with their archive members; zero differences. Installed runtime is compiled JS, not moving backend/SDK TypeScript.
- Assumed load: the authorized local host with a small number of sessions/viewers. No production-load or model-throughput claim.

> 🧠 **From Hindsight memory (Key decisions and rationale)** — Component checks are distinct from complete BB acceptance, and verification stays offline. This historical rule was checked against current ISA and the live board; memory is not runtime evidence.

## Source review

CodeGraph was unavailable in live tool discovery. Direct current/donor source navigation and the exact installed archive were used instead.

- Read current 53-leaf ISA Features and six-column Test Strategy before claiming. Relevant boundaries: ISC-28/29/30, current-grant/secret guards, and later ISC-33; the canonical **42 PASS / 6 PARTIAL / 5 UNKNOWN** is unchanged.
- Traced routes → `Store.bbOutcome` → selected native `readCoherentOutcome` → original owner's `readOutcomeHistory`/Storage, then context-aware `publicProjection(..., 'entries')`. Trusted BB binding/current permission is checked before and after capture, not taken from caller DTO fields.
- Read original selected B `outcome/coherent.ts`, `native/child-scope.ts`, and `local-host/read-service.ts:102–165`; original resolver is byte-identical to the reviewed local resolver. All four outcome SOURCE local/donor SHA256 records match. Import localization, canonical `host.input` receipt membership, and explicit latest unnamed-input handling are the documented adaptations.
- Child binding, parent anchor, unique execution request identities, selection-before/after fence, child commit consistency guard, bounded 16×64 submission scan and 1000-entry limit remain. Unknown/unsupported/truncated history is not relabelled completed. Terminal status comes from actual latest native input receipt, not task state, `stopReason`, a reporter payload, or model text.
- `parentControl(target)` forwards the exact native target; the SDK requires `native-parent-target.v1` rather than silently ignoring it on an older host. The native owner checks child/execution/request scope before external Core registration can use it.
- The configured authenticated BB source alone supplies the trusted native send-key selector. A new `bb-child:<id>` send creates that **actual native request ID**; saved commands and non-BB default IDs are not rewritten. Final synchronous grant assertions remain after all awaited admission/ledger writes and on canonical retry.
- `bbOutcomes` uses the existing bounded SSE transport. Child watch plus parent/receipt commit hints trigger one coalesced capture; it does not poll, open a new runtime, or queue one capture per event. Each capture rechecks current binding/grant; revocation closes the shared SSE transport and viewer close stops watchers, not native work.
- Raw host input metadata and canonical native receipt request IDs remain separate domains. The test's copied Core admission predicate checks the original canonical receipt and matching native user text; no client receipt alias is introduced.

## Executed evidence

Original producer fixture `apps/dpi-backend/tests/native-bb-outcome.test.ts` was copied, then **imports only** were rebound to the exact installed packages. The rest of the test text/assertions is identical (normalization comparison). Helpers and the BB history-projector/types were frozen in the scratch directory; projector SHA256 is `d5d0809b8417dc6f2d927c34a3646899a63eb2691a64447b3f87ea915bb0c440`. That projector is test support, not an installed BB/Core acceptance claim.

```sh
HOME=/tmp/carol-native-outcome.Fg2vjO/home node \
  --import /home/ubuntu/Projects/pi-durable-host/apps/dpi-backend/node_modules/tsx/dist/loader.mjs \
  --test /tmp/carol-native-outcome.Fg2vjO/original.test.ts
```

**PASS: 1/1, 0 skipped**, 3502.723993ms total (test 1218.861011ms). Actual two-session native Harness/SQLite, loopback HTTP, installed SDK, faux provider; zero external model/API calls.

The single integrated test exercises:

- authorized root returning explicit unknown, real child exact target accepted, foreign/wrong/incomplete target denied;
- native working and completed coherent captures and SSE frames; detach leaves held work running;
- completed answer retaining original identity after stop, then a later canonical `host.input` answer;
- actual pending send abort, interrupted receipt/SSE, owner close/reopen retaining the same frame with no model replay;
- foreign thread and a non-BB owner grant denied;
- no-model failure, provider failure with a secret present in **private native entries** but absent from public capture;
- concurrent native commit returning `unknown/concurrent-change`, latest unnamed input returning `unknown/receipt-unavailable` instead of an older answer;
- actual BB send native request key, identical canonical retry, original Core predicate positive and wrong-ID/wrong-body negatives;
- grant revoked during the asynchronous submission scan returning HTTP 401; no public frame returned after revocation.

The combined stdout/stderr contains **zero** `SYNTHETIC_COHERENT_PROVIDER_SECRET` occurrences. Expected mid-capture denial produces a GrantDenied stack; it is not a test failure. No extra adversarial mechanism was added because this source review found no further concrete uncovered defect requiring one.

The first harness attempt had the wrong installed entry path (`dist/store.js`) and failed import resolution before executing tests. Corrected to the actual `dist/dpi-backend/src/` layout; assertions were unchanged. This was a fixture-binding error, not a rejected product candidate.

Frozen evidence is in `fixtures/`: original producer test, import-rebound test/helpers, projector/types, bindings manifest and final log. Rebound test SHA256 `a9dd3842bfb1f23f619b1b3db6f3aefd72be4e630eed30f915ff148d1bf95ff1`; final log `32c82d7ae1a304ba898fcf647b496e71f0f4b6ea5c62b6cb5897903d427b4c4f`. Package and scratch paths are local `/tmp` artifacts, not a published release; reproducing elsewhere requires rebinding installed package roots and the loader, not changing assertions.

## Not checked / remaining acceptance

- Actual connected BB Core workflow, CAS/lost-ACK behavior, streaming/history integration and compatibility remain Alice's producer and the existing independent whole-BB gate `a5a4f2fecb284a1b8e24c50a9aa939c0`. The copied original Core predicate is **not** the full Core engine.
- New consumer evidence Alice FACT567 reports that actual Core turn calls do not carry native target/revision, so same-CREQ command reconstruction after process reopen still needs original native retry context and a distinct capability for BB input-key provenance before mutation. This check did not independently execute that connected-Core scenario; its positive same-command retry is narrower. Resolving that caller seam is required for whole-BB acceptance, not inferred from this component PASS.
- This check does not independently accept the earlier Carol-authored terminal, mixed-version three-adapter installs, BB latency, iii, private composers, real historical sessions, live providers/banks, or production activation. No leaf is promoted here; ISC-38 remains partial.
- Earlier rejected `a0ac…` and independently corrected `5cf8…` transport evidence remains historical. This report is correlated to the **new exact** `173da…/aa29…` outcome candidate; it does not turn earlier archive checks into blanket approval.
