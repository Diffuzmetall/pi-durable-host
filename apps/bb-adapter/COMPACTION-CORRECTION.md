# BB compaction retry correction — producer output

Task `d4b45cc23e6047b2911f00aad079dbba`; corrects independent finding FAIL604 `c336988bfac14caaa60a0bc730834f49`. **Not independent acceptance or resolution of that finding.**

## Cause and chosen boundary

The selected Core `/compact` branch directly called `root.native.compact()` and acknowledged `input.accepted`, bypassing the canonical Root input receipt. Dave's actual installed Core/native probe created two distinct native compaction tasks for the same Core intent after the first settled. Ordinary text retry tests did not cover this branch.

Actual native 1.4 `ConversationImpl.compact(instructions, context)` calls `commitWith(createCompaction)` without a request key. Public SDK/Store/HTTP compact also have no keyed primitive. Native owner Bob independently confirmed this source limitation in FACT609. Adding a client cache or reinterpreting `/compact` as a normal prompt would not fix authority/idempotency.

The approved safe correction explicitly refuses matched `/compact` commands with JSON-RPC error `BB_COMPACTION_UNSUPPORTED_IDEMPOTENCY` **before** view attachment, deferred model configuration, native compaction/input and accepted ACK. Both Root/child and `turn/start`/`turn/steer` are covered. Existing terminal and public SDK/native compaction APIs are unchanged. README/SOURCE explain the deliberate unsupported behavior; no new runtime, journal, queue, cache, server route, capability or dependency.

## Exact successor

- BB: `/tmp/alice-bb-compact.9cNzuy/dpi-bb-adapter-0.1.0.tgz`
- SHA-256: `01210a7df934bcb15649f47439286f8558968bddec4096c656a579d47a6d6896`
- Unchanged backend: `/tmp/dpi-packed-1fobzC/artifacts/dpi-backend-0.1.0.tgz`, SHA `51fc6f65d6f582573911d3445f5872f26d0916577f967d372a8753fc854060f2`.
- Unchanged SDK: same directory `dpi-sdk-0.1.0.tgz`, SHA `6c9abd1af37630a63a1102469896679bd8ae7ef0d51c8cb2ecd62a2b55e68aac`.
- Rejected BB archive `516f6d711a5cfc5705df2b50b040494694d47f1b4a0f514d0b98f6c014562e90` remains unchanged; `VERIFICATION.md` is explicitly marked historical/rejected.

Only 4 packed files changed: `dist/provider-bridge.js`, its source map, `README.md`, `SOURCE.json`. All other runtime/client/native/terminal modules retain their bytes. No Store/SDK/native source edit.

## Fresh verification

1. `cd apps/bb-adapter && npm run check && npm test`: strict **PASS**, **25/25 PASS, zero skips**; `/tmp/alice-compact-types-final.log`, `/tmp/alice-compact-source-final.log`. `npm pack` build PASS `/tmp/alice-compact-pack.log`.
2. New actual HTTP/Harness/SQLite/faux regression `tests/compact-retry.test.mts`: same genuine CREQ, identical retry, changed instructions, multiline command, Root/unattached-child and prompt/steer, BEFORE and AFTER complete native owner + bridge reopen. Actual Store.compact spy invokes the original implementation if called: **0 calls**, native task ID set unchanged, native entries unchanged, deferred `max` not applied (`off` retained), **0 input.accepted** notifications. No fabricated native callback or applied result. Existing 24 connected/root/child/receipt/CAS/history/selection tests retained.
3. Fresh offline ignore-scripts **BB+SDK-only** install `/tmp/alice-bb-compact-install.BhId77`, no backend dependency. Entire suite rebound only at imports to exact installed BB/SDK and separate installed unchanged backend: **25/25 PASS**, `/tmp/alice-compact-installed.log`. `BINDINGS.json` has 43 substitutions across 10 files; reverse substitution reproduces each original byte-exact. Test compiler/loader and original Core schema/predicate remain test-only inputs.
4. `/tmp/alice-compact-audit.json`: **55 installed archive-exact files**, 16 runtime JS importing only local modules, Node or public SDK; no native/Storage/Harness dependency. All 14 donor hashes exact. Rejected archive preserved.
5. Final successor bare-Node CLI + unchanged old terminal/SDK on same new host: **PASS**, `/tmp/alice-compact-mixed.log`, `/tmp/dpi-bb-packed-7K6NcP/RESULT.json`. Genuine successful faux answers, one native Root input for duplicate ordinary BB intent, same conversation old terminal answer, two inputs total. Terminal SHA remains `1f1b74fa2b515b55bf280113d91116c267755973b5ed76ce9a6389174c235bde`; old SDK remains `d98831740905de74cffc64243d1b2c54cd83e8e76a34c927fa2b5f139e1cdd43`.

Installed check:

```sh
cd /tmp/alice-bb-compact-install.BhId77
env -i PATH="$PATH" HOME="$PWD/home" LANG=C.UTF-8 node \
  --import /home/ubuntu/Projects/pi-durable-host/apps/bb-adapter/node_modules/tsx/dist/loader.mjs \
  --test tests/*.test.mts
```

Mixed-version probe: run `scripts/package-smoke.mjs` with the backend/SDK above, successor BB archive, unchanged accepted terminal archive `/tmp/dpi-terminal-packed-7bo6KL/artifacts/dpi-terminal-adapter-0.1.0.tgz`, and old SDK `/tmp/dpi-packed-y88Lnt/artifacts/dpi-sdk-0.1.0.tgz` (from project root use `apps/bb-adapter/scripts/package-smoke.mjs`). Backend dependency installation may fetch public packages; client-only/old-terminal installs are offline. All model execution is faux; temporary HOME/dataDir and loopback only.

## Handoff / unchanged limits

Dave's independent gate `a5a4f2fecb284a1b8e24c50a9aa939c0` owns red→green review and explicit resolution of FAIL604 after checking this exact successor and the documented refusal. Producer success must not resolve the sticky failure by itself. Full running compatible BB-version smoke, BB same-metric commit→visible p95 and iii remain unaccepted here. Canonical 53-leaf accounting remains 42 PASS / 6 PARTIAL / 5 UNKNOWN; no canonical checkbox changes, live/private data, paid/live model/API, deployment, commit, push or global configuration change.
