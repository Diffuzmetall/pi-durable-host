# Solo SDK-host cutover — terminal, iii and Nico MCP active

Execution follows `/home/ubuntu/Projects/master/docs/design/sdk-host-cutover/README.md` and its handoff. The operator requested continuation in the main conversation, without DeLM or other agents. No worker was resumed and no board state was changed for this stage.

## Current result — 30 October 2026

**Subsequent package candidate:** `pi-mcp@1.4.0` plus a one-expression native structured-null bridge fix passed **14/14 isolated checks**, and was sealed as `c0019d7-nico-mcp140-v3`. It retains Nico and is **not active**. The existing stock native manager failed replacement parity (adapter-only server omitted; tools/call resent after session-expiry 404). See [candidate, evidence and comparison](PI-MCP-140.md). The active deployment described below remains unchanged.

**Terminal + local iii cutover is active and post-switch verified.** `~/.local/bin/pi-durable` now runs the SDK-only original TUI against one persistent native Host. The accepted selected copy was relocated, not copied or re-imported, into `~/.local/share/pi-durable-host/data/main`; original databases were not opened. Existing legacy processes were preserved.

- Active immutable Host release: `~/.local/share/pi-durable-host/releases/c0019d7-nico2`, native profile `native@1`, operational bootstrap v16 with Nico MCP. Unchanged SDK clients remain in `c0019d7-sse1`. These derive from the accepted public commit below; the local delta was not committed or published. See [Nico integration, evidence and update procedure](NICO-MCP.md).
- Three live subscription checks passed: new terminal, exact saved-model continuation, actual iii 0.24.6 signed adapter. All **3/3** durable dispatch slots remain consumed in the original shared ledger. No additional provider test is authorized.
- Existing Hindsight banks are enabled with the operator's explicit authorization. Native packaged lifecycle helpers are present; model credentials remain in existing private AuthStorage.
- `pi-durable-host.service`, `pi-durable-iii-engine.service` and `pi-durable-iii-worker.service` are active and enabled user services. Only loopback listeners were observed. The Host refuses existing owner locks, including dead-owner locks; it does not silently steal them.
- After switching, ordinary `pi-durable` created an idle new SDK session, and `pi-durable --continue` in `~/Projects/master` attached the accepted history. Both real TUI panes were healthy; their adapter processes held no SQLite descriptors. All four database locks belonged to the single Host PID. No post-switch prompt/model dispatch was made.

Private authoritative records: `~/.config/pi-durable-host/{relocation.json,TRANSFER-RESULT.json,OPERATIONAL-VERIFY.json,ACTIVATION-PREFLIGHT.json,ACTIVATED.json,POST-SWITCH.json}`. They contain private identities/bindings and must not be published. Earlier records below are historical checkpoints, not the current readiness state.

**Explicit limits:** only the selected old session was imported. Other old sessions and unsupported extension/MCP/headless CLI flags use `pi-durable-legacy`, never silent fallback. Tracing is the native metadata bridge, not legacy full-payload parity; a live collector was not accepted. Timeweb MCP failed also in the legacy environment and remains visibly degraded. BB is deferred. Nico is now active for the terminal/iii Host, not ordinary Pi or BB.

### Rollback

The exact previous launcher remains available as `pi-durable-legacy`. A byte-exact disposable replacement/restore canary passed, including concurrent-edit and symlink refusal. To restore only future launcher invocations, the installed operator command is:

```sh
python3 ~/.local/share/pi-durable-host/releases/c0019d7-sse1/rollback-launcher.py
```

It refuses a changed launcher and does not stop current owners, delete new history, or downgrade-open the new databases. Original-runtime restore evidence is separate and reused from `/var/tmp/dave-no-bb-restore.0kq1rR/RESULT.json`; it is not a claim that the current legacy launcher version restored that historical copy.

### Final changed-boundary checks

A real 3,089,294-byte selected-history snapshot exceeded the SSE backlog bound before its following optional document frames. The server mistook its own initial buffered snapshot for a slow viewer, causing endless TUI reconnects. `backend-sse.patch` waits for the initial response to drain (or close) before optional documents; the steady-state backlog guard remains unchanged.

`check-sse.py baseline-v2` reproduced the exact failure; `check-sse.py patched` passed. Actual selected-history SSE then delivered all four optional documents and stayed open until the bounded diagnostic cancelled it. The TUI no longer showed stale projection. The initial baseline fixture's small synthetic streaming chunks timed out; that superseded fixture result was retained, not presented as the regression failure.

`check-operational-service.py`: **5/5 PASS**, isolated network/fresh HOME/synthetic credentials: existing-lock refusal, native service discovery/close/reopen, strict CLI, exact-cwd continuation, and stable-key creation reconciliation. Production-route verification preserved all three existing native conversations' model/thinking settings and retrieved the same checksummed iii answer after owner/transport restart, without calling a model.

Package comparison found exactly one changed installed dependency file, `dpi-backend/dist/dpi-backend/src/streams.js`; the SDK and both client packages are unchanged. The private activation manifest records all dependency hashes, bootstrap/bundle hashes, launcher preimage and Node binary. Code was sealed read-only before the final exact-preimage launcher replacement.

## Completed: separate offline installation

`install-release.py` installed the accepted four-package tuple into:

`/home/ubuntu/.local/share/pi-durable-host/releases/c0019d7-dadd5534`

The installer refuses an existing destination; do not rerun it against this completed installation. Its native execution occurred in Tern pane `60219736457218` and exited successfully.

- Source: public commit `c0019d73152b58783d1b74fabe95f6982206aa55`.
- Backend archive: `dadd5534e7642a2c14dc6c6fdcbb6eab572c773221473bf3a13bc92326392458`.
- SDK archive: `351054859022ae202fbdc429e73da441bc90295e4717342652079c3ea0906abd`.
- Terminal archive: `1f1b74fa2b515b55bf280113d91116c267755973b5ed76ce9a6389174c235bde`.
- iii archive: `40b33e8aae70c37222fc212cfb3b83adb48dba25e73163468fefb6dae33eeefe`.
- All 447 installed package members match their accepted archives.
- Public Store, native-profile, native-import, server and SDK exports loaded successfully.
- Installation used an isolated network namespace, fresh HOME, offline npm, disabled lifecycle scripts and a disposable overlay on the existing package cache.
- Dependency symlinks stay inside the release. No workspace or temporary-directory dependency symlinks are used.
- No credentials, original databases, live model calls or native sessions were opened.
- During this installation stage, no default launcher, service, global configuration, public checkout, or existing owner was changed.

Evidence is in `INSTALLATION.json`, `install.log` and `exports.log` inside the release. The installer creates and checks its own evidence; this is a local installation check, not a repeated independent review or a runtime cutover acceptance.

## Important: launcher inventory changed since the preparation document

Before activation, the launcher pointed to `20261030-headless-48a55067`, not `20261028-4rmMfRfc` from the earlier preparation inventory. Its preimage SHA256 is `5e322397b639987dc6e2fc39af472de90c515883e0112424f05d2c99bd0d6034`, mode `0775`. An exact private preimage is retained as `legacy-launcher.preimage` in the new release.

This is distinct from the original runtime used for the already-selected session's restore proof. Do not confuse rollback of today's launcher with rollback of that historical session copy. Before any authorized launcher replacement, recheck the current preimage and refuse concurrent changes. Never overwrite another installation's update.

## Recorded authorization and remaining scope

- Trusted native bootstrap, actual integration/guard inventory, live checks and launcher activation are now completed for the explicit terminal/iii scope above. Public-export import alone was never treated as a bootstrap/model proof.
- User explicitly approved at most three live subscription-only checks (new terminal, selected-copy continuation, iii), including sending the selected history to its saved provider. Paid API and new spending remain excluded. Count actual provider attempts; do not replay an uncertain attempt under a new key.
- User approved a precisely recorded switch of future `~/.local/bin/pi-durable` launches AFTER acceptance, preserving the legacy entrypoint and every already-running owner.
- Reuse the accepted selected-copy import and rollback evidence. Do not take a new snapshot or re-import merely to repeat a passing check.
- User subsequently overrode the initial BB-before-Nico order: activate Nico now for terminal/iii, preserve working integrations, and keep the dependency easy to update without a heavily patched fork. That scoped activation is complete; no bulk-history migration or mandatory-tool exclusion was implied. Work remained solo, without DeLM or other agents.

## Completed: bounded subscription capability and native composition inspection

The next accepted local candidate is `acceptance-native-v4` inside the installed release. `inspect-native.py` staged the five ESM files with SHA256 receipts, ran four tests against the installed native provider, then constructed `native@1` inside a network-isolated sandbox. Tern pane `60241211293698` exited successfully; no daemon remained.

- The existing `openai-codex` credential is OAuth and was locally unexpired. Its file was mounted read-only, and its bytes remained unchanged. Native model metadata accepted the exact saved `openai-codex/gpt-6.1-sol` reference. This is NOT a provider response or continuation proof.
- `subscription-probe.mjs` admits one dispatch for each of `terminal`, `selected-copy`, and `iii` using exclusive durable slot files. All live runs must share ONE private ledger directory. Failed/uncertain dispatches retain their slots; redirects, extra service tiers, changed model IDs, and other endpoints are refused.
- `probe-models.mjs` binds this boundary to the installed native provider: forced SSE, no automatic retries, and text-only requests. Other generation/image/classification methods are denied. It is an acceptance-only capability, NOT the operational OAuth refresh implementation.
- The actual installed provider uses zstd-compressed request bodies. The first integration candidate correctly refused that unhandled encoding before dispatch. The final candidate validates the decoded request while sending the original compressed bytes. Rejected v2/v3 evidence remains preserved; neither used a live provider.
- Four tests passed, including the actual provider serializer/parser with synthetic OAuth and an injected HTTP failure. Concurrent retries, retained failure slots, API-key/expired credential rejection, sanitized malformed-auth errors, and the eight alternative model-operation refusals were checked.
- Native composition constructed successfully. Its report explicitly records unconfigured operational integrations: GitHub transport, Langfuse, Context7 credential resolver, Antigravity operations, CodexHost, skills and Mail. Hindsight schemas were registered with memory disabled; no personal bank was resolved. DCG was registered fail-closed, not executed in this inspection.
- No original or pilot session data was mounted, no Store/Harness session was opened, and no live provider request was made. **At this historical inspection, all three live attempts were unused; all three have since been consumed and verified.** No launcher or global configuration was changed.

Operational binding sources identified at that checkpoint (subsequently integrated): the frozen `20261030-headless-48a55067` host's `core/auth-storage.ts` exposes `AuthStorage.create(path)` with serialized `modify`; do not replace it with the probe's read-only store for production. The packaged native `CodexHost` needs explicit authorization/transport capabilities, not another Codex runtime. The existing Antigravity adapter uses `pi-antigravity` search/image operations plus its account resolver. Legacy MCP's `openConfiguredDurableMcp` returns an extension, whereas the new factory requires per-session sources; preserve configuration/disabled policies and current identity checks at that adapter boundary. Do not import mutable global package trees or activate Nico to bypass this missing binding.

Evidence: `acceptance-native-v4/evidence/{tests.log,native-inspection.json,inspection-manifest.json}`. Do not rerun the completed inspection against its existing destination. The subsequent operational bootstrap uses actual trusted bindings and native serialized OAuth lifecycle. The restricted inspection profile was never activated as the production backend.

## Operational bootstrap: offline candidate `host-bindings-v13`

Implemented `operational-host.mjs`, `operational-profile.mjs`, `session-mcp.mjs`, `session-tracing.mjs` and `terminal-launcher.mjs`. The Host uses the installed public Store/server/native-profile exports; the terminal launcher uses `DpiClient` and the installed original-TUI adapter binary. Neither client starts an execution owner or opens SQLite.

The frozen bindings bundle was built in `host-bindings-v6`: 702 inputs, 36 license copies, 3,926,544 bytes, with source/bundle provenance. It includes native serialized credential storage, MCP transport/config/OAuth, Antigravity operations, memory resolvers and session-local tracing. The mutable tracing dependency tree had OTel 3 with incompatible API 1.9; the builder now selects the coherent frozen OTel 2.12/0.223 snapshot and Langfuse 6 distribution inputs. Source installations are read-only build inputs, not runtime dependencies. Rejected v3–v5 evidence is retained.

Six unchanged core-binding checks passed in v6: cross-process serialized credential modifications; MCP trust/disabled/exposure policy; actual loopback MCP transport; isolated tracing exporters/parents/shutdown without a global tracer; disabled memory resolution; loading without ambient installations or credentials. The compiled bundle and compiled-boundary hashes were reused rather than rebuilding/retesting that boundary.

Final focused command (Tern `60297045868546`):

```sh
python3 experiments/sdk-host-cutover/check-host-bindings.py host-bindings-v13 host-bindings-v12
```

**9/9 PASS**, recorded in `host-bindings-v13/evidence/{RESULT.json,tests.log}`:

- Actual Store/Harness + HTTP + public SDK: session creation, native read, permitted bash, a real DCG denial, `mcp_status`, model/tool inventory, close/reopen and same-key reconciliation without another generation.
- Operational CLI rejects missing credentials before storage/auth-file creation.
- Enabled native Hindsight binding recalls and asynchronously retains the admitted user/assistant turn through a synthetic loopback endpoint. This exposed and fixed the resolver's optional `cfg` handling on the retention path; request-only testing would have missed it.
- Independent MCP sessions, disabled/hidden policy, visible unavailable-server status and live configuration revocation.
- Missing Mail identity causes no network request or registration. Existing synthetic identity works through the real transport, rejects foreign actor/project and revoked grants, and keeps its proof out of status.
- CLI parsing, newest Host session within exact cwd, exact-ID/no-alias checks, refusal to replace an unavailable model, and explicit same-key new-session reconciliation. These selection tests are unit fixtures, not installed-TUI/live acceptance.

The native manager's existing degraded-startup behavior is preserved: an unavailable MCP server is reported as failed while other servers remain usable. Such failures also enter the profile inventory; registration or disabled configuration is not silently invented. At v13, new-session Mail provisioning was still missing. It was subsequently implemented and verified in v14/v15 and used by actual new sessions; the selected copy retained its existing identity.

CLI behavior is explicit: `--session` accepts an exact Host ID, not an old SQLite path; `--continue`/`-c` selects the newest Host session for the current cwd, never scans originals; no arguments creates using the exact server default. `--retry-new` reconciles the retained creation intent. Legacy extension/MCP selection flags, `--listen`, headless print/JSON and positional prompts are refused, not forwarded or silently redirected.

All focused runs used isolated networking, fresh HOME, synthetic data/credentials and the actual read-only DCG binary. No personal memory bank, original/candidate session database or real provider was used. Existing accepted terminal/iii/import/restore evidence was not rerun.

## Archived live admission checkpoint (v13; superseded)

ONE persistent ledger is now designated:

`/home/ubuntu/.local/share/pi-durable-host/releases/c0019d7-dadd5534/live-acceptance-ledger`

It is mode `0700`. It was initially empty; it now retains **3/3 provider reservations** with separate passing results. Do not delete reservations or choose a different ledger on failure/restart. Private `LIVE-PREFLIGHT.json` (mode `0600`) records the exact v13 bootstrap hashes and the three authorized stages; it is NOT a complete activation manifest or GO receipt.

Before live startup, a scope decision was pending. Existing Hindsight settings have `autoInject:none`, `retainSessions:true`, default auto-seeding, `autoUpdate:true`, and `codebaseSurvey:false`. Native startup may read/configure its bank and launch seeding; completed turns can retain data. Those effects were not implicitly covered by the three pi-durable provider checks. The operator subsequently explicitly authorized existing-bank use with memory enabled. No Hindsight exclusion was applied; native recall/retention remained enabled in live and operational profiles.

The configured Langfuse mode is `problems`; the installed Host tracing bridge is metadata-only and intentionally does not serialize messages, tool arguments/results or error text. The new exporter is tested offline, not against the real collector.

**Current status: terminal/selected-copy/iii live checks PASS; Mail provisioning PASS; immutable Nico-backed operational Host and default SDK launcher ACTIVE; post-switch new/continue TUI checks PASS.** Nico added one nine-line dependency compatibility patch beyond the accepted artifact's two existing patches; its changed boundaries passed 9/9 isolated checks and live metadata/read-only verification without new generation. Existing legacy processes, original databases, global MCP configuration and frozen team were not modified by cutover. No commit, push or publication occurred in this solo stage. BB remains outside this completed scope.
