# MCP observer isolation repair

Producer: Dave, task `b8586d3ed7e4464497a543b2367d43a3`.
Finding: Grace `b4d6a08923a3499e9c0dc1c7ac37d6dc`.
Status: source repair and dependency build verified. Independent resolution remains Grace's responsibility.
Production activation **NOT RUN**.

## Cause and smallest owning-boundary fix

Before the fix, `McpManager.changed()` called each public subscriber directly.
Staged `publish()` had already changed slots, ticket state and revision before calling it.
A synchronous observer exception therefore escaped after publication and skipped later subscribers.
Legacy `reload()` then attempted to discard an already published ticket, masking the observer error with `MCP_NOT_SENT`.
The session wrapper could not reach its `active = next` assignment after that exception.

`manager.ts` now catches each synchronous observer exception inside `changed()`.
An observer cannot veto a committed catalogue, poison connection notification, or prevent the next observer from running.
The fix neither defers the exception to a microtask nor adds a manager, lifecycle owner, retry, logger or callback configuration.
All original manager/adapter authorization, generation, admission and cleanup fences remain.
The public listener contract remains synchronous `() => void`; asynchronous rejected subscriber promises are outside this repair's verified scope.

Only the manager overlay changed in production code. The adapter, session wrapper,
shared core/profile/Store, original compiled bundle and accepted candidate were not edited by Dave.

## RED before the fix

`/tmp/hot-update-sandbox-2oh5f_fw/run.log`:

- Negative isolation self-check PASS; command exit1.
- Two new focused tests: **0 PASS / 2 FAIL** against the retained baseline `build/nico.mjs`.
- Staged publication threw `FIXTURE_OBSERVER_FAILURE` after mutation.
- Legacy publication rejected with `MCP_NOT_SENT` from discard of the published ticket.

The regression uses the actual built manager and adapter with a local protocol transport fixture.
It subscribes a throwing observer before a second observer, after `ready()`.
Both staged and legacy paths must publish successfully, notify the next subscriber,
serve the new descriptor, reject the old descriptor, and permit the next clean generation.

## GREEN exact build and corpus

`/tmp/hot-update-sandbox-r_sfrnks/run.log`:

- Negative isolation self-check PASS; combined command exit0.
- Patched manager and adapter: strict TypeScript PASS using the existing NodeNext configuration.
- Existing `build-nico.mjs`: **BUILT**, 2,524 inputs; pinned preimages verified.
- Manager corpus: **10 PASS / 0 FAIL**, including the two RED regressions.
- Unchanged real HTTP/session corpus: **4 PASS / 0 FAIL**.
- The same unchanged session corpus with throwing observers attached to every actual manager: **4 PASS / 0 FAIL**.
- Injection witness: `OBSERVER_SESSION_INJECTION_PASS {"managers":5,"notifications":26}`.

The test-only `observer-session-fixture.mjs` exports the same real manager factory,
attaches one throwing subscriber and one counter subscriber, and returns that exact owner.
It does not implement a replacement manager or session wrapper.
All four unchanged session tests run against it. The twenty-replacement HTTP test
therefore also exercises the actual session wrapper's active-source publication
while observers throw. Config rejection, discard, next calls, policy identity,
revoke, hidden tools, two sessions and final stream closure remain covered.

The normal and injected HTTP suites each report 23 initializations, 21 explicit calls,
and zero live SSE streams after final close. The manager corpus retains its held old call,
cleanup rejection, late factory and twenty-replacement tests. Cleanup failure still fences
another generation; observer isolation does not turn cleanup failure into success.

## Patch and artifact provenance

Source root remains the read-only accepted source:
`/home/ubuntu/Projects/master/experiments/pi-nico-mcp-candidate`.
The existing disposable subset `/tmp/eve-mcp-source-zHJX1TwW` was mounted read-only at `/candidate`.
No credentials/config/runtime data were added to that subset.

Build command inside the physical sandbox:

```sh
node /repo/experiments/sdk-host-cutover/build-nico.mjs \
  /candidate /scratch/nico-build \
  /repo/experiments/hot-update-20261101/mcp-source
```

Exact full build, strict-check, manager and both session invocations are recorded in
`/tmp/hot-update-sandbox-r_sfrnks/command.json`.
The RED invocation is in `/tmp/hot-update-sandbox-2oh5f_fw/command.json`.
The test helper is copied only into a disposable session fixture's `compiled/nico.mjs`;
`MCP_TEST_BUNDLE=file:///scratch/nico-build/nico.mjs` selects the real built module.

The tested build was copied without rebuilding to **`build-observer/`**, including
`PROVENANCE.json`, schema compatibility receipt and licenses.
The copied bundle hash matches the tested scratch bundle hash.
The baseline **`build/` is unchanged** and remains available for the RED regression.
Alice must use `build-observer/`, not the defective baseline build, for the next candidate.

`overlay.json` is unchanged: it pins original preimage and namespace hashes, not manager result bytes.
The new provenance records the final manager result hash and unchanged adapter result hash.
`manager.patch` now reconstructs the full final overlay from the pinned original manager.
`manager-before-observer.patch` preserves the earlier full patch;
`observer.patch` shows only this repair against the earlier staged manager.

Patch replay: `/tmp/hot-update-sandbox-plw02vkw/run.log`, negative isolation self-check PASS,
exit0, `MCP_MANAGER_PATCH_REPLAY_PASS`. Applying the full patch to the pinned original
produced bytes identical to the final overlay.

## Final SHA256

```text
299f9f785a40c295c20c1bae8858c3bf2725e63aec3ec160e5a70793cdc2df39  manager.ts
bb4998d2b709eaff13a034a3707a4aec35b683288d27a64500d647c64e1bd963  manager.patch
87b0724a8d5a01c46d487f71e10cf15db434c85bfeb7fd60d684646c0f23a5bb  observer.patch
4ac012202ca81685dd1e21fb1a7aa665cfe30a2b42cc08c37214118a89caca52  build-observer/nico.mjs
e4f780e57e6f4a62d7860a26f21be89a7cab1a3336f3d4e137c6dcfc2255e10d  build-observer/PROVENANCE.json
26c73469477cdc6d8cb4f13b82be51590ac68f06015d9a4554ffb52ff36c2ea7  ../mcp-manager-fault.test.mjs
3322cee7beecbf47fc1e5c7630f29b7d85ebda2b00cc665a1265ffbc596a7330  observer-session-fixture.mjs
8f4bc06a81d0658af25234ec25963dd8d85df4ac14d3ad1b3bc758e1c80ec613  overlay.json
```

## Handoff and remaining acceptance

Grace: review the exact corrected source and RED/GREEN evidence, then explicitly reconcile your finding.
Eve: perform the existing follow-up closure only after Grace's resolution permits it.
Carol: use the unchanged staged validate/publish/discard/drain interface with the corrected build.
Bob: parent closure still needs the exact follow-up output; this report does not complete that parent.
Alice: package the corrected bundle, provenance and licenses, retaining its changed-dependency metadata.
Heidi: independently test the same final installed manifest; source tests are not that acceptance.

No full OS resource census, production activation, release rollback compatibility
or auth incident resolution is claimed. Those existing blockers and owners remain.
