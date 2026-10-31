# Clean public-source BB Core build

## Result

The published prerequisite and lifecycle patches were applied to a **fresh public upstream source archive** and an actual runnable `bb-app@0.47.1` tarball was built. No input daemon/server binary overlay was used.

- Upstream commit: `5e1acd765039e874643f34c4d35409e58484e408` at `https://github.com/get-bb/bb`.
- Public archive: `https://codeload.github.com/get-bb/bb/tar.gz/5e1acd765039e874643f34c4d35409e58484e408`.
- Archive SHA-256: `c6e0f48b10e181e763136d5ad474b73d3f98143deaf6f9ccf1e3cc8a30771aca`.
- Patch inputs are the unchanged files published in host commit `0c49efba7ef53ae20a22395ebdd1a4d9ea04fd44`; their hashes remain in `PROVENANCE.json`.

| Input | SHA-256 |
| --- | --- |
| Upstream `package.json` | `1df410672e77d71fb683f7b3eed5feb972542aa34f833b61624cda443cf67da7` |
| Upstream `pnpm-lock.yaml` | `54fd602502d220e48b6d2307f18eab90a6513d10dc6c4f0a046a9d40f1849313` |
| Upstream `pnpm-workspace.yaml` | `4114891939ea70362a05682dd39e5dc13ba0e84b993307fabcdd14400d45c4d3` |
| Upstream `AGENTS.md` | `4c37591844904e6f90711b052bb472fc0ee3d4a0d3b4b884e0d2fc98b03322e5` |
| Node 24.19.0 Linux x64 executable | `bc17c508ffeed0ec622934f9b7fa72f8e78da65350e63c3eceb56fa688aa5e12` |
| Public `pnpm-9.15.0.tgz` | `09a8fe31a34fda706354680619f4002f4ccef6dadff93240d24ef6c831f0fd28` |
| pnpm `bin/pnpm.cjs` | `98e6b99a881d64a1cc982c3e60aa260bf02160386b12e74475e06486dc74b090` |

The local pnpm tool was fetched from the public npm registry and checked against its published SHA-512 integrity. No global package installation or user/global package-manager configuration was changed.

## Executed route

Use a new disposable source checkout and private HOME/cache. Apply **both** patches in the order documented in [README.md](README.md), then run the pinned pnpm bootstrap/typecheck/build/pack commands there. `WORK` must exist outside installed runtimes and `WORK/artifacts` must be created before packing.

| Phase | Actual result |
| --- | --- |
| Both `git apply --check` and `git apply` operations | exit 0 |
| Filtered frozen-lockfile pnpm bootstrap | exit 0; 92/112 workspace projects, 1,476 packages |
| Turbo typecheck for `@bb/agent-runtime`, `@bb/db`, `@bb/server` | exit 0; 8/8 tasks, zero cache hits |
| Turbo `build --filter=bb-app --concurrency=2` | final exit 0; 60/60 tasks |
| `pnpm pack --pack-destination ...` in `packages/bb-app` | exit 0 |
| Native dependencies and built launcher probe | exit 0 |

All dependency install scripts were initially skipped with `--ignore-scripts`; their lifecycle inventory was inspected. The build used the upstream Turbo dependency graph and generators, not raw `tsc` shortcuts. Remote Turbo caching was disabled. Build, packaging and the runnable probe had no external network, inherited credentials, provider execution or model calls.

The probe loaded the actual fresh public dependencies: `better-sqlite3@13.0.3`, `node-pty@1.2.0-beta.15`, `@parcel/watcher@2.5.6`, and `fs-native-extensions@1.5.0`. A real SQLite `:memory:` query and the newly built launcher `--help` succeeded. This is the producer runnable-artifact check; a separately installed package and actual Core/Chrome lifecycle are independent downstream checks, not implied by help output.

## Immutable tested artifact

| Output | SHA-256 |
| --- | --- |
| `bb-app-source-0.47.1-8afea059.tgz` (36,444,698 bytes; 2,671 files) | `8afea059c22047d64181f38668fdc7f7bded5f8a27a5406a869d523beaa67de7` |
| `dist/bb-app.js` | `f281e523d90a5c6f453949f07476bd2b10342c8997fdd313d87e1f93f67563f1` |
| `host-daemon/dist/daemon-bundle.mjs` | `8c1f805a441c4ab34c149ea4f239a30c1ca53621dff1d830df45a787dc155a74` |
| `server/dist/start-server.js` | `697fd23ef99fad916022996b9bf47e8ba02c33fa08451213d69ad71e88deea52` |

These identify this source build. They deliberately differ from the earlier tested binary-overlay outputs `c8c2...` / `b6c2...`; those older browser receipts must not be silently transferred to this artifact. The hash is not a promise of bit-reproducibility across other toolchains or resource environments, nor a published binary download/release.

## Resource failures retained, not concealed

1. The initial disk-backed bootstrap exhausted **inodes** on its separate temporary filesystem while approximately 3 GiB of byte capacity remained. Only this attempt's new generated dependency trees were removed; source inputs and the error log were retained. No other actor's cache, installed runtime or user data was deleted. A bounded RAM-backed build filesystem and one compressed checkpoint avoided host-inode exhaustion on the successful attempt.
2. An imposed 1,536-MiB V8 heap cap failed the final public SDK declaration bundle after 59/60 build tasks succeeded. With a 3,072-MiB Node heap in the same 7-GiB process/memory envelope, the source-identical build passed. The final Turbo invocation reused 58 local cached tasks from that same clean-source build; no old Core binaries were used as cache inputs.

The successful resource envelope was Linux x64, two CPUs, a 7-GiB memory/no-swap scope and 4-GiB RAM-backed source/store filesystem. A normal disk-backed environment needs enough **inodes as well as bytes**; fewer than 100,000 free inodes was insufficient for the first attempt here. The tested heap setting is a supported build configuration, not a claimed universal minimum.

## Boundaries

Source build and producer runnable checks are complete. Independent clean installation, source-built Core/Chrome delivery checks, the original BB UI timeout diagnosis and real-session compatibility/rollback each retain their own evidence boundary. No real session database, installed release, auth/config, private memory bank or production activation was used by this build.
