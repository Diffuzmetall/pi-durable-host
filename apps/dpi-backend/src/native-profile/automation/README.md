# Native Goal and schedules: memory-independent lifecycle

Actual selected native implementations, not a new scheduler or a new Goal worker.
`SOURCE.json` pins original/local hashes: eight runtime modules are unchanged except
local relative import paths and NodeNext `.js` suffixes. `automation.ts` localizes
the installed composition's authority hooks and bind/shutdown ownership, removing
the mandatory Hindsight controller and lifecycle monkey-patch. MIT notices for
Diffuzmetall and Tanner Middleton are retained in the two LICENSE files.

## Trusted host composition

```ts
const automation = createAutomation({
  authorize: authorizeRoot, // server-owned current root grant, not caller JSON
  admit: admitInput,        // mandatory existing native input admission
  tools: admittedTools,
  resolveSkill: readAdmittedSkill,
});
for (const extension of automation.extensions) registry.install(extension);
// Open the ONE owning Harness with this registry; do not resume before bind:
await automation.bind(harness);
// Normal shutdown: automation first, Harness/resources afterwards:
await automation.shutdown(context);
await harness.close(context);
```

Import `createAutomation` from `./automation.js`. Composition preserves
`local-host-automation-authority`, the native schedule owner, archived Goal
identities, session companion and native Goal model-control adapter. It neither
creates another Harness/SQLite owner nor copies provider credentials. It requires
explicit admission before construction and refuses a second bind/closed lifecycle.
Memory can participate in that admission callback, but is not its authority source.

Root authorization gates schedule creation and both sides of scheduled-input
admission. Cancellation uses the actual bound Harness `cancelScheduleTask` scope
and join semantics. Root/child Goal authority and model-only action schemas remain
the selected source's native checks; the model tool has no `approve` action.
`automation.goals.command/approve` is a **trusted operator API**, not a machine HTTP
endpoint. Do not expose it using the same grant as ordinary model tools.

## Executed checks

From `apps/dpi-backend`:

```sh
node --import tsx --test tests/native-automation.test.mjs
npm run check
```

Machine-local verification artifacts are not distributed. See the public status and reproducible package tests.

Verified:

- Goal performs work in the same root conversation; completed evidence/report and
  display-only result survive reopen without another model turn or child.
- A model's passing evidence leaves a human criterion waiting with
  `humanApproved:false`. Only the separately called trusted operator approval
  completes it; child Goal creation, revoked root control and closed-lifecycle
  admission/rebind are denied.
- Shared basic call budget, pause/limits behavior, reminder stop, report-write
  failure and authority revocation preserve ordinary root conversation behavior.
- The actual schedule tool runs through native tool execution, not a fabricated
  ToolExecutionApi. Its document item/task IDs survive close/reopen past deadline;
  exactly one admission and canonical `schedule:<taskId>:0` submission occur.
  Another reopen preserves the same submission ID and does not rerun the model.
- Revocation before the scheduled occurrence produces a failed native task with
  no submission/provider call and no implicit retry after another reopen.

## Preserved identities and remaining acceptance

Goal retains `durable-goals.native-goals`, `durable-goals.runtime`, session request
and boundary families, and archived task definitions. Schedule retains
`durable.schedules` v1 and `durable.schedule` v2 with its existing v1 migration.
These are selected-definition disposable reopen checks, **not arbitrary old
registry compatibility or physical SIGKILL acceptance**.

Inherited runtime code includes the existing legacy archive runner solely for
hydration/compatibility. New Goal work uses `createSessionGoalService`; it does not
start the legacy worker path. Advanced compaction, root `api.models` metering,
legacy-store migration, repeat/DST/cancellation races and production providers
were not exercised by these eleven focused cases and must not be inferred from
successful compilation.

Subagents/parent-control, DCG/MCP, triggers, Hindsight/Mail isolation and provider
inventory are separate profile components. Combined profile registration,
pre-resume recovery, session-process ownership, scoped root delegated inputs and
independent milestone acceptance remain with the parent P2 task. This output does
not enable delegated HTTP mutation or manufacture human acceptance.
