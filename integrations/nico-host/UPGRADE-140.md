# pi-mcp 1.4.0 and SSE follow-up

## Published source changes

- Pin backend `@earendil-works/pi-mcp` to **1.4.0**, including its lockfile URL/integrity. Other native packages remain at their existing versions.
- Preserve explicit `structuredContent: null` in the native MCP/CodeMode bridge. Only undefined falls back to the result envelope; arrays, false and zero are retained too.
- Wait for a large initial SSE snapshot to drain or close before optional documents. Steady-state slow-viewer backlog protection remains enabled.
- Add regressions for structured values, a >2 MB snapshot followed by four documents on one connection, and slow-viewer disconnection.

Nico is retained as the connection/catalog manager in the operator deployment. Updating pi-mcp does not install Nico or activate a second manager. The separately supplied operator-specific bundles and existing Nico patches remain subject to the integration contract in [README](README.md).

The pi-mcp 1.4.0 public archive SHA256 is `ce2633c482aed9733d6a863a156da2b504426f0056fd2c3495f9e744d7e56726`. Its Node requirement is >=22.19.0 and its sole direct dependency remains cross-spawn 7.0.6.

## Fresh source verification

The exact public delta passed **5 focused tests, no failures/skips**, with network isolation, fresh HOME, synthetic data/providers and the exact published pi-mcp 1.4.0 package mounted read-only. Backend strict typecheck also passed under that package override. These tests cover structured-result preservation, large-snapshot documents, steady-state backpressure, DCG behavior and nested CodeMode authorization. They are not a fresh rerun of every historical project test.

The comparison candidate's separate **14/14** isolated checks are prior evidence for the package/manager boundary, not full acceptance of later Host integrations. The stock native manager was not selected: it omitted adapter-only configuration and resent a tool call after session-expiry HTTP 404, unlike the accepted no-resend route. The pi-mcp transport also retries a still-active request during configured auth recovery; the library version alone is not the Host's single-dispatch policy.

## Observed deployed route — 31 October 2026

Read-only inspection confirmed operator release `c0019d7-unified-sse-mcp140-20261031-v1` was active, with native Durable 1.4.0 and pi-mcp 1.4.0. All 76 pi-mcp package files matched the tested archive; the compiled structured-null bridge matched the accepted candidate. The SDK-only terminal launcher pointed to that Host endpoint with an accepted configured credential. No launcher/service change was made during verification.

- SDK reported 42 sessions and 47 conversations without session errors or missing required Root tools. Saved model references were present in their session catalogues; no model was remapped or called for this check.
- All three earlier verified sessions remained present. The selected historical conversation's 618 entries matched its prior entry hash exactly.
- The selected conversation delivered its **3,089,294-byte snapshot and all four optional documents** on the read-only SSE observation.
- All 43 native locks belonged to one Host; that same process held the 44 SQLite files including native app-state. SDK terminal processes did not own those databases.
- All 42 session Mail identity files had a nonempty admitted name and the correct project/cwd. No identities were registered, renamed or imported.
- Native reload and refresh capabilities were advertised. No reload, service restart, new prompt or model call was submitted during verification. The original three-slot provider-check ledger was unchanged.

### MCP inventory

Names are configuration names; CodeMode namespaces normalize hyphens to underscores. Inventory presence is not a live test of every remote tool or a guarantee that a server has not disconnected since discovery.

| Configured server | Observed tool inventory |
| --- | ---: |
| kanso | 15 |
| codegraph | 4 |
| mcp-agent-mail | 45 |
| railway | 36 |
| context-mode | 11 |
| langfuse | 95 |
| pi-lens | 17 |
| open-design | 22 |
| radius | 128 |
| exa | 3 |
| apify-catalog | 4 |
| timewebCloud | No tools exposed; unresolved, not accepted |
| paper | Disabled by configuration |
| shadcn | Disabled by configuration |

### Remaining operational gap

The Host and iii engine services were active/enabled, but **the iii worker was inactive/dead**. The old iii request was still readable through the delegated SDK with status `done` and the same answer checksum; that proves retained native state, not a functioning engine→worker→Host route. The cutover owner was notified. Nothing was restarted as part of this inspection.

BB and ordinary Pi remain outside this scoped deployment. Full tracing payload/collector parity, arbitrary historical migration and every MCP remote operation are not accepted by these checks. This source publication does not ship the complete later reload/catalog deployment, private evidence, credentials, session history, machine-specific scripts or compiled operator bundles.
