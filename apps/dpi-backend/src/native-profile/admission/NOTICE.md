# Native input policy

This slice uses the actual iii worker input policy. It does not replace native admission or the Durable scheduler.

## Sources

- `input-policy.ts`: `donor-iii://src/input-policy.ts`, SHA-256 `8b985d0a89d1ee65801be05786c7b1cc4c3fa4a23a14dfaea858cd87c3a96e92`.
- `read-path.ts`: localized SDK 1.4 `dist/tools/path-utils.js`, SHA-256 `cd3b6bb204f658ec0b2f167ef954c42a880d8edfa903e90ecf180af987a4edd8`. `LICENSE.sdk` retains the MIT notice for Mario Zechner.

The iii worker is a private local package without a separate license in its package or ancestor project directories. This is an authorized local port, not a claim of permission to publish that source. No original source or installed package changed.

The helper retains SDK path normalization and alternate filenames. The local import replaces the original absolute private SDK import. All executable imports use public packages or local files.

## Native contract

`ExistingInputs` retains `durable-pi.existing-inputs`, version 1, conversation scope, latest history, initial fork state and the original checkpoint policy.

`existingInputGuard(owner)` uses the active native run input IDs and canonical native receipts. It restricts only the tools for those delegated inputs. It does not rewrite the human conversation configuration. A later human input retains the original tools.

The local port adds a mandatory trusted `owner.authorize(policy, conversationId, context)` callback. The callback checks the current grant and policy revision before each active delegated tool call. A false result, absent owner or absent callback denies the call. Native nested tool calls pass through the same hook.

`bindExistingInput(tx, conversationId, nativeRequestId, policy)` stores the trusted tool/workspace policy in the native transaction. A changed policy for the same request ID conflicts. The caller must check current admission rights inside that transaction. The caller must not copy policy, identity or tool grants from an HTTP request body.

The parent-control owner port adds an optional trusted native `parent` conversation ID to a saved policy (same document kind/version). For a delegated child admitted by native parent-control, the guard verifies the current child's native owner task and `ChildBindingDoc` against that parent, then rechecks the saved parent-scoped write/control grant. A request ID cannot change its parent. This preserves a parent's scoped grant without promoting its child to human/root. Local `input-policy.ts` SHA-256: `51e0cd326d04aa87779a56a3457f330388ded7ff81931797efabc463b24cc367`.

Install the returned guard in the actual registry and default extension selection before resume. Pass the sole owning Harness to `owner`. Host integration must bind the policy before it submits the same native request ID. Read scope uses real paths and rejects parent escape or an outside symlink.

## Fresh evidence

From `apps/dpi-backend`:

```sh
npm run check
node --import tsx --test tests/native-input-policy.test.ts
```

PASS: strict check and 3/3 actual Harness/SQLite/faux tests. Allowed read executes. Denied bash creates no file. Parent escape, outside symlink, revoked policy and absent owner fail before tool effects.

A later human input retains its tools. SQLite reopen preserves the document and native submission ID without another model call. A changed saved policy conflicts.

Machine-local verification artifacts are not distributed. See the public status and reproducible package tests.

This output is not HTTP delegated admission, a configured full profile, process isolation or iii acceptance. Those consumers must bind this guard and their authenticated policy. A successful local test does not grant those capabilities to the current server.
