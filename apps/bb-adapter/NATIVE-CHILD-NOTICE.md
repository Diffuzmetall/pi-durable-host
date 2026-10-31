# Existing native child → BB binding: source and limits

Preparatory P4 output for ISC-28/30, Feature F3. This is not BB acceptance and does not close either criterion. Acceptance remains terminal → BB → iii.

## Callable contract

`native-child-binding.ts` exports `nativeChildKey(identity)`, `nativeChildRegistrationRequestId(child)` and `projectNativeChildInBb(child, owner, port?)`. The port is the existing BB Core `registerExisting(request)` capability. It returns only a confirmed existing BB thread ID; this module cannot start a native conversation, submit a prompt, or replace parent-control.

`owner` must come from the adapter's trusted binding, not an untrusted incoming tuple. Local identity/parent checks are routing preflight, **not authorization**. Core must validate current credentials, native ownership and persistent provider/thread binding on every request, including an identical retry. A matching tuple or the returned frozen routing object does not grant native execution/control rights.

The stable request ID is preserved across an explicit retry after response loss. The function performs one request; it never silently retries, creates a replacement child or promotes it to root. Missing registration support, an unconfirmed receipt, or a rejected request produces explicit `projection-unavailable`. Consumers must preserve that state rather than falling back to spawn-with-prompt. The actual authenticated Core route remains responsible for idempotent persistent registration.

## Provenance

Byte-identical copy of selected read-only source:

`/home/ubuntu/Projects/master/experiments/pi-durable-1.4-upgrade/provider-lane/src/projection/host/native-child-binding.ts`

SHA-256: `8488901ffd22f056bbfe497e778ca966c8f1976faedbd488506d989f423ec703`.

There are no import/dependency changes and no native runtime imports. No provider framework, Harness, SQLite, installed release, compatibility archive, or private credentials are a product dependency of this module. This is the existing projection-path algorithm, not a replacement registration authority.

## Verification

From repository root:

```sh
apps/dpi-backend/node_modules/.bin/tsc --strict --target es2022 --module nodenext --moduleResolution nodenext --noEmit --skipLibCheck apps/bb-adapter/src/native-child-binding.ts
apps/dpi-backend/node_modules/.bin/tsc --strict --target es2022 --module nodenext --moduleResolution nodenext --noEmit --skipLibCheck --types node --typeRoots apps/dpi-backend/node_modules/@types apps/bb-adapter/tests/native-child-binding.test.mts
cd apps/dpi-backend
node --import tsx --test ../bb-adapter/tests/native-child-binding.test.mts
```

PASS: both strict checks and 5/5 tests. Logs: `/tmp/bob-child-binding-types.log`, `/tmp/bob-child-binding-test-types.log`, `/tmp/bob-child-binding-tests.log`.

Tests cover stable/collision-free identity, explicit request IDs, mismatched or invalid owners before port access, missing port, malformed/rejected receipts, immutable confirmed binding and optional wire fields. A real loopback HTTP recording port commits registration, destroys its socket before ACK, refuses a revoked identical retry, then confirms exactly one existing child on an authorized identical retry. A forged internally matching routing tuple is still denied by the recording Core grant. No prompt/spawn fields are emitted.

The recording service and native IDs are synthetic: this does **not** execute native parent-control, exercise actual BB Core authorization/provenance, or prove production attach. Root binding, SDK transport, native admission/late outcomes, recovery, packaging, independent milestone QA and isolated compatible BB smoke remain open. No paid models, live BB, production stores or external services were used. No source changes were made outside this fork.

## License retained from selected source

MIT License

Copyright (c) 2026 Diffuzmetall

Additional upstream notices are retained in NOTICE.md and licenses/ in the original source. No dependency closure is copied by this single-source port.

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
