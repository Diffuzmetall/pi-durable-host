# MCP source output for S5

Eve delivered baseline source task `3101d74151814d14871189b969a5a78a`.
Dave's observer repair `b8586d3ed7e4464497a543b2367d43a3` supersedes its manager and bundle.
**Use `build-observer/nico.mjs`, not the baseline `build/nico.mjs`.**
See [observer repair evidence and final hashes](OBSERVER-REPAIR.md).
The existing baseline build is retained unchanged for the RED regression.

Grace independently resolved the synchronous observer finding in publication
`5fb3cb5858474ceb97ee88b710260881` (sequence 445), only for the corrected hashes.
Eve's follow-up is task `c86f7fc30e834857bb567ac93d80ca22`.
The corrected sandbox `/tmp/hot-update-sandbox-r_sfrnks` passed strict types,
10 manager tests, 4 normal HTTP/session tests and the same 4 session tests with
throwing observers on the real manager. Eve verified the supplied logs, all eight
repair hashes and copied bundle/provenance correspondence; no duplicate test run.
The staged interface below is unchanged. Asynchronous subscriber rejection is
outside the verified synchronous `() => void` observer contract.

Current artifact SHA256:
`4ac012202ca81685dd1e21fb1a7aa665cfe30a2b42cc08c37214118a89caca52`.
Current `build-observer/PROVENANCE.json` SHA256:
`e4f780e57e6f4a62d7860a26f21be89a7cab1a3336f3d4e137c6dcfc2255e10d`.
This is a tested dependency/session output, **not** installed Host acceptance.
Production activation **NOT RUN**.

## Existing owner, minimal source patch

Source root (read-only):
`/home/ubuntu/Projects/master/experiments/pi-nico-mcp-candidate`.
Only original `packages/durable-mcp/manager.ts` and
`node_modules/pi-mcp-adapter/host-managed.ts` are overlaid. The accepted source,
old compiled bundle, installed dependencies and previous candidate remain unchanged.

`manager.ts` adds unpublished preparation on the same manager, with the same
transport, descriptor, authorization and call ownership. Publication replaces the
slot map synchronously; admitted old calls finish before retirement closes their
transport. Old descriptors cannot begin another call. A further resource candidate
is refused while retirement is pending or after cleanup failure. Public legacy
`reload` still returns after publication rather than waiting for old calls.

`host-managed.ts` reports rejected/deadline-exceeded transport cleanup with a fixed
error. An unresolved transport factory remains owned until its late result closes;
a five-second shutdown deadline is failure, not successful cleanup. No retry,
second manager, credential migration or identity registration was added.

`session-mcp.mjs` now captures credentials against each configuration snapshot,
retains the existing project/actor identity and revoke policy, and stages the
candidate catalogue for the existing native bridge. Unsupported capabilities and
configuration changes at the validation fence reject the candidate. The original
void-returning Mail authorization fix is preserved.

## Exact integration interface for Carol

```ts
const staged = await mcp.prepareReload();
// staged.sources: native CodeMode source objects, candidate listTools catalogue
// staged.shellEnv: existing Mail project/actor projection, never the token
// staged.status(): candidate status, no secrets

// Prepare and validate the native extension replacement from staged.sources.
// Preserve requireOwner, native task identities and the existing compatibility checks.
// At the final publication fence, after any asynchronous native validation:
staged.validate(); // synchronous: config and manager generation checks, no mutation
// In the same synchronous commit, without await:
staged.publish();  // no filesystem/network I/O; active sources change here

await staged.drain(); // OUTSIDE native transaction/commit callback
```

For any rejection **before publication**, call `await staged.discard()`.
`discard` closes only candidate transports, never the active generation. It is
idempotent before publication and refuses to discard an already published ticket.
An unpublished candidate's source calls are denied by the original manager fence.

`publish` requires successful `validate`, a still-current ticket and an open owner.
These checks refuse stale/misused tickets before mutation. With validation and
publication in one synchronous native commit, no asynchronous owner notification
can interleave. Publication must not be followed by an artificial rollback merely
because asynchronous retirement later fails.

`drain` retains admitted old calls and their result. A cleanup rejection remains
visible as `cleanup_failed` in active manager status; it does not undo publication.
Another `prepareReload` refuses pending/failed cleanup. The integration must
report applied publication separately from retirement failure and must not retry.

The existing profile return type, trusted `mcp-codemode` replacement, runtime
preparation cleanup and Store initial-open path are Carol's scope. This output
**does not implement those shared changes**. Initial manager startup already owns
the initial sources; preparing unchanged sources retains those slots and creates
no second transport owner. Validate/discard/drain must also be reconciled with
Store's pre-bind initial-open preparation.

## Build and provenance

Original manager preimage SHA256:
`afffa830723f9b18620a63c13257fc8a5c02e485d1a1b984a6dcd622a1dcbc71`.
Original adapter preimage SHA256:
`fc67788b34b111f85d4a79320fc14091c4e25dd9d7356e81b30c562310a6b7ca`.

Full modified sources, unified `manager.patch` / `host-managed.patch`, pinned
namespace source and `overlay.json` are beside this file. The existing
`experiments/sdk-host-cutover/build-nico.mjs` accepts that optional source overlay.
It verifies the accepted artifact/patches/adapter preimages first, then verifies
both overlay preimages. The old null-constant/schema compatibility patch remains.
No hand editing of `compiled/nico.mjs` occurred.

A disposable read-only source copy at `/tmp/eve-mcp-source-zHJX1TwW` contains only
packages, node_modules, artifacts, patches, package.json and the artifact receipt.
It excludes config, credentials, sessions and runtime data. The sandbox mounts it
at `/candidate`; build output is `/scratch/nico-build`.

Build command **inside the physical sandbox**:

```sh
node /repo/experiments/sdk-host-cutover/build-nico.mjs \
  /candidate /scratch/nico-build \
  /repo/experiments/hot-update-20261101/mcp-source
```

The corrected tested output was copied without rebuilding to
`mcp-source/build-observer/`. It contains `nico.mjs`, `PROVENANCE.json`, schema
patch receipt and licenses. Provenance records 2,524 inputs, overlay source root
and manifest hash, preimage/result hashes, esbuild version, the retained schema
patch and output hash. The earlier `mcp-source/build/` is a retained defective
baseline, not the artifact to package.

Alice must deliberately package **`build-observer/`** with its provenance and
licenses and update the dependency metadata. The old `NICO-PROVENANCE.json`
assertion of an unchanged preserved bundle does not describe this new output.
Final Host packaging remains Alice's work.

## Baseline verified candidate (superseded by observer repair)

Physical sandbox: `/tmp/hot-update-sandbox-823mg6ri`.
Read `command.json` for the complete exact argv/mounts and `run.log` for outcomes.
Negative isolation self-check **PASS**; combined command exit **0**.
Strict TypeScript check with the accepted project's strict/NodeNext settings
**PASS** for the patched manager and adapter.

Manager suite: **8 PASS / 0 FAIL**.
Session/real HTTP suite: **4 PASS / 0 FAIL**.

- Twenty healthy replacements: opened 21 instrumented transports, closed 20,
  one active; final close yields 21 closed and zero active.
- Injected close rejection: only two generations opened, one close failure
  surfaced, no third generation; subsequent prepare rejects `cleanup_failed`.
  Two instrumented fixture transports remain logically unclosed by design.
- Ignored factory cancellation: the deadline reports cleanup failure, forbids
  another generation and closes the late transport without adoption.
- Staging/discard preserves the old callable descriptors; unpublished descriptors
  cannot dispatch. Failed connection preparation also preserves the old generation.
- An admitted old call completes with its old result after publication; the next
  explicit call uses the new transport. Final close also sweeps retired generations.
- Real local HTTP/SSE fixture: 23 initializations (initial + two discarded +
  twenty published replacements), exactly 21 explicit tool calls, one active SSE
  stream after every successful retirement and zero after final close. There is
  no automatic replay. Server-side SSE close events are awaited explicitly.
- A config race refuses validate/publication and closes only the candidate.
  Unsupported capabilities refuse preparation before replacing the old source.
- Existing Mail identity/project scope and synthetic token survive a real
  transport change; impersonation/registration are denied and grant revoke still
  blocks calls. Hidden tools and two-session isolation remain covered.

These are instrumented transport and actual fixture SSE counts, **not** a claim
that remote protocol session IDs were DELETE-terminated or an exhaustive OS census.
An earlier fixture incorrectly treated transport.close as remote DELETE; it was
corrected to measure the actual SSE resources that this transport owns.

## Combined resource evidence for independent QA

| Owner | Verified evidence | Remaining boundary |
| --- | --- | --- |
| MCP | Twenty real transport replacements; held old call; cleanup rejection; pending factory; actual SSE stream closure | Full installed Host/native schema validation and OS handle census |
| Memory | Bob's DONE386, report `../memory-mcp-s5.md`, sandbox0aq8k0j1: twenty prepared code replacements, stable controller/banks/log paths, one subscription per live session, A close preserves B | Not twenty replacements of an external memory resource; shared HTTP/profile wiring pending |
| Voice | Dave's DONE396 and `../voice-s5.md`; separate producer evidence | Not verified by Eve; real microphone/provider boundary remains outside synthetic probes |

The common native profile/Host integration and independent installed acceptance
remain unaccepted. This source output does not close whole S5, release rollback
compatibility, the auth incident or production activation.

## Baseline hashes (historical; current hashes are in OBSERVER-REPAIR.md)

```text
9708dee80bc46e0c15db7eb8b69d122d7311902645870d1316ebf5df8557b1bc manager.ts
24d206334961af0e751e4b0578536ac45bf88d598c2a66bef6310fe1c5ef7578 host-managed.ts
bccc1ce359064910b35309fb8cc9b8a54dd4b9a7813aaf96637591d592f6f88a manager.patch
f175cda9a255dbcdbc7e89348ba273702e6786d39d90c659eb8fb1e967e1bcdf host-managed.patch
8f4bc06a81d0658af25234ec25963dd8d85df4ac14d3ad1b3bc758e1c80ec613 overlay.json
43a0cd83e7d92e35d7cbb10626c7cc7372fdb89c062627b86f389996422ee368 build/nico.mjs
ae384bd347fb88e0a13a018aa414e38af1b5ca7bc5b32ee949d0f3984c5fedfc build/PROVENANCE.json
8bdd733d37590930e550c0c2f788ac7a50860dbd8d2bf8e96d6352dac072d391 ../../sdk-host-cutover/build-nico.mjs
773dfa8c44790794c12c122dabe39c79918d9900c09d5994475523a50fcdb8f8 ../../sdk-host-cutover/session-mcp.mjs
de80c9c6adfa0337d1b49cde257af56208ffd5d9ec0d0f02f43eab3a784651c4 ../../sdk-host-cutover/session-mcp.test.mjs
925f03db24aebec1b3cf32bb9d02c6d70b00c11489919bc1261a0e66d2bc6a35 ../mcp-manager-fault.test.mjs
```
