# OBSERVE: возможности неизменённого Zero

Назначение по Diátaxis: справочник требований, исходников и ограничений исследованной версии.

## 1. Цель пользователя и границы исследования

Пользователь запросил основу durable-zero для текущего Host с учётом ранее подготовленного плана. Первым клиентом должен стать терминал, позже BB и iii. Наши расширения должны поставляться отдельными пакетами. Zero должен остаться неизменённым.

Рабочее толкование последнего требования запрещает следующие способы изменения Zero:

- изменение source и dist;
- patch-package, runtime monkey-patching и private-path imports;
- подмену модулей или копирование bootstrap Zero под другим именем.

Исследование рассматривает публичные exports и внешнюю композицию компонентов. Пользователь не запрашивал публикацию npm-пакетов.

Сохранение текущих возможностей включает identity сессий и разговоров, права и их отзыв, receipt/reconcile и безопасный reconnect. Сохраняются native tasks, память, DeLM, Goal, schedules, наши инструменты и проверяемый reload. Минимальный пример терминала не заменяет этот результат.

## 2. Источники и уровни доказательств

Исследован Zero с тегом `v0.7.0` на commit `b2e21df882a6a4426d0f469d2305b842522d37bd`. Checkout `/var/tmp/durable-zero-research-20261102-v070` остался чистым. Выводы относятся к закреплённой версии, а не к будущему main.

Исследован общий checkout Host с незакоммиченными изменениями на HEAD `bb51571bbc3a545226cf2c1aacaf649ac6456112`. Значимые hashes записаны в [EVIDENCE](EVIDENCE.md). HEAD не описывает незакоммиченные изменения.

> 🧠 **From Hindsight memory (Component map)** — исторически SDK и клиентские адаптеры отделены от native authority; session/runtime и полный профиль принадлежат серверной стороне. Это направление сопоставлено с ISA, DM1 и текущим `src/durable/session.ts`; исторические PASS из памяти не считаются проверками Zero.

В документе используются четыре обозначения доказательств:

- **SOURCE** означает прочитанный исходный код и поставляемый bundle, где он указан.
- **TEST** означает выполненный в исходном исследовании тест с указанной областью.
- **REPORT** означает сохранённый отчёт другой работы, без повторения эксперимента.
- **PROPOSAL** означает рекомендуемую конструкцию, которую ещё необходимо реализовать и проверить.

Редактура не добавляет новых TEST. Результаты исходного исследования не становятся проверкой полного Host.

## 3. Требования текущего плана

[DM1](../../host-design/hot-update/DURABLE-MODULE-PLAN.md) задаёт границу `terminal/iii → dpi-sdk → Host → runtime module → native Durable`. Публичный контракт описывает send/receipt/reconcile, history, observe, configure/reload и scoped child control. Он не предоставляет клиентам Harness/WatchCall.

Замена основы на Zero сохраняет следующие требования:

- Одна сессия имеет единственного владельца выполнения.
- SQLite и native tasks принадлежат runtime, а не клиенту.
- Состояния accepted, answered, idle и uncertain различаются.
- Потеря ACK не разрешает повторить запрос с новым requestId.
- Sanitizer обрабатывает snapshot и updates. Контракт сохраняет revision/resync и отзыв доступа к открытым streams.
- Hot rollback, backup-return и release-return требуют отдельных проверок с актуальной историей.
- Task/document IDs и model/provider IDs остаются закреплёнными.
- Production защищён, а тесты физически изолированы.

Прежний operational milestone охватывал terminal и iii. BB был отложен. Новый запрос включает BB и iii как будущих клиентов архитектуры. Он не запускает их реализацию и не отменяет задания действующей команды.

## 4. Заявления README и их пределы

[README Zero](https://github.com/VanDalkvist/durable-zero/blob/b2e21df882a6a4426d0f469d2305b842522d37bd/README.md) заявляет durable persistence, task graph, QuickJS CodeMode, multi-client socket daemon и стандартные Pi Extensions. Новый plugin SDK не заявлен.

Эти направления соответствуют цели исследования. Однако «стандартные extensions» и «multi-client» не определяют привязку сервисов до resume, атомарный отзыв прав и UI RPC. Они также не определяют staged reload и receipt reconciliation. Совместимость будущего выпуска требует проверки конкретных API и сценариев, а не совпадения описаний README.

Текущий root/package manifest содержит native dependencies 1.5.0. Формулировка README «zero-dependency» не означает отсутствие зависимостей. Она также не подтверждает изоляцию недоверенных Node-расширений.

## 5. Публичные точки подключения

### 5.1. Экспорты пакета

Root package `durable-zero` экспортирует `.` / `./core` / `./contracts` / `./runner`. В monorepo core называется `@durable-zero/core`. Это два варианта структуры пакетов. Отдельная публикация scoped package в npm в этой работе не проверялась.

`packages/core/src/index.ts` экспортирует следующие компоненты:

- `DurableEngine`, `openDurable` и runtime types;
- `BuiltinExtensionRegistry`, builtin types и builtins;
- `adaptExtensionTool`, `installExtensionTools`, `mountExtensionBridge`, `createNestedToolExecutor`;
- `createPiPrompt`, dynamic namespaces и projection helpers.

Соответствующие runtime exports присутствуют в `packages/core/dist/index.js`. Полный импорт пакета не выполнялся. Наличие exports не доказывает полноту цепочки зависимостей.

### 5.2. Обычные Pi extensions

`openDurable({ cli: { extensions: [...] } })` передаёт пути в `DefaultResourceLoader.additionalExtensionPaths`. Дополнительно используется `PI_ADDITIONAL_EXTENSIONS`. Обнаружение default/global extensions зависит от настроек загрузчика.

Внутри Zero `ExtensionRunner` преобразует инструменты в native registry. Этот путь позволяет подключать отдельные пакеты со стандартным `ExtensionAPI`.

После установки пакета доверенный composition root должен разрешать имя npm-пакета в extension entrypoint. Composition root здесь означает код, который выбирает зависимости и собирает runtime. HTTP-клиент не должен задавать произвольный путь файловой системы.

### 5.3. Native definitions и уточнение предыдущего ответа

`OpenDurableOptions` содержит `builtins?: BuiltinExtension[]` и alias `plugins?`. Выражение `builtins ?? plugins` выбирает один список, а не объединяет оба.

`BuiltinExtension` содержит `id`, `name`, `version`, `register(ctx)` и необязательный `teardown()`. Через `ctx.registry` можно устанавливать native extensions до `Harness.open`.

Для регистрации native tasks, documents и tools менять Zero не требуется. Прежняя гипотеза о необходимости сначала добавить такую точку подключения была слишком широкой.

`DurableEngine.open()` не предоставляет этот option. Более узкий facade не получает возможности `openDurable()` автоматически.

### 5.4. Ограничения регистрации

`BuiltinExtensionContext` передаёт registry, settings, cwd, prompt, namespaces и subagent policy accessor. Он не передаёт исходный Storage или Harness. В этой композиции `storageDir` равен `cwd`, а не изолированному каталогу сессии. Поэтому наши пакеты должны получать собственный каталог явно.

В `harness-setup.ts` coding tools, CodeMode и subagents регистрируются перед custom builtins. Повторный builtin ID отвергается. Следовательно, `builtins` добавляет компоненты, но не доказывает возможность отключить или заменить штатных владельцев.

Native `registry.install` работает на другом уровне. Замена конкретного native extension требует проверки его идентичности и совместимости.

В исходном исследовании **TEST: 3 PASS** подтвердил register/get/list, duplicate-ID rejection и reverse teardown. Тест не создаёт Harness, не проверяет наши пакеты и не подтверждает безопасную горячую замену.

## 6. Сопоставление с полным Host

| Потребность | Zero v0.7.0 | Ограничение доказательств |
|---|---|---|
| Native definitions до открытия БД | `openDurable({ builtins }) → register(ctx.registry)` | SOURCE подтверждает вход |
| Bind наших memory/automation до resume | `harness.resume()` вызывается до возврата `openDurable()` | Вызывающий код не получает управляемого окна до resume |
| Исходный Storage для memory binding | `OpenDurableResult` возвращает Harness, но не исходный Storage | Текущий контракт нашей memory так не подключается |
| Авторизация перед commit | Loader фиксирует options `Harness.open`; beforeCommit не передаётся | Внешняя HTTP-проверка не сохраняет нашу проверку перед commit |
| Защищённая среда исполнения | Zero создаёт собственный `ExecutionEnvs/NodeExecutionEnv` | Options не позволяют передать нашу среду с DCG |
| Provider/auth для отдельной сессии | Loader сам вызывает `ModelRuntime.create()` | Готовый runtime не принимает наш model runtime явно |
| Native hooks/tasks | Registry доступен до open | Definitions переносимы, но lifecycle требует отдельной проверки |
| UI обычного Pi extension | `select/input/custom` возвращают undefined, `confirm` возвращает false, многие setters пусты | Полного remote UI нет |
| UI нашего отдельного пакета | Пакет может принимать собственные callbacks | PROPOSAL не означает прозрачную совместимость любого Pi UI |
| Полный extension reload | Result не возвращает runner/loader; узкий facade не имеет reload | Повторный запуск `openDurable()` не подтверждает reload |
| Receipt/reconcile/grants | Узкий facade предоставляет `prompt(): Promise<void>` | Наш контракт сильнее и требует внешнего runtime adapter |
| Замена subagent/CodeMode policy | Default owners устанавливаются автоматически | Добавление builtins не доказывает замену политик |

### 6.1. Порядок lifecycle

Наш `native-session.ts:58–85` выполняет native open, затем root, затем `lifecycle.bind(harness, storage)` и resume.

Наш `native-profile/profile.ts:336–347` требует исходный Storage для memory. После этого он привязывает tracing, automation, operator и iii.

Zero `runtime.ts:162–180` выполняет toggleTasks, затем resume и возвращает `{view, controller, settings, modelRuntime, harness, ...}`.

После возврата доступен Harness. Однако немедленный pause перед bind не доказывает отсутствие исполнения до bind, особенно при восстановлении прежних задач. Исследование отвергает этот обход.

### 6.2. Отдельное ограничение native authorization

[COMMIT-AUTHORIZATION](../../../experiments/durable-module-20261102/runtime/COMMIT-AUTHORIZATION.md) описывает локальный patch Pi Durable 1.5.0 и component RED/GREEN. Наш текущий native-session требует `COMMIT_AUTHORIZATION_REVISION = host-commit-authorization-v1`.

Это REPORT и подтверждённое требование исходников, а не новый запуск этих fixtures. Эквивалентность штатной native dependency Zero не подтверждена. Неизменённый Zero не означает неизменённое дерево всех зависимостей. Существующий native patch остаётся явным нерешённым условием новой цепочки зависимостей.

## 7. Риск общего состояния CodeMode

`builtin-extensions/codemode.ts` хранит `activeSandbox` на уровне модуля. Следующая регистрация меняет ссылку, а teardown использует последнюю ссылку. Поэтому две сессии в одном JS module instance требуют проверки перекрёстного закрытия и утечки ресурсов.

Это риск по SOURCE, а не выполненный runtime test нескольких сессий. Риск обосновывает рассмотрение отдельного worker для сессии при использовании штатных singleton-компонентов без изменения Zero. Одна сессия на worker не требует отдельного сетевого daemon или отдельного планировщика.

## 8. Конфигурация и операции версии v0.7.0

| Вход | Значение и ограничение |
|---|---|
| `openDurable({sessionDir, cwd})` | Выбирает сессию и рабочий каталог. Путь задаёт сервер |
| `openDurable({builtins: [factory()]})` | Регистрирует native definitions, но не выполняет bind до resume |
| `openDurable({cli:{extensions:[entry]}})` | Подключает обычный Pi extension entrypoint |
| `opened.controller.submit(content, "followUp")` | Отправляет запрос, но не предоставляет наш полный receipt contract |
| `opened.view.subscribe(listener)` | Даёт native view. Внешний клиент требует безопасной проекции |
| `opened.close()` | Закрывает владельца выполнения, а не соединение клиента |
| `PI_AGENT_DIR` / `PI_CODING_AGENT_DIR` | Helper Zero выбирает первый непустой override, иначе `~/.pi/agent`. Согласованность dependency loaders требует отдельной проверки |
| `PI_ADDITIONAL_EXTENSIONS` | Задаёт дополнительные пути через запятую. Допустима только доверенная серверная конфигурация |

Исследование не разрешает запуск `run/serve` с рабочими config/data. [EVIDENCE](EVIDENCE.md) описывает прежние узкие проверки `serve` parser и socket takeover. Они не доказывают поведение полноценного daemon.

## 9. Граница выводов

Исходники подтверждают внешнюю регистрацию и несовпадение открытых lifecycle-контрактов. Исследование не доказывает невозможность будущего рефакторинга наших расширений. Однако оно не даёт основания обещать текущий полный профиль на штатном `openDurable()`.

Открытым остаётся выбор между готовым владельцем выполнения с ограниченной совместимостью и внешней композицией публичных компонентов Zero. [THINK](THINK.md) содержит сравнение и рекомендуемую границу.

## Источники Zero

Все ссылки закреплены на исследованном commit:

- [root package exports](https://github.com/VanDalkvist/durable-zero/blob/b2e21df882a6a4426d0f469d2305b842522d37bd/package.json)
- [core exports](https://github.com/VanDalkvist/durable-zero/blob/b2e21df882a6a4426d0f469d2305b842522d37bd/packages/core/src/index.ts)
- [runtime options/result](https://github.com/VanDalkvist/durable-zero/blob/b2e21df882a6a4426d0f469d2305b842522d37bd/packages/core/src/runtime-types.ts#L78-L111)
- [runtime open/resume](https://github.com/VanDalkvist/durable-zero/blob/b2e21df882a6a4426d0f469d2305b842522d37bd/packages/core/src/runtime.ts#L162-L186)
- [loader](https://github.com/VanDalkvist/durable-zero/blob/b2e21df882a6a4426d0f469d2305b842522d37bd/packages/core/src/runtime-loader.ts)
- [registry composition](https://github.com/VanDalkvist/durable-zero/blob/b2e21df882a6a4426d0f469d2305b842522d37bd/packages/core/src/harness-setup.ts#L74-L107)
- [builtin interface](https://github.com/VanDalkvist/durable-zero/blob/b2e21df882a6a4426d0f469d2305b842522d37bd/packages/core/src/builtin-extensions/types.ts)
- [Pi extension actions](https://github.com/VanDalkvist/durable-zero/blob/b2e21df882a6a4426d0f469d2305b842522d37bd/packages/core/src/shared/extension-runner.ts)
- [headless UI](https://github.com/VanDalkvist/durable-zero/blob/b2e21df882a6a4426d0f469d2305b842522d37bd/packages/core/src/shared/extension-ui-context.ts)
- [CodeMode module state](https://github.com/VanDalkvist/durable-zero/blob/b2e21df882a6a4426d0f469d2305b842522d37bd/packages/core/src/builtin-extensions/codemode.ts)
