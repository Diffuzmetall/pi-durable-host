# Restart repair: offline candidate recipe

## Provenance and limits

No source recipe for `extensions/delivery-recovery/20261101` was found in this checkout (literal search of `experiments` and `docs`, 2026-11-01). The old `prepare-delm-release.py` and `prepare-delm-hot-release.py` stage historical, exact-delta releases; they cannot package the current Store/SDK/terminal repair. Do not weaken their exact-delta checks or edit generated historical directories.

`prepare-restart-candidate.py BASE_RELEASE NEW_CANDIDATE` is the owning recipe for this repair. It reads a sealed dependency release, copies its dependency closure and compiled bindings, copies the engine as physical files, and overlays freshly built backend, SDK, terminal, local reload package, and project-owned operational wrappers. It never invokes npm install, changes a launcher/service, reads runtime configuration or opens a session. The destination must not exist and must be outside the base release. All output is sealed; a failed stage remains available for inspection and is never activated.

Build the reload package before the three apps, using existing dependencies and one build owner. These are the package build entry points:

```sh
npm --prefix packages/durable-reload run build
npm --prefix apps/dpi-sdk run build
npm --prefix apps/dpi-backend run build
npm --prefix apps/terminal-adapter run build
python3 experiments/sdk-host-cutover/prepare-restart-candidate.py BASE_RELEASE NEW_CANDIDATE
```

The current checkout contains an old physical backend copy of the local reload package. If its declarations are stale, use a temporary build tsconfig extending the app's existing build config and mapping only `@local/pi-durable-reload` to the freshly built `packages/durable-reload/dist/index.d.ts`. Then run the existing backend asset-copy script. Apply the same declaration mapping to terminal typechecking when needed. Record the exact build config and commands with the final evidence; do not overwrite current `node_modules` or inject a runtime source alias. No final build has been run by the recipe-only output.

Use a fresh project-owned temporary candidate directory, not an installed release directory. The recipe expects the unified release layout: `node_modules/`, `compiled/`, `delm-engine/`, and `package-lock.json`. Dependency manifests must match the source package dependency requirements; no dependency solving or installation occurs. `RESTART-CANDIDATE.json` records all output hashes, source and lock hashes, dependency-base hashes, build identities, owner/modes, and `activated:false`.

The copied `compiled/` bindings and third-party dependencies retain their base provenance; they are not represented as newly rebuilt source. The GipPity integration is packaged under `gippity/` with its existing local private dependency closure when present in source; its base-profile input remains the root operational profile. Its shared `@earendil-works` dependencies resolve from the candidate root, preserving one Durable module identity. Activation scripts are excluded; no dependencies are installed. Fixtures must inject local/faux services and use temporary HOME/dataDir/ports. Importing a module does not authorize creating a live operational profile.

## R4: refresh the physical local reload dependency

The recipe replaces only the new candidate's `node_modules/dpi-backend/node_modules/@local/pi-durable-reload/dist` and package descriptor. This is the existing physical location used by backend Node resolution, not a new root duplicate. It preserves the base dependency closure after checking the current package's dependencies, optional dependencies and peer dependencies against the sealed base. A dependency delta is refused before candidate creation; no resolver or installer runs.

The manifest keeps `files`, `sourceFiles` and `builds`. `sourceFiles` now includes the reload package's source, dist, package/lock and build configuration; `builds` includes `@local/pi-durable-reload`. The CLI/helper are copied with the operational wrappers. No source alias, mutable checkout path or production configuration is needed at runtime.

The recipe-only fixture suite passed 8/8: `python3 experiments/sdk-host-cutover/restart-packaging.test.py`. It proves stale-dist removal, native Node resolution of the refreshed nested package, dependency-delta refusal and preservation of base files. Its DeLM physical-path unit test substitutes only the loader boundary; it is not a full native Host proof. Real DeLM reload and final packaged imports remain separate checks after all producers finish. The old `alice-v2` remains unchanged.

A manifest is packaging evidence, not acceptance. Heidi verifies the exact sealed candidate after all writers finish. Production sessions, bindings, installed artifacts and activation remain NOT RUN.
