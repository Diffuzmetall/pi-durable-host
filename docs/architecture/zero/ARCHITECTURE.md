# ARCHITECTURE — Zero как неизменённая библиотечная основа

Статус: **рекомендуемая целевая архитектура, не реализованный runtime**. Основание: [OBSERVE](OBSERVE.md), выбор и оговорка о библиотечной композиции: [THINK](THINK.md).

## 1. Решение в одном абзаце

Сохраняем наш Host, SDK и терминал. Native-интеграцию выделяем в `@dpi/runtime-zero`, capability-код — в отдельные packages. Интеграция использует публичные компоненты Zero и квалифицированный Pi Durable, но Zero не меняет. Для полного профиля композиция принадлежит нашему пакету: она устанавливает политики и связывает сервисы до native resume. Клиенты не знают, каким образом собран runtime.

Имена `@dpi/*` здесь — проектные обозначения, не существующие опубликованные npm-пакеты и не утверждение о владении npm scope.

## 2. Компоненты и направление зависимостей

```text
 dpi-terminal-adapter     dpi-bb-adapter      dpi-iii-adapter
         │                     │                   │
         └─────────────────────┼───────────────────┘
                               ▼
                            dpi-sdk
                   публичные DTO / HTTP / SSE
                               │
                               ▼
                         dpi-backend
             authentication · grants · session catalog
                               │
                    semantic session contract
                               ▼
                       @dpi/runtime-zero
           admission · projection · lifecycle · reload
                  │                         │
       @dpi/profile-personal                │
         │                                  │
         ├─ @dpi/extension-tools             │
         ├─ @dpi/extension-mcp               │
         ├─ @dpi/extension-memory            │
         ├─ @dpi/extension-automation        │
         └─ существующий DeLM package        │
                  │                         │
                  └──────────┬──────────────┘
                             ▼
              публичные компоненты durable-zero
                   + native Pi Durable SDK
                             │
                    один Harness на session
                             │
                   SQLite · native scheduler
```

Диаграмма показывает зависимости/композицию, не обязательный отдельный слой вызова для каждого сообщения. Profile выбирается на сервере; capability packages не импортируют backend, SDK или терминал.

Native bindings могут зависеть от Pi Durable. Прикладные алгоритмы пакетов не должны зависеть от Zero types, HTTP, BB thread IDs или terminal widgets. Не выделяем дополнительные `*-domain` packages без реального второго потребителя: достаточно внутренних файлов и package exports.

## 3. Что используем из Zero

| Exported capability | Использование | Граница |
|---|---|---|
| `BuiltinExtensionRegistry` и `BuiltinExtension` | Подключение package definitions и упорядоченный teardown | Не считать полным session lifecycle |
| `adaptExtensionTool`, `installExtensionTools` | Адаптация выбранных обычных Pi tools | Проверить guards, schemas, cancellation и structured output |
| `createNestedToolExecutor` | Возможный reuse nested dispatch | Не выпускать, пока direct/nested не проходят одинаковые policy checks |
| `createPiPrompt`, dynamic sections/namespaces | Подходящие части prompt/discovery composition | Не перезаписывать наши context/memory policies |
| `mountExtensionBridge` | Только для пакетов, совместимых с его startup/context поведением | Он создаёт собственный runner и рано испускает session_start; не считать его полным bridge для любого extension |
| `ViewStreamProjector` и projection helpers | Внутренняя обработка подходящих представлений | Публичный wire остаётся нашим; privacy проверяется отдельно |
| `openDurable({builtins})` | Минимальная feasibility-ветвь B | Не использовать вместе с собственным Harness; полный профиль пока блокирован |
| `DurableEngine` | Узкий пользовательский facade Zero | Не расширять его возможности заявлениями о чужих options |

Не брать stock subagent/CodeMode/MCP автоматически поверх наших владельцев. Компонент переиспользуется только если его semantics совпадают с нужным контрактом. Наличие export не обязывает импортировать всё.

Собственный bootstrap не должен превращаться в скопированный `runtime-loader.ts`. Используем существующую profile/lifecycle композицию Host и native API. Если без копии Zero internals интеграция не получается, это явный stop condition, а не повод добавить source fork под видом package.

## 4. Единственный владелец и процессы

Логически один Host обслуживает несколько клиентов и сессий. Одна session имеет один Harness, один native scheduler и один владеющий Storage lifecycle.

Для начальной проверки допустима одна сессия в одном Host-процессе. Для многосессионного полного профиля рекомендуемая проверяемая конфигурация — отдельный worker на активную сессию, пока не доказана безопасная композиция всех process-global компонентов.

```text
Host service
  ├─ HTTP/SSE + auth + catalog
  ├─ session A worker → runtime-zero → один Harness → A.sqlite
  └─ session B worker → runtime-zero → один Harness → B.sqlite

Terminal / BB / iii → Host service, а не напрямую в SQLite/worker
```

Причина — конкретный module-global sandbox штатного CodeMode Zero и environment/config globals, не желание сделать микросервисы. Worker не является новым агентом, внешним daemon или вторым scheduler. Native tasks по-прежнему планирует Pi Durable.

Не вводить произвольную RPC-шину: внутренний канал обслуживает существующие semantic session operations. Наличие готового reuse-пути процесса/IPC в Host необходимо подтвердить при реализации; сам этот исследовательский пакет его не создаёт.

Закрытие терминала снимает подписку, не закрывает session worker. Перезапуск worker — отдельная lifecycle-операция; safety lease/lock должен запрещать двум владельцам открыть одну session. Socket pathname или наличие файла не являются доказательством эксклюзивности.

## 5. Запуск полного профиля

Ниже — целевой порядок внешней композиции C, **не существующий callback API Zero**:

1. Host разрешает session identity, рабочий каталог и профиль по trusted configuration. Клиент не задаёт import path или runtime credentials.
2. Runtime integration проверяет package tuple, dependency/definition compatibility и единственного owner. Неизвестное состояние отказывает до resume.
3. Profile создаёт session-local instances пакетов с явными policy/config/directory inputs.
4. Их definitions устанавливаются в один native registry. Один владелец назначается каждому subagent/CodeMode/MCP transport.
5. Integration открывает один Storage/Harness с защищённым env и нужным native authorization fence.
6. Memory, automation, tracing и прочие stateful services связываются с этим Harness и исходным Storage.
7. Подключаются наблюдение, безопасная проекция и error/cleanup ownership.
8. Только после успешных обязательных bindings выполняется native resume; session становится ready.

При ошибке до ready не допускается частично работающий профиль. Cleanup закрывает уже созданные ресурсы в обратном порядке; ошибка cleanup не скрывает исходную ошибку. Клиент получает безопасную структурированную ошибку без paths/credentials/stack.

В B пункты 5–8 выполняет Zero, а нужного внешнего pre-resume bind нет. Поэтому B нельзя объявлять реализацией этого порядка.

## 6. Внутренний контракт Host → runtime integration

Основа — уже существующий `apps/dpi-backend/src/durable/session.ts`, а не новый универсальный `execute(method,args)`:

- send, receipt, reconcile, submission outcome;
- interrupt;
- history/context/observe;
- configure и reload;
- parent state/command/receipt/reconcile;
- close владельца.

Передаётся ограниченный доступ/identity, а не HTTP request и не сырой bearer token. Native Harness, Storage, Registry, Tx, WatchCall и private documents остаются внутри integration/native packages.

Стабильный requestId связывается с actor, payload и session/conversation. Lost ACK проверяется через receipt/reconcile; отказ клиента не превращается в автоматический replay. Результат обработки команды и результат работы агента — разные состояния.

`prompt(): Promise<void>` Zero не используется как единственное доказательство admission. Если конкретную операцию невозможно безопасно выразить через публичный native API и согласованный authorization hook, она остаётся unavailable, а не получает ослабленный путь.

## 7. Как работают будущие BB и iii

### Общая часть

Оба адаптера используют `dpi-sdk` и те же session/conversation IDs, public state, history и receipts. Они не устанавливают runtime extensions, не выбирают native models напрямую и не открывают session DB.

Handshake/capabilities описывает реально доступные операции и UI-возможности. Номер Host API независим от версии Zero. Unsupported mutation отвергается до side effects; capability metadata не является выдачей полномочий.

### BB

BB adapter отображает thread/turn в существующие server-side session/conversation bindings. Повторный turn сохраняет request identity; child/parent control проходит серверную проверку. Проекции BB не становятся источником истины для native outcomes.

Отключение BB означает detach, не abort. UI-only функциональность отображается доступными BB средствами; отсутствие renderer не разрешает выполнить произвольную функцию из server extension в browser.

### iii

iii adapter получает delegated identity, ограниченные инструменты и политику admission. Он не становится человеком, владельцем всех sessions или authority для human-only Goal approval. Результат связывается с устойчивой submission/answer identity.

Headless клиент не отвечает автоматически «да» на interactive confirmation. Для обязательного человеческого решения требуется допущенный интерактивный канал; иначе операция возвращает явное ожидание/недоступность без выполнения защищённого действия.

### Порядок

Сначала terminal end-to-end. BB и iii — отдельные потребительские проверки того же API, не новые ветки runtime. Не запускать их реализации до готовности общих semantics первого среза.

## 8. UI наших расширений без изменений Zero

Разделить три вещи:

1. **Серверная логика** расширения: tools/hooks/native state.
2. **Сериализуемые UI-запросы**: выбор, ввод, уведомление, статус.
3. **Клиентское отображение**: terminal widgets или BB presentation.

Для наших адаптируемых пакетов profile может передать узкие функции `notify`, `requestInput`, `requestConfirmation`. Это обычные dependency parameters конкретных пакетов, не обязательный новый SDK для всех extensions. Host маршрутизирует requests к авторизованному клиенту.

Каждый запрос имеет session/conversation, request identity и допустимый тип ответа. Ответ от другого клиента или после отмены не принимается. Повторные ответы не повторяют действие. При reconnect восстанавливаем pending UI request, а не заново запускаем инструмент.

`ctx.ui.custom(renderFunction)` не пересылается. Для действительно нужного custom renderer выделяется локальный terminal companion entrypoint; серверная бизнес-логика повторно не загружается. Для других клиентов — явная доступная проекция или unsupported, без скрытого исполнения server code.

Прозрачная поддержка произвольных сторонних Pi UI extensions на stock Zero не заявляется. Внешняя композиция может использовать штатный Pi ExtensionRunner напрямую, если требуемое bind-before-start не обеспечивается Zero bridge; это отдельная compatibility работа, а не обещание нулевой адаптации.

## 9. Reload и обновления

Три независимые операции:

| Изменение | Владелец | Смысл |
|---|---|---|
| Terminal/BB/iii renderer | Клиентский пакет | Переподключение без нового runtime |
| Совместимый extension/provider | Runtime integration + package owner | Prepare/validate/publish/discard/drain в прежней session |
| Zero/native SDK/definition schema | Release qualification | Новый closure и проверка state compatibility; не обычный `/reload` |

Существующий `packages/durable-reload` — исходная реализация, не повод написать вторую. Extension factory хранит mutable runtime state в session-local instance, а не module globals. При hot replacement принятая работа сохраняет правильный owner/generation; новые вызовы используют опубликованный dispatch.

Memory delivery kernel и durable task identities не заменяются автоматически вместе с обычным инструментом. Провал drain после publication не превращает applied в rollback. Внешние эффекты не объявляются exactly-once только потому, что SQLite транзакционна.

В stock `openDurable()` полный lifecycle reload ещё не доступен нашему caller. Вариант C предоставляет нужные handles через собственную композицию; корректность остаётся предметом реальных тестов.

## 10. Поставка без скрытого форка

- Zero закреплён по версии/commit и integrity; source/dist bytes не редактируются.
- Никаких absolute imports в `durable-zero/src`, loader aliases, patched postinstall или обращения к private fields.
- Native bindings имеют явные совместимые peer dependencies. Package manager должен дать согласованный native closure; независимые packages не должны незаметно загрузить две версии native definitions/SDK.
- Существующий native authorization patch, если нужен, отражается отдельно в manifest. Не выдавать такой closure за полностью stock. Его перенос в новый closure не выполнен и не разрешён самим этим документом.
- Minimal Host не требует Hindsight/DeLM/BB/iii или авторского HOME. Personal profile устанавливается отдельно.
- Сохраняются MIT notices, vendor provenance и лицензии перенесённых компонентов.
- Runtime config/credentials разрешаются сервером. Они не входят в public DTO, fixtures или npm archive.

## 11. Первый проверяемый срез

Это последовательность будущей реализации, не новая DeLM-доска:

**Z0 — contract feasibility.** На immutable Zero проверить публичные exports, упаковку, native package registration и точный bootstrap. Отдельно проверить pre-resume, env и commit fence. Для B выявленные blockers должны быть воспроизведены/закрыты; для C исключить копирование bootstrap/private imports.

**Z1 — terminal vertical slice.** Реальные terminal PTY → SDK → Host → выбранная единственная runtime composition → native SQLite → tool → answer → detach/reconnect. Использовать disposable sessions, faux provider и физическую изоляцию. Проверить lost ACK, scope denial, revoke и sanitizer сразу, а не после UI demo.

**Z2 — packages и восстановление.** Подключить один простой tools package и один настоящий stateful native package. Проверить reopen, два разных session instances, cleanup и отсутствие повторных side effects. Затем memory/MCP, automation и DeLM по матрице EXTENSIONS.

**Z3 — extension UI и reload.** Реальный input/confirmation roundtrip, disconnect/duplicate reply, busy replacement, rejected preparation, applied+drain-failed, возврат совместимой версии. Не подменять их no-op UI или restart.

**Z4 — потребители.** Один и тот же SDK/Host contract подключает BB и iii. Их install не включает execution engine. Проверить разницу human/delegated и сохранение same-session identity.

**Z5 — общая приёмка.** Один package tuple/digest, clean install, offline/native tests, PTY, fixed-client compatibility и независимые review/QA. Исторические production gates не закрываются автоматически.

## 12. Проверяемые критерии исследования и реализации

| Проверка | Что покажет правильный результат | Текущее состояние |
|---|---|---|
| Zero immutable | Source/dist integrity неизменна; нет patch/deep import | Исследованный checkout чистый; product integration не существует |
| External registration | Реальный пакет ставит native definitions через public export | SOURCE подтверждён; registry unit tests 3 PASS; full native NOT RUN |
| Lifecycle | Ни один restored task не исполняется до обязательного bind | Для stock openDurable обнаружено несовпадение; C NOT RUN |
| Native authorization/env | Revoke после await не допускает commit; unsafe tools блокируются direct/nested | Предыдущий native REPORT; новый Zero closure NOT RUN |
| Package independence | Чистая установка и declarations не тянут private Host/Zero internals | NOT RUN |
| Single owner | Один Harness/Storage owner, безопасный concurrent attach | NOT RUN |
| Terminal | Ответ, инструмент, история и reconnect на реальном PTY | NOT RUN |
| Memory/DeLM | State identities, delivery/wake/dedupe и reload сохраняются | Старые component reports; Zero integration NOT RUN |
| BB/iii | Тот же Host/SDK, нет второго runtime, права сохранены | Спроектировано; NOT RUN |
| UI | Нет автоматического согласия и replay после reconnect | Спроектировано; NOT RUN |

Матрица сохраняет смысл DM-A–DM-G/ISC-79–85. Это не новые закрытые ISA criteria и не изменение historical evidence.

## 13. Итог

Отдельные пакеты и неизменённый Zero совместимы как архитектурное направление. Полный текущий Host требует либо внешней композиции C, либо дополнительных поддержанных возможностей готового owner Zero, которых исследованный API не предоставляет.

До реализации нужно принять именно границу bootstrap; не нужно повторно выбирать терминал, права, сохранение истории или поддержку будущих клиентов — эти требования уже заданы.
