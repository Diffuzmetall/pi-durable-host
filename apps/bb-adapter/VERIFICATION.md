# Connected BB producer candidate (Alice, task 877c7b6f)

Status: **HISTORICAL producer candidate, independently REJECTED by FAIL604 (`c336988bfac14caaa60a0bc730834f49`)**. Root `/compact` retried a native side effect without a canonical key; ordinary text 24/24 did not cover this branch. The archive below remains unchanged for reproducibility. See `COMPACTION-CORRECTION.md` for the corrective successor; independent BB milestone NOT ACCEPTED here. This is the SDK-only P4 client, not a replacement Durable runtime or Core framework. Terminal acceptance preceded this work; iii acceptance remains after the independent BB gate.

## Immutable tuple

| Package | Archive | SHA-256 |
|---|---|---|
| Backend | `/tmp/dpi-packed-1fobzC/artifacts/dpi-backend-0.1.0.tgz` | `51fc6f65d6f582573911d3445f5872f26d0916577f967d372a8753fc854060f2` |
| SDK | `/tmp/dpi-packed-1fobzC/artifacts/dpi-sdk-0.1.0.tgz` | `6c9abd1af37630a63a1102469896679bd8ae7ef0d51c8cb2ecd62a2b55e68aac` |
| BB | `/tmp/alice-bb-final.FsBNPz/dpi-bb-adapter-0.1.0.tgz` | `516f6d711a5cfc5705df2b50b040494694d47f1b4a0f514d0b98f6c014562e90` |
| Unchanged accepted terminal | `/tmp/dpi-terminal-packed-7bo6KL/artifacts/dpi-terminal-adapter-0.1.0.tgz` | `1f1b74fa2b515b55bf280113d91116c267755973b5ed76ce9a6389174c235bde` |
| Terminal's unchanged old SDK | `/tmp/dpi-packed-y88Lnt/artifacts/dpi-sdk-0.1.0.tgz` | `d98831740905de74cffc64243d1b2c54cd83e8e76a34c927fa2b5f139e1cdd43` |

The backend/SDK tuple is Bob's DONE597, including coherent outcomes, genuine `bb-child:<CREQ>` receipts, persisted retryContext and narrow `AgentHandle.models()`. The original conversation-bound BB grant remains intact; session-level models discovery is still correctly denied. No client catalogue or widened grant substitutes for actual native Models.

## Checks and correlated evidence

- **Strict + build + source 24/24 PASS, zero skipped:** `cd apps/bb-adapter && npm run check && npm test && npm pack --pack-destination <new-temp-directory>`. Logs `/tmp/alice-bb-final2-{types,tests,pack}.log`.
- **Installed immutable full suite 24/24 PASS, zero skipped:** tests in `/tmp/alice-bb-immutable.SHCqB2/tests`, log `/tmp/alice-bb-immutable-tests.log`. Only import locations were rebound: 9 original client test/helper files and the backend test helper's Store import; reverse substitution reproduces originals byte-for-byte. `BINDINGS.json` records 38 import substitutions. Client product modules come from the final installed BB/SDK; all native product imports come from the separately installed exact backend tuple under `/tmp/dpi-bb-packed-ji7o5v/fresh/node_modules`. Test loader/compiler and original selected Core schema/predicate are test-only inputs, not client dependencies.
- **Standalone BB-only offline ignore-scripts install PASS:** `/tmp/alice-bb-immutable.SHCqB2/node_modules` contains BB + public SDK, no backend package. All 55 installed BB files equal its archive; 16 runtime JS files equal built source; imports are relative, Node built-ins or `dpi-sdk/client`. No Harness/Storage/SQLite/native package import. Exact SDK peer `0.1.0`, no runtime dependencies. `/tmp/alice-bb-artifact-audit.json`.
- **Bare Node JSON-RPC CLI + mixed-version same-host PASS on final tuple:** `/tmp/alice-bb-package-final.log`, `/tmp/dpi-bb-packed-9z3H9m/RESULT.json`. CLI initialize, native model list, authorized attach, actual successful faux answer, duplicate Root request (one native input), release. Then the unchanged old terminal + old SDK receives an actual successful native answer on the SAME session `10bbb82a-fbc0-4138-a23a-be12d13c40b0`, conversation 1, same new host. Exactly two native inputs total. Stdout exclusively JSON-RPC; synthetic BB token absent from stdout/stderr. No source/tsx used by the client executable.
- **Old artifacts unchanged:** SHA assertions in the package probe; earlier identical mixed-version run `/tmp/dpi-bb-packed-ji7o5v` also has every installed terminal/old-SDK archive file byte-exact (`/tmp/alice-bb-artifact-audit.json`). Final BB differs from that earlier successful CLI candidate only in `HISTORY-NOTICE.md`; final-tuple CLI was nevertheless rerun directly.
- **Legal/source boundary PASS:** `LICENSE` equals selected donor B byte-for-byte; upstream native/SDK/terminal notices untouched. `SOURCE.json`, `NOTICE.md`, `HISTORY-NOTICE.md`, `NATIVE-CHILD-NOTICE.md` retain provenance and explicit non-runtime boundaries. No donor/installed release was modified.

Installed full-suite command:

```sh
cd /tmp/alice-bb-immutable.SHCqB2
env -i PATH="$PATH" HOME="$PWD/home" LANG=C.UTF-8 node \
  --import /home/ubuntu/Projects/pi-durable-host/apps/bb-adapter/node_modules/tsx/dist/loader.mjs \
  --test tests/*.test.mts
```

Reproducible executable/mixed-version probe:

```sh
node apps/bb-adapter/scripts/package-smoke.mjs \
  /tmp/dpi-packed-1fobzC/artifacts/dpi-backend-0.1.0.tgz \
  /tmp/dpi-packed-1fobzC/artifacts/dpi-sdk-0.1.0.tgz \
  /tmp/alice-bb-final.FsBNPz/dpi-bb-adapter-0.1.0.tgz \
  /tmp/dpi-terminal-packed-7bo6KL/artifacts/dpi-terminal-adapter-0.1.0.tgz \
  /tmp/dpi-packed-y88Lnt/artifacts/dpi-sdk-0.1.0.tgz
```

Native profiles use actual native Models with an explicit actual `InMemoryCredentialStore` and the installed backend faux response factory. The probe uses disposable HOME/dataDir, loopback servers and ignore-scripts installations; public backend dependency download is permitted (the backend install is **not** claimed offline). The independent BB+SDK-only install and unchanged terminal install are offline. All fixtures/evidence are retained; no dynamic recursive cleanup is in the package probe.

## Connected behavior, not only helper opinions

- ISC-28: exact native Root/BB scope and CWD checks precede binding/effects; mismatches, changed binding and revoked reconnect fail without replacement. Stable genuine CREQ Root prompt/steer; original two-argument child prompt/steer. Source-selected actual JSON-RPC framing/methods and reverse Core scope/history requests; actual native model IDs and `max` thinking, no fallback catalogue.
- ISC-29: original immutable CAS/lost-ACK algorithm; actual native entry/receipt membership and current Core-authorized digest. Empty/forged/mismatched receipts do not authorize a projection. Ongoing coherent child capture/stream and native-doc locator discovery use native inspection as authority; Root release leaves existing child-only observation alive.
- ISC-30: original actual Core `nativeControlWasAdmitted` predicate consumes real `bb-child:<CREQ>` receipts. Current parent/execution/revision checked by native transport; canonical retryContext restores exact retry intent after reopen, native POST fingerprints reject changed payload. Real pending stop, owner reopen, late terminal result, and native answer reference persist; no generic child abort, promotion or metadata authority.
- ISC-31 + BB part of ISC-38: standalone install and final mixed-version check above; terminal/oldSDK immutable hashes unchanged. This does not complete whole-project ISC-38 before iii-only install.

## Test defects found and removed, not hidden by assertions

1. Conversation-bound BB model discovery originally called session models and correctly received 403. Owning task `fdd7adf6` added the narrow agent-scoped actual-native reader; all client calls now use it. Session access is still negatively asserted.
2. Empty `fauxProvider` proves only model-error delivery. Disposable SQL evidence from `/tmp/dpi-bb-packed-pgiYLZ` exposed `No more faux responses queued`; the test factory now uses the actual backend `installFaux(runtime.models)`. Connected bridge assertions require completed boundaries and actual Root/child/after-detach `Echo:` answers; the executable probe also requires a successful native assistant answer, not an ACK/busy=false/error boundary.
3. Old backend history fixture constructed `inputs` with raw caller IDs. Current own `tests/native-history-wire.mts` admits through real authenticated HTTP and reads actual canonical `receipt.requestId` from owner Storage. It explicitly asserts native hash != raw metadata. Client wrapper uses receipt entry membership, never invents/relabels an alias. Historical backend fixture remains untouched and is no longer consumed.
4. Hypothesized partial-target malformed retryContext was **not reachable**: existing native SEND validation already requires execution/request before admission. Bob's DONE589 ran exact source + installed negatives with zero receipts/inputs/executions. No duplicate guard/product fix was added.

## All 53 leaves reconciled without self-promotion

Current canonical `ISA.md` / `docs/host-design/PLAN.md` remain **42 PASS / 6 PARTIAL / 5 UNKNOWN**, unchanged by this producer report. Each leaf appears exactly once below; independent evidence owner must judge any promotion on this new tuple.

| Canonical status | Complete leaf set | This producer's boundary |
|---|---|---|
| PASS (42) | 1, 2, 3, 4, 5.1, 5.2, 5.3, 6, 7, 8, 9, 10, 11, 12, 13, 14.1, 14.2, 15, 16.1, 16.2, 17, 18.1, 18.2, 18.3, 19.1, 19.2, 20, 21, 22, 23, 24, 25, 26, 27, 35, 36, 37, 41, 42, 43, 44, 45 | Existing accepted bounded native/memory/terminal evidence. ISC-26's accepted terminal metric is NOT evidence of BB p95. No blanket reacceptance of a successor or unchanged installed private extensions. |
| PARTIAL (6) | 28, 29, 30, 38, 39, 40 | Connected producer evidence now available for 28–30 and BB install subset of 38; independent gate required. Offline 39/40 fixtures are not live/cross-version history migration. |
| UNKNOWN (5) | 31, 32, 33.1, 33.2, 34 | New producer mixed-version evidence for 31 awaits independent judgment; iii remains ordered after BB. |

## Material limits / next owner

Independent task `a5a4f2fecb284a1b8e24c50a9aa939c0` must check this exact tuple and disclose authored-slice exclusions. Alice authored this BB client plus earlier pure history/Models helpers; these producer checks are not independent review. Actual selected B wire/schema/Core predicate are used, but the Core server here is an isolated fake transport, **not** a claimed full running compatible BB application/daemon. Full isolated BB-version smoke and same-metric native commit→BB-visible p95 remain unmeasured here. No live BB/project data, real model generation, paid API, production activation, private bank/config/credential access, migration, commit, push or deployment was performed.
