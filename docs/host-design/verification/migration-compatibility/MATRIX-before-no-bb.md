# Migration acceptance matrix — new scope after public `0c49efba`

Status: **IN PROGRESS; real-session migration NO-GO pending technical evidence. One real-data copy pilot is explicitly APPROVED** by «да переносим тестируй». Source class is the **current launcher-selected installed Pi Durable with history**, not the coexisting older installations. Bob selects/snapshots one unambiguously inactive session; Dave independently checks evidence under `43707c9d5bd74c48a072ccefe6e61b41`. No repeated copy-test consent is needed.

Previous 214 tests, the binary-overlay BB gate and public delivery remain valid in their recorded scopes; they do not prove source-build or real migration readiness. Source-build/install matrix task remains `af010781c0ad4ae6822de52337aaeb1d` (Dave).

## Concrete boundaries observed without opening session data

| Source or target | Observed boundary | Migration meaning |
| --- | --- | --- |
| Installed BB provider `0.2.29` | Actual Durable **1.2.0**, coding-agent 1.2.0, plugin-sdk 0.6.15 | Coexistence metadata only; **not the approved pilot source**. Do not inventory/copy its session stores under the current approval. |
| Retained runtime `pi-durable-1.3.0` | Actual Durable **1.3.0** | Coexistence metadata only; **not the approved pilot source or automatic rollback runtime**. |
| Current `pi-durable` launcher | Selects `20261028-4rmMfRfc`, actual Durable **1.4.0**, explicit release-local `local-host` extension and import rebinding | **Approved source class.** Pin the chosen copy's saved contracts separately; current package version does not establish its creator version or host catalog/profile compatibility. |
| Installed TUI session selector | CWD-hashed `durable-sessions/.../session.sqlite`; directory lock; no host catalog/formal profile ID in this selector | A copy into host `dataDir` is not an importer. IDs, original layout and complete dependent state need an explicit transition route. |
| Candidate backend | Durable 1.4.0; factories `minimal@1`, `playground@1`, `native@1`; catalog contains DB paths | Do not assign `native@1` to an unknown old session or let a copied catalog reopen source paths. Bob supplies confined-copy fixtures; Alice owns Store changes. |
| Installed BB app | **0.47.1**, Node engine `^22.19.0 || ^24.0.0 || ^26.0.0` | Node 24.19.0 is present. Source-built artifact and its prescribed dependency/toolchain closure still require Alice's actual build. |

Pinned public Core source `get-bb/bb@5e1acd765039e874643f34c4d35409e58484e408` requires **pnpm 9.15.0** and **Node >=22.19.0**. Independently hashed Alice's public source tar (`c6e0f48b…`), root package (`1df41067…`) and upstream lock (`54fd6025…`); no duplicate checkout/bootstrap or lifecycle execution. These are input/prerequisite checks, not build acceptance.

Exact manifest, launcher, resolver, lock and source hashes are in [`INVENTORY.json`](INVENTORY.json). Metadata collection read package/source files only: no DB connection, installed registry execution, auth/config read, provider call or installed mutation.

### Saved definitions must not be silently dropped

A deliberately limited static scan of the selected 1.4 extension lane found 34 literal `(kind/name, version)` pairs versus 39 in candidate native-profile source, 31 common. These installed declarations have no matching literal anywhere in candidate backend source:

- `durable-goals.goal@1`
- `local-host.goal-check@1`
- `local-host.goal-check-requests@1`

This is **not** evidence that any particular live session uses them, nor an exhaustive registry/schema validator. If the approved snapshot requires one, matching continuation must be implemented and tested or migration must refuse; deleting saved tasks/docs or creating an empty substitute is not success. Version differences alone do not establish incompatibility: candidate migrations need concrete saved-state tests. In particular, the launcher's selected 1.4 extension lane already declares `durable.schedule@2`; an older unselected source tree is not that registry.

## Acceptance evidence and remaining gates

| Required evidence | Current result | Exact next producer/input |
| --- | --- | --- |
| Runnable public-source Core build | **PENDING**, not replaced by old binary overlay | Alice `5945c98034cc468ebac8d5ce49be4aa7`: pinned source + both patches + lock/toolchain hashes + runnable immutable artifact. Dave then checks disposable clean-HOME installation/correlation. |
| BB end-to-end delivery and supported wait behavior | **PENDING** in new scope; original 25-second UI outlier retained | Carol diagnosis `4f007ec85fa84083974c0d98501f7a20`, then source-built Core/Chrome gate `3d4dc10b18b642618f8f13d8a61bdb41`. No invented production SLA or timeout-only workaround. |
| Concrete source→candidate resume | **PENDING**, old same-version playground copy insufficient | Bob `8ad3d57be3594c67ac51a949d72d870a`: declared runtime/registry/model/task/doc fixtures, stable IDs/children/history/pending effects, no unsafe replay. |
| Confinement, sole owner, complete backup and original-runtime rollback | **FAIL on generated fixture**, independently recheck after repair: raw copied catalog opened the original absolute DB | Bob publication `09120008d5274da28206fd9606fa5ffb` / `migration-readiness.test.ts` copied-catalog case EXIT1. Alice owns the Store confinement fix; Dave then executes the corrected transition/restore paths. No real DB was involved. |
| Selected real-copy rehearsal | **COPY PILOT APPROVED; execution evidence pending**, not a migration GO | Bob owns minimum current-install metadata inventory and selection of one unambiguously inactive sample, excluding main, four DeLM actors and live owners. Record source/session/release fingerprint, quiescence, full snapshot scope/destination BEFORE copy; directories private 0700. Unknown/ambiguous selection goes to Main with exact alternatives, not another generic permission request. Candidate runtime remains blocked until Store confinement repair PASS and independent no-original-path/no-external-network isolation. |
| Production activation | **NOT AUTHORIZED** | Separate explicit decision after selected-copy success; not automatic even after all disposable checks pass. |

Until these inputs arrive, supported migration source/target is **not yet declared**. Artificial fixtures may establish a narrow technical compatibility route, never a real-data GO. This matrix will be updated against exact immutable producer artifacts; unchanged terminal/iii/native suites are not rerun for reassurance.

## Operational boundary

At this matrix checkpoint Bob has not yet handed off a selected-source or snapshot manifest; Dave has not selected/opened/copied any session. The copy approval does not authorize owner stops, source checkpoint/schema writes, all-history migration, credentials/private banks/live models, private payload export or production activation.

The coherent copy must expose saved profile/registry definition and model references privately, not merely current configuration or a directory name. Before candidate auto-resume, unknown/incompatible definitions or unsafe pending effects must refuse; static inspection or simulated continuation must not be called an actual migration PASS. Rollback restores an untouched complete original backup with the exact original runtime/profile, never downgrades a candidate-mutated SQLite database.

The pilot verdict records five distinct results: **(1)** coherent snapshot/source unchanged; **(2)** saved task/doc/model/profile compatibility; **(3)** IDs/history/children/pending-state preservation; **(4)** actual controlled candidate continuation or exact blocker; **(5)** original-runtime restore from untouched backup. Board/public reports carry only locators, counts, hashes and outcomes; no real DB payloads or raw transcripts.
