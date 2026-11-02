# Что изменено относительно Disler

[Оглавление](README.md) · [Карта исходников](MAP.md) · [Картинки и HTTP](IMAGES-AND-HTTP.md) · [Вариант Zero](zero/README.md)

Сравниваются исходный baseline Disler `37165c619573dbaf425463038bbffecfe576beec` и опубликованный снимок нашего fork `830ad61af22b1585f1358896f286acd40492c7ca`. Это карта областей изменений, не исчерпывающий журнал коммитов и не свидетельство активации каждой функции.

## 1. Что мы унаследовали — и что осталось

- **Express backend и HTTP/SSE.** В baseline `main.ts` импортировал Express и монтировал `/v1` с bearer auth и JSON-лимитом `256kb`. В нашем коде сборка сервера выделена в [`http-server.ts`](../../apps/dpi-backend/src/http-server.ts), но Express и этот лимит остались.
- **Store, каталог сессий, native Harness и session storage.** Эти владельцы не заменены Zero. Store вырос и остаётся тесно связан с native API.
- **SDK и wire-описание сообщений.** Уже baseline имел `WireImage` в наблюдаемых сообщениях, но `SendMessageBody.content` был строкой. В нашем публичном пути отправки это ограничение пока сохранилось.
- **Playground/demo.** Исходные examples/addons/jobs сохранены, но отделены от минимального профиля. Основная серверная композиция не сводится к запуску demo.

Проверяемые исходные версии: [старый main.ts](https://github.com/disler/durable-pi/blob/37165c619573dbaf425463038bbffecfe576beec/apps/dpi-backend/src/main.ts), [старый Store](https://github.com/disler/durable-pi/blob/37165c619573dbaf425463038bbffecfe576beec/apps/dpi-backend/src/store.ts), [старый SDK API](https://github.com/disler/durable-pi/blob/37165c619573dbaf425463038bbffecfe576beec/apps/dpi-sdk/src/api.ts), [старый manifest](https://github.com/disler/durable-pi/blob/37165c619573dbaf425463038bbffecfe576beec/apps/dpi-backend/package.json). Native-зависимости baseline были `1.0.3`; в основном manifest нашего снимка — `1.4.0`.

## 2. Наши расширения Host — не патчи npm-зависимостей

| Область | Что добавлено или существенно развито | Основные пути |
|---|---|---|
| Runtime composition | Minimal/playground и полный native profile; доверенный operational bootstrap | [`runtime-profile.ts`](../../apps/dpi-backend/src/runtime-profile.ts), [`native-profile/profile.ts`](../../apps/dpi-backend/src/native-profile/profile.ts), [`sdk-host-cutover`](../../experiments/sdk-host-cutover) |
| Admission и полномочия | Grants, actor/scope/authority, операторские и делегированные действия, receipt/reconcile | [`auth.ts`](../../apps/dpi-backend/src/auth.ts), [`store.ts`](../../apps/dpi-backend/src/store.ts), [`admission`](../../apps/dpi-backend/src/native-profile/admission) |
| Клиентский контракт | API version 2, capabilities, observation validation/projection, устойчивое разрешение неопределённой отправки | [`dpi-sdk/src`](../../apps/dpi-sdk/src), [`submission-journal.ts`](../../apps/terminal-adapter/src/submission-journal.ts) |
| Основной терминал | Новый terminal-adapter: UI, remote controller, model/skill/configuration flows | [`terminal-adapter`](../../apps/terminal-adapter) |
| Серверные возможности | Tools, Codex/Antigravity/web/Context7, MCP, models, skills, memory, tracing, Goal/schedules/subagents | [`native-profile`](../../apps/dpi-backend/src/native-profile) |
| Reload | Совместимое обновление registry/resources с prepare/publish/drain и lifecycle | [`durable-reload`](../../packages/durable-reload) |
| Внешние клиенты | iii-адаптер и заготовленные/отложенные BB-пути | [`iii-adapter`](../../apps/iii-adapter), [`bb-adapter`](../../apps/bb-adapter) |
| Новая native-граница | Contract и компонентная реализация семантических операций сессии | [`src/durable`](../../apps/dpi-backend/src/durable), [DM1](../host-design/hot-update/DURABLE-MODULE-PLAN.md) — **WIP** |

Для происхождения перенесённых реализаций рядом с компонентами есть `NOTICE.md`, `SOURCE.json`, а у Hindsight vendor — [`PROVENANCE.md`](../../apps/dpi-backend/src/native-profile/memory/hindsight/vendor/PROVENANCE.md). Это важнее предположения «всё в native-profile написано с нуля».

## 3. Настоящие патчи и адаптации зависимостей

Наличие patch-файла означает, что адаптация сохранена в репозитории. Оно **не доказывает**, что патч применён в установленном процессе или во всех локальных node_modules.

| Артефакт | Что адаптируется | Граница доказательства |
|---|---|---|
| [`patch-commit-authorization.mjs`](../../experiments/durable-module-20261102/runtime/patch-commit-authorization.mjs) и [обоснование](../../experiments/durable-module-20261102/runtime/COMMIT-AUTHORIZATION.md) | Native Durable 1.5: commit authorization с revision `host-commit-authorization-v1` | Требуется новым `native-session.ts`; **это не stock 1.5**. Компонентный кандидат, не принятый весь Host |
| [`mcp-source`](../../experiments/hot-update-20261101/mcp-source) | Сохранённые `manager.patch`, `observer.patch`, `manager-before-observer.patch`, `host-managed.patch` для MCP hot-update/ownership | Это исходники воспроизводимых адаптаций и экспериментов, не свидетельство установки всех четырёх |
| [`GipPity worklet-patch.mjs`](../../experiments/gippity-voice/worklet-patch.mjs) | Два release bundle 0.10.0: same-origin AudioWorklet и ограниченное ожидание короткого audio-фрагмента | Узкая сторонняя адаптация; [README](../../experiments/gippity-voice/README.md) содержит датированную operational-историю. Совместимость с целевой 1.5 здесь не принята |
| [`operational-profile.mjs`](../../experiments/sdk-host-cutover/operational-profile.mjs) и [`session-mcp.mjs`](../../experiments/sdk-host-cutover/session-mcp.mjs) | Наш glue-код: trusted config, native extensions, session MCP, модели и capabilities | Это внешняя композиция, не изменение кода Durable; часть bindings собирается отдельно |
| [`target-manifests`](../../experiments/durable-module-20261102/packaging/target-manifests) | Отдельный dependency closure кандидата 1.5 | Manifest не равен собранному и принятому release; основные manifests по-прежнему 1.4 |

Ключевое различие: «наш профиль поверх public API», «локально изменённый upstream package» и «будущий пакет расширений» — три разные категории. При переносе на Zero для каждой нужен свой способ подключения; простое переименование каталогов проблему не решит.

## 4. Что не исправлено и не принято

- **Входные image blocks по SDK/HTTP отсутствуют:** `content: string` и серверная проверка строки сохраняются. Image tools и wire-history не заменяют attachment API.
- **Express не заменён.** Нет свежего сравнительного benchmark, позволяющего приписать ему потребление памяти или задержку всего Host.
- **Полная native-граница не завершена:** Store/routes/streams ещё обращаются к старому API. Нельзя выдавать новую папку `durable/` за готовую изоляцию.
- **Нет принятой сквозной сборки 1.5:** историческая проверка снимка дала backend 107 и terminal 87 TS-диагностик; подробнее [STATUS](STATUS.md). В этой документационной публикации тесты runtime не запускались.
- **Zero не используется как runtime этого Host.** [Вариант внешней композиции](zero/ARCHITECTURE.md) — предложение без патча Zero, а не уже выполненная миграция.

## 5. Как воспроизвести сравнение без запуска Host

Из checkout этой ветки, если оба commit object доступны:

```sh
git diff --stat 37165c619573dbaf425463038bbffecfe576beec 830ad61af22b1585f1358896f286acd40492c7ca -- apps packages
git diff 37165c619573dbaf425463038bbffecfe576beec 830ad61af22b1585f1358896f286acd40492c7ca -- apps/dpi-sdk/src/api.ts apps/dpi-backend/src/http-server.ts
```

Эти команды читают Git. Для знакомства с архитектурой не нужны private config, production SQLite, activation scripts или перезапуск сервиса.
