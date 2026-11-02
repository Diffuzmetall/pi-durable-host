# Native input policy preparation: component evidence

## Scope

Carol owns Host integration task `d2fedfc8520b4e699789c98ca5022d8e`.
This checkpoint does not complete that task or parent D1.
The native patch output and Alice packaging qualification remain separate outputs.
Production activation NOT RUN.

## Binding contract

The runtime owns `apps/dpi-backend/src/durable/input-binding.ts`.
`RuntimeComposition` extends this contract instead of defining another signature.
The contract is internal to native bindings, not a Host or HTTP port.

The runtime calls `prepareInput(tx, conversationId, nativeRequestId, identity)` inside the native admission commit.
Native `submit(tx, ...)` completes its table reads and writes first.
The binding can then update documents in that same transaction.
The binding must not read tables, start another commit, publish resources, or perform external effects.

The runtime checks authority before preparation and after every awaited preparation.
The patched native commit checks authority again before settlement.
A preparation failure or revoke rolls back policy, receipt, entry, submission, and scheduled task together.
An accepted retry returns its existing native submission without another preparation.
Delegated input requires both this binding and a current policy reference before admission.

Bob can implement the existing profile hook against this signature.
This checkpoint does not adapt the memory controller's separate `admitInput` preparation or accept a full native profile.

## Fresh checks

Strict compilation exited 0 in `/tmp/pi-host-dm1-runtime-20261102-carol-v1`.
The first compile rejected two fixture accesses to the opaque token's nonexistent `kind` field.
The corrected fixture uses an explicit document kind constant.
No runtime test executed outside the physical sandbox.

```sh
./node_modules/.bin/tsc --strict --module NodeNext --moduleResolution NodeNext \
  --target ES2023 --skipLibCheck --types node --typeRoots node_modules/@types \
  --rootDir . --outDir carol-policy-tests \
  apps/dpi-backend/tests/durable-session.test.ts \
  experiments/durable-module-20261102/runtime/native-commit-authorization.test.ts
```

```sh
python3 experiments/hot-update-20261101/sandbox/run.py --repo "$PWD" \
  --candidate /tmp/pi-host-dm1-runtime-20261102-carol-v1 --timeout 120 -- \
  node --test --test-concurrency=1 \
  /candidate/carol-policy-tests/apps/dpi-backend/tests/durable-session.test.js \
  /candidate/carol-policy-tests/experiments/durable-module-20261102/runtime/native-commit-authorization.test.js
```

Sandbox `/tmp/hot-update-sandbox-2ar9mlhg`: 17 PASS, 0 FAIL, command exit 0.
The negative isolation check passed for parent and child.
`test.log`, `isolation.json`, and `command.json` preserve the evidence.

The three new tests check these conditions:

- Missing delegated binding or policy reference refuses admission without a submission or task.
- Preparation follows native table writes and runs once across concurrent retries.
- Failure and revoke remove all provisional policy and admission records, while a later authorized operation succeeds.

The other 14 tests preserve the previous component regressions and direct native authorization checks.
The fixture uses real Harness and SQLite with local faux models.
Its policy hook is a fixture, not Bob's full profile.

## Exact checked identities

| Input or output | SHA256 |
| --- | --- |
| `src/durable/input-binding.ts` | `9e712e1a05208c9e53255becc7afdd265d5253ee9a06334408109c7d2e4a72a3` |
| `src/durable/native-session.ts` | `64fabac8d00d31a25ddf04405e36dcf84cee99b0941fda84b12a16965681078d` |
| `src/runtime-profile.ts` | `be1fd96d32d8f5af372e0bdbddc8a63bf9e70fd66abc8260451b35ee57a42a96` |
| `tests/durable-session.test.ts` | `b0903f6bf41006359fe2039adf1b8b6e131c13794ffad07b9368001a8b625f59` |
| Compiled `src/durable/native-session.js` | `8ea3aadfaaf2fd3f5d398ed71f534c7807bf774d9876b8e6e1ca8da30ecac9e8` |
| Compiled `tests/durable-session.test.js` | `7bb743e2234934ff51488a7aba4135d664fc045883c65634ef227c396f7e4416` |

The `source/` directory preserves the four source files at these hashes as historical snapshots.
Those flat snapshots are evidence, not a separate executable source tree.
The compilation covers the component fixture, not the whole backend or `runtime-profile.ts` integration.
Host routes, Store, and streams still require semantic extraction.
Configure, reload, parent operations, full-profile preparation, and actual HTTP acceptance remain unfinished.
Historical release-return, exact prior target, and operator-auth failures remain open.
