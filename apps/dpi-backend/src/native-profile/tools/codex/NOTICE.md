# Localized native Codex tools

P2 ISC-44/ISC-2 source component, not full inventory/provider-auth acceptance. `SOURCE.json` records six exact source mappings from the selected read-only release and their local hashes. `UPSTREAM-NOTICE.md` retains the original source attribution and Zach Yuen's MIT notice; `LICENSE` retains the fork adapter's MIT notice. No upstream provider, Pocket adapter or ordinary-Pi initializer is bundled or activated.

## Integration

Default export `createCodexApi(host: CodexHost)` returns the actual native Extension with exactly `codex_ask`, `codex_search`, `codex_image`, `codex_usage`. Install before Harness.open. No bind, second owner, background service or process-global state is introduced; each invocation closes its own runtime in `finally`.

The trusted server supplies:

```ts
{
  authorize: async ({ conversationId, api }) => currentServerPermission(conversationId, api),
  uploadRoot: async conversationId => explicitCurrentConversationUploadsOrUndefined(conversationId),
  runtimeOptions: { fetch: trustedTransport, deadlineMs: 180000 }
}
```

The names in this example are integration obligations, not permissive defaults. Authorization must establish current permitted use and exact scope, not merely accept a user-supplied tuple or an owner label. Image tools need proper native filesystem/write permission. The original capability takes the actual native ToolExecutionApi, not actor/token/provider/module fields from model arguments. `uploadRoot` is optional and receives only the native conversation ID. It never discovers a global upload directory.

`runtimeOptions` is an added trusted fetch/deadline seam forwarding the original RuntimeOptions. It is not a tool argument. The transport still accepts only the original fixed Codex routes/methods, rejects redirects and disallows automatic response retries. Production may use the native default fetch; tests supply a loopback-only capability without changing global fetch/dispatcher. Missing/denied Host fails before agent/model/auth/path access.

**Native `api.models` remains the sole model/auth capability.** The adapter does not open auth.json, discover user configuration or resolve an arbitrary module. A configured server must provide the appropriate native Codex subscription provider through its existing Models collection; absent OAuth/catalog fails honestly. Native provider credentials never come from tool arguments. Parent must pin the direct runtime dependency **typebox 1.3.27** for the original `typebox/value` import; it is present transitively in the tested checkout but manifests are owned by the integrator. No dependency was installed by this slice.

## Preserved behavior and narrow deltas

- Exact four names, schemas, replay-unsafe behavior, ask controls, explicit unavailable-model rejection and original omitted-model selection are preserved. No saved model is remapped. The standalone ask constructs its own prompt/images, not the surrounding conversation; unsupported output-token limits still fail.
- Original PNG CRC/format/decompression checks, path preflight and pinned-directory/exclusive publication save functions are byte-identical. Existing files are never overwritten; pending hardlinks/partial files remain, not deleted. The source's same-UID directory-rename limitation remains explicit. Remote generation is not reversible.
- Original search schemas, scoped `codex-api.search-session` document kind/version/fork semantics, mode mapping/parser and quota formatter are byte-identical. Quota exposes only masked window usage, not account/credit inventory or redemption. The original fixed route and body limits remain.
- Only local `.ts` import suffixes become `.js`; Pocket adapter exports are removed. Source comments/denial text identify the native host rather than Pocket.
- Current Host authorization is rechecked before model/network/image-read/local-save effects and search-session creation. Revoking after remote generation prevents a local image save, but cannot undo remote generation. There is no automatic retry or replacement request.
- Provider credential strings are retained privately only for redaction. JSON string values are redacted **after decoding**, including Unicode-escaped forms. Final ask/search text is redacted too, covering serialized JSON property names. Raw provider errors are not attached to public errors. Native model/provider ownership and parsing are not replaced by a second runtime.

## Fresh evidence

From `apps/dpi-backend`:

```sh
node_modules/.bin/tsc --noEmit --strict --skipLibCheck --target es2023 --module nodenext --moduleResolution nodenext src/native-profile/tools/codex/index.ts
node --import tsx --test tests/native-codex-tools.test.mjs
```

Machine-local verification artifacts are not distributed. See the public status and reproducible package tests.

Coverage includes exact selected model/no fallback, isolated fake credentials/cwd, standalone prompt + own recent image, foreign image-path denial, caller-token rejection before effect, actual quota masking, search backend ID through actual owner reopen, close-A/usable-B, image format/mode/no overwrite/escape, revoked image write after a completed remote response, fixed route/method/no-response-retry and a short fixture deadline. CRC corruption/symlink/image-size negatives execute the original helpers.

Machine-local verification artifacts are not distributed. See the public status and reproducible package tests.

Remaining: parent composition, exact dependency/assets in the packed closure, configured production provider implementation/auth, full policy/inventory review and independent milestone acceptance. Fork reset is preserved in the unchanged source definition; this slice separately executes reopen and cross-session checks, not a dedicated live fork smoke. ISC-44 remains partial.
