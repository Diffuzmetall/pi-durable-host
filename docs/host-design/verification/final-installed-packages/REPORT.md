# Installed product-package verification — private evidence

**PACKAGE_FILES_AND_BASE_SUITE_VERIFIED=true. PRODUCT_PACKAGE_TUPLE_VERIFIED=true. FINAL_LOCAL_CANDIDATE_READY=false.**

Dave, original output `9407ee4a3a62482d9b98c12336a0e6a6`, refreshed by `fed90b664a1d434e8f95f942e0dcdfc5` after the real reconnect diagnostic correction. This accepts bounded five-product package/source evidence after the focused compiled-BB cached-open race was corrected and independently replayed. The separate BB Core compatibility/browser milestone, outgoing publication, activation, historical migration and all-53 external review are not accepted. Alice explicitly authorized this component closure in board corrections 973/987; independent Core gate 880 remains mandatory.

## Exact product tuple

| Package | SHA256 | Regular archive members |
|---|---|---:|
| backend | `36b4f6e989eb6dcc8bd14dd450fd55eeb0a4a39d360936c4b0e9dc32a046c6bd` | 292 |
| SDK | `351054859022ae202fbdc429e73da441bc90295e4717342652079c3ea0906abd` | 25 |
| terminal | `1f1b74fa2b515b55bf280113d91116c267755973b5ed76ce9a6389174c235bde` | 109 |
| BB | `b82eb8d3ca9dbac0e0d85b8d07919d26c74171943be17a2a1f79732a554349df` | 55 |
| iii | `75da7623ae10c1a79fe2415d36ddcd22be4a779a4d1160cd94371301dc5eff33` | 17 |

`CANDIDATE.json` SHA256 `c9a4e3fb349eef78af1be2c751fe3b0d061ff4d30bee8f20c288e996f1c9975f` pins all 424 current package-source files, all eight unchanged lockfiles, archive/member maps and actual installed roots. All five installed packages matched every archive member, with no extra files. This is byte identity of the listed package files, not a claim that every transitive dependency or production runtime was newly installed.

Runtime/artifact roots: backend `/tmp/alice-github-fix.a2_2u7b7`, BB `/tmp/alice-bb-native-lifecycle.85alqr7f`; SDK/terminal/iii retain their exact earlier archive bytes. No old installed release, Core installation or main `/tmp/pi-host-final-acceptance` scratch was mutated by Dave.

## One final source suite, in disjoint frozen slices

Alice's 973 freeze was superseded only for BB by 978. Dave froze the other four package trees/eight locks under lease f9be, then released it. BB7647's first handoff 987 was checked under lease 8170, then the focused race was found and the lease released in 997. Corrected handoff 1006 was checked under new BB-only lease 53b3. Neither the older 79f6 nor the rejected 7647 result is called a result for final f924. The historical old-BB source snapshot is explicitly retained separately from current CANDIDATE.json and source-bb-fixed-before.json.

| Package | Tests | Strict check exit |
|---|---:|---:|
| SDK | 23/23 | 0 |
| backend | 133/133 | 0 |
| terminal | 19/19 | 0 |
| iii | 12/12 | 0 |
| BB | 27/27 | 0 |

**214/214 PASS, zero failed/cancelled/skipped; five strict checks PASS.** The final candidate uses the retained four-package 187-case slice and refreshed BBb82's 27-case slice. Earlier BB7647's 26-case slice was superseded by BBf924's cache correction; after a real reconnect diagnostic bug changed provider-bridge, only BB suite/check/install/member checks were repeated for b82. The other four already-finished slices (187 cases/four checks) were not repeated. These are package `test` scripts, not every optional script or a fabricated single-process 214-case run.

The recorded drivers execute `node /npm/bin/npm-cli.js --prefix <source package> run check` and then `run test`. Exact argv, duration, exits and counters are in the two results JSONs; raw logs are retained. The check/test processes, inner wrapper and outer wrapper all exited zero.

385 frozen four-package files and all eight locks matched before/after that slice. The final BB snapshot joins those identical 385 files with 39 BB files: all 424 and eight locks again matched before/after BB. Backend's native-BB-outcome test imports unchanged BB history-projector plus type-only history-types; both hashes additionally match the original immutable source pin, and neither was one of Alice's changing BB files.

Four-slice proof SHA256: `055b78c84b67d4ff8c756c6bd4a32a4c8f1397e628823c27b80153523c3ef80e`. Four-slice source manifest SHA256: `d343779c1a0880479ad955b4d9068ff766fe12f573b16af02686aaea235994f3`.

## Focused compiled-BB counterexample after the base suite

Carol's 989 scheduling hypothesis was independently reproduced on the actual 7647 compiled `BbThreadSession.openChild` and `BbChildSession.retryHistory` methods. Binding/CAS I/O is explicitly stubbed to isolate the real cache and busy/pending-state methods: this is a unit counterexample, not Core UI or authentication-bypass evidence.

Both opens capture the same old resolved cache promise. The first starts a deferred original-CAS retry; the second sees busy and returns the child before that retry is acknowledged. Actual before-ACK JSON is `{"done":[false,true],"writes":1,"stillPending":true}`; expected both false. The one-case test exits 1 internally and externally. A premature caller can start observation and encounter `BB_CONCURRENT_CAPTURE_REFUSED`; duplicate model/effect/CAS execution was not demonstrated.

Probe SHA256 `8d5f8dc7b4a538a411d2b950ad6c23fa5e643d228f0cd069ab7c4dfec6a9d2bf`; final RED log SHA256 `3fc0fa8c79a0435316a4cbde90917ad87ca5a8a89797c024d00198351843e7fb`. The first diagnostic held a mutable assertion array subsequently changed by cleanup; the assertion was changed only to snapshot the array, with both RED logs preserved. No product source was patched by Dave. Alice's owning fix re-reads the current cached recovery after awaiting the prior promise. The EXACT unchanged probe was then replayed on corrected compiled BBf924: before-ACK `{"done":[false,false],"writes":1,"stillPending":true}`, 1/1 PASS and both inner/outer exits zero. Green log SHA256 `caeb087494be5907bca9e2d3f2e656849f5de5bcdaf6c74299b6ade165da3bbe`; explicit resolution `0b23896854d64d5b909eba14e9544ddc`. BB-only suite/check and clean-HOME install/CLI/member checks passed again for the changed bytes.

Confirmed P2 `f4f8364e812549c7ae408474cda72b84` attached only gate 880 and is now explicitly resolved for corrected BBf924, not retroactively for BB7647. The old base 213 successes and focused RED remain historical evidence; final 214 successes plus the unchanged focused GREEN cover the owning fix. No unaffected four-package rerun was performed.

## Installed terminal and genuine iii evidence

Main's actual terminal PTY run is retained, not rerun: original outer and inner exits both zero; JSON PASS reports eight flow groups covering original TUI/editor/tool display/navigation/interrupt/rename/detach/reconnect/new-session. Its host helper points to the actual compiled backend main, not a moving source Store. It ran against backend de736 and the exact unchanged terminal 1f1 archive, faux only, zero external model calls and no client Harness owner. This is correlated Main evidence, not a Dave-independent PTY run.

The earlier genuine iii TAP had no durable outer exit. Dave ran that missing bounded case once in own scratch: actual `iii --version` 0.24.6, installed signed worker and native faux host, four retries/one native execution, changed-payload and signature rejection, worker/owner restart, immutable Unicode answer paging, current revoke. **1/1 PASS, inner exit 0, outer exit 0.** The retained test and helper bodies are byte-identical; only three import headers adapt to the installed SDK/client and own helper. No moving source backend/client runtime is used.

That genuine run used backend de736, SDK351 and iii75da. It is NOT described as a new genuine-engine execution against 36b4. The complete de736→36b4 archive comparison proves that only `native-profile/automation/github-triggers.mjs` changed; Store/native admission/iii execution and all other members are exact. Terminal used playground; iii fixture did not configure `options.github`, and compiled profile handles the transport as explicitly unconfigured. Thus those unchanged execution-path proofs are retained with the explicit optional-GitHub delta. Bob separately tested the changed source and installed GitHub revoke boundary, 1/1 each, and resolved his P2 in 963. Dave did not self-approve that fix.

The original bounded terminal/iii receipt SHA256 is `b96a25fd32f07a39788db9540b2f6e0438814f29352c4db4c146373df5bffbb2`. Its original sandbox is preserved under `evidence/terminal-iii/sandbox.sh`: the current source-suite runner has a different host binding/resource envelope and must not be substituted for that recorded hash.

## Clean-HOME standalone package fixtures

Actual offline npm installs ran in three separate initially empty HOME/client roots, with explicit preseeded npm cache in an ephemeral copy-on-write view; the original host cache was never writable and external networking was disabled. `--ignore-scripts`, no audit/fund and explicit empty user/global npm configs were used. This is not a promise of uncached offline bootstrap.

- Terminal: npm and actual installed CLI `--help` exits zero; SDK25+terminal109 package files match their archives.
- iii: npm and actual installed CLI `--help` exits zero; SDK25+iii17 exact, no backend/native runtime/terminal/BB client packages.
- Final BBb82: npm and actual stdio CLI JSON-RPC `initialize` exits zero, protocol 2; only SDK+BB top-level packages, SDK25+BB55 exact. The initialize fixture has no live host and is NOT a Core browser/lifecycle test.

An initial read-only-cache attempt failed because npm needs a temporary cache write. This was test setup, retained separately; native bubblewrap ephemeral overlay fixed it without altering the global seed. The successful cache condition is explicit, not hidden. No dependencies were downloaded or working runtime activated.

## Reconnect correction: component940/f924 → componentfed90/b82

The expanded real producer found that a native child connection loss appended an unowned Core diagnostic transcript item, poisoning the native-history mixed-row guard. Alice fixed only `provider-bridge.ts` and its retained regression: child transport diagnostics are coarse stderr only, never child transcript writes; Root live badge behavior remains. CAS guards were not weakened and unknown rows were not whitelisted.

The b82 archive still has exactly 55 members; only `dist/provider-bridge.js` and its source map differ from f924. The cache-join production method hash is unchanged, so its already-GREEN focused probe was not repeated. Four-package source/locks also remain exact. The affected BB-only suite is 27/27 PASS, strict check exits zero; fresh empty-HOME offline install and stdio initialize exit zero with exact SDK25+BB55 members. All inner/outer exit receipts are retained.

Source hashes: provider-bridge `67bb867f930ca3496eb265b1960798fffd9a605af88cf597cadf801ea5bb3eb2`, retained test `9a7a8d964bfbcca3748f6ce0171cbd6b17e0d97d557e3ab91d8140f5612ec673`. The full 424-source/eight-lock manifest supersedes f924, while `evidence/candidate-f924-package-verified.json` and old logs preserve that historical component. No new Core boot, terminal/iii scenario or four-package suite was run by Dave.

Alice's expanded real Core/Chrome producer on b82 passed Root/child answers, first stop, UI reload, child release/reattach, Root stop, actual native Store owner reopen and one-child roster. That is correlated producer evidence, not this component's independent Core acceptance. Carol's 880 gate remains separate.

## Safety and limitations

All target execution used clearenv, read-only source/toolchain/input mounts, bubblewrap network/process namespaces, temporary HOME/data, faux providers/local endpoints and bounded cgroup/CPU/PID/file/wall limits. The source suite used three-GiB/no-swap, two CPUs, one-GiB scratch, CPU480s/wall600s; the earlier genuine iii run used CPU120s/wall180s. No extra actors/models, paid calls, production data, global settings, public edits, commits or pushes were performed by Dave.

Dave authored earlier server/SDK and these verification adapters: this is honest producer/package evidence, not an independent approval of his own server implementation. Bob's native composition/GitHub review, Main's terminal evidence and Carol's separate final Core/outgoing gates retain their author exclusions.

**Remaining blocker:** real BB Core child lifecycle and subsequent terminal-history CAS acceptance (`658a6e58bba6488f893fdc1c4b51638a`). Alice's authorized disposable Core compatibility correction is outside this package tuple; expanded producer proof has passed, but independent gate 880 is not inferred from it. No root-only or first-stop-only success is promoted to full child followup/stop/reconnect/recovery PASS. Earlier Core debug attempts are not the selected frozen c8c2/b6 Core artifact. Final outgoing review and Alice-only public-origin-main delivery remain later gates.

Real historical migration/restore ISC39/40, production activation, arbitrary-plugin compatibility and the independent coordinator's broader all-53 conclusion are not claimed. BB compact remains explicitly unsupported. Keep this private report and logs out of the public publication copy.
