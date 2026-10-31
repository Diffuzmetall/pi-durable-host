# pi-mcp 1.4.0 candidate and native-manager comparison

## Result — 30 October 2026

**Candidate accepted offline; active Host unchanged.**

- Sealed candidate: `~/.local/share/pi-durable-host/releases/c0019d7-nico-mcp140-v3`.
- Active route remains `c0019d7-nico2` with `pi-mcp@1.0.2` and Nico. No service, launcher, credentials, MCP configuration, SQLite database or grant was changed.
- The candidate retains Nico and native `native@1` / CodeMode. It upgrades only `pi-mcp` to 1.4.0, pins a root npm override, updates both candidate lock records, and fixes one native bridge result-selection expression.
- It is not a switch to a new backend framework, an upgrade of the other native 1.4.0 packages, a BB/ordinary-Pi cutover, commit or publication.

## Package and dependency provenance

Public archive: `https://registry.npmjs.org/@earendil-works/pi-mcp/-/pi-mcp-1.4.0.tgz`.

SHA256: `ce2633c482aed9733d6a863a156da2b504426f0056fd2c3495f9e744d7e56726`.

The package requires Node >=22.19.0 and retains one direct dependency, cross-spawn 7.0.6. No lifecycle script or npm installation was run to stage it. The pinned archive was checked against the tested file hashes. `npm ls @earendil-works/pi-mcp --json --offline` accepts the candidate's override/dependency tree. The previous package is retained as a private candidate preimage, not an active dependency.

Every other original file remains identical except the package, root override/lock records and the single bridge file. The staging receipt verifies 21,435 unchanged original regular files. Package and bridge hashes were checked again in the final sealed candidate; all candidate paths are read-only.

## Changed native bridge boundary

`pi-mcp` 1.4.0 accepts any JSON `structuredContent`, including arrays and null. The previous native bridge used `result.structuredContent ?? result`, which silently replaced explicit null with the entire result envelope. An isolated regression reproduced that exact defect before the change.

The owning source now selects the envelope **only when structuredContent is undefined**:

`apps/dpi-backend/src/native-profile/guards/mcp-codemode.ts`

Regression:

`apps/dpi-backend/tests/native-mcp-structured-results.test.mjs`

Arrays, null, false and zero survive as structured output; absence falls back to the envelope. Model-visible text uses the existing converter. This is a Host bridge fix, not another pi-mcp or Nico dependency patch. The sealed candidate contains the corresponding checked JavaScript expression change; no active installed file was edited.

## Verification

Command:

```sh
python3 experiments/sdk-host-cutover/check-mcp-upgrade.py VERIFIED_PI_MCP_1_4_0_PACKAGE
```

Final isolated evidence: `/var/tmp/pi-mcp140-check-sfyz028f`.

**14 PASS / 0 FAIL**, no skipped tests, fresh HOME, unshared network, synthetic providers/credentials and disposable native databases. No live models, personal memory bank, production configuration or real data were mounted.

Coverage includes:

- Existing nine Nico/operational checks: per-session ownership, native-vs-adapter precedence, hidden tools, authorization/revocation, Mail identity, read-only native OAuth expiry, native SDK/CodeMode and same-database old→Nico→old saved-receipt replay without repeated effects, native read/bash/DCG and synthetic memory lifecycle.
- Large native snapshot and following optional-document delivery.
- New pi-mcp array/null decoding; native bridge array/null/false/zero/absence handling.
- Auth recovery behavior: the new client prevents a resend when cancellation occurs during recovery; a still-active request with configured auth recovery sends twice after 401. Updating the library alone is **not** the no-resend policy.
- Differential characterization of the stock manager versus the accepted Nico route, below. These tests establish replacement blockers; their passing does **not** accept the stock manager.

Backend source typecheck passes against both 1.0.2 and 1.4.0 after the bridge fix. The final candidate package bytes and compiled bridge match the isolated tested override. This is not a new live provider or production route acceptance.

## Stock manager verdict: not a drop-in replacement

The comparison uses the existing frozen native `McpServerConnection` integration with the new pi-mcp library, not a newly invented manager or the current upstream main branch.

| Boundary | Existing native manager + pi-mcp 1.4.0 | Accepted Nico route |
| --- | --- | --- |
| Adapter-only Apify definition | Not imported by native loader; omitted | Retained without changing ordinary-Pi settings |
| tools/call gets HTTP 404 with an established session | Reconnects and sends the tool call again: 2 calls measured | Fails after 1 call |
| pi-mcp transport with auth recovery receives 401 | Retries active request unless the Host prevents it | Existing single-dispatch route prevents resend |
| Current replacement gate | NOT ACCEPTED | Retained in candidate |

The native manager treats the 404 as proof that the server did not execute the request. Our current Host contract deliberately does not infer that an external effect was absent from an error response. The fixture explicitly establishes an MCP session ID before returning 404; an earlier diagnostic without that header did not exercise session-expiry retry and was not used as the verdict.

A later native replacement would require preserving adapter-only configuration and enforcing the same single-dispatch policy, followed by the same identity/configuration/replay acceptance. That work is not silently bundled into this package update. No Nico removal or alternate live manager was activated.

## Why the full Nico features remain unused

- **Semantic search** ranks tool candidates by meaning with a model. Native CodeMode already owns discovery in this route. Turning on Nico's separate search path requires an explicit integration choice and authorization for its additional model work; it is not merely a free transport toggle.
- **Extraction** asks a model to extract selected values from a tool result. It can reduce context, but sends that result to the extraction provider. Our existing boundary returns the original result and admits no extra model calls/data sharing by implication.
- **MCP Tasks** are server-side long-running jobs with status/result/cancel operations. They are not the same as a Durable native task. They can complement Durable, but require persisted remote-task IDs, recovery/result reconciliation, cancellation semantics and current authorization. Our headless route currently uses synchronous tools/call; the full Nico extension's background-task promises are not automatically inherited.

None of these features was enabled, no external model budget was expanded, and no automatic timers/workers were launched.

## Staging and future activation

```sh
python3 experiments/sdk-host-cutover/prepare-mcp140-release.py PASS_EVIDENCE_DIRECTORY NEW_RELEASE_NAME
```

The helper refuses an existing destination, checks tested package/source/bridge hashes, preserves the base release, records exact deltas and seals the new candidate. Earlier staging candidates remain untouched: the first failed moving a read-only copied package directory, and v2 predates the structured-null bridge fix. Use only v3 for the current candidate result.

The operator subsequently authorized activating this candidate with Nico retained. Activation is currently **BLOCKED before restart**: the fresh read-only preflight found eight live tasks, including three active generation tasks in three busy conversations. Nothing was stopped, no unit/launcher was changed, and the active route remains unchanged. Private evidence: `~/.config/pi-durable-host/mcp140-cutover-vaaeunxo/{preflight.log,blocked-state.json}`. No automatic polling, restart timer or task cancellation was created.

`activate-nico.py` now calls the read-only `verify-mcp140-candidate.py` gate when the package-candidate receipt exists, before writing an activation intent or stopping Host. This verifies all 76 package files, the tested bridge, version/override/lock records and the complete read-only seal, refusing external symlinks. The gate passed against v3; activation still requires fresh idle-owner readiness and exact service/config preimages. The existing helper retains graceful one-owner restart, dependent iii worker restoration, post-switch native-state checks and guarded rollback. After a successful switch, run the existing metadata/SSE/retained-answer verifier. There is no authorization for another real model check; all three earlier provider-check slots remain consumed.
