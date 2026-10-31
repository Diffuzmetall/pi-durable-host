# Session-local Hindsight and Agent Mail

## Decision and scope

Use one process for the local explicit factories in this directory. A real two-session check proves separate context, clients, identities, log paths and close operations. This removes the specific globals that caused the original placement failure. It does not make the unmodified installed adapter safe.

The full profile owner must confirm that no other component imports a global dispatcher setter or changes the process environment. Until that check and independent review finish, this is a usable component, not full-profile acceptance. No worker, Harness proxy or second process mode exists here.

## Preserved source

`SOURCE.json` records original and local hashes. The source is the selected release `20261028-4rmMfRfc`, under `extensions-lane/packages/hindsight/src`. The local copy contains the actual controller, extension, delivery tasks, lifecycle, private filesystem boundary and pinned vendor algorithms. It excludes `adapter.mjs`, which assigns process-global log paths.

`LICENSE.native` retains the native MIT notice for Mario Zechner. `hindsight/vendor/LICENSE` retains the Vectorize AI MIT notice. The vendor directory retains its original dependency and source metadata. This is one integration dependency closure, not a copy of the installed Durable runtime.

`mail.ts` preserves the actual `authorizeAgentMail` policy from `host-lane/host/packages/coding-agent/src/experimental/durable/mcp.ts`. It preserves the actor fields and the deny list for administrative operations. It replaces the original identity callback with explicit session state. It does not read MCP config, register an agent or copy a credential from the current machine.

## Narrow local changes

- The three pinned log getters use `AsyncLocalStorage` paths. Log level state also belongs to that scope. An absent scope fails closed instead of a write to a private default path.
- The native controller reconciliation lane enters the same scope. The adapter scopes actual tool, section, hook and delivery-task callbacks. Native document kinds, versions, task identities, payload schemas and acceptance logic remain unchanged.
- The delivery reader recognizes application inputs through actual native `type=input` receipts, not a literal entry-kind alias. A model user role alone is insufficient. Canonical `pi.user` retains its original behavior.
- The pinned client and pure config resolver now have explicit exports. The wrapper requires both binding and client resolvers. It has no automatic config or memory-bank lookup.
- Agent Mail uses a real session-owned MCP client and an explicit transport. The native CodeMode boundary checks the current grant and the original identity policy on every call. Registration tokens enter only the bound server request, not the model result or process environment.

The local code does not import the terminal HTTP configurator. The Hindsight client reads an existing dispatcher but does not replace it. No code in this directory assigns a process environment variable.

## Callable interface

`await createSessionMemory(registry, {directory, resolveBinding, resolveClient, lifecycleEffects?, diagnostic?})` returns `controller`, `paths`, `bind`, `drain` and `close`. The adjacent declaration file defines the TypeScript interface. The module also exports the actual `HindsightClient` and pure `resolveConfig`.

Supply trusted explicit resolvers. Bind the controller to the sole native Harness and its Storage before resume. Before submit, call `controller.admit(conversation, nativeRequestId, context)` with the same stable native key. Drain and close the controller before the owner closes the Harness. Every reload target, including an explicitly supplied actual registry, receives the same session decorator for tools, sections, hooks and delivery tasks. A neutral native caller must not erase the captured scope. Native definitions, payloads and IDs stay unchanged.

`openSessionMail({project, agent, registrationToken?, allowedTools, transport, authorize})` returns a native MCP `source`, its non-secret identity, session `shellEnv` and `close`. Pass `source` to the existing native MCP CodeMode factory. Pass `shellEnv` to that session's execution environment, not to `process.env`. The transport and already-admitted identity belong to trusted server code.

Do not pass identities, grants, module paths or bank resolvers from HTTP request bodies. Optional memory remains separate from authority and automation. An unavailable integration must stay explicit.

## Fresh checks

From `apps/dpi-backend`:

```sh
npm run check
node --import tsx --test tests/native-memory-isolation.test.mjs tests/native-authenticated-memory.test.mjs tests/native-memory-reload.test.mjs
```

PASS: strict check and the actual two-Harness/SQLite/faux scenario. Two controllers execute recall, page tools and durable retain through distinct loopback bank bindings. Model context and log/diagnostic/usage files contain no data from the other session. The check also confirms that the five original environment keys remain unchanged.

Two real MCP clients execute native CodeMode calls with separate actor and registration grants. A cross-project call and a revoked grant reach no Mail effect. Close of session A leaves session B usable. Credential sentinels appear in neither transcript results nor log files.

The authenticated regression first fails on assistant-only retention. The corrected reader retains actual Store input, another admitted application input and their answers. It excludes a passive entry with a user-shaped model message. Retry, conflict, revoke and trusted metadata checks also pass. Native input IDs come from receipts, not the narrower `UserEntry` token.

Logs: `/tmp/alice-auth-memory-backend-check.log`, `/tmp/alice-authenticated-memory-red.log` and `/tmp/alice-authenticated-memory-green.log`. The combined corrected checks are 3/3 PASS. The check uses no live provider, personal bank, real Mail server, production database or global config. Seed, survey and update effects are disabled in the explicit fixture config.

The explicit-registry reload regression was found by independent gate on immutable backend `379cf10a...`: an actual native section wrapper cleared ambient ALS, reload bypassed the decorator, and a fresh native fork lost recall. The owning correction decorates the actual reload target. `native-memory-reload.test.mjs` passes with two real Harness/SQLite/faux sessions, neutral native callers, explicit/default registry reload, fresh forks, real loopback recall and independent bank/log bindings. This is a corrective self-check, not independent milestone acceptance.

## Remaining limits

These checks prove local isolation and accepted retain delivery, not remote memory extraction. They do not rewrite existing persisted payloads or operation IDs. Previously materialized retention intents keep their original content and recovery semantics. It does not cover arbitrary historical registries, memory SIGKILL recovery or every optional integration. The inherited private-filesystem boundary requires Linux. The default minimal package remains independent of this optional integration.

The full installed profile, root delegated HTTP admission, terminal, BB and iii still need their own combined checks. A passing component check does not enable any of those permissions.
