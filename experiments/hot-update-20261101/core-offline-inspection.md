# Offline native-copy inspection — Carol

Task: `3d7923a98cf3456a9c9ccd4d7a76da47`.

## Delivered callable

```ts
import { inspectNativeCopy, type VerifiedNativeCopy, type NativeImportTarget } from './apps/dpi-backend/src/native-import.js';
declare const source: VerifiedNativeCopy;
declare const target: NativeImportTarget;
const result = await inspectNativeCopy(source, target);
// { directory, files, counts, models, runtimeContinuationChecked: false }
```

The source file is TypeScript; callers use the compiled module or the existing TS loader. `adoptNativeCopy` now calls this same validator before its existing destination writes. No second validation implementation or new state/journal was introduced.

`VerifiedNativeCopy` supplies a coherent, private, immutable copy directory/database, complete file digests, native session metadata, SDK version and explicit bootstrap/registry provenance. It must never name the live/original database. A nonempty WAL is refused rather than ignored. The validator opens SQLite with readOnly plus mode=ro&immutable=1, checks the inventory and hashes, and closes its connection.

`NativeImportTarget` remains the existing trusted interface: explicit profile identity/factory (the factory is never invoked), accepted source provenance, complete target RegistrySnapshot, actual target document token definitions with pure semantic/effect validators, and cache-only models.getModel. The caller must obtain these from the exact intended complete release. This API does not discover, instantiate, authenticate or certify a profile. Callback purity is a trusted caller obligation, not an enforced sandbox.

Conservative refusals remain unchanged: unknown task or version; nonterminal task; submission other than done/unanswered; unknown document kind, incompatible version/scope/family/history/fork; invalid or unsafe reconstructed values; unsupported model/extension selections; missing unchanged model for any conversation; invalid retired task-document tombstones; incomplete inventory, changed digests, symlinks and nonempty WAL.

## Verification

- Isolation: `/tmp/hot-update-sandbox-wvzzlc44/work/sandbox-check.json` PASS. Production path writes denied; secret-free environment; host proc not visible; loopback only; private HOME/data writable. Negative production-path probes ran before tests.
- Runtime: `/tmp/hot-update-sandbox-wvzzlc44/run.log`: 19 tests PASS, zero failures. Existing native adoption/actual Store/Harness passive-continuation tests remain green. New inspection tests verify a throwing target factory is never called, no destination is created, inventory/content hashes are unchanged, and pending tasks/submissions are refused. Existing unknown/unsafe/provenance/inventory/WAL/symlink negative cases now exercise the standalone inspector too.
- These are actual native SQLite/Harness fixtures using the faux model, not real-provider or installed full-profile acceptance.
- Backend typecheck: `apps/dpi-backend/node_modules/.bin/tsc -p /tmp/carol-hot-update-backend-tsconfig.json` PASS. This temporary config maps the current reload dist/source dependencies as documented by earlier core tasks.
- `git diff --check -- apps/dpi-backend/src/native-import.ts apps/dpi-backend/tests/native-import.test.ts` PASS.
- No package build/install, service command, live Host/DeLM action or credentials read/write was performed.

Runtime command:

```sh
python3 experiments/hot-update-20261101/sandbox/run.py --repo "$PWD" -- sh -c 'cd /repo/apps/dpi-backend && node --import tsx --import '\''data:text/javascript,import{registerHooks}from"node:module";registerHooks({resolve(s,c,n){if(s==="@local/pi-durable-reload")return n("file:///repo/packages/durable-reload/src/index.ts",c);if(s.startsWith("@earendil-works/")&&c.parentURL?.includes("/packages/durable-reload/"))return n(s,{...c,parentURL:"file:///repo/apps/dpi-backend/src/store.ts"});return n(s,c)}})'\'' --test tests/native-import.test.ts'
```

## Hashes of tested source

- `apps/dpi-backend/src/native-import.ts`: `f140783fbe739eb064f1ad905d90eb7667a3c8173b536286f370b34fee0f5b0b`.
- `apps/dpi-backend/tests/native-import.test.ts`: `8ec33c4569d5fef0a860bcde286f393ad439661e1406d2cfaaeb90bf22e2d4bd`.
- Input `packaging/release-inputs.json`: `0dada8c996cee27a36303154e1362bd9ddd7fa4d55d8f91d7dbacd7552fb244a`.

## Material limits — not release acceptance

Alice's DONE278 inventory identifies the prior sealed alice-v2 closure but explicitly has cleanNativeImportTarget=null and new final R4 closure NOT BUILT. This extraction does not supply the missing prior full-profile target, does not modify that sealed closure, and cannot substitute today's registry. Compatibility therefore remains UNKNOWN and switch remains denied. Existing FAIL `477df4a5cc274f7dbc95f34c80e17468` is NOT resolved.

Frank can reuse this callable in isolated fixtures and unknown-target denial paths. A successful inspection of a stale copy does not authorize switching after later writes: the release owner must exclude the current owner and revalidate a coherent current snapshot before starting any replacement. Never restore an old database. No migrations or pending recovery policies are inferred; pending tasks remain a refusal.

Source output only. Exact prior target, second complete release, lifecycle/fault rehearsal, Grace review and Heidi independent installed QA remain open. Production activation NOT RUN. Operator-only auth incident remains open.
