# iii signed client source component

This component preserves selected worker source `I/auth.ts`, the pure `domain.ts` job grammar, the namespace/config identity boundary from `I/session-binding.ts`, and the function IDs/transport boundary from `I/worker.ts`.
`SOURCE.json` records symbolic source identifiers, distinct original/local hashes and scoped producer verification. Independent local signed/native acceptance and standalone install are now complete; see [current public scope](../../docs/STATUS.md). This adds no production or live-provider certification.
Client runtime dependencies are public `dpi-sdk`, pinned `iii-sdk@0.24.6`, and Node's standard library.
No native Storage, Harness, launcher, native session directory or job queue participates in the client. Native job/control/result algorithms belong to the existing host owner; server-only test fixtures are not packaged.

## Contract

- `canonical(value)` returns sorted JSON bytes for JSON values.
- `fingerprint(value)` returns the SHA-256 digest of those bytes.
- `signed(privateKey, sessionId, functionId, payload, expires?)` creates the original Ed25519 envelope.
- `new Admission(publicKey, expectedSessionId, clock?, mode?)` creates the verifier.
- `admission.authorize(expectedFunctionId, untrusted)` returns only the admitted JSON payload.

The default mode is `signed`.
The public key must use Ed25519.
The expected session and function must come from trusted server configuration, not the request body.
The verifier checks the exact envelope fields, signature, session, function, expiry and 65,536-byte envelope limit.
Expiry must be a safe integer after the current time and at most five minutes ahead.
The verifier removes the unsigned `_caller_worker_id` hint before signature checks.

The explicit `local-iii` mode preserves the original trusted in-process ingress branch.
It removes the worker hint and checks the canonical payload size without a signature.
Do not expose this mode on an unauthenticated public route.
Do not select this mode from caller metadata.
The helper never returns an actor identity, native grant or human authority.

## Source changes

The relative TypeScript imports now use `.js`.
The local domain module contains only the original pure `Json`, `record`, `string`, `requestKey`, `Input` and `input` definitions; it imports no native runtime.
One canonical array correction rejects sparse holes, like explicit `undefined` values.
The original `map` skipped holes and made a one-hole array collide with the empty array.
Dense JSON arrays retain their original canonical bytes.
No signature, envelope, expiry or admission policy changes accompany that correction.

The standalone worker uses signed ingress only. The preserved helper's explicit local-iii branch is not an exposed unsigned client route. Worker configuration retains the original canonical full-config fingerprint and namespace restriction, replacing local filesystem launch/binding tickets with an explicit server session/root/grant binding. The bearer lives outside JSON in an explicitly selected environment variable; signer identity is the canonical SHA-256 of its public PEM, never a caller worker hint. Native receipt IDs, immutable answer references and parent-control envelopes pass through the public SDK without local aliases or polling.

## Acceptance boundary

The SDK job adapter maps the trusted signer/config/namespace to a current delegated server proof before engine registration and each operation. The actual server independently authorizes native reads, transactions and controls.
Payload fields and worker hints never supply identity or parent authority.
The actual native server owner, not this client, preserves request receipts, retry fingerprints, policy revisions and immutable result references.
Signature checks alone do not establish job deduplication, child-control scope, revocation or durable result delivery.
Pure component checks do not close ISC-32, ISC-33 or ISC-34. The producer's strict installed-public-SDK and installed actual-native checks passed on the named tuple; independent iii/final acceptance remains separate.
Acceptance order remains terminal, then BB, then iii.

## License boundary

The fork retains the upstream IndyDevDan MIT notice in `LICENSE`.
The selected source owner separately confirmed ownership and MIT publication rights: Copyright (c) 2026 Diffuzmetall, MIT. This is an owner-authorized copy; the original private package flag does not prohibit it. Source hashes and adapted local hashes remain distinct in `SOURCE.json`. Donor identifiers are provenance labels, not dependencies on a private checkout. No publication action, deployment or production permission forms part of this client output.

## Preparatory verification (historical)

`tests/auth.test.mts` uses disposable generated Ed25519 and EC keys without external calls.
Five tests cover canonical bytes, invalid JSON, sparse holes, signatures, tamper, scope, expiry, size and worker-hint spoof attempts.
The focused strict TypeScript check includes both source files and the tests.
No personal key, live iii engine, native session data or model call participates.

## Client candidate checks

`npm test` covers twelve generated-key ingress/config/input, actual public SDK handle construction, and pinned iii WebSocket namespace/reconnect tests. Focused strict types for those pure modules pass. The loopback engine is a function-transport fixture, not a production iii engine. It uses a temporary HOME and no inherited iii token; the actual iii SDK's ordinary process marker stays inside that HOME.

`test:native` requires exact separately installed backend and client paths, never moving-source imports. Its server-only helper uses public import-only exports, the genuine existing native owner/storage, explicit in-memory credentials and only a faux provider. Full strict client compilation now passes against the installed immutable SDK, including native iii info source/workspace and iiiRun. The signed actual iii SDK/loopback-to-native fixture passed: admission/lost ACK, client replacement and owner reopen, identical retries and body/mode conflicts, immutable late answerRef and paging after cursor loss, foreign/stale/revoked controls, child receipts and pending native stop reconciliation. There is no any, ignored error or neighboring SDK-source alias supplying these declarations. Producer verification is not independent P5 acceptance, production engine evidence or permission to migrate live data.
