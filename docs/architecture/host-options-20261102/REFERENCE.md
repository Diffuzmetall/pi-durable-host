# Справочник Ultimate и Recurse

Назначение по Diátaxis: справочник фактов, интерфейсов и ограничений исследованных версий.

Данные проверены 2026-11-02, около 20:26–20:32 UTC. Редактура не обновляет эти сведения. Статус «подтверждено исходниками» не означает проверку выполнения.

[Сравнение и рекомендация](ULTIMATE-RECURSE.md) · [Предложение проверки](CHECK-PROPOSAL.md)

SSE означает Server-Sent Events, поток событий от сервера. DTO означает Data Transfer Object, структуру передаваемых данных. MCP означает Model Context Protocol. CSRF означает подделку межсайтовых запросов. Native относится к API и состоянию Pi Durable.

## Версии и состояние проектов

| Параметр | Ultimate | Recurse |
|---|---|---|
| Репозиторий | `HazAT/ultimate` | `ebetica/recurse` |
| Категория | Локальное приложение с серверным выполнением агентов. Не библиотека | Локальное приложение с серверным выполнением агентов. Не транспортная библиотека |
| Исследуемая версия | Стабильных тегов и выпусков нет | Последний стабильный выпуск `v0.1.0`, 2026-10-28 |
| Commit | `9300a248b6706759e14fd4d6eeebd9efefc92c03` | `6e4d231e299a14f19fe6eee9d9f7f43781780c2a` |
| Лицензия | MIT | MIT |
| GitHub `updated_at` | 2026-11-02 20:14:08 UTC | 2026-10-30 20:49:41 UTC |
| GitHub `pushed_at` | 2026-11-02 20:14:04 UTC | 2026-10-28 02:39:26 UTC |
| Движок | `@earendil-works/pi-durable` 1.5.0 | `@earendil-works/pi-durable` 1.3.0 |
| Среда | Node >=26, pnpm; README требует Git >=2.54 | Bun >=1.4.0, Git |

GitHub API и локальные копии репозиториев согласуются по исследуемым commit. В неглубоком клоне Recurse `git describe --tags --exact-match` возвращает `v0.1.0`. API Ultimate на момент проверки не содержит тегов и выпусков.

Последние изменения Ultimate включают компактный поиск истории с фильтром kinds, документацию проверки провайдеров и отображение epic в боковой панели. Recurse содержит один опубликованный commit первого выпуска. Его публичная история пока не показывает регулярность сопровождения.

На момент проверки открытых issues нет у обоих проектов. У Ultimate есть открытые запросы изменений, включая исправления compaction и работы Claude Code. Это предложения, а не подтверждение принятого исправления. Автор Ultimate предупреждает о фундаментальных изменениях без миграций. Recurse не принимает запросы изменений и просит issues с воспроизводимыми примерами.

Источники: [Ultimate](https://github.com/HazAT/ultimate), [его issues](https://github.com/HazAT/ultimate/issues), [Recurse release](https://github.com/ebetica/recurse/releases/tag/v0.1.0), [его issues](https://github.com/ebetica/recurse/issues). Версии зависимостей: [Ultimate package.json](https://github.com/HazAT/ultimate/blob/9300a248b6706759e14fd4d6eeebd9efefc92c03/package.json#L24-L80), [Recurse package.json](https://github.com/ebetica/recurse/blob/6e4d231e299a14f19fe6eee9d9f7f43781780c2a/package.json#L1-L95).

## Ultimate

| Возможность | Статус | Что установлено |
|---|---|---|
| Один владелец выполнения | подтверждено исходниками | Один Harness на каталог состояния проекта, storage.lock и локальные среды исполнения Node |
| История и задачи | подтверждено исходниками | SQLite хранит native documents, tasks и submissions. `Harness.resume()` вызывается после привязки расширений |
| Восстановление внешних эффектов без дублей | заявлено автором, с ограничениями | Документация различает replay-safe tools и interrupted tools. Внешние эффекты reactor имеют семантику at-least-once, которая допускает повтор |
| Несколько клиентов | подтверждено исходниками | HTTP API, отдельные соединения и подписки SSE, серверная история |
| Входные изображения | подтверждено исходниками | JSON base64 DTO и лимиты. Image blocks передаются в native submit |
| Native расширения и reload | подтверждено исходниками | Registry.install, серверные фабрики, поэтапная замена, onOpen/onRelease/onClose/resources |
| Произвольные обычные Pi extensions | не найдено | Поддержка `export default function(pi: ExtensionAPI)` штатным загрузчиком не подтверждена |
| MCP и модели | подтверждено исходниками | ModelRuntime, общие настройки и авторизация Pi, MCP через stdio или HTTP, серверные секреты |
| Подагенты и память | подтверждено исходниками | Native-модули subagents, lineage и recall. Это не жизненный цикл нашего Hindsight |
| Наши grants, receipt/reconcile, совместимость native checkpoints | не найдено | Нет эквивалентного публичного контракта |
| Сквозная работа нашего терминала, BB и iii | не проверено | Адаптеры к кандидату не создавались |

### Выполнение и отделение интерфейса

`prepareHarness` создаёт ModelRuntime, registry и NodeExecutionEnv. При открытии он захватывает storage.lock, открывает SQLite и вызывает Harness.open. `main.ts` вызывает callbacks расширений и создаёт API до resume. Источник: [harness.ts:143–310](https://github.com/HazAT/ultimate/blob/9300a248b6706759e14fd4d6eeebd9efefc92c03/server/harness.ts#L143-L310), [main.ts:204–245](https://github.com/HazAT/ultimate/blob/9300a248b6706759e14fd4d6eeebd9efefc92c03/server/main.ts#L204-L245).

Движок восстанавливает задачи, а не только отображает историю сообщений. Однако код приложения не доказывает сохранность произвольного внешнего эффекта после аварийной остановки. [docs/durability.md](https://github.com/HazAT/ultimate/blob/9300a248b6706759e14fd4d6eeebd9efefc92c03/docs/durability.md#L1-L18) явно допускает повтор внешних эффектов.

Адаптеру доступны создание разговоров, submit/abort/configure/compact, отмена ожидающего ввода, история и модели. `/api/events` передаёт снимки состояния и операции изменений. POST подписывает поток событий на разговор и документы. Это не протокол WebSocket. WebSocket upgrade в main обслуживает Vite HMR. Источник: [api.ts:425–664](https://github.com/HazAT/ultimate/blob/9300a248b6706759e14fd4d6eeebd9efefc92c03/server/api.ts#L425-L664), [protocol.ts:1–45](https://github.com/HazAT/ultimate/blob/9300a248b6706759e14fd4d6eeebd9efefc92c03/shared/protocol.ts#L1-L45).

Нашему терминалу нужен перевод изменений потока в собственное представление состояния. BB и iii должны обращаться к тому же владельцу выполнения. Подключение этих клиентов не требует удаления веб-кода. Отделение сервера требует изменения композиции. main всегда создаёт Vite, а loadExtensions использует загрузчик модулей и watcher Vite. Источник: [main.ts:118–180](https://github.com/HazAT/ultimate/blob/9300a248b6706759e14fd4d6eeebd9efefc92c03/server/main.ts#L118-L180).

### Полный путь изображения

Клиент передаёт `{text, images:[{data,mimeType}], whenBusy?}`. Обработчик HTTP принимает до 12 MiB для submit. Сервер разрешает до четырёх изображений, каждое до 2 MiB. Допустимы PNG, JPEG, WebP и GIF. Сервер проверяет base64 регулярным выражением и обратным кодированием. Этот обработчик не проверяет сигнатуру файла и размеры растра.

Сервер создаёт блоки `type:'image'` и передаёт их в `conversation.submit`. Native submission сохраняется в SQLite. Отдельного хранилища вложений в этом пути нет. Дальнейшая передача конкретному провайдеру зависит от Pi 1.5 и выбранной модели. Доставка изображения модели при выполнении не проверялась. Источник: [api.ts:596–664](https://github.com/HazAT/ultimate/blob/9300a248b6706759e14fd4d6eeebd9efefc92c03/server/api.ts#L596-L664).

### Расширения, учётные данные и размещение

Расширения обнаруживаются в локальном клоне, `~/.ultimate/extensions` и `<project>/.ultimate/extensions`. Серверная фабрика получает ExtensionHost. Registry получает native definition. Жизненный цикл включает onOpen/onRelease/onClose и ресурсы, которые сохраняются при reload. Обычные callbacks терминального UI автоматически не переносятся. Источник: [server/extensions.ts:484–620](https://github.com/HazAT/ultimate/blob/9300a248b6706759e14fd4d6eeebd9efefc92c03/server/extensions.ts#L484-L620).

MCP создаёт один набор клиентов расширения и использует stdio или Streamable HTTP. Он поддерживает повторное подключение и закрытие. Настройки предоставляют `mcpServers`. Серверные секреты подставляются вместо placeholders. Этот механизм не сохраняет наши списки разрешённых источников и Agent Mail identity. Источник: [extensions/mcp/server.ts:192–341](https://github.com/HazAT/ultimate/blob/9300a248b6706759e14fd4d6eeebd9efefc92c03/extensions/mcp/server.ts#L192-L341).

Ultimate работает локальным процессом на VPS. HTTP слушает loopback. Каждый проект получает собственные каталог состояния и порт, а не общий каталог сессий нашего Host. SSH tunnel не требует изменения кода. Tailscale доступен отдельным расширением.

Cloudflare и внешняя БД не обязательны. Для моделей требуется доступ к провайдеру. Chromium нужен браузерным инструментам, но не транспорту HTTP.

Авторизация допускает локальный loopback origin либо зарегистрированный AccessRule с проверкой identity. Это не наши grants, ограниченные вызывающим субъектом, операциями и сессиями. Extension actions дополнительно требуют browser-origin metadata. Адаптеру нужна корректная проверка допуска запроса. Reverse proxy с bearer authentication не создаёт нужные scopes автоматически. Источник: [request-security.ts:1–75](https://github.com/HazAT/ultimate/blob/9300a248b6706759e14fd4d6eeebd9efefc92c03/server/request-security.ts#L1-L75), [api.ts:120–165](https://github.com/HazAT/ultimate/blob/9300a248b6706759e14fd4d6eeebd9efefc92c03/server/api.ts#L120-L165).

| Назначение | Команда или настройка |
|---|---|
| Установка зависимостей | `pnpm install`. Команда не выполнялась |
| CLI | `pnpm link --global`. Команда не выполнялась |
| Supervisor | `pnpm start` |
| Отдельный запуск core | `pnpm dev`. Supervisor restart tool недоступен |
| Проект | `ultimate [dir] --port N --no-open` |
| Состояние и порт | `ULTIMATE_HOME`, `ULTIMATE_PORT` |
| Проект и пользовательская конфигурация | `ULTIMATE_PROJECT`, `ULTIMATE_USER_HOME` |
| Расширения | `extensions.enable`, `extensions.disable` в настройках пользователя и проекта |
| Chromium | `ULTIMATE_CHROMIUM` |

Расширения обновляются через reload. Supervisor заменяет core при его обновлении. Этот механизм не подтверждает совместимость нашего native состояния. Базовые зависимости Pi дополнены patches. Их нельзя удалить без анализа. Источник: [docs/pi-upstream.md](https://github.com/HazAT/ultimate/blob/9300a248b6706759e14fd4d6eeebd9efefc92c03/docs/pi-upstream.md#L1-L15).

## Recurse v0.1.0

| Возможность | Статус | Что установлено |
|---|---|---|
| Серверный владелец | подтверждено исходниками | DurableHost создаёт один Harness на разговор. Побочные ветки используют родительский Harness |
| История и задачи | подтверждено исходниками | SQLite на разговор, рабочий поток SQL, follow/report/recovery перед resume |
| Восстановление процессов | подтверждено исходниками | Старые группы процессов останавливаются до resume. Тот же процесс ОС не продолжает работу |
| Несколько клиентов | подтверждено исходниками | HTTP, SSE `/events`, `/view`, серверные представления состояния и транспорт удалённого backend |
| Безопасный повтор | подтверждено исходниками, частично | Операторский `/deliver` принимает client_message_id. Native submit использует requestId |
| Входные изображения | подтверждено исходниками | Multipart upload, хранилище с owner/draft, attachment_ids, подготовка растра, native image blocks |
| Ограниченный service API | подтверждено исходниками | Bearer principals, проверка владельца и политика моделей. Message endpoint принимает только content |
| Native extensions и MCP | подтверждено исходниками | Явный registry в исходниках, MCP OAuth и пространства имён с отложенной загрузкой |
| Обычные Pi extensions и совместимый hot reload пакетов | не найдено | Универсальный загрузчик и lifecycle наших пакетов не подтверждены |
| Память и подагенты | подтверждено исходниками | Память Markdown для всех агентов, дерева и отдельного агента. Есть дерево агентов, родительские отчёты и worktrees |
| Полная миграция нашего профиля и клиентов | не проверено | Нет интеграционных проверок |

### Владельцы, восстановление и транспорт

Каждый разговор хранит native состояние в `conversations/<cid>/durable/session.sqlite`. DurableHost открывает Harness и устанавливает registry/hooks. Затем он подключает ветки и наблюдателей, обрабатывает прежние процессы и вызывает resume. Registry включает safety review, files, shells, context, MCP и codemode. Источники: [open.ts:148–239](https://github.com/ebetica/recurse/blob/6e4d231e299a14f19fe6eee9d9f7f43781780c2a/src/agents/durable/host/open.ts#L148-L239), [registry.ts:58–224](https://github.com/ebetica/recurse/blob/6e4d231e299a14f19fe6eee9d9f7f43781780c2a/src/agents/durable/host/registry.ts#L58-L224), [sqlite_worker.ts](https://github.com/ebetica/recurse/blob/6e4d231e299a14f19fe6eee9d9f7f43781780c2a/src/agents/durable/sqlite_worker.ts#L31-L117).

Процессы автоматически не продолжают работу после перезапуска. Recurse проверяет прежние группы и прекращает их перед возобновлением задач. Код отмечает возможность ухода `setsid`-процесса из-под контроля, если процесс очищает переменные среды. Этот механизм контролирует процессы, но не создаёт транзакцию внешнего API. Источник: [shells.ts:1020–1098](https://github.com/ebetica/recurse/blob/6e4d231e299a14f19fe6eee9d9f7f43781780c2a/src/extensions/core/shells/shells.ts#L1020-L1098).

Наш UI может использовать `/api/conversations/{cid}/deliver`, `/view`, `/events` и маршруты model/stop/cancel. SSE поддерживает курсор повторного подключения. Серверные зависимости маршрутов отделены от DOM. Браузер не владеет Harness. Однако API возвращает строки состояния и идентификаторы Recurse, а не dpi-sdk DTO. Источник: [conversations.ts:1184–1237](https://github.com/ebetica/recurse/blob/6e4d231e299a14f19fe6eee9d9f7f43781780c2a/src/web/conversations.ts#L1184-L1237).

Операторский `/deliver` проверяет `client_message_id`. Delivery превращает его в native requestId вида `op:<origin>:<sender>:<id>`. Submit возвращает ID после native commit. Этот путь лучше соответствует нашему контракту потери ACK, чем submit Ultimate. В просмотренном пути не найдены проверка payload fingerprint и отдельный receipt/reconcile API.

Ветка interrupt вызывает stop до повторного допуска запроса. Поведение этой ветки при повторе требует отдельной проверки. Источники: [conversations.ts:1349–1497](https://github.com/ebetica/recurse/blob/6e4d231e299a14f19fe6eee9d9f7f43781780c2a/src/web/conversations.ts#L1349-L1497), [delivery.ts:300–363](https://github.com/ebetica/recurse/blob/6e4d231e299a14f19fe6eee9d9f7f43781780c2a/src/agents/supervisor/delivery.ts#L300-L363), [send.ts:64–140](https://github.com/ebetica/recurse/blob/6e4d231e299a14f19fe6eee9d9f7f43781780c2a/src/agents/durable/host/send.ts#L64-L140).

### Полный путь изображения

1. Клиент делает multipart POST `/api/attachments`. Он передаёт файл и ровно один owner либо draft token.
2. Сервер ограничивает загрузку 25 MiB и сохраняет blob и manifest с привязкой к владельцу. Хранилище проверяет имя, размер, контрольную сумму и начальные байты растра. Клиент не назначает пути.
3. Операторский `/deliver` получает attachment_ids и проверяет доступность файлов.
4. TurnPrep разрешает owner/lifetime, формирует ссылки на дисковые файлы и блоки растра в base64.
5. `boundImages` вызывает обработчик изображений с `DEFAULT_IMAGE_LIMITS`. Draft включает images в native submission. Native история сохраняет блоки для дальнейших запросов модели.

Источники: [files.ts:513–562](https://github.com/ebetica/recurse/blob/6e4d231e299a14f19fe6eee9d9f7f43781780c2a/src/web/files.ts#L513-L562), [publish.ts:138–186](https://github.com/ebetica/recurse/blob/6e4d231e299a14f19fe6eee9d9f7f43781780c2a/src/agents/runtime/attachments/publish.ts#L138-L186), [published.ts:76–115](https://github.com/ebetica/recurse/blob/6e4d231e299a14f19fe6eee9d9f7f43781780c2a/src/agents/runtime/attachments/published.ts#L76-L115), [send.ts:30–57,142–180](https://github.com/ebetica/recurse/blob/6e4d231e299a14f19fe6eee9d9f7f43781780c2a/src/agents/durable/host/send.ts#L142-L180).

Наличие этих стадий подтверждено исходниками. Фактическое распознавание изображения провайдером не проверялось. Изображения могут пропускаться при превышении лимита объёма prompt. При ошибке обработчик исключает изображение и пишет предупреждение, а не отклоняет всё сообщение.

### Расширения, авторизация и размещение

Native extensions импортируются из `src/extensions/core` и `extra`. Это явная композиция в исходниках, а не независимая система устанавливаемых расширений. Настройки и MCP могут обновляться между циклами работы агента. Полное обновление приложения использует supervisor и перезапуск после завершения активных циклов. Сохранение совместимых native identities нашего профиля не доказано.

MCP использует конфигурацию Pi, учётные данные OAuth в `mcp-auth.json` и инструменты с загрузкой по запросу. Сервер отвечает за освобождение процессов. Реализация импортирует внутренние файлы `pi-coding-agent/dist/...`, поэтому зависит от структуры Pi 1.3. Источник: [mcp.ts:1–75](https://github.com/ebetica/recurse/blob/6e4d231e299a14f19fe6eee9d9f7f43781780c2a/src/extensions/extra/mcp/mcp.ts#L1-L75).

Авторизация различает operator cookie, local/loopback, backend key и service bearer с ограниченными полномочиями. CSRF проверяется до декодирования. Service ownership ограничивает доступ. Эта основа не эквивалентна нашим parent-only authority и grants. Service message route принимает только content. Его DTO запрещает изображения и клиентский idempotency ID.

Источник: [request_auth.ts:1–44,130–148](https://github.com/ebetica/recurse/blob/6e4d231e299a14f19fe6eee9d9f7f43781780c2a/src/web/request_auth.ts#L130-L148), [conversations.ts:1298–1348](https://github.com/ebetica/recurse/blob/6e4d231e299a14f19fe6eee9d9f7f43781780c2a/src/web/conversations.ts#L1298-L1348).

Для локального VPS нужны сервер Bun, supervisor, рабочий поток SQL, дочерние процессы инструментов и MCP, постоянные каталоги. Каждый экземпляр связан с собственным каталогом данных проекта. Удалённый backend подключает другого владельца, а не объединяет экземпляры одним планировщиком. Развёртывание контейнера предусмотрено через готовый образ. Настройки и данные требуют постоянных томов.

Modal указан как возможный удалённый backend, а не обязательная услуга. Cloudflare не обязателен.

Память использует области Markdown, а не банки и задачи Hindsight. Источник: [memory_snapshot.ts:145–171](https://github.com/ebetica/recurse/blob/6e4d231e299a14f19fe6eee9d9f7f43781780c2a/src/agents/runtime/memory_snapshot.ts#L145-L171).

| Назначение | Команда или настройка |
|---|---|
| Проект | `recurse /path/to/dir` |
| Обновление | `recurse update` |
| Один запуск без наблюдения за изменениями | `./recurse --once` |
| Готовая сборка | `./recurse --prebuilt`. Требуется явный `RECURSE_HOME` |
| Сборка frontend | `bun run build`. Команда не выполнялась |
| Адрес | `HOST=127.0.0.1`, `PORT=8787` по умолчанию |
| Данные проекта | `CHAT_DATA_DIR`; по умолчанию `<target>/.recurse-data` |
| Настройки и учётные данные | `RECURSE_HOME`. По умолчанию XDG config/recurse |
| Аутентификация service API | `RECURSE_SERVICE_TOKEN_FILE`, `RECURSE_SERVICE_PRINCIPALS_FILE` |
| Аутентификация оператора | `CHAT_AUTH_SALT`, `CHAT_AUTH_HASH` |

Источники команд и размещения: [launcher/README.md](https://github.com/ebetica/recurse/blob/6e4d231e299a14f19fe6eee9d9f7f43781780c2a/src/launcher/README.md#L1-L120), [local.ts:193–215,446](https://github.com/ebetica/recurse/blob/6e4d231e299a14f19fe6eee9d9f7f43781780c2a/src/local.ts#L193-L215), [config.ts:614–627](https://github.com/ebetica/recurse/blob/6e4d231e299a14f19fe6eee9d9f7f43781780c2a/src/config.ts#L614-L627).
