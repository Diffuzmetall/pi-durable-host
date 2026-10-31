# Selected native iii job capability

Source `I` is `donor-iii://src`.
`SOURCE.json` records original/local hashes. The source is read-only and unchanged.

This port keeps the actual `durable-pi.jobs@2` native document family, original job request-key/fingerprint algorithm, isolated ownerless conversations, job generations/stop state, native submission/answer receipts, immutable result references/pages, child-control ledger/parent service and owned inventory. Genuine original Harness/Registry/Tx objects are used; no ToolExecutionApi is fabricated and no second storage/registry/runtime or client queue is created.

Localizations and selected scope:

- Original relative `.ts` and installed private native-subagent imports resolve to the existing local canonical native sources.
- `native.ts` includes the original scope/legacy document definitions and read-only workspace/tool guard only. Local session launcher, filesystem binder, absolute SDK require and v1 execution transport are excluded. Scope metadata additionally retains a trusted server policy reference and native anchor; current caller/max-owner checks are composed without changing document kind/version or creating human authority.
- `jobs.ts` retains native job creation, journal/admission/reconciliation, generations, immutable receipts/result pages and accepted pending-stop recovery. It inherits model/tools from the explicit trusted native anchor instead of a hardcoded root. Final current authorization occurs inside the native admission transaction after awaited mutations. Namespace/config/worker identity is included through its immutable configured policy reference; changed bindings conflict rather than reinterpret records.
- The existing scoped job guard already owns isolated child permissions, so child continuation checks that persistent scope rather than assigning a human-conversation ExistingInputs policy to an isolated job. No arbitrary existing human conversation is granted (`existing: []`). Native parent control also invokes a final synchronous current-grant checkpoint.
- Native job-control/child-control algorithms retain their documents, IDs and stop barriers. The current server policy is additionally checked before new mutations and at their final transaction boundary. Internal settlement of an already accepted native stop remains the original native operation.
- `completion.ts`, `read-domain.ts` and `auth.ts` contain only the original canonical completion, target identity and canonical fingerprint subsets used by this server. Engine trigger registration and unused read-model/tree/recovery-console APIs are not included. The info capability truthfully advertises treeEvents/recovery false, while actual native job/stop recovery is retained.
- The existing localized scopedRead/ExistingInputs definition is reused, not redefined under a new identity. `index.ts` is the trusted server lifecycle/policy composition over the same owner.

Public SDK wire types contain no native runtime imports. Bodies, unsigned worker hints and metadata never construct server grants. The separately authorized iii adapter owns signed ingress/engine transport; this package never reads personal worker configuration, starts iii or activates production.

## License boundary

The fork's original upstream MIT/copyright notice is retained in the repository `LICENSE`; existing native subagent and SDK notices remain unchanged. The owner of the selected iii source separately confirmed ownership and MIT publication rights. Selected iii source: Copyright (c) 2026 Diffuzmetall, MIT. Its former private package flag is not a restriction on this owner-authorized copy. Original source hashes and separate adapted local hashes remain in `SOURCE.json`; symbolic donor identifiers are provenance, not machine-local runtime dependencies. This permission is not a production, deployment or real-session migration grant.
