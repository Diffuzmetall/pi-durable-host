# Durable BB adapter

A standalone BB provider client of **public `dpi-sdk` only**. The backend remains the sole native Durable owner. The package contains no Harness, SQLite, provider runner, private runtime loader, compatibility archive or execution queue.

Local functional acceptance used actual BB Core 0.47.1/Chrome and a native faux host, with a retained unexplained initial UI timeout and two successful bounded controls. This is not production activation or a latency SLA. See the source checkout's [status](../../docs/STATUS.md) and [portable Core compatibility guide](../../compat/bb-0.47.1-native-child/README.md): stock BB lacks the prerequisite native interfaces; full upstream source rebuild was not tested.

## Run through the existing BB Core transport

Install the local BB and matching SDK tarballs together, without running install scripts. Launch `dpi-bb-provider` as the provider's JSON-lines process. Its standard output is exclusively the existing BB JSON-RPC protocol; it does not launch a backend.

The trusted operator launch context supplies:

- `DPI_BASE`: the existing host URL.
- `DPI_TOKEN`: a server-issued **BB** credential, passed in the environment, never in an RPC body or command argument.
- `DPI_SESSION`, `DPI_BB_THREAD`, `DPI_CWD`: exact existing native session ID, BB Root thread and canonical **remote** cwd.
- `DPI_CONVERSATION`: native Root conversation ID, default `1`.
- When the selected Core uses prepared Root enrollment: both `DPI_BB_ENROLLMENT_FINGERPRINT` and `DPI_BB_ROOT_PROFILE_FINGERPRINT`. Native identity is checked before actual Core confirmation; the confirmation ACK must name this exact Root.

The server credential needs trusted `source: 'bb'` and binding `{ sessionId, conversationId, bb: { providerId: 'pi-durable', threadId } }`. Its actual permissions/authority determine what works. The client cannot provision credentials, change the binding, promote a child or acquire human authority. A read-only attachment does not configure a model or interrupt work.

Required native capabilities include BB binding, native parent control and exact-target inspection, coherent BB outcomes, and `native-bb-input.v1`. Model discovery/configuration additionally requires the agent-scoped native catalogue. An old host is refused rather than silently losing input provenance.

Supported selected-provider methods: `initialize`, `model/list`, `provider/health`, `provider/usage`, `thread/start`, `thread/resume`, `turn/start`, `turn/steer`, `thread/stop`, `thread/discard`. The reverse methods are the actual `thread/getOwnerScope`, `thread/confirmRootAttachment` when configured, `thread/registerExisting` and `thread/reconcileExisting`.

`thread/start` is an **explicit** first Root binding, idempotent on the same binding. Resume never falls back to first binding. Controlled fork and provider installation are unsupported. Skill configuration is not falsely advertised or acknowledged. Text input is supported; attachments are explicitly refused. Root and child `/compact` commands are rejected before native effects with `BB_COMPACTION_UNSUPPORTED_IDEMPOTENCY`: the current public native compaction API has no canonical request key, so accepting a retried Core intent could create duplicate tasks. This does not change the terminal/SDK compaction API.

## Library API

`BbProviderBridge(sendRaw, options)` implements the same transport in an existing process. Admit `handleLine()` calls independently: a pending Core request must not prevent admission of its reverse-RPC response. `shutdown()` detaches viewers and rejects outstanding Core requests; it does not terminate native work.

`BbThreadSession.bindRoot(options)` explicitly binds; `open(options)` requires the existing binding. The `core` callbacks must be backed by the real authenticated Core channel, not model-provided objects. Scope tuples are routing checks, **not authority**. Actual native authorization and ownership are checked on the server too.

- `prompt(text, clientRequestId)` / `steer(text, clientRequestId)` retain genuine Core `creq_…` IDs as `bb-root:<CREQ>` in the request metadata. Native canonical receipt IDs remain native hashes; the client does not rename them.
- `observe(signal)` translates native Root frames through the selected BB message/tool presentations, discovers native child locators, proves each with native `inspect(target)` **before** real Core registration, persists only the real Core ACK, and observes coherent child history. No input or unknown command is replayed on reconnect.
- `registerChild(exactNativeTarget)` never creates a native child. Lost Core registration ACK retries the same namespaced request; no ordinary provider/session fallback exists.
- `openChild(threadId)` requires current Root and child Core scopes plus the server's persisted binding. Explicit cached reopen retries the original immutable unacknowledged history attempt before fresh capture; concurrent opens await the same acknowledgement and return the same child.
- `configureSelection(model, thinkingLevel)` is explicit Root execution configuration. IDs and levels come from this native container; unsupported or missing saved selections are errors, never replaced by a first available model.
- `interrupt()` interrupts the exact Root only. Child controls use native parent `stop(scope: 'child-tree')`, never generic child abort.

`BbChildSession.prompt(text, CREQ)` / `steer(text, CREQ)` accept the **existing Core signature**. Initial document IDs are locators only; native exact inspection supplies the admission revision. After process reopen, the original target/revision is recovered from the native canonical receipt's `retryContext`. The same Core text and mode are POSTed again, so the original native fingerprint checks identical intent or returns conflict. No client journal or guessed fresh revision exists. Missing historical context is explicitly unavailable.

The actual native BB input receipt is `bb-child:<CREQ>` and satisfies the unchanged Core `nativeControlWasAdmitted` predicate. A receipt-only cached answer would not prove unchanged intent and is not used for send retries. Changed text/mode under the same CREQ conflicts.

Child `captureHistory()` and `observe(signal)` accept **only** coherent native outcomes. `unknown` and working captures without entries are not terminal success. Canonical receipt entry membership, not raw `host.input` metadata, admits presentation normalization. Native hashed request IDs are preserved. Thinking is omitted with source-only accounting; unsupported history rejects the whole capture.

Child connection diagnostics go to coarse stderr, never an unowned live Core transcript item that would poison native-history CAS. Root retains its ordinary connection diagnostic.

A lost history ACK freezes one immutable snapshot and expected digest. `retryHistory()` sends that exact attempt; it does not read a new digest, recapture or rebase. A Root/child view release only detaches observation. A running child interrupt needs the Core's stable active-turn ID; already-authoritative terminal work is not interrupted again. A pending native stop is not reported as a completed child outcome.

## Source and verification boundaries

See `NOTICE.md`, `SOURCE.json`, `HISTORY-NOTICE.md` and `NATIVE-CHILD-NOTICE.md`. The source checkout includes licensed portable Core patches and verbatim test-local history/admission/provider-health contracts with provenance; no private donor filesystem is required. `tests/` may import the sibling backend; those fixtures and the Core patches are not adapter runtime dependencies.

Use `npm run check`, `npm test`, `npm run build` and `npm pack`. Tests use disposable native Harness/SQLite stores, the real native parent/binding/coherent services, deterministic faux providers, loopback fake Core, the original Core schema/admission predicate and generated identities. They do not use a live BB service, real model, external paid API, production DB or personal memory bank.

The previous terminal tarball must remain byte-identical and interoperate with the same new host. No claim about live historical BB aliases, production activation or cross-version data migration follows from these fixtures.
