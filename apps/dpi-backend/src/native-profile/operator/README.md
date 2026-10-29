# Native Goal operator admission

This is a new thin native Task/Doc adapter around the **actual** localized `automation.goals.command` service. It does not parse Goal subcommands, implement Goal state, create a second runtime, or manufacture human acceptance. It addresses ISC-16.1/16.2/42 for the future operator HTTP boundary; full profile/terminal acceptance remains separate.

## Integration

```ts
const operator = createGoalOperator({
  authorize: async ({ conversationId, policyRef }, context) => {
    // Resolve a NONSECRET stable server-owned grant identifier.
    // Verify CURRENT human-accept permission, the exact session/root and grant kind.
    // Never trust a client human flag, arbitrary tuple or model/subagent claim.
    return trustedCurrentHumanPermission(conversationId, policyRef, context);
  },
});
registry.install(operator.extension); // before Harness.open
// Use the existing sole owner, after automation.bind and root creation, BEFORE resume:
operator.bind(existingHarness, automation.goals, existingRoot.id);
const admitted = await operator.command({
  conversationId: existingRoot.id, requestId: stableRequestId,
  line: '/goal status', policyRef: serverOwnedGrantId,
}, context);
// Native task execution belongs to Harness, not the HTTP connection:
await existingHarness.waitForTask(admitted.taskId, context);
const receipt = await operator.receipt({
  conversationId: existingRoot.id, requestId: stableRequestId, policyRef: serverOwnedGrantId,
}, context);
```

The example permission resolver is an integration obligation, not an implemented permissive default. A trusted current-authorization callback is mandatory. `policyRef` is persisted in native input: never put a bearer token or credentials there. A fresh factory and live resolver must be installed on every owner reopen; preserve definition names/versions. Stop accepting through `operator.shutdown()` before the owning Harness closes. Bind only once to the already configured root, never create another Harness/storage owner.

The API returns an authoritative receipt with `requestId`, `conversationId`, canonical native `taskId`, `status` and optional `text`/`error`. `command` admits one task and returns without waiting for its effect. The owning HTTP adapter may await that native task and read its receipt; disconnect must not abort the task. Receipt reads recheck current root/human authority. The native successful task result also contains the receipt; failed/uncertain operations have a failed native outcome, never a synthetic success.

`protectsExecution(conversationId, context)` delegates the actual source Goal method. It does not guess from a status string; the operator route must separately authorize its caller. Native operator tasks are conversation-owned background tasks, so generic model-run abort does not become a second command-cancellation path.

## Persistence and ambiguity

- `host.goal-operator` Task v1 is the sole native command invocation.
- `host.goal-operator.receipt` session Doc family v1 atomically records the canonical request fingerprint and task ID with creation. There is no process-local dedupe map, command queue, TTL or external receipt database.
- Same request/body/policy identity returns the same task and result; conflicting data fails. Caller data is copied before any await. Admission and queued execution both check current authority.
- The native receipt records `started` before calling the actual Goal service. If that invocation is interrupted, restart marks the existing request `uncertain`, terminates the same native task as failed, and **never replays the effect**. A generic service rejection after invocation is also conservatively uncertain: partial Goal effects may already have committed.
- Revocation before invocation returns `failed` with no Goal effect. Restoring permission does not restart that same rejected request.

After `uncertain`, the operator must inspect actual Goal state/history and decide what to do. The client must not silently issue a new request ID, retry the raw service, or clear the marker. This adapter cannot make the multiple commits inside an unsafe Goal command atomic; it provides at-most-one invocation and honest ambiguity, not exactly-once external effects. Current source unsupported commands remain unsupported.

## Checks and provenance

Source: `goal-operator.ts` SHA-256 `10e4ba538cfc4cc756786bdcd72fb3f894313f267de913d98a2a66d790d34d22`.

Actual owning services used without modifications:

- `../automation/automation.ts`: `c1c1d7c57028111c5348b97f6eca5b07e57cdb0e2c3708b0b38e97a2007a1c87`.
- `../automation/session-goals.ts`: `ad90309ad5c57857b12f57abbdc9ef0814a3983a5ff739e6d275c138c407651e`.
- `../automation/native-goals.ts`: `dd059ed5e3a974e95e37cce86f252f276a50841bfffaacd9e32a58845c0bf96c`.

Their selected installed-source provenance and MIT notices remain in `../automation/SOURCE.json` and `../automation/LICENSE`. This adapter uses the published Durable 1.4 native `defineTask`/`defineDocFamily`/commit APIs, not a copied Goal engine. The fork's MIT license applies to the new adapter; no dependency, global setting, installed runtime or source outside this fork was changed.

From `apps/dpi-backend`:

```sh
node_modules/.bin/tsc --noEmit --strict --skipLibCheck --target es2023 --module nodenext --moduleResolution nodenext src/native-profile/operator/goal-operator.ts
node --import tsx --test tests/native-goal-operator.test.mjs
```

Machine-local verification artifacts are not distributed. See the public status and reproducible package tests.

Remaining: bind in the composed profile, authenticated public routes/SDK/TUI handling, packed closure and independent milestone gates. This component does not resolve the separate authenticated-input/Hindsight retention FAIL or accept the complete native profile.
