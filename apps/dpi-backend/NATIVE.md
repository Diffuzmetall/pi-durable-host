# Native profile: local server composition

The default CLI still selects `minimal@1` (or explicit `playground@1`). Installing this
package does not activate the native profile, change global settings, or migrate data.
The native factory is a server API, not an HTTP-selected module path.

## Runnable offline host

Install the backend tarball and run this ESM code from its installation directory.
Set `DPI_HOME` to a new disposable data directory, `DPI_START_DIR` to an existing test
workspace, and `DPI_TOKEN` to a fixture credential. This example uses only faux models.

```js
import { Store } from 'dpi-backend/store';
import { createHttpServer, GrantPolicy } from 'dpi-backend/server';
import { createNativeProfile } from 'dpi-backend/native-profile';

const { DPI_HOME: dataDir, DPI_START_DIR: cwd, DPI_TOKEN: token } = process.env;
if (!dataDir || !cwd || !token) throw Error('Set explicit disposable paths and a fixture token');
const policy = new GrantPolicy([{
  id: 'operator', token, actor: 'operator', source: 'terminal', authority: 'human',
  permissions: ['read', 'write', 'control', 'filesystem', 'human-accept'], binding: {},
}]);
const profile = createNativeProfile({
  policy, owner: policy.authenticate(token),
  resolveSkill: async name => { throw Error(`No skill configured: ${name}`); },
  connectMcp: async () => ({ sources: [], close: async () => {} }),
});
const store = await Store.open({ dataDir, startDirs: [cwd], name: 'native-offline', provider: 'faux', profile });
const server = createHttpServer(store, policy).listen(0, '127.0.0.1', () => {
  console.log(`http://127.0.0.1:${server.address().port}`); // Never print the token.
});
const close = async () => { server.close(); server.closeAllConnections(); await store.close(); };
process.once('SIGINT', close);
process.once('SIGTERM', close);
```

Use the existing `dpi-sdk` HTTP client to create a session and submit inputs. Its owner
is the same Store/Harness as before, not a second runtime. The package exports the same
`minimalProfile` and `playgroundProfile` under `dpi-backend/profiles` for other hosts.

## Closed native-copy adoption

`dpi-backend/native-import` exports the trusted offline `adoptNativeCopy` API.
It reads a verified coherent copy through immutable SQLite access, checks its complete
file inventory and the explicit source/target contracts, then creates a new host catalog.
It does not instantiate Store/Harness, invoke the profile or provider, or resume work.
A standalone native database is not a host catalog: copying it into an empty data directory
or running `migrate-playground` is not a valid import.

The source profile ID may legitimately be `null`; provenance retains that fact separately
from the explicit existing target factory ID. Task/document versions, model references and
native IDs are not silently remapped. Known retired task-document tombstones can have no
remaining content or stored version; their records survive unchanged, with a terminal owner
and known scope/family required. Active documents without content still fail closed.
Pure profile-specific document/effect validators, including asynchronous validators, must
finish before destination publication. Unknown contracts and unsafe pending state refuse.

See [the offline contract and limits](../../docs/MIGRATION.md). Metadata adoption is not
provider continuation or operational model availability: normal Store credential/model checks
remain in force. BB is not needed for backend, SDK, terminal or iii acceptance.

## Explicit integrations

- `connectMcp(context)` must create a **separate connection set per session** and return
  its exact approved sources and `close`. An optional `shellEnv` carries session identity,
  not server credentials. `openSessionMail` and public `StreamableHttpTransport` support
  an explicitly authorized existing Mail identity; no automatic registration occurs.
- `memory(context)` optionally returns explicit `resolveBinding`, `resolveClient` and
  lifecycle options for `createSessionMemory`. Logs are always under the native session
  directory, outside the requested workspace. `HindsightClient` and `resolveConfig` are
  exported for trusted configuration. Do not resolve personal banks in fixtures.
- `models: {defaultModel, catalogue, create(context)}` optionally supplies native model
  configuration. `catalogue` is sanitized device discovery, **not authorization**;
  `create` returns a fresh `createNativeModels(...)` capability for each session,
  with an explicit CredentialStore and provider set. Store validates saved references
  against that exact capability before native open/resume, and passes its same Models
  to Harness. It never uses the legacy global faux/OpenRouter container for these
  sessions. Missing models/credentials fail without a replacement. The SDK exposes
  `device.defaultModelRef` and `session.models()` (`scoped-models.v1`); use the scoped
  catalogue, not a different account's device metadata, for an existing session.
  Conversation-bound clients use `agent.models()` (`agent-models.v1`) instead of
  widening their grant to session scope. The agent route uses the same actual native
  session Models capability and sanitized catalogue, with ordinary current read
  authorization on the exact conversation before lookup. `session.models()` remains
  unchanged; it correctly denies a grant bound only to one conversation.
- `skills(context)` optionally supplies explicit `projectRoot`, `homeDir`, `agentDir`,
  `projectTrusted` and resource settings. The actual native discovery/prompt extension
  refreshes each request; the actual Goal resolver always uses current trusted
  discovery, never an ambient fallback or frozen startup catalogue. SDK
  `session.skills()` returns metadata only; `session.skill(name)` reads the exact
  server body under **current human root, read and filesystem** authorization
  (`skills.v1`). No client reads remote paths. Goal runtime projections omit private
  admitted skill bodies; the authoritative native document retains them.
- `resolveModel` is an explicit subagent selection policy. `resolveAvailableModel` is
  exported only for hosts that deliberately authorize every authenticated picker entry.
  Missing policy denies explicit model selection; it does not remap a saved ID.
- DCG uses the actual final-exec guard. Configure `dcg.binaryPath` if needed. A missing,
  malformed or rejecting evaluator denies shell execution; no permissive fallback or
  automatic installation is supplied. Filesystem operations remain usable.
- Native `search_history` is installed with its original own-conversation scan and
  receipt-backed authenticated user classification, not a global index. Context7's
  two original tools are installed; configure `context7(context)` with an explicit
  credential resolver/endpoint to use them. Missing credentials return unavailable
  before network I/O. `antigravity(context)` registers the original Google search and
  image tools only with actual trusted operations. Its image capability requires
  the profile owner to retain filesystem permission; use exported `saveGeneratedImages`
  in the provider implementation. No stub provider or model-auth fallback is supplied.
- Native Web tools use the private session directory. `web(context)` can supply
  trusted primary/rescue fetch capabilities; no hidden client/global dispatcher or
  personal configuration is loaded. Download tools require filesystem permission.
  `codex(context)` registers all four native Codex tools with an explicit CodexHost;
  native `api.models` remains the actual session capability. Authorization is checked
  before effects; image reads/saves also require filesystem permission. No login,
  credential discovery or real-provider fallback is supplied by this factory.
- `github(context)` optionally returns an explicit `env` and `execFile` transport for bounded GitHub triggers. Supply session-local HOME/GH_CONFIG_DIR and only approved credentials; ambient `process.env` is not inherited. Current root authority is checked again after awaited reads, before a comment/write effect. Without configuration the transport is explicitly unavailable.
- `tracing(context)` optionally supplies a session-local `TraceSdk` (`start`, `flush`, `close`) and safe `report`. The native generation/tool hooks export metadata only, never messages, arguments, results or exception payloads. No ambient SDK/credential discovery occurs; absent SDK means disabled. SDK failures are nonfatal and shutdown is session-local.
- The optional integrations are not silently enabled. Inspect the composition's
  `native.inventory` for present and unavailable components.

## Authority and lifecycle

The server supplies the authenticated grant handle. Bodies cannot grant actor, tools,
authority, workspace or policy reference. Generic delegated HTTP input uses the
exact messages endpoint of a declared native profile; it binds the canonical native
request key to the copied `ExistingInputs` document before submission. The actual native
hook checks current policy and restricts tools to scoped read/contact. Changed or revoked
policy fails closed, including after reopen. Stable policy references are not bearer
credentials. Revocation state belongs to the currently configured server policy; this
factory is not a durable grant-management service.

Store gives the profile its trusted cwd, session directory and admitted base shell env.
It opens native storage once, awaits `bind(harness, context, originalStorage)` before
resume, seals/drains integrations before Harness.close, then releases environment/MCP
resources and owner locks. Failed binding uses the same cleanup order. Native shell
execution excludes ambient server credentials and other sessions' identity/log variables;
explicit per-command env remains supported. No profile writes `process.env`.

Document readers expose only named native schemas. Conversation-scoped grants retain
their binding; session Goal/runtime projections are filtered by native goal owner. The
underlying task/document/request kinds and versions remain unchanged. Model metadata
includes supported thinking levels; explicitly changing model clamps thinking through
the real SDK, including the native 1.4 `max` level when supported. Abort consults the
profile's actual Goal protection method; protection returns a conflict rather than
aborting an unrelated task.

`AgentDetail.documentKinds` advertises the exact doc/event names. The public SDK's
`agent.goalCommand(line, requestId)` and `goalReceipt(requestId)` use the
`goal-operator.v1` channel, not model input. This privileged channel requires a human
operator with **write, control and human-accept** permissions. Retain the caller's
request ID across an unknown HTTP outcome. Receipts contain the actual canonical
request/task IDs and `queued`, `started`, `done`, `failed` or `uncertain` status. An
uncertain effect requires inspection, not automatic replay; closing the client does
not cancel the native task. The actual Goal service remains the sole engine.

## Native parent-control and BB bindings

`native-parent-control.v1` exposes SDK `agent.parentControl()`, `parentCommand(command)`,
`parentReceipt(controlId)` and `reconcileParent()`. Commands use the actual native
`controlId`, `expectedRevision`, child key/conversation/execution/request IDs and
`child-tree` stop scope. Tool selection is only a subset of the server's current grant.
The same native parent service owns admission, receipts, stop fences and reconciliation;
there is no generic task-abort substitute. Keep the exact command across ambiguous HTTP
outcomes. Stale/changed retries conflict; a pending native stop reconciles its existing
barrier after reopen instead of creating another child or intent. Delegated children
retain scoped read/contact policy, including a native parent-bound policy reference.

`native-bb-binding.v1` exposes `agent.bbBinding(threadId)` and
`bindBbThread(threadId, {kind:'root'} | {kind:'child',target})`. A trusted **server** BB
GrantSpec must bind the exact native session/conversation and set
`binding.bb: {providerId,threadId}`; its source must be `bb`. Missing configuration is
explicitly unavailable. Provider/session/parent-thread identity is never taken from the
body. Root binding requires that exact unowned native parent; child binding requires
its existing root binding and exact native child/execution/request ownership. Read-only
child credentials can open only their configured binding, never a new root.

`native-parent-target.v1` extends `parentControl(exactTarget)` with all four native
key/conversation/execution/request fields. It calls the original native target inspector
before an external Core registration; older hosts cannot silently ignore this selector.

`native-bb-outcome.v1` exposes `agent.bbOutcome(threadId)`. The original coherent native
child reader returns `unknown` (with a reason), `working`, `completed`, `failed` or
`interrupted`, along with canonical receipt/entry/request/parent/anchor IDs, public native
entries and optional model/input metadata. The existing owner's original Storage,
commit consistency guard and execution selection fence are retained. It never derives
terminal success from task completion, no-run, stopReason or answer wording. Latest
unnamed input and concurrent changes stay explicitly unknown. Current BB authorization
is checked both before and after capture; provider-failure entries use the existing
privacy projection. Reading/reopening never resubmits work. `agent.bbOutcomes(threadId,signal)` observes the
same coherent frames over the existing bounded SSE transport. Native child, parent and
receipt commit hints trigger one coalesced awaited capture, not polling or a new queue.
Closing a viewer never stops native work. Current authorization is checked per capture;
revocation closes the viewer.

For **new** sends by a configured authenticated BB grant, `controlId: 'bb-child:<id>'`
selects the true native input request ID `'bb-child:<id>'`, so the original Core admission
predicate can correlate canonical input entries and text. This is a trusted owner hook,
not a rewritten client snapshot. `native-bb-input.v1` is a distinct negotiated guarantee;
the SDK requires it before sending a `bb-child` control, not merely an outcome capability.
New BB-send receipts optionally carry `retryContext: {expectedRevision,target}` from the
original native command. After client restart, obtain that context with `parentReceipt`,
rebuild the same envelope using the actual Core input/mode, and POST again: native payload
fingerprinting and current grants prove an identical retry or return conflict. Returning
a cached receipt without checking the supplied payload is not equivalent. Earlier
receipts without context must not be guessed or rebound to a new revision.
Existing command receipts and all other sources retain
their original IDs. Generic HTTP message metadata still contains the raw caller key;
its canonical native receipt may use the existing actor-namespaced key.

The existing Harness owner commits current grant and native ownership checks together
with the original BB document/index CAS. It uses a genuine native `Tx` persistence seam,
not a fabricated `ToolExecutionApi`; the original active-tool factory retains the same
algorithm. No client Storage, new runtime, model call or production binding tool is used.
Bindings survive reopen and cannot be redirected by an identical or conflicting retry.
These are connected transport components; ordered BB/iii acceptance remains separate.

Provider failure text can contain request credentials. Public entries, transcripts and
live/reconnected native events therefore share a stateless projection: failed assistant
error/body become a fixed safe failure, retry messages are coarse, and private native
submission details are not exported. Healthy text and tool diagnostics remain intact.
The private native records and IDs are unchanged, including historical failures after
credential rotation; no token registry or credential lookup is required.

## Native iii isolated jobs

`native-iii.v2` adds a server-owned view over the existing Harness, not another worker
runtime. A trusted server grant must use `source: 'iii'`, `authority: 'delegated'`, exact
native `binding: {sessionId,conversationId}`, and immutable
`binding.iii: {bindingId,namespace,configHash,workerId}`. The namespace is `default` or
an original `durable-pi-test-*` namespace; configHash is its canonical SHA256. These
fields come from configured verified issuer/worker mapping, never an HTTP payload or
unsigned `_caller_worker_id`. Keep its transport credential inside the trusted iii
adapter. `bindingId` is the original logical worker binding, not a native session UUID.

Public `AgentHandle` methods, all requiring this capability before the request, are
`iiiInfo()`, `iiiSubmit({requestId,content,operation?,jobId?,mode?})`,
`iiiRun(input,{signal?,timeoutMs?})`, `iiiRequest(requestId)`, `iiiResult({requestId,answerRef,cursor?,limit?})`,
`iiiControl(operation,payload)`, `iiiControlReceipt(controlId)`,
`iiiJobStop({jobId,controlId,expectedGeneration})` and `iiiJobStopReceipt(controlId)`.
`operation` is `start`, `follow_up` or `steer`; start creates an original isolated
ownerless native job root, while follow_up/steer require its jobId. Retain the same
requestId and content/mode after a lost ACK: the original `durable-pi.jobs@2` journal
and native submission determine the same receipt or payload conflict. Client fields
cannot select authority, tools, workspace, config or another root. Info includes the
trusted namespace/config/worker and native session/anchor IDs for client verification.

Child-control payloads retain the original `binding/session/type/conversationId` target
and exact parent/child/execution/request fields for child actions. Native parent
revision/ownership and current delegated control policy are authoritative. Job-stop
uses the original generation fence and pending/stopped receipt; an accepted intent is
not a completed abort acknowledgement. Reopen reconciles the same pending native stop,
not a fresh generic abort. Explicit follow_up after stopped advances its generation;
steer does not reopen a stopped job.

The persistent scope guard permits the original read/native-subagent/contact tool set
only, checks current caller and max-owner policy, and constrains reads to the native
workspace. Current authorization is checked again after awaited admission writes in
the same native transaction. Serialized policy reference/anchor metadata lets the guard
validate after reopen without a client journal or process-owned identity map. A changed
trusted namespace/config/worker cannot reinterpret the saved journal before resume.

Canonical results use `durable:<conversationId>:<answerEntryId>` plus content SHA256.
`iiiResult` pages that immutable answer, never a tree or live-entry cursor. Page cursors
are intentionally ephemeral: after owner restart, begin again with the same answerRef;
never resubmit work to recover a cursor. Native legacy readback and job/child stop
reconciliation are retained. Read-model/tree-event/recovery-console extras are not
ported or advertised (`treeEvents:false`, `recovery:false`); those flags do not disable
the original native job/stop recovery. Signed ingress/engine completion delivery belongs
to the separate iii client adapter; the server does not load an engine, launcher or
personal worker/session files. The selected iii source owner confirmed MIT publication
rights; its source notice preserves that grant and the distinct original/local hashes.
Source publication does not authorize production or real-session migration.

## Candidate boundaries

The source-backed composition contains CodingTools, native input policy, subagents and
parent-control, Goal, schedules, own-conversation history, Context7, native Web,
explicitly configured Codex/Antigravity, native skills/context and session Models,
final-exec DCG, native CodeMode (`models:false`), and explicitly configured
session-local Hindsight/Mail, bounded GitHub triggers and metadata-only tracing. Child ports retain source hashes,
notices and upstream licenses under `dist/dpi-backend/src/native-profile/`.

The scoped local factories support **one in-process layout**, not the unmodified installed
profile with global adapters. Two real Store/Harness sessions are tested with separate
workspaces, loopback memory/Mail endpoints and logs, plus close/reopen and credential-safe
child execution. This is not acceptance of historical arbitrary registries, real-provider
credentials/catalogues, live session migration, SIGKILL recovery of every unsafe effect,
or arbitrary CLI/private-extension provider composers. Native parent/BB HTTP transport
has isolated faux/SQLite/SDK fixture coverage. Separate installed terminal PTY, actual compatible BB Core/Chrome and local iii engine checks are recorded in the source checkout's docs/STATUS.md, including the retained unexplained BB timing observation. Do not enable integrations by treating compilation, a source-patch application or that qualified local verdict as production compatibility.
