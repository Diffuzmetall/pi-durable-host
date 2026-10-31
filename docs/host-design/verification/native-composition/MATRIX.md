# Bounded native-profile composition / local-service audit

Status: **bounded component audit PASS; GitHub current-grant finding independently resolved on corrected source and compiled candidate**. This is Bob's requested nonauthor review of the new trigger/tracing port and independent composed-service evidence, not a whole-product or production acceptance. Alice is the only coupled Store/profile/runtime/manifest writer; Carol owns the final independent BB/outgoing gate; Dave owns the single final regression/inventory tuple. No live external service, production bank, paid model, runtime activation, Core edit, or extra actor was used.

## Exact checked baseline candidate

The first two composed cases below ran on `de736…`. The corrected candidate differs in exactly one GitHub transport asset; the new third case was independently checked on that corrected source and compiled package (see final section). Previously executed cases were not repeated or silently relabelled as a new full suite.

- Immutable backend archive `/tmp/pi-host-final-acceptance/artifacts/dpi-backend-0.1.0.tgz`: SHA256 `de736ac4bce0e00c87b72d3ad77496200853c8c229e7f0be921dd89f860c13c8`.
- Actual installed package `/tmp/pi-host-final-acceptance/host/node_modules/dpi-backend`: all **292** archive files match; sorted compact JSON member map SHA256 `4cd9d9eb6d245323f4d88c23c93973a15ee5c3d92de1930027f04da72bff1a3b`.
- Test imports compiled `dist/dpi-backend/src` and the installed package's own native dependency closure. No copied product implementation, replacement Harness, source-backend alias, global settings, or dependency download. Source mode separately executes the same retained test body.
- Source profile SHA256 `009921e79269775154a78862f2d1d0ae1d40248a00adf88a704db16f47225dc8`; automation `d51e661062997fa49c7228700aea4d53c640974d7869cdfecd755fafd7d75256`; GitHub transport `376c74713027ee2768be3d2a4c98b49d748a28b121f27a76b423311ef007d881`; triggers `b08fee3d3ef5645251879484d993c5668ac3515d462284d0dea651cd916ef9bc`; tracing `39fff0168337784c32ea67c34c6b0c711c9e67404b9d864ad260b70bc1147002`.

## Evidence matrix

`EXECUTED` means a real native path ran inside the isolated fixture. `REGISTERED` means registry/definition presence only. Local services are protocol recording fixtures, not the deployed services. `INHERITED` is existing main-agent evidence read back, not rerun or represented as Bob's execution.

| Capability / boundary | Actual loaded/composed result | Executable evidence / remaining limitation |
|---|---|---|
| Native full profile / lifecycle | EXECUTED: Store creates and binds two actual native session registries | New fixture first case; real native Harness/storage/ToolTask/GenerationTask. Exactly one Store-owned Harness per session; no manually assembled replacement registry |
| CodingTools / DCG | REGISTERED in both bound registries | Existing guard tests remain separate evidence; this new fixture does not execute arbitrary shell or certify every guard rule |
| MCP discovery / allowlist | EXECUTED: two real MCP HTTP connections; only approved tools exposed | Local server advertises an extra `not_approved` tool which is absent from native registry. Exact `mcp__mcp_agent_mail__*` names, one registration per name |
| CodeMode nested authorization | EXECUTED through native CodeMode + unsafe MCP ToolTasks | First nested Mail send revokes the session's actual GrantPolicy; second nested inbox call never reaches HTTP. `models:false` remains source/compiled configuration, not permission for new paid model calls |
| Mail identity / project / token | EXECUTED, local-only protocol fixture | Forged project and actor rejected before HTTP; sender token overwritten by host-held dummy registration. Credential absent from model transcript. No real Mail registration, leases, or coordination channel |
| Mail close isolation | EXECUTED | Archiving A sends its own MCP DELETE and closes A tracing; B's Mail and native generations still work. B is not closed as a side effect |
| Hindsight binding / tools / outbox | EXECUTED against local HTTP with two banks/tokens/cwd bindings | Actual recall, knowledge pages and retained turns reach only the matching bank; no cross-session private input. Native history is not replaced by memory |
| Ambient environment isolation | EXECUTED | Agent Mail and Hindsight environment variables are byte-identical before/after. Memory/client configuration supplied explicitly; no private configuration reads |
| Langfuse generation/tool metadata | EXECUTED via session-local injected SDK recording objects | Both sessions emit actual generation/tool observations with no prompt, output, tool arguments/results or dummy credentials in recordings. No live Langfuse network/service or production SDK credentials |
| Langfuse failure behavior | EXECUTED, new second case | SDK `start()` throws a private sentinel: two native generations still finish; tracing disables after first failure, reports fixed coarse message, closes SDK once |
| Schedules / native Goal / operator | REGISTERED and bound | Native task/document owners preserved. Existing source operator/recovery fixtures are not rerun here; this is not live Goal launch or acceptance of every scheduler path |
| GitHub trigger poll/watch/reopen | INHERITED compiled 4-case main evidence | Read `installed-check.log` and installed test import headers. Main's genuine compiled Store watch/reopen, metadata and revoke-between-polls case passed. This is not proof of revoke *between GETs* |
| GitHub current grant between reads | **RESOLVED / independently EXECUTED**, corrected source + compiled | Original source and compiled RED retained. On corrected `36b4…`, retained third case separately passes 1/1 in each mode: revoke the actual human GrantPolicy inside first account GET callback; poll rejects and reads equal exactly `[user]`. No new GET starts after revoke. No dispatch/write bypass claimed |
| GitHub credentials / subprocess scope | SOURCE REVIEW + inherited execution | Explicit HOME/GH_CONFIG_DIR required, env copied rather than ambient, GH_DEBUG removed, fixed `gh api GET github.com`, shell:false, 5s/1MiB child and 30s/64-request poll bounds, max two active children. Body/comment instructions not delivered. No real GitHub traffic |
| External web / Context7 / Codex / Antigravity | INHERITED compiled configured-inventory execution | Existing four installed tests include actual native tool dispatch to local recording endpoints, image outputs and session-local model/auth/skills. Not repeated. Unconfigured services are explicitly unavailable, not imaginary successful calls |
| Child tracing / all possible MCP servers / arbitrary plugins | NOT TESTED by this new fixture | No universal extension compatibility, live credentials, arbitrary server policy or production topology claim |
| BB Core / terminal / iii UI composition | OUT OF SCOPE for Bob's bounded task | Main/Dave/Carol own those actual installed receipts and final tuple; no old Root-only or source compile result is promoted to full BB acceptance |

### Actual extension inventory observed in the two bound sessions

`coding-tools`, `context7-mcp`, `durable-pi.existing-input-policy`, `durable-pi.guard`, `durable-schedules`, `durable-triggers`, `hindsight`, `hindsight.delivery`, `host-goal-operator`, `host.native-current-owner`, `langfuse-tracing`, `local-host-automation-authority`, `mcp-codemode`, `native-goal-archive-tasks`, `native-goal-control`, `native-goals`, `search-history`, `subagent`, `web-tools`.

This fixture configures actual local MCP/Mail, Hindsight and tracing capabilities. It deliberately does not configure GitHub/Context7 credentials, CodexHost, Antigravity or skills: their optional unavailable inventory entries remain explicit. Tools existing in the registry do not imply their service is configured or every tool was invoked.

## Read-only selected-runtime comparison and provenance

Read the selected release's `host-lane/host/packages/coding-agent/src/experimental/durable/runtime.ts:201–325`: registry/model setup, Langfuse install/bind, configured MCP, extensions reload, Hindsight binding and shutdown sequencing are actual source paths, not evidence that the running process has loaded any arbitrary extension. That older terminal path writes process-global Mail environment; our composed fixture proves the new session-owned path does not. Its `extensions-lane/packages/local-host/src/automation.ts` requires the Hindsight controller; the new automation separates authority/lifecycle from optional memory. The SDK-failure test also binds/runs the native profile without Hindsight configured.

Provenance hashes were independently matched against read-only originals: selected release `durable-triggers/src/index.mjs` = `b08fee3d...`, selected release `local-host/src/github-triggers.mjs` = `c1a545c928381ea7bf548b53d346bda93337109e2f7f04c9e9b29945d66a6251`, and the selected terminal runtime's imported `/home/ubuntu/Projects/pi-durable-extensions/packages/langfuse/src/index.mjs` = `0dd79f9d7ce650d6e03e6ac29c27d5da25a834cae6c50b4e006967139aca33b4`. These match the port's SOURCE.json records. The port retains separate licenses/notices; no donor plugin code was copied. New Langfuse port uses explicit session-local SDK injection and metadata-only capture; upstream payload-export behavior is not inherited implicitly.

## Nonauthor review finding and verified owning repair

Finding `dfc9c7c5adcc4e0888032f53afd00791` is attached to final gate `88058403ce2744da8d5863c193397ca2`, not Alice's repair task, so it does not create a repair/dependency cycle. Baseline `get()` checked cancellation/concurrency but not current root authority; its callers authorized only before a sequence of awaited GETs. The bounded repro revokes the operator while `user` completes, then observes `repos/fixture/project` and the issue list start afterwards. Intended invariant: every newly started credential-bearing external read requires current root authority. This is a limited post-revocation read race, **not** a proven event-admission, write, credential-exfiltration or cross-session bypass; `acceptEvent`/dispatch separately recheck authority.

Alice applied the smallest patch: check the existing grant-only `root(ROOT_CONVERSATION_ID, context)` inside `get()` immediately before a new subprocess, with cancellation/concurrency checked after that await. Bob inspected that boundary and independently executed only its new regression on corrected source and compiled package. Explicit board RESOLUTION963 closes finding `dfc9…` on this corrected candidate only; original RED remains historical evidence. Bob did not modify product transport/profile/Store. Existing typed public projections, HTTP grants and native input authority remain outside this repair.

## Commands / limits / retained evidence

New file: `apps/dpi-backend/tests/native-composed-services.test.mjs`. Its original first two bodies passed once on both installed and source code; third expected-deny case was appended separately, failed on the old transport and then passed independently on corrected source and compiled package. First-two-body SHA256 `d9aace5fc79994c057eb008191306ffb490712b4a4ac604a922a9c60852990e6` was reconstructed and matched byte-exactly after appending; final three-case file SHA256 `48765f1e62bfcf49094129137bbc4d69ab3b1329a93adfd6f047c24ee274f0bf`. No full backend suite was repeated, and no single new three-case/full-suite run is claimed. These are recorded historical commands; final corrected-case commands follow below.

```sh
bash /tmp/bob-native-composition/sandbox.sh installed node --import /home/ubuntu/Projects/pi-durable-host/apps/dpi-backend/node_modules/tsx/dist/loader.mjs --test tests/native-composed-services.test.mjs
bash /tmp/bob-native-composition/sandbox.sh source node --import /home/ubuntu/Projects/pi-durable-host/apps/dpi-backend/node_modules/tsx/dist/loader.mjs --test tests/native-composed-services.test.mjs
# After third case was appended, run ONLY the new boundary case:
bash /tmp/bob-native-composition/sandbox.sh source node --import /home/ubuntu/Projects/pi-durable-host/apps/dpi-backend/node_modules/tsx/dist/loader.mjs --test --test-name-pattern='GitHub transport rechecks' tests/native-composed-services.test.mjs
bash /tmp/bob-native-composition/sandbox.sh installed node /review/github-revoke-probe.mjs
```

Wrapper SHA256 `6ac38343bc312e22348406ad0dd341ab440f337fd12d963a11f1de1ef62faf33`: bwrap unshare-all, clearenv, read-only source/toolchain/installed package, writable scratch-only HOME/tmp/cache; network namespace has loopback only; memory cgroup1536MiB/no swap, heap512MiB, CPU70s, wall95s+3s kill, PID baseline+256, file16MiB/fd1024, scratch128MiB. Parent captures stdout; no target-controlled artifacts promoted and no main-agent scratch writes. Source and installed dependencies were already present; no install/download.

- `installed-green.log` 2/2 PASS, zero skips, 5711.139017ms; SHA256 `5803408e5ea674150dbf9c6fea185ef7c31cd06dd6d8951dbf3a813799f742c1`.
- `source-green.log` 2/2 PASS, zero skips, 6405.729969ms; SHA256 `e8d04b33c7141aafc2ad99cfe952e39bffab50a14312f2d266593551dfc55d6b`.
- `github-revoke-red.log` compiled EXIT1; SHA256 `d1d48a447a1165f01952e2ab9dc09f0d8c1d2036e93f9afb4bd2b07ecd311bc1`.
- `github-revoke-source-red.log` retained source third case EXIT1; SHA256 `b9de1b3bbaf5fe73b6e8f7123de4e6b49632eacee6e170ee836c6f2f1d73c997`.
- Early logs retain fixture setup corrections: ESM import-only package export resolution, compiled dist layout, faux catalogue provider identity, MCP structuredContent output, and Hindsight version endpoints. These are not product failures hidden by a green rerun.

## Corrected candidate / independent closure

Alice CORRECTION958 handed source GitHub SHA256 `5517734a963792cc297c8b3016d5ea46c68b5c61ea2527b1b15731d535586ee9` and immutable archive `/tmp/alice-github-fix.a2_2u7b7/artifacts/dpi-backend-0.1.0.tgz`, SHA256 `36b4f6e989eb6dcc8bd14dd450fd55eeb0a4a39d360936c4b0e9dc32a046c6bd`. Parent-side independent verification matched all292 archive files to `/tmp/alice-github-fix.a2_2u7b7/host/node_modules/dpi-backend` with no extras and compared every member to `de736…`: **only** `dist/dpi-backend/src/native-profile/automation/github-triggers.mjs` differs. Thus the earlier two composed-case owning modules/dependencies are unchanged, not unreviewed replacements.

New private wrapper `sandbox-fixed.sh` SHA256 `14f91249273a053744ba2eff9624703955c9a39f767dbe3576169300b00578a2` has the same OS limits/allowlisted environment as the historical wrapper; it changes only the read-only installed host binding to that new exact fixture. No main-agent scratch mutation or source fallback.

```sh
bash /tmp/bob-native-composition/sandbox-fixed.sh source node --import /home/ubuntu/Projects/pi-durable-host/apps/dpi-backend/node_modules/tsx/dist/loader.mjs --test --test-name-pattern='GitHub transport rechecks' tests/native-composed-services.test.mjs
bash /tmp/bob-native-composition/sandbox-fixed.sh installed node --import /home/ubuntu/Projects/pi-durable-host/apps/dpi-backend/node_modules/tsx/dist/loader.mjs --test --test-name-pattern='GitHub transport rechecks' tests/native-composed-services.test.mjs
```

Both commands EXIT0, 1/1 PASS, zero skips: source3064.843529ms and installed2324.196798ms. Source log `/tmp/bob-native-composition/github-revoke-source-green.log` SHA256 `47ec0183d5bbb8ff39cc322b4dc227d603f09f9725caccf64d997782b6982dd9`; installed log `github-revoke-installed-green.log` SHA256 `4d8512c7ba2e80e1952f5a0e51e64187167c9ae530a185669169df7bea3db6bd`. No finished composed case, previous installed four tests, R1/R2 reproducer or full suite was repeated.

Remaining product blocker is **separate** Carol finding `658a6e58bba6488f893fdc1c4b51638a`: actual BB child followup/stop fails in Core before provider invocation. It is not resolved by this native-profile audit. Final BB/browser recovery, single final regression, frozen tuple and separate outgoing review remain their owners' work; no `FINAL_LOCAL_CANDIDATE_READY=true` or publication claim is made here. Actual live GitHub/Langfuse/Mail/Hindsight, arbitrary plugins, real migrations and production runtime activation remain intentionally unverified.
