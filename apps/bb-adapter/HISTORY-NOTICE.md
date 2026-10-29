# BB history sink: source port and limits

## Contract

P4 preparatory output for **ISC-29**, Feature F3. It does not accept the BB milestone before terminal. ISC-29, ISC-28/30/31 and BB package ISC-38 remain open until the full adapter and isolated BB checks pass.

`openHistorySink({threadId, request})` first awaits the existing authorized `thread/reconcileExisting` digest read. Only then can the caller observe or capture native history. The returned `apply(snapshot)` owns one immutable wire attempt. The producer must await it before the next snapshot. There is no queue.

A lost ACK or a generic rejection freezes that attempt. Only an explicit identical snapshot retry is allowed, with the original expected digest. The sink never reads or rebases after rejection. A valid ACK alone advances the digest. A deferred response must retain the digest and report no mutation.

`request` is the existing BB Core RPC requester, not a new host endpoint. Core must validate the schema, current authorization, provider/thread binding and provenance **before** identical-content no-op and CAS. The sink checks the receipt. It is not an authorization service or schema validator. `history-types.ts` mirrors the existing wire data shape and adds no runtime dependency.

## Provenance

Read-only source: `donor-bb://`.

- `src/history/history-sink.ts`: SHA-256 `3991f7b935307ef86cb3661057fd1aa9aa5986d1b430ee762d3cfefb9123c0ed`.
- `src/bb-compat/native-history-contract.ts`: SHA-256 `81dfbda6b6892b4803cbc89aef5b938a8aac7d81294b9641c29a6663560f4c61`.
- `src/history/history-projector.ts`: SHA-256 `36fe4482455f0ba58f768c96a8eab69b3e45b94600c3ef28eaae69006609dc42`.

The sink is the actual selected projection-path implementation. Its only source delta is the type import/export path from `history-projector.ts` to the local `history-types.js`. The explicit wire interfaces mirror the source schema's inferred public shape. The owning Core retains full runtime validation. This port neither weakens it nor adds a competing implementation.

No legacy provider runtime, native SQLite/Harness, BB compatibility archive, credentials or live store is copied. No server SDK or installed release is a runtime dependency of the client history modules. This is a working component for the future BB transport adapter, not a replacement BB provider.

## Coherent history projection

`history-projector.ts` retains the actual selected projection algorithms. The inherited function bodies are unchanged: only native type imports become the existing local wire types and validated `unknown` arguments. This keeps native SDK types out of the client package. The old settled snapshot guard and strict coherent parser remain exported.

`projectHostHistory(frame)` adds one known host boundary. It validates the known authenticated `host.input` metadata. It clones only the presentation entry to `pi.user` and removes actor/source/authority metadata from the rendered data. It never mutates raw native records, creates an authority grant or infers receipt bindings. Explicit capture receipts must point to a unique native user entry. A `host.input` entry is normalized only when its entry ID is a member of the coherent capture's canonical receipt list. Raw `data.requestId` is caller metadata, not necessarily the native request ID: generic Store admission uses `host:SHA256(actor, operation, key)`. Canonical receipt IDs are never renamed or compared for equality with that raw key.

The caller must supply an authorized **coherent native outcome**, not a raw snapshot plus an assumed status. The helper rejects raw/live snapshot fields. It does not solve outcome selection or make independent reads atomic. Missing receipts stay missing. An absent run is not proof of success.

The original tool result matching, opaque thinking omission accounting, model ID preservation and whole-capture rejection for unfamiliar content remain in force. Tools are inert history data and are never executed here.

`apps/dpi-backend/tests/fixtures/bb-history-wire.ts` is test-only. A real minimal Harness/SQLite/faux run verifies the canonical native request receipt and terminal answer, then serializes the same `watchEvents.snapshot` used by the public stream. The client projector preserves the resulting input/answer/tool source IDs. Its output passes the existing history sink's identical-retry flow without a second mutation. Native imports stay in the backend fixture, not client source.

Machine-local verification artifacts are not distributed. See the public status and reproducible package tests.

Run from `apps/dpi-backend`:

```sh
node --import tsx --test ../bb-adapter/tests/history-projector.test.mts
```

ISC-29/30 remain PARTIAL at this source boundary. A production host coherent-outcome endpoint, BB scope mapping and isolated actual Core/native child control are still required. This fixture does not accept the BB milestone.

A retention-reader defect appeared during this work. Actual Hindsight ignored user turns from supported application inputs. Native `InputEntry` permits an application kind instead of `pi.user`. It forbids explicit `pi.*` kinds. The initial reserved-kind recommendation was incorrect and was withdrawn.

Machine-local verification artifacts are not distributed. See the public status and reproducible package tests.

Current connected tests use `apps/bb-adapter/tests/native-history-wire.mts`: real authenticated HTTP admission, native terminal submission and the actual `receipt.requestId` from the owner Storage. The earlier backend fixture reported the raw caller key in its constructed `inputs` field; that mapping was not canonical and is no longer consumed by this suite. The replacement explicitly proves native hash versus raw metadata are different, without computing a client-side alias or injecting an authorization callback.

The native fixture reports `inputKind` and `inputIsNativeUser`. It does not assume that application inputs match the narrower `UserEntry` token. During connected BB composition, the earlier raw-key equality check was corrected: it rejected genuine human/terminal Store input whose canonical native receipt is hashed. Metadata-only passive `host.input` entries without a canonical receipt now fail the whole capture instead of being presented as admitted users. This is an owning presentation-boundary correction, not a client-side authority grant or receipt rewrite. Client presentation normalization does not serve as the server fix. Full-profile independent acceptance remains open.

## Checks

From the repository root:

```sh
apps/dpi-backend/node_modules/.bin/tsc --strict --target es2022 --module nodenext --moduleResolution nodenext --noEmit --skipLibCheck apps/bb-adapter/src/history-sink.ts apps/bb-adapter/src/history-types.ts
cd apps/dpi-backend
node --import tsx --test ../bb-adapter/tests/history-sink.test.mts
```

PASS: strict source check and 7/7 tests. The recording loopback RPC server commits a snapshot, then destroys the socket before ACK. An explicit identical retry produces no second history mutation.

An intervening writer cannot be rolled back by a stale retry. Revoked and foreign-thread calls are denied before digest read or identical-content no-op. Receipt negatives cover wrong thread, malformed digest, invalid deferral and invalid mutation shape. The in-flight test confirms caller mutation cannot change the owned payload and concurrent apply is refused.

Machine-local verification artifacts are not distributed. See the public status and reproducible package tests.

Remaining work includes root/child binding, stable root clientRequestId, SDK transport and an authorized coherent-outcome endpoint. Native control, reconnect, packaging, independent review and real isolated BB smoke also remain open. Compile and this fixture do not close those criteria. No paid models, production or live BB process was used.

## License retained from selected source

```text
MIT License

Copyright (c) 2026 Diffuzmetall

Additional upstream notices are retained in NOTICE.md and licenses/ in the original source. The original provider is derived from the MIT-labelled `Diffuzmetall/bb-plugin-provider-pi-durable` 0.2.29 baseline. No prebuilt BB compatibility archive or dependency closure is included in this port.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
