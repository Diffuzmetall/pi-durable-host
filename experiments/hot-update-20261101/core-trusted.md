# Trusted handler replacement — Carol

Usable source output for task `e9d587e5892446c4879437baf67f2dcf` (S5 prerequisite).
Production activation NOT RUN. Final immutable installed review/QA NOT RUN.

## Need and reuse

Frank's real disposable DeLM probe `/tmp/hot-update-sandbox-g_75ycxg/run.log` showed that a newly imported engine handler stayed v1: the existing facade protected every base extension. Frank owns that RED and the actual DeLM producer/adapter tests; Carol owns only this shared seam.

Existing `Registry.install` replaces one extension by name and publishes immutable snapshots. Reuse: `ReloadableRegistry.prepare` stages the same native operation, validates it with S3 compatibility checks, then applies it synchronously inside the existing mutation-line publication. No loader, revision journal, runtime/producer owner, timer, watcher, extra binding or new HTTP/SDK protocol was added.

## Exact interface

```ts
interface NativeExtensionReplacement {
  extension: Extension;
  documents: readonly NativeDocumentContract[];
}
// Documents are native DocToken.definition values, not a persisted manifest.
// prepareReload(additions = [], replacements = []) returns a staged preparation.
// DeLM consumer:
await composition.prepareReload([], [{
  extension: guarded,
  documents: [DelmWaitDoc.definition],
}]);
```

The exported type lives in `@local/pi-durable-reload`. The generic facade constructor accepts an explicit trusted server-owned allowlist; its default is empty. The native full profile's only allowed replacement names are `delm`, `durable-schedules`, `hindsight`. The memory name was added after Bob's concrete existing controller seam in FACT7c542b079fdb43b789ae711e9f77201e. Neither authority/guards, Goal control/service, nor `hindsight.delivery` are replaceable. Client/module adapter inputs cannot alter the allowlist.

Only an existing base extension can be replaced. Duplicate replacement names and changed tool/task name sets are rejected. Adapters still cannot replace staged protected definitions. Replay/callers, tool schemas, task versions/phases and stored document metadata retain S3 checks. Native task phase snapshots are unchanged. Document metadata is normalized to native kind/version/scope/history/fork, retained for later ordinary reloads, and cannot be silently dropped by a subsequent replacement. These are ephemeral validation declarations; callers must pass the actual native tokens their trusted handler uses. Arbitrary closure/code semantics are not inferred, and unversioned incompatible payload changes cannot be detected by a version contract.

Pure replacement returns no resource `apply`, so existing pending native waits/schedules do not cause a session-wide idle requirement. The caller must preserve its existing producer/controller, lifetime, current authorization and subscriptions. This interface replaces definitions, not resources or ownership. The supplied publisher remains synchronous and nonthrowing under its trusted contract.

## Consumer handoff

Frank accepted the descriptor API in FACT8bdc7ee6120448dbb07735543cbaf64d. His real DeLM adapter now retains validate/validateState and omits unconditional apply for an already-selected extension. Actual DeLM delivery/wake proof remains his task, not these core tests.

FACT5f6779dcf8a948b3924fdb3a458051ab confirms Frank may edit only `automation.ts` under a separate lease: retain ScheduleOptions and authorization/admission/cancel closures; expose `automation.prepareReload(): Promise<NativeExtensionReplacement[]>` returning fresh `createSchedules(sameOptions)` plus `ScheduleDoc.definition`. It must work before bind at bootstrap and reject after shutdown. No session-goals edit, new producer, timer or repeated bind. Carol still owns profile wiring when that callable source is delivered; this report does not claim the not-yet-delivered automation factory is already automatically wired.

Bob may stage only the existing `hindsight` presentation extension through this descriptor. The delivery kernel/controller/bank/log identities remain his existing owners. His actual memory/MCP/voice integration remains separately verified S5 work.

## Verification

- `/tmp/hot-update-sandbox-myfxmmit/run.log`: **59 PASS, 0 FAIL, 0 skipped**, exit0, after physical sandbox negative self-check. Seven new trusted tests plus the existing 52 core/compatibility/profile/provider/skills/Goal/package safety tests.
- New tests run actual Harness/SQLite: pending handler v1 continues once, next phase runs v2 on the same task ID; one existing sleeping schedule keeps its ID; document effect count remains one; v2→v1 same-contract replacement is accepted. The schedule in this core fixture is a native task, not the real DeLM engine. Actual schedule/DeLM producer census remains Frank's integration proof.
- Negative tests refuse guard replacement, changed surface, incompatible schema/task/doc versions before base/current mutation; retained document declarations cannot disappear. Actual full-profile test accepts its explicit schedule replacement and refuses `local-host-automation-authority` replacement.
- Initial fixture-only failures in `/tmp/hot-update-sandbox-qct0ky29` were missing required Models and profile directory, not product behavior. Corrected fixture supplies native createModels and a disposable directory; no test relaxed a compatibility assertion.
- Package build PASS: `/tmp/carol-s5-trusted-final-build.log` (`npm --prefix packages/durable-reload run build`). Backend strict typecheck PASS: `/tmp/carol-s5-trusted-final-typecheck.log` (temporary existing source-verification tsconfig mapping package declarations to fresh dist).
- `git diff --check` PASS. No unrelated user/peer changes were reset, stashed, checked out, committed or deployed.

Exact sandbox argv/mounts/import hook: `/tmp/hot-update-sandbox-myfxmmit/command.json`. The same source-only alias from `core-s3.md` maps the backend's older physical package copy to fresh source; package safety tests consume rebuilt dist. Test list: hot-update-trusted.test.mjs, hot-update-compatibility.test.mjs, hot-update-core.test.mjs, profile-reload.test.mjs, provider-hot-reload.test.mjs, native-skills-reload.test.ts, native-skills.test.ts, native-goal-operator.test.mjs, and ../../packages/durable-reload/reload-safety.test.mjs, from /repo/apps/dpi-backend. This is not installed acceptance; Alice must still package a fresh physical dependency without that source alias.

## Final source hashes

```text
b2251cc1f8ff37efb6e612877a38ae6cd19b629c79ccbe5abc8b17a0ea5e0b05 packages/durable-reload/src/index.ts
78674429c65bcafd459ca73e2dc18f84c86a1db1ada3d8220d24b694184d6c33 packages/durable-reload/src/registry.ts
8cdd895703e896b8a3de86f7131fc0857a7af3be1680f5aee26348d1c7e68b23 apps/dpi-backend/src/runtime-profile.ts
902997ba2765fed426703a7dd71af0e5c054d1965517a161cc5350f8e61d906e apps/dpi-backend/src/native-profile/profile.ts
853f6c72d474a5b95df98475a622af1c44c947bb643e0ea73fdda5e87aeb7d55 apps/dpi-backend/tests/hot-update-trusted.test.mjs
```

These supersede the corresponding file hashes in core-s3.md; that earlier evidence remains historical. Startup preflight/Store logic and compatibility.ts were not changed in this slice. Grace/Heidi independently review/test the final single immutable manifest. Production activation NOT RUN; the operator-only auth incident remains open.
