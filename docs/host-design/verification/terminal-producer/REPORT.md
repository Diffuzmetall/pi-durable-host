# Terminal producer — immutable successor correlation

## Scope and status

The existing selected TUI/controller implementation by Carol is retained unchanged. This finishes the producer's remaining artifact-correlation gap; it is **not independent P3 milestone acceptance**. The separate terminal gate must follow the independent native/memory prerequisites and exclude producer authorship.

Dave consumed the explicit no-writer handoff at board 463 and claimed the producer at generation 3. Current ISA F2 and Test Strategy rows ISC-18.1/18.2/18.3, ISC-19.1/19.2, ISC-20/21/22, ISC-26 and terminal ISC-38 were rechecked. All-53 canonical accounting and the ordered terminal → BB → iii acceptance remain separate.

## Exact unchanged artifacts

- Backend `/tmp/dpi-packed-y88Lnt/artifacts/dpi-backend-0.1.0.tgz`: `4d3cf2d8fcae7cebaa35c3bd6b177a343a38d2641ee5d216db7106702708d38e`.
- SDK in the same directory: `d98831740905de74cffc64243d1b2c54cd83e8e76a34c927fa2b5f139e1cdd43`.
- Terminal `/tmp/dpi-terminal-packed-7bo6KL/artifacts/dpi-terminal-adapter-0.1.0.tgz`: `1f1b74fa2b515b55bf280113d91116c267755973b5ed76ce9a6389174c235bde`.

Hashes were checked independently. All installed terminal package file bytes match this tarball. Its 45 archived runtime JavaScript files have no absolute private runtime import or backend/BB/iii/SQLite import. The package declares public `dpi-sdk@0.1.0` as its peer, not a native runtime. Carol's earlier clean-HOME client-only package check and 19/19 source tests remain recorded at `/tmp/carol-p3-packed-final2.log` and `/tmp/carol-p3-final4-tests.log`; no product source, dist or manifest changed for this follow-up.

## Reused harness, not a replacement TUI

Existing repo-native `probe.py`, `latency-probe.py`, `native-attention.test.mts` and their fixtures were copied to `/tmp/dpi-terminal-successor.AmcOj0`. Only import/cwd/loader bindings point to the installed immutable backend/SDK/terminal. Native backend process startup uses its compiled installed `main.js`, not a current source runtime. The CLI entry is installed JavaScript and uses no TypeScript loader; the server-side test fixture alone uses the installed loader for its TypeScript orchestration.

No assertions, prompts, markers or expected results were changed. The first relocated native PTY attempt failed before the CLI started because its original repository-relative cwd resolved to `/dpi-backend`; rebinding that fixture cwd to the installed package directory fixed the harness path, not the product. All fixture servers, terminal children and native owners close on exit.

## Fresh results

### Actual installed native profile and TUI

```sh
TERMINAL_NATIVE_ENTRY=/tmp/dpi-terminal-packed-7bo6KL/install/node_modules/dpi-terminal-adapter/dist/main.js node --import /tmp/dpi-packed-y88Lnt/install/node_modules/tsx/dist/loader.mjs --test /tmp/dpi-terminal-successor.AmcOj0/native-attention.test.mts
```

**1/1 PASS**, `/tmp/dave-p3-immutable-native-002.log` (~7.1 s total). The actual native `contact_supervisor` interview and draft human-criterion Goal exist before the viewer. Installed TUI displays the same pending request and `/goal status` before and after SQLite owner reopen, without supplying a default answer. The normal editor submits a configured server-read skill. Actual CodingTools Bash emits unique partial and final markers through a disposable recording DCG; the partial is observed before its final. Native explicit answer, not viewer detachment, resolves the request. The programmatic observer also imports the immutable installed terminal controller, not source.

### Existing editor, navigation, controls, detach and reconnect

```sh
python3 /tmp/dpi-terminal-successor.AmcOj0/probe.py --entry /tmp/dpi-terminal-packed-7bo6KL/install/node_modules/dpi-terminal-adapter/dist/main.js
```

**8/8 checks PASS**, `/tmp/dave-p3-immutable-pty.json`, full PTY evidence `/tmp/dpi-remote-terminal-gcf_0q3f`:

- Original multiline editor sends the exact steer text.
- Tool partial/committed result retains the existing tool card.
- Child navigation/Escape returns without abort; root Escape reaches native conversation interrupt.
- Task expansion, server session rename, remote session selection and `/new` remain usable.
- Closing the final TUI leaves native work running; an independent HTTP reader gets the result.
- Reconnect uses the same conversation rather than opening a substitute.

The host here is the installed backend's real faux/playground profile; the native-profile interview/Goal/guarded-stream scenario above is distinct. Neither is claimed as a real external model test. The client opens no Harness.

### Same synthetic latency metric

```sh
python3 /tmp/dpi-terminal-successor.AmcOj0/latency-probe.py --entry /tmp/dpi-terminal-packed-7bo6KL/install/node_modules/dpi-terminal-adapter/dist/main.js
```

**PASS**, `/tmp/dave-p3-immutable-latency.json`, evidence `/tmp/dpi-terminal-latency-66cyydkt`. Fifty samples: p50 **2.099611 ms**, p95 **3.122480 ms**, maximum **19.866073 ms**. The unchanged baseline p95 is **1.622629 ms**, giving the original threshold **51.9471548 ms**. Unknown-render-kind safe text also passes.

This is recording-HTTP synthetic view commit → actual TUI marker observed in the PTY, using the same Linux monotonic clock. It is not native SQLite/model throughput, physical screen raster latency or a live-provider measurement.

## Criteria mapping and remaining acceptance

| Criteria | Producer evidence | Remaining boundary |
|---|---|---|
| ISC-18.1/18.2/18.3, ISC-19.1/19.2 | Unchanged installed actual TUI, eight-operation PTY plus actual native guarded partial/final sequence | Independent P3 review/QA |
| ISC-20/21 | Client detach → independent HTTP result → same-conversation reconnect | Broader fault matrices only where the independent gate requires them |
| ISC-22 | Same unanswered native request before/after all viewers close and native owner reopen; no default response | Independent gate on final candidate |
| ISC-26 | Same fifty-sample synthetic metric p95 3.122480 ≤ 51.9471548 ms | No alternative metric substituted |
| Terminal ISC-38 and supporting ISC-8/41 | Existing clean-HOME standalone package proof; unchanged tarball/installed bytes and local source/license assets | Whole ISC-38 still needs BB and iii packages |

Native-profile projection review is Alice's independent gate; memory's corrected successor was independently accepted in gate 476. This producer report does not promote their status or edit ISA checkboxes. No commit, deployment, live service/model, private session migration, global settings or production activation was performed.
