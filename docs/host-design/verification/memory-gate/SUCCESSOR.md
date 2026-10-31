# Independent memory retest — corrected immutable successor

## Verdict

**ACCEPTED for the tested session-local memory/Mail behavior on the exact successor below.** The independent native-profile gate, terminal/BB/iii milestones and canonical ISA accounting are separate. Corrective output `be28f82dd2f24ddba956e9e1bd4ea913` is DONE (471) and is the gate's actual usable input; Carol's separate repair-handoff verification is not an additional prerequisite for these already completed independent checks.

The original candidate's rejection in `REPORT.md` remains historical evidence; it has not been rewritten as a pass.

## Exact candidate

- `/tmp/dpi-packed-y88Lnt/artifacts/dpi-backend-0.1.0.tgz`: SHA-256 `4d3cf2d8fcae7cebaa35c3bd6b177a343a38d2641ee5d216db7106702708d38e`.
- SDK in the same directory: SHA-256 `d98831740905de74cffc64243d1b2c54cd83e8e76a34c927fa2b5f139e1cdd43`, unchanged from the original candidate.
- Installed wrapper: `session-memory.mjs` SHA-256 `e003fbbd860885a5286237f1bab318e3c89f342753d376c12b1589ec306d6c60`.
- All 21 SOURCE local records match current source; corresponding installed retained files match too. Archive hashes were independently read, not copied from the producer's claim.

Reviewer Dave did not edit the product fix. Bob's correction adds `scopedRegistryFor(target)` and routes both default and explicit reload through it. Actual registry methods retain their receiver, and every installed callback keeps the factory's captured session scope. Native document kinds/versions, delivery-task definitions and outbox/lifecycle payload algorithms remain unchanged. Dave's earlier Store/grant/composition authorship exclusions from `REPORT.md` still apply.

## Fresh correlated checks

Original probes were copied to `/tmp/dpi-memory-successor.1Y7Dkl/`; only `/tmp/dpi-packed-dUBp45` was replaced by `/tmp/dpi-packed-y88Lnt`. Reverse-normalized bytes were checked equal. No assertion, payload or expected result was weakened.

```sh
node --test /tmp/dpi-memory-successor.1Y7Dkl/baseline.test.mjs /tmp/dpi-memory-successor.1Y7Dkl/reload-neutral-fork.test.mjs /tmp/dpi-memory-successor.1Y7Dkl/reload-neutral-caller.test.mjs
```

**6/6 PASS**, `/tmp/dave-memory-successor-native.log`. This includes the original RED case: actual native neutral section caller, explicit target reload, fresh native fork/input and matching scoped memory recall. The actual tool-callback scope probe also returns to zero unscoped callbacks. Baseline two-session context/log/Mail/denial/close and retained-delivery checks remain green.

```sh
node --test /tmp/dpi-memory-successor.1Y7Dkl/reload-fresh-registry.test.mjs /tmp/dpi-memory-successor.1Y7Dkl/default-and-explicit.test.mjs
```

**3/3 PASS**, `/tmp/dave-memory-successor-fresh-default.log`. The added fresh-registry probe reloads into a real empty native registry, installs those actual extensions into the active host registry, then runs the same neutral-caller/fresh-fork and complete two-session assertions. The existing native regression separately covers default and explicit same-registry reload. These are real Harness/SQLite/faux/loopback effects, not fabricated execution APIs.

```sh
node --import /tmp/dpi-packed-y88Lnt/install/node_modules/tsx/dist/loader.mjs --test --test-name-pattern='combined native Store/HTTP profile' /tmp/dpi-memory-successor.1Y7Dkl/composed.test.ts
```

**1/1 PASS**, `/tmp/dave-memory-successor-composed.log`: installed native Store/HTTP composition with distinct Hindsight contexts, actual retained delivery, separate Mail clients/current grants, denied nested revoked effect and native reopen identity preservation. This supplies behavioral evidence, not independent source signoff for Dave-authored owning boundaries.

## Criteria and residual scope

- **ISC-14.1:** distinct A/B contexts and matching banks remain isolated through concurrent native inputs and corrected reload/fresh-fork scenarios.
- **ISC-14.2:** separate log/diagnostic/usage paths contain no foreign prompt/bank markers; original missing-scope reload defect is corrected rather than bypassed with global paths.
- **ISC-43:** separate recording MCP identities/registration grants, cross-project denial, current revocation and close-A/leaves-B remain green.
- **Gate source/provenance:** actual local integration closure and narrow changes remain matched; no private config fallback, environment assignment or explicit global dispatcher replacement was introduced.

The bounded one-process conclusion applies only to these local explicit factories and tested configuration. No acceptance of the unchanged installed adapter, arbitrary historical registries, live extraction/model/Mail services or untested optional startup effects is implied. Full 53-leaf accounting belongs to the single leased canonical evidence owner; this report edits no ISA checkbox.

Gate finding `f344716b781340e8953252c688b52b96` was resolved by fresh independent proof in publication `54900bf65de140d8889358c572feb540` (467), not merely by the producer's source check. Actual corrective producer `be28f82dd2f24ddba956e9e1bd4ea913` is DONE with this exact archive. Task `86cc7259f9cb4761a728065ab307ff30` remains Carol's separate handoff/reconciliation of Bob's already-correct patch; it does not require duplicate implementation or holding the consumer for an optional producer remainder. Other native-profile findings remain separate.
