# Final local P5 / all-53 acceptance

Reviewer: Alice. Existing four-peer run; task `2d92aad6304945a484e91b0dac731c3f`. Evidence collected 2026-10-29 UTC. No product source changes by this gate.

## Verdict and scope

**Local P0–P5 candidate PASS: 51 PASS / 2 PARTIAL / 0 UNKNOWN / 0 FAIL across the 53 frozen leaf criteria.** ISC-39/40 remain PARTIAL: disposable same-version offline rehearsal is not an actual selected historical/cross-version migration or restoration of its original runtime. No live-data migration, production activation, real running-BB smoke, npm release or human project approval is asserted.

This is acceptance of the exact local tuple below, not a claim that the already-public checkpoint contains the final documentation or that the later requested whole-host review/publication chain is complete. The existing sequence remains final gate → detailed whole-host review `99fa4c40…` → final documentation `dc40e1f9…` → independent outgoing review `67b89ef1…` → authorized Alice commit/push `e6691b5b…`.

## Exact candidate

| Package | SHA-256 | Installed archive closure |
|---|---|---:|
| backend | `1df78d0f7ae265adf2a46b966cf8f12842fd2748900f48724dcf4bc887426410` | 282 files |
| SDK | `351054859022ae202fbdc429e73da441bc90295e4717342652079c3ea0906abd` | 25 files |
| terminal | `1f1b74fa2b515b55bf280113d91116c267755973b5ed76ce9a6389174c235bde` | 109 files |
| BB | `01210a7df934bcb15649f47439286f8558968bddec4096c656a579d47a6d6896` | 55 files |
| iii | `75da7623ae10c1a79fe2415d36ddcd22be4a779a4d1160cd94371301dc5eff33` | 17 files |

The mixed-version case additionally uses old SDK `d98831740905de74cffc64243d1b2c54cd83e8e76a34c927fa2b5f139e1cdd43`, 23 files, with the unchanged accepted terminal. All archives were independently rebuilt by Alice under one source/build freeze, matched the named producer/accepted hashes and were installed offline into separate empty roots. No later archive inherits an older archive's PASS by filename/version alone.

Private evidence root: `/tmp/alice-final-p5.miXz0V`. Frozen source manifest `source-locks-before.json`, SHA-256 `2e1c319502e3f60452c5bf47dfd65b4821b2e60395ea77f357c38622f6ad5ee2`: 407 files in all five package trees plus all eight repository package-locks and ISA. Final comparison: 407/407 unchanged, zero added/removed files, eight/eight lockfiles unchanged, ISA unchanged. Example network template was separately frozen/mounted; no original integration/installed-runtime writes.

ISA audit against frozen `inputs/reference-001.md`: all 53 unique leaf IDs, text/order and the 53 six-column Test Strategy rows/thresholds unchanged after ignoring checkbox status only. Normalized Features SHA-256 `59227d200a97a1c94447bc52042be686b7ca0705db1423d1fd4c2910a0c7a67f`; Test Strategy table SHA-256 `ab4680aebeebd0d1d07aa6499740e0340df9b7bcbe8e23d5eb2a95a74d30ea4e`. This report supplies evidence; it does not rewrite canonical ISA/PLAN/README under another writer's ownership.

## Independent authorship

- Alice independently accepts Dave's server/SDK native iii implementation and Bob's client/CLI integration. Alice did not author their job execution, control, result paging or worker integration.
- Alice authored the earlier pure client `auth.ts` / canonical sparse-array repair and other earlier components. Those are NOT self-certified here. Dave's independent FACT807, publication `9fe46fe7216848b8a4642706e3a8703d`, reviews final auth/domain/worker/config and runs his independently authored harness with 40 negative cases on source AND the actual installed final iii compiled JavaScript. Both runs PASS; original input request Alice795 satisfied before this report. Consolidated output `0985f172…` DONE812 additionally records 19 new installed UTF-8/prototype/nested JSON/PEM/trusted-local boundary negatives PASS without rerunning the unchanged 40-case harness.
- Dave's proof binds auth source `2316eb22d9dc596690017ad843815df662825641f3705762759d1c605fc41ebb`, domain source `95c8b386f3a9cd0dbf9a2797468b445f8b2f59e80d48768390eda3443968ec38`, compiled auth `623ceaac0a9a49d66a059eea17e369b3699d8830b4890f228b70ff6c41f15e55`, compiled domain `b6287dfc77784a4ef7ecd2eef732a91fee53ce566e204374ebca7d418351616f` and iii archive `75da7623…`. His sandbox uses generated in-memory keys, no host HOME/credentials/socket/network, and no product writes. This does not self-review his server.
- Earlier Alice/Bob/Dave-owned native/memory/terminal/BB changes retain the explicit independent milestone scopes in canonical ISA Verification: native `5bfaf889…`, memory `d7edb43f…`, terminal `da60cf68…`, BB `a5a4f2fe…`. Fresh current-tuple regressions below supplement rather than silently replace those authorship exclusions.
- Error-boundary implementation includes Alice/Dave/Bob changes; combined nonauthor Carol gate `69fb2cc1…` DONE762 independently passed 11/11 + strict types. Bob's independent routing gate `ef1c638e…` DONE742 passed 18/18 plus 18 separate negatives. Both sticky P1 defects were explicitly resolved; fresh compiled regressions pass below.

## Fresh commands and results

`RUN=/tmp/alice-final-p5.miXz0V`. `NODE=/home/ubuntu/.nvm/versions/node/v24.19.0/bin/node`. `LOADER=/home/ubuntu/Projects/pi-durable-host/apps/dpi-backend/node_modules/tsx/dist/loader.mjs`.

Execution uses `bash "$RUN/sandbox.sh" COMMAND…`: bwrap unshare-all, empty environment, read-only source/toolchain/installed candidate, private HOME/tmp/cache, loopback only, scratch tmpfs 1 GiB, CPU 120 s, VM 64 GiB, fd 2048, file 128 MiB, shared-UID baseline +512 process bound and 180 s wall limit. Sandbox probe confirmed isolation/read-only source and scratch writes. No live model/API, personal bank or production DB.

| Check | Command inside sandbox / evidence | Result |
|---|---|---|
| Five strict typechecks | each package's `tsc --noEmit -p .`; `typecheck-*.log` | 5/5 exit 0 |
| SDK full source suite | original test files; `tests-dpi-sdk.log` | 23/23, 0 skips |
| Backend full source suite | `node --import "$LOADER" --test --test-concurrency=4 tests/*.test.ts tests/*.test.mjs`; `tests-dpi-backend.log` | 114/114, 0 skips |
| Terminal full source suite | original test files; `tests-terminal-adapter.log` | 19/19, 0 skips |
| BB full source suite | original test files; `tests-bb-adapter.log` | 25/25, 0 skips |
| iii full source suite | original test files; `tests-iii-adapter.log` | 12/12, 0 skips |
| Actual installed signed iii CLI | original native-flow fixture with final installed host/client roots; `installed-signed-iii.log` | 1/1, 0 skips |
| Actual installed native iii HTTP | `cd /candidate/host; node --import "$LOADER" --test security-tests/native-iii-http.test.ts`; `installed-native-iii-http.log` | 1/1, 0 skips, 8837.9 ms |
| Compiled security boundaries | five original suites with import strings only rebound to installed backend/SDK; `installed-security-boundaries.log` | 15/15, 0 skips |
| Actual default minimal CLI + literal curl | `node --test /candidate/host/minimal-curl.mjs`; `installed-minimal-curl.log` | 1/1; three unchanged curl recipes, two CLI owner opens; same native IDs/result |
| Mixed versions | original BB packaged-smoke runtime assertions with precompleted install paths only; `installed-mixed-version.log`, `mixed-archive-closure.json` | PASS; unchanged terminal + old SDK and new BB/SDK operate on SAME final host/session/conversation |
| Same-metric current BB latency | original independent 50-native-read probe rebound to current installed tuple; `installed-bb-latency.log` | 1/1, 50 samples; p95 49.123057 ms ≤ 50.0603852 ms |
| Reserved string key boundary | two actual installed `__proto__` request IDs; `installed-reserved-key.log` | 1/1; both 400 invalid; native conversation IDs remain `[1]`, zero orphan resources |
| Independent installs/imports | `installed-closure.json`, runtime literal/nonliteral module scan and absence checks | terminal/BB/iii each contains neither backend/native runtime nor the other adapters; 49/16/6 runtime modules respectively; SDK nine modules, zero runtime dependencies |

Full source suites total **193/193, zero skips**. Installed runtime/security checks are additional evidence, not substituted source tests or live-model compatibility claims. Every installed runtime file matched its own archive bytes; all current SDK declarations are the actual 25-file immutable package, not source aliases or patched declarations.

### Native iii semantics actually exercised

The installed signed CLI uses real pinned `iii-sdk` with a loopback function transport and generated Ed25519 keys; the host is the actual installed backend/SDK/native 1.4 with a faux provider. Tests cover trusted namespace/config/worker/session binding before registration; signed input with spoofed metadata; actual socket ACK loss; four concurrent same-key requests producing one native generation; changed payload/mode conflicts; replaced client and owner reopen; pending accepted work completing after disconnect/restart; exact immutable native answerRef/Unicode SHA pages and intentionally reset ephemeral cursor; real native run wait; foreign/stale/revoked controls; actual native child receipts; and a held real abort whose pending stop receipt cannot claim an effect before the native effect completes/reconciles.

The independently rerun full installed HTTP fixture additionally observes exact ownerless job roots, offered read-only tool names and native JobScope/JobJournal; verifies no conversation-ID remap or duplicate roots across owner reopen; revokes during an actually awaited native create transaction and proves rollback of both new conversation and request index; and rejects changed trusted configHash/namespace/worker before saved native work can resume. Its seven import replacements are the only changes to the original fixture; all original assertions/injected failure/reopen logic remain intact.

The compiled security batch retains all original assertions. Factory/wrapper/model/auth/MCP initializer sentinels are absent from first HTTP failure, cached tree/session reads, two owner reopens and diagnostics. SSE projection/redaction, healthy opaque JSON and case-sensitive route/permission checks are covered. These are real HTTP/SQLite/native flows, not a token-regex registry.

### Performance scope

BB measurement is the SAME actual native synchronous adopted tool-result commit → SAME BB-visible delta callback, with the original donor DeltaTranslator as baseline, not HTTP ACK, model throughput or a substituted metric. Fifty actual native read results are measured on both paths. Baseline p95 0.050321 ms; remote p95 49.123057 ms; frozen budget `1.2 × baseline + 50 ms = 50.0603852 ms`. Raw 50+50 samples are retained in the private log. The margin is only about 0.94 ms in this environment; PASS is not a production latency SLA or real BB UI repaint claim.

Terminal's previous independent 50-sample commit→PTY proof remains bound to the byte-identical accepted terminal archive: p95 4.278373 ms ≤ 51.9471548 ms. Original PTY 8/8, stronger busy-steer 9/9 and installed attention/Goal/guarded stream/projection proofs remain prior unchanged-client evidence; they are not mislabelled as a fresh full PTY rerun on this backend. The fresh same-host mixed-version/controller and source terminal tests check its current host seam.

## All 53 frozen leaves

PASS means the named local scope below, not arbitrary historical registry compatibility, live external providers or production replacement. `B` = fresh backend 114/114; `S` = SDK 23/23; `T` = terminal 19/19; `BB` = BB 25/25; `I` = iii 12/12. `Installed` references the explicit rows above. Prior independent gates are named where Alice's authorship or unchanged UI must not be hidden.

| Leaf, original order | Status | Correlated evidence / boundary |
|---|---|---|
| ISC-1 | PASS | B P0 owner exclusion; second owner cannot resume; earlier independent P0 review retained. |
| ISC-2 | PASS | Installed compiled security 15/15 + B provider/SSE/opaque projection; independent combined Carol762 and Bob742 corrected-source scopes, explicit P1 resolutions. |
| ISC-3 | PASS | B auth-http observer mutation negatives + installed route/auth regression. |
| ISC-4 | PASS | B configured native/delegated and Goal negatives; installed signed iii + native HTTP; Dave807 nonauthor client signature/canonical evidence. |
| ISC-5.1 | PASS | B revoke/read reconnect; installed auth routes and native iii denied after revoke. |
| ISC-5.2 | PASS | B queued native admission/revoke; installed native iii late awaited native-Tx rollback proves no committed job/request after denial. |
| ISC-5.3 | PASS | Actual open SSE → revoke → later committed sentinel exclusion in B and installed auth batch; independent authorized reader remains usable. |
| ISC-6 | PASS | Strengthened B P0 actual persisted native model equality/no resume; configured native Models preserves unavailable exact references. |
| ISC-7 | PASS | B incompatible persisted profile before factory/resume; async binding cleanup; installed iii trusted identity mismatch before native resume. |
| ISC-8 | PASS | Fresh three independent client installs, archive byte closure, 49/16/6 runtime modules; no native runtime/storage/backend imports or nonliteral module loads. |
| ISC-9 | PASS | Fresh installed actual default minimal CLI with empty HOME and faux, no private integration/profile; literal curl work and owner reopen. |
| ISC-10 | PASS | B actual 1.4 SIGKILL/native tool roundtrip; fresh installed BB 50 actual native reads and terminal/BB mixed native answers. |
| ISC-11 | PASS | B alternate trusted registry/profile integration without backend/SDK modification; installed configured native iii profile uses public composition seam. |
| ISC-12 | PASS | B actual composed native DCG missing/deny recording environment; independent native gate 5bfaf889, no dangerous fixture shell effect. |
| ISC-13 | PASS | B actual nested native CodeMode rechecks each MCP effect, including revoke; independent native gate retained. |
| ISC-14.1 | PASS | Fresh B two actual native Hindsight/Mail sessions and reload/fork probes; independent Dave memory successor gate d7edb43f. |
| ISC-14.2 | PASS | Same native A/B log/usage/diagnostic path/content assertions; independent memory successor proof, no personal banks. |
| ISC-15 | PASS | B actual schedule restart: same native task/doc/request IDs, one accepted occurrence; independent native automation proof. |
| ISC-16.1 | PASS | B copied registered native definitions reopen same child/task/canonical IDs; independent native gate. |
| ISC-16.2 | PASS | B schedule/delegated/parent native documents reopen unchanged; installed iii JobScope/Journal/control/result identities survive owner reopen. |
| ISC-17 | PASS | S/T unknown-kind fallback; prior independent actual installed terminal safe text on identical terminal bytes. |
| ISC-42 | PASS | B actual Goal service rejects model/delegated self-approval; human pending remains; independent native automation + terminal Goal evidence. |
| ISC-43 | PASS | B actual local recording MCP two-session identities/grants/close isolation; independent Dave memory successor proof. |
| ISC-44 | PASS | B configured single registry executes original agreed tool families through native Models/loopback and scoped skills/context; independent native/memory inventory gates. |
| ISC-18.1 | PASS | Prior independent terminal multiline editor PTY 8/8 on identical 1f1b74fa archive; fresh T/controller/mixed-host seam. |
| ISC-18.2 | PASS | Prior original tool-card partial→final PTY + installed native/DCG stream; byte-identical terminal; fresh T/native host regressions. |
| ISC-18.3 | PASS | Prior independent chosen conversation/child/main/session/new/reconnect PTY 8/8, identical archive; fresh controller tests. |
| ISC-19.1 | PASS | Prior PTY child Escape returns without abort, root Escape actual native interrupt; fresh native controller/source T coverage. |
| ISC-19.2 | PASS | Prior stronger busy-steer PTY 9/9 actual native tool and SSE inbox mode=steer; same terminal/controller bytes. |
| ISC-20 | PASS | Installed signed/native HTTP run waiter disconnect leaves accepted work running; prior last-TUI-close proof; native late result after reopen. |
| ISC-21 | PASS | S/T reconnect snapshot/delta convergence and dedup; prior installed projection 2/2; fresh mixed same native conversation. |
| ISC-22 | PASS | T actual native pending attention/Goal owner/viewer reopen; prior independent installed native terminal proof with no default answer. |
| ISC-23 | PASS | B real HTTP/native commit ACK loss, same IDs after retry/reopen; installed signed/native iii actual dropped socket ACK. |
| ISC-45 | PASS | B actual 25-hour cache advance + native reconcile/reopen; canonical maps do not rely on response cache; iii saved receipt survives owner reopen. |
| ISC-24 | PASS | B concurrent body/whenBusy conflicts; installed native/signed iii changed body/mode 409; no metadata authority; reserved key denied with zero effects. |
| ISC-25 | PASS | B concurrent create/fork preallocated identity and genuine crash/reconcile cases; unchanged canonical create semantics; installed minimal stable session retry/reopen. |
| ISC-26 | PASS | Current installed BB 50 actual native read commits p95 49.123057 ≤ 50.0603852 ms; prior identical terminal PTY p95 4.278373 ≤ 51.9471548 ms; exact scopes above. |
| ISC-27 | PASS | B real stalled TCP SSE viewer bounded-disconnect, second client native completion; prior independent slow-viewer proof retained. |
| ISC-28 | PASS | BB + installed current native-read/bridge flow root/thread/provider/CWD and scoped Models negatives; prior independent BB616. |
| ISC-29 | PASS | BB native input/retryContext/history CAS/digest/lost-ACK/reopen assertions; prior independent installed BB616 on identical BB bytes, fresh B transport. |
| ISC-30 | PASS | B real native parent/child control, exact execution/revision/outcome and pending-stop; BB existing-child controls/history; installed current BB child survives root view release. |
| ISC-31 | PASS | Fresh mixed old SDK/unchanged accepted terminal + current SDK/BB, SAME final host/session/conversation and actual native answers; archive-exact closures. |
| ISC-32 | PASS | Installed signed CLI and full native HTTP concurrent/retry/ACK-loss/reopen preserve one native job/submission/generation; Dave807 independent client Admission proof. |
| ISC-33.1 | PASS | Installed actual native parent controls deny foreign binding/same-session job/child/execution; no client metadata or generic abort authority. |
| ISC-33.2 | PASS | Installed actual current revision/generation checks reject stale native parent control; pending stop is not reported as completed effect. |
| ISC-34 | PASS | Installed actual late accepted work completes after owner/client reopen; same durable native answerRef/SHA/Unicode pages; ephemeral cursor correctly resets/conflicts. |
| ISC-35 | PASS | Public installed TS SDK recipe earlier executed with identical SDK351 package; fresh installed pure SDK terminal/BB/iii consumers and actual declarations; no Durable imports in SDK. |
| ISC-36 | PASS | Fresh literal unchanged curl create/submit/receipt/result recipe three times across two actual installed default CLI owner opens. |
| ISC-37 | PASS | S incompatible version/capability/legacy zero-mutation assertions; fresh old/current SDK mixed native answer validates compatible path. |
| ISC-38 | PASS | Fresh empty offline terminal-only, BB-only, iii-only installs with actual immutable SDK25; each omits two other adapters/backend/native runtime and matches its archive bytes. |
| ISC-39 | PARTIAL | Existing DONE5ce22 disposable closed-owner same-version copy rehearsal/runbook only. No actual selected historical or cross-version data transition authorized/tested. |
| ISC-40 | PARTIAL | Same disposable offline backup/restore rehearsal only; original historical runtime/version restoration and production running-BB smoke remain NOT_TESTED. |
| ISC-41 | PASS | All five archive/installed upstream MIT/copyright notices preserved; original source hashes distinguished from local derived hashes; user explicitly confirmed iii MIT rights. |

## Limits, failures preserved, and next boundary

- Earlier environment/check attempts are retained, not relabelled green: missing network-template mount; VM12 GiB V8 code-range failure; VM32 GiB Wasm allocation failure; sequential backend run exit125 after 112 passing tests without an assertion failure. The actual original memory test passes unchanged at VM64 GiB; the actual complete backend suite passes unchanged at concurrency four (114/114). Diagnostic private copies never become product acceptance substitutes.
- BB `/compact` deliberately rejects `BB_COMPACTION_UNSUPPORTED_IDEMPOTENCY` before view/selection/effect/accepted ACK. Native API lacks keyed canonical compaction; no fake client journal makes it supported. Original SDK/terminal compaction is not removed. Real compatible running-BB UI smoke remains NOT_TESTED and required before production replacement.
- The first public GitHub checkpoint is delivered at `3611d408…`; this local gate does not mean final post-review source/docs were already committed/pushed. Public sync must preserve privacy/provenance adaptations and exclude this private evidence directory.
- Dave's already-completed FACT807 was initially missed in the compacted summary, causing redundant board output0985. Its existing 40+40 proof is reused; no new auth test loop or new worker is required. One explicitly user-requested stable operator notification was accepted by Dave's exact Native1.4 session; no draft was inspected/submitted. Legacy schema1 notification tooling refused before delivery; only the recorded run's correct schema2 installed launcher accepted the stable input.
- No product bug was inferred from the reserved-key hypothesis: actual installed API rejects both requests before resource creation. No speculative mechanism or product patch was added.

The scoped local evidence closes P5 and independent package installation, while preserving both real migration leaves open. Final source/lock/archive recheck and lease release precede completion/handoff. Subsequent detailed review/docs/outgoing publication are existing authorized tasks, not work completed by this report.
