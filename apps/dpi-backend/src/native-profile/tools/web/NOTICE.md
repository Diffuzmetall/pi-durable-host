# Session-local native web tools

## Source and callable interface

This is the actual selected `web-tools` extension for ISC-44, Feature F1. Original source: release `20261028-4rmMfRfc`, `extensions-lane/packages/web-tools/src/web-tools.ts`.

Original SHA-256: `a2a6432ad89a01f733d785a586a92b856efca2f02e06a6dbe346737a978516c7`.

```ts
const extension = createWebTools({
  directory: join(context.directory, 'web'),
  fetch: trustedPrimaryFetch,
  rescueFetch: trustedOptionalRescueFetch,
});
registry.install(extension);
```

Install before `Harness.open`. The absolute directory belongs to one native session. No runtime or Storage owner is created. The extension keeps exactly `web_search`, `web_fetch` and `batch_web_fetch`, with the original schemas and replay semantics.

The adjacent `LICENSE` retains Diffuzmetall, Joe Matthews and Thinkscape MIT notices. The port preserves the actual search, parser, extraction, result layout, URL rules, body limits, output budgets and download code.

## Owning changes

`AsyncLocalStorage` binds the three actual tool callbacks to their explicit settings, download, quota and HTTP capabilities. No global fetch, dispatcher, environment variable or quota symbol is changed. Module request queues and the optional parser-module cache retain their original behavior.

If `fetch` is absent, the factory captures the platform fetch reference. It never replaces that reference. The optional rescue callback replaces implicit browser-client discovery. Only primary refusal or transport failure permits rescue. Both callbacks receive the native caller cancellation signal and the original timeout signal.

Settings reside at `directory/settings/settings.json`. The native workspace's `.pi/settings.json` retains its original override behavior. There is no CLI, HOME or environment fallback. Optional local Defuddle/linkedom modules retain their original parser behavior. The actual built-in extractor remains available without them.

Downloads reside at `directory/downloads`. They retain private directory checks, exclusive file creation, private file mode, byte limits and failure cleanup. The folder budget remains 200000000 bytes per private folder. This does not set a host-wide disk quota.

One factory instance owns its transient reservations. Reuse the installed extension within its native owner lifetime. Disk recount defines committed usage after reopen. These checks do not claim arbitrary overlapping factory replacement or universal registry compatibility.

## Verification

From `apps/dpi-backend`:

```sh
./node_modules/.bin/tsc --strict --target es2022 --module nodenext --moduleResolution nodenext --noEmit --skipLibCheck --types node --typeRoots node_modules/@types src/native-profile/tools/web/web-tools.ts
node --import tsx --test tests/native-web-tools.test.mjs
```

PASS: strict source check and 2/2 tests. Two actual Harness/SQLite/faux sessions invoke all three native tools through real loopback HTTP adapters. They have distinct settings and file paths. Search count overrides, search-to-fetch output, inert script content and ordered batch results pass.

Real binary downloads have mode `0600`. A second download cannot overwrite the first. Folder quota and oversized declared bodies fail before an extra file appears. A download-directory symlink cannot write through. A non-HTTP URL reaches no transport.

Explicit rescue, active response cancellation and independent close pass. Close of session A leaves B usable. The parent fetch reference, quota symbol and relevant environment paths remain unchanged. Tests use no live web endpoint, paid model or private config.

Machine-local verification artifacts are not distributed. See the public status and reproducible package tests.
