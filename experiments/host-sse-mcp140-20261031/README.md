# SSE and pi-mcp repair — 2026-10-31

## Activated

Active sealed release: `~/.local/share/pi-durable-host/releases/c0019d7-unified-sse-mcp140-20261031-v1`, PID `2311445`. The operator explicitly approved the controlled restart after isolated verification.

Base: the previous `c0019d7-unified-catalog-20261031-v1`, not the obsolete `nico-mcp140-v3` Host. Only the verified pi-mcp package is reused from that older candidate. One actual Host stop/start was performed. No prompts, task cancellations, direct database edits, global MCP/auth changes, commit or push were performed. The terminal launcher and terminal release remain unchanged.

## Changes

- Restore initial snapshot `drain`/`close` handling in `apps/dpi-backend/src/streams.ts` and the candidate's compiled backend. The 2 MB steady-state slow-viewer bound remains unchanged.
- Pin backend pi-mcp to 1.4.0 in source manifest/lock and local development dependencies. Retain the previous development package under this experiment as a preimage.
- Copy the 76 verified pi-mcp package files, preserving the accepted native bridge and Nico facade. No stock-manager replacement, semantic search, extraction or extra model calls.
- Rebuild the backend archive from the candidate's installed backend and update both npm lock integrity records. The archive contains the same SSE code, native bridge and dependency metadata as the installed candidate. This prevents a later archive-based preparation from silently losing the fix again.
- Preserve all other base execution files, including model catalogue restoration, provider registration, startup cleanup, reload and DeLM integration. Sealing verifies the exact base delta and every resulting file hash.

## Evidence

1. Original symptom reproduced offline on the current base: snapshot over 2 MB arrived, all four following native documents were absent. Slow-viewer control passed. Evidence: `/var/tmp/sse-mcp140-check-9cpykxzj`.
2. Apply SSE only, before changing pi-mcp: 2/2 PASS. All four documents arrive on one connection and the slow-viewer bound is retained. Evidence: `/var/tmp/sse-mcp140-check-h_qd97ga`.
3. Combined intermediate candidate: 15/15 PASS, including Nico ownership/hidden tools/revocation, native CodeMode and saved-receipt replay, structured arrays/null/scalars, synthetic memory and stock-manager comparison. The historical CLI fixture retains its original entrypoint; it is not represented as the new service startup test.
4. Exact final sealed release: **17/17 PASS, 0 FAIL, 0 SKIP**. This also starts/stops/reopens the actual current operational service with disposable HOME and synthetic OAuth, and verifies refusal of a pre-existing owner lock. No model request is sent by those service checks. Evidence: `/var/tmp/sse-mcp140-check-txco33ha/RESULT.json`.
5. Source backend typecheck PASS against the actual local pi-mcp 1.4.0. Source SSE and structured-result regressions: **3/3 PASS**. Source `npm ls @earendil-works/pi-mcp --json --offline` PASS. Python Ruff selected correctness/import/security/style checks PASS.

Final release manifest SHA256: `fc568c59e90fc1ec7cc29ef75711267870fe9a4b9394ba71f282eb38b1c62eb2`.

The final check runs in a read-only bubblewrap namespace with fresh HOME, no real credentials/data, loopback-only networking and resource limits. It captures the exact release manifest hash in its result. `check.py` derives TAP counts from the actual runner rather than hard-coding them.

## Reproduce

```sh
python3 experiments/host-sse-mcp140-20261031/prepare.py
python3 experiments/host-sse-mcp140-20261031/check.py experiments/host-sse-mcp140-20261031/candidate all
python3 experiments/host-sse-mcp140-20261031/seal.py PASS_EVIDENCE_DIRECTORY
python3 experiments/host-sse-mcp140-20261031/check.py NEW_SEALED_RELEASE all
```

Preparation and sealing refuse existing destinations. Do not remove an existing candidate or release just to rerun them. Existing sealed releases are inputs only, never patch targets.

## Activation result and remaining scope

Private cutover evidence: `~/.local/state/pi-durable-host/cutovers/20261031-sse-mcp140-s8k0exfe/`. `pre-activation.tar` was taken after the old owner had stopped and released every lock, before replacing the service entrypoint. No backup restore or rollback was needed.

- Exact data/native parity PASS: 42 sessions, 47 conversations, 4984 existing entry hashes, saved configurations/models and task/schedule records retained. Shared auth/MCP/model/cache/DeLM configuration bytes are unchanged.
- Ownership PASS: the same 44 lock paths belong to the new Host PID. An initial preflight safely refused before stop because it assumed only one root lock; the live system has two root locks plus 42 session locks. The corrected guard compares the actual owned lock set, not an assumed count. Its disposable self-check passes and verifies refusal of another owner without modifying locks.
- Live SSE PASS: the unchanged SDK consumed a real 3,089,294-byte snapshot followed by all four requested documents on one connection. Each tested connection received exactly one snapshot; no reconnect or real model request substituted for delivery. Private result: `LIVE-SSE.json`.
- pi-mcp 1.4.0 is active. Terra 6.1 and Gemini Flash remain available; saved model selections are unchanged. No new model request was sent.
- External MCP parity is **PARTIAL**, not PASS. Compared with the fresh pre-restart baseline, 18 conversations lost previously offered Langfuse tools and one lost previously offered Open Design tools; other conversations recovered tools. Total offered inventories changed from 24 to 15 conversations for Langfuse and from 44 to 46 for Open Design. This is an inventory comparison, not a test of individual MCP operations. The precise failure cause is not established; available service journal lines contain no corresponding error reason.

The existing reload path was inspected, not invoked: it reloads model/adaptor registries on the existing Harness and does not reconnect the frozen session MCP source set. No unsupported session close/reopen, second blind restart, credential rotation or global configuration change was attempted to mask MCP differences. MCP reconnection/parity remains tracked separately; full integration health is not claimed.

This repair does not restore iii worker, repair Langfuse, change saved models, or activate the obsolete Host candidate.
