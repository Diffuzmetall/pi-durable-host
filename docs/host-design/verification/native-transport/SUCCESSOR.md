# Corrected transport: independent red → green

**PASS, bounded to this exact candidate and new transport boundary.** The rejected `a0ac` archive and both RED probes remain unchanged. Correction producer `2d94c158180040c58fd346cb33a044fe` DONE539 was consumed immediately, without waiting for optional coherent-outcome API work.

## Exact installed candidate

- Backend `/tmp/dpi-packed-GIuHTg/artifacts/dpi-backend-0.1.0.tgz`: SHA256 `5cf8c2c3e2aa632283e2f8dadcd8d1106f6e704960641e1a1f69b325afe364c5`.
- SDK `/tmp/dpi-packed-GIuHTg/artifacts/dpi-sdk-0.1.0.tgz`: SHA256 `8e84187c20a7c8423150f542aed8793833c7b35409a5e7413d64777324f3cd9f` — byte-identical to rejected successor's SDK; no wire/dependency change.
- Independently checked **all 238 installed backend files and all 23 installed SDK files** against their exact archive members, byte for byte. Tests executed compiled installed product JS, not moving workspace source.

## Source boundary review

Compared the old and corrected installed `store.js`, `native-profile/subagents/parent-control.js`, and `native-profile/profile.js` directly.

- BB writer now rechecks current authorization synchronously inside the genuine owner transaction, **after** awaited verification and original binding/index writes and before returning to commit. A denial rolls back those writes.
- Native parent grant has a nonpersisted synchronous `assertCurrent` callback. The original native transaction calls it after all asynchronous child/reply/stop/receipt mutations, including canonical retry. Profile composition checks both max owner and caller. There is no asynchronous operation after this final check inside the mutation callback.
- This keeps the native ledger, exact IDs, revision, child/tool scope, stop barriers, pending-stop recovery, ownership and existing algorithms. No fake ToolExecutionApi, alternate runtime, generic abort fallback or client storage was introduced.

Bob authored the correction; Dave independently reviewed its new transport/final-checkpoint changes. Dave's original parent-control and localized binding-store authorship remains disclosed: unchanged helper internals are **not** claimed as independently source-approved by their author.

## Exact regression replay: 4/4 PASS

Fixture directory `/tmp/dave-native-transport-green.6P40nD` contains the same five fixture/helper files as `/tmp/dave-native-transport.SCLO16`. A byte comparison confirmed that **only** `dpi-packed-ngdj7Z` → `dpi-packed-GIuHTg` was substituted; all test assertions were preserved. Its node_modules points to the new isolated installed candidate.

```sh
node --import /home/ubuntu/Projects/pi-durable-host/apps/dpi-backend/node_modules/tsx/dist/loader.mjs --test \
 /tmp/dave-native-transport-green.6P40nD/*.test.ts
```

Log `/tmp/dave-native-transport-successor.log`: **4 passed, 0 failed, 0 skipped**, duration `3314.520629ms`.

1. Original installed BB HTTP/SDK baseline: exact provider/session/thread, native child identity, CAS/retry/conflict, foreign/body/child-scope denial, reopen — PASS.
2. Original installed parent HTTP/SDK baseline: exact canonical receipts/retry/stale/tool/foreign denial; pending stop survives owner reopen and reconciles the **same barrier**, no replacement child — PASS.
3. Same stronger late-BB-revocation probe that was RED: a genuinely new unbound owned child, revoke after final control assertion inside the real transaction, HTTP401 and **no binding/index** — PASS.
4. Same stronger late-parent-revocation probe that was RED: revoke after final delegated prepareChild authorization, HTTP401 and **unchanged native conversation IDs** — PASS.

The intentional parent post-admission lookup interruption remains exercised; it is not an unexpected product failure. All servers/stores use faux identities, disposable directories and loopback; fixture cleanup completed. Only test TypeScript uses the local existing loader. No live service/model, personal bank, production data, product edit, additional agent, package installation or global-setting change was used by this checker.

## Evidence verdict and remaining scope

Both concrete failures are corrected on `5cf8...` and may now be explicitly resolved: BB `8b870345e8404350aa80751f8c6c9e13` and parent `38239c293dfd4e43be24104d8b35580f`. Original parent530 was only a routing correction, not the earlier technical resolution. Historical rejected `a0ac` remains rejected.

Reviewed the full current ISA Test Strategy and all 53 Features before closure: canonical accounting remains **42 PASS / 6 PARTIAL / 5 UNKNOWN**. This output supports current-grant transport safety and the native binding/control seams needed by ISC28/30 and ISC33.1/.2; it does **not** close full BB/iii leaves. Those still require actual adapter history/outcomes, mixed-version/standalone installs, BB latency, iii job/answerRef and independent milestone gates. ISC38 remains partial; offline/live-data boundaries remain unchanged. No canonical ISA/PLAN/README files were edited.

Alice's BB consumer can use this corrected transport while the separately owned coherent child-outcome/target-inspection seam proceeds. Any later changed backend archive must be correlated again at the full BB gate; this check is not blanket acceptance of future source or packages.
