# Текущая архитектура Pi Durable Host

Срез: **2026-10-31**. Эксплуатационные числа и доказательства — в [статусе Host](host-status-2026-10-31.md). Этот документ описывает нынешний основной маршрут; [proposal от 28 октября](host-design/ARCHITECTURE.md) сохраняет обсуждение альтернатив и не является live-схемой deployment.

## 1. Назначение и основная граница

Host сохраняет существующие backend и SDK Disler, наш TUI и native authority/recovery Durable. Клиенты читают проекции и отправляют авторизованные команды; они не становятся владельцами исполнения и не открывают SQLite для управления. Pocket в этот проект не входит.

```text
                       КЛИЕНТЫ
   наш TUI / terminal     BB adapter       iii worker / engine
         │                 отложен           delegated
         └─────────────────────┬───────────────────┘
                            dpi-sdk
                               │
                loopback HTTP /v1 + SSE
                               │
                       dpi-backend
         protocol → auth/scope → routes → Store
                               │
                  server-selected runtime profile
                     native@1 composition
                               │
                     Durable Harness per session
                    admission / tasks / documents
                               │
                     session-local SQLite
```

В текущем operational deployment один Host Node-процесс держит несколько session Harness. Это не схема обязательного child process на каждую сессию. Каталог и session locks относятся к одному действующему Host PID, но native execution identity остаётся session/conversation-scoped.

Часть capabilities предусматривает BB/iii transport, однако наличие этих capabilities не означает текущую готовность соответствующего клиента. Сейчас основной рабочий путь — **наш терминал → SDK → Host → Durable**.

## 2. Карта пакетов

| Часть | Ответственность | Основные пути |
|---|---|---|
| Backend / Store | Каталог sessions, lifecycle, single owner, protocol/API, авторизованные проекции | `apps/dpi-backend/src/store.ts`, `runtime-profile.ts`, `routes.ts`, `streams.ts` |
| Policy/admission | Проверка grant, scope, actor identity, request fingerprint, durable receipt | backend `grants.ts`, `auth.ts`, `idempotency.ts`, `native-profile/admission/` |
| Native composition | Связывает registry, tools, providers, guards и session-local integrations | `apps/dpi-backend/src/native-profile/profile.ts` |
| SDK | Wire types, capability gates, client, SSE reader/reducers, receipt lookup | `apps/dpi-sdk/src/api.ts`, `client.ts`, `transcript.ts` и reducers |
| Наш terminal adapter | Remote controller, TUI, drafts/cache, отправка и reconnect | `apps/terminal-adapter/src/` |
| Shared reload | Stage/validate/publish models и trusted adapters на существующем Harness | `packages/durable-reload/src/` |
| BB adapter | BB protocol, thread/native binding и history/outcome mapping | `apps/bb-adapter/` — код есть, live milestone отложен |
| iii adapter | Delegated credentials, подписанные события/результаты, связывание work с native identity | `apps/iii-adapter/`, backend `native-profile/iii/` |
| Operational composition | Private config, provider cache overlay, Nico, startup/readiness и deployment wiring | `experiments/sdk-host-cutover/`, `experiments/host-activation-20261031-terra8/` |
| Release repair/activation | Сборка и sealing согласованного release, guarded cutover и probes | `experiments/host-sse-mcp140-20261031/` |
| Upstream reference clients | Старый network hub, `dpi-tui`, demo и ops tooling | Остальные `apps/`, `just/`, `ai_docs/` |

Некоторые operational scripts пока machine-specific: они используют существующие sealed base releases и private bindings. Публикация исходников не означает наличие универсального installer для чистой машины. Production entrypoint — собранный operational service, а не автоматически generic CLI с minimal profile.

## 3. Серверная composition native@1

`createNativeProfile` создаёт session-local registry и связывает его с существующим Harness. В composition входят:

- coding/native tools и native CodeMode boundary;
- provider/model catalogue с точными provider/model references;
- skills discovery, context и external-directory adaptation;
- DCG/guard boundaries и scoped admission;
- native automation, Goals, schedules/triggers, parent control/subagents;
- session-local memory и tracing;
- native BB/iii ports;
- MCP sources, которыми владеет session Nico manager.

Обычные Pi extensions с process-global настройками не объявляются совместимыми автоматически. Нужны adapter contract, корректный lifecycle и проверка isolation. Нельзя обходить отсутствующую возможность запуском legacy/local owner из клиента.

## 4. Данные и authority

| Ресурс | Владелец | Не является владельцем |
|---|---|---|
| Catalog/shared app state | Backend Store | Терминальное окно |
| Session history, tasks, documents, native receipts | Durable session owner | SDK reducer, BB thread или iii event |
| Provider credentials и policy configuration | Серверная private configuration | Browser/UI и HTTP body клиента |
| Client draft/cache/scroll/reconnect state | Соответствующий клиент | Native checkpoint queue |
| Immutable release и fingerprints | Release preparation/sealing | Произвольный hot patch установленного дерева |

Session storage принадлежит одному действующему owner. Stale lock — причина диагностировать прежнего владельца, а не разрешение безусловно удалить файл. Новый owner не должен открываться параллельно с живым старым. Profile/model mismatch отклоняется, а не исправляется молчаливой заменой model ID.

## 5. Путь команды и потери ACK

1. SDK проверяет protocol и требуемую capability.
2. Host аутентифицирует credential, устанавливает actor/authority и проверяет scope.
3. Owning admission проверяет актуальность прав и request fingerprint перед принятием.
4. Durable сохраняет native identity и состояние; receipt не равен результату исполнения.
5. SDK получает receipt либо явно неопределённый результат доставки. При lost ACK reconciliation использует тот же request ID и прежний результат, а не новую команду.
6. Клиент отображает execution state отдельно от connection state.

Unsafe внешний эффект после сбоя может оставаться uncertain. Durable checkpointing и HTTP dedupe не превращают произвольный внешний API в exactly-once операцию. Клиент не пересылает платёж, deploy или prompt автоматически только потому, что не получил ответ.

## 6. SSE и документы

Поток выдаёт начальное состояние и дальнейшие изменения/документы. Reconnect начинает новую projection со snapshot, а не выдаёт клиенту владение журналом задач. Подписка связана с проверкой прав и закрывается при потере доступа/соединения.

В `apps/dpi-backend/src/streams.ts` initial snapshot теперь дожидается `drain` или `close` перед следующими документами. Обычный slow-viewer backlog guard остаётся включён: он закрывает отстающий viewer, а не session owner.

Поэтому проверка потока имеет три разных результата: пришёл snapshot; после него пришли запрошенные документы на том же соединении; обычный медленный viewer по-прежнему отсоединяется. HTTP 200 не заменяет эти проверки.

## 7. Модели и внешние сервисы

Operational model catalogue объединяет built-ins с допустимым более новым provider-owned cache и отдельными providers. Это не копирование любого пользовательского model ID в чужой provider. Cache overlay был проверен offline, с сохранением точных saved selections.

MCP connections создаются для session composition. Nico управляет transport; native bridge контролирует регистрацию/schema/replay/authority и предоставляет CodeMode/direct tools согласно принятому catalogue. Global/adapter/project configuration и существующие credentials читаются на сервере. MCP inventory и runtime state не публикуются вместе с токенами.

Наличие tool name в registry — только один слой готовности. Другие слои: подключение сервера, доступность credential, права на конкретную операцию и её фактический результат. Из-за этого partial MCP inventory после restart записывается отдельно от data/native parity.

## 8. Reload — что он делает и чего не делает

`packages/durable-reload/src/index.ts` проверяет idle/identity, готовит candidate models/adapters, проверяет сохранённые model selections и синхронно публикует согласованный registry. Backend/SDK предлагают это через versioned capability gates. Новый Harness ради reload не создаётся.

Однако `native-profile/profile.ts` подключает MCP при создании composition, а `prepareReload` работает с adapter registry. Это **не reconnect API для frozen MCP sources**, не импорт arbitrary server-selected путей из запроса и не универсальная перезагрузка любого Pi plugin.

## 9. Запуск, shutdown и release

Operational service проверяет private config и human owner, существующие locks, создаёт models/profile/Store, поднимает loopback HTTP и только после готовности сообщает systemd readiness. Сигнал shutdown во время открытия Store не должен публиковать ложную готовность и оставлять владение бесконтрольно.

Release состоит не только из исходников: есть installed packages, compiled bindings и package archives. Исправление обязано присутствовать в той форме, из которой будет сделана следующая сборка; подробнее в [compound learning](solutions/workflow-issues/sealed-host-release-must-include-package-archives.md).

Смена entrypoint, backup и rollback — отдельные разрешённые операции. Commit/push исходников сам по себе не запускает новый release и не даёт разрешения трогать live databases.

## 10. Что намеренно не добавлено

- Второй task runtime в каждом frontend.
- Общий HTTP endpoint для произвольного вызова Harness или tools в обход native authority.
- Browser-selected пути к SQLite/profile/module.
- Молчаливая подмена модели и automatic legacy fallback.
- Признание BB/iii/MCP готовыми по одной компиляции или объявленной capability.
- Новая migration/import машина состояний вместо native recovery.

## Документы

- [Статус и текущие ограничения](host-status-2026-10-31.md).
- [ISA](../ISA.md) и [план](host-design/PLAN.md).
- [Общий словарь](../CONCEPTS.md).
- [Backend API](../apps/dpi-backend/API.md), [native profile](../apps/dpi-backend/NATIVE.md).
- [SDK](../apps/dpi-sdk/README.md), [терминал](../apps/terminal-adapter/README.md).

> Hindsight **Component map** использован для поиска owning boundaries, затем они сверены с текущими source modules. Исторические claims о приёмке из памяти не являются доказательством текущей доступности интеграций.
