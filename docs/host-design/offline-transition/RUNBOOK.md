# Offline transition / rollback preparation

## Current main-route scope

The current verdict covers **backend + dpi-sdk + terminal + actual local iii**.
BB and its unfinished checks/defects are deferred, not fixed or prerequisites.
The operator separately approved exactly one already selected inactive current-runtime
session copy. Do not select another session or repeat its source snapshot. Use its
protected backup for separate candidate/restore branches only; production activation,
owner stopping, credentials and live model/bank/API calls remain unauthorized.

See [the actual selected-copy results](REAL-PILOT-RESULT.md). Coherent snapshot and
original native storage readback passed. An independent actual original-CLI/profile
restore also passed under deny-only isolation without credentials or external calls;
this is not production authority restoration. Actual copy-only host adoption/import
now passed with every native table and model reference intact. Controlled candidate
continuation remains blocked by the actual saved-model credential/availability guard;
no model substitution or credential access is authorized.
The generic preparation and generated-fixture history below do not enlarge approval.

## Authorization boundary

This runbook prepares P6; it does **not** authorize access to a real session,
production owner shutdown, runtime activation, global settings, publication or deploy.
The executable rehearsal below accepts no source-data path. It creates and removes
only its own temporary faux fixture. ISC-39/40 remain open: the selected-copy
approval above is not production activation or acceptance of actual candidate
continuation; the separately recorded restricted original-profile recovery does not
restore production credentials or operator authority.

## Reproduce the disposable rehearsal

From this fork, with its existing local dependencies and Node 22.19+:

```sh
cd apps/dpi-backend
node --import tsx --test tests/offline-transition.test.ts
```

The fixture uses a temporary HOME, work directory and dataDir, a faux provider and
the pinned `playground@1` demo registry. It never opens an existing user session.
Its stages are:

1. Start one native `change-watch` task and wait for an actual persisted checkpoint.
2. Await `Store.close()` and check catalog, shared-state and session owner locks
   are gone. Only then copy the complete fixture data tree to an immutable backup.
3. Clone that backup to a candidate dataDir. The test rewrites catalog absolute DB
   paths **only inside its generated temporary root**. It preserves session,
   conversation, task, document and profile IDs. This is not a generic migration CLI.
4. Open the candidate with the compatible original registry, complete all three
   checkpoints and append candidate-only history. Close its owner completely.
5. Verify the backup byte-tree digest is unchanged. Clone the original backup again
   into a separate restore directory, not over the candidate DB.
6. Open that restore with the exact original fixture runtime/profile, complete the
   same saved task and verify candidate-only history is absent. Verify backup digest
   again, close resources and remove only generated fixture files.

PASS on the current Durable 1.4.0 candidate: `/tmp/bob-offline-transition.log`;
backend typecheck: `/tmp/bob-offline-check.log`. This is a same-version compatible
copy/restore proof. It is **not** a historical 1.0.3→1.4 migration, schema downgrade,
full-profile compatibility or real-data recovery proof.

## Native transition gate added after the public checkpoint

The old `playground@1` rehearsal above is retained as historical evidence, not the
migration acceptance gate. The new executable is:

```sh
cd apps/dpi-backend
# Optional: an independently verified PRIOR backend package, never a session/data path.
DPI_MIGRATION_SOURCE_PACKAGE=/absolute/path/to/verified/prior-backend-package \
  node --import tsx --test tests/migration-readiness.test.ts
```

Without that environment variable the first case deliberately reports
`CURRENT_SOURCE_FIXTURE_ONLY`; it is not previous-runtime evidence. With it, the
fixture uses that package's actual compiled Store and native profile for both
source creation and original-runtime rollback, and the current source for the
candidate. The recorded proof uses the prior public `0c49efba` runtime, Durable
1.4.0 → candidate 1.4.0, `native@1` plus a generated unsafe-effect recorder. It does
**not** establish that an installed standalone TUI session has this host profile.

The five focused cases cover:

1. A real native owned child with pending human attention, future schedule, settled
   history and an already-started unsafe tool. Source/candidate/restore IDs stay
   identical; candidate and restore must not repeat that unsafe effect. Complete
   source file/directory/mode manifests match the backup, including catalog,
   shared state, native databases and an opaque session artifact. The original
   source tree and master backup must remain byte-identical after continuation.
2. Unknown saved profile and unavailable **child** model refuse before recovery;
   their original IDs/model references are not rewritten or replaced by an empty
   conversation.
3. A generated saved `durable.schedule@1` checkpoint resumes under the real v2
   handler/migration, submits one canonical occurrence, and restores independently
   with the v1 definition from an untouched backup. This is a concrete historical
   **contract** fixture, not a claim about an unspecified source installation.
4. A required `local-host.goal-check@1` handler absent from the target is rejected
   during read-only preflight, before any target scheduling. Untested task-version
   transitions also refuse. Preflight is not a universal schema/profile validator.
5. A copied, unrebased catalog and a symlink alias back to the original database
   must fail closed before SQLite/ownership writes. The original RED is retained
   in the evidence. The owning Store confinement repair now has independent
   compiled-artifact acceptance (18/18, no skips); that guard is not a real import
   or a full migration GO.

The helper `tests/fixtures/offline-copy.ts` is **fixture-only**, requires the
marker in its freshly generated root and is not a real-session import CLI. It
acquires every normal Store owner lock before backup, refuses symlinks/special
files, validates every mapping before rewriting any catalog row, and changes only
explicit copied catalog DB paths. It never guesses model/profile/task identities.

SQLite `readOnly: true` alone can create `-wal`/`-shm` sidecars. The fixture's
checkpointed inspection uses an immutable read-only URI and first refuses a
nonempty WAL, because immutable mode would ignore it. A source with committed
WAL requires the approved coherent SQLite backup branch; never discard its WAL
or call an immutable main-file-only read a complete snapshot. Native agent CWDs,
tool arguments and external artifact references are not recursively rewritten.
An isolated copy therefore also needs filesystem/network/effect confinement;
rebinding catalog paths alone is not an execution sandbox.

### Supported scoped adoption, not a generic migration guarantee

Installed standalone TUI sessions use a CWD-hashed `session.sqlite` directory and
its directory lock, not the host catalog's session/profile rows. There is no
approved generic importer that may label an unknown saved registry `native@1`.
Installed Durable 1.2, 1.3 and 1.4 runtimes coexist; their presence does not identify
the runtime that created a chosen session. Use the exact metadata and definition
inventory in `../verification/migration-compatibility/MATRIX.md` before choosing a
source-specific route. A required missing legacy goal task/document is a concrete
compatibility barrier, not permission to delete its state.

The trusted `dpi-backend/native-import` export now provides `adoptNativeCopy` for
an explicitly verified, coherent, copy-only input and an attested existing target
composition. It does not select sessions, stop owners, checkpoint sources, resolve
credentials or resume native work. Its caller supplies the complete artifact hashes,
source bootstrap/contract attestation, actual registry/model metadata and pure document
effect validators. It preserves an absent formal source profile as `null`, separately
from the explicitly chosen target profile. The selected real copy passed this route;
this does not establish blanket compatibility for other installations or sessions.

Known retired task-document tombstones may legitimately have no retained revisions.
Validate their actual contracts and terminal owners without inventing values; refuse
unknown kinds or invalid active documents. Every asynchronous validator must settle
before destination creation. Keep original WAL/SHM in the protected raw backup; use
the coherent backup DB plus preserved artifacts in a separate normalized working input.
Never normalize an original or overwrite the immutable backup.

A real-copy rehearsal must report five separate outcomes: complete coherent
snapshot; definition/model/profile compatibility; preserved native identity and
pending state; actual controlled continuation (or its exact blocker); and restore
with the original pinned runtime. Synthetic fixtures alone cannot turn any of
these real-data outcomes into GO. Production activation remains a separate decision.

## Required record before any real-data attempt

The operator must approve a concrete record; do not fill missing values from guesses:

- Exact session ID, source data/catalog locations, source owner PID/service and
  all processes that can open its SQLite. A client window is not the owner.
- Exact original runtime/package hashes, native profile ID and task/document
  definitions, saved provider/model IDs, environment/integration dependencies.
  Record credential references privately; never print tokens or copy them into chat.
- Backup scope covering the full selected session and required catalog/shared state,
  external native documents/artifacts and profile/runtime definitions. A single
  `agent.sqlite` filename is not automatically a complete session backup.
- Agreed owner-stop procedure/window, backup destination, access protections and
  verification manifest. Acquire backup only after confirmed quiescence, or by an
  explicitly approved consistent SQLite backup procedure covering all required DBs.
- Candidate sandbox paths and external-effect policy: faux/local recording endpoints
  only, or block the tool/integration. Do not silently replay unknown unsafe effects.
- Original runtime/profile available for rollback, protected immutable backup,
  expected assertions and the exact operator who can authorize activation.

A launcher/config pointing at production is not an acceptable candidate test. The
minimal CLI stores absolute DB paths in the catalog; copying a dataDir to another
path without an audited isolated rebinding/import may reopen original DBs. The test
contains a confined remap for its generated data only: do not reuse that helper
against user files. The separate trusted adoption API above requires explicit source
attestation and validates before publishing a new confined catalog; it is not an
unchecked source-path migration CLI.

## Candidate checks after separate approval

Use only the approved coherent copy. Validate profile/version/model references before
resume. A missing model must refuse, never substitute another provider/model. Verify
native task/document IDs, children, pending human attention and parent-control policy
before declaring continuation. An incompatible profile must stop before construction
or resume; accepting a new empty conversation is not migration success.

Keep a separate record of source backup digest, candidate DB path/profile ID,
submission/task IDs, pending unsafe effects and actual check outcomes. Unavailable or
uncertain work stays explicit. Do not start the original owner while an isolated test
still opens its source data. Production activation is a later, separately authorized
operation even if every copy check passes.

## Rollback rule

Stop the candidate owner through its approved boundary. Restore an **untouched
original backup copy** with the original pinned runtime/profile and original data
layout or a separately audited importer. Never open a candidate-migrated SQLite with
an older runtime as a shortcut. Check restored native IDs, original history and
attention state; verify the immutable master backup still matches its manifest.

If there is no complete coherent backup, original runtime or confirmed owner
quiescence, the real-data branch is BLOCKED. Continue safe fixture/implementation
work instead; absence of the user is not permission to choose a session or stop a
service. This runbook supplies no production stop/activation commands: the current
approval covers only the already selected inactive copy rehearsal, never a production
installation/window or a second source snapshot.
