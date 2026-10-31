# Standalone iii adapter

A signed iii 0.24.6 function worker for delegated jobs in an **already-running Durable host**. The client uses public `dpi-sdk`; the server owns native job conversations, request fingerprints, receipts, parent controls and persisted answers. This package does not start/resume a host, open native session files, choose a model, create another scheduler, or import terminal/BB adapters.

This is a locally verified producer candidate, not independent P5 acceptance or permission to activate production, use a personal session, or call a live model. The selected source owner confirmed MIT publication rights; that does not authorize deployment. See `NOTICE.md` and `SOURCE.json`.

## Install only this client

Use Node 22.19+ and the exact immutable SDK/adapter archives from the accepted candidate. In an empty disposable directory, with a temporary HOME:

```sh
mkdir -p "$CLIENT_HOME" "$CLIENT_DIR"
HOME="$CLIENT_HOME" npm --prefix "$CLIENT_DIR" install --offline --ignore-scripts \
  --no-audit --no-fund "$SDK_TGZ" "$III_TGZ"
HOME="$CLIENT_HOME" "$CLIENT_DIR/node_modules/.bin/dpi-iii-worker" --help
```

No backend, terminal adapter or BB adapter belongs in this client installation. `iii-sdk@0.24.6` is the pinned transport dependency. It uses its ordinary iii process marker under `HOME/.iii/run`; this is not a Durable session/DB. Tests give it a temporary HOME and remove inherited iii credentials.

## Trusted configuration and server grant

The operator supplies an owner-private JSON file (0600, current UID). `workspace` is the **server's** absolute workspace, not a local directory to open. `host.agentId` identifies the existing trusted native root anchor; the server creates isolated job conversations beneath the configured binding, not the client.

```json
{
  "version": 2,
  "optIn": true,
  "contractVersion": 2,
  "sessionId": "disposable-worker-binding",
  "workspace": "/absolute/disposable/server-workspace",
  "namespace": "durable-pi-test-fixture",
  "url": "ws://127.0.0.1:49134",
  "publicKey": "-----BEGIN PUBLIC KEY-----\n...generated Ed25519 public PEM...\n-----END PUBLIC KEY-----\n",
  "host": {
    "baseUrl": "http://127.0.0.1:43123",
    "sessionId": "exact-native-session-id",
    "agentId": 1,
    "tokenEnv": "III_FIXTURE_DPI_TOKEN"
  }
}
```

Generate a disposable Ed25519 key pair with Node's `generateKeyPairSync('ed25519')`; keep the private key with the signer, never in worker JSON or the package. `workerConfig(config).configHash` is the original canonical SHA-256 fingerprint of the **complete** configuration. The bearer value is read only from the explicitly selected environment variable, not stored in JSON or its hash.

The **server operator**, not an invocation body, must issue a current grant with `source:'iii'`, `authority:'delegated'`, the exact native session/root binding, and `binding.iii`:

```js
{
  bindingId: config.sessionId,
  namespace: config.namespace,
  configHash: fingerprint(config),
  workerId: fingerprint(config.publicKey)
}
```

`workerId` here is the pinned signer digest, **not** `_caller_worker_id` or a runtime-assigned iii worker ID. The server's selected row supplies the workspace. The client compares every identity field, workspace, native session and root against the actual `iiiInfo()` proof before registration and each operation. Namespace/config/signer/root drift is a binding conflict, never permission to create or adopt another session.

Use a dedicated delegated bearer through `III_FIXTURE_DPI_TOKEN` and start only the transport:

```sh
HOME="$CLIENT_HOME" "$CLIENT_DIR/node_modules/.bin/dpi-iii-worker" --config "$WORKER_JSON"
```

Startup output says `transport:"starting"`: host binding is verified, but engine registration remains asynchronous. The actual iii SDK handles namespace registration and reconnect. SIGINT/SIGTERM unregister functions and close only this transport; accepted native work continues.

## Signed function calls

Each invocation requires the original Ed25519 envelope. The expected function ID is the registered constant and the session is the trusted logical `config.sessionId`:

```js
import { signed } from 'dpi-iii-adapter';
const functionId = 'durable-pi::start';
const envelope = signed(privateKey, config.sessionId, functionId, {
  requestId: 'stable-job-1', content: 'Read the disposable fixture file.'
});
const admission = await caller.trigger({
  namespace: config.namespace, function_id: functionId, payload: envelope
});
```

Here `caller` is an actual iii SDK client or the equivalent engine function invoker. The signature binds exact function/session/body/expiry. `_caller_worker_id`, invocation metadata, `source`, `human`, arbitrary module/tool names and caller-supplied native IDs never become credentials or operator authority. The standalone worker exposes signed mode only; the preserved low-level `Admission` helper's explicit local-iii branch does not enable an unsigned worker route.

Registered `durable-pi::` functions:

- `info` — current server-owned binding proof.
- `start` / `task` — `{requestId,content}`: native admission, **not completion**. Initial request ID becomes the job ID.
- `run` — same input; wait for the native canonical answer/unanswered result. A transport timeout does not stop the job.
- `follow_up` / `steer` — `{jobId,requestId,content}`: a distinct input to an existing binding-owned job.
- `requests::get` — `{requestId}`: reconcile the original native receipt after a lost acknowledgement/reconnect/restart. Do not invent a new request ID.
- `requests::result` — `{requestId,answerRef,cursor?,limit?}`: persisted native answer pages, reauthorized on every read.
- `controls::inspect`, `subagents::spawn/send/stop`, `supervisor::reply`, `conversations::follow_up/steer` — the original native target/revision/control envelopes. Inspect first and use the exact returned current revision. A readable target is not automatically controllable.
- `stop` — `{jobId,controlId,expectedGeneration}`: original native owned-job stop/reconciliation, not generic task abort.
- `controls::get` — `{controlId}`: reconcile the child or job-stop receipt without issuing another command.

No tree/invalidation/recovery/event-delivery API is advertised by this bounded transport surface. It does not claim an automatic chat/Console wake or successful model delivery from a transport acknowledgement.

## Retry and immutable results

Keep the original job request key and signed business intent. The server's actual native journal/fingerprint decides identical retry versus conflict; there is no client request cache, local journal or receipt-ID alias. Concurrent retries and a replaced client must resolve the same native submission. Changed content/mode/job intent/configuration is not an identical retry.

A request can be accepted while the engine reply or HTTP connection is lost. Reconnect/reopen the same binding, then read the original request ID; do not spawn a replacement job. `unanswered`, pending stop and failed/interrupted outcomes are not success.

`resultInfo.answerRef` addresses the persisted native answer **within the authenticated binding**. Pass it unchanged with the original request ID to `requests::result`. Concatenate pages with the same limit. If a process-local pagination cursor expires after restart, restart paging with the **same answerRef**, not a new job. A tree invalidation cursor is never an answer reference. Each page must retain the same answer hash/length.

## Local verification

From this fork, the normal client checks are:

```sh
npm --prefix apps/iii-adapter run check
npm --prefix apps/iii-adapter test
npm --prefix apps/iii-adapter run build
(cd apps/iii-adapter && npm pack --pack-destination "$ARTIFACT_DIR")
```

The actual-native installed-archive check is separate and has no moving-source fallback:

```sh
DPI_III_TEST_BACKEND_ROOT="$BACKEND_INSTALL/node_modules/dpi-backend" \
DPI_III_TEST_CLIENT_BIN="$CLIENT_DIR/node_modules/dpi-iii-adapter/dist/main.js" \
npm --prefix apps/iii-adapter run test:native
```

`BACKEND_INSTALL` is a separate disposable installation of the exact backend archive; it is **not** part of the iii client installation. The test uses the backend's public server/profile exports, genuine existing Harness/storage, explicit in-memory credentials and only the faux provider. It generates its own temporary native data/workspace/keys and loopback ports. Node's parent-URL import resolver is enabled only by the native-test script to honor public import-only package exports.

The loopback engine fixture uses the actual pinned iii WebSocket SDK/protocol, disposable Ed25519 keys and temporary HOME. It is not a production iii engine. Strict compilation against the installed immutable SDK, twelve component tests, and the installed iii-only CLI/native fixture passed on the producer candidate. The latter exercises lost acknowledgement, four identical retries, owner reopen and late immutable answer paging, stale/foreign/revoked controls, genuine native child creation and pending-stop receipt reconciliation. The server's public coarse conflict/denial messages are checked without expecting private internal causes.

The backend archive is SHA-256 `1df78d0f7ae265adf2a46b966cf8f12842fd2748900f48724dcf4bc887426410`; SDK archive is `351054859022ae202fbdc429e73da441bc90295e4717342652079c3ea0906abd`. The client archive hash and commands accompany the producer handoff, outside the self-describing package. These self-verification results do not replace the independent iii/final gate, a single final five-package tuple, unchanged-terminal mixed-version checks, or the outstanding real-history/running-BB checks. No production or live-provider inference was performed.
