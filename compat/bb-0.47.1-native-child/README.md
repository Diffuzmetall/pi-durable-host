# BB 0.47.1: registered native-child lifecycle

This is a local compatibility patch for the existing BB Core, not another Harness or execution owner. It completes Core routing for a child that already exists in the native Durable owner. It does not spawn a replacement child, replay its initial task, substitute a model, or inherit Root credentials/instructions/execution options.

## Supported inputs

- Upstream: [get-bb/bb](https://github.com/get-bb/bb), source commit `5e1acd765039e874643f34c4d35409e58484e408`, BB 0.47.1.
- `baseline-bb-0.47.1.patch`: the complete prerequisite native-registration/history/root-recovery integration. It is included here; no private checkout is required.
- `native-child-lifecycle.patch`: this correction, applied **after** the prerequisite patch. It includes its helper implementations and TypeScript declarations.
- `CORE-LICENSE.txt`: upstream MIT license, Copyright (c) 2026 Michael Yong. The host fork's own MIT license remains unchanged.

`PROVENANCE.json` records input, patch, helper, and tested bundle hashes. The source patches are the portable delivery route. A stock `bb-app@0.47.1` binary does **not** contain the prerequisite native interfaces and is **not** a supported binary-overlay input.

## What changes

1. After authenticated native registration, Core checks that the parent process/provider/project/environment is still current, binds the same child identity, and installs child-specific routing **before** acknowledging registration. It uses Core's environment resolver; it does not copy Root's resolved environment or execution policy. An idempotent registration retry preserves existing child configuration.
2. After a successful, same-thread native-history receipt, Core updates its existing turn/goal/idle bookkeeping. A deferred receipt is not completion. No imported event is emitted or persisted a second time. This makes the child's **first** stop work without an earlier follow-up.
3. The native-history transaction retains canonical Core manual-stop bookkeeping outside the native transcript CAS. Its original owned-row fingerprint, expected digest, deferred admission, scope and live-thread guards remain in force. A bounded count/sequence/SHA-256 receipt attests the retained rows; unknown, malformed, foreign, changed or removed rows fail closed.
4. Only **after** those gates succeed, the transaction retains the original `turn/started` header required by an already-retained interruption. It never manufactures a replacement header. Without this, a later native projection rewrite left `turn/completed` orphaned and Core's real timeline endpoint returned HTTP 500.

The retained receipt also preserves headers for Core's previously recognized host-restart interruption batches. The `manualStop*` metadata names are internal compatibility fields, not native execution status or client-supplied ownership claims.

The companion BB adapter repair makes explicit cached-child reopen retry the **original** unconfirmed history body/CAS before fresh capture. Concurrent opens join that same recovery promise and do not receive the child before the original acknowledgement. That repair is in `apps/bb-adapter`, not in this Core patch. The adapter also keeps connection diagnostics out of native-owned child transcripts: a child disconnect reports coarse stderr and retains history, while Root keeps its ordinary live Core diagnostic. Appending a background-task connection badge to a child transcript correctly made subsequent native CAS reconciliation fail as mixed history.

## Apply the portable source patches

Use a **new disposable checkout** at the pinned upstream commit. Never apply these commands to an installed release or a source tree containing unrelated work. Set `PATCH_DIR` to this directory and `CORE_SOURCE` to that disposable checkout:

```sh
git -C "$CORE_SOURCE" apply --check "$PATCH_DIR/baseline-bb-0.47.1.patch"
git -C "$CORE_SOURCE" apply --whitespace=nowarn "$PATCH_DIR/baseline-bb-0.47.1.patch"
git -C "$CORE_SOURCE" apply --check "$PATCH_DIR/native-child-lifecycle.patch"
git -C "$CORE_SOURCE" apply "$PATCH_DIR/native-child-lifecycle.patch"
```

Both patches were applied to a second clean pinned source snapshot. All six final source files matched the prepared source byte-for-byte. Temporary `/tmp/...` literals in prerequisite **test fixtures** are examples, not dependencies on the author's filesystem. No personal home path, token, installed-release path, or external private import is required.

For a full source build, follow upstream's Node/pnpm prerequisites and dependency bootstrap, then its Turbo graph, for example:

```sh
cd "$CORE_SOURCE"
# Use the pinned packageManager pnpm@9.15.0 and a fresh, private HOME/cache.
# WORK is a disposable directory outside any installed runtime.
pnpm --filter 'bb-app...' --filter '@bb/app...' --filter '@bb/server...' \
  --filter '@bb/host-daemon...' --filter '@bb/bundled-plugins...' \
  --filter '@get-bb/plugin-sdk...' install --frozen-lockfile --ignore-scripts \
  --store-dir "$WORK/pnpm-store" --package-import-method hardlink \
  --network-concurrency 4 --child-concurrency 2 \
  --config.supportedArchitectures.cpu=x64
NODE_OPTIONS=--max-old-space-size=3072 pnpm exec turbo run typecheck \
  --filter=@bb/agent-runtime --filter=@bb/db --filter=@bb/server --concurrency=2
NODE_OPTIONS=--max-old-space-size=3072 pnpm exec turbo run build \
  --filter=bb-app --concurrency=2
(cd packages/bb-app && pnpm pack --pack-destination "$WORK/artifacts")
```

**Actual source build passed** on Linux x64 / Node 24.19.0 / pinned pnpm 9.15.0: fresh public upstream archive, both published patches, 1,476 filtered dependencies, eight successful affected typecheck/generation tasks, and all 60 `bb-app` build tasks. Installation scripts were skipped, not globally disabled; the resulting four native runtime dependencies loaded and an actual in-memory SQLite query and built launcher `--help` passed. See [SOURCE_BUILD.md](SOURCE_BUILD.md) for exact input/lock/toolchain/artifact hashes, commands, resource failures retained and the separate independent install/browser gates. The tarball was built from source, not reconstructed from the old binary overlay.

These commands show the tested x64 bootstrap. Other platforms and dependency variants need their own native-module validation. Do not equate compilation or launcher help with full Core/Chrome compatibility or migration readiness. Retain upstream's `AGENTS.md` and Turbo build/test guidance.

## Build the exact tested binary overlay

This alternate route is useful only when the prior compatible native-history baseline is already available. It deliberately rejects unknown bytes rather than attempting a best-effort patch.

Required SHA-256 inputs:

| File in the compatible `bb-app` package | SHA-256 |
| --- | --- |
| `host-daemon/dist/daemon-bundle.mjs` | `ca743511bf1429795bca496a6e5531fc3f13e84ccc3b8b36d4f89147057bfb7a` |
| `server/dist/start-server.js` | `faba35ca0960b99ad2e63f941200de92ecbbea47fdd721a67033797ea4218604` |

Set `BASE_APP` to that package and `WORK` to a new disposable directory, outside any installed runtime:

```sh
mkdir -p "$WORK"
node "$PATCH_DIR/apply.mjs" \
  "$BASE_APP/host-daemon/dist/daemon-bundle.mjs" "$WORK/new-daemon.mjs" \
  "$BASE_APP/server/dist/start-server.js" "$WORK/new-server.js"
cp -a "$BASE_APP" "$WORK/bb-app"
cp "$WORK/new-daemon.mjs" "$WORK/bb-app/host-daemon/dist/daemon-bundle.mjs"
cp "$WORK/new-server.js" "$WORK/bb-app/server/dist/start-server.js"
```

The builder checks both input hashes and exact integration seams. It creates new output files exclusively, never overwrites an input or existing output, and does not start or activate anything. If output creation fails, a partial new output may remain; inspect it rather than rerunning into the same destination.

Expected outputs:

- Daemon: `c8c2c6a643d7fa79bbc78cda6e134c494c3ed9bc39d3f020918633474006610d`.
- Server: `b6c234faf286fdef72818de8adeffaa3ddc762909a1cf9e58e12475a6ee30a4f`.

These hashes describe this exact pinned overlay, **not** every build of the source patches.

## Checks and acceptance

Run the focused compatibility tests against the **original supported baseline** files:

```sh
BB_CORE_DAEMON="$BASE_APP/host-daemon/dist/daemon-bundle.mjs" \
BB_CORE_SERVER="$BASE_APP/server/dist/start-server.js" \
node --test "$PATCH_DIR/routing.test.mjs" "$PATCH_DIR/manual-stop.test.mjs"
```

The 16 unit checks passed. They execute the pinned Core callback/transaction code with isolated boundary adapters; they are **not** substitutes for the real Core parser, SQLite database, or Chrome acceptance.

A separate disposable Core/Chrome producer probe used temporary HOME/data, loopback-only faux providers and the tested overlay. It passed Root answer visibility, first stop of a held native child **before any follow-up**, actual native `interrupted` outcome, and one subsequent answer on the **same** native child visible live in Chrome. No initial task was replayed. An expanded producer probe on final BB archive `b82eb8d3ca9dbac0e0d85b8d07919d26c74171943be17a2a1f79732a554349df` also passed child browser reload, Core view release/reattach, Root followup and actual native stop, and native-owner HTTP/Store close-reopen with the same data and IDs. Both Root and the same child answered afterward, with one native subagent in the roster. The later independent milestone gate must use these final BB bytes; producer checks alone are not that gate.

For acceptance, also check reconnect/reopen/reload, identity/request stability, preserved native model and child environment, foreign/revoked scope refusal, history/CAS retry and no duplicate initial admission. Keep Core HTTP timeline and raw history checks distinct: a successful history write alone did not catch the orphaned-header defect.

No production activation, live provider/API calls, existing-user data migration, global configuration changes, or arbitrary-plugin compatibility are claimed. Installing or activating this patch requires its own operational approval.
