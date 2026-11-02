# Изменения относительно Disler

[Оглавление](README.md) · [Карта исходников](MAP.md) · [Изображения и HTTP](IMAGES-AND-HTTP.md) · [Вариант Zero](zero/README.md)

Этот справочник сравнивает baseline Disler `37165c619573dbaf425463038bbffecfe576beec` и опубликованный снимок нашего fork `830ad61af22b1585f1358896f286acd40492c7ca`. Он перечисляет области изменений, но не заменяет полный журнал коммитов. Наличие функции в снимке не означает её активацию.

## 1. Унаследованные компоненты

Baseline содержал Express backend, HTTP и SSE. В `main.ts` Express монтировал `/v1` с bearer auth и JSON-лимитом `256kb`. В нашем коде сервер собирается в [`http-server.ts`](../../apps/dpi-backend/src/http-server.ts). Express и лимит сохранены.

Store, каталог сессий, native Harness и session storage сохраняют прежних владельцев. Zero их не заменяет. Store вырос и остаётся тесно связан с native API.

SDK и описание сообщений также унаследованы. Baseline содержал `WireImage` в наблюдаемых сообщениях, но `SendMessageBody.content` был строкой. Наш публичный путь отправки сохраняет это ограничение.

Исходные examples/addons/jobs сохранены и отделены от минимального профиля. Основная серверная композиция не сводится к запуску demo.

Сравнение опирается на исходные версии:

- [старый main.ts](https://github.com/disler/durable-pi/blob/37165c619573dbaf425463038bbffecfe576beec/apps/dpi-backend/src/main.ts);
- [старый Store](https://github.com/disler/durable-pi/blob/37165c619573dbaf425463038bbffecfe576beec/apps/dpi-backend/src/store.ts);
- [старый SDK API](https://github.com/disler/durable-pi/blob/37165c619573dbaf425463038bbffecfe576beec/apps/dpi-sdk/src/api.ts);
- [старый manifest](https://github.com/disler/durable-pi/blob/37165c619573dbaf425463038bbffecfe576beec/apps/dpi-backend/package.json).

Native-зависимости baseline имели версию 1.0.3. Основной manifest нашего снимка задаёт 1.4.0.

## 2. Изменения Host без патчей npm-зависимостей

| Область | Добавления и развитие | Основные пути |
|---|---|---|
| Runtime composition | Minimal/playground, полный native profile и доверенный operational bootstrap | [`runtime-profile.ts`](../../apps/dpi-backend/src/runtime-profile.ts), [`native-profile/profile.ts`](../../apps/dpi-backend/src/native-profile/profile.ts), [`sdk-host-cutover`](../../experiments/sdk-host-cutover) |
| Admission и полномочия | Grants, actor, scope, authority, операторские и делегированные действия, receipt и reconcile | [`auth.ts`](../../apps/dpi-backend/src/auth.ts), [`store.ts`](../../apps/dpi-backend/src/store.ts), [`admission`](../../apps/dpi-backend/src/native-profile/admission) |
| Клиентский контракт | API version 2, capabilities, проверка и проекция observation, устойчивое разрешение неопределённой отправки | [`dpi-sdk/src`](../../apps/dpi-sdk/src), [`submission-journal.ts`](../../apps/terminal-adapter/src/submission-journal.ts) |
| Основной терминал | Новый terminal-adapter с UI, remote controller и операциями моделей, skills и конфигурации | [`terminal-adapter`](../../apps/terminal-adapter) |
| Серверные возможности | Tools, Codex, Antigravity, web, Context7, MCP, models, skills, memory, tracing, Goal, schedules и subagents | [`native-profile`](../../apps/dpi-backend/src/native-profile) |
| Reload | Совместимое обновление registry и ресурсов с prepare, publish, drain и lifecycle | [`durable-reload`](../../packages/durable-reload) |
| Внешние клиенты | iii-адаптер и подготовленные, но отложенные BB-пути | [`iii-adapter`](../../apps/iii-adapter), [`bb-adapter`](../../apps/bb-adapter) |
| Новая native-граница | Contract и частичная реализация семантических операций сессии | [`src/durable`](../../apps/dpi-backend/src/durable), [DM1](../host-design/hot-update/DURABLE-MODULE-PLAN.md). Работа не завершена |

Рядом с перенесёнными реализациями находятся `NOTICE.md` и `SOURCE.json`. Hindsight vendor содержит [`PROVENANCE.md`](../../apps/dpi-backend/src/native-profile/memory/hindsight/vendor/PROVENANCE.md). Эти документы фиксируют происхождение компонентов. Нельзя считать весь код native-profile написанным с нуля.

## 3. Патчи и адаптации зависимостей

Patch-файл подтверждает, что адаптация сохранена в репозитории. Он не доказывает применение патча в установленном процессе или во всех локальных node_modules.

| Артефакт | Адаптация | Граница доказательства |
|---|---|---|
| [`patch-commit-authorization.mjs`](../../experiments/durable-module-20261102/runtime/patch-commit-authorization.mjs) и [обоснование](../../experiments/durable-module-20261102/runtime/COMMIT-AUTHORIZATION.md) | Native Durable 1.5, commit authorization с revision `host-commit-authorization-v1` | Требуется новому `native-session.ts`. Это не stock 1.5. Это компонентный кандидат, а не принятый Host |
| [`mcp-source`](../../experiments/hot-update-20261101/mcp-source) | `manager.patch`, `observer.patch`, `manager-before-observer.patch`, `host-managed.patch` для MCP hot-update и ownership | Воспроизводимые адаптации и эксперименты; наличие файлов не доказывает установку всех четырёх |
| [`GipPity worklet-patch.mjs`](../../experiments/gippity-voice/worklet-patch.mjs) | Два release bundle 0.10.0, same-origin AudioWorklet и ограниченное ожидание короткого audio-фрагмента | Узкая сторонняя адаптация. [README](../../experiments/gippity-voice/README.md) содержит датированную operational-историю. Совместимость с целевой 1.5 здесь не принята |
| [`operational-profile.mjs`](../../experiments/sdk-host-cutover/operational-profile.mjs) и [`session-mcp.mjs`](../../experiments/sdk-host-cutover/session-mcp.mjs) | Наш связующий код для trusted config, native extensions, session MCP, моделей и capabilities | Внешняя композиция, а не изменение Durable. Часть bindings собирается отдельно |
| [`target-manifests`](../../experiments/durable-module-20261102/packaging/target-manifests) | Отдельный набор зависимостей кандидата 1.5 | Manifest не равен собранному и принятому релизу. Основные manifests сохраняют 1.4 |

Профиль поверх public API, изменённый upstream package и будущий пакет расширений относятся к разным категориям. Для переноса каждой категории на Zero нужен отдельный способ подключения. Переименование каталогов эти различия не устраняет.

## 4. Нерешённые ограничения

Публичный SDK/HTTP-путь не принимает входные image blocks. Он сохраняет `content: string` и серверную проверку строки. Image tools и wire-history не заменяют attachment API.

Express не заменён. Свежих сравнительных замеров нет. Нельзя приписывать ему потребление памяти или задержку всего Host.

Полная native-граница не завершена. Store, routes и streams обращаются к старому API. Наличие папки `durable/` не доказывает готовую изоляцию.

Сквозная сборка 1.5 не принята. Историческая проверка снимка дала 107 TS-диагностик backend и 87 terminal. Подробности находятся в [STATUS](STATUS.md). При подготовке этой документационной публикации runtime-тесты не запускались.

Zero не является runtime этого Host. [Внешняя композиция](zero/ARCHITECTURE.md) остаётся предложением без патча Zero, а не выполненной миграцией.

## 5. Воспроизведение сравнения

Действия вынесены в [инструкцию сравнения исходников](COMPARE-SOURCES.md). Она сохраняет обе исходные команды `git diff`. Для сравнения не требуются private config, production SQLite, activation scripts или перезапуск сервиса.
