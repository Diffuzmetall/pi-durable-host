# Nico Host integration reference

This directory publishes the transport facade and changed-boundary patches used by an operator's accepted local terminal/iii cutover. It is **not** a standalone installer or a replacement for this repository's backend/SDK. It does not change the default CLI or activate a service when checked out.

## Scope and actual result

The local deployment uses one native Durable 1.4.0 Host, the existing `native@1` profile and native CodeMode. Terminal and signed iii are SDK clients. The saved-model continuation of one selected historical copy passed under a separate three-call authorization. No bulk-history migration is claimed. BB and ordinary Pi were not switched.

The subsequent Nico transport change passed nine isolated tests with synthetic data/providers and no external network, followed by live tool-inventory parity, read-only MCP calls, unchanged native entry/configuration checks, large selected-history SSE and retained signed iii-result retrieval. No additional model calls were made for Nico acceptance. These are operator self-verification results, not independent public acceptance of a new package tuple.

The deployment inventory at acceptance had eleven connected MCP servers. Timeweb remained degraded with `needs_auth`; paper and shadcn were intentionally disabled. Discovery is not proof every remote operation is healthy. No claim of all fourteen working is made.

## Files and dependency contract

- `nico-session-mcp.mjs`: unchanged deployed facade. It imports explicit build products from `compiled/bindings.mjs` and `compiled/nico.mjs`; those operator-specific bundles are deliberately **not** published here. The first must provide native `loadMcpConfig`. The second must export the manager, credential resolver, config projection/snapshot resolver, `authorizeAgentMail` and `mcpNamespace` named by the facade. Supplying arbitrary replacements is not an accepted installation.
- `nico-null-const.patch`: nine added lines in Nico's validator. Railway's `{const:null, nullable:true}` branch fails Ajv compilation without a type. The patch adds equivalent `type:"null"` to a private validation copy, using existing `json-schema-traverse@1.0.0`. Advertised schemas and validation constraints remain intact.
- `backend-sse.patch`: patch against the installed backend JavaScript. A large initial snapshot waits for drain/close before optional document frames; steady-state backlog protection is unchanged. It is not automatically applied to repository source by this publication.
- `large-snapshot.test.mjs`: the actual native faux/SDK regression for the SSE boundary. It requires built/installed matching public packages; it is not a network or live-provider test.

The pinned dependency is `pi-mcp-adapter@7.0.0-durable.3`, derived from upstream v7.0.0. Its accepted artifact already has two patches for headless/read-only OAuth integration and single dispatch. The null-constant fix is **one additional patch**, not a patch-free upstream install. The accepted archive SHA256 is `3f044ee3ffa5aed8423efb69f4de2ff6d0953b5abc58d9ec41f2693cf696da56`. Dependency archives and their two-patch source distribution must be supplied and reviewed separately; this directory does not pretend to contain them.

## Upgrade and rollback requirements

Build a new versioned candidate, never overwrite an active or failed release. Verify artifact/input hashes, licenses and all patches; apply compatibility patches with zero fuzz. Remove the null-constant patch when upstream handles the regression, rather than accumulating a parallel fork. Preserve the native facade and explicit dependency boundary.

Require isolated checks for session ownership, same-profile reopen/replay, native CodeMode, Mail identity, config/auth precedence and revocation, single dispatch, and schema validation. Invalid arguments must still fail before dispatch; the advertised catalog must remain unchanged. The initial unpatched real-config probe failed Railway tool parity and rolled back; the regression reproduced that failure before the fix passed.

Before a live route change, require idle tasks/inboxes, exact service/config preimages, one owned Host and lock release. Probe required MCP discovery without starting another manager beside an active Host session. Restore the previous exact service route on failure; never restore database snapshots, replay uncertain effects with new keys or remap saved profiles/models. A dependent iii worker using systemd `Requires=` must be restored to its previous active state after Host restart.

The optional native MCP OAuth reader is deliberately read-only: expired tokens fail visibly, without silent import/login/refresh/resend. Provider credential lifecycle remains a separate unchanged native capability. Full tracing payload/collector parity and BB UI acceptance remain open.

Private deployment scripts, evidence, credential stores, identity files, history, compiled bundles and machine-specific launch configuration are excluded from this publication. No general-purpose installation or migration support follows from the scoped local result.
