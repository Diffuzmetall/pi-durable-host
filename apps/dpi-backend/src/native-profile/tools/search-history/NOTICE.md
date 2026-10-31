# Native search history

## Source and interface

This is the actual selected `search-history` extension for ISC-44, Feature F1. The source release is `20261028-4rmMfRfc`.

Original source under `extensions-lane/packages/search-history/src`:

- `index.ts`: SHA-256 `312f14d8dbf78dda8941223e61316737281ca984cbb469df8dd18b4fa01c24c8`.
- `history.ts`: SHA-256 `edb3878413116044515cf2349c3c4f5148ddbee636ec4c44b4f5c02c72b4bbc7`.

`createSearchHistory()` returns the actual native `search-history` Extension. It declares exactly one tool, `search_history`, with safe replay. Install the extension before `Harness.open`. No bind, Storage handle, environment variable or private history database is required.

The adjacent `LICENSE` retains both MIT copyright notices for IndyDevDan and Pi Durable search_history contributors. The port does not include another runtime or index.

## Narrow changes

The helper retains the original literal AND search, ranges, explicit entry lookup, tool/kind filters, paging, reset/compaction marks and recursive-search exclusion. It excludes opaque thinking, signatures, images, system messages and arbitrary entry data from the result. Normal snippets remain at most 360 characters. Explicit entry output remains at most 4000 characters.

Native application inputs do not match the narrower `pi.user` token. The tool treats known `host.input` metadata only as a lookup hint. It uses the existing `nativeRequestKey`, then checks the actual native input receipt and its exact entry ID. A passive entry with copied metadata does not become a user input.

The entry scan first applies `api.conversationId` scope. A visible fork ancestor keeps its receipt at its native origin. The proof lookup uses that immutable origin, not a caller-supplied conversation ID. A foreign entry lookup cannot expand the scan. The pure helper receives only the resulting trusted ID set.

No native document or task definition changes. No credentials, model calls or storage writes occur in the tool. The only backend dependency is the existing canonical request-key helper.

## Checks and limits

From `apps/dpi-backend`:

```sh
./node_modules/.bin/tsc --strict --target es2022 --module nodenext --moduleResolution nodenext --noEmit --skipLibCheck --types node --typeRoots node_modules/@types src/native-profile/tools/search-history/index.ts
node --import tsx --test tests/native-search-history.test.mjs
```

PASS: strict source check and 4/4 tests. The source conformance check covers filters, text budgets, context marks and explicit entry behavior.

The bounded scan fixture stops after 20 pages at the newest 10000 entries. It reports `truncated=true` and `total_is_complete=false`. An older absent entry is not a global negative result.

A real Harness/SQLite/faux test uses two conversations and an actual fork. Actual `Store.send` input appears under `kind=user`. A passive metadata spoof remains an event. Visible inherited input keeps its native source ID. Foreign entry, extra scope argument and invalid range cases disclose no foreign sentinel. The tool schema rejects the scope argument before execution.

Logs: `/tmp/alice-native-history-source-check.log` and `/tmp/alice-native-history-tests.log`. An initial aggregate check recorded peer Store/SDK thinking-level type errors in `/tmp/alice-native-history-check.log`. The final composed candidate still needs its current whole-backend check.

This is a component check, not full ISC-44 acceptance. The parent must install the extension and include its source notice and license in the backend artifact. Other external tools, full-profile inventory and independent acceptance remain open. No live provider, personal history store, production database or global config was used.
