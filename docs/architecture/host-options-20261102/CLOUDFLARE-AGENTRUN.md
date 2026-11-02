# Сравнение pi-durable-cloudflare и AgentRun для нашего Host

Назначение по Diátaxis: объяснение выбора backend. Дата проверки: 2026-11-02 UTC. Метод: GitHub API, первоисточники и статический анализ закреплённых исходников.

## Рекомендация для нашей архитектуры

- Рекомендую взять отдельные решения pi-durable-cloudflare, но не приложение целиком. Полезны восстановление native задач через `Harness`, alarms, переподключение WebSocket и долговечные идентификаторы команд. Это пример приложения для Cloudflare, а не готовый защищённый Host для нашего VPS.
- Рекомендую взять компоненты AgentRun, а сервер оставить резервным вариантом. Его сервер действительно размещается на нашем VPS без обязательного Archil, Render или управляемой базы. Однако замена нашего Host потребует переноса профиля, политик, API и данных. Важен конфликт версий: сервер декларирует `pi-durable/chord >=1.1.0 <1.4.0`, наш снимок использует 1.4 и незавершённый переход на 1.5.
- Ни один кандидат не подтверждает готовую замену подключений terminal, BB и iii. Транспортные адаптеры возможны, но не переносят автоматически историю, задачи, права и lifecycle расширений.

> 🧠 **From Hindsight memory (Component map)** — память описывает terminal → SDK → общий Host и запрещает дублирование runtime в адаптерах. Для этого отчёта границу дополнительно сверил с актуальным `docs/architecture/MAP.md` в предоставленном публичном снимке.

Карта снимка `830ad61af22b1585f1358896f286acd40492c7ca` отделяет существующий Host от предложения Zero. Она также фиксирует незавершённую независимую runtime-границу. Предложение Zero в оценку реализованных возможностей не включено.

## Границы исследования

Исследование опирается на задание, MAP и `zero/EXTENSIONS.md`. Для исследования применены `research-software`, `asd-ste100-ru` и справочник ГОСТ. Выборки исходников получены через context-mode.

У исследуемых checkout нет `.codegraph`; готовый индекс для этих кандидатов не обнаружен. Индекс не создавал. Навигация выполнена по исходникам.

Зависимости не устанавливал. Код кандидатов, тесты, контейнеры, модели и серверы не запускал. Наличие теста в справочнике означает наличие проверки в исходниках, а не успешный запуск в этой сессии. Production, credentials и базы не читал. Общий проект не менял.

Поиск через `web_search` вернул нерелевантные общие страницы GitHub. Поэтому изменчивые сведения проверены через GitHub API и прямое чтение указанных пользователем первоисточников.

Подробные факты, таблицы возможностей и источники находятся в [справочнике кандидатов](REPORT-REFERENCE.md). Предложенные действия вынесены в [план проверочных экспериментов](REPORT-EXPERIMENTS.md).

## 1. Terminal, BB и iii: какие адаптеры действительно нужны

| Клиент | Cloudflare | AgentRun |
|---|---|---|
| Наш terminal | Адаптер переводит SDK-команды в протокол WebSocket и обратно, сохраняя журнал и requestId | Адаптер сопоставляет sessions/conversations с agents/runs и timeline SSE. Окно между admission и сохранением ключа требует устранения |
| BB | Требуются отдельная проекция native events и серверная идентификация с ограниченными правами | Требуются проекция run/history, bindings/CAS и ограничение прав поверх общего token |
| iii | Адаптер без UI возможен по WebSocket. Отсутствие человеческого UI нельзя заменять автоматическим подтверждением | HTTP/SSE удобнее для клиента без UI. Адаптер должен обрабатывать ask_person/input_required или явно отказывать |
| Один владелец | Durable Object/Harness остаётся владельцем | Serve/per-run Harness остаётся владельцем |
| Совместимость наших клиентов без адаптации | Не проверено. Совместимый `/v1` не найден | Не проверено. `/v2` отличается от контракта dpi-sdk |

MCP-маршрут AgentRun может помочь внешнему контроллеру управлять run. Он не должен превращать BB и iii в независимые runtime с собственной основной историей. Обоим кандидатам нужен один backend-адаптер за нашим семантическим интерфейсом, а не отдельный backend для каждого UI.

Перенос интерфейса охватывает события, DTO, запросы человека и отображение. Перенос истории требует сопоставления IDs, roles, tool calls, receipts и attachments. Перенос задач требует совместимости task/document definitions, versions, ownership, checkpoints и внешних эффектов. Эти три миграции независимы.

## 2. Что сохраняется, что теряется, что нельзя переносить автоматически

Текущие Host, SDK и клиентскую архитектуру можно сохранить без изменения runtime. Идеи жизненного цикла и восстановления применимы отдельно. Библиотеки AgentRun требуют проверки набора версий зависимостей, но не вынуждают заменять Host целиком.

При замене backend потребуется адаптация: SDK API, terminal journal/reconcile, scoped grants, parent control, BB bindings/CAS и iii signed calls. Также потребуется адаптация native MCP/CodeMode, Hindsight delivery, Goal/schedules, DeLM и hot reload. Список основан на MAP и EXTENSIONS, а не на предположении, что пакеты Zero уже существуют.

Нельзя автоматически считать переносимыми: текущие SQLite task checkpoints, extension/document IDs, незавершённые effects, provider auth sessions, child ownership и внешние receipts. Даже общий `pi-durable` не делает схемы 1.1/1.4/1.5 и host-specific definitions совместимыми.

AgentRun импортирует transcript из отдельных harness, но не продолжает imported runs через маршрут сообщений. Чтение старой беседы не равно продолжению старой задачи. `runs.ts` явно отклоняет imported run.

## 3. Цена интеграции и поддерживаемость

Cloudflare содержит небольшой пример приложения, но требует внешнюю production-платформу. Вариант на нашем VPS потребует заменить инфраструктурный слой и добавить защищённое исполнение tools. Небольшой размер примера не равен низкой общей сложности.

AgentRun Server проще разместить на VPS как самостоятельный сервер с локальными данными и дочерними процессами run. Достаточно одного сервиса или контейнера. Однако наши требования потребуют существенных изменений закрытого списка tools, grants, admission и данных. Частые изменения beta, ограничения версий Pi и несовместимое обновление storage увеличивают затраты поддержки fork.

Использование компонентов AgentRun требует наименьшей области изменений при сохранении текущего Host. Полезны frozen workflow recovery, явный контракт неопределённых эффектов, supervision/fencing для local-run и lifecycle hooks. Проверке подлежат версии и каждая выбранная граница, а не перенос всего сервера.

AgentRun DSL, recovery driver и local-run имеют программные точки интеграции без изменения исходного проекта. Отдельный пакет можно использовать после проверки совместимого набора версий зависимостей.

Настроек Serve с закрытым списком tools недостаточно для полного профиля. Потребуется собственная композиция приложения или изменение сервера. У Cloudflare доступны исходный пример и native APIs. Авторизация, tools и перенос на VPS требуют изменения приложения.

Рекомендую оставить текущий Host владельцем исполнения. У Cloudflare полезны решения для alarms, переподключения и native ownership. У AgentRun сначала требуется проверить один компонент восстановления или принятия запроса на изолированном стенде.

Сервер AgentRun остаётся резервным вариантом при допустимости отдельного продуктового профиля. Полная совместимость не подтверждена.

Память, скорость и итоговая стоимость эксплуатации не измерялись. Численные рейтинги и преимущество производительности не заявляются.

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
