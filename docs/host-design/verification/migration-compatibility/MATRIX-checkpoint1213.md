# Migration acceptance — backend + SDK + terminal + local iii, without BB

**Current verdict: real-session migration NO-GO pending the actual candidate import and controlled-continuation outcome. Original-runtime rollback PASS in the restricted offline scope below.** The single already selected real-copy pilot is authorized by «да переносим тестируй»; no further selection or snapshot is authorized or needed.

Current independent task: `979a24c8095a4177ab0cbeacfe41cbb3` (Dave). This supersedes the active scope of the older BB-gated tasks, not their history. See the current route in `docs/host-design/PLAN.md`. Prior versions of this matrix/inventory are retained as `MATRIX-before-no-bb.md` and `INVENTORY-before-no-bb.json`.

## Five distinct pilot results

| Criterion | Evidence and actual scope | Remaining work |
| --- | --- | --- |
| 1. Coherent snapshot; original unchanged | **PASS.** Bob snapshot task `1034dbb6abb142cca1a234637646b67f` DONE; Dave independent publication 1164. Complete 13-file source/raw tree, 8,648,858 bytes; immutable coherent SQLite quick_check OK. Source and protected master remained unchanged after the original-runtime restore. | Reuse this exact protected pilot; do not select/copy another source. Nine unreadable process FD directories remain an explicit limit of the earlier owner scan, not an exhaustive-process-proof claim. |
| 2. Saved task/doc/model/profile compatibility | **PARTIAL; actual candidate acceptance pending.** Selected runtime is 1.4.0, creator version unattested, source formal host profile ID absent/null. All 639 saved tasks terminal; zero pending submissions. Saved model is known to the built-in catalog but unavailable with empty credentials. The source's legacy goal document is explicitly empty, not evidence of an active unsupported goal. | Alice `8b93ccc3e23f4e80875dc2daa3ffdb30` implements verified-copy-only preflight/adoption. Bob supplies actual source fingerprints and pure saved-document/effect validators. Unknown/incompatible state must refuse before auto-resume; no invented profile/model mapping or weakening of availability guards. |
| 3. IDs/history/tasks/docs/state preserved | **PASS for protected snapshot and actual original-runtime restore; candidate import pending.** One conversation, 613 entries, 639 tasks, 6 submissions, 114 document rows and all 42 revision rows preserved exactly. This sample has no children; generated fixtures cover child/pending-decision cases separately. | Compare the actual imported candidate against the same immutable master. A new empty session or matching counts alone is not preservation. |
| 4. Controlled candidate continuation | **NOT YET ACCEPTED.** No actual candidate import was available at this checkpoint. Known saved-model availability refuses under empty credentials; no live-provider calls, credential copying or faux-provider substitution is allowed. | Execute the verified adoption tool once available, then report actual continuation or the exact fail-closed operational barrier. Static inspection, generated canaries and original-runtime restore are not real-candidate continuation GO. |
| 5. Original-runtime rollback | **ACTUAL RUNTIME PASS, offline/restricted.** Dave publication 1212: a separate restore from untouched `master/raw-session`, actual original 1.4 CLI + resolver + `local-host` profile code, successful shared-host attach to the same session/root conversation, `/quit`, exit 0. All original native record tables and 42 revision rows exact; source/master unchanged, restore lock released. | No remaining work for this narrow rollback check. It does not establish production grants, model-generating continuation or candidate compatibility. |

## Actual rollback command and limits

Private evidence root: `/var/tmp/dave-no-bb-restore.0kq1rR`. `restore.py` drove the actual original CLI in a PTY using the exact argv stored in `COMMAND.json`, then immutable-SQLite comparisons verified the restored records. **Do not rerun this completed check against the now-opened restore copy.**

- `RESULT.json` SHA-256: `29cdfc840c5de4c154b9a63284c8614bed55623be2b27a53673ca46333780b90`.
- `COMMAND.json` SHA-256: `962b8e40989f62f2587ce278623fd1b1847c8d8cddaea2a8b7fd68a5b9e090e9`.
- Original source digest: `193c05bb929036ca4328d08a586a0e96789d07f6c625b761e22e772258b68736`; immutable master digest: `ce24f78e9b6d5218095795d555be3dfe468774fbe49c03deebfb6b153e383c2f`.
- `systemd-run --user --scope`: MemoryMax 1 GiB, swap 0, TasksMax 128, CPUQuota 100%; timeout 45 s, CPU limit 30 s, Node heap 384 MiB.
- Bubblewrap unshares namespaces, excludes original data/home/auth paths and external network, clears environment and supplies fresh HOME/config. Public runtime/dependency code is read-only. Only the disposable restored data is writable.
- Original profile **code** is executed with explicit deny-only local authorization (`codexDefault:false`), disabled Hindsight hooks and fresh blank MCP configuration. Original operator grants/credentials are neither copied nor claimed preserved.
- Tripwire network attempts **0**, denied child attempts **0**, allowed git subprocesses **0**; original source/auth visibility false. No BB/Core, candidate backend, live model/API or private bank was started.
- Two retained setup-only REDs preceded session execution: unresolved dependency symlink and bind-destination setup. Explicit read-only package-root mounts corrected those harness defects; no source changes or replacement snapshot were used.

The raw PTY log contains private history and remains private; it must not enter board, public delivery or memory/search exports.

## Main-route package and client evidence

The copied-catalog confinement defect is **FIXED and independently accepted**, not a remaining migration blocker: task `fea830b22a384d669e8e91677e15302d`, 18/18, backend artifact `/var/tmp/alice-store-confinement.a7YYRd/artifacts/dpi-backend-0.1.0-9541d848.tgz`. Alice's new importer changes this owning boundary; its final archive/source/install correlation is still pending.

Carol publications 1203–1206 verify the actual **BB-absent** terminal + genuine local iii route on backend 9541 and unchanged SDK/terminal/iii archives: real PTY input, Escape cancellation, detach/reconnect, actual owner close/reopen with the same live TUI, committed-ACK socket loss and retry idempotency, signed input/refusal, real iii engine/worker/caller restart, Unicode paged answer/checksum preservation and revoked-grant refusal. These use an explicitly synthetic local provider, not the real pilot's model. Private report: `/var/tmp/carol-terminal-iii.oY7AYE/RESULT.md`, SHA-256 `da1150633b0b46beb64a8af0972b657d33982349b7f0f7baaf8cd4e14c38e10d`.

Dave's final four-package install/provenance verdict and Carol's changed-candidate check wait for the immutable importer artifact. Reuse unchanged 214-test/package evidence only where bytes and scope match; do not rerun green suites or restart BB for reassurance. Public commit `0c49efba7ef53ae20a22395ebdd1a4d9ea04fd44` predates this migration work and does not establish its GO.

## Deferred work and authorization

**BB/Core/Chrome are DEFERRED and excluded from this verdict and its dependencies.** Existing source-built artifacts and unresolved BB UI failure remain preserved/open; reprioritization does not fix them. No new BB builds, installs, probes or Chrome checks are part of this route.

Do not run the older `scripts/migrate-playground.ts` against this pilot: it assumes a host catalog and checkpoints its source. Adoption must consume only a normalized working copy derived from the already protected coherent backup, preserve source profile absence in provenance, validate exact saved contracts before resume, and write only a new confined destination.

No original owner/service stops, source DB/checkpoint/schema writes, all-history migration, credential/private-bank access, live models/APIs, unsafe pending effects, silent model remaps, installed-runtime activation or deployment. Public delivery requires a separate independent outgoing review; Alice alone owns the authorized Diffuzmetall `main` commit/push. This checkpoint is not that review or a publication approval.
