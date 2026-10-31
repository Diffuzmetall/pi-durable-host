# Actual native BB binding persistence

Preparatory P4 component for ISC-28 and the binding/persistence part of ISC-30. This does not accept BB before the terminal milestone, and does not implement authorization, SDK transport, history delivery or parent-control.

## Source and license

Actual selected source: `/home/ubuntu/Projects/master/experiments/pi-durable-1.4-upgrade/provider-lane/src/store/binding-store.ts`. Original Diffuzmetall MIT license is retained verbatim in `LICENSE`; the enclosing backend retains its own notices. `SOURCE.json` records original/local/test SHA-256 values. No external source or installed release was modified or imported as a runtime dependency.

SDK 1.4 requires `checkpointWhen`; both existing definitions explicitly retain deltas with `checkpointWhen: () => false`. The initial component differed only by those two lines. The connected owner port additionally exports `BindingDoc` and factors the original validation/index/document CAS transaction into `putDurableBinding(tx,binding)`. The original active-tool factory invokes that same helper. No replacement registry, storage, binding engine or client-side persistence was added.

The actual conversation document remains `bb.native-child-binding`, version 2, `history:latest`, `fork:initial`; the session index remains `bb.native-child-binding-index`, version 1. Existing validation, identity key, atomic index/document CAS and corruption handling are unchanged.

## Callable contract and authority

`createDurableBindingReader(api,context)` exposes `get(nativeConversationId)` and `findByThread({providerId,sessionId,bbThreadId})`. `createDurableBindingStore(api,context)` additionally exposes `put(binding)` with an optional BB `parentThreadId`.

The API is the original active invocation's public `ToolExecutionApi` (`snapshot` plus `commit` for writing). Construct/use it within that registered native callback; do not retain invocation capabilities after execution. This library ships no production model-callable tool. A downstream server-owned native task/tool can consume it after current authorization, inside the existing Harness.

The server owner can instead call `putDurableBinding` inside its **genuine existing Harness commit**. This is an explicit native `Tx` capability, not a fabricated or retained `ToolExecutionApi`. `Store.bbBinding` rechecks the current server grant/provider/session/thread/native-parent scope inside that same transaction before calling the unchanged CAS helper. Read-only lookup uses the genuine Harness snapshot capability. No production model-callable binding tool is added.

Persistence is **not authorization**. The HTTP/Core owner must authorize current actor, provider/session/thread/native conversation and parent scope before reading or writing, including an identical retry. An internally matching tuple is not identity. Numeric native conversation IDs belong to the server; do not derive them by guessing SDK opaque aliases. `parentThreadId` records the BB association and does not prove native child ownership or grant parent-control.

The index rejects one BB identity being redirected to another conversation, and an existing conversation cannot be rebound. A repeated identical put is harmless. Forks begin with no inherited BB binding; they cannot silently become the parent's BB thread. Failure/reconnect must never create a replacement native session or promote an existing child to root.

## Verification

From `apps/dpi-backend`:

```sh
./node_modules/.bin/tsc --noEmit --strict --skipLibCheck --target ES2023 --module NodeNext --moduleResolution NodeNext --types node src/native-profile/bb-binding/binding-store.ts tests/native-bb-binding.test.ts
node --import tsx --test tests/native-bb-binding.test.ts
```

PASS strict `/tmp/dave-bb-binding-types-004.log`; PASS real native fixture 1/1 `/tmp/dave-bb-binding-native-002.log`. The disposable Harness/SQLite/faux fixture constructs the actual store within a registered test-only tool invocation. It covers original kinds/versions/scopes, duplicate replay, conflicting rebind/index identities, missing/invalid conversations, foreign provider/session lookup, read-only capability, independent conversation state, concurrent same-thread CAS (one success, one reject, no partial losing document), `fork:initial`, and exact persisted bindings after close/reopen. A separate narrow malformed-snapshot unit check verifies corruption rejection; it is not persistence or authority evidence.

No new dependencies, live BB/model calls, private databases/configuration, terminal package edits or source outside this fork were used. Fixture processes/Harness close at the end.

Connected owner evidence: strict backend check and 6/6 actual input/binding/parent/BB HTTP tests PASS (`/tmp/bob-native-transport-focused-green.log`). BB tests cover server-configured provider/thread selectors, root/child native ownership and exact execution/request fences, identical retry, CAS rollback, foreign/missing/rebind/body-authority denial, child-scoped reopen, and revocation inside the native write transaction. The original real active-tool fixture also remains PASS. This is a transport component, not ordered BB adapter acceptance.

## Remaining P4 consumer work

Use this native persistence with the existing localized BB history sink/projector and native-child routing algorithms. The downstream SDK-only session adapter still needs exact trusted root/child attachment/readiness, stable root as well as child clientRequestId, authorized reconnect/CAS history delivery, native parent-control/late outcomes, and standalone packaging. Full ISC-28/29/30/31 and mixed terminal/BB artifact acceptance remain open until connected source and isolated compatible BB QA run after terminal acceptance. Do not mark the persistence component's PASS as full BB or authorization acceptance.
