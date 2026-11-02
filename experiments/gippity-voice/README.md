# GipPity Voice on the existing Durable Host

This is an operational integration, not another agent runtime. It uses the official
`@howaboua/pi-durable-components` and `@howaboua/pi-durable-gippity-voice` 0.10.0
release archives. Its Durable, Models and Chord imports resolve to the installed
Host's exact 1.4.0 package instances. The Host runtime release is not modified.
GipPity's two 0.10.0 bundles receive the reproducible, narrowly scoped
`worklet-patch.mjs` adaptation described below.

`integration.mjs` prepares the component through its public `./component` entry,
publishes its extension into the existing profile, binds to the original Harness
and storage, and joins shutdown before/after that Harness closes. It runs only for
the explicitly configured root conversation. The namespace comes from the real
conversation environment. One process-wide rejecting audio lease protects audio
ownership. Provider credentials stay in the existing Models owner. The audio
helper receives only an isolated HOME and a minimal PATH; browser dictation does
not require a microphone attached to the VPS.

The operational profile wrapper is selected by a separate systemd drop-in. The
original Host backend, SDK, profile, config, guards and all other service drop-ins
remain in place. The listener binds only to 127.0.0.1:43120 with a private
self-signed loopback certificate. Tailscale Serve terminates trusted browser HTTPS
on port 8448 and proxies to that loopback TLS listener. No Funnel is enabled.
Existing routes are snapshotted and compared, not replaced.

## Browser use after activation

Open `https://<your-tailnet-host>:8448/` from a device in your tailnet.
The operator-specific hostname is intentionally omitted from this public snapshot.
Choose **Dictate**, allow microphone access, start recording and stop when done.
Review/edit the transcript, then press **Send**. A draft is not automatically
submitted. The configured target is the dedicated `GipPity Voice` conversation
inside the existing Host, not a separate runtime.

Physical microphone permissions, audio capture and acoustic quality still require
user acceptance. Server speech synthesis/protocol tests cannot establish those.
Do not select a paid public Realtime provider without separate authorization.

## Checks and evidence

- `npm test`: real official component SDK + real Harness/SQLite + faux generation;
  HTTPS Host/Origin rejection; scoped activation; audio lease conflict/abort;
  complete shutdown and released listener. No external provider in this suite.
- `verify-live.mjs`: explicit one-shot operational acceptance. Valid tailnet TLS,
  preserved routes/session IDs, no new session errors, one synthetic PCM browser
  dictation, one harmless dictated command and a completed native answer without
  tool use. Never automatically replay an uncertain input. Do not rerun blindly.
- `activate.mjs`: waits up to ten minutes for all foreground conversations to be
  idle, installs only its own drop-in, restarts the existing Host, then runs the
  live check and a rendered browser check. It does not interrupt an active turn.
  Its restart wait covers both 300-second systemd windows plus a margin; a client
  timeout is not a cancelled systemd job. Transitional states are never rolled back.

Private operational state and evidence are under
`~/.config/pi-durable-host/gippity-voice/`: `config.json`, `activation.json`,
`status.json`, `verify.json`, `transcription-proof.json`, and `browser-proof.json`.
No credentials are embedded in this checkout or exposed to the browser.

### Accepted server candidate — 2026-10-31

The existing Host runs the wrapper and has the persistent `zz-gippity-voice.conf`
drop-in. Verified TLS and synthetic browser-protocol dictation produced the draft
“Reply only with the word ready, do not use tools.” Explicit `/api/send` admission into the
dedicated native conversation returned exactly `ready`, without tool calls. All
59 pre-existing session IDs and all pre-existing Tailscale routes were preserved;
no new session errors were observed and Voice Funnel remains disabled.

A real Chrome session loaded the tailnet HTTPS page, reported `Connected`, selected
Dictate and displayed Start dictation. Secure context and getUserMedia are present;
the draft is empty after submission, Send is disabled, and browser console/errors
and failed resource checks were empty. Physical microphone acceptance is still
NOT TESTED.

The first activation client timed out while the systemd job continued, causing an
incorrect rollback report. Live process/socket checks established the wrapper was
actually running. Its drop-in was restored with daemon-reload, without another
restart. Original evidence remains in `activation.first-attempt.json`; the script
now waits for the combined stop/start budget and only rolls back terminal states.

## Same-origin AudioWorklet fix

`worklet-patch.mjs` adapts both official `dist/index.js` and `dist/activation.js`:
all AudioWorklet loads use `/_gippity/worklets/audio.js` and
`/_gippity/worklets/microphone.js`, served by the existing LAN handler **after**
its existing Host/Origin checks. The microphone processor is unchanged; the audio
processor also receives the bounded-wait fix below.
The CSP is unchanged. No proxy, extra port, runtime or browser credentials are added.

The patch runs on `npm ci` via `postinstall`, or explicitly with
`node worklet-patch.mjs /absolute/integration/root`. It supports only 0.10.0,
requires unique exact anchors, preserves original bundle backups, and refuses
unrelated bundle edits. Applying twice is safe. No dependency reinstall is needed
for an already installed integration.

Checks: `npm test` covers real Component SDK/Harness, exact strict CSP, both module
routes, MIME, client URL references and Host/Origin denial. `npm run test:worklets`
uses isolated Chrome and the genuine release processors: both Blob controls fail
with AbortError under that CSP; both same-origin modules load and their processor
nodes instantiate. No microphone, provider, transcription or command submission
is used by the browser regression.

`activate-worklets.mjs` is a separate explicit operational action, never a test
hook. It waits at most ten minutes for every session to become idle, applies the
patch only to the existing GipPity installation, rechecks idle and restarts once.
It does NOT invoke `verify-live.mjs` or replay any input. It verifies actual tailnet
resources, exact processor bodies, unchanged CSP, browser AudioWorklet loading,
session preservation and unchanged Tailscale configuration. Evidence is private:
`~/.config/pi-durable-host/gippity-voice/worklets-fix.json`. A timeout is uncertain;
do not rerun blindly. Physical microphone acceptance remains separate.

To roll back **only this fix**, wait for idle and use
`node worklet-patch.mjs /home/ubuntu/.local/share/pi-durable-host/extensions/gippity-voice/0.1.0 --restore`,
then gracefully restart the same Host. This restores only the two backed-up
GipPity bundles, not the profile, sessions, CSP or Tailscale routes; the original
Blob loading defect returns. For a future clean install, remove only the
`postinstall` patch hook if deliberately reverting the source fix as well.
Do not use the broader integration rollback below for this worklet-only change.

## Bounded audio rebuffer wait

The 0.10.0 audio processor waits for 1,440 samples (60 ms at 24 kHz) before
starting or resuming playback. A shorter fragment can otherwise remain queued
indefinitely, including a short tail after an underrun. `worklet-patch.mjs` keeps
that reserve and the 250 ms capacity, but starts a nonempty short queue after
60 ms of rendered waiting. Suppression resets the wait and discards queued audio.
No network route, VPN, microphone buffering, or provider setting is changed.

`npm test` includes both bundles at 24/44.1/48 kHz, startup, starvation recovery,
and suppression. `npm run test:worklets` renders a 20 ms fragment through the
real processor in Chromium, in addition to the strict-CSP checks. These tests
prove bounded local playout waiting, not end-to-end latency or perceived quality
on the user's microphone/speakers.

`activate-latency.mjs /absolute/active/integration/root` is an explicit operational
action: back up the two resolved dependency bundles, apply the candidate, wait
up to ten minutes for idle, and request exactly one restart. It waits for both
APIs, compares the served audio module to the candidate, verifies settings without
rewriting them, and checks session IDs/errors and Tailscale Serve configuration.
The private result is `~/.config/pi-durable-host/gippity-voice/audio-latency-activation.json`.
Do not rerun after an uncertain restart. The `.before-audio-latency` files preserve
the immediately preceding bundles for a deliberate, idle-only rollback.

## Recovery

If the service definitively becomes failed or inactive during activation, the
script moves only its own drop-in out of the unit directory and requests the
original entrypoint. Check the actual process and session errors before declaring
rollback successful. It never removes owner locks or changes
existing databases. For a later manual rollback, first stop ingress and wait for
foreground work to finish; move
`~/.config/systemd/user/pi-durable-host.service.d/zz-gippity-voice.conf` into the
private evidence directory, daemon-reload, then restart the Host. Disable only the
new Serve listener with `sudo tailscale serve --https=8448 off`; do not reset Serve.
The new conversation and its history remain preserved. Its component task
definitions may require the GipPity profile to reopen that conversation; do not
claim rollback of that new voice conversation without checking it.
