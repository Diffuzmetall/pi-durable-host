# Terminal adapter source notices

The remote controller, wire projection and client delivery journal are local implementation code. The editor, message components, theme engine, tool cards and layout are the selected existing Pi TUI, not a replacement interface.

Selected Pi source: release `20261028-4rmMfRfc`, `host-lane/host/packages/coding-agent/src`. Copyright (c) 2025 Mario Zechner, MIT; complete notice retained at `src/ui/licenses/LICENSE.pi`.

Selected activity/automation footer, title display and tool-card wrappers: `pi-durable-extensions/packages/`. Copyright (c) 2026 Diffuzmetall, MIT; complete notice retained at `src/ui/licenses/LICENSE.extensions`.

The generated tool-card vendor code identifies `@quandev104/pi-style 0.5.10` (MIT). Its original `NOTICE.md` and `LICENSE.pi-style` are retained at `src/ui/licenses/NOTICE.tool-cards.md` and `src/ui/licenses/LICENSE.pi-style`.

`src/ui/SOURCE.json` records original and candidate hashes for the selected source/assets. Local edits remove owning runtime, local session scanning/locking, client-side Git attribution to the remote workspace, filesystem skill expansion and installed absolute imports. The renderer/editor/theme/tool-card behavior is retained, with explicit remote session selection, title update and stale-network indication. The client never imports a session Harness or opens its SQLite.

Distribution must retain this notice and all four complete license/notice files, plus dependency notices. The Disler MIT notice remains in the backend/SDK fork and packed SDK dependency; it is not replaced by these UI notices. No publication or production activation is authorized by this file.
