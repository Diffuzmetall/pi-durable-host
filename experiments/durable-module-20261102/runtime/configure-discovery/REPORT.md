# Configure, discovery and shared-state checkpoint

## Result

The isolated component suite passed 22 tests. No test failed.
Strict TypeScript compilation passed with declaration output.
The sandbox denied production paths and passed its child isolation check.
Production activation: NOT RUN.

This checkpoint does not complete D1 or its Host integration task.
The actual Host still needs semantic session integration.
The routes and streams still use native handles.
The backend as a whole did not undergo compilation or HTTP tests for this checkpoint.

## Changes

- The runtime returns agent identities and task summaries after scope checks.
- Configuration checks models and approved directories before native mutation.
- Configuration removes write tools for read-only mode and restores tools when that mode ends.
- The native settlement hook rejects configuration after authorization revocation.
- Shared-state storage now owns its native handle inside the runtime module.
- Store uses the shared-state subscription port instead of its native handle.
- Shared-state subscriptions use the native 1.5 commit observer and detach operation.

The device document store retains its historical document kinds and receipt keys.
Its fixture checks initialization, revisions, stale edits, receipt replay, detachment and reopen.
The declaration file exposes no native handle or native type.

## Evidence

Sandbox: `/tmp/hot-update-sandbox-zanyfseu`.
Personal dependency closure: `/tmp/pi-host-dm1-runtime-20261102-carol-v1`.
The closure contains the previously qualified local authorization patch, not the stock runtime.

Files in this directory:

- `run.log`: 22 PASS, 0 FAIL.
- `command.json`: exact sandbox command.
- `sandbox-check.json`: isolation checks.
- `compile.log`: empty output, compiler exit 0.
- `shared-state.d.ts`: generated declaration.
- `source/`: exact component sources.
- `hashes.json`: SHA256 values for these files.

Compiler command from the personal closure:

```sh
./node_modules/.bin/tsc --strict --declaration --module NodeNext --moduleResolution NodeNext \
  --target ES2023 --skipLibCheck --types node --typeRoots node_modules/@types \
  --rootDir . --outDir carol-configure-tests \
  apps/dpi-backend/tests/durable-session.test.ts \
  apps/dpi-backend/src/durable/session.examples.ts \
  experiments/durable-module-20261102/runtime/native-commit-authorization.test.ts
```

The preliminary shared-state compilation found the removed `subscribeCommits` API.
The final source uses `observeCommits` and passed compilation and the isolated suite.
No shared dependency or installed release changed.
