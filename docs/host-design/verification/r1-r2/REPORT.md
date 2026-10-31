# Independent local R1/R2 review — Carol

What this change does:
The public boundary now coarsens native compaction, task and inspection failure diagnostics without rewriting application/tool JSON or private native history. Store ownership rejects another live owner, including its own PID, and uses the same canonical SQLite path for the catalog/shared/session lock and opener. Constructor failure releases its lock; release callbacks are idempotent.

Looks good for this LOCAL repair batch. No additional must-fix finding was established in the supplied R1/R2 scope. This is not permission to publish, install/activate a runtime, restart the host, or perform production/migration work. Expected load reviewed: one local device service, concurrent session requests, competing same-process Stores/catalogs and separate disposable processes.

## Exact frozen candidate

- Producer manifest: `/tmp/alice-r12-local.ZxsS8T/candidate-repaired.json`, SHA256 `d332af15139ffc1cb9ddea85954436f835a132de71d2ba0aa3f3ab8f10b56068`.
- Producer source: all409 entries verified before/after; sorted compact JSON filename-to-SHA map digest `793008bbf33672657b8553a1e7a725d7ff421bb9ef9ecaa72f08ec63bf8c9d4b`.
- Follow-up909 adds ONLY retained `apps/dpi-backend/tests/inspect-overflow-regression.test.mjs`, SHA256 `16d334579eea490f2e0880373d2a120af01dc78d9815a7c8754ac1e713cc9dcf`. Reviewed inventory is410, map digest `bef24f3123448562b54f2cb034b3fd954121ecac980dd389c20322c2f657b4a5`. Own `candidate-reviewed.json` SHA256 `67cd9d578309ea11e9d5612c31ba8d51a1e87cfff7007cb701559f8a4c0da851` references the immutable producer409 manifest plus the explicit one-file addition. Runtime/source409/8locks/archive are unchanged.
- All8 locks match original manifest exactly; map digest `ab35e592f56ac3ad3cdd604bd08469eba7614df198990abd27637f1676be6cad`.
- Archive: `/tmp/alice-r12-local.ZxsS8T/artifacts/dpi-backend-0.1.0.tgz`, SHA256 `fe333c18dbd8f209a172a2fa8ba6cca47e128b4877c03fee96d66441ca5dc77a`.
- Actual fresh extracted fixture: `/tmp/alice-r12-local.ZxsS8T/host/node_modules/dpi-backend`, exactly282 regular archive members, no stale extra backend files or source aliases. Every archive member matched installed bytes before/after. Sorted member hash-map digest `3fd42edce5afddef363500507e664830db9cf6b9a35788efa437e97fdffb701e`.
- No dependency installation/download was performed. Existing immutable dependency closure was copied by producer; this is a disposable extracted compiled package fixture, not runtime activation or a newly installed dependency closure.

## Actual independent executions

1. UNCHANGED external probe against COMPILED replacement, EXIT0, **2/2 PASS,0skip**:

   `timeout -k 5s 240s bash /tmp/alice-r12-local.ZxsS8T/sandbox.sh node --test /review/independent-boundaries.test.mjs`

   SecondStore/duplicateHarness/distinctHarness booleans ALLfalse. Native failed-compaction live/reconnect/task leaks ALLfalse, leakedTypes empty. Log `external-compiled.log`, SHA256 `ac2dec40040c3decb388c8adcbb38800a87a74f8deb2eb2e851e0a6656d905ed`.

2. Full corrected BACKEND suite ONCE, EXIT0, **127/127 PASS,0skip**,202192ms:

   `timeout -k 5s 240s bash /tmp/alice-r12-local.ZxsS8T/sandbox.sh bash --noprofile --norc -euc 'cd /home/ubuntu/Projects/pi-durable-host/apps/dpi-backend; node --import ./node_modules/tsx/dist/loader.mjs --test --test-concurrency=1 tests/*.test.ts tests/*.test.mjs'`

   Includes all9 ownership cases; actual competing-catalog/SIGKILL stale ownership recovery; source recovery/normal reopen; real compaction/private history; provider and initializer/cache/reopen/SSE boundaries; opaque healthy JSON; remaining backend native/control tests. Log `backend-full.log`, SHA256 `3d09afeeda90a7025d442e42fbae018a4c73474125e9ed8b082f20b268e22232`.

3. Full strict backend source/test no-emit check, EXIT0:

   Same sandbox, `cd .../apps/dpi-backend; node ./node_modules/typescript/bin/tsc --noEmit -p .` under outer wall120s. Empty log `backend-types.log`, SHA256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.

4. Actual COMPILED preservation/regressions, EXIT0, **16/16 PASS,0skip**:

   `timeout -k 5s 120s bash /tmp/carol-r12-independent.FvOMrL/compiled-fixtures-sandbox.sh bash --noprofile --norc -euc 'cd /gate; node --import /gate/node_modules/tsx/dist/loader.mjs --test --test-concurrency=1 /gate/tests/store-ownership-regression.test.mts /gate/tests/public-projection.test.mts /gate/tests/compaction-failure-http.test.mjs /gate/tests/native-provider-secret.test.mjs'`

   Includes9 actual owner/alias/cleanup/concurrent/reopen cases;5 typed projection/inspection/opaque/nonmutation units; real HTTP/SSE/reconnected compaction with raw private failed task still containing synthetic cause; provider auth success/failure, HTTP/inspect/transcript/SSE/reconnect/diagnostic absence. Private copies preserve every test body; ONLY backend import strings rebound to `/candidate/host/node_modules/dpi-backend/dist/dpi-backend/src/*.js` and TS test filenames changed to `.mts` for ESM. Copied helper imports the compiled Store too. Independently reconstructed copies match exactly. tsx is a test transpiler, not a moving-source backend alias. Dependencies mounted from the actual compiled fixture node_modules at /gate/node_modules.

   Log `compiled-preservation.log`, SHA256 `3f7a1e367ffa9a51ff640cd765ee5d6f8db05f4ada93ab6f23022723a3d5864c`. Own wrapper hash `cb00e1cdc63fa697aeeb15c9533b291d64a73443add30bfb69863202c90f8fff`. Initial own wrapper attempt failed before target execution because readonly /gate lacked a node_modules mount-point; retained `compiled-mount-setup.log`. Creating the private empty mount-point fixed HARNESS setup; it is not product evidence or a hidden product failure.

All target executions: cleared environment, readonly source/toolchain/fixtures, isolated PID/network namespaces with loopback only, writable scratch1GiB, address-space64GiB, Node heap1GiB, CPU180s/PID existing UID baseline+512/file128MiB/fd2048; explicit outer wall limits above. No live models, APIs, personal banks, global settings or production data.

## Operator follow-up909: pending overflow inspection

The newly supplied UNCHANGED external `/review/inspect-overflow.test.mjs` SHA256 `c92e4285afb5b07597a6cc4580279051a46b5ca48d654b30914c8714a2265488` also ran against the SAME fe333 compiled fixture, using the same producer runner under outer wall60s: EXIT0,1/1 PASS,0skip. Actual pending native generation checkpoint was present; `inspectLeak:false`, `activeTasksLeak:false`, `pendingGenerationCheckpoint:true`. Log `external-inspect-compiled.log`, SHA256 `f8efbfcf053fad13e789700d54f6167f16edc52c83477db32a757bb43a040542`.

Retained fork test uses that external author's exact complete test body; ONLY portable source-import header was adapted by Carol under the existing gate lease. Source focused command: same sandbox, `node --import /home/ubuntu/Projects/pi-durable-host/apps/dpi-backend/node_modules/tsx/dist/loader.mjs --test /home/ubuntu/Projects/pi-durable-host/apps/dpi-backend/tests/inspect-overflow-regression.test.mjs`, outer wall60s. EXIT0,1/1 PASS,0skip; log `retained-inspect-source.log` SHA256 `3a539935cf07a0349a4396c669fb86b3b59e0a34c4508f4befd9c864f53f3c86`. Body equality checked directly against the unmodified external file. This fixture adaptation is NOT independent test authorship or product implementation. No full-suite rerun: report full127 BEFORE the sole added fixture plus focused1, NOT a claimed full128 run. Existing TS, product bytes, compiled archive and all8 locks were unchanged; no rebuild was needed.

## Read-only code review

Inspected actual Store changes against preserved public baseline; publicProjection/publicTaskState/publicInspection; all callers in Store/streams; native1.4 generation checkpoint ownership; complete new/changed regression fixtures and helpers. Locks precede profile/storage/Harness acquisition; cleanup releases owned locks, not another live holder. Canonical lock/opener paths agree for catalog/shared/session file aliases. Concurrent openAgent may reject a competing in-flight request; it does not promise request coalescing. Projection works on copies and changes only typed native diagnostic slots, retaining IDs/status/scheduling/input/memos/completed result JSON. No new registry, scheduler, dependency, SDK protocol change or recursive string scrub was added.

Author independence: Carol did not implement Store/projection or the producers' regression bodies. Carol only adapted the externally authored overflow probe's import header for the retained follow-up fixture, as explicitly distinguished above. Alice/Bob/Dave checks remain producer self-verification; the six executions above are fresh Carol checks on the stated exact frozen candidate and one-test-only source addition. Earlier source193/PASS or published GitHub state is NOT used to assert these repaired bytes pass.

## Immutable original evidence and limits

External probe stays `0cc4fd86cc6ec3272aafdac0f7572ee06b6dfe07a0b8df5da5f8815c81d4ead9`; original runner stays `fa7d646f819a33940c1a574935d7294f559d5ad9c4fee54fa0e68250a74569fb`; candidate-before stays `966a7e50dabeac2988d5582c71f6441c4db5588cc3e7dc2c1d0de47fdbec92f1`. Original backend1df78 tar remains unchanged. New producer runner is a separate file, hash `8d17bf5538b882e48b3956edea381a8c85e3a54b90b0f6f01e96bd6b360cd33b`; original external sandbox was never edited. Public checkout/index and previous operator work were not mutated.

All53 frozen leaf IDs/text/order and exact six-column strategy checked unchanged. At proof completion ISC1/2 still unchecked, alongside39/40; historical sticky FAILs must be explicitly resolved by Alice author using this evidence before gate closure/canonical reconciliation. Do not silently erase historic RED evidence.

Verdict: Ship **locally scoped R1/R2 acceptance evidence only**, pending author publication of exact sticky resolutions for final gate completion. No commit/push/publication/deploy/activation is authorized.

Not checked: remaining external all53 review, arbitrary plugins/filesystem-adversary certification, production/live providers, real historical/cross-version migration, running-BB UI. BB compaction unsupported and prior migration limits remain unchanged.
