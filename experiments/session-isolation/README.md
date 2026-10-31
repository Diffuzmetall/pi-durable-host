# P0: session isolation decision

Status: executed placement probe, **not full-profile acceptance**. Producer carol; consumer runtime owner alice. No production files, databases, services, credentials or models are used. Run from the fork with `node experiments/session-isolation/probe.mjs` (Node standard library only).

## Decision

Choose **one native session owner per child process for the full existing profile**. The HTTP backend retains the catalog and API, never a second owner of a worker's SQLite. This is a process placement decision, not a new runtime/framework or transparent Harness proxy. Implementation still needs the limited operation boundary below. Until that is implemented and verified, the existing in-process minimal profile is a pilot, not full-profile multi-session readiness.

A narrower alternative is session-local logging plus explicit Mail identity plus a non-global dispatcher. That would be smaller only if *all consumers* accept explicit per-session state. The currently copied adapter demonstrably does not: unchanged bind defaults persist process-wide. Fixing only `Store.openAgent({cwd})` or overwriting env before each request cannot satisfy concurrent sessions. Installed packages are read-only; a later local integration migration could remove these globals, but it is not proven by this probe and supporting two product process modes is not proposed.

## Fresh results

`node experiments/session-isolation/probe.mjs` exited 0:

- PASS reproducer: same-process cwd stays local; session B's log/diagnostics/usage paths point into A's directory; A sees B's later Mail env. The copied adapter's bind implementation executes unchanged, with only its imports redirected to recording dependencies.
- PASS process fixture: two child processes have distinct cwd and three log paths, faux Mail agent/project and files. After A closes/exits, B returns its unchanged context and continues writing only its own file.
- NOT_TESTED: real Harness close/recovery, Hindsight context generation or remote client, MCP Mail closure/grants, runtime dispatcher, full profile registration, owner locking, saved definitions, full-profile ISC-14/43. The recording controller only demonstrates the placement boundary; it does not prove actual memory isolation.

`recording-deps.mjs` deliberately throws if the adapter attempts config or memory resolution. Child environments remove the five tested variables before startup; no server/network call is made. Test-owned temporary directories are removed after children exit. No process cwd is changed. The Mail assignments are the two exact lines from the pinned runtime callback with faux values; existing MCP closures may retain local identity, and this probe does **not** assert all existing closures change identity.

## Pinned source / provenance

Installed release root (read-only): `/home/ubuntu/.local/share/pi-durable/tui-releases/20261028-4rmMfRfc`.

| Source relative to release root | Local evidence | SHA-256 |
| --- | --- | --- |
| `extensions-lane/packages/hindsight/src/adapter.mjs` | Complete copy `snapshots/hindsight-adapter.mjs`; bind wrapper lines 71–85 exercised | `544618e9c747a100eb4468de35666180a0cec735111533365af936cbc13fb48f` |
| `host-lane/host/packages/coding-agent/src/core/http-dispatcher.ts` | Complete copy `snapshots/http-dispatcher.ts`; source-only, proxy env and global dispatcher/fetch | `d64922c476d11b90555b8f23cab92ce1f4f83174cb750c125a96d8d4374744e2` |
| `host-lane/host/packages/coding-agent/src/experimental/durable/runtime.ts:283–291` | Mail callback excerpt in `probe.mjs`; no complete runtime copy | not a pinned full-file snapshot |

Probe SHA-256: `3912cd7277dff1fd983babbcb75c3dd0394768bdf2e692254e169ce40a2757a0`.
Recording dependencies SHA-256: `16c54eeb43259d20ca9548f76d23e9d1d00177c91ccc2f84dd641a712ce13b02`.

Copies preserve original comments/imports. The snapshots are evidence, not executable production dependencies; the dispatcher snapshot is not imported by the test. They require no installed release paths to rerun. This experiment introduces no package/dependency or manifest change.

## Minimum session-operation boundary (source inspection)

Source navigation was native `rg` + `read`; CodeGraph tool discovery returned no available tool. Baseline files inspected: `apps/dpi-backend/src/store.ts`, `routes.ts`, `streams.ts`.

| Existing consumer | Current native object use | Necessary worker operation/result |
| --- | --- | --- |
| routes session tasks/abort/inspect/submission lookup (`routes.ts:80–109`) | `store.harness(row)` passed directly to methods | bounded task query, authorized native control, inspect projection, submission reconcile/wait/cancel-wait |
| agent middleware + agent routes | `{row,h,c}` from `resolveAgent`; native `Conversation` passed to send/config/fork/history/abort/compact/reset/docs | identify conversation by ID; explicit message/admission, config, history, fork, control and document operations; no arbitrary method dispatch |
| session stream (`streams.ts:160–190`) | `watchTaskGraph`, commit subscription, agents/usage and labels | initial session projection + ordered changes, subscription unsubscribe; worker death becomes owner-unavailable |
| agent stream (`streams.ts:195–233`) | `watchEvents(h,c.id)`, inbox/docs, commit subscription | initial conversation snapshot + ordered events/inbox/docs; reconnect snapshot, independent consumer close |
| `Store.openAgent`, archive, close | open storage/Harness, resume, commit subscription, close/unlock | worker owns storage/registry/integrations/lock/resume/close; parent holds IDs/catalog and lifecycle handle only |
| demo jobs/state/add-ons routes | native docs/tool tasks | retain for demo profile only if requested; do not require these operations for minimal/full production composition |

The worker boundary therefore affects **three coupled owning files**, not just a factory argument. Keep request validation/auth in routes before dispatch and native policy/revision checks in the owning process. Request IDs must survive IPC and native admission; on disconnect/worker death do not re-execute to manufacture an ACK. Stream closure cancels only observation, not accepted execution. Do not serialize live Harness/Conversation instances, JS closures, registry objects or storage handles.

This output intentionally does not build a speculative worker API ahead of the runtime owner's 1.4 evidence. It supplies the callable/data requirements and a falsifier for unsafe placement. Follow-up full-profile verification must run real two-session integration recording endpoints and native close/recovery before marking ISC-14/43 satisfied.
