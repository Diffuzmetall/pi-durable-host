# Memory in the common native profile reload

Task `4af372ad856e49ac80eed2d72f18cc69`; Carol owns profile edits.
Source inputs: Bob parent DONE460, memory DONE386, shared loader DONE372.

`createNativeProfile.prepareReload` now invokes the existing session memory factory alongside automation preparation. Both return trusted unpublished extension candidates. Explicit replacements take precedence by extension name. No new controller, logger, loader or commit subscription was added. Only `hindsight` is reloadable; the protected `hindsight.delivery` kernel remains unchanged.

## Fresh isolated evidence

Physical sandbox `/tmp/hot-update-sandbox-gcam7oix`: negative isolation self-check PASS, command exit0. Full argv and complete log are in `command.json` and `run.log`.

`hot-update-memory-profile.test.mjs` plus existing `hot-update-trusted.test.mjs`: **8 PASS / 0 FAIL**. Backend strict typecheck and scoped diff check PASS.

The new probe uses the actual full native profile, Harness/SQLite, two sessions, a local synthetic memory endpoint and a faux model (not an external model). It publishes twenty automatic memory replacements and one explicit replacement through `reloadDurable`. It verifies real recall before/after reload and fork, one native commit subscription per session, original delivery and authority extension identities, explicit precedence, protected delivery replacement refusal, unchanged registry on refusal and session B recall after closing session A. Session-specific logs remain private to their original paths. Witness:

```json
{"replacements":21,"aSubscriptions":1,"bSubscriptions":1,"bAliveAfterAClose":true}
```

Source SHA256:

- `apps/dpi-backend/src/native-profile/profile.ts`: `d472e565b3291bc6b4f14ab3dfdee96dea85c0ccef170ee06e3ea0b44876481c`.
- `apps/dpi-backend/tests/hot-update-memory-profile.test.mjs`: `c6402a7f3cf3e7a62288e11b748823a1063dd9c137784a952d0d0ad798573944`.

No MCP source, Store, SDK/TUI, installed package or release changed in this output. Tests use the source package alias, not an installed release. MCP lifecycle/profile/Store integration and independent same-manifest installed acceptance remain mandatory. Whole S5 is not accepted. Production activation NOT RUN; existing auth and release-return blockers remain.
