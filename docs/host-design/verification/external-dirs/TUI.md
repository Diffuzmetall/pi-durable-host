# External directories in the existing Durable TUI

## Requested UI

Implemented a separate, theme-aware dock row immediately ABOVE the existing editor,
including its embedded Working indicator. Example matching the supplied screenshot:

```
📂 3 external dirs │ pi-durable-host, pi-durable-delm, delm-runs (/dirs to manage)
```

The count uses singular/plural, names truncate to terminal cell width, the /dirs
hint stays visible when space permits, and zero/unavailable selections consume no
row. Names cannot inject terminal escape sequences or extra lines. Existing model,
skill, task, identity and footer rows/hotkeys remain intact.

`/dirs` is intercepted by the TUI and opens the existing searchable selector with
labels/full paths. Enter inspects a path; Escape returns to the editor. It never
submits a model input. This is a directory-list/inspection panel, NOT an add/remove
manager yet; no unimplemented mutation controls were added.

## Live data, not a cosmetic fixture

- Native profile exposes `pi.external-directories` through the existing authorized
  document endpoint/SSE stream, filtering the native session document by the
  requested conversation ID. It never sends the owners map or skill bodies.
- RemoteTerminal requests this optional advertised document. TerminalProjection
  validates its shape once and projects typed metadata into DurableView.
- Switching conversations creates a fresh projection; directories from the prior
  conversation do not survive while the next stream connects. Empty/malformed
  document updates clear the row. No local cwd-based persistence was added.
- Older installed profiles without this document remain usable and show no fake
  directory count. The row appears only when real metadata is available.

## Verification (2026-10-31)

```
cd apps/terminal-adapter
npm run check
npm test
npm run build
cd ../dpi-backend
npm run check
node --import tsx --test tests/native-external-dirs-reload.test.ts
npm run build
cd ../..
python3 apps/terminal-adapter/tests/external-directories-ui.py apps/terminal-adapter
```

Results: both typechecks and builds PASS; complete terminal suite **38/38 PASS**;
changed native/HTTP/SSE/terminal integration test **1/1 PASS**; real TUI PTY **PASS**.

The new unit cases cover the screenshot text, singular/plural and absent/empty
lists, widths 1–140 cells with Unicode/control sequences, document validation and
stale-state clearing. The native test now opens an actual RemoteTerminal against
the loopback native server, observes add/remove updates over SSE, switches to a
real empty child conversation and back, and checks that the child receives only
its own list. The PTY runs the actual TUI with disposable HOME/agent settings,
verifies the row, /dirs list, path inspection, Escape and clean detach, and asserts
that no model submission happened. No live data, paid model or external API.

## Delivery boundary

Changes are in this checkout and its rebuilt local artifacts. No installed release,
launcher, production config or running service was modified or restarted. The
installed old profile still needs the separately coordinated runtime integration
before its terminal can receive live external-directory metadata.

This report supplements REPORT.md: its earlier hashes/counts identify the previous
native-adapter milestone, not the updated profile/native-reload test in this UI
milestone. Full upstream add/remove/suggestion command parity remains outside this
specific screenshot-row change.
