# R1/R2 — accepted local correction

Independent gate `cc1a0f69a58346f8ba70320454d27ee8` DONE916; owner Carol released the source freeze at915. Alice explicitly resolved original R1/R2 FAILs at911/912 only after the independent proof. Original rejected-candidate RED evidence and external probes were not changed.

## Exact replacement

- Full 410-package-source/eight-lockfile manifest: [CANDIDATE.json](CANDIDATE.json), SHA-256 `b4963709231af96905cddc64043715849c3e09aeebc2b08dbab9f7ade08b166b`.
- Source map SHA-256: `bef24f3123448562b54f2cb034b3fd954121ecac980dd389c20322c2f657b4a5`. All eight locks unchanged.
- Runtime changes: `apps/dpi-backend/src/store.ts` SHA-256 `240779f90378d270e04009fb75869914fbd7dc3615e8cc83db0806a4cc1409f6`; `apps/dpi-backend/src/public-projection.ts` SHA-256 `7d18aa7cb74adeaf263751f9aef6ff92851d8b79522008fe71fdf2ff1c678011`.
- Four changed/retained regression paths and their hashes are in the manifest: public-projection.test.ts, compaction-failure-http.test.mjs, store-ownership-regression.test.ts, inspect-overflow-regression.test.mjs.
- Backend archive: `/tmp/alice-r12-local.ZxsS8T/artifacts/dpi-backend-0.1.0.tgz`, SHA-256 `fe333c18dbd8f209a172a2fa8ba6cca47e128b4877c03fee96d66441ca5dc77a`.
- Compiled fixture: `/tmp/alice-r12-local.ZxsS8T/host/node_modules/dpi-backend`, exactly282 fresh archive members. Existing dependency closure copied; no dependency installation/download or runtime activation.
- Independent report retained byte-for-byte: [REPORT.md](REPORT.md), SHA-256 `19f5e1421d3072a24111dc9780de3acd23603c87fe464500178040a57f289d87`.

## Recheck the unchanged external reproducers

```sh
bash /tmp/alice-r12-local.ZxsS8T/sandbox.sh node --test /review/independent-boundaries.test.mjs
bash /tmp/alice-r12-local.ZxsS8T/sandbox.sh node --test /review/inspect-overflow.test.mjs
```

The separate runner readonly-mounts the replacement as `/candidate`, the original review directory as `/review`, and selects compiled modules using `REVIEW_BACKEND=/candidate/host/node_modules/dpi-backend`. It does not edit the original runner, original backend or external probe. Probe hashes are respectively `0cc4fd86cc6ec3272aafdac0f7572ee06b6dfe07a0b8df5da5f8815c81d4ead9` and `c92e4285afb5b07597a6cc4580279051a46b5ca48d654b30914c8714a2265488`.

## Actual accepted evidence

- Unchanged compiled boundary probe: **2/2 PASS**, all duplicate-owner and compaction leak booleans false.
- Unchanged compiled overflow inspection: **1/1 PASS**, inspectLeak/activeTasksLeak false, pendingGenerationCheckpoint true.
- Corrected backend full suite once: **127/127 PASS**, then the newly retained overflow source test separately **1/1 PASS**. This is not a full128 run.
- Actual compiled preservation/regressions: **16/16 PASS**; full strict backend source/test typecheck exit0.
- Healthy opaque application/tool JSON, private native history, actual task IDs/status, concurrent ownership exclusion, normal close/reopen and stale-process SIGKILL recovery were preserved.

Canonical ISA status is **51 PASS / 2 PARTIAL**; all53 frozen criterion texts/order and exact six-column strategy/thresholds match the approved input. Literal cross-process ISC-1 and the additional same-process ownership regression remain distinguished. Original all53 review and older terminal PTY/latency/mixed-version evidence are not relabelled as new full runs on this correction.

## Limits

LOCAL ONLY. No commit, push, public checkout/GitHub update, installation/activation, new worker/model, host restart, deployment or production migration was performed. Real selected historical/cross-version migration/restore (ISC-39/40), full running-BB UI, arbitrary plugin compatibility and production remain unverified; BB `/compact` remains unsupported. This report closes the supplied R1/R2 repair batch, not those remaining limitations.
