# Post-final detailed host review

Reviewer: Dave; task `99fa4c40b1fe4ca8825bb2fa7ad12a7a`, after actual final gate `2d92aad6304945a484e91b0dac731c3f` DONE816. Read-only product review; no source/build/index changes, new agents, live models/APIs/banks, runtime reload, publication or deployment.

## Verdict and independence boundary

**ACCEPTED for the final documentation handoff, in the explicitly bounded local P0–P5 scope: 51 PASS / 2 PARTIAL / 0 UNKNOWN / 0 FAIL.** No new product defect was established by this detailed consistency/evidence review. This is not production, selected historical migration, real running-BB UI or arbitrary provider/plugin certification.

Dave authored the native iii backend/SDK, parts of Store/error/cache, earlier parent/TUI integration and other server components. Those implementations are **not self-approved here**: their functional acceptance comes from Alice's independent final current-tuple execution, Carol's independent combined error/diagnostic gate and Bob's independent route-case gate, with prior named author-excluded UI/memory/native milestones. Dave's independent CLIENT auth/domain proof is separately recorded in FACT807 and DONE812; its unchanged tests were not rerun.

The operator explicitly requested reuse of that exact proof and no repeated bootstrap/reload or frozen-product/build changes. Therefore this review freshly rechecks source, locks, archives, installed closures, evidence identity, all 53 criteria and five no-emit typechecks. It audits the just-completed independent 193-test and installed-runtime records; it does **not** relabel them as a second Dave runtime/bootstrap execution. The 22 direct evidence files remain byte-identical to Alice's private run. There is no transfer of an old archive's verdict to changed bytes.

## Exact frozen candidate

| Package | SHA256 |
|---|---|
| backend | `1df78d0f7ae265adf2a46b966cf8f12842fd2748900f48724dcf4bc887426410` |
| SDK | `351054859022ae202fbdc429e73da441bc90295e4717342652079c3ea0906abd` |
| terminal | `1f1b74fa2b515b55bf280113d91116c267755973b5ed76ce9a6389174c235bde` |
| BB | `01210a7df934bcb15649f47439286f8558968bddec4096c656a579d47a6d6896` |
| iii | `75da7623ae10c1a79fe2415d36ddcd22be4a779a4d1160cd94371301dc5eff33` |
| old SDK, mixed case only | `d98831740905de74cffc64243d1b2c54cd83e8e76a34c927fa2b5f139e1cdd43` |

Original/current source manifest: `/tmp/alice-final-p5.miXz0V/source-locks-before.json`, SHA256 `2e1c319502e3f60452c5bf47dfd65b4821b2e60395ea77f357c38622f6ad5ee2`. Fresh parent-side comparison verifies all 407 files, all eight repository package locks and ISA byte-identical, with no source additions/removals. Review lease `8ff042fb3fc9475281641d2bf9f6c93c` freezes the five package trees, eight locks and ISA until handoff.

Accepted final report: `docs/host-design/verification/final-p5/REPORT.md`, SHA256 `d21833bf30f34eb3ff544db073a2f6cb6833f27ab00c500ebaa30ae6833e35ca`. All 22 files in its `evidence/` directory were individually compared byte-for-byte with the actual private run, not merely counted.

## Fresh post-final actions

### Five actual no-emit typechecks

Trusted wrapper `/tmp/dave-post-final-review/typecheck-sandbox.sh` runs the real installed local TypeScript compiler for each current source package: `node --max-old-space-size=1024 node_modules/typescript/bin/tsc --noEmit -p .`.

| Package | Exit | Seconds |
|---|---:|---:|
| SDK | 0 | 2.964 |
| backend | 0 | 14.690 |
| terminal | 0 | 16.755 |
| BB | 0 | 3.636 |
| iii | 0 | 2.577 |

Direct exit records: `/tmp/dave-post-final-review/typechecks.json`; empty successful logs are not used alone as proof of exit status. OS bwrap unshare-all, empty allowlisted environment, read-only source/toolchain, no host HOME/auth/socket mount or other agent's evidence directory; scratch-only tmpfs 64 MiB, CPU60s/VM64GiB/V8heap1GiB, shared-UID baseline+128 process bound, file64MiB/fd2048, wall90s+3s kill. No native owner/bootstrap/model process was launched by these no-emit checks.

### Artifact, installed and import boundaries

Every file was freshly compared against the actual archive bytes:

- host: SDK25 + backend282 = 307;
- terminal-only: SDK25 + terminal109 = 134;
- BB-only: SDK25 + BB55 = 80;
- iii-only: SDK25 + iii17 = 42;
- all-clients: SDK25 + terminal109 + BB55 + iii17 = 206;
- mixed root: backend282 + SDK25 + terminal109 + BB55 + iii17;
- old-terminal root: old SDK23 + unchanged terminal109.

Current client runtime modules: terminal49 (45 `.js` plus four `.mjs`), BB16, iii6, SDK9. Parent-side literal import inspection finds no backend, native Durable/pi-ai or SQLite imports in those client modules. The terminal's four `.mjs` render modules must not be omitted from module counts. No nonliteral imports were found in the initial JavaScript module pass; the four additional terminal MJS modules were separately checked for forbidden runtime ownership imports.

Exact original MIT notices are preserved: IndyDevDan root text in backend/SDK/iii, selected Diffuzmetall BB grant, and all three complete terminal selected-source grants (`LICENSE.pi`, `LICENSE.extensions`, `LICENSE.pi-style`) inside `dist/ui/licenses`. Terminal does not have to use a root file named LICENSE to satisfy this requirement. The initial check assumed that filename uniformly, stopped before completing the license pass, and was corrected to verify the actual selected-source licenses; this was a checker assumption, not a product license defect. iii ownership/MIT publication permission and original-versus-derived hash distinctions are preserved in NOTICE/SOURCE.

### Runtime evidence actually inspected, not rerun

The five full source logs show SDK23, backend114, terminal19, BB25, iii12: **193 PASS, zero failures/skips**, on the source manifest that is still byte-identical now. Five independently produced typecheck records were empty successful output; the direct fresh checks above additionally establish all five exit codes.

The installed trace summaries directly show signed iii1/1, full native iii HTTP1/1, compiled error/SSE/case/provider/projection security15/15, literal default-CLI/curl1/1 and reserved-key zero-orphan1/1, all with zero failures/skips. The native HTTP fixture body/assertions were compared to original current source after removing only import lines: exact equality. No hidden weakened assertion or substituted fake owner was found.

The mixed runtime JSON explicitly records the final host, current SDK/BB, unchanged terminal/old SDK, SAME native session/conversation, actual native answers and an authorized bare-Node BB CLI. All five packages are installed in the mixed root and byte-checked; the actual mixed-viewer scenario is **terminal+BB**, while signed iii execution is separately exercised on the identical backend/SDK tuple. Do not describe that evidence as simultaneous execution of all three frontends in one conversation.

Actual paired BB latency raw samples were independently re-derived: 50 baseline + 50 remote observations; nearest-rank p95 baseline0.050321ms, remote49.123057ms, budget50.0603852ms, margin0.9373282ms. The PASS is a synthetic adopted-native-read-commit to BB delta callback measurement, not production SLA, LLM throughput or full BB UI repaint. No sample was dropped or replaced.

Terminal PTY8/8, busy-steer9/9 and prior commit-to-PTY latency are unchanged accepted-terminal evidence, with the exact same terminal archive; they are **not a fresh full PTY run on this backend**. The independent final current-host mixed/controller/source terminal tests cover the changed host seam. This limitation remains explicit rather than inventing a new UI run.

## All-53 reconciliation

Fresh parsing verifies every unique frozen leaf ID, full text and order against the run's approved `inputs/reference-001.md`; all 53 six-column Test Strategy rows and thresholds are byte-identical. Every final-report row matches those 53 leaves in order; status accounting is exactly 51 PASS and only ISC39/40 PARTIAL. No threshold or criterion was narrowed.

The final report's per-leaf evidence table is the detailed direct mapping for this unchanged candidate; this review revalidated its source/archive/log correlation, status uniqueness and authorship/limit annotations. Existing ISA checkboxes still reflect the earlier 46-PASS canonical stage. Updating that presentation from independently accepted final evidence belongs to the separately leased final-documentation owner, not this read-only reviewer.

## Required limits for public documentation

- ISC39/40: only the existing disposable closed-owner same-version rehearsal/runbook. Actual chosen historical session, cross-version restore and real data transition remain separately authorized and NOT_TESTED.
- Real running compatible BB UI smoke remains NOT_TESTED and required before production replacement.
- BB `/compact` is explicitly unsupported before effect/ACK; never enable unsafe replay or call it full prior compaction parity.
- iii used genuine pinned iii-sdk, signed generated-key ingress and loopback engine transport with a real native faux host. This is not a live production iii engine/provider claim.
- All live/billable provider, personal memory-bank, deployment, production and human project acceptance permissions remain absent.
- The candidate is a local verified scope, not arbitrary ordinary-Pi-extension/native-registry historical compatibility.
- Original private provenance/evidence contains machine-local paths. Public-copy portability/provenance adaptations and exclusion of this private report/security evidence must be preserved and re-reviewed at the outgoing-publication gate. Local tarballs are not permission to publish binary archives/npm releases.

## Concrete user scenarios for Alice's final README/guides

1. Build five local tarballs; install backend+SDK in empty HOME/data/work directories; run loopback minimal/faux CLI and obtain actual SDK/curl native result.
2. Preserve exact request key/body across lost ACK, response-cache expiry and owner reopen; show conflict for changed input, not retry-as-new-work.
3. Connect the accepted terminal to a chosen native conversation; document existing navigation, stream, interrupt/steer, pending attention and detach behavior without new UI semantics.
4. Attach BB to explicit trusted provider/thread/root/child binding, use canonical native control/history CAS and show the unsupported compact/running-BB limitation.
5. Configure iii v2 opt-in, namespace/full-config hash/public signer, explicit native session/root and selected token environment; sign actual function IDs; receive one canonical job on retry and an immutable answerRef after owner/client restart.
6. Distinguish running native job from disconnected waiter; pending stop is not an effect acknowledgement; explicit follow_up after stop advances generation; ephemeral cursor loss does not invalidate the durable answer reference.
7. Install terminal, BB and iii separately with only the public SDK; do not require the other clients or native runtime in their installation roots.
8. Add a stable trusted server runtime profile with explicit per-session model credentials/MCP/memory lifecycle. Reject incompatible saved profiles/model IDs before resume; never silently remap models or infer authority from JSON metadata.
9. Explain observer/delegated/human, revoke on reads/mutations/open streams, Goal human acceptance and fail-closed guard behavior with no secrets in examples.
10. Publish the exact locally verified status and honest remaining migration/production/UI limits; keep private reports, data, tokens, logs and machine-local paths out of GitHub.

No source change or new product defect requires another implementation round. Next existing authorized stages: Alice final docs/source publication copy, independent outgoing review, then Alice's explicit staged-inventory/full-diff commit/push/readback. This review performs none of those delivery actions.
