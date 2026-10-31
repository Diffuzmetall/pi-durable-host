# Independent native parent / BB transport gate

Historical status: **REJECTED successor a0ac** (retained). Corrected immutable backend `5cf8...` independently passes the same probes; see [SUCCESSOR.md](SUCCESSOR.md). This is a new completed-feature boundary review, not full BB/iii acceptance. Historical terminal acceptance on backend `4d3cf2d8...` / SDK `d9883174...` is unchanged.

## Candidate and independence

- Backend: `/tmp/dpi-packed-ngdj7Z/artifacts/dpi-backend-0.1.0.tgz`, SHA256 `a0ac9e70aa8e61e4546639b3c7f81c3a4bfccad35da7387c2b26cf6288e9fffe`.
- SDK: same directory, `dpi-sdk-0.1.0.tgz`, SHA256 `8e84187c20a7c8423150f542aed8793833c7b35409a5e7413d64777324f3cd9f`.
- Both hashes freshly checked. Tests import actual installed compiled Store, native profile, grants, HTTP server, original Harness/SQLite and public SDK from `/tmp/dpi-packed-ngdj7Z/install/node_modules/`; only fixture TypeScript uses the existing local tsx loader.
- Bob authored the new HTTP/SDK/Store transport and genuine Tx extraction. Dave independently checks those new boundaries. Dave authored original native subagents/parent-control and original localized binding-store; **unchanged helper internals are excluded from independent source approval**.
- No product, SDK, manifests, installed files, old artifacts, global configuration, production state or live providers were edited. All model identities are faux. Store data and loopback servers are disposable and cleanup runs in fixture finally blocks.

## Positive baseline: 2/2 PASS

Original `apps/dpi-backend/tests/native-parent-http.test.ts` and `native-bb-binding-http.test.ts`, with only backend/SDK import rebinding to installed JS, ran successfully:

```sh
node --import /home/ubuntu/Projects/pi-durable-host/apps/dpi-backend/node_modules/tsx/dist/loader.mjs --test \
 /tmp/dave-native-transport.SCLO16/native-parent-http.test.ts \
 /tmp/dave-native-transport.SCLO16/native-bb-binding-http.test.ts
```

Log: `/tmp/dave-native-transport-immutable.log`; 2 passed, 0 failed, duration 3015.556478ms. The logged post-admission lookup exception is intentional fixture interruption: pending stop survives owner reopen and reconciles the same barrier.

These assertions cover exact server-owned provider/session/thread binding; root/child scopes; no forged provider/authority; native child key/conversation/execution/request; CAS losing-index rollback; exact retry/conflict/stale/foreign/tool/observer denial; delegated read/contact only; original native receipts; pending-stop/reopen/reconcile and canonical IDs. Source review traced `auth.ts` → `routes.ts` → Store methods → actual native authorization/Tx/helper, plus profile delegated input and trusted policy references. No generic abort or fabricated ToolExecutionApi is used.

However, the original BB revocation probe targets an **already-bound** child under a different thread: CAS would reject independently. Its zero-effect assertion does not prove a fresh binding cannot commit after late revocation.

## Defect 1: revoked BB grant still commits a fresh binding

Probe `/tmp/dave-native-transport.SCLO16/mid-tx-revocation.test.ts` retains the complete BB baseline, adds a real NEW unbound owned child, and revokes `root-a` immediately after the final `policy.assert(..., 'control', ...)` inside Store.bbBinding's genuine owner transaction. No transaction is mocked.

Expected: HTTP 401 and no native BindingDoc or BB identity index. Actual: HTTP 401, **but the binding and index persist**, pointing `revoked-thread` to native conversation 41. Reader returns the full binding instead of undefined.

```sh
node --import /home/ubuntu/Projects/pi-durable-host/apps/dpi-backend/node_modules/tsx/dist/loader.mjs --test \
 /tmp/dave-native-transport.SCLO16/mid-tx-revocation.test.ts
```

RED log: `/tmp/dave-native-transport-mid-tx.log`, 1 failed / 0 passed, assertion line 105. FAIL publication `8b870345e8404350aa80751f8c6c9e13` (525).

Cause: current authorization precedes awaited native conversation/document/ownership verification and `putDurableBinding`; the outer recheck runs after commit. The aborted context did not roll back the mutation.

## Defect 2: revoked parent grant still creates a new child

Probe `/tmp/dave-native-transport.SCLO16/parent-late-revocation.test.ts` retains the complete parent baseline, including retry/reopen/pending stop, and changes ONLY its final revocation hook: from early `policy.assert(read)` to `policy.assertReference(control)`, the last delegated authorization in the NEW Store.prepareChild callback, before awaited `bindExistingInput`.

Expected: 401 with unchanged native conversation IDs `[1,16]`. Actual: 401 but native IDs become **`[1,16,40]`**: a new child committed under the revoked credential.

```sh
node --import /home/ubuntu/Projects/pi-durable-host/apps/dpi-backend/node_modules/tsx/dist/loader.mjs --test \
 /tmp/dave-native-transport.SCLO16/parent-late-revocation.test.ts
```

RED log: `/tmp/dave-native-parent-late-revoke.log`, 1 failed / 0 passed, assertion line 127. Current FAIL `38239c293dfd4e43be24104d8b35580f` (531). Original 530 was replaced **only** to remove accidental linkage blocking its corrective task; correction `720b9e0643a34d808ffd9f68a5b9b631` is not a product fix. The defect remains unresolved.

Cause: the existing `beforeAdmission` callback executes before asynchronous child/reply/stop/receipt mutations, not at transaction completion. Late delegated authorization can expire after that early barrier.

## Required correction and continuation

Corrective task `2d94c158180040c58fd346cb33a044fe` has no rejected prerequisite dependency, so its owner can repair the owning transaction boundary without a tracker deadlock. Both defects need current authorization at genuine transaction completion, preserving native algorithms, receipts, pending stops and exact ownership; no replacement runtime or speculative policy machinery.

A new immutable candidate must retain successful baseline 2/2 and pass **both** unchanged late-revocation probes: no fresh binding/index and no fresh child after 401. Both current FAIL publications require explicit evidence-backed resolution. Dave retains independent review task `85fe3c6398eb4547adaf4ba0681bd672` until that check. Alice can continue disjoint BB client preparation, but full BB/iii acceptance cannot consume the rejected successor.

Scope: ISA F3 ISC28/30 and native parent authority used by F4 ISC33.1/33.2; relevant current-grant negative criteria. This report does not close history/digest, standalone BB install/mixed version, BB latency, iii, whole ISC38 or all 53 leaves. Canonical ISA/PLAN/README remain the separately leased writer's responsibility.
