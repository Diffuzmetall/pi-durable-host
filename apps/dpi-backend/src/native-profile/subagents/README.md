# Local native subagents / parent-control

This is the selected installed `durable-subagents` implementation ported into the
fork, **not a replacement scheduler**, an activated profile, or an upstream release.
`SOURCE.json` records original/local SHA-256 identities. Original MIT notices and
Pocket-derived attribution are retained; no Pocket runtime or SDK is included.

## Trusted composition

```ts
import installSubagents from './registry.js';
import { bindParentControl } from './index.js';

// These are host-owned functions, never constructed from an HTTP request body.
const registry = installSubagents(baseRegistry, hostAdmission, { resolveModel: hostModelPolicy });
// After opening the one owning Harness:
const extension = registry.snapshot().extension('subagent')!;
const controls = bindParentControl(extension, harness, context, authorizeParent);
```

`hostAdmission(child, requestId, context)` must enforce the admitted host policy.
It is mandatory in the local registry adapter and may coordinate optional memory,
but does not require a running Hindsight service. Missing admission fails closed.
The lower-level original `createSubagent(admit, options)` factory remains available;
the unconfigured `Subagent` export is **not** a policy-wired host profile.

`authorizeParent(tx, parent, action)` executes inside the native transaction and
returns `{binding, policyReference, tools, prepareChild?}`. The actual extension
checks parent ownership, exact child/key/anchor/execution/request identities,
expected native + policy revision, role/tool ceilings, and canonical command
fingerprints. Stop uses the native child-tree fence and Reporter admission lane;
it does not abort an arbitrary task ID. `prepareChild` is the existing owner hook
for per-input delegated policy; a caller-supplied human flag is rejected.

The only owning runtime changes from the source snapshot are relative `.ts` →
`.js` import suffixes for this repository's NodeNext build and explicit admission
in `registry.ts` instead of its Hindsight-symbol lookup. Native task/document
kinds, versions, checkpoint policies, parent-control symbol and receipts remain
unchanged. Actual models/tools, tokens and policy revisions are supplied by host
composition; no credentials or model aliases are embedded here.

## Verification on public SDK 1.4.0

From `apps/dpi-backend`:

```sh
npm run check
node --import tsx --test tests/native-parent-control.test.mjs
```

PASS: strict typecheck and **7/7** actual Harness/faux tests, logs
`/tmp/dave-native-parent-typecheck.log` and
`/tmp/dave-native-parent-control-final.log`. Tests adapt the selected package's
four parent-control cases, plus explicit memory-independent composition,
current-policy revision/revocation, and SQLite close/reopen identity checks.
The copied JavaScript fixture's three tool results use SDK 1.4 `output.content`;
its imports point only to this local copy. It cannot call external providers.

Verified: exact owner binding; concurrent same-command receipt; conflict/stale
revision/foreign child/human-field/tool-escalation denial; exact supervisor schema
and reply identity; parent/sibling survival across child-tree stop; delayed
Reporter cannot revive stopped work; native child/task/request/receipt IDs survive
reopen without rerunning the completed faux child. This is a graceful disposable
reopen check, **not SIGKILL recovery** or compatibility with arbitrary old stores.

## Limits before combined profile acceptance

This capability is child control, not a generic root delegated-submission API.
Existing-conversation read-only delegated input requires the real worker/profile
`prepareChild`/input-policy integration. Consequently HTTP delegated mutations
remain unavailable; `host.input` metadata alone does not establish authority.

Goal human acceptance, schedules, DCG/MCP nested authorization, Hindsight/Mail
isolation, full provider inventory, session-process lifecycle and profile packaging
are separate outputs of the parent P2 task. No full-profile or ISC-14/15/16/42/43/44
acceptance follows from this factory's compilation or focused tests.
