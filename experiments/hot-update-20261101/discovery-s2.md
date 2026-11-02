# S2 discovery checkpoint — Bob

Source integration PASS; final immutable installed acceptance NOT RUN.
Production activation NOT RUN. No live Host/session/release/credentials were changed.

## Reuse chain

Old ResourceLoader/settingsManager.reload and per-PromptInput discovery → existing selected native skills/package/context resolver → settings snapshot captured at profile creation → prepare/publish the existing read-only resolver settings through the existing session reload.

The integrated RED was `/tmp/hot-update-sandbox-4i6m8ena/run.log`: SDK reload left a disabled skill in A's catalogue. Carol wired `options.skills(context)`, `skills.prepareReload`, synchronous publish, `readResourceSettings` export and operational callback in the shared profile. Resolution `2edb4558ed1e4ce29e196643d920cfc2`; S1 DONE revision194. Bob did not edit shared profile/Store/operational-profile in this slice.

## Delivered boundary

- `readResourceSettings({agentDir,cwd,projectTrusted})` reads only discovery fields of existing settings files. It does not write/install/download, expose unknown settings or open untrusted project settings. Invalid JSON/shape, foreign canonical paths, file symlinks and oversized files are refused with content-free errors.
- `skills.prepareReload({globalSettings,projectSettings})` validates the candidate catalogue, rejects diagnostics/incomplete packages, then returns synchronous `publish()`. Failure leaves previous settings active.
- Existing prompt/context and skill readers still read current files per request. No watcher, global fan-out, generic revision manager or installer was added.
- Server-owned native adapter callbacks remain separate from Pi ExtensionAPI resource declarations. Their current-session installed count changes through the same SDK reload. Explicit tool/extension selection compatibility belongs to S3; no automatic capability grant is added.
- Existing native Goal documents retain their admitted body after skill modification, disable-on-reload and reopen; a different session retains its own catalogue/context.
- Per Carol request `4eed03ff36844de9a44ce4ef3b21a4ba`, GipPity no longer pushes an extension after `registry.install`. Native composition now owns its array through one registry subscriber. The isolated GipPity fixture mirrors this existing native subscription; Generic minimal composition was not changed.

## Verification

Every runtime command below passed the physical sandbox negative self-check first. Exact argv/mounts are retained in each directory's `command.json`.

1. `/tmp/hot-update-sandbox-k214tdi9/run.log`: **10/10 PASS**, then backend strict typecheck exit0. Real Store/Harness/SQLite/HTTP/SDK with synthetic credentials and faux model. Covers settings/catalogue and next prompt, add/change/remove skills, adapter installed-count add/remove, malformed JSON, missing packages/no installer, untrusted roots, foreign directory/file symlinks, A/B isolation and pinned Goal body through disable/reopen.
2. This source command uses Node `registerHooks` to map `@local/pi-durable-reload` to `/repo/packages/durable-reload/src/index.ts` and preserve backend SDK identities. Backend typecheck maps that package to fresh dist declarations. The checkout's physical dependency remains old; final packaging must replace it. This is source-path evidence, not installed R4 acceptance.
3. `/tmp/hot-update-sandbox-y50nzq5v/run.log`: **2/2 PASS**, exit0. Actual Component SDK/Harness/HTTPS loopback/browser-send path, shutdown/listener release and reopen. New integration source uses the immutable alice-v2 candidate's physical dependencies via a sandbox-only resolution hook. No vendor/audio/OAuth network calls. This verifies the registry-array adjustment, not hot voice-handler replacement U18.
4. Initial GipPity probes failed safely: `/tmp/hot-update-sandbox-3r0dflm3` could not resolve checkout dependencies whose files point outside the sandbox; `/tmp/hot-update-sandbox-9w8erayv` lacked system OpenSSL configuration. No production mount fallback was used. The final probe uses disposable candidate dependencies and explicit `openssl req -config /dev/null`.
5. `/tmp/hot-update-sandbox-xw8we19k` exposed a fixture mistake: the per-agent demo add-on endpoint is not the native installed inventory. The corrected fixture checks the existing reload response's installed counts, without adding a protocol or changing selection.
6. `git diff --check` passed for Bob's changed discovery/tests/GipPity paths.

S1 adapter loader bad-import/transitive/duplicate/guard and authorization/close tests are separately attributed to Carol's `core-s1.md`; they were not rerun or relabelled Bob evidence. Final independent Grace/Heidi acceptance must use one newly packaged immutable manifest, including full U01–U20 and rollback/resource census. The old auth incident remains operator-only.

## Source hashes

```text
7dc2d90ab92a78e250b7219466d30ced4b97d49ad15b8fffafacd8983bd97d23 apps/dpi-backend/src/native-profile/skills/index.ts
fb00f022ae81ae971637b7f91a1562124e08cb6672f3af4e3f76c0123c906511 apps/dpi-backend/src/native-profile/skills/upstream/core/settings-manager.ts
b6bcef6100f6aa3742ffe3d195fc4bc429195c10d573c539ab77151f3544e8f7 apps/dpi-backend/tests/native-skills.test.ts
96aab548eca73ffda86b122a2ad8cb022ad2d21f056fb8e250695ca52e8387e2 apps/dpi-backend/tests/native-skills-reload.test.ts
7369d3773c4780c8e5bd39e86c599083cb3e351a84c65829b458612225f13789 experiments/gippity-voice/integration.mjs
bf7b825f27e78e34e668d022e7c30bd76ec686f516d26fa7ae7a7bd1a53b894b experiments/gippity-voice/integration.test.mjs
```
