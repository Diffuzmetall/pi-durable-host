# S3 — native compatibility and recovery (Carol)

Source output ready. Independent immutable installed review/QA NOT RUN.
Production activation NOT RUN. No live Host, installed release, production DB, credentials, run binding or global configuration was changed.

## Authorized scope and reuse chain

Task `e2ecd2a81fc043d280fe1ec2c760bc61`, R4 S3; prerequisite S1 DONE194.
Existing Durable 1.4.0 RegistrySnapshot/phase invocation and ToolTask replay semantics → existing reload facade and native Tx mutation line → read-only contract checks and pre-open compatibility hook. No second revision/selection journal, schema store, generic ABI framework, watcher, adapter protocol or persistence owner.

The existing empty-body HTTP route, SDK session.reload(), capability, counts and policy checks are unchanged. Store maps `maintenance-required` to HTTP409 and retains the exact safe message prefix. Busy removal is deferred without an implicit queue.

## Delivered interfaces and invariants

- `DurableReloadPreparation.validateState(reader)` performs read-only state validation. It MUST NOT stage writes. `publish()` remains synchronous and nonthrowing; all fallible checks precede publication. Throwing trusted publishers violate the existing preparer contract; arbitrary post-publication rollback is not claimed.
- Pure registry/provider publication uses the existing native `harness.commit` mutation line. This read-only callback has no deferred storage writes after publication; native admission and checkpoint commits cannot interleave inside it.
- A trusted resource `apply()` retains the idle barrier. Compatibility is checked before that native selection handoff and rechecked before publication because other native commits can run between handoffs. Resource-specific transactional selection, failed writes, resource retirement and actual rollback selection remain S5/integration responsibilities. No custom transaction manager was added.
- Compatibility is deliberately conservative: unchanged tool schemas, annotation changes and new optional root properties; unchanged replay/caller policies and existing task versions/phases. Annotation stripping does not erase a property literally named description/title/examples/$comment, or literal enum/const values. Arbitrary JSON-schema subsumption is NOT claimed.
- Tool removal is busy while a native generation/tool may still dispatch an offered tool; successful retry after it ends removes the tool on the same Harness.
- Native task scans are paginated. Active missing kinds, incompatible versions and missing checkpoint phases fail safely. Native SDK-declared older task migrations are validated read-only instead of replaced; the SDK ToolTask v1 migration is preserved. A rollback below a saved terminal task version is rejected.
- The existing fresh Jiti evaluator captures defineDoc/defineDocFamily declarations in ephemeral adapter metadata. Stored session/conversation/task documents are checked against declared version/scope/history/fork. Native base documents retain their existing owners. This is not a persisted schema journal. Supported document schema-version changes conservatively require maintenance; generic migration of adapter documents is not added.
- `RuntimeComposition.assertCompatibleState(storage,context)` runs before `Harness.open` reconciliation/resume. Missing server-owned artifacts and incompatible installed task/document state leave saved task rows unchanged and do not open the session.
- Native phase snapshots retain a running v1 handler. Its next stable checkpoint uses v2 with the same task ID. A queued call and a nested call admitted after compatible publication use v2; their already-running v1 parent is not repeated. Unsafe execution after publication/reopen retains its task ID and does not repeat the effect. Existing native Goal documents/contracts remain owned by native automation.

## Failure evidence and minimal adaptations

1. `/tmp/hot-update-sandbox-fhk5vngj/run.log`: the real stable phase transition already passed; schema/removal/task incompatibility rejection gaps failed. The original schema-inspection fixture was corrected to use getCurrentTools, not request.tools.
2. `/tmp/hot-update-sandbox-wtiaqbtg/run.log`: persisted adapter document v1→v2 incorrectly published. The fix captures native declarations via the existing evaluator and checks existing storage; no schema journal.
3. `/tmp/hot-update-sandbox-dcu9aabh/run.log`: actual failing source test showed selection apply ran once before incompatible persisted contracts failed (`1 !== 0`). The fix validates before trusted apply, then revalidates at final publication. This is not a new selection mechanism.
4. An initial queued-call fixture omitted native sequential execution, so its second parallel tool had already started on v1. The final fixture explicitly uses the native sequential policy; it does not relabel an already-running handler as a future invocation.

## Fresh verification of this candidate

All runtime commands passed Frank's physical sandbox negative self-check before executing. Exact argv/mounts are saved in each evidence directory's `command.json`. Synthetic grants/faux model responses are fixture identities, not real model/provider acceptance.

- `/tmp/hot-update-sandbox-kos37t6v/run.log`: **48 PASS, 0 FAIL, 0 skipped**, exit0. Includes 18 S3 tests, 3 S1 core tests, 5 rebuilt package safety tests and 22 profile/provider/skills/Goal-operator regressions. Covers schema-window/queued/nested/removal, same-ID phases, persisted documents, native v1 migration validation, unsafe effect after publication/reopen, pre-selection rejection, selection-apply/mutation/validation/authority faults, missing artifacts, incompatible reopen and rollback refusal; retains auth/session ownership/schedule behavior.
- `/tmp/hot-update-sandbox-kerwy6_g/run.log`: **4 PASS**, exit0. Actual native skills/context/Harness and persisted Goal skill-body test after edit, disable-on-reload and reopen. Attributed reuse of Bob's existing test, not a new Carol implementation.
- `npm --prefix packages/durable-reload run build`: PASS, `/tmp/carol-hu-s3-candidate-build.log`.
- `apps/dpi-backend/node_modules/.bin/tsc -p /tmp/carol-hot-update-backend-tsconfig.json`: PASS, `/tmp/carol-hu-s3-candidate-typecheck.log`. The temporary source-verification config maps the package to fresh dist declarations.
- `git diff --check`: PASS after final source/test edits. No commit/reset/stash/checkout was performed.

Runtime source command:

```sh
python3 experiments/hot-update-20261101/sandbox/run.py --repo "$PWD" -- sh -c 'cd /repo/apps/dpi-backend && node --import tsx --import '\''data:text/javascript,import{registerHooks}from"node:module";registerHooks({resolve(s,c,n){if(s==="@local/pi-durable-reload")return n("file:///repo/packages/durable-reload/src/index.ts",c);if(s.startsWith("@earendil-works/")&&c.parentURL?.includes("/packages/durable-reload/"))return n(s,{...c,parentURL:"file:///repo/apps/dpi-backend/src/store.ts"});return n(s,c)}})'\'' --test tests/hot-update-compatibility.test.mjs tests/hot-update-core.test.mjs tests/profile-reload.test.mjs tests/provider-hot-reload.test.mjs tests/native-skills-reload.test.ts tests/native-goal-operator.test.mjs ../../packages/durable-reload/reload-safety.test.mjs'
```

The Goal-body command uses the same sandbox/import hook with `--test tests/native-skills.test.ts` instead. The package safety tests import rebuilt dist; backend tests explicitly map the old physical dependency to source. This is **source candidate evidence**, not installed R4 acceptance. The backend's physical npm dependency is still the earlier separate copy and must be replaced during immutable packaging. A previous command used a wrong third-parent relative safety path; its 20 tests did not run package safety. The corrected final 48-test run above explicitly includes all five package tests.

## Candidate hashes

```text
d5d3106143cb126912b88b656999934064e758d8bab8dd1b6f8e34208efdc169 packages/durable-reload/src/index.ts
48780230c555cc7fdfeb90d1bcee1f6a6592729ecfbf075745c4b4e0bd2517c8 packages/durable-reload/src/registry.ts
f3f8ca6cf2526b96bdfe32b19b9ca083c7aabf534ea7da01ce379d5941d51732 packages/durable-reload/src/loader.ts
9ef2af877c85de92d0bcb4a2bc3f1921f06ee878d5ca895fdd3acba836808103 packages/durable-reload/src/compatibility.ts
301f362fd5925136e7e0c1e7e0168e159381561871aaed7d9b031cf0b455e888 apps/dpi-backend/src/runtime-profile.ts
18bfd93576144e0192643850bd7445f385ca29f58c23a50d10c15e9d89ea376e apps/dpi-backend/src/store.ts
dea495ad6b356ab55f2903c2b5e7ad3d427347044e36c52f309988fe4742e539 apps/dpi-backend/src/native-profile/profile.ts
1fa4d08f637f6c26eb626472ff955220d0309b0e7963facb99502b6f2f3caf66 apps/dpi-backend/tests/hot-update-compatibility.test.mjs
9e6ca41f44fa5fd4e3c4bc542823cfcea718045956a1604594fb059dea188bb4 packages/durable-reload/dist/index.js
ebc534132cd70a4f2b254aee42171487be630009c5f7d21b899238fb6f3bf8f9 packages/durable-reload/dist/registry.js
ee843e8096161e006bcc4329bafdc2c7272b6bd5df024eafe3d3941cad7c705e packages/durable-reload/dist/loader.js
cdb80fa77b5dfc6ac735ab5595a1248c8fe135e0a8e0f1334d0ce4407b24ee45 packages/durable-reload/dist/compatibility.js
```

Whole shared-file diffs also include preserved earlier work; these are final file hashes, not an attribution of all uncommitted lines to S3.

## Remaining acceptance boundary

Grace must review the new startup preflight and mutation-line publication on the stable candidate. Alice packages one new immutable artifact; Bob/Frank finish resource/native selection and rollback integration. Heidi executes independent installed U01–U20/recovery/resource/PTY QA against that same manifest. No peer may activate/restart the live Host. The existing operator-only auth incident remains unresolved; no claim of production readiness or activation is made here.
