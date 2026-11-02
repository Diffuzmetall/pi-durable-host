# OBSERVE — что позволяет неизменённый Zero

## 1. Цель пользователя и принятые границы

Запрос: «наш текущий хост + вот план который мы только что писали» должен основываться на durable-zero; сначала терминал, позже BB/iii; наши extensions — отдельные пакеты, «сам зеро не трогать».

Рабочее толкование последнего ограничения: не изменять source/dist Zero, не применять patch-package, runtime monkey-patching, private-path imports, подмену модулей или копирование его bootstrap под другим именем. Разрешённое направление исследования — публичные exports и внешняя композиция. Публикация npm-пакетов не запрошена.

«Всё то же самое» означает сохранение session/conversation identity, прав и revoke, receipt/reconcile, безопасного reconnect, native tasks, памяти, DeLM/Goal/schedules, наших инструментов и проверяемого reload. Минимальный terminal demo не подменяет этот результат.

## 2. Источники и уровни доказательств

Zero: тег `v0.7.0`, commit `b2e21df882a6a4426d0f469d2305b842522d37bd`. Исследованный checkout: `/var/tmp/durable-zero-research-20261102-v070`; он остался чистым. Это закреплённая версия, не обещание о будущем main.

Host: dirty shared checkout на HEAD `bb51571bbc3a545226cf2c1aacaf649ac6456112`; значимые hashes записаны в [EVIDENCE](EVIDENCE.md). HEAD не описывает незакоммиченные изменения.

> 🧠 **From Hindsight memory (Component map)** — исторически SDK и клиентские адаптеры отделены от native authority; session/runtime и полный профиль принадлежат серверной стороне. Это направление сопоставлено с ISA, DM1 и текущим `src/durable/session.ts`; исторические PASS из памяти не считаются проверками Zero.

Обозначения:

- **SOURCE** — прочитанный исходный код и, где указано, поставляемый bundle.
- **TEST** — свежий выполненный тест с указанной областью.
- **REPORT** — сохранённый отчёт другой работы, не повторённый эксперимент.
- **PROPOSAL** — рекомендуемая конструкция, которую ещё нужно реализовать и проверить.

## 3. Что сохраняется из текущего плана

[DM1](../../host-design/hot-update/DURABLE-MODULE-PLAN.md) задаёт границу `terminal/iii → dpi-sdk → Host → runtime module → native Durable`. Публичный контракт описывает send/receipt/reconcile, history, observe, configure/reload и scoped child control, а не Harness/WatchCall.

Замена основы на Zero не отменяет:

- единственного execution owner на сессию;
- принадлежности SQLite и native tasks runtime, а не клиенту;
- различия accepted / answered / idle / uncertain;
- запрета нового requestId как способа скрыть потерянный ACK;
- sanitizer для snapshot и updates, revision/resync и revoke открытых streams;
- отдельной проверки hot rollback, backup-return и release-return с актуальной историей;
- закреплённых task/document IDs и model/provider IDs;
- защиты production и физической изоляции тестов.

Старый operational milestone был terminal + iii, BB отложен. Новый запрос включает BB и iii как будущих потребителей архитектуры; он не запускает их реализацию и не отменяет задания действующей команды.

## 4. README как целевой ориентир, не доказательство

[README Zero](https://github.com/VanDalkvist/durable-zero/blob/b2e21df882a6a4426d0f469d2305b842522d37bd/README.md) обещает durable persistence, task graph, QuickJS CodeMode, multi-client socket daemon и стандартные Pi Extensions без нового plugin SDK.

Принимаем эти направления. Но ни «стандартные extensions», ни «multi-client» не определяют наши before-resume binding, atomic revoke, UI RPC, staged reload или receipt reconciliation. Будущий README-compatible release проверяется по конкретным API и сценариям, а не по совпадению описания.

Текущий root/package manifest содержит native dependencies 1.5.0. Формулировку README «zero-dependency» нельзя понимать как отсутствие зависимостей или как готовый независимый security sandbox для Node-расширений.

## 5. Реальные публичные точки подключения

### 5.1. Package exports

Root package `durable-zero` экспортирует `.` / `./core` / `./contracts` / `./runner`. В monorepo core называется `@durable-zero/core`. Это два package layout; реальная отдельная npm-публикация scoped package в этой работе не проверялась.

`packages/core/src/index.ts` экспортирует:

- `DurableEngine`, `openDurable`, runtime types;
- `BuiltinExtensionRegistry`, builtin types и builtins;
- `adaptExtensionTool`, `installExtensionTools`, `mountExtensionBridge`, `createNestedToolExecutor`;
- `createPiPrompt`, dynamic namespaces и projection helpers.

В `packages/core/dist/index.js` соответствующие runtime exports присутствуют. Мы не исполняли полный package import: наличие exports не доказывает dependency closure.

### 5.2. Обычный Pi extension

`openDurable({ cli: { extensions: [...] } })` передаёт paths в `DefaultResourceLoader.additionalExtensionPaths`. Дополнительно используется `PI_ADDITIONAL_EXTENSIONS`; default/global discovery зависит от настроек загрузчика.

Внутри Zero `ExtensionRunner` преобразует инструменты в native registry. Это реальный путь для отдельных пакетов со стандартным `ExtensionAPI`. Разрешение имени npm-пакета в extension entrypoint должен выполнять наш trusted composition root после установки пакета; HTTP-клиент не задаёт произвольный filesystem path.

### 5.3. Native definitions — существенное уточнение предыдущего ответа

`OpenDurableOptions` уже содержит `builtins?: BuiltinExtension[]` и alias `plugins?`. Используется `builtins ?? plugins`, а не объединение двух списков.

`BuiltinExtension` имеет `id`, `name`, `version`, `register(ctx)` и необязательный `teardown()`. `ctx.registry` позволяет устанавливать native extensions до `Harness.open`.

Поэтому **для самой регистрации native tasks/documents/tools менять Zero не требуется**. Предыдущая гипотеза о необходимости сначала добавить такую точку была слишком широкой.

`DurableEngine.open()` этот option не предоставляет: выбирая более узкий facade, нельзя приписывать ему возможности `openDurable()`.

### 5.4. Точные пределы этой точки

`BuiltinExtensionContext` передаёт registry/settings/cwd/prompt/namespaces/subagent policy accessor, но не исходный Storage и не Harness. `storageDir` в этой композиции равен `cwd`, а не изолированному каталогу session: наши пакеты должны получать собственный каталог явно.

В `harness-setup.ts` сначала всегда регистрируются coding tools, CodeMode и subagents, потом custom builtins. Повторный builtin ID отвергается. Следовательно, `builtins` — добавление, не доказанный механизм отключения/замены штатных владельцев. Native `registry.install` — другой уровень; замена конкретного native extension требует отдельной проверки его идентичности и совместимости.

Свежий **TEST: 3 PASS** подтверждает register/get/list, duplicate-ID rejection и reverse teardown. Он не создаёт Harness, не тестирует наши пакеты и не подтверждает безопасную горячую замену.

## 6. Сопоставление с полным Host

| Потребность | Что есть в Zero v0.7.0 | Вывод |
|---|---|---|
| Native definitions до открытия БД | `openDurable({ builtins }) → register(ctx.registry)` | SOURCE: вход существует |
| Bind наших memory/automation до resume | `harness.resume()` вызывается до возврата `openDurable()` | Нет доступного caller-controlled окна |
| Исходный Storage для memory binding | `OpenDurableResult` возвращает Harness, но не исходный Storage | Текущий контракт нашего memory так не подключается |
| Commit authorization | `Harness.open` options внутри loader фиксированы; beforeCommit не передаётся | Нельзя сохранить наш fence одним внешним HTTP-check |
| Защищённый execution environment | Zero создаёт собственный `ExecutionEnvs/NodeExecutionEnv` | В options нет env injection для нашего DCG boundary |
| Session-local provider/auth composition | `ModelRuntime.create()` вызывается внутри loader | Готовый owner не предоставляет наш явный model-runtime input |
| Native hooks/tasks | Registry доступен до open | Definitions переносимы; lifecycle проверяется отдельно |
| UI обычного Pi extension | `select/input/custom` возвращают undefined, `confirm` false, многие setters пусты | Полного remote UI нет |
| UI нашего отдельного пакета | Пакет может принимать собственные callbacks | PROPOSAL: работа без изменения Zero, но не прозрачная совместимость любого Pi UI |
| Полный extension reload | Result не возвращает runner/loader; narrow facade reload не имеет | Перезапуск `openDurable()` не считать reload |
| Receipt/reconcile/grants | Narrow facade даёт `prompt(): Promise<void>` | Наш контракт сильнее; внешний runtime adapter нужен |
| Полная замена subagent/CodeMode policy | Default owners ставятся автоматически | Additive builtins не доказывают замену политик |

### Проверенная причинная цепочка lifecycle

Наш `native-session.ts:58–85`: native open → root → `lifecycle.bind(harness, storage)` → resume.

Наш `native-profile/profile.ts:336–347`: memory требует исходный Storage, затем bind tracing/automation/operator/iii.

Zero `runtime.ts:162–180`: toggleTasks → resume → return `{view, controller, settings, modelRuntime, harness, ...}`.

После возврата можно читать возвращённый Harness, но **«немедленно pause и bind» уже не доказывает отсутствие исполнения до bind**, особенно при восстановлении старых задач. Такой обход не выбран.

### Native authorization — отдельный dependency blocker

[COMMIT-AUTHORIZATION](../../../experiments/durable-module-20261102/runtime/COMMIT-AUTHORIZATION.md) описывает локальный patch Pi Durable 1.5.0 и component RED/GREEN. Наш текущий native-session требует `COMMIT_AUTHORIZATION_REVISION = host-commit-authorization-v1`.

Это **REPORT плюс подтверждённое требование source**, не свежий запуск этих fixtures. Stock native dependency Zero нельзя молча объявить эквивалентной. Неизменённый Zero и неизменённое всё дерево зависимостей — разные требования; существующий native patch остаётся явным нерешённым условием для нового closure.

## 7. Почему вопрос процессов ещё существенен

`builtin-extensions/codemode.ts` хранит `activeSandbox` на уровне модуля: следующая регистрация меняет ссылку, teardown использует последнюю ссылку. Две сессии в одном JS module instance поэтому требуют проверки перекрёстного закрытия и утечки ресурсов.

Это SOURCE-риск, не выполненный multi-session runtime test. Он даёт конкретную причину рассмотреть отдельный session worker, если используются stock singleton components без изменения Zero. Одна сессия на worker не требует отдельного сетевого daemon или отдельного scheduler.

## 8. Конфигурация и операции исследованной версии

| Вход | Смысл / ограничение |
|---|---|
| `openDurable({sessionDir, cwd})` | Выбор сессии и рабочего каталога; путь устанавливает сервер |
| `openDurable({builtins: [factory()]})` | Native registration; не before-resume bind |
| `openDurable({cli:{extensions:[entry]}})` | Обычный Pi extension entrypoint |
| `opened.controller.submit(content, "followUp")` | Отправка, но не наш полный receipt contract |
| `opened.view.subscribe(listener)` | Источник native view; наружу нужна безопасная проекция |
| `opened.close()` | Закрытие владельца, не disconnect клиента |
| `PI_AGENT_DIR` / `PI_CODING_AGENT_DIR` | Helper Zero выбирает первый непустой override, иначе `~/.pi/agent`; согласованность всех dependency loaders проверяется отдельно |
| `PI_ADDITIONAL_EXTENSIONS` | Список дополнительных paths через запятую; только trusted server configuration |

Не запускаем `run/serve` с рабочими config/data. Предыдущие пробы `serve` parser и socket takeover описаны в EVIDENCE как ранее выполненные узкие проверки, не как доказательство поведения полноценного daemon.

## 9. Исследование достаточно для следующего решения

Доказано наличие внешней регистрации; доказано несовпадение открытых lifecycle-контрактов. Не доказана невозможность любого будущего рефакторинга наших расширений, но нет основания обещать текущий полный профиль на stock `openDurable()`.

Следующий шаг — выбрать между готовым owner с ограниченной совместимостью и внешней композицией exported Zero components. Сравнение и рекомендуемая граница находятся в [THINK](THINK.md).

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
