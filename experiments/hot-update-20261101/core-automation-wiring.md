# Native profile automation factory wiring — Carol

Task `5e6afd446e0f4df2a1496869fa7ee5e4`; source integration after trusted replacement DONE243.
Production activation NOT RUN. Independent immutable installed acceptance NOT RUN.

## Delivered

Frank delivered `automation.prepareReload()` in FACTa8382159db56461abcffdc7b6d6d83c0 and retains ownership of automation.ts. Carol wired that existing method into `profile.prepareReload` before the existing `ReloadableRegistry.prepare` call. It stages a fresh schedule handler with the same native admission/cancellation closures and existing service/lifetime; it does not bind or create another producer/timer. Explicit trusted replacements take precedence by extension name, so an explicit schedule candidate is not duplicated by the automatic candidate. Duplicate explicit names still fail in the registry.

The ordinary reload now exercises the same factory at bootstrap (before bind) and on the existing Harness. Goal control/service and authority extension identities remain unchanged. Closing still fences preparation. This closes the "not automatically wired yet" limitation in core-trusted.md; that earlier report remains historical. No Store, HTTP, SDK, native engine, package loader or installed dependency was changed in this small wiring task.

## Verification

- `/tmp/hot-update-sandbox-klkbfce2/run.log`: **54 PASS, 0 FAIL, 0 skipped**, exit0 after the physical negative self-check. Same eight backend suites as the trusted final run, omitting only unchanged package safety (already 5 PASS in `/tmp/hot-update-sandbox-myfxmmit`). Exact argv/mounts/import hook: `/tmp/hot-update-sandbox-klkbfce2/command.json`.
- Extended native-profile test proves ordinary reload stages a different schedule extension with no apply barrier, retains exact native-goals and authority objects, honors explicit schedule replacement, denies authority replacement and rejects preparation after shutdown.
- Existing full Store/Harness/HTTP/SDK busy tool/schedule, task checkpoint, schema window, unsafe recovery, Goal/skills persistence, provider and policy regressions pass with the automatic factory wired.
- Backend strict typecheck PASS, exit0: `/tmp/carol-s5-auto-typecheck.log`. Package source/dist were unchanged, so the prior successful package build was reused.
- `git diff --check` PASS. Runtime evidence uses the explicitly documented source alias, not installed acceptance. Frank's actual DeLM/automation producer proof and Bob's memory/MCP/voice proof remain their own tasks; this report does not relabel those partial results as Carol's acceptance.

## Correlated source hashes

```text
914d308738250e80aa9ed55f368623c0511af910f0665cda8e35acb00bb76260 apps/dpi-backend/src/native-profile/profile.ts
327169d447550f9c0ae76c6f0744d03d673b354025c2df53d659349dd658b15d apps/dpi-backend/tests/hot-update-trusted.test.mjs
86270a6d672f20ab54a7ea6e370bb4c71d2633a154c6b42b4dd5a335f4525ff4 apps/dpi-backend/src/native-profile/automation/automation.ts
```

The automation.ts hash identifies Frank's consumed callable, not a Carol edit or completion claim on his task. Profile/test hashes supersede the corresponding values in core-trusted.md. Alice must package one fresh physical immutable dependency closure; Grace/Heidi review/test that same final manifest. No production activation was performed; the operator-only auth incident remains open.
