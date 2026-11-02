# Pinned native commit authorization — component handoff

Status: verified component input for packaging, not Host D1 acceptance.
Production activation: **NOT RUN**.

## Problem and change

Unmodified `@earendil-works/pi-durable@1.5.0` checks the request signal before the native commit callback. It does not recheck authorization after the callback awaits storage reads. Native `Conversation.abort` can therefore persist abort marks after the caller loses its grant. Copying its task-ownership traversal into Host would create a second execution implementation and is not an acceptable fix.

`patch-commit-authorization.mjs` adds an optional synchronous `HarnessOptions.beforeCommit(context)` hook. The existing native session invokes it at callback entry and immediately after `await change(tx)`, inside the existing rollback boundary and before `tx.settleSuccess()`. This preserves the native scheduler, traversal, transaction writer, task ownership and execution owner. It does not replace native effects or introduce another engine.

`native-session.ts` stores a private authorization function in the request's Chord context. Send, reconciliation and interrupt propagate this context into the real native transaction. The native hook calls the function at the transaction boundary. No request function is installed in the background context. A rejected request rolls back its provisional changes without making the whole session unhealthy.

The package exports `COMMIT_AUTHORIZATION_REVISION = "host-commit-authorization-v1"`. The runtime module requires that exact export and revision. A stock package cannot silently ignore the hook. Native Harness, conversation and mutation-context accessors use actual JavaScript private fields/methods, not public properties.

This check is synchronous. There is no await between the authorization hook and initiating `tx.settleSuccess()`. The authorization point is the native callback's transition to commit, not completion of later disk I/O. Asynchronous hooks, grant revocation after this linearization point, external effects already performed before a transaction, and arbitrary native writes without the scoped context are not covered by this component claim.

## Inputs and exact patch

- Alice's immutable dependency seed: `/tmp/pi-host-dm1-build-20261102-alice-v1`.
- Carol's disposable copy: `/tmp/pi-host-dm1-runtime-20261102-carol-v1`.
- Package: `@earendil-works/pi-durable@1.5.0`; Chord and pi-ai: 1.5.0.
- Seed lock SHA256: `46482cfa4ca28e91d4a43de4b799ecc22be5b64e5949fc7af3cfa23f894f77eb`.
- Patch revision: `host-commit-authorization-v1`.
- All six original/patched file hashes: `native-commit-authorization.json`.
- Patch script SHA256: `5822850cc788311d09e43dbb11ae297b40036683b5f85c374518c515642e1b5d`.

Apply only to an owned, physically contained disposable candidate copied from the pinned seed. Make the six copied native files writable if the copied seed preserves its read-only modes. Never change the seed or shared node_modules.

```sh
node experiments/durable-module-20261102/runtime/patch-commit-authorization.mjs \
  /tmp/pi-host-dm1-runtime-20261102-carol-v1
```

The script validates the exact version, all six preimage hashes, unique anchors and physical containment before any file write. It refuses unknown, partial or already patched inputs. Reapplication was tested: it refused the patched preimage and all six file hashes remained unchanged. A write failure is not an atomic install; discard that disposable copy and copy the seed again. Packaging must qualify and record the resulting closure independently.

## Reproducible fixtures

`native-commit-authorization.test.ts` is a direct real-Harness/SQLite fixture. It does not import the Host module or the patch marker, and its compiled JavaScript is unchanged between RED and GREEN.

1. The first test changes a real document, awaits, then revokes the request. The unmodified package persists `count=99`; the patched package preserves `count=0`. A later authorized transaction persists `count=7`, proving recovery after rollback.
2. The second test revokes inside native `scanSubmissions` during interrupt. The unmodified package persists `abortRequested:true`; the patched package preserves the complete pre-interrupt task records and submission. A later authorized interrupt persists its expected abort mark.

Compile current owned sources and both fixtures in the private copy:

```sh
cd /tmp/pi-host-dm1-runtime-20261102-carol-v1
./node_modules/.bin/tsc --strict --module NodeNext --moduleResolution NodeNext \
  --target ES2023 --skipLibCheck --types node --typeRoots node_modules/@types \
  --rootDir . --outDir carol-tests \
  apps/dpi-backend/tests/durable-session.test.ts \
  experiments/durable-module-20261102/runtime/native-commit-authorization.test.ts
```

Strict compilation passed with exit 0. For RED, restore only the six native preimages from the read-only seed into the private copy; do not recompile the fixture. Run the direct fixture through the physical sandbox:

```sh
cd /home/ubuntu/Projects/pi-durable-host
python3 experiments/hot-update-20261101/sandbox/run.py --repo "$PWD" \
  --candidate /tmp/pi-host-dm1-runtime-20261102-carol-v1 --timeout 120 -- \
  node --test --test-concurrency=1 \
  /candidate/carol-tests/experiments/durable-module-20261102/runtime/native-commit-authorization.test.js
```

RED: `/tmp/hot-update-sandbox-ofris1bk`, exit 1, 0 PASS / 2 expected FAIL. Physical negative isolation self-check passed. Evidence: `native-authorization-red.log` and `native-authorization-red-isolation.json`.

Reapply the pinned patch to the private copy. Run both compiled fixtures with the same sandbox command and these test paths:

```text
/candidate/carol-tests/apps/dpi-backend/tests/durable-session.test.js
/candidate/carol-tests/experiments/durable-module-20261102/runtime/native-commit-authorization.test.js
```

GREEN: `/tmp/hot-update-sandbox-uln8np7t`, exit 0, **14 PASS / 0 FAIL**. Physical negative isolation self-check passed. Evidence: `native-authorization-green.log` and `native-authorization-green-isolation.json`.

The additional 12 tests cover send/tool/answer/history/context, native IDs and receipts, concurrent dedupe, send rollback after awaited admission, client version/scope refusal, state-first reconnect/history cursor scope, answer-before-idle, normal interrupt outcomes, interrupt revoke rollback, safe error/projection fields, bounded resync and observer revoke cleanup. They are component fixtures, not HTTP or full-profile acceptance.

Intermediate fixture corrections remain identifiable in `/tmp/hot-update-sandbox-j7p8h4si`: the direct fixture first assumed queued status, whereas native immediate placement returns `placed`. That failed assertion was a fixture error, not evidence against the corrected patch. The earlier real Host-component RED remains `/tmp/hot-update-sandbox-_3atybab`.

## Handoff identity

| Artifact | SHA256 |
| --- | --- |
| Native fixture source | `6f2a83edf501c47f02c4c410d038e342403e6e060446879e24b666c302e4001c` |
| Native patch metadata | `7daa7b1074594c4966471647173b64cac7788c626278335be5245514218b1c60` |
| RED log | `543d294bba158c973918e7bb4ea2d7c20790ed2e2b933fe582e953e8c7df9cc5` |
| GREEN log | `3262b4984f9ee5e6c86ff24d4bbf23a8c37cccff42ea6da665f89523b7aa4dfd` |
| Runtime component source | `1a313b190b3540006530b1a23f6dbc6d477ea01864233db44775e2407d242b12` |
| Public projection source | `be1c6de244bd29bc4f41a6afa606e4f05c62d452aa4e0ea2b6061af8dda63bac` |
| Runtime component tests | `8ac4c8786685c7fe55299dcc184c5bed283a53b9359da62f448e192c280a34c5` |

All handoff artifacts in this directory are ordinary project files, not links to HOME, live data or a disposable candidate. Native input provenance is explicit; clean reassembly and final manifest qualification belong to Alice. Grace must review this adaptation on the same final candidate digest.

## Remaining work and exclusions

Host Store/routes/HTTP streams integration, the complete session operation set, real terminal roundtrip, full profile, D2–D5, compiled/declaration boundary checks and installed acceptance remain unfinished. The module currently implements the tested semantic subset only. A bare component factory is not a complete D1 Host.

The scoped native interrupt defect can be resolved for this exact patched component. Stock 1.5.0 remains vulnerable to the reproduced race. Packaging must carry this adaptation and its explicit identity; it must not call the unmodified package equivalent. Historical release-return, previous-target, operator-auth and real-copy gates remain open. No live Host or installed release was changed.
