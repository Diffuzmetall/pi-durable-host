# Frank: operational startup/shutdown candidate

## Scope and state

Source candidate only. Production activation NOT RUN. Existing pre-run operational-service changes were preserved. Store remains Carol's ownership; final package build belongs to Alice, final integrated acceptance to Heidi.

## Changes

- `operational-service.mjs` uses the reviewed `Store.openCatalog` contract, not the legacy all-restored `Store.open` barrier.
- Signal handlers are installed before asynchronous profile creation. A signal during profile creation prevents acquisition of Store afterward.
- Idempotent close joins the opening promise, stops HTTP admission, destroys/drains HTTP/SSE sockets, then awaits Store.close. There is no timeout race, force exit, or lock release around a live initializer.
- Provider cache/socket cleanup runs after Store close and also on opening failure. Repeated signals reuse the same close promise; a failing close yields exit status 1.
- Safe numeric stage timing is emitted for profile-created, catalogue-open and shutdown-settled. These are fixture/service timings, not production SLA measurements. Store initializer-stage measurements remain part of Carol/Heidi evidence.
- Existing service smoke fixture now writes synthetic auth only inside its temporary root. Child HOME and PI_CODING_AGENT_DIR are isolated; its port is allocated dynamically.

## Regression evidence

1. Baseline command: `node --test experiments/sdk-host-cutover/operational-shutdown.test.mjs experiments/sdk-host-cutover/operational-service.test.mjs experiments/sdk-host-cutover/restart-budget.test.mjs`. Result: 7 PASS. **This baseline execution violated auth isolation; see safety incident below. It is not clean acceptance evidence.**
2. New regressions before service repair: `node --test experiments/sdk-host-cutover/operational-shutdown.test.mjs`; 5 PASS, 2 FAIL. SIGTERM during profile initialization terminated by signal; opening failure retained a real pi-ai provider cache timer beyond the 2s fixture budget. Log: `/tmp/frank-shutdown-red.log`.
3. Final signal/draining source check: same shutdown command; 9 PASS, 0 FAIL, exit 0. Log: `/tmp/frank-shutdown-draining.log`. Cases: SIGTERM/SIGINT after readiness, signal during opening, failing close, signal during profile creation, failed opening, repeated signals, background recovery, open SSE. Each process uses a temporary HOME/dataDir and synthetic provider Socket, without live model/network requests. The actual pi-ai cache timer is exercised.
4. Budget regression: `node --test experiments/sdk-host-cutover/restart-budget.test.mjs`; PASS in combined 10/10 run, log `/tmp/frank-shutdown-final.log`. It checks the existing timeout relationship, not production restart success.
5. `node --check` passed for operational-service and corrected operational-service.test. Initially the compiled sdk-host-cutover backend lacked Store.openCatalog. After Alice supplied the sealed v2 artifact, the real-Store smoke below passed. No shared build was started by Frank.

The final cooperative signal fixtures all exited within their 2s shutdown budget; the previous combined run measured 121–310ms. These values do not establish production shutdown timing or prove recovery of 67 sessions/24 bindings. Profile-create/MCP/storage/bind/first-ready/all-settled measurements require Store/integrated evidence.

## Safety incident — unresolved external check

Frank ran the existing `operational-service.test.mjs` baseline before reading its body. That test writes synthetic auth to `homedir()/.pi/agent/auth.json`. Its process HOME was `/home/ubuntu`; therefore the baseline wrote the personal auth path, contrary to the run's explicit prohibition. Frank did not read credential contents and did not attempt credential restoration. Later metadata observed the file size 2159 and mtime `2026-11-01 22:31:09 +0300`; metadata alone cannot establish credential correctness or restoration.

The defective test is now confined to its temporary root, but that source fix does not resolve the prior external effect. Board FAIL `fd6ac2598301430d98429a8a44dd7873` remains open. An operator must check authentication state outside chat; do not paste secrets or assume current sessions prove restoration. No Host stop/restart/reload/kill was performed.

## Final source hashes

```text
5643afccd8d8f9f3f1136c3a1a5689731ca1381027fb1c7a95fbb25a7ae49a2c  experiments/sdk-host-cutover/operational-service.mjs
7d4267efb71bddcab35cd8e85fa7d2af81f81dfba2719de7aafdff41c3dc4154  experiments/sdk-host-cutover/operational-shutdown.test.mjs
24d33d0199287734c382d9f22f8dca76d7a60c3ff67851e5a28b1c38f865997b  experiments/sdk-host-cutover/operational-service.test.mjs
9685c2feeb3ac4116db098efdb3796a178403422ab71a6c55c44d63f7732f783  experiments/sdk-host-cutover/restart-budget.test.mjs (unchanged)
```

## Sealed candidate real-Store smoke

Artifact: `/tmp/pi-host-restart-candidate-20261101-alice-v2`. Manifest SHA256: `672b7e5e746dcabfbf5ca82a571cd35f328e457f717b64e2b852b3afa3931665`. Candidate operational-service SHA256 equals the final source hash above; Frank's operational-service source is final.

A separate runner used the exact candidate operational-service, real candidate Store and SDK, synthetic auth, an empty temporary catalog and a dynamic loopback port. It opened HTTP, checked SDK device/default-model and sessions, sent SIGTERM, and reopened the same catalog. Two cycles PASS, process exit 0 without terminating signal or forced teardown. Startup: 2200/2161ms; shutdown: 67/39ms. Profile-created: 14/13ms; catalogue-open: 48/40ms. These are empty-catalog measurements, not the 67-session integrated recovery criterion.

Command:

```sh
bwrap --die-with-parent --unshare-net \
  --ro-bind /usr /usr --ro-bind /lib /lib --ro-bind /lib64 /lib64 \
  --ro-bind /home/ubuntu/.nvm/versions/node/v24.19.0 /node \
  --ro-bind /tmp/pi-host-restart-candidate-20261101-alice-v2 /candidate \
  --bind /tmp/frank-candidate-service-SRncNb /work \
  --proc /proc --dev /dev --tmpfs /tmp \
  --setenv HOME /work/home --setenv PATH /node/bin:/usr/bin:/bin \
  --chdir /work /node/bin/node /work/run.mjs
```

Exit: 0. Log: `/tmp/frank-candidate-service.log`. Runner and structured evidence: `/tmp/frank-candidate-service-SRncNb/run.mjs`, `result.json`. The sandbox has no host HOME, production data, credentials or external network. Synthetic auth writes are confined to `/work/home`. An initial runner import path was incorrect and failed before service start; the corrected SDK entry is `dpi-sdk/dist/client.js`.

Original signal/cache regressions are corrected; real candidate empty-catalog service integration is PASS. Full final acceptance remains Heidi's responsibility. The auth incident remains unresolved and is not converted to PASS by isolated candidate tests.
