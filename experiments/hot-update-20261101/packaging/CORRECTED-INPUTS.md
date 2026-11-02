# Corrected offline packaging inputs

Owner: Alice. Task: `34bec032681f42c89456f42c242e3316`.
Scope: recipe preparation only, not final S6 build or installed acceptance.
Production activation NOT RUN.

## Change

`experiments/sdk-host-cutover/prepare-restart-candidate.py` now requires the exact corrected Nico dependency from `experiments/hot-update-20261101/mcp-source/build-observer`.
It validates the independently reviewed bundle and provenance digests before creating the destination. Missing files, modified bundle/provenance, and symlinked dependency inputs are refused. No install, resolution, rebuild, or fallback to the defective baseline occurs.

The new copy receives:

- `compiled/nico.mjs`: corrected bundle.
- `compiled/NICO-PROVENANCE.json`: matching build provenance.
- `compiled/nico.mjs.LEGAL.txt`: matching legal notice.
- `compiled/nico-dependency/`: replacement license/schema sidecars, not stale base sidecars.
- `gippity/audio-host.mjs`: newly required voice module beside integration.

The recipe freezes dependency build inputs and the voice module in `sourceFiles`. The candidate manifest records `nicoBuild` and corrected dependency/compiled provenance, rather than claiming that all compiled bundles were preserved unchanged.
Other compiled bindings remain copied from the sealed base. Only fresh candidate paths are replaced; the old artifact is not modified.

## Verification

RED command:

```sh
python3 experiments/hot-update-20261101/sandbox/run.py --repo "$PWD" -- python3 /repo/experiments/sdk-host-cutover/restart-packaging.test.py Packaging.test_corrected_nico_overlay_keeps_base_and_records_provenance Packaging.test_gippity_private_closure_keeps_one_shared_durable Packaging.test_modified_or_missing_nico_refused_before_destination_creation
```

Evidence `/tmp/hot-update-sandbox-mplrxtvh/run.log`: isolation PASS; two failures and one error reproduced the stale Nico, absent audio module, and missing fail-closed admission. Exit 1.

GREEN command:

```sh
python3 experiments/hot-update-20261101/sandbox/run.py --repo "$PWD" -- python3 /repo/experiments/sdk-host-cutover/restart-packaging.test.py
```

Evidence `/tmp/hot-update-sandbox-7y8niumq/run.log` and `command.json`: isolation PASS, all eleven recipe tests PASS, exit 0.
Tests use synthetic dependency bytes with fixture-local pins; they prove packaging behavior, not execution of the actual Nico dependency. Existing Node physical-path and package-resolution probes run inside that sandbox.

A separate AST/read-only digest check confirmed that the real recipe pins match the actual independently reviewed build-observer files:

- Bundle: `4ac012202ca81685dd1e21fb1a7aa665cfe30a2b42cc08c37214118a89caca52`.
- Provenance: `e4f780e57e6f4a62d7860a26f21be89a7cab1a3336f3d4e137c6dcfc2255e10d`.

Scoped `git diff --check` PASS.

Final source hashes:

- Recipe: `eaff9cde3fc9b445007b17537fc456e5b5afa83b139c6fcd0a4c6ad5f10e967c`.
- Tests: `bd0c1878b98dbf66f9b11e2ce6898ca30f2847fd9c589d7066934efe6be03006`.

The earlier sealed alice-v2 manifest still hashes to `672b7e5e746dcabfbf5ca82a571cd35f328e457f717b64e2b852b3afa3931665`.

## Remaining gates

No full new Host closure was built. SDK/UI cleanup warning, operational DeLM discard/drain propagation, source review, S5 aggregation, exact-old-release compatibility, final same-manifest review and installed QA remain separate obligations. This task does not resolve auth/release blockers, change baseline, activate production, or authorize final packaging before its existing dependencies are DONE.
