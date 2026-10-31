# Unified reload integration checkpoint — 2026-10-30

## Status

Source integration and final installed-candidate checks are complete. The authorized one-time Host cutover must run **after this self-hosted conversation becomes idle**, not from an active tool call. This checkpoint does not claim that activation already happened.

- Candidate: `/home/ubuntu/.local/share/pi-durable-host/releases/c0019d7-unified-reload-20261030`.
- Previous active release: `c0019d7-delm2`, PID `537577` at preflight.
- Final cutover verdict (written by the independent, non-model cutover process): `/home/ubuntu/.local/state/pi-durable-host/cutovers/20261030-unified-reload.json`.
- Working/evidence directory: `/tmp/reload-final-stage-SdSLAP`; `cutover.log` and `cutover-result.json` hold the one-shot execution result. A Rex cutover pane displays the result for the operator/SnowyMill.

Read the verdict before reporting an active release/PID. `activated` means native metadata/history/schedule checks passed; `rolled-back`, `rollback-failed` and `not-started` are not success.

## Integration

One transport-independent `reloadDurable` owns the per-Harness fence, persisted-task scan (including pagination), candidate model validation, preparation and publication. Store delegates to it; HTTP `/runtime/refresh` and `/reload` are aliases. SDK retains `runtime-refresh.v1` and adds `profile-reload.v1`; the terminal refreshes remote catalogues only. There is no second Host loader/runtime.

DeLM late binding uses the same staged operation. Preparation does not install a service or replace document readers. After all preparations/model checks succeed, a native apply phase selects the prepared DeLM extension on the same Harness; synchronous publication joins the protected native base and publishes its readers. Existing root instructions, model, binding/rebinding guards, disable/revoke checks and native work wait/wake remain intact. Ordinary reload rejects active/background native tasks; it neither aborts work nor restarts Host.

Antigravity registration reuses the frozen provider transport and reads local account/cache data without discovery-time auth/network writes. Exact saved model IDs are validated, never substituted. Nico session transport and its bundle are byte-identical to the active release; native guards/memory remain in the existing profile. The pinned DeLM engine is also unchanged and carries its MIT license/provenance.

Arbitrary Pi ExtensionAPI compatibility is not claimed. Native adapters must be trusted/resource-free, with synchronous nonthrowing publication.

## Final evidence

All tests use temporary HOME/data directories, faux providers and local endpoints. Operational suites use separate HOME directories; no live model calls, personal memory banks or production-data fixtures are used.

Source checks:

- Shared package, backend, SDK and terminal adapter builds: PASS (`/tmp/reload-{shared,backend,sdk,terminal}-build.log`).
- Combined native/HTTP/refresh/model/guard/memory/composition/shared-package/Antigravity checks: **38/38 PASS**, `/tmp/reload-final-source-tests.log`.
- Pinned-engine DeLM checks, including native-profile preparation failure/rollback and both API aliases on the same Harness: **12/12 PASS**, `/tmp/reload-delm-final-tests.log`.
- Terminal remote-controller regression: **1/1 PASS**, `/tmp/reload-terminal-tests.log`.

Final archives were installed from scratch in `/tmp/reload-final-stage-SdSLAP`, without source package links. Tests were adapted only to package export paths, and executed against those installed bytes:

- Reload/HTTP/terminal catalogues: **8/8 PASS**, `/tmp/reload-installed-profile-tests.log`.
- DeLM, with the release's engine, installed native SDK and the pinned board scripts: **12/12 PASS**, `/tmp/reload-installed-delm-profile-tests.log`.
- Nico CodeMode transport/reopen/replay: **6/6 PASS**, `/tmp/reload-installed-nico-session-mcp-tests.log`.
- Operational read/bash/guards/memory/reopen: **3/3 PASS**, `/tmp/reload-installed-operational-profile-tests.log`.
- Service startup/shutdown/reopen and owner-lock refusal: **2/2 PASS**, `/tmp/reload-installed-operational-service-tests.log`.
- Antigravity bootstrap/provider/frozen protocol: **8/8 PASS**, `/tmp/reload-installed-antigravity-tests.log`.
- Native schedule reopen with identical task/doc/request IDs, and revoked schedule admission: **2/2 PASS**, `/tmp/reload-installed-schedule-tests.log`.
- Separately installed standalone shared-package consumer, actual SQLite/Harness in-place dispatch: **1/1 PASS**, `/tmp/reload-standalone-final-test.log`.

That is **42 final installed/consumer checks**, not the candidate's historical test count. The relocated immutable release also passed its actual service startup/reopen/lock-refusal smoke (**2/2**, `/tmp/reload-final-release-service-test.log`); all 21486 release files match the tested stage, including 356 compiled package files compared to the current build. Backend packaging bundles only the local companion and Jiti. Durable/pi-ai/Chord are exact 1.4.0 peers, so native definitions share the consumer's SDK instance. `.npmrc` retains source-install `install-links=true`; stale local npm lock metadata was reconciled before packing.

Archive SHA-256:

- backend: `0e20c5f2782df6354e2f32da38fa8d020514fd8a270cbd3b550db7d2f5a70137`
- SDK: `8f4e234125ffc90b250ca53f033131153d26538e500b550933b9753f0e3de16c`
- terminal: `9fd63e6437ed9976dada8164a9b2f7878bc4c4b6926265d2839aa47b111dea5e`
- shared package: `b009195b0af583efa5d60af2a6c11c9e4dd794bd3ea16aa5ee7edaf0d8ff8c7d`

## Cutover safety and remaining acceptance

Read-only preflight found 33 sessions, 38 agents and 4333 existing history entries; all were available. Device default remained `openai-codex/gpt-6.1-sol`. Existing session/agent IDs, exact models/thinking levels and history-record hashes are captured without exporting message content or credentials.

The executing chat itself owns foreground native tasks in this Host. The cutover process therefore waits up to five minutes for foreground work to finish, and refuses a competing PID/override change. A pre-existing sleeping background `durable.schedule` is retained through native recovery, not cancelled; its task ID and input hash are compared after startup. No live model request is submitted by the cutover.

The old release and original service unit are retained. Only a narrow new ExecStart drop-in selects the candidate. A startup or post-switch metadata/history/schedule failure moves that drop-in aside and restarts the previous release; it does not restore/edit databases, credentials or model selections. Unit backup: `/tmp/reload-final-stage-SdSLAP/rollback/pi-durable-host.service`.

SnowyMill's staged `c0019d7-delm3-hot` is not activated over this candidate. The existing eight-worker live DeLM acceptance remains SnowyMill's work after a successful cutover verdict; no worker bootstrap, duplicate session, commit, push or publication is performed here.
