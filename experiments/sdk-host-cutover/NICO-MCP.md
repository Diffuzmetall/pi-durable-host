# Nico MCP: active Host integration and updates

## Active route — 30 October 2026

The terminal and iii use the single native Host in `~/.local/share/pi-durable-host/releases/c0019d7-nico2`. Only the Host service's executable route changed. The SDK terminal launcher and iii adapter still use their unchanged `c0019d7-sse1` client packages. Ordinary Pi and BB were not switched.

The persisted profile remains `native@1`. Native CodeMode, Store/Harness/SQLite ownership, Mail identity/authorization, model IDs, thinking settings, credentials, DCG and memory bindings remain in place. Nico supplies session-scoped MCP connections; it does not own another agent runtime or replace CodeMode. The old manager is not instantiated alongside Nico in an active Host session.

Native global/trusted-project definitions take precedence over overlapping ordinary-Pi adapter entries. Adapter-only servers are added. No shared MCP configuration was rewritten. CodeGraph and context-mode remain enabled; paper and shadcn remain disabled. Discovery found 11 connected servers, the pre-existing degraded Timeweb connection (`needs_auth`), and both disabled entries. All previous tools survived; apify-catalog added four tools.

### Evidence and limits

- Offline: **9/9 PASS**, network-isolated, synthetic HOME/data/providers, no real credentials/history mounted. Final evidence: `/var/tmp/nico-host-check-ru9k186u` and the release's `nico-check-evidence/`.
- Same native database: old manager → Nico → old manager, native CodeMode through SDK, saved-request replay without re-sending an MCP effect.
- Live: three sessions/four conversations idle; complete entry hashes and model/thinking configurations preserved; all four SQLite locks belonged to one Host PID; all three consumed provider reservations unchanged.
- Live discovery plus read-only Mail health/context-mode statistics passed. After activation, SDK inventory retained all tools and exposed the four new apify tools.
- Selected-history SSE delivered its 3,089,294-byte snapshot and all four optional documents. Signed iii reads retrieved the previous checksummed answer after restart. **No new model calls.**
- Private current authority: `~/.config/pi-durable-host/nico-cutover-2/{ACTIVATED.json,after.json,live-mcp.json,route-verify.json}` and the running service route. `NICO-RELEASE.json` is an immutable staging record; its `activated:false` is not live status.

Timeweb was already degraded and was not repaired or declared accepted. Native provider-token refresh remains unchanged. The optional native MCP OAuth reader is read-only: expired tokens fail visibly; no login, token import or refresh/resend fallback is added. No current effective native MCP definition enables that OAuth path. Full tracing payload/collector parity remains unaccepted. BB and bulk-history migration remain excluded.

## Dependency and patch boundary

The accepted dependency is `pi-mcp-adapter@7.0.0-durable.3`, based on upstream v7.0.0 commit `b41f334da85b7608f3ff9e64e41b675e2f5d51f0`.

Its accepted archive SHA256 is `3f044ee3ffa5aed8423efb69f4de2ff6d0953b5abc58d9ec41f2693cf696da56`. That archive already contains two patches: headless/read-only OAuth integration and single dispatch. Their hashes, installed patched-file hashes, bundled inputs, dependency versions and licenses are recorded by `build-nico.mjs`.

**One additional patch adds nine source lines:** `nico-null-const.patch`. Railway advertises a schema branch `{const:null, nullable:true}`; Ajv rejected it because `nullable` had no explicit type. The patch gives this exact schema the equivalent `type:"null"` on a private validation copy. It does not broaden accepted values, modify advertised schemas, bypass validation or change Railway. It uses `json-schema-traverse@1.0.0`, already present in the bundled dependencies; no new package was installed.

The unpatched candidate failed live tool parity and was not activated. The original Host was restored and checked. An isolated regression then reproduced the failure (8 pass / 1 fail); the patched candidate passed 9/9, including rejection of an invalid argument before dispatch and unchanged advertised schemas.

The patch is applied with **zero fuzz** to a fresh build-local copy. Installed Nico, the accepted archive and the read-only source candidate are never edited. There is no copied, diverging Nico framework. The Host facade is `nico-session-mcp.mjs`; the dependency patch is separate and can be removed when upstream handles the case. Upgrades still require rebasing/removing the two existing artifact patches: this is not a promise of patch-free `npm update`.

## Update procedure

1. Prepare an explicitly reviewed/pinned Nico candidate outside read-only installations. Preserve its artifact, patch and source receipts. Do not update an active release in place or silently select another version.
2. Build to a **new** directory:
   ```sh
   node experiments/sdk-host-cutover/build-nico.mjs CANDIDATE_DIR NEW_BUILD_DIR
   python3 experiments/sdk-host-cutover/check-nico.py NEW_BUILD_DIR
   ```
   Inspect the resulting provenance. A failed patch application stops the build. If upstream now handles the null-constant schema, remove the separate compatibility patch/build hook deliberately and keep its regression check.
3. Require passing isolated checks for same-profile replay, native CodeMode, config/auth precedence, Mail identity, revocation, single dispatch, schema validation and lifecycle. No extra live provider check is authorized. Reuse unchanged backend/client evidence.
4. Stage a **new** sealed release:
   ```sh
   python3 experiments/sdk-host-cutover/prepare-nico-release.py NEW_BUILD_DIR PASS_EVIDENCE_DIR NEW_RELEASE_NAME
   ```
5. Create a new mode-0700 private evidence directory under `~/.config/pi-durable-host/`. Capture current native readiness with `nico-state.mjs PRIVATE_DIR/before.json`. Then run `activate-nico.py NEW_RELEASE_PATH PRIVATE_DIR`. It checks the actual owned service and exact preimages, requires idle tasks/inboxes, stops gracefully, refuses remaining locks, probes discovery without a parallel Host manager, and changes only the Host service route.
6. The iii worker has `Requires=pi-durable-host.service`: stopping Host also stops that dependent SDK service. Restore its previous active state after either activation or rollback; the activation helper now includes that step. Do not restart the engine or alter worker configuration. Run `verify-operational-route.mjs PRIVATE_DIR/route-verify.json` to check large SSE and the retained signed iii answer without generation.

On a parity failure, the helper restores the exact previous service route and checks native state. If readiness, ownership or a preimage changed, stop rather than steal locks or overwrite another update. Retain failed evidence. Never restore database snapshots, re-import history, remap profiles/models, or delete provider reservations as part of an MCP rollback.

The first live rollback and the final service/dependent-service recovery were exercised. The dependent-service restoration was added to the helper after that observed `Requires=` behavior; the final deployed route was verified directly, not by performing another unnecessary cutover.

This local change is not committed, pushed or published. Private operational evidence, server bindings, credentials and identity files must not enter the public checkout.
