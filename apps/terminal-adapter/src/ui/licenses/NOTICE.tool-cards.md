# Third-party notice

`vendor.mjs` contains bundled, tree-shaken presentation code from
`@quandev104/pi-style` **0.5.10**, https://github.com/quanpersie2001/pi-style,
installed locally from npm. Copyright and MIT license are preserved verbatim in
`LICENSE.pi-style`. `vendor-inputs.json` records the relative source paths and
SHA-256 digests used by `build-vendor.mjs`.

Only boxed bash/edit/write/read/grep/find/ls renderers, generic fallback, their
shared box/diff/width/theme helpers and render-state lifecycle helpers are
included. The extension entry point, message/core compatibility patches, editor,
startup, footer/status providers, clipboard and execution code are not bundled.
The sole import adaptation maps upstream public `pi-coding-agent` syntax utility
imports to `./syntax.mjs`, which uses the same helpers from the local native host.

The new local adapter and host patch are repository-owned. They adapt renderer
contexts/identities, sanitize display text, limit unknown-tool parameter display,
clip very narrow terminal widths, and connect native lifecycle boundaries. No
upstream tool execution is registered or replaced.
