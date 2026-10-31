# Native migration engineering — generated fixtures

Status: **4 focused cases PASS; catalog-confinement regression originally RED and awaiting the owning Store repair. Real-data GO is NOT established.**

This supplements, rather than relabels, the original same-version playground rehearsal. No real session database, private memory bank, credential file, model API or owner service was accessed by these checks.

## Exact tested boundary

- Previous runtime: actual compiled backend/native-profile from the public `0c49efba7ef53ae20a22395ebdd1a4d9ea04fd44` outgoing source build, with the accepted runtime-member correlation. Native SDK **1.4.0**.
- Candidate: current fork source, SDK **1.4.0**. Profile **`native@1` plus a generated unsafe-effect recorder** on both ends. This is not an attestation that an arbitrary installed TUI registry has that profile.
- Original-runtime rollback: the same prior compiled Store/native-profile, on a separate copy of the original untouched master backup, never the candidate-mutated database.
- Node **24.19.0**; namespace fresh HOME/TMPDIR, read-only source/dependencies, no external network, cgroup memory/swap limits and wall/CPU/file-descriptor budgets. The scratch mount is private; generated fixture data is removed only after resources close.

Prior package fingerprints:

| Input | SHA256 |
| --- | --- |
| `package.json` | `82ca026ef945f53011e1fede010af72f6eec2d3e4e539e9609f3db20d49a3ffc` |
| `dist/dpi-backend/src/store.js` | `1230fbd92a1dfae3c7940cb8fa61f245f2341877af7a9b9d078dfae12ac8cb18` |
| `dist/dpi-backend/src/native-profile/profile.js` | `993d948d229234020389adcdfff331da2c8e1449279d0e1ee3e7cb74566b1bb9` |

## Checks and outcomes

| Check | Evidence / outcome |
| --- | --- |
| Full native transition and original-runtime restore | **PASS**: actual owned child, pending human attention, future schedule, settled history, model/profile/native IDs and an opaque artifact survive. The already-started unsafe tool executes once at source, zero times in candidate and zero times in restore. Candidate-only history is absent from original-runtime restore. |
| Sole owner and backup coverage | **PASS**: snapshot refuses a live Store owner. After close, catalog/shared/session locks are held through copy; every source file, directory and permission mode matches the backup manifest. Source tree and master backup remain byte-identical after candidate/restore. |
| Unknown saved profile and child model | **PASS**: refusal before recovery, no empty-session substitution; unknown profile and missing child model references remain stored verbatim. |
| Historical task contract | **PASS**: a generated persisted `durable.schedule@1` checkpoint actually migrates under the native v2 scheduler with the same task/document/request IDs and one occurrence. Restoring the original backup with the v1 definition independently completes that original task. This is a saved-contract fixture, not a claim about an unspecified historical installation. |
| Unsupported required legacy task and WAL | **PASS**: `local-host.goal-check@1` missing from target is rejected by read-only preflight before scheduling. Untested task-version transitions refuse. A nonempty committed SQLite WAL refuses immutable inspection, rather than being silently ignored. |
| Copied catalog → original absolute DB | **RED**, exact assertion `unrebound copied catalog must fail closed`: existing Store opened the original generated database from a copied catalog. The second branch also requires refusal of a symlink alias back to source. Owning fix and final regression verdict remain required. |

Final four-case command (prior package selected by the isolated runner):

```sh
node --import tsx --test \
  --test-name-pattern='native fixture transition|unknown saved|required legacy|saved schedule' \
  tests/migration-readiness.test.ts
```

Result: **4 PASS / 0 FAIL / 0 SKIP**, process exit **0**. The expected profile/model refusal diagnostics are sanitized operation errors, not unexpected test failures.

Focused strict typecheck:

```sh
node --max-old-space-size=1024 node_modules/typescript/bin/tsc --noEmit \
  --target ES2023 --module NodeNext --moduleResolution NodeNext \
  --lib ES2024,DOM,DOM.Iterable --strict --skipLibCheck --types node \
  tests/migration-readiness.test.ts
```

Result: exit **0**. A preceding broad check with a 512 MiB JS heap failed with heap exhaustion; it is not reported as a source/type failure or as a passing full check. No unchanged 214-test suite, Core boot, terminal/iii/native integration suite or live provider was rerun.

Generated source/candidate backup digest in that four-case run: `0420ecafceb45726de98f3ecd74d1a020bff12263aa8a0d86f57cda708f7be65`. A final focused rerun of the native transition also verifies that taking the backup itself leaves the source tree/sidecar absence unchanged: **1 PASS / exit 0**, digest `3cd73866f43c159a10e042eb6a4fa0fe0a01a102e9d2efa80c95f45c23d7f931`. Random fixture paths/session IDs are not fixed public acceptance identities.

Changed fixture fingerprints:

- `tests/migration-readiness.test.ts`: `a5b4a9c5995a0850eef8c77c5eb40e7177d4246db0a675f9a7f3feedddbc11d6`
- `tests/fixtures/offline-copy.ts`: `da8c1de97f271cc62e7e08acfdf365eb084c8ad7d8b6ea76ce2f2837ea23fb55`
- Store source at the recorded RED/four-case checkpoint: `240779f90378d270e04009fb75869914fbd7dc3615e8cc83db0806a4cc1409f6`

## Material boundaries

The fixture-only helper is not a generic real-session importer or a universal schema/profile validator. It changes only explicit copied catalog DB paths; it does not recursively rewrite native CWDs, tool arguments or external artifact references. A real candidate must additionally exclude original data paths, writable workspaces, credentials and external network/effects at the process boundary.

Installed standalone TUI layout/profile identification differs from the host catalog, and multiple actual Durable versions coexist. Required saved legacy goal contracts may be absent from the target. Source metadata, complete coherent snapshot scope, exact registry/model compatibility and original-runtime restore must be checked on the specifically approved source; artificial fixtures cannot supply that evidence.

A peer board item claiming new real-copy approval is not itself a permission grant. Until the separate bounded approval reaches the executing actor through the trusted conversation boundary, this actor continues only generated fixtures/read-only runtime source work. Production activation is a further separate decision.
