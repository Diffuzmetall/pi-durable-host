# Контракт session operations · D0

## Статус и потребители

DM1 определяет область работы. Этот документ задаёт проверяемые обязательства D1, а не утверждает готовность runtime.
Carol владеет backend; Eve владеет публичными типами `apps/dpi-sdk/src/api.ts` и клиентами.
Grace проверяет границу; Heidi проверяет настоящий roundtrip. Bob и Frank используют согласованные native bindings, а не HTTP representations.

Публичный protocol2 и capability `agent-state.v1` согласованы в публикациях600/609.
Версия протокола не является версией Durable. Независимые bindings не создают второй runtime.

## Владение

Store сохраняет существующий каталог открытых sessions и блокировку data directory.
Одна запись Store содержит один session object. Только этот object владеет одним native Harness и его lifecycle.
Не создаются дополнительные runtime registry, scheduler, очередь исполнения или копия upstream state machine.

Host видит session operations с публичными данными и доверенной capability авторизации.
Host не видит Harness, Conversation, Tx, LiveDoc, WatchCall, native storage или произвольный native method.
Переименование native типов и их повторный export не создают допустимую границу.

### Owning paths D1

| Путь | Владелец и назначение |
| --- | --- |
| `apps/dpi-backend/src/durable/session.ts` | Carol: конкретные session operations; только публичные данные и server capability |
| `apps/dpi-backend/src/durable/native-session.ts` | Carol: единственный native owner, submit, receipts, observer, projection и cleanup |
| `apps/dpi-backend/src/durable/` | Carol: связанные native helpers, если они нужны реальной реализации |
| `apps/dpi-backend/src/store.ts` | Carol: каталог sessions, grants integration, session object вместо exposed Harness |
| `apps/dpi-backend/src/routes.ts` | Carol: HTTP validation/routing без native объектов |
| `apps/dpi-backend/src/streams.ts` | Carol: bounded HTTP delivery публичных frames без native observer |
| `apps/dpi-backend/src/public-projection.ts` | Carol: перенос native projection внутрь runtime; внешний путь не сохраняет native imports |
| `apps/dpi-backend/src/runtime-profile.ts` | Carol: native composition переносится внутрь runtime, не re-export под другим именем |
| `apps/dpi-backend/src/idempotency.ts` | Carol: прикладные request keys/fingerprint; native receipts принадлежат runtime |
| `apps/dpi-backend/src/errors.ts` | Carol: HTTP ошибки; распознавание native exception переносится в runtime |
| `apps/dpi-backend/src/native-profile/` | Владельцы bindings: явный узкий compatibility inventory; общий wiring пишет Carol |
| `packages/durable-reload/` | Существующий native reload owner; не второй lifecycle owner |
| `apps/dpi-sdk/src/api.ts` | Eve: единственный источник публичных DTO и observation frames |

Это список работ D1, а не blanket allowlist для DM-B.
Остальные реальные native consumers подлежат inventory; перенос всего backend в `durable/` запрещён.

## Доверенная capability

Host принимает policy decisions и проверяет HTTP authentication. Он передаёт runtime ограниченную server capability, не данные из request body.
Capability содержит действующего actor, authority/source, policy reference, revoke signal и синхронную проверку действия над точной session/conversation.
Runtime выбирает действие и передаёт в `assertCurrent` собственный sessionId и точный conversationId.
Capability проверяет совпадение target с разрешённой session/conversation. Клиент не выбирает требуемые полномочия.

Каждая операция проверяет capability перед чтением или подготовкой. После любого await операция повторяет проверку перед публикацией приватных данных.
В mutation проверка выполняется внутри native commit непосредственно перед первой разрешённой записью.
После последней проверки нельзя выполнять await перед mutation, если upstream не гарантирует эквивалентную атомарную проверку.

Пример revoke:

1. Запрос прошёл HTTP middleware и ожидает native commit.
2. Host отзывает grant.
3. Синхронная проверка внутри commit отказывает.
4. Native submission, receipt mutation и дочерняя работа не создаются.

D1 проверяет этот пример отдельной отрицательной fixture. Один HTTP precheck не закрывает критерий.
Disconnect отменяет observer или ожидание HTTP, но не является командой interrupt уже принятой работы.

## Конкретные операции

`session.ts` фиксирует точные TypeScript inputs/outputs. Публичные DTO импортируются из SDK, а не копируются из upstream.
Session ID задаёт существующий Store row. Conversation/submission/task/entry IDs остаются настоящими native IDs.

| Операция | Вход | Результат и обязательство |
| --- | --- | --- |
| `send` | capability, conversation ID, `SendMessageBody` | `SendResult`; scoped requestId, прежняя fingerprint/dedupe семантика |
| `receipt` | capability, conversation ID, requestId | публичный receipt; отсутствие записи не доказывает отсутствие принятия |
| `reconcile` | capability, conversation ID, requestId | accepted result либо атомарно сохранённый retirement fence |
| `submission` | capability, submission ID, waitMs в допустимых пределах | `SendResult`; answer не равен idle |
| `interrupt` | capability, conversation ID, background flag | `{ok:true}` после native interrupt, без второго scheduler |
| `history` | capability, conversation ID, непрозрачный cursor, bounded limit | `Page<WireEntry>` из durable transcript; cursor связан с session/conversation |
| `context` | capability, conversation ID | публичные IDs текущего model context, не transcript replacement |
| `observe` | capability, conversation ID, public docs из allowlist | безопасные state/update/end; explicit bounded cleanup |
| `configure` | capability, conversation ID, `Partial<AgentConfig>` | разрешённый `AgentConfig`; проверка внутри native mutation |
| `reload` | capability для session | `ReloadResult`; существующий prepare/commit/discard/drain, один resource owner |
| `parentState` | capability, parent ID, конкретный target | `NativeParentState`; проверка parent-only scope |
| `parentCommand` | capability, parent ID, `NativeParentCommand` | `NativeParentReceipt`; прежние control IDs и dedupe |
| `parentReceipt` | capability, parent ID, control ID | существующий receipt либо `null`; отсутствие не разрешает replay |
| `reconcileParent` | capability, parent ID | `{reconciled:true}` после действующей native reconciliation |
| `close` | доверенный lifecycle owner | завершение observer/resources и native owner; не HTTP escape hatch |

`NativeParent*` здесь — существующие прикладные DTO SDK. Они не являются экспортом Harness/Tx/LiveDoc.
Нет `execute(method,args)`, raw transaction callback или метода получения native объекта.
Остальные существующие endpoints сохраняются при D1/D3 integration через конкретные domain operations, без универсального dispatcher.

## Приём и потерянный HTTP ответ

Ключ включает actor, точную conversation и прежний requestId. Повтор с другим fingerprint получает conflict, а не новую работу.
Проверка действующей policy, native admission и запись принятия сохраняют единое атомарное решение.
Runtime не подтверждает receipt отдельно от фактического native admission.

Пример lost ACK:

1. `send` с requestId `r-1` принят; native submission получил ID41.
2. HTTP ответ потерян. Клиент сохраняет `r-1` в journal и не создаёт новый requestId.
3. `receipt` или `reconcile` возвращает тот же ID41.
4. Если lookup ещё не дал достоверного результата, journal остаётся uncertain.
5. Только reconciliation без принятия сохраняет retirement fence и возвращает `accepted:false`.
6. Запоздавший `send(r-1)` после этого fence получает conflict и не исполняется.

Lookup404, timeout, disconnect, server500 и отсутствие frame не означают `accepted:false`.
Receipt journal не очищается при stream reconnect или compaction. Unsafe tool effects нельзя повторять ради восстановления UI.

## Наблюдение и resync

Каждое подключение получает новый observation epoch и полный безопасный state.
Revision — непрозрачная строка внутри этого подключения; она не равна native task sequence, storage version или replay token.
`agent.update` содержит `baseRevision` и следующую `revision`. Producer заменяет только разрешённые публичные sections.
Native deltas применяются внутри runtime. JSON paths и private native documents не передаются Host streams или клиентам.

Пример gap:

1. Клиент получил state с revision `epoch-A:1`.
2. Он получил update с baseRevision `epoch-A:2`.
3. Клиент не применяет update и не отправляет старую команду.
4. Новое подключение получает полный state с revision `epoch-B:1`.

Очередь producer и HTTP queue ограничены. При overflow producer заканчивает stream безопасным resync outcome, не теряет updates молча.
Iterator return, request disconnect, revoke, native end и ошибка вызывают идемпотентный cleanup observer.
После revoke разрешён только безопасный end без приватного state, entry, docs или raw error.

Публичные sections: identity, history page, context IDs, execution, assistant presentation, tools, compactions, config, usage, inbox и notices.
Точные имена и формы определяет `api.ts`. Общие SDK/terminal reducer tests проверяют одну и ту же sequence.
Private provider diagnostics, secret-bearing arguments и внутренние policy documents очищаются до snapshot и update.
Запрос запрещённого document kind получает явный отказ до подключения observer; пустой snapshot не подменяет отказ.

## Answer, terminal outcome и idle

Пример: submission41 уже имеет answer entry45, но ещё выполняется background task46.
`SendResult.status` может быть `done`, а `execution.busy` остаётся `true`.
Receipt terminal status не синтезирует idle; idle определяется действительным native состоянием.

`interrupted`, `restart_limit`, `turn_limit`, `nothing_to_answer` и `storage_failed` завершают соответствующее ожидание безопасным публичным outcome.
Native report не становится текстом ответа. Неизвестный outcome не оставляет вечный pending и не разрешает replay.
D2 проверяет полный корпус конечных причин; D1 проверяет применимые interrupt/tool/answer/error outcomes.

## History и context

Пример: durable transcript содержит entries1–900; model context содержит только entries850–900.
Compaction заменяет context на summary901 и entries890–900, но не удаляет transcript1–900.
History pagination возвращает старые записи независимо от native view window.
Reset также меняет model context, а не стирает публичную историю.

Entry ID не перенумеровывается. Cursor другой conversation/session отвергается, даже если числовые entry IDs совпадают.
Ограниченная history page в observation содержит cursor для older pages; это не обещание полного transcript в каждом frame.
D2 проверяет историю длиннее native window и gap recovery после restart.

## Ошибки и version refusal

HTTP слой использует существующий `ApiErrorBody`: `{error:{code,message}}`.
Runtime переводит известные native ошибки в прикладные коды. Неизвестная ошибка получает безопасный internal/unavailable outcome и private incident ID.
Raw exception, stack, provider URL, headers, credentials и private docs не попадают в HTTP, SSE или публичный log.

Пример: native provider exception содержит секретную строку; клиент получает только `Internal error` либо безопасный operation outcome.
Private structural report содержит incident ID и статическую классификацию, но не raw exception text.
Санитизация применяется одинаково к state, update, end, history, receipt и reports.

SDK задаёт имя header через `API_VERSION_HEADER`. Protocol2 client передаёт `x-dpi-api-version: 2`.
Host отвергает отсутствующую или неподдерживаемую версию до mutation. Discovery endpoint остаётся доступным для согласования версии.

Capability `agent-state.v1` также проверяется до подключения наблюдения.
Отказ не создаёт receipt, submission, observer side effects или дочернюю задачу.
Клиент не трактует protocol2 как требование Durable2 или обновления pi-tui.

## Проверка и пределы D0

D0 проверяет type surface, прохождение публичных examples Eve и согласование producer/consumer.
D1 проверяет реальный Harness/SQLite/minimal faux profile в физически отдельном dependency closure Alice.
DM-A отдельно проверяет terminal/SDK/HTTP/PTY; DM-C использует настоящий1.4 binding только как проверочную fixture.

### Результаты D0

`session.ts` и `session.examples.ts` прошли strict typecheck с публичным SDK contract после DONE635 Eve.
SDK `api.ts` SHA256 на проверке: `c1951ef3c624a518421c1063d28c357ba0b960e40cd945041ddb0a06b5b719ee`.
Первый запуск завершился двумя TS2305 до появления receipt exports. Повтор после изменения SDK завершился с exit0.

```sh
apps/dpi-backend/node_modules/.bin/tsc --noEmit --strict \
  --module NodeNext --moduleResolution NodeNext --target ES2023 \
  --skipLibCheck --types node --typeRoots apps/dpi-backend/node_modules/@types \
  apps/dpi-backend/src/durable/session.ts \
  apps/dpi-backend/src/durable/session.examples.ts
```

Это compile/examples evidence, не исполнение настоящего runtime.
Eve отдельно опубликовала11 SDK tests PASS в physical sandbox; Carol не выдаёт их за собственный запуск.

Этот документ не закрывает runtime tests, DM-B, полный profile, installed QA, release-return или operator auth incident.
Исторические FAIL477df4a5cc274f7dbc95f34c80e17468, a82349fb8abd46eea0602c78dd46f244 и fd6ac2598301430d98429a8a44dd7873 остаются открытыми.
Production activation NOT RUN. Общие node_modules/dist, installed release, production DB и credentials не изменяются.
