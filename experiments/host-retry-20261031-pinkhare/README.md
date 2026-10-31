# Host startup retry candidate — not activated

This directory is an isolated repair candidate, not an installed release. Existing source files under `experiments/sdk-host-cutover/` and installed runtime releases were not edited. No live model prompts were submitted.

## Changes

- Register shutdown handling while `Store.open()` is pending. SIGTERM/SIGINT waits for that opening to drain and closes its Store instead of killing the process with acquired locks. A stopped startup does not publish readiness or open HTTP.
- Keep repeated shutdown requests on one cleanup promise.
- Increase the terminal's systemctl wait from 45 seconds to 330 seconds, beyond the five-minute service startup budget.
- Provide an **uninstalled** systemd drop-in with 300-second startup and shutdown budgets. The working service currently has a five-minute start budget but only a one-minute stop budget.

This is graceful shutdown, not cancellation of an unbounded/hung initializer. SIGKILL cannot be made graceful. Existing-owner locks remain fail-closed; no automatic lock deletion or owner takeover was added.

`startup.patch` targets the two original source files. It is provided for the authorized source owner; it has not been applied. `host-lifecycle.conf` has not been installed. The profile and dependency symlinks reuse this checkout's existing dependencies read-only; this directory is not a standalone redistributable release.

## Local verification

Use Node 24.19.0. From the repository root:

```sh
TEST_HOME=$(mktemp -d /tmp/pi-host-retry-check-XXXXXX)
HOME="$TEST_HOME" PI_CODING_AGENT_DIR="$TEST_HOME/.pi/agent" \
  HINDSIGHT_DISABLE_HOOKS=1 NOTIFY_SOCKET= DELM_BINDINGS_FILE= \
  node '--import=data:text/javascript,process.umask(0o077)' \
  --test --test-concurrency=1 \
  experiments/host-retry-20261031-pinkhare/startup-regression.test.mjs \
  experiments/host-retry-20261031-pinkhare/terminal-launcher.test.mjs \
  experiments/host-retry-20261031-pinkhare/operational-service.test.mjs
```

The regression tests run the real entrypoint with fixture initializers and a real temporary lock. The service smoke uses synthetic auth in the temporary HOME, opens no saved production sessions, and submits no model request. Do not run the service smoke in the operator HOME: its fixture writes a synthetic auth file.

The fixture files must be private. Running the DeLM profile suite with an inherited group-writable umask triggers the intended binding/module permission guard; use `process.umask(0o077)` rather than weakening that guard.

## Evidence and limits

- Before the fix: 3/3 new startup/launcher regression cases failed.
- Final candidate startup, launcher and actual service checks: see `evidence/candidate-final.log`.
- Existing source DeLM profile/cutover suite with the installed engine and Python board: 22/22 passed, including real Harness cold/hot attachment, denied wake, stable retry, delayed work wake and receipt ACK. Providers were faux; this is not eight live models.
- Existing source memory reload isolation test: 1/1 passed against loopback-only test banks. Its explicit recall fixture must run without `HINDSIGHT_DISABLE_HOOKS=1`; a fetch guard rejects non-loopback endpoints.
- LSP probes were partly inconclusive. Four AST findings about missing local catches were triaged as false positives: async validation errors intentionally reach the top-level sanitized catch. The candidate is not claimed LSP-clean.
- No production restart, release installation, source-patch application, live eight-worker launch, provider/auth rewrite, commit or push was performed.

Read `../../docs/host-retry-and-delm-2026-10-31.md` for the live DeLM findings and activation blockers.
