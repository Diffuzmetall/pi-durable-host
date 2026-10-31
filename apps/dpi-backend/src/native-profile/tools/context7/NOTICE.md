# Localized native Context7 factory

P2 ISC-44/ISC-2 component only. `SOURCE.json` records the selected read-only installed source and exact local hashes. The original Context7 package is MIT, copyright 2026 Diffuzmetall; `LICENSE` is retained verbatim. No Pocket application or installed path is a runtime dependency.

## Callable interface and source delta

Default export `createContext7({resolveCredential?, endpoint?, fetch?})` returns the actual native Extension with exactly `context7_resolve_library_id` and `context7_query_docs`. Both retain their original strict schemas, names, replay-unsafe classification and native instruction section.

`resolveCredential(context)` is a trusted per-session capability, called for every admitted invocation. It may return a string, undefined or a Promise. Missing/revoked credentials return an honest missing-credential error before any network request. Resolver errors and malformed keys are fixed, sanitized errors. There is **no** environment, dataDir, credential-file or global auth fallback. Do not put a key in tool arguments, logs or client metadata.

`endpoint` and optional fetch implementation are trusted factory inputs, not model arguments. The default is the original public Context7 MCP endpoint. Loopback HTTP endpoints are explicitly supplied in tests. Credentials in an endpoint URL, fragments and non-HTTP protocols are rejected. The native transport only contacts that exact configured endpoint and refuses redirects. This port changes the client/User-Agent version to `0.1.0-candidate.1-local`, removing the package.json runtime import; tool text now says host rather than Pocket.

The original validation/error classification, redaction, output budgets, resource/binary handling and render helpers are byte-identical. Native McpClient/StreamableHttpTransport request parsing, provenance tracking, 1MiB actual decoded-body limit, 6144-byte/512-line text budget, 30-second absolute deadline, 20-second request timeout, cancellation, final SSE flush and cleanup remain intact. Credential resolution now uses the explicit capability and honors caller cancellation. No MCP implementation or provider protocol is recreated.

## Evidence and limitations

Tested dependencies: pi-ai/pi-durable/Chord **1.4.0**, pi-mcp **1.0.2**, as recorded in SOURCE.json. The source package declares a different pi-mcp version; compatibility here is based on actual native protocol execution with the installed candidate dependency, not compilation alone or a claim about other versions.

From `apps/dpi-backend`:

```sh
node_modules/.bin/tsc --noEmit --strict --skipLibCheck --target es2023 --module nodenext --moduleResolution nodenext src/native-profile/tools/context7/context7-mcp.ts src/native-profile/tools/antigravity/index.ts src/native-profile/tools/antigravity/save.ts
node --import tsx --test tests/native-external-tools.test.mjs
```

PASS: strict source check and 4/4 tests (`/tmp/bob-external-tools-types.log`, `/tmp/bob-external-tools-tests.log`). Real loopback MCP covers initialization/tool call/session cleanup, 401/429, remote error versus local error provenance, malformed and oversized payloads, unsupported blocks, refused redirects, caller cancellation, unterminated SSE and byte/line limits. Two real native Harness/SQLite/faux sessions invoke all four Context7/Antigravity tools with distinct fake keys/cwd; key text never enters native transcripts. Revoking and closing A leaves B usable. The tests do not read real credentials, change process.env/global fetch/dispatcher, call live providers or use personal history/memory.

Parent must install this Extension before Harness.open, supply current admitted credential/transport capabilities and enforce native tool grants. The composed/packed full profile, independent inventory/security gate, live provider auth and production remain unaccepted. Preserved timeout constants/classification are source evidence; tests exercise cancellation rather than waiting for a real 30-second expiry.
