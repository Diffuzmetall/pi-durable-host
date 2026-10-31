# Remote terminal adapter

This package keeps the selected existing Pi terminal UI and connects it to the host through `dpi-sdk` and HTTP/SSE. It does not create a Harness, open session SQLite, execute model tools, or own native tasks. Closing the terminal detaches the client; it does not cancel the host's work.

## Run

Install the SDK and terminal artifacts from the same verified candidate, without the BB or iii adapters. Native Goal controls require the SDK's Goal helpers; an older SDK is refused before mutation:

```sh
npm install /path/to/dpi-sdk-0.1.0.tgz /path/to/dpi-terminal-adapter-0.1.0.tgz
# Supply an existing server-issued human credential through DPI_TOKEN.
# Do not put credentials in a URL or a command-line argument.
npx dpi-terminal http://127.0.0.1:PORT SESSION_ID
```

`DPI_URL` and `DPI_SESSION` can supply the positional values. Use HTTPS outside a trusted loopback connection. Server authorization remains authoritative: selecting a session does not grant access to it, and the client cannot turn an observer or delegated credential into a human grant.

The original editor, tool cards, conversation navigation and root interrupt remain in use. Child Escape returns to the previous conversation rather than aborting the child. `/sessions`, `/name`, `/new`, `/tasks` and `/quit` use remote state or local presentation only. The footer marks an offline or reconnecting projection instead of treating it as current state. Unknown render kinds become bounded inert text. Git is shown as unknown until the server supplies workspace metadata; the client's checkout is never presented as the server's branch.

## Terminal program status (OSC 7501)

The existing Pi 1.4.0 `ProcessTerminal` reports one `app=pi` root record for the displayed conversation. Native support negotiation and `PI_PROGRAM_STATUS=1|0` remain authoritative; unsupported terminals receive no status records. Active runs, tool execution, retries and deferred responses report `working`; compaction uses `Compacting`. Final successful answers report `done`, aborted/unknown outcomes remain `idle`, and final failures report `error` with only the first error line. New inputs/reset invalidate old completion; disconnected snapshots report idle with a fixed connection label, never historical success.

Model, conversation and session pickers report `blocked:kind=question`; closing them restores the latest underlying state. Pending supervisor requests use the fixed `Agent decision required` label, never request contents. Generic informational panels are not blocking dialogs. Status messages contain only session names, fixed dialog labels or the first error line, not prompts, answer text, tool output or supervisor question content. The native terminal clears the record on detach. Startup and later subscription/render failures return to the UI lifecycle owner for cleanup; a failing unsubscribe cannot skip terminal stop. Failure teardown uses native `preserveScreen` to avoid rendering the broken view again while leaving the alternate screen. The error is then propagated to the caller. The remote adapter has no local login/permission dialog path to wire; it does not invent one or interpret arbitrary tool activity as a permission request.

The exception-safe lifecycle is a local adapter patch, not an upstream dependency update. `src/ui/SOURCE.json` retains the imported baseline in `sourceSha256` and records the current adapted file in `candidateSha256`.

## Delivery and reconnection

Before sending input, the client saves a request key and the exact text, conversation and busy mode in a private journal. Message delivery, Goal mutations and read-only Goal inspection have distinct journal kinds. An uncertain Goal mutation retains its original key/body while inspection remains available; legacy message journals still load safely. The cache is partitioned by a one-way host/credential digest, under `~/.local/state/dpi-terminal/`; it contains input text and must remain private. Credential values are not written there.

A lost ACK leaves the delivery uncertain. Reconnection checks the original receipt but never replays input automatically. Explicitly re-entering the unchanged input retries the saved key. Changed text or busy mode cannot replace an uncertain delivery. Distinct explicit inputs while an earlier ACK is still in flight receive distinct keys. Corrupt journals fail closed.

Reconnection starts with the authoritative snapshot and replaces the entry list, then applies subsequent stream frames. The projection never answers pending inbox requests. It requests only advertised, known profile document kinds. Native supervisor requests stay in the existing dock until answered or cancelled; Goal headers and schedule counts come from saved native documents, not inferred model text. Unsupported document shapes get an explicit unavailable marker. Full documents remain in the read-only view; the presentation header is not a replacement Goal contract. No local timer, client exit or stream reconnect accepts a human criterion or cancels a host task.

## Native controls

`/goal` operator commands use the authenticated native Goal command/receipt API, never model text. Native tasks own the effect. A lost ACK retries the saved key; reopen reads receipts without replay. An uncertain effect remains explicit and the same command key is retained. `/goal new` without JSON keeps the original natural-language setup request.

Interrupt uses the native conversation API and the server's actual protection method. The selected session-Goal service deliberately leaves ordinary root foreground execution interruptible; the client does not invent a `/goal stop` or generic task abort. A compatible profile's protected-execution response preserves the existing “Goal continues” feedback. Thinking cycles the model's advertised ordered levels, including `max`; absent or future metadata causes no mutation, not a guessed fallback.

## Checks

From this package:

```sh
npm run check
npm test
npm run build
python3 tests/probe.py
python3 tests/program-status-pty.py
python3 tests/latency-probe.py
node tests/pack-probe.mjs /absolute/path/to/dpi-sdk-0.1.0.tgz
```

The OSC 7501 lifecycle regression also runs under `node --import tsx --test tests/*.test.ts` (Python 3 and POSIX PTYs required). Its ten no-network cases use temporary HOME/data directories and the real `DurableTui`/`ProcessTerminal`: overrides, negotiation, early and post-publication failures, later subscription failures, setup/subscribe failures and failing unsubscribe. It checks clear bytes, terminal flags and bounded process exit; it does not establish graphical Rex/Tern display behavior.

The PTY probe uses the actual localized editor/renderers against a disposable real HTTP host with a faux provider. It checks tool partial/result display, multiline input, root/child interrupt semantics, session selection, rename, detach/independent result and reopen. The latency probe uses the baseline synthetic view-commit → PTY-marker metric through a recording HTTP host, 50 samples and the original budget `1.2 × baseline p95 + 50 ms`. Neither probe calls a live model or uses production session data. Both accept `--entry /absolute/path/to/installed/dist/main.js` to check an installed artifact.

## Remaining acceptance boundary

The source/PTY checks do not establish complete native-profile acceptance. `native-attention.test.mts` creates a real native `contact_supervisor` interview and draft human-criterion Goal, then checks the actual TUI before/after owner reopen, including `/goal status`, no default attention answer, and real native CodingTools Bash partial/final output through a temporary recording DCG. Per-run markers prevent reopened history from satisfying the new stream check. `native-goal-client.test.mts` covers real command HTTP/lost ACK/uncertain effect/reopen and ordinary session-Goal interrupt; thinking order and alternative protected responses use an explicitly recording-only protocol fixture. Missing native capabilities or SDK methods fail explicitly. MCP status and remote profile reload remain unavailable rather than becoming model input or local runtime operations. The skill menu uses the configured server catalogue; `/skill:name` requests its body through the root/filesystem-authorized SDK route, never a local remote-path read. The private journal freezes the expanded body with the original typed command, so an unchanged explicit retry keeps the same body/key even if the server file changed. Scoped model metadata is used when advertised; a failed scoped lookup never falls back to a different global catalogue. No fallback model, local runtime, fake attention answer or generic task-abort API is substituted.

The package probe installs the two tarballs offline in a clean HOME without BB, iii or the server runtime. It launches the installed binary and runs the baseline PTY, synthetic latency and actual native attention/Goal UI checks without a TypeScript loader in the client. Full P3 acceptance still requires independent review and these checks on the final native-profile candidate. BB and iii are later milestones. See `NOTICE.md` and `src/ui/SOURCE.json` for source provenance; packaged license copies are in `dist/ui/licenses`.
