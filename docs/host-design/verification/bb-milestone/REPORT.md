# Independent local BB milestone — P4

## What this change does

The standalone BB adapter connects the selected BB thread and existing native children to the same Durable host through the public SDK. It preserves native authority, canonical request receipts, coherent child outcomes and authorized history CAS; it does not own Harness/SQLite or run a replacement runtime.

**Verdict: PASS for the authorized local P4 milestone on the corrected exact tuple below.** This is not production replacement, live BB activation, a running-BB-daemon compatibility claim, iii acceptance or whole-project completion.

## Exact final tuple

| Package | Archive | SHA256 |
|---|---|---|
| Backend | `/tmp/dpi-packed-1fobzC/artifacts/dpi-backend-0.1.0.tgz` | `51fc6f65d6f582573911d3445f5872f26d0916577f967d372a8753fc854060f2` |
| SDK | `/tmp/dpi-packed-1fobzC/artifacts/dpi-sdk-0.1.0.tgz` | `6c9abd1af37630a63a1102469896679bd8ae7ef0d51c8cb2ecd62a2b55e68aac` |
| Corrected BB | `/tmp/alice-bb-compact.9cNzuy/dpi-bb-adapter-0.1.0.tgz` | `01210a7df934bcb15649f47439286f8558968bddec4096c656a579d47a6d6896` |
| Unchanged accepted terminal | `/tmp/dpi-terminal-packed-7bo6KL/artifacts/dpi-terminal-adapter-0.1.0.tgz` | `1f1b74fa2b515b55bf280113d91116c267755973b5ed76ce9a6389174c235bde` |
| Terminal's unchanged old SDK | `/tmp/dpi-packed-y88Lnt/artifacts/dpi-sdk-0.1.0.tgz` | `d98831740905de74cffc64243d1b2c54cd83e8e76a34c927fa2b5f139e1cdd43` |

Rejected BB `516f6d71...` remains rejected; its original archive and independent RED probe are retained. Backend/SDK did not change for the BB correction. The accepted old terminal artifact was never rebuilt or edited.

## Independence and source review

Alice authored the BB client and earlier history helpers. Dave authored earlier HTTP grants/terminal baseline and unchanged native subagent/parent-control/binding helper slices, but **none of this new BB session/child/JSON-RPC client implementation or Alice's compaction correction**. Dave's unchanged native helper internals are excluded from independent source approval; prior Alice native acceptance, Carol's independent outcome/stream QA and the current connected boundary regressions remain separately attributed.

Reviewed `session.ts`, `child-session.ts`, `provider-bridge.ts`, `root-deltas.ts`, the canonical-input history wrapper, immutable CAS sink and their SDK/native callers, plus the selected original B translator and source contracts. The selected B provider paths are read-only. CodeGraph was unavailable; current/installed source navigation was used.

Key boundaries checked:

- Current strict four-field Core owner proof, native root identity/CWD and server-owned BB binding precede attachment and effects. Failed/revoked reconnect never creates a replacement session or promotes a child.
- Genuine CREQ IDs reach native Root receipts and actual `bb-child:<CREQ>` child receipts. Process/client reopen obtains original native retryContext, reconstructs the same command and submits it for native fingerprint/current-grant verification; changed intent conflicts rather than returning an unchecked cached receipt.
- Child key/conversation/execution/request and current revision are inspected natively before external Core registration. Registration ACK supplies the actual alias; persistent binding is routing data, never authority. Child controls use native parent control and explicit child-tree stop, not generic child abort.
- Coherent native capture/stream alone supplies child outcomes. Canonical receipt entry membership normalizes authenticated host inputs without renaming native request IDs or trusting raw metadata. Unknown/concurrent/unnamed capture stays unknown. Root release does not retire an existing child view or native work.
- Original history sink authorizes digest first, owns one immutable in-flight attempt, retries identical CAS after uncertain ACK and never silently re-reads/rebases. Private context and failure fields remain on the server boundary.
- Narrow native agent-scoped Models preserve conversation binding, exact model IDs and supported native levels including `max`; no fallback catalogue or widened session grant.

## Defect found, rejected and corrected

The original producer's installed suite passed 24/24, but the independent Core `/compact` retry probe found a real missed branch: the same Root `turn/start` CREQ called native compaction twice, creating two distinct genuine native task IDs after the first settled. Each attempt emitted `input.accepted`. The special branch bypassed the stable Root input receipt path.

- RED: `/tmp/dave-bb-compact-retry.log`, probe `/tmp/dave-bb-gate.OLMWRo/tests/compact-retry-probe.test.mts`, failure `2 !== 1`.
- Board FAIL: `c336988bfac14caaa60a0bc730834f49` (604).
- Alice correction: `d4b45cc23e6047b2911f00aad079dbba` DONE611.

Actual public native 1.4 compaction has no request-key/idempotency parameter; native compaction creation is not an exported keyed admission primitive. The smallest authorized correction **refuses BB `/compact` explicitly before view/selection/native effects or accepted ACK** with `BB_COMPACTION_UNSUPPORTED_IDEMPOTENCY`. Root/child and start/steer are covered. No client cache/journal/queue, fake success, renamed normal prompt or new owner ledger was added. Other clients' existing native SDK/terminal compaction APIs are unchanged.

This unsupported BB command is a material documented limitation, not an assertion that reliable compaction was implemented. Independent replay of the approved fail-closed alternative passed, including same intent across a deliberately recreated bridge, zero real compact calls/task IDs/entries/accepted ACK and unchanged model selection. The owner regression additionally exercises 32 attempts across full native owner/bridge reopen and conflicting instructions.

One initial independent successor fixture passed the refusal assertions but timed out later because it intentionally restarted the bridge without resuming its unrelated child-discovery observation. Adding an explicit `thread/resume` fixed only that fixture setup; no product workaround was used.

## Connected immutable checks

### Full installed suite: 25/25 PASS, zero skipped

Fresh offline BB+SDK-only installation: `/tmp/dave-bb-gate.OLMWRo/final-client`.

```sh
env -i PATH="$PATH" HOME=/tmp/dave-bb-gate.OLMWRo/home LANG=C.UTF-8 node \
 --import /home/ubuntu/Projects/pi-durable-host/apps/bb-adapter/node_modules/tsx/dist/loader.mjs \
 --test /tmp/dave-bb-gate.OLMWRo/final-client/tests/*.test.mts
```

The recorded full-suite run preceded adding the separately named independent/latency probes. Log `/tmp/dave-bb-successor-full.log`: **25 passed / 0 failed / 0 skipped**, `5680.417312ms`. Ten producer fixture files were checked against original source with only declared import substitutions; then rebound to the independent fresh installed client. Actual native product imports resolve to compiled archive-exact backend JS, not workspace source.

Covers exact Root binding/CWD/owner negatives, real model metadata/max, actual successful native answers, automatic existing-child registration, original selected Core admission predicate, Root/child lost ACK and changed intent, immutable history CAS/socket ACK loss and authorization negatives, stop/reopen/late answer, no replacement/promotion, canonical human receipt hashes and unknown presentations.

### Independent compaction successor proof: 1/1 PASS

```sh
env -i PATH="$PATH" HOME=/tmp/dave-bb-gate.OLMWRo/home LANG=C.UTF-8 node \
 --import /home/ubuntu/Projects/pi-durable-host/apps/bb-adapter/node_modules/tsx/dist/loader.mjs \
 --test /tmp/dave-bb-gate.OLMWRo/final-client/tests/independent-compact-probe.test.mts
```

Log `/tmp/dave-bb-successor-compact.log`: **1 passed / 0 failed**, `3594.884082ms`. The original RED fixture is unchanged; the successor oracle explicitly checks the approved unsupported/zero-effect alternative rather than pretending a keyed native compaction exists.

### Final native transport regression: 4/4 PASS

`/tmp/dave-bb-native-final-transport.log`, `3465.95589ms`: original actual parent+BB transport tests plus both independent late-revocation probes on **this final backend/SDK**. Late native-Tx revoke gives 401 with no fresh binding/index or child. Exact receipts/CAS/foreign/stale/current-grant negatives and accepted pending stop/reopen/reconcile preserve the same barrier and native IDs.

## BB latency — same metric, final candidate

Not borrowed from terminal, model generation time, pure helper execution or HTTP RTT.

- Same **50 actual native `read` tool result commits**, reading marker files only in disposable workspace, generated by a deterministic faux response factory.
- Start: original public `Harness.subscribeCommits` synchronous publication **after native commit adoption**. The listener records a monotonic timestamp and never calls Session APIs.
- Baseline: original selected B `DeltaTranslator` formats that same committed tool result directly in-process into the BB-visible tool-delta consumer.
- Remote: installed BB bridge/public SDK/loopback SSE/native RootDeltas reaches the same BB delta-visible consumer for the same marker. Both ends use the same clock and content check. No polling interval is included in the measurement.

Final corrected candidate: **baseline p95 `0.048774ms`; remote p95 `38.506202ms`; budget `1.2 × baseline + 50 = 50.0585288ms`: PASS, 50/50**. It also passes the more conservative zero-baseline bound of 50ms. Raw samples `/tmp/dave-bb-successor-latency.json`; test/log `/tmp/dave-bb-successor-extra.log` (latency subtest PASS; the unrelated initial compaction fixture setup failure is disclosed above).

This measures native commit → visible BB **API fixture tool delta**, not full running BB application repaint, live LLM throughput or arbitrary production workloads. The local baseline is the same original presentation path without remote transport, not a claimed running legacy BB daemon. The genuine native read tool emits its normal start/result stream; this fixture does not claim a multi-chunk shell progress benchmark.

## Standalone and unchanged-terminal interoperability

Independent BB+SDK-only `npm install --offline --ignore-scripts --no-audit --no-fund` succeeded in a new directory with empty isolated npm user/global configs and disposable HOME; exactly two packages installed (`/tmp/dave-bb-standalone-install.log`).

Independent bare-Node mixed-version probe succeeded on **the exact final tuple**: `/tmp/dave-bb-mixed-package.log`, `/tmp/dpi-bb-packed-pAmkWT/RESULT.json`. The source package script was copied unchanged except making **both** installations offline, retaining all assertions.

- BB CLI JSON-RPC initialize/model-list/authorized attach/actual successful faux answer; duplicate input yields one native submission; clean release/exit.
- Unchanged accepted terminal and old SDK then get an actual successful answer on the SAME new host/session/conversation 1. Exactly two native inputs total; no stdout protocol corruption or synthetic BB credential in stdout/stderr.
- Mixed native session `dc5b7c82-9773-49ee-9f1b-124d45fbf226`, conversation `1`.
- Every installed archive file independently compared byte-for-byte: BB-only 55 BB +23 SDK; mixed 249 backend +23 SDK +55 BB; unchanged old install 109 terminal +23 old SDK.
- All 16 BB runtime JS modules import only relative modules, Node or public SDK. BB-only install lacks backend, terminal, iii, native runtime, SQLite and tsx packages.
- All 14 selected donor hashes match; original donor MIT license is byte-exact. No upstream/installed donor files changed.

Audit `/tmp/dave-bb-final-audit.json`. No global installation, auth/config change, extra agent, live provider/API/model, personal bank, production data, migration, commit/push/publication or deployment occurred. All native stores/servers/CLI clients terminated through fixture cleanup; retained paths contain disposable evidence only.

## All 53 criteria and release boundary

Re-read all current ISA Features/Test Strategy. Canonical state before this gate is **42 PASS / 6 PARTIAL / 5 UNKNOWN**, not silently rewritten here.

- Evidence supports promotion of **ISC28, ISC29, ISC30, ISC31** for the authorized local BB milestone, with the explicit unsupported `/compact` and API-fixture limits above.
- BB subset of ISC26 now has independent same-metric evidence; previous terminal evidence remains separately attributed.
- BB subset of ISC38 is proved; whole ISC38 remains partial until iii-only installation is checked.
- ISC32/33.1/33.2/34 remain for ordered iii implementation/gate. ISC39/40 remain offline/live-data bounded; no actual user migration or production acceptance.
- No other leaf is promoted or reaccepted by implication; prior accepted native/memory/terminal candidates and rejected historical archives retain their evidence.

A separately leased canonical writer should reconcile the four supported BB leaves and remaining map, preserving all 53 frozen IDs/text and test thresholds. Only local P4 completion enables ordered iii work. Per PLAN P4, a BB API fixture is permitted for local development; **production replacement still requires a real isolated smoke on the selected compatible running BB version**, and remains unauthorized. Selected B schema/predicate/translator contracts were used, not a claim that a full compatible BB daemon was launched.
