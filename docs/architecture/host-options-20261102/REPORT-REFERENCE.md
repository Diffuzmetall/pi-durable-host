# Справочник кандидатов Cloudflare и AgentRun

Назначение по Diátaxis: справочник. Документ содержит факты и выводы исходной статической проверки от 2026-11-02 UTC. Новое исследование не проводилось.

[Объяснение выбора](CLOUDFLARE-AGENTRUN.md) отделено от фактов. [План экспериментов](REPORT-EXPERIMENTS.md) содержит только будущие действия, а не результаты приёмки.

## 1. Идентичность и актуальность

| Поле | pi-durable-cloudflare | AgentRun |
|---|---|---|
| Репозиторий | `earendil-works/pi-durable-cloudflare` | `Parcha-ai/agentrun` |
| Категория | Пример web-приложения и интеграции native Durable с Cloudflare | Монорепозиторий библиотек, workflow DSL и самостоятельного AgentRun Server |
| Исследуемый commit | `fc596b2422ac9fe303bd17d7b538f78c0d958810` | `e29803d75c3f028ce8c224b2fe05d381c4547f4b` |
| Стабильный выпуск | Не найден: API возвращает пустые releases и tags | Не найден: теги только beta; release `gallery` помечен prerelease |
| Версия manifest | `0.87.1`, private sample; это не стабильный release | `0.1.0-beta.28`; `packages/serve` private/held |
| Последний beta-тег | Нет | `v0.1.0-beta.28` → `d5cc8d9055636c6a8db36220b57011595e03f5c4` |
| Лицензия | MIT | Apache-2.0; учитывать NOTICE и лицензии зависимостей |
| GitHub updated_at | `2026-11-02T14:00:14Z` | `2026-11-02T20:20:22Z` при запросе |
| GitHub pushed_at | `2026-11-01T22:37:20Z` | `2026-11-02T20:25:56Z` при запросе |
| Последний исследуемый commit | 2026-10-31 16:17:36Z, обновление Cloudflare tooling | 2026-11-02 19:57:58Z, отображение latest run в console |

Стабильного тега нет у обоих кандидатов. Анализ закреплён на указанных commit, а не на изменяемом `main`. Версия beta.28 в manifest не означает совпадение `main` с beta-тегом. После выбранного beta-тега AgentRun добавил серверные возможности и исправления.

Последние изменения Cloudflare включают переход на Durable 1.4, durable sleeps, wake alarms и затем обновление tooling. Последние изменения AgentRun включают webhooks, console на `/` и исправление нескольких tool calls для Claude/Codex. Эти изменения установлены по commit API, а не по старым отчётам.

Источники метаданных: [Cloudflare repository API](https://api.github.com/repos/earendil-works/pi-durable-cloudflare), [Cloudflare tags](https://api.github.com/repos/earendil-works/pi-durable-cloudflare/tags), [AgentRun repository API](https://api.github.com/repos/Parcha-ai/agentrun), [AgentRun releases](https://api.github.com/repos/Parcha-ai/agentrun/releases), [AgentRun tags](https://api.github.com/repos/Parcha-ai/agentrun/tags?per_page=100).

## 2. pi-durable-cloudflare

### Возможности

| Область | Статус | Что установлено |
|---|---|---|
| Движок и хранение | Подтверждено исходниками | Native `Harness`, `pi-durable` 1.4.0, SQLite Durable Object |
| Владение | Подтверждено исходниками | Один `Session extends DurableObject`, внутри один Harness и несколько conversations |
| Recovery задач | Подтверждено исходниками | При открытии storage → Harness.open → восстановление subscriptions → alarm → resume |
| Будильники | Подтверждено исходниками | `onWake`, CF alarms, heartbeat 60 секунд для активной работы |
| Несколько клиентов | Подтверждено исходниками | WebSocket, snapshot/events/inbox/activity, hibernating socket attachments |
| HTTP/SSE API нашего типа | Не найдено | POST создаёт sessionId; взаимодействие с conversation идёт командами WebSocket, не `/v1` SDK |
| Повторы и ACK | Подтверждено исходниками | requestId, receipts create/fork, native submit requestId; outbox повторяет тот же объект команды |
| Долговечный клиентский journal | Не найдено | Outbox хранится в `Map`; серверные receipts не заменяют локальное сохранение намерения после закрытия клиента |
| Авторизация и rate limit | Не найдено | README предупреждает об их отсутствии. Username из URL не является подтверждённой идентификацией |
| Отмена через клиентский API | Не найдено | Команды содержат open/create/fork/submit/retry, но не cancel/abort |
| Входные изображения | Не найдено | DTO `content: string`, обязательный текст; бинарные кадры отклоняются |
| Native extensions | Подтверждено исходниками | defineExtension, registry.install, tasks/tools/sections до Harness.open |
| Обычные Pi extensions | Не найдено | Нет готового loader для `ExtensionAPI` и UI hooks |
| MCP, память нашего профиля | Не найдено | Sample регистрирует weather/schedule/history search; нашего manager и memory lifecycle нет |
| Подагенты | Подтверждено исходниками | History-search child conversation с durable ownership и повторным использованием |
| Совместимое hot-update расширений | Не найдено | Обновление worker не равно prepare/publish/drain и проверке совместимости checkpoints |
| Готовая работа на VPS | Не подтверждено | Production-путь привязан к CF API. Локальный Wrangler предназначен для разработки, а не размещения на VPS |

### Реальный поток исполнения

`POST /api/sessions` выдаёт UUID. `GET /api/sessions/:id` требует WebSocket upgrade и вызывает `env.SESSIONS.getByName(id).fetch(request)`. Session открывает Cloudflare SQLite и native Harness. Ключ объекта выбирает серверного владельца; браузер не запускает второго движка.

`prompt.submit` проходит проверку размера и структуры. Сервер добавляет display name, заранее ставит alarm и вызывает `conversation.submit({requestId, whenBusy: "followUp"})`. `command.result` содержит submissionId. Наблюдение использует `watchEvents`, snapshots и inbox.

Источники: [router, index.ts L1–34][cf-router], [open/resume, session.ts L155–241][cf-open], [admission/ACK, session.ts L442–490][cf-submit], [DTO и parser, protocol.ts][cf-protocol].

### Что здесь является durable recovery

Native storage хранит tasks, submissions и документы, а не только transcript. `resume()` продолжает восстановленную работу. Alarm будит объект после eviction. Планировщик сохраняет фазы `wait/mark/deliver`. Отправка использует стабильный `task.input.id`.

Recovery не гарантирует однократное выполнение внешних эффектов. Прерванный запрос модели может уйти повторно. Weather помечен `replay: "safe"` и не вызывает реальную внешнюю систему. Schedule/history search отдельно сохраняют intent/child/submission, чтобы повтор не создавал новую работу.

Тест `recovery.test.ts` содержит сценарии прерванной генерации и alarm для расписания. Первый проверяет статус `unanswered`, а не успешный ответ живой модели. Эта проверка не доказывает восстановление в production.

Источники: [фазы schedule.ts L214–267][cf-schedule], [replay и ScheduleIntent, tools.ts][cf-tools], [ownership child, search.ts L147–200][cf-search], [recovery.test.ts L63–170][cf-recovery].

[command-outbox.ts L1–57](https://github.com/earendil-works/pi-durable-cloudflare/blob/fc596b2422ac9fe303bd17d7b538f78c0d958810/src/client/command-outbox.ts#L1-L57) сохраняет команды только в памяти клиента. Переподключение того же клиента отличается от перезапуска самого клиента.

### Изображения: полный входной путь

Готового пути нет. WebSocket DTO принимает только текст `content`. Parser требует непустую строку. Session отклоняет бинарные кадры.

Не найдены DTO для MIME/base64/blob reference, проверка типа или размера изображения, хранение вложений и передача входного изображения модели. Поддержка изображений в самом pi-ai этот пробел не закрывает.

### Размещение и обязательная инфраструктура

Production без переделки требует Cloudflare Workers и Durable Objects с SQLite, hibernating WebSockets и alarms. Конфигурация включает binding `SESSIONS`, export `Session`, storage `sqlite`. Отдельные Redis/Postgres/R2 в конфигурации не требуются.

Наш VPS может обслуживать клиент или remote tools, но не заменяет эту инфраструктуру без переноса storage/event/wake слоя. Sample не предоставляет shell/tools нашего VPS. Для них потребуется защищённый remote executor или другой серверный runtime.

Для текущего live-профиля нужен OpenAI API key; модель в `chat.ts` фиксирована как `openai/gpt-6-luna`. Модельный каталог и credentials нашего operational profile автоматически не сохраняются.

### Команды, настройки, переменные

Команды ниже прочитаны, но не исполнены.

| Задача | Команда/настройка |
|---|---|
| Разработка | `pnpm dev` |
| Статические проверки автора | `pnpm check` |
| Тесты автора | `pnpm test` |
| Сборка | `pnpm build` |
| Авторизация deployment | `pnpm exec wrangler login` |
| Model secret | `pnpm exec wrangler secret put OPENAI_API_KEY` |
| Deployment | `pnpm deploy` |
| Node/pnpm | Node >=22.19; pnpm 11 |
| Environment | `OPENAI_API_KEY`, локально `.dev.vars`, production Worker secret |
| CF config | `SESSIONS`, `Session`, `storage: sqlite`, `compatibility_date: 2026-09-23` |

Источники: [package.json][cf-package], [wrangler.jsonc][cf-wrangler], [chat.ts][cf-chat], [README][cf-readme].

### Существенные проблемы Cloudflare

1. Нет защиты публичного model-backed API. Любой доступный клиент может пользоваться серверным ключом. Это подтверждено router и README.
2. Привязка к Cloudflare. `cloudflare:workers`, DO SQLite, socket hibernation и alarms нельзя заменить установкой Node на VPS.
3. Неполный контракт Host. Не найдены входные изображения, клиентская отмена, actor-scoped grants и долговечный клиентский journal. Нельзя заменить наш SDK только переводом названий команд.

Открытых issues на момент запроса API нет. Это не означает отсутствия дефектов.

## 3. AgentRun

### Возможности

| Область | Статус | Что установлено |
|---|---|---|
| Готовый сервер | Подтверждено исходниками | Node HTTP `/v2`, console, каталог agents/revisions/runs, container Dockerfile |
| Движок | Подтверждено исходниками | Native pi по умолчанию; отдельные harness adapters Claude/Codex |
| Зависимости версий | Подтверждено исходниками | Serve peer `pi-durable/chord >=1.1.0 <1.4.0`; это не совместимость с нашим 1.4/1.5 |
| Хранение | Подтверждено исходниками | `store.sqlite` + run directories + отдельное native-хранилище run + metadata/receipts |
| Владение процессами | Подтверждено исходниками | Server lock на data root; отдельный child process на run; owner/fence слоя disk |
| Recovery native run | Подтверждено исходниками | Recover/adopt/relaunch, открытие прежнего run directory, Harness.open и resume |
| Recovery workflow | Подтверждено исходниками | Frozen journal/checkpoints, binding и unknown-effect reconciliation seam |
| Несколько клиентов | Подтверждено исходниками | HTTP, timeline long poll и SSE; API не привязан к console |
| MCP server | Подтверждено исходниками | `/v2/mcp`: инструменты управления тем же API с Bearer |
| Наши исходящие MCP | Не найдено | MCP-маршрут не является менеджером исходящих подключений для tools агента |
| Авторизация | Подтверждено исходниками | Общий Bearer сервера, пароль owner и подписанные cookies для console |
| Actor-scoped grants | Не найдено | Сервер предназначен одному owner. Это не наши ограниченные и отзываемые parent/child права |
| Stop/cancel | Подтверждено исходниками | Stop прерывает turn, cancel завершает run; pause/resume workflow отдельно |
| Идемпотентность | Подтверждено исходниками | Необязательный Idempotency-Key, fingerprint, хранение 24 часа. Есть окно при аварийной остановке |
| Входные изображения chat API | Не найдено | agentic input/content текстовый; `file_ids` с элементами отклоняется, upload=false |
| Vision внутри workflow | Подтверждено исходниками | PDF → PNG в work → imageLoader для decision nodes; это другой входной путь |
| Native extensions и lifecycle | Подтверждено исходниками | Registry + ToolHost install/onConversation/beforeResume/beforeRelease |
| Произвольные Pi extensions | Не найдено в Serve | Закрытая таблица tools; наличие отдельного `/agentrun` Pi extension не даёт loader серверу |
| Память | Заявлено автором / частично подтверждено | Есть отдельные learn/store пакеты; наш Hindsight profile не подключён |
| Подагенты | Подтверждено исходниками для композиции workflow | Есть node runner и параллельные workflows; наш parent-control contract не найден |
| Hot-update совместимых расширений | Не найдено | Закрепление revision агента не обновляет registry с проверкой совместимости и drain |
| VPS без внешнего durable disk | Подтверждено исходниками | `run --dir`/localRun, SQLite и persistent local volume |
| Проверка запуска Docker image в этой сессии | Не проверено | Dockerfile прочитан; image не запускался и его актуальный digest не проверялся |

### Реальный поток и владельцы

Agent definition сохраняется как revision. `POST /v2/agents/:id/runs` проверяет input и runnable profile, создаёт run и запускает child process. Server вызывает `pi-durable-disk run --dir <run.dir> --app <app>`. Child открывает прежний store, registry и Harness.

`GET /runs/:id/timeline` поддерживает long poll, SSE и серверную историю. Сообщение проходит через `/runs/:id/messages`, затем через внутренний `/submit`. Отмена и наблюдение являются отдельными операциями. Отключение клиента не передаёт ему владение исполнением.

Источники: [createRun и idempotency, server.ts L430–529][ar-create], [child launch, runs.ts L873–920][ar-launch], [recover, runs.ts L702–710][ar-recover], [server-lock.ts L1–66][ar-lock], [native open/resume, run.ts L1059–1072][ar-native].

### История, перезапуск и восстановление исполнения

1. Историю сохраняют `store.sqlite`, отдельное хранилище run, timeline и adapter SessionStore.
2. Serve recover/adopt/relaunch перезапускает дочерний процесс в прежнем каталоге. Docker volume сохраняет файлы. Docker restart запускает сервер.
3. Native Harness восстанавливает задачи. Workflow recovery восстанавливает checkpoints и ledger. Эти механизмы продолжают исполнение, а не только запускают контейнер.

Путь pi использует `Harness.open`, `beforeResume`, затем `resume`. Для Claude/Codex есть отдельный SessionStore в durable conversation с fencing. Его гарантии не следует автоматически приравнивать к восстановлению native tools. Каждый адаптер harness требует проверки.

Workflow driver явно сохраняет неопределённые эффекты. Host может вызвать `reconcile`; неизвестный результат не разрешает повторить effect автоматически. Встроенные model requests после прерывания могут уйти повторно. Идемпотентность внешнего сервиса или его receipt lookup всё равно необходимы.

Источники: [durableSessions, sessions.ts L1–109][ar-sessions], [unknown/reconcile contract, driver.ts L151–190][ar-effect-contract], [реализация reconcile, driver.ts L573–612][ar-reconcile], [recovery tests][ar-recovery-tests]. Тесты recovery найдены, но не запускались.

### Потеря подтверждения: ограничение для нашей архитектуры

Serve сохраняет `.idempotency.json` после `await work()`. Во время работы ключ находится только в памяти. Сохранение может завершиться ошибкой без отказа операции. Комментарий предупреждает о потере ключа при рестарте до успешного сохранения.

Кроме того, `runs.message()` генерирует новый native messageId внутри операции. После такого прерывания повтор HTTP с прежним Idempotency-Key может получить новый native ID. Следовательно, текущая реализация не закрывает наш строгий контракт принятия, подтверждения и сверки запроса.

Это статически подтверждённое окно, но его вероятность и последствия не измерены. Нужен fault-injection между native admission и `keep()`. Слепой повтор с новым ключом запрещён; повтор со старым ключом здесь тоже нельзя считать доказанно безопасным после перезапуска.

Источники: [server.ts L430–456][ar-idempotency], [server.ts L843–856][ar-message-route], [runs.ts L1254–1281][ar-message].

### Изображения: полный входной путь

Обычный agentic input ожидает `{content: string}`. Message endpoint принимает только `content`; дополнительные поля отклоняются. При создании run непустые `file_ids` отклоняются: сервер объявляет `files.upload=false`. Поэтому готовый путь «терминал/BB/iii → проверенное изображение → durable attachment → модель» отсутствует.

Отдельный путь workflow читает серверный файл из `--documents` или work. `pdf_pages` создаёт PNG в `work/pages/...`. `imageLoader` передаёт изображения decision provider.

Этот путь не принимает произвольное клиентское вложение с изображением. Пакет `pi-vision` и инструменты screenshot не исправляют DTO chat API.

Источники: [server.ts L249–251 и L499–523][ar-file-input], [tools.ts][ar-tools], [app.ts L139–147][ar-app-images], [pdf-pages.ts][ar-pdf]. Live image flow не проверялся.

### Расширения, MCP и credentials

Native registry создаётся в `app.ts`. ToolHost предоставляет `install`, `onConversation`, `beforeResume`, `beforeRelease`. Это полезная lifecycle-граница для компонентов. Однако список tools закрыт; неизвестный tool не загружается из extension package автоматически. В Serve на этом commit нет shell tool на host.

`/v2/mcp` даёт внешнему MCP-клиенту управление AgentRun. Это противоположное направление относительно нашего MCP/CodeMode manager. Не найдены наши allowlists, Mail identity, grants и reload для исходящих серверов.

Credentials принадлежат серверу и run runtime, а не UI. Launcher передаёт секреты pipe; run получает ограниченный набор, tool child env очищается. Это полезный компонент, но не доказательство абсолютной изоляции. Для запуска `node dist/cli.js` путь отличается от штатного launcher.

Источники: [app.ts L62–139][ar-app], [tools.ts L1–80][ar-tools], [MCP endpoint, mcp.ts L271–360][ar-mcp], [secrets.ts][ar-secrets], [owner.ts L1–48][ar-owner].

### Размещение и обязательная инфраструктура

Минимальный VPS-вариант использует Node >=22.19 на 22 либо >=24.2, Serve, отдельные процессы run и локальный каталог данных. Альтернативой является один контейнер с постоянным `/data`, reverse proxy/TLS и модельным ключом. Dockerfile использует Node/Debian, пользователя `node` без root, tini и port 7340.

Не обязательны: Render, Archil, Postgres, Redis, Daytona, Modal, Browserbase, TypeSafe. LocalRun явно не монтирует Archil и не требует mount token. Это режим одной машины; shared directory с другой машины для него не поддерживается.

Опциональные зависимости зависят от функции: Browserbase нужен встроенному browser tool Serve. TypeSafe/OpenRouter или Parallel нужны соответствующим decisions. Daytona/Modal нужны соответствующим boxes. Archil нужен network-disk deployment. Пакеты могут поддерживать local browser, но встроенная Serve-композиция исследуемого commit использует Browserbase. Не следует смешивать эти уровни.

Живому агенту нужен модельный провайдер либо gateway. Hosted AgentRun не является обязательным control plane. Точная стоимость Cloudflare, Archil, Render и моделей не проверялась; численные цены README здесь не использованы.

Источники: [local-run.ts L1–35][ar-local], [runs.ts launch][ar-launch], [Dockerfile][ar-docker], [Serve README deployment][ar-readme], [browser binding, tools.ts L131–166][ar-browser].

### Команды, настройки, переменные

Команды прочитаны, но не исполнены. Для deployment следует закреплять image digest, а не изменяемый `:beta`.

| Задача | Команда/параметр |
|---|---|
| Запуск собранного сервера | `agentrun-serve --data DIR --listen 127.0.0.1 --port 7340` |
| Возможности | `GET /v2/capabilities` |
| Создать run | `POST /v2/agents/:id/runs`, `Idempotency-Key` |
| Читать исполнение | `GET /v2/runs/:id/timeline?wait_ms=5000`, либо SSE |
| Продолжить | `POST /v2/runs/:id/messages` |
| Сбросить пароль owner | `agentrun-serve reset-password --data DIR` |
| Контейнер автора | `ghcr.io/parcha-ai/agentrun-server:beta`, volume `/data`, port 7340 |
| Capacity/drain | `--max-runs`, `--drain-timeout`, по умолчанию server drain 30s, image 6s |
| Документы | `--documents DIR` |
| Code nodes | `--allow-code-nodes`, выключено по умолчанию; это не sandbox |

| Переменная | Назначение |
|---|---|
| `AGENTRUN_TOKEN` | Общий API token, не менее 32 символов |
| `AGENTRUN_PUBLIC_URL` | Публичный URL и защищённый initial setup flow |
| `AGENTRUN_ACCOUNTS` | `0` отключает password flow в пользу token link |
| `AGENT_MODEL`, `AGENT_MODEL_FAST`, `AGENT_MODEL_STRONG` | Default/tier models |
| `OPENROUTER_API_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` | Ключ выбранного provider |
| `AGENT_MODEL_BASE_URL`, `AGENT_MODEL_API_KEY` | Responses-compatible gateway |
| `AGENTRUN_MAX_RUNS` | Лимит одновременно удерживаемых run processes |
| `AGENTRUN_BOXES` | Опциональные providers boxes |
| `BROWSERBASE_API_KEY`, `BROWSERBASE_PROJECT_ID` | Встроенный browser tool Serve |
| `TYPESAFE_API_KEY`, `PARALLEL_API_KEY` | Опциональные decision providers |

Источники: [Serve README][ar-readme], [cli.ts L15–54][ar-cli], [package.json][ar-package].

### Существенные проблемы AgentRun

1. Окно при аварийной остановке после потери подтверждения: persisted key появляется после эффекта; после аварийной остановки возможен новый native messageId. Источники приведены выше.
2. Несовместимая версия и данные: Serve ограничен Pi Durable <1.4; beta.27 перестал читать agent homes beta.26. README предлагает сохранять старую версию для старых данных, а не автоматическую миграцию.
3. Полное соответствие нашему Host отсутствует. Не найдены загрузка входных изображений, менеджер исходящих MCP, наши scoped grants и compatibility reload. Это ограничения выбранной серверной композиции. Они не означают невозможность доработки библиотек.

[Открытый issue #10](https://github.com/Parcha-ai/agentrun/issues/10) отдельно предупреждает: host обязан проверить deadline admission и uncertain-effect reconciliation. Его старые test counts не являются доказательством этой сессии.

[Открытый PR #1396](https://github.com/Parcha-ai/agentrun/pull/1396) добавляет видимый marker recovery в timeline. Его отсутствие в закреплённом commit не означает отсутствия recovery; это пробел наблюдаемости. Другие открытые issues касаются Archil uploads под нагрузкой и stale sibling builds. В рамках трёх основных рисков выше они вторичны.

## Закреплённые ссылки на исходники


[cf-router]: https://github.com/earendil-works/pi-durable-cloudflare/blob/fc596b2422ac9fe303bd17d7b538f78c0d958810/src/index.ts#L1-L34

[cf-open]: https://github.com/earendil-works/pi-durable-cloudflare/blob/fc596b2422ac9fe303bd17d7b538f78c0d958810/src/session.ts#L155-L241

[cf-submit]: https://github.com/earendil-works/pi-durable-cloudflare/blob/fc596b2422ac9fe303bd17d7b538f78c0d958810/src/session.ts#L442-L490

[cf-protocol]: https://github.com/earendil-works/pi-durable-cloudflare/blob/fc596b2422ac9fe303bd17d7b538f78c0d958810/src/protocol.ts#L1-L80

[cf-schedule]: https://github.com/earendil-works/pi-durable-cloudflare/blob/fc596b2422ac9fe303bd17d7b538f78c0d958810/src/schedule.ts#L214-L267

[cf-tools]: https://github.com/earendil-works/pi-durable-cloudflare/blob/fc596b2422ac9fe303bd17d7b538f78c0d958810/src/tools.ts#L176-L200

[cf-search]: https://github.com/earendil-works/pi-durable-cloudflare/blob/fc596b2422ac9fe303bd17d7b538f78c0d958810/src/search.ts#L147-L200

[cf-recovery]: https://github.com/earendil-works/pi-durable-cloudflare/blob/fc596b2422ac9fe303bd17d7b538f78c0d958810/test/recovery.test.ts#L63-L170

[cf-package]: https://github.com/earendil-works/pi-durable-cloudflare/blob/fc596b2422ac9fe303bd17d7b538f78c0d958810/package.json#L1-L40

[cf-wrangler]: https://github.com/earendil-works/pi-durable-cloudflare/blob/fc596b2422ac9fe303bd17d7b538f78c0d958810/wrangler.jsonc#L1-L30

[cf-chat]: https://github.com/earendil-works/pi-durable-cloudflare/blob/fc596b2422ac9fe303bd17d7b538f78c0d958810/src/chat.ts#L1-L56

[cf-readme]: https://github.com/earendil-works/pi-durable-cloudflare/blob/fc596b2422ac9fe303bd17d7b538f78c0d958810/README.md

[ar-create]: https://github.com/Parcha-ai/agentrun/blob/e29803d75c3f028ce8c224b2fe05d381c4547f4b/packages/serve/src/server.ts#L430-L529

[ar-launch]: https://github.com/Parcha-ai/agentrun/blob/e29803d75c3f028ce8c224b2fe05d381c4547f4b/packages/serve/src/runs.ts#L873-L920

[ar-recover]: https://github.com/Parcha-ai/agentrun/blob/e29803d75c3f028ce8c224b2fe05d381c4547f4b/packages/serve/src/runs.ts#L702-L710

[ar-lock]: https://github.com/Parcha-ai/agentrun/blob/e29803d75c3f028ce8c224b2fe05d381c4547f4b/packages/serve/src/server-lock.ts#L1-L66

[ar-native]: https://github.com/Parcha-ai/agentrun/blob/e29803d75c3f028ce8c224b2fe05d381c4547f4b/packages/pi-durable-disk/src/run.ts#L1059-L1072

[ar-sessions]: https://github.com/Parcha-ai/agentrun/blob/e29803d75c3f028ce8c224b2fe05d381c4547f4b/packages/serve/src/sessions.ts#L1-L109

[ar-effect-contract]: https://github.com/Parcha-ai/agentrun/blob/e29803d75c3f028ce8c224b2fe05d381c4547f4b/packages/dsl/src/recovery/driver.ts#L151-L190

[ar-reconcile]: https://github.com/Parcha-ai/agentrun/blob/e29803d75c3f028ce8c224b2fe05d381c4547f4b/packages/dsl/src/recovery/driver.ts#L573-L612

[ar-recovery-tests]: https://github.com/Parcha-ai/agentrun/blob/e29803d75c3f028ce8c224b2fe05d381c4547f4b/packages/serve/test/recovery.test.mjs#L62-L110

[ar-idempotency]: https://github.com/Parcha-ai/agentrun/blob/e29803d75c3f028ce8c224b2fe05d381c4547f4b/packages/serve/src/server.ts#L430-L456

[ar-message-route]: https://github.com/Parcha-ai/agentrun/blob/e29803d75c3f028ce8c224b2fe05d381c4547f4b/packages/serve/src/server.ts#L843-L856

[ar-message]: https://github.com/Parcha-ai/agentrun/blob/e29803d75c3f028ce8c224b2fe05d381c4547f4b/packages/serve/src/runs.ts#L1254-L1281

[ar-file-input]: https://github.com/Parcha-ai/agentrun/blob/e29803d75c3f028ce8c224b2fe05d381c4547f4b/packages/serve/src/server.ts#L499-L523

[ar-tools]: https://github.com/Parcha-ai/agentrun/blob/e29803d75c3f028ce8c224b2fe05d381c4547f4b/packages/serve/src/tools.ts#L1-L80

[ar-app-images]: https://github.com/Parcha-ai/agentrun/blob/e29803d75c3f028ce8c224b2fe05d381c4547f4b/packages/serve/src/app.ts#L139-L147

[ar-pdf]: https://github.com/Parcha-ai/agentrun/blob/e29803d75c3f028ce8c224b2fe05d381c4547f4b/packages/serve/src/pdf-pages.ts

[ar-app]: https://github.com/Parcha-ai/agentrun/blob/e29803d75c3f028ce8c224b2fe05d381c4547f4b/packages/serve/src/app.ts#L62-L139

[ar-mcp]: https://github.com/Parcha-ai/agentrun/blob/e29803d75c3f028ce8c224b2fe05d381c4547f4b/packages/serve/src/mcp.ts#L271-L360

[ar-secrets]: https://github.com/Parcha-ai/agentrun/blob/e29803d75c3f028ce8c224b2fe05d381c4547f4b/packages/serve/src/secrets.ts#L1-L108

[ar-owner]: https://github.com/Parcha-ai/agentrun/blob/e29803d75c3f028ce8c224b2fe05d381c4547f4b/packages/serve/src/owner.ts#L1-L48

[ar-local]: https://github.com/Parcha-ai/agentrun/blob/e29803d75c3f028ce8c224b2fe05d381c4547f4b/packages/pi-durable-disk/src/local-run.ts#L1-L35

[ar-docker]: https://github.com/Parcha-ai/agentrun/blob/e29803d75c3f028ce8c224b2fe05d381c4547f4b/packages/serve/docker/Dockerfile#L22-L42

[ar-readme]: https://github.com/Parcha-ai/agentrun/blob/e29803d75c3f028ce8c224b2fe05d381c4547f4b/packages/serve/README.md

[ar-browser]: https://github.com/Parcha-ai/agentrun/blob/e29803d75c3f028ce8c224b2fe05d381c4547f4b/packages/serve/src/tools.ts#L131-L166

[ar-cli]: https://github.com/Parcha-ai/agentrun/blob/e29803d75c3f028ce8c224b2fe05d381c4547f4b/packages/serve/src/cli.ts#L15-L54

[ar-package]: https://github.com/Parcha-ai/agentrun/blob/e29803d75c3f028ce8c224b2fe05d381c4547f4b/packages/serve/package.json#L50-L91
