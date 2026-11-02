# Memory/MCP: точные bindings для DM1

Bob · 2026-11-02 · task `3c03a7b5baf74d149d0b1096f1273576`.
Уровень: **contract-ready**, не runtime acceptance Durable 1.5.
Потребители: Carol для D1/D3, Alice для dependency closure, Grace для DM-D, Heidi для независимой QA.

## 1. Основание и границы

DM1 прочитан заново полностью, включая строки 1–316. MIGRATION-1.5-REPLAN прочитан полностью, включая строки 1–254.
SHA256 DM1: `5c6d2cfbb7ee3619e1cf53e9955d9b0291294b140f5a16cc5de26e935dbe31dc`.
Сводка после compaction не подтверждала прежнее утверждение FACT562 о полном чтении. Теперь основание выводов — текущие документы и source.

CodeGraph предоставил текущий `createSessionMemory`. Остальные существенные связи подтверждены прямым чтением source.
Граф также вернул нерелевантные BB symbols; они не входят в этот inventory.
Ни одна строка продуктового source этим output не изменена. Source changes и runtime tests относятся к отдельному D3 task `668e23e999b6405c98c5c0e392e4d40d`.

## 2. Независимая логика и native bindings

Префикс `M` означает `apps/dpi-backend/src/native-profile/memory/`.
Файлы со смешанной логикой отмечены явно. Их нельзя объявлять полностью независимыми через переименование каталога.

| Owning path | Независимая часть | Реальная native связь |
|---|---|---|
| `M/hindsight/bridge.mjs` | Config/bank policy, retain acceptance, pinned algorithms | Прямых imports Durable/Chord/pi-ai нет; функции разрешения могут выполнять эффекты при вызове |
| `M/hindsight/vendor/pi.mjs` | Pinned Hindsight algorithms/client, не второй Durable runtime | Проверка native import strings дала 0; это не полная транзитивная qualification |
| `M/logging-scope.mjs` | Session-local logs через `AsyncLocalStorage` | Только Node API; не менять ради Durable |
| `M/hindsight/private-fs.mjs` | Private path/owner/mode/symlink/size boundary | Только Node API; не ослаблять ради fixture |
| `M/hindsight/delivery.mjs` | Bank epochs, payload/operationId, ordering, pending/uncertain/ACK policy | Смешанный файл: `defineDoc`, `defineTask`, entry tokens, `tx.doc/task/createTask/scanEntries/scanConversations/conversation`, `storage.scanSubmissions`, `runtime.commit` |
| `M/hindsight/lifecycle.mjs` | Intent-before-effect, uncertain launch/usage, gates и accounting | Смешанный файл: `defineDoc`, `session.commit`, `tx.doc`; caller передаёт startup effects |
| `M/hindsight/extension.mjs` | Binding/config gates, cadence, prompt preparation и diagnostics policy | `AgentDoc`, `GenerationTask`, `hook.beforeRequest`, `defineTool/defineExtension/section`, `api.agent/snapshot/diagnostic/env/callId`, native entries/submissions |
| `M/hindsight/index.mjs` | Один controller/reconciliation lane, scoped drain/close | `subscribeCommits`, native publication changes/ops, session snapshots/commits/resume, `ConversationHandle.submit`, `Submission.wait`, Chord cancellation |
| `M/session-memory.mjs` | Один log/client/controller owner, scope decoration | Registry install/snapshot, extension task/hook/section shapes, `ContextState.definition`, native bind capabilities |
| `M/session-memory.d.mts` | Внутренний composition contract, не SDK API | Native `Harness/Storage/Registry/ConversationHandle/Submission`, Chord `Context`, reload replacement |
| `M/mail.ts` | Actor/project/admin policy и canonicalization | `@earendil-works/pi-mcp` transport/client; `McpCodemodeOptions` связывает его с нашим native adapter |
| `experiments/sdk-host-cutover/session-mcp.mjs` | Config/security/credentials/Mail identity, manager ownership, prepare/publish/discard/drain | Прямых native imports нет; связь только через `sources` к native registration |
| `apps/dpi-backend/src/native-profile/guards/mcp-codemode.ts` | Exact allowlist, per-call authorization, finite deadline, unsafe replay policy | `Type` из pi-ai, `validateToolArguments`, native `defineTool`, `ToolExecutionApi`, `createCodemodeExtension`, pi-mcp content conversion |
| `experiments/hot-update-20261101/mcp-source/manager.ts` | Transport slots, active calls, observer/reload resource ownership | Прямых Durable/Chord/pi-ai imports нет; не переписывать manager ради native version |

### Минимально необходимая адаптация

- `hindsight/index.mjs`: заменить старую subscription точным observer contract целевого closure; сохранить единственную подписку и cancellation owner.
- `guards/mcp-codemode.ts`: убрать зависимость от удалённого pi-ai Type export; сохранить реальные JSON Schema semantics.
- Native hooks, sections, tool/task/document shapes требуют compile/runtime qualification на целевом closure, а не автоматического переписывания.
- Public Host/SDK не получают указанные native capabilities. Эти файлы остаются явными внутренними bindings runtime-модуля.

Документ MIGRATION сообщает переход на `observeCommits({advance,end})` и `detach()` в 1.5.
Это ориентир адаптации, **не проверка импортов target closure**. Observer end/close должен прекратить будущие wakes без второго controller.
Нельзя заменять публикацию только generic wake и терять фильтр retry: pending/sending updates не должны повторять сами себя.

Для schema boundary допустим прямой TypeBox import после проверки типов. Нельзя механически закрывать ранее открытый object.
Проверки сохраняют required/optional, extra properties, coercion, format и structured output; direct и nested CodeMode проходят одинаковую авторизацию.

## 3. Действующий callable/data interface для Carol

Это существующие вызовы source, не новый plugin SDK и не публичный wire.
Carol сохраняет единоличное владение общей `native-profile/profile.ts`, Store и `src/durable/`.
Bob изменяет только собственные bindings после отдельного claim/lease. Manifests/locks и isolated roots остаются у Alice.

### Memory

`createSessionMemory(registry, {directory, resolveBinding, resolveClient, lifecycleEffects?, diagnostic?})` создаёт session-local owner.
`resolveBinding(cwd)` возвращает `{cfg, bankId}`; `resolveClient({cwd, bankId}, cfg?)` возвращает client того же bank.
`createSessionMemory` проверяет совпадение `client.bank` и наличие `fetchWithAuth`.
Credentials не входят в persisted admissions, epochs или публичные diagnostics.

Последовательность действующего consumer `profile.ts`:

1. До `Harness.open` registry получает definitions memory и delivery.
2. `memory.bind({session, storage, context})` выполняется до resume, один раз для session.
3. `controller.admit(conversation, requestId, context)` сохраняет исходный cwd/bank binding до native submission.
4. Owner/grant fences остаются у runtime: `requireOwner` вызывается до и после admission.
5. Native submit/revoke/receipt атомарность остаётся у Carol; memory admission не заменяет этот fence.
6. `memory.prepareReload()` возвращает replacements существующего `hindsight`, включая `ContextState.definition`.
7. Старый `hindsight.delivery` registry kernel сохраняется при reload; delivery task closures не заменяются молча.
8. `memory.drain(timeoutMs)` ограничивает ожидание, не отменяет принятые remote effects. `close(timeoutMs)` отключает subscription и controller context.

Существующий `controller.submit()` использует тот же requestId и вызывает `Submission.wait()` только для wake.
Новый внешний session interface не должен возвращать native Submission или разрешать повтор с новым requestId после lost ACK.
Во время D1 minimal profile memory может отсутствовать; это не acceptance полного D3.

### MCP

`connectSessionMcp(context, {agentDir, projectTrusted, authorize, providerToken?})` возвращает один transport owner.
Его interface: `sources`, `shellEnv`, `status()`, `close()`, `prepareReload()`.
Каждый source содержит `{server, allowedTools, directTools, authorize, client:{listTools,callTool}}`.
Native consumer — `createMultiMcpCodemodeExtension(sources)` в `profile.ts`; policy wrapper добавляет conversation owner fence перед каждым invocation.

`prepareReload()` возвращает `{sources,shellEnv,status,validate,publish,discard,drain}`.
Carol выполняет preparation до commit; final validate и synchronous publish проходят в одном native fence.

Discard закрывает неопубликованный candidate; drain выполняется после publication. Ошибка drain не означает rollback опубликованного поколения.
Credential hooks привязаны к captured config; Mail использует только существующую admitted identity.
Config change, exposure вне разрешённого набора или отсутствующая Mail identity дают явный отказ, не автоматическую регистрацию.
`models:false`, unsafe replay, stable authorization и canonical project scope сохраняются для direct и nested calls.

## 4. Identity и semantic invariants

Native custom IDs остаются без переименования и искусственного version bump:

| Token | Contract |
|---|---|
| `hindsight.namespace` | document v1, session scope, namespace identity |
| `hindsight.delivery` | document v1, conversation scope, `fork:initial`, durable intents/cursor |
| `hindsight.context` | document v1, conversation scope, `fork:initial`, admissions/prepared/context cache |
| `hindsight.lifecycle` | document v1, conversation scope, `fork:initial`, intent receipts/usage |
| `hindsight.deliver` | task v1, initial phase `send`; existing task IDs сохраняются |

Delivery discovery использует settled `submission.answer`, не промежуточный stop и не `afterRun`.
Controller сканирует настоящие submissions/entries и сопоставляет admitted requestId. Raw user model role не заменяет native receipt membership.

Final boundary создаёт intent и task в native commit. OperationId/bank/ref/payload остаются прежними.
Не-idempotent sending crash становится uncertain; terminal failed task не означает завершённый intent.
`afterRun` не является idle и не доказывает exactly-once. Новый hook без доказанного эквивалента не заменяет существующий outbox.

## 5. Third-party inputs для Alice

Hindsight metadata: `@vectorize-io/hindsight-coding-agents` **0.8.2**, не 0.8.0 из старых комментариев.
Retained vendor/provenance и local scope patches должны сохраниться; bundle hash указан в `INVENTORY.json`.

Nico использует patched `pi-mcp-adapter` **7.0.0-durable.3**, upstream commit `b41f334da85b7608f3ff9e64e41b675e2f5d51f0`.
Используйте только corrected `mcp-source/build-observer/nico.mjs` и его `PROVENANCE.json`.
Исторический `mcp-source/build/` дефектен; manager observer repair не должен исчезнуть при пересборке.
Новый bundle получают из pinned source/patches, а не ручной правкой compiled файла.

Backend manifest пока pin-ит Durable/Chord/pi-ai/pi-codemode/pi-mcp на **1.4.0**.
Qualification должна проверить весь actual closure, не только Durable export. Общий dependency tree не изменялся.
Dave владеет своими providers/GipPity schemas; MCP schema owning path остаётся у Bob, общая wiring — у Carol.

## 6. Проверка inventory и ограничения

Команда из repository root:

```bash
python3 experiments/durable-module-20261102/memory-mcp/verify-inventory.py
```

Результат: 22 текущих hash PASS; 21 файл совпал побайтно с D0 source archive Alice.
`LICENSE.native` существует с закреплённым hash, но явно исключён из archive `INVENTORY.json` Alice.
Это не ошибка сравнения source и не разрешение исключить лицензию из итогового package.
Три control files имеют 0 native import strings. Проверка не заявляет транзитивную совместимость или отсутствие bundled native code вообще.

Исторический `M/SOURCE.json` содержит три устаревших local hashes: `hindsight/index.mjs`, `session-memory.d.mts`, `session-memory.mjs`.
Текущие bytes уже совпадают с D0 baseline; это существующее metadata расхождение, не DM1 regression.
Alice должна использовать фактические source hashes из нового manifest. Историческую provenance не переписывать задним числом.

Для D3 повторно использовать существующие fixtures:

- `native-memory-reload.test.mjs`, `native-memory-isolation.test.mjs`, `native-authenticated-memory.test.mjs`.
- `hot-update-memory-profile.test.mjs`, `hot-update-mcp-profile.test.mjs`, `native-mcp-structured-results.test.mjs`.
- `agent-mail-identity.test.ts`, `agent-mail-project-scope.test.ts`.

На этом output runtime tests **NOT RUN**. Нужны isolated closure Alice и работающий D1 owner Carol.
Каждый runtime запуск требует physical sandbox и negative isolation self-check, не только временный HOME.
Integrated reload/resource census и финальные Grace/Heidi gates относятся к новому candidate digest.
Старые release-return/auth FAIL не разрешены. Production activation **NOT RUN**.
