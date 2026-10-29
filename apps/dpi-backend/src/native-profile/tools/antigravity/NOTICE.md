# Localized native Antigravity tool factories

P2 ISC-44/ISC-2 component only. Actual selected `antigravity-tools/src/index.ts` and `save.ts` origins/hashes are in SOURCE.json. The selected package labels its own adapter code MIT under the repository license; Diffuzmetall's MIT notice is retained in LICENSE. The upstream pi-antigravity provider implementation is **not** bundled or relicensed by this port.

Default export `createAntigravityTools(operations)` returns the actual native Extension with exactly `google_search` and `generate_image`. Original schemas, replay-unsafe classification, native `api.agent(context).cwd`, lexical path preflight, operation signatures and fixed provider/network error messages are preserved.

The caller supplies trusted provider-owned `search` and `image` operations, plus the current `resolveApiKey(context)` capability. The implicit `api.models.getAuth` fallback is removed. Missing/revoked credentials are unavailable, not a fake provider success. No environment/global account store/config is read by this factory. Provider operations must honor their native cancellation signal and current authorization. Success text now also redacts literal/JSON-escaped key text and authorization/bearer headers; errors remain fixed and never attach the original credential-bearing cause. The tool does not infer authority from a caller-supplied token or human flag.

`saveGeneratedImages` is a **byte-identical** source copy. Trusted provider image operations should use it for actual saves: exclusive 0600 files, no overwrite, actual byte format determines suffix/MIME, bounded base64/count/size, workspace and ordinary symlink-directory escape checks. It is not automatically called by an arbitrary supplied image operation: the provider capability owns generation and saving. Partial output after failures is retained, never silently deleted. Same-UID filesystem races remain outside this trusted-host helper's boundary.

`generate_image` writes to the calling workspace. The parent must grant it only under the correct native filesystem/write policy; this adapter cannot decide an HTTP actor's permissions. Do not accidentally permit it to a filesystem-denied delegated caller merely because it is an image tool. A textual path escape is rejected before provider execution; other failures, including an existing output discovered after generation, do not promise rollback of an already requested provider operation. Replay remains unsafe.

## Evidence

From `apps/dpi-backend`, run the strict check and `node --import tsx --test tests/native-external-tools.test.mjs` shown in the adjacent Context7 NOTICE.

Machine-local verification artifacts are not distributed. See the public status and reproducible package tests.

The recording operations are explicit fixture capabilities, **not** the upstream live Antigravity provider. Parent must supply the actual trusted provider implementation, compose these factories, package their closure and pass the independent full-profile inventory/security gate. Production provider authentication, live search/image behavior, spending, global settings and deployment were not tested or changed. No additional dependency or source outside this fork was installed or edited.
