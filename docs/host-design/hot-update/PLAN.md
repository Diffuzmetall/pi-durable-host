# Горячее обновление окружения Durable без перезапуска Host

Дата: 2026-11-01. Автор: BronzeMink. Ревизия: **R4 — утверждённый reuse-first scope, продуктовые ISC и проверяемый rollback**.

**Статус:** разрешены передача существующей DeLM-восьмёрке, локальная реализация и изолированные проверки. Продукт ещё не принят: новые проверки NOT RUN. Production activation запрещена до завершения всей приёмки и отдельного разрешения пользователя. Frozen inputs существующего run не изменяются.

## 1. Результат и источник требований

Пользователь поручил: повторно исследовать загрузку через OBSERVE, проверить подход через THINK и arch, обязательно применить parallel-plan, провести ревью плана, дать короткую ссылку и все продуктовые решения. После утверждения — передать план на DeLM-доску для реализации. Цель: подавляющее большинство обычных установок и изменений кода, extensions и настроек должно работать без перезапуска общего Host, как штатное горячее обновление Durable.

Этот документ задаёт способ реализации, но не заменяет [ISA](../../../ISA.md) и [основной PLAN](../PLAN.md). HU-1…HU-10 ниже — локальные ссылки на требования этого запроса, не новая нумерация ISA. Исторический [handoff](/var/tmp/host-hot-update-bronzemink-20261101-tanbay.md) — исследовательский контекст; предложение вынести все модули в процессы не принято как требование.

### Поправка пользователя: сначала готовое решение

Пользователь уточнил: «взять уже готовую старую реализацию; меньше придумывать, больше брать готовых решений». R3 заменяет проектирование общего hot-update framework восстановлением старого `/reload` и его недостающих соединений с текущим Host. Для каждого изменения исполнитель сначала указывает старую функцию, существующий перенос и минимальный diff. Новый механизм допустим только после конкретного провала существующего пути; прежние предложения про общий revision manager, новую metadata-схему и watcher всего окружения не являются обязательной архитектурой.

Цель не сужается до MCP или одного Hindsight: U01–U18 остаются. Автоподхват при каждом сохранении и рассылка во все сессии отделены от возможности обновить всё через штатный `/reload` без рестарта; это самостоятельные продуктовые решения D01/D02, а не якобы готовые свойства старой реализации.

### Критерии запроса

| ID | Наблюдаемый результат |
|---|---|
| HU-1 | Изменение поддерживаемого extension-кода, его обычных JS/TS-зависимостей и установка разрешённого расширения подхватываются без смены PID Host, Harness и session IDs. |
| HU-2 | Уже принятая работа продолжает выполняться; совместимое обновление не требует завершения всех задач сессии, включая schedules и DeLM waits. |
| HU-3 | Новые вызовы/фазы используют новую совместимую реализацию; уже начатые сохраняют старую. Момент применения виден пользователю. |
| HU-4 | Ошибка загрузки, проверки, подготовки или отозванные права до публикации сохраняют исправную активную версию. Откат не повторяет внешние действия. |
| HU-5 | Один владелец SQLite/Harness; неизменные grants, identity, canonical-path checks, session isolation и запреты повышения полномочий. |
| HU-6 | Сохранены task/doc IDs, модель, история, pending input, cancellation и no-replay semantics. Несовместимые сохранённые определения не запускаются молча. |
| HU-7 | Старые ресурсы учитываются и освобождаются безопасно; нет новых дублей subscriptions, schedulers, MCP-процессов и бесконечного роста поколений. |
| HU-8 | Работает весь обычный путь `/reload` → повторное чтение разрешённых sources/settings → проверка → применение → результат SDK/TUI. Автоматический trigger добавляется только при выборе D01 и вызывает этот же путь. |
| HU-9 | Понятна измеримая граница «примерно 90%»: фиксированный до реализации корпус U01–U20, без исключения неудобных случаев после тестов. |
| HU-10 | Сохранены исправления restart-repair, доступна безопасная поэтапная реализация; тесты не могут записать в рабочие credentials, production activation отдельно. |

### Разрешённая работа сейчас

Последнее поручение пользователя разрешает закончить план, добавить продуктовые критерии и простой откат, передать реализацию **существующим** восьми DeLM-агентам. Разрешены локальные source/test edits, сборка неактивированного кандидата, задачи на существующей доске и физически изолированные проверки. D01/D02 используются в рекомендуемом минимальном виде: ручной `/reload` текущей сессии; watcher/global fan-out не заказаны.

Запрещены любые reload/stop/restart/kill/switch работающего Host, изменения его installed release/config/БД, настоящих credentials, новые агенты/модели, commit/push/publish/deploy и неразрешённые загрузки/расходы. Рабочий Host остаётся неизменным до **отдельного разрешения после всех работ**. Источник продуктовой приёмки — [ISA, F7–F9 / ISC-46–78](../../../ISA.md#f7--горячо-обновить-обычный-код-текст-и-каталог); назначения и передача — [HANDOFF](HANDOFF.md), состояние задач — только DeLM-доска.

## 2. OBSERVE: что установлено

### Базовая линия и предыдущая задача

- Исходный Disler: `37165c619573dbaf425463038bbffecfe576beec`. Его [Store.openAgent](https://github.com/disler/durable-pi/blob/37165c619573dbaf425463038bbffecfe576beec/apps/dpi-backend/src/store.ts#L494) создаёт registry и устанавливает статически импортированные extensions при открытии; исследованные backend/SDK не предоставляют горячий загрузчик. `tsx watch` — перезапуск dev-процесса, не hot replacement. В этом baseline Durable 1.0.3.
- Наш checkout HEAD на исследовании: `bb51571bbc3a545226cf2c1aacaf649ac6456112`, с чужими dirty changes. Это не идентификатор всего рабочего дерева и не разрешение его сбросить.
- Целевая линия ISA и проверенная установленная библиотека — Durable 1.4.0. Нельзя переносить выводы о ней на исходную 1.0.3 без проверки.
- По [отчёту Heidi](../verification/restart-repair-20261101/REPORT.md) `alice-v2` прошёл изолированную candidate QA; production activation **NOT RUN**. Кандидат: `/tmp/pi-host-restart-candidate-20261101-alice-v2`, SHA-256 manifest `672b7e5e746dcabfbf5ca82a571cd35f328e457f717b64e2b852b3afa3931665`.
- В отчёте остаются открытыми source review Grace и auth-инцидент: прежний тест записал synthetic fixture в настоящий `~/.pi/agent/auth.json`. Здесь credentials не читались и не восстанавливались. Это блокер активации, а не блокер подготовки плана.
- PASS прошлого отчёта не объявляется нашим новым PASS. Его minimal/faux измерения 67 сессий не доказывают скорость production MCP или восстановление 24 bindings. Исправления background recovery, cleanup и reconnect нужно сохранить, а не переписать новым reload.

### Готовый официальный пример — дополнение R4

В стабильном [upstream v1.4.0 / 31-reload-and-restart.ts](https://github.com/earendil-works/pi/blob/v1.4.0/packages/durable/test/examples/31-reload-and-restart.ts), commit `4a080252f06caf63a525d7873c5d94d3c23887e0`, выполняется `registry.install(v2)`, пока v1 ещё исполняется: тот же Harness, следующий вызов получает v2. Часть с restart показывает отдельное recovery, а не обязательный шаг reload. Загрузку файлов пример имитирует функцией — её уже обеспечивает наш старый/перенесённый loader.

Проверенная при исследовании опубликованная npm-версия — 1.4.0, совпадает с установленной. На main пример переименован в `30-reload-and-restart.ts`, рядом есть unreleased изменения schema/Storage/watch. **Не обновлять зависимости ради этого примера и не копировать main целиком.** Это готовый reference S1, не PASS нашего Host/SDK/PTY.

### Карта доказательств

Ссылки указывают на прочитанный исходник; для dirty дерева перед реализацией нужно сверить изменения и владельцев. Это статический анализ, не выполненная проверка горячего обновления.

| Факт | Источник | Следствие |
|---|---|---|
| `registry.install` заменяет extension того же имени и публикует новый snapshot | [registry.js:58](../../../apps/dpi-backend/node_modules/@earendil-works/pi-durable/dist/harness/registry.js#L58), [README Reload](../../../apps/dpi-backend/node_modules/@earendil-works/pi-durable/README.md#L462) | Нативный механизм есть; новый scheduler не нужен. |
| Scheduler сохраняет snapshot на фазу и обновляет его после durable progress | [scheduler.js:1593–1715](../../../apps/dpi-backend/node_modules/@earendil-works/pi-durable/dist/harness/scheduler.js#L1593) | Безопасная граница — фаза/вызов, не обязательно завершение всей сессии. |
| ToolTask разрешает инструмент, проверяет аргументы и выполняет его внутри одной фазы; recovery учитывает replay policy | [tool.js:37–138](../../../apps/dpi-backend/node_modules/@earendil-works/pi-durable/dist/harness/tool.js#L37) | Нельзя переопределять unsafe side effect как safe ради reload; изменение схем между генерацией и tool call требует совместимости. |
| Старый playground загружал новый Hindsight-код и делал `registry.install` | [старый controller:145](/home/ubuntu/Projects/pi-durable-playground/hindsight/index.mjs#L145), [runtime:272](/home/ubuntu/Projects/pi-durable-playground/coding-agent-durable/runtime.ts#L272) | У нас действительно был горячий путь для конкретной интеграции, но не автоматический watcher всего кода. |
| Наш `reloadDurable` проверяет отсутствие любых nonterminal tasks и совместно готовит models/extensions | [index.ts:27–81](../../../packages/durable-reload/src/index.ts#L27) | Искусственно широкий барьер, в том числе для долгих schedules/waits. Нельзя просто удалить проверку без разделения операций. |
| После publish текущий reader хранит фиксированный snapshot; `install/uninstall` продолжают менять `base` | [registry.ts:19–51](../../../packages/durable-reload/src/registry.ts#L19) | По коду прямой `install` в base после публикации не меняет видимый current snapshot. Это обязательный regression case, не результат runtime-проверки. |
| Почти весь профиль объявлен защищённым base: tools, automation, memory и guards | [profile.ts:120–218](../../../apps/dpi-backend/src/native-profile/profile.ts#L120), [registry.ts:42–46](../../../packages/durable-reload/src/registry.ts#L42) | Защита границ смешана с запретом обновлять обычные обработчики. Нужны неизменные guards вокруг заменяемого поведения. |
| Адаптеры имеют fresh Jiti dependency graph, фиксированные SDK identities, запрет ресурсов при подготовке | [loader.ts](../../../packages/durable-reload/src/loader.ts) | Переиспользовать загрузчик, не ограничиваться `?timestamp` только у entry module. |
| Skills/context читаются на каждом новом PromptInput; settings resolver создан раньше | [skills/index.ts:68–122](../../../apps/dpi-backend/src/native-profile/skills/index.ts#L68) | Не создавать второй watcher для уже динамического текста; отдельно обновлять настройки обнаружения и меню клиента. |
| Memory имеет отдельный controller и scope-preserving `reload(target)` | [session-memory.mjs:45–64](../../../apps/dpi-backend/src/native-profile/memory/session-memory.mjs#L45) | Обновлять callbacks через этот шов, сохраняя bank, logs, storage binding и единственную подписку. |
| MCP snapshot/catalogue захватываются; изменение конфигурации требует reopen | [session-mcp.mjs:33–114](../../../experiments/sdk-host-cutover/session-mcp.mjs#L33) | Обычный reload не заменяет эту обвязку. В manager уже есть поколения; проверять и интегрировать, не писать параллельный manager. |
| DeLM поддерживает late attach, но engine импортируется по постоянному URL | [delm-profile.mjs:46–117](../../../experiments/sdk-host-cutover/delm-profile.mjs#L46) | Late attach не равен обновлению engine; wait identities/admission остаются у прежнего владельца. |
| Component SDK 0.10.0 имеет prepare/bind/retire, stopAdmission и retention; GipPity передаёт отказ вместо whenIdle | [contracts.d.ts:76–99](../../../experiments/gippity-voice/node_modules/@howaboua/pi-durable-components/dist/contracts.d.ts#L76), [retire](../../../experiments/gippity-voice/node_modules/@howaboua/pi-durable-components/dist/index.js#L221), [integration.mjs:109–120](../../../experiments/gippity-voice/integration.mjs#L109) | Ресурсный lifecycle уже существует. Но `retention:harness` и `afterClose` могут сохранять поколение до закрытия Harness; нельзя обещать его горячую выгрузку без изменения владения. |
| SDK/TUI уже направляют reload в Host, без клиентского runtime | [Store:816](../../../apps/dpi-backend/src/store.ts#L816), [remote-controller.ts:288](../../../apps/terminal-adapter/src/remote-controller.ts#L288) | Расширять существующий путь и его статус, не добавлять независимый загрузчик в каждый клиент. |

### Готовые реализации: что брать, а не писать заново

| Готовый источник | Что переиспользовать | Минимальная адаптация / ограничение |
|---|---|---|
| [Старый DurableExtensions](/home/ubuntu/.local/share/pi-durable/host/.pi/extensions/durable-reload/index.ts) | Fresh Jiti с общими SDK identities; последовательное применение adapters, проверка snapshot, сохранение старого candidate при ошибке, уведомление subscribers | Уже перенесён в `packages/durable-reload`: не копировать второй раз и не создавать другой loader. Исправлять существующий перенос. |
| [Старый Durable runtime: reload](/home/ubuntu/.local/share/pi-durable/host/packages/coding-agent/src/experimental/durable/runtime.ts#L540) | Готовый сценарий: settings reload → adapters reload → обработка memory controller → refreshGoalSkills → notice, та же сессия | Восстановить покрытие через текущие Store/SDK routes. Не переносить обратно terminal-owned Harness/storage. Старый drain/close/bind нельзя автоматически считать безопасным при busy. |
| [Старый Hindsight controller: reload](/home/ubuntu/Projects/pi-durable-playground/hindsight/index.mjs#L145) | Стабильный controller/binding/subscription, замена extension через native `registry.install` | Образец busy code replacement. Для transitive imports использовать уже имеющийся Jiti-loader, не размножать `?reload=` на entry. |
| [Native Durable registry](../../../apps/dpi-backend/node_modules/@earendil-works/pi-durable/dist/harness/registry.js#L58) | Публикация definitions и native phase snapshots | Не создавать свою систему поколений чистого кода или task executor. Проверить текущую facade и её видимость для Harness. |
| [Старый ResourceLoader.reload](/home/ubuntu/.local/share/pi-durable/host/packages/coding-agent/src/core/resource-loader.ts#L505) | Готовые правила discovery, enabled resources, project trust, settings, skills/prompts/themes/context и очистка extension cache | Использовать доступные resource-reading API текущей зависимости. Если API не экспортирован, перенести только нужный код с provenance. Не вызывать package resolution, способное скачивать/устанавливать, без разрешения; Pi ExtensionAPI не равен Durable adapter. |
| [Старый AgentSession.reload](/home/ubuntu/.local/share/pi-durable/host/packages/coding-agent/src/core/agent-session.ts#L3612) | Поведенческий reference широкого `/reload`, сохранения tools/flags и обновления меню | Не переносить AgentSession или глобальный `resetApiProviders` в общий Host. Это reference, а не готовый multi-session runtime. |
| [Текущие models](../../../packages/durable-reload/src/models.ts), [memory controller](../../../apps/dpi-backend/src/native-profile/memory/session-memory.mjs#L45) | Уже существующие `prepareReload` и scoped `reload(target)` | Подключить раздельно к штатной операции, сохранить точные selections/bank/log scope; не писать новые provider/auth/memory runtimes. |
| [MCP composition](../../../experiments/sdk-host-cutover/session-mcp.mjs), [DeLM attach](../../../experiments/sdk-host-cutover/delm-profile.mjs), [Component lifecycle](../../../experiments/gippity-voice/node_modules/@howaboua/pi-durable-components/dist/index.js#L221) | Существующие managers, late attach и lifecycle | Убрать конкретные статические binding/import ограничения в адаптерах; API reload/retire проверять до применения. Новая lifecycle-обёртка не считается необходимой заранее. |
| [SDK/TUI transport](../../../apps/terminal-adapter/src/remote-controller.ts#L288) | Уже готовая команда и доставка её результата | Не вводить новый update protocol ради первой реализации. Добавить только недостающий статус, если существующий результат его не выражает. |

**Важное уточнение причины:** старый `DurableExtensions.reloadWhenIdle` уже запрещает reload при активных tasks. Этот барьер не впервые появился в нынешнем Host. Рабочий образец обновления на busy — отдельный старый Hindsight controller плюс native registry, а не неизменённый общий старый `/reload`. Перенос целиком не решит HU-2; нужна узкая адаптация, подтверждённая S1. В просмотренных старых reload/controller файлах не найден watcher всего окружения: автоматически объявлять его готовым нельзя.

### Что ещё не доказано

Совместимость произвольного extension-кода, отсутствие утечек при серии reload, точный момент смены provider при streaming, безопасное завершение component generation, работа watchers на всех целевых файловых системах, автоматическое обновление TUI inventory. Для них ниже запланированы проверки; отсутствие доказательства не означает отсутствие возможности.

## 3. THINK + arch: ограничения и выбранный подход

Применён FirstPrinciples/Challenge: отделить ограничение данных/выполнения от решения нашей обвязки. Метод использован как анализ; voice endpoint и посторонний LifeOS execution log не вызывались. `arch`: clean-architecture, правила «самая лёгкая достаточная граница», «политика владеет интерфейсом», «заменяемые детали», «никаких новых сервисов только ради параллельной работы».

| Утверждение | Тип | Проверка/решение |
|---|---|---|
| Изменение файла само заменяет JS-объект, который уже исполняется | Неверное предположение | Нужны fresh load и явная публикация. Начатое выполнение нельзя незаметно переписать. |
| Для reload все задачи обязаны стать terminal | Ограничение старой и текущей обвязок; native registry сам этого не требует, исходный авторский мотив не установлен | Для совместимого handler replacement удалить барьер только после реального native busy-roundtrip. Сохранить узкие барьеры несовместимости. |
| Все native extensions должны быть неизменными guards | Решение композиции | Оставить guards и authority стабильными; обычное поведение вынести из защищённой идентичности. |
| Требуется отдельный процесс на каждое расширение | Непроверенное предположение | Для чистого кода достаточно registry. Процесс нужен при внешнем lifecycle, native/global state или невозможности выгрузки. |
| Старый код удерживается до конца всей задачи | Слишком широкое предположение | Durable фиксирует код на фазу; совместимый task может перейти на новую definition после progress. Проверить фазовые и recovery cases. |
| Переключение откатывает внешний эффект | Невозможно в общем случае | Откат только будущего dispatch; uncertain результат не переотправлять автоматически. |
| Один SQLite owner и текущие права обязательны | Принятые требования ISA, а не ограничение горячей загрузки | Не менять. Отзыв прав проверяется всеми поколениями. |
| 90% подтверждены существующими наблюдениями | Непроверенное предположение | Нет статистики частоты изменений; принять явный корпус, не выдавать его за production-метрику. |

### Сравнение альтернатив

1. **Только убрать `assertIdle`.** Мало строк, но остаются статические imports, frozen reader, ресурсы и несовместимые схемы. Отклонено.
2. **Все модули в отдельные процессы.** Изоляция полезна, но добавляет IPC, состояние и новые контракты даже для простого prompt/tool. Отклонено как основа.
3. **Восстановить широкий старый `/reload` на существующем переносе; подключить имеющиеся controllers и native replacement.** Сохраняет готовые loader, settings/resource discovery, SDK transport и lifecycle. Только подтверждённые несовместимости адаптируются под общий Host. **Выбрано.** Автоматическое обнаружение не является предпосылкой такого восстановления.

### Граница стабильности

**Стабильный Host:** storage/Harness/scheduler, admission и grants, неизменные guard-обёртки, идентичности задач/документов, единый координирующий путь загрузки. Код этого ядра не становится произвольно заменяемым.

**Обновляемое окружение:** инструкции/skills, ordinary tools/sections/hooks, совместимые обработчики фаз, provider-адаптеры, конфигурация и адаптеры MCP, callbacks memory/tracing, DeLM-обработчики, presentation и совместимые обработчики компонентов.

Ресурсный controller остаётся стабильным, пока меняются его обработчики. Если меняется сам controller, он участвует в существующем lifecycle prepare/bind/retire. Это не замена всего profile factory на работающем Harness.

## 4. Продуктовые решения — принятый scope

Пользователь разрешил реализацию данного плана с усилением критериев и rollback. Ниже фиксируется выбранный минимальный вариант; необязательные альтернативы D01/D02 не считаются одобренными. Проверяемые leaf-критерии добавлены в каноническую ISA, а не заменены этой таблицей.

| ID | Предложение | Пользовательский эффект и граница |
|---|---|---|
| D01 | **Выбрано: широкий штатный `/reload`, без обязательного watcher** | Не требует рестарта. Автоподхват при сохранении — отдельный выбор пользователя; если нужен, это тонкий trigger того же пути, а не новый загрузчик. Уже динамический текст продолжает читаться на следующем запросе. |
| D02 | **Выбрано: `/reload` обновляет текущую сессию, как раньше** | Project/global определяют разрешённые источники. Рассылка во все открытые сессии нужна только при отдельном выборе пользователя и operator scope; спящие/failed сессии ради неё не открывать. |
| D03 | **Начатую работу не обрывать**; совместимое обновление не ждёт idle всей сессии | Старый вызов/фаза заканчивается старым кодом; следующий использует новый. Уже отправленный model request не получает новые инструкции задним числом. |
| D04 | **Несовместимость блокирует только затронутый компонент/набор**, с понятной причиной | Несовместимую смену схемы, удаления используемых определений и lifecycle без безопасного handoff не применять молча. Не выдавать это за успешный reload и не перезапускать Host автоматически. |
| D05 | **Неудачный кандидат оставляет прежнюю версию; откат не переигрывает действия** | Смена готового runtime snapshot атомарна внутри одного набора одной сессии; это не общая транзакция с SQLite selections и внешними ресурсами. Переходы с selection/lifecycle имеют явные промежуточные состояния. Глобальное обновление показывает смешанные ревизии. |
| D06 | **Автоподхват не даёт новых полномочий** | Только заранее разрешённые источники/пакеты. Новое доверие, capability, внешняя установка/скачивание и алгоритмы безопасности требуют отдельного одобрения. Не исполнять найденный произвольный файл. |
| D07 | **Таймаут обновления не убивает принятую работу** | Показывать deferred/draining и причину; не плодить новые ресурсные поколения поверх незавершённых. Для зависшего компонента — отдельное решение, не скрытый kill Host. |
| D08 | **«90%» измерять корпусом U01–U20** | Все U01–U18 должны проходить без Host restart; U19–U20 — явные maintenance cases. Это 18/20 классов, не 90% фактических событий и не право объявить готовность при провале DeLM или providers. |
| D09 | **Перезапуск оставить для ядра/несовместимых миграций и первого внедрения механизма** | Первый production cutover может потребовать одного планового рестарта, только после отдельного разрешения. Обычное обновление интеграции после внедрения — не cutover Host. |
| D10 | **Честный результат существующей команды: что обновлено и что осталось прежним** | SDK/TUI показывают успех, ожидание, отказ или необходимость maintenance; ошибка не теряет draft и не запускает model turn. Отдельная панель ревизий и новый status protocol не обязательны. |

## 5. Минимальные инженерные контракты

### 5.1 Единый путь обновления, не новый framework

Реализация начинается с уже перенесённого `packages/durable-reload`, а не нового manager. Сохранить текущие Store/HTTP/SDK/TUI interfaces и server authorization. Разделить чистую замену definitions и операции models/resources только там, где их совместный idle-barrier мешает S1. Native registry остаётся владельцем snapshots; существующие controllers — владельцами ресурсов.

На каждую карточку требуется короткая цепочка: **старый файл/функция → текущий перенос → доказанный пробел → минимальная адаптация → regression test**. Если существующий API достаточен, использовать его без дополнительного фасада. Новый registry, generic generation manager, package ABI manifest, журнал обновлений или storage schema заранее не требуются. Их необходимость нельзя обосновать одной удобностью проектирования.

Сохранить нынешнюю сериализацию reload одной сессии и существующий no-replay transport. Ошибка/потерянный ответ не разрешает повторить пользовательское внешнее действие. Если D01/D02 требуют автоматического или массового trigger, его гонки/нагрузку проверять отдельно; не внедрять общий revision orchestration ради ручного `/reload`.

### 5.2 Загрузка, обнаружение, публикация

1. Брать готовый Jiti-loader и проверки adapter result. До исполнения candidate проверять текущие права, canonical path и разрешённый источник; перед publication — отзыв прав и закрытие сессии. Доверие к старому коду не отменяет Host security boundary.
2. Сохранить per-PromptInput чтение context/skills; повторно читать settings/discovery через существующие API. Не вводить watcher для текста, который и так читается заново.
3. Загружать завершённую установку/build, не пакет посреди записи. Проверить transitive dependencies и изменение файлов во время загрузки. Для editable source при выявленном конфликте отклонить кандидат; новый snapshot/build manager не вводится без доказанной необходимости.
4. Сохранить старый исправный registry при ошибке подготовки. Не применять старый `drain/close/bind` без проверки на busy; новый producer не должен стартовать до безопасной передачи admission. Ошибка cleanup после publication не равна «ничего не изменилось».
5. Использовать native registration/selection APIs. Добавление не выдаёт доступ автоматически; удаление не уничтожает definitions уже принятой работы. Commit selection и in-memory publication не являются общей транзакцией: проверить их fault points и восстановление, не переигрывать внешние действия.
6. Проверить существующий registry facade: `install/uninstall`, повторный adapter reload, memory reload после publication должны быть видны Harness. Общими могут быть неизменяемые артефакты, но не session bindings, credentials и mutable instances.

Только если утверждён автоподхват D01: использовать готовый подходящий watcher либо платформенный API как trigger существующего reload, объединять события, не готовить повторно один кандидат и отбрасывать устаревший результат. При D02 «все сессии» ограничить параллельную подготовку. Обе опции не являются предпосылкой S1 или основанием писать новый runtime.

### 5.3 Совместимость и безопасные границы

- **Текст:** следующий PromptInput/каталог. Старый prompt и история не переписываются.
- **Tool/hook/section code:** неизменные ID и совместимая схема; начатая native фаза сохраняет snapshot. Добавление optional argument не равно произвольной смене семантики или replay policy.
- **Task handlers:** только стабильные kind/version/input/checkpoint/doc-контракты либо отдельно доказанная совместимая native migration. Registry notification не создаёт новые tasks. Schedule/Goal/DeLM IDs не меняются.
- **Каталог инструментов:** модель могла получить старую схему до публикации. Проверять сценарий «generation v1 → publication v2 → tool call v1». Для несовместимой схемы — deferred/rejected до подходящей границы, не исполнение старых arguments новым несовместимым кодом. Не обходить это общей остановкой всех задач.
- **Providers:** начатый stream удерживает provider/auth context; новый request использует новый адаптер. Выбор provider/model не переписывается. Удаление используемой модели не даёт silent fallback; reload обычного extension не вызывает OAuth/login или платный model call.
- **Ресурсы:** существующий controller либо component lifecycle владеет соединением/подписками. Счётчик одних tool.execute недостаточен: учитывать уже захваченные hooks/sections, queued work, native waits и producers. Если нельзя доказать quiescence, старое поколение не закрывать. Использовать ограничения существующего manager/controller; не начинать следующую ресурсную замену, пока предыдущая не завершила cleanup. Для чистых snapshots объекты могут жить до конца native фаз, но не удерживаются бессрочным кешем загрузчика. Собственный универсальный generation tracker не требуется.
- **Длительные waits и Harness-retention:** менять обработчики вокруг стабильного ядра, не пересоздавать scheduler/wait owner. Для замены самого ядра требуется отдельная стратегия handoff; простой `beforeClose` может отменить принятую работу и потому не подходит.

### 5.4 Полномочия, rollback и восстановление

Guard-обёртки вызывают актуальную политику на каждой новой отправке/действии независимо от поколения. Отзыв прав важнее обычного drain. Уже выполненный внешний эффект не отменяется; отмена in-flight — best effort по существующему контракту, без retry неизвестного исхода. Автоматический refresh выполняется по текущей server-owned политике разрешённых источников, не по сохранённому запросу с уже отозванным grant.

Загружаемый in-process JS — доверенный код оператора, а не sandbox. Проверка registry не защищает Host от намеренно вредоносного top-level кода. Недоверенные плагины не включаются этим планом; отдельный процесс того же Unix-пользователя тоже не считается защитой от чтения SQLite.

Для Agent Mail неизменны admitted identity, lease conflicts, запрет admin-операций и отсутствие переноса registration token между проектами. Горячая конфигурация разрешённой области не заменяет алгоритм canonical-path/authorization.

Откат выбирает прежний проверенный package revision только для будущих вызовов. Использовать текущую operator-owned установку и предыдущие immutable artifacts; не писать второй журнал выполнения. Если прежняя версия уже не принимает созданное состояние, rollback запрещён с явной причиной, нужен forward fix/разрешённое обслуживание.

После неожиданного restart использовать существующую installed profile/resume цепочку и проверить совместимость до продолжения pending tasks. Временный каталог с исчезнувшим кодом не считается установкой. Проверить missing artifact, pending task/doc definitions и unsafe effect recovery на disposable данных. Не вводить отдельную таблицу revision bindings заранее: если существующая recovery цепочка не различает нужные версии, сначала зафиксировать конкретный failing case S3 и минимальное расширение текущего Host owner. Атомарность памяти и SQLite не предполагается; внешнее действие автоматически не повторяется.

### 5.5 Простой откат — обязательный результат, а не обещание

**Горячий откат, ISC-71–73.** До замены сохранить проверенный предыдущий неизменяемый artifact и его digest средствами существующей установки. Одна документированная операторская команда выбирает предыдущую совместимую версию и вызывает существующий reload текущей сессии. Не требуются ручные правки нескольких файлов, новый registry или второй execution journal. Конкретный синтаксис обязан появиться в реализации и пройти installed test; не объявлять ещё несуществующий `/rollback` готовым API.

Начатые фазы заканчиваются захваченным кодом; последующий dispatch возвращается на v1. Receipt и effect count не меняются из-за отката. Если v1 несовместима с созданным состоянием, до публикации — отказ с причиной и предложение forward fix/отдельного maintenance. Проверить v1→v2→v1, ошибку preparation, lost ACK, cleanup failure и повтор того же operator request. Восстановление config/selection через существующий owner не означает отмену внешних действий.

**Возврат Host release, ISC-74/78.** Alice сохраняет два запускаемых immutable closure и manifest: предыдущий проверенный release и новый candidate. Frank готовит короткую операторскую инструкцию `проверить → переключить → вернуть`, используя существующий release selector/service path; если готовой команды возврата нет, допустима только узкая обёртка существующих операций, не deployment framework. После preflight/отдельного разрешения возврат выполняется одной командой с явным target, без ручной подмены нескольких файлов. Команды production сейчас не исполняются.

Перед switch: проверить manifest, автономность обоих artifacts, совместимость **актуальных** данных с возвратной версией, полномочия и точный выбранный service/dataDir; сохранить backup и текущий selector. При несовместимости либо неизвестной совместимости переключение с обещанием простого возврата запрещено. Откат release не копирует старую БД поверх новых результатов и не удаляет lock на основании таймаута. Второй владелец запрещён; старый процесс/его cleanup должны иметь подтверждённый исход.

Heidi репетирует на отдельных disposable данных: запуск прежнего release → новая запись/принятая работа → candidate → новая запись → возврат прежнего release на **той же актуальной совместимой БД**. Проверяются история, exact receipts/IDs, один owner и отсутствие replay. Отдельно inject startup failure и отказ остановки только тестового Host: ограниченное ожидание, диагностика и отсутствие второго владельца вместо бесконечного зависания/слепого kill. Команда с чужим service/dataDir или несовместимым state обязана отказать до mutation. Если текущий старый release несовместим, итог честно BLOCKED, а не backup restore с потерей новых действий.

**Граница приёмки.** Минимум: горячий rollback и release rollback успешно повторены независимой QA на точных packaged artifacts; recipes называют реальные команды, версии, пути, предусловия и отказные исходы. Упаковка/документ без запуска не закрывает критерии. Дополнительно повторить recovery/cleanup/readiness/reconnect проверки [restart REPORT](../verification/restart-repair-20261101/REPORT.md). Его auth FAIL и незаконченный review нельзя закрыть новым happy path. Production cutover остаётся отдельным решением даже после PASS.

## 6. Корпус обычных изменений: что означает «90%»

Корпус предложен по фактическому inventory профиля и запросу пользователя. После утверждения его нельзя сокращать ради процента. U01–U18 обязательны все; разрешено применять на безопасной границе без Host restart. U19–U20 проверяют честный отказ. Незавершённая операция с вечным ожиданием не считается успешно применённым обновлением только потому, что PID не изменился.

| ID | Пользовательское изменение | Требуемое поведение / исполнительный срез |
|---|---|---|
| U01 | AGENTS/инструкции проекта | Новый запрос получает новый текст, другая сессия изолирована — S2. |
| U02 | Добавить, изменить, удалить skill | Обновляются разрешённый каталог и новое чтение; активная Goal не теряет закреплённый контракт — S2. |
| U03 | Код prompt section/обычного hook | Новая фаза использует новый код, начатая сохраняет старый — S1/S3. |
| U04 | Код/описание обычного tool | Реальный busy-roundtrip, тот же Harness — S1. |
| U05 | Изменить transitive JS/TS dependency extension | Используется новая зависимость, без накопления ESM-кэша как скрытого требования рестарта — S1/S6. |
| U06 | Установить/выключить/удалить разрешённое extension | Catalog/selection согласованы; используемые определения не исчезают во время принятой работы — S2/S3. |
| U07 | Совместимо расширить schema инструмента | Старый model-issued call корректен, следующий prompt видит новую схему — S3. |
| U08 | Совместимо изменить native task phase | На checkpoint работает новая фаза, прежние IDs сохранены — S3. |
| U09 | Обновить catalogue/model metadata или credential source через прежний credential owner | Новые requests используют актуальные данные; без model remap, утечки и автоматического login — S4. |
| U10 | Изменить provider implementation при том же SDK ABI | Старый stream завершается, новый request идёт через v2 — S4. |
| U11 | Добавить/изменить/отключить разрешённый MCP server | Новый каталог/соединение применены, неподтверждённые capabilities не появляются — S5. |
| U12 | Обновить MCP transport/adapter code с тем же контрактом | Новые calls используют v2, отправленные v1 имеют явный исход — S5. |
| U13 | Обновить Hindsight recall/prompt или tracing callback | Обновляется код, сохраняются банк, log paths, controller и единственная subscription — S3/S5. |
| U14 | Обновить совместимое поведение DeLM tool/engine adapter | Сохраняются pending wait/delivery IDs; новые операции используют v2 без duplicate wake — S5. |
| U15 | Изменить совместимый hook Goal/schedule/subagents | Сохранены authority, acceptance и одна schedule occurrence; новый код виден на новой фазе — S3/S5. |
| U16 | Изменить разрешённые policy values, timeout/лимит | Проверенная snapshot-конфигурация, актуальный revoke для всех поколений — S2/S5. |
| U17 | Обновить presentation клиента/renderer | Сам Host не меняется; клиент обновляется/переподключается без потери draft, задач и истории — S6. |
| U18 | Обновить совместимый GipPity handler/component adapter | После завершения активной audio operation применяется v2 без остановки Host и потери input — S5. |
| U19 | Изменить Harness/scheduler, security algorithm, shared SDK ABI/native dependency | Предварительно показывается maintenance-required; никакого скрытого рестарта — S6. |
| U20 | Несовместимо изменить persisted task/doc/storage schema | Отклонить до resume/publication; отдельный migration/backup план — S3/S6. |

Дополнительно: неподдерживаемые native/global-state packages не получают обещание hot reload только потому, что называются extension. Их compatibility report обязан назвать конкретную причину и затронутый компонент. Это не основание объявить все обычные интеграции «ядром».

## 7. ParallelPlan: рабочие вертикальные срезы

Это planning IDs; реальные task IDs/claims создаются и читаются только на существующей доске. Все новые продуктовые проверки ниже **NOT RUN**. Число исполнителей не меняется; 8 существующих actors не означают 8 независимых писателей. У каждого среза есть пользовательский результат, реальный путь и ограничение.

### S1 — заменить обычный инструмент во время работы

**Первый рабочий результат:** пользователь меняет разрешённый JS/TS tool module, вызывает существующий `/reload`, получает v2 в следующем вызове; задержанный вызов v1 заканчивается, независимая задача и другая сессия продолжаются.

- Путь: terminal/SDK reload → действующая server authorization → общий reload owner → fresh loader → native registry → реальный Harness/ToolTask → native result.
- Использовать native full-profile fixture и действующий HTTP/SDK route, не отдельный игрушечный registry. Существующие guards остаются вокруг заменяемого tool.
- Владелец coupled изменений: `packages/durable-reload/src/*`, `runtime-profile.ts`, `native-profile/profile.ts`, узкие места Store/routes. Разделить pure code update и models/resource update; устранить frozen-reader расхождение.
- Контракт S1-C: текущий reload route/result, server-owned sources, scope текущей сессии, понятная причина отказа/ожидания. Зафиксировать достаточность существующего API; добавлять поле только при подтверждённом пробеле. Не проектировать новый revision protocol или raw module-path API.
- Проверки: активный v1, v2 new call, same PID/Harness/IDs; repeating reload; transitive dependency; bad import; duplicate names; guard substitution denied; revoke во время prepare; concurrent update; close-vs-publish; live schedule не блокирует; hidden-base install case.
- Вход: утверждённый план и согласованные владельцы restart-repair. Выход: S1-C contract-ready, затем один интегрированный артефакт/fixture. Не ждать окончания всех будущих срезов.
- Исключения: пока ручной trigger, неизменная schema, без замены resource controllers/providers. Это полезный, но не финальный продукт.

### S2 — вернуть широкое покрытие старого `/reload`

**Результат:** команда подхватывает разрешённые установленные adapters, settings, skills/context и меню без рестарта. Поведение берётся из старого Durable runtime и готового resource discovery, а не из новой системы конфигурации.

- Сопоставить старый `settingsManager.reload → extensions.reload → refreshGoalSkills → notice` с текущими native API; восстановить отсутствующие вызовы. Не переносить global provider reset или standalone Session runtime.
- SDK/TUI используют существующий ответ, обновляют inventory/menu и сохраняют draft/focus. Не вводить отдельную панель или протокол статусов без необходимости.
- Проверки: add/delete разрешённого adapter/skill, changed settings, nested imports, bad JSON/import, неподготовленный пакет, cross-project denial, ignored untrusted root, отсутствие автоматического скачивания и ложного success.
- Только при выборе D01/D02: добавить тонкий автоматический trigger/массовый вызов; проверить atomic-save, пропущенное событие + ручной reload, duplicate triggers, bounded fan-out и честные частичные результаты. До выбора не создавать эти карточки.
- Зависит от S1-C; client/discovery fixtures могут готовиться до integrated S1. PASS требует реального S1-пути. Это не новый package installer.

### S3 — схемы, фазы и recovery без потери работы

**Результат:** обновляется совместимый extension с tool/hook/task/prompt; несовместимое обновление получает узкий отказ, не ломая сессию.

- Проверить generation→tool schema window, queued/nested calls, phase checkpoints, pinned Goal content, retained definitions и выбор extensions.
- Memory reload публикует декорированные callbacks в видимый registry; logs/bank остаются session-local. Automation core остаётся единственным владельцем timers/admission.
- Проверки: compatible schema; removal в use; registration→selection commit→publication fault points; same task ID новая фаза; incompatible checkpoint; restart disposable Host после публикации и между native selection commit/publication; missing artifact и несовместимый installed profile; interrupted unsafe effect не повторён; two-session memory/log scope до/после reload/fork.
- Зависимость: integrated S1. Узкие core edits принадлежат тому же владельцу, что S1; integration-specific handlers могут готовиться отдельно по S1-C.

### S4 — provider/catalogue обновляется независимо от extensions

**Результат:** менять код совместимого provider и metadata можно без Host restart и без обрыва текущего stream.

- Сохранить стабильную models facade и точные choices. Развести current selection, доступность catalogue и provider generation; не проверять все модели при обновлении несвязанного tool.
- Владелец: `packages/durable-reload/src/models.ts`, `operational-models.mjs` и отдельные tests. Общие index/profile edits передаются одному владельцу S1/S3.
- Проверки: локальный faux streaming v1→v2, rotated synthetic credential source, удаление используемой модели, fail prepare и rollback, no live OAuth/network, отсутствие model remap. Сохранить provider/model IDs при reopen.
- Зависимость: S1-C для разработки, S1 для интегрированного PASS. Не новая provider/auth система.

### S5 — долгоживущие интеграции без перезапуска владельца

**Результат:** MCP, memory/tracing, DeLM, automation и GipPity используют обновлённое совместимое поведение без нового Harness и duplicate producers.

- Для каждого владельца выбрать существующий шов: MCP manager reload; memory controller reload; стабильные DeLM admission/wait identities; стабильный automation core; Component SDK lifecycle для GipPity.
- Прежде чем использовать Component SDK `retire`, доказать локальный whenIdle и отсутствие cancellation принятой работы. `retention:harness`/afterClose не маскировать счётчиком активных tools; изменяемые callbacks отделить от retained kernel. Если требуется изменение API стороннего пакета, вернуть конкретный blocker/patch scope, не менять dependency молча.
- Ресурсное обновление не запускает второго scheduler/subscription до безопасной передачи admission. При незавершённом drain следующая замена этого компонента получает честное ожидание/отказ; другие компоненты продолжают обновляться. Не добавлять фоновую очередь поколений без необходимости.
- Проверки: local MCP v1/v2 и failed candidate; revoked access на обоих поколениях; exact Mail identity/token scope; DeLM pending wait и один wake; Goal/schedule IDs и одна occurrence; active voice завершается и новая операция использует v2; cleanup error сохраняет владельца ресурса для повторного cleanup, но не переигрывает внешнее действие.
- Зависимости: S1 + правила совместимости S3; provider-related GipPity проверяется после S4. Делить на независимые карточки по интеграциям при передаче на доску, не создавать сервис на каждую карточку.

### S6 — упаковка, клиентский путь и приёмка всего корпуса

**Результат:** установленный изолированный кандидат проходит U01–U20, SDK/TUI не обещают лишнего, инструкция установки отделяет hot update от maintenance.

- Упаковка включает разрешённые loadable artifacts и transitive dependencies; никакого hardcoded `c0019d7-sse1`, скрытой ссылки на checkout или mutable домашний исходник. Канонические пути сохраняют проверки безопасности.
- Сборка из согласованного дерева с restart-repair fixes. Реальный независимый code review и QA — на одном immutable candidate с digest, а не на moving checkout. Эти роли не принадлежат авторам проверяемых изменений.
- Серия ≥100 смен одного чистого extension и ≥20 resource replacements: descriptors/processes/listeners возвращаются к baseline; количество retained generations ограничено. Сравнить RSS после quiescence с named baseline; устойчивый линейный рост требует устранения, не рекомендации «периодически рестартовать». Числа — предлагаемые нагрузочные fixture budgets.
- Реальный terminal/SDK path; native IDs, результат существующего reload, опциональный watcher только при D01, all compatibility negatives, clean HOME install. U17 проверять reconnect клиента без рестарта backend.
- Повторить только затронутые restart-repair regressions на финальном кандидате: background readiness, cleanup, lost ACK/no replay, draft/focus, one owner. Не переносить старые PASS на изменённые файлы.
- Обязательные deliverables: executable горячий rollback и короткая инструкция возврата release; независимая репетиция §5.5 на тех же immutable artifacts (ISC-71–74/78).
- Завершение: accepted implementation candidate, **production NOT RUN**. Нельзя закрыть acceptance только compile/unit mocks или счётчиком unchanged PID при неприменённом коде.

### Зависимости, параллелизм и handoff

```text
утверждение пользователя + согласование живых owners
  → S1-C → S1 integrated → S3
       ├→ S2 разработка → S2 integrated после S1
       └→ S4 разработка → S4 integrated после S1
S1 + S3 → S5; provider/voice часть S5 также после S4
S2 + S3 + S4 + S5 → S6 candidate → независимые review/QA → приёмка
```

S1-C — промежуточный проверяемый интерфейс внутри S1, не завершение всего S1. Его публикация разблокирует disjoint consumers, но не продуктовую приёмку. Нет зависимости проверки от уже закрытой приёмки.

| Поток | Exclusive write ownership | Когда полезен |
|---|---|---|
| Core reload | Carol: index/registry/loader, runtime-profile/profile, согласованные Store/routes edits; Alice: отдельная упаковка/rollback artifacts | Сразу после разрешения и handoff текущих владельцев |
| SDK/TUI | Eve: SDK api/client, remote-controller, отдельные UI tests | После S1-C; общие routes меняет Core owner |
| Providers | Dave: models.ts, operational-models и отдельные fixture files | После S1-C; общие index/profile edits через Core owner |
| Integration owners | Bob: memory/MCP/GipPity; Frank: DeLM/automation; общий profile меняет только Carol | После контрактов S3; не общая запись в profile |
| QA support | Новые изолированные fixtures/acceptance harness | Можно рядом с S1, только если есть named consumer; не считать integrated |
| Milestone reviewers | Read-only выбранный candidate, собственные sandbox outputs | После S6 candidate; не авторы проверяемых частей |

Начальная полезная ширина — Core + независимая подготовка fixture (до 2), после S1-C — Core/client/provider/fixture (до 4), затем независимые интеграции по готовности. Это рекомендация работы, не утверждение о свободных нынешних actors. Большое число агентов не сокращает последовательную проверку publication/compatibility.

Каждый handoff содержит: slice/критерии, revision/digest, входной контракт, scope файлов, tests и фактический outcome, незакрытые риски, следующего integration owner. Уровни доказательства: contract-ready → component-verified → integrated; не новые статусы доски. Временные HOME, SQLite, ports, sockets, process groups и build outputs независимы либо сериализованы.

## 8. Покрытие и обязательные проверки

| Требование | Срезы | Приёмочное доказательство |
|---|---|---|
| HU-1, HU-3 | S1/S2/S3 | U03–U08: same Harness, v1/v2 result, фазовый checkpoint и обновлённый inventory |
| HU-2 | S1/S3/S5 | Активные waits/schedules и независимая session продолжаются во время publication |
| HU-4 | S1/S3/S4/S5 | prepare fault, revoked publication, cleanup failure, rollback future-only, потерянный ответ без resend |
| HU-5 | Все срезы | ISA ISC-1–5, 8, 12–14, 33, 43; отсутствие guard replacement и токенов в логах |
| HU-6 | S3/S4/S5/S6 | ISC-6/7, 15/16, 20–25/45, 42; same IDs и recovery без unsafe replay |
| HU-7 | S3/S5/S6 | Scoped quiescence, ровно один producer, resource census, series reload без линейной утечки |
| HU-8 | S2/S6 | Реальный `/reload`→Host→SDK/TUI result; optional auto-trigger по D01; old-client negative; PID не меняется |
| HU-9 | S6 | Все U01–U18 PASS и U19–U20 корректно отказаны; excluded случаи перечислены до прогона |
| HU-10 | S1/S6 | Сохранены candidate fixes; sandbox admission self-check, scoped regressions, production NOT RUN |

Дополнительно сохранить ISA ISC-9/10/11 (clean install, roundtrip, второй профиль), ISC-18/19/21/22 (TUI/interrupt/reconnect), ISC-26 (изменившаяся задержка по исходному критерию), ISC-37/38/41 (совместимость, независимые пакеты, notices). Полный старый milestone не переоткрывается без затронутого поведения.

### Изолированные проверки после разрешения реализации

Сначала построить sandbox по образцу предыдущей QA, но без доступного рабочего HOME и writable production tree. Только read-only candidate/code и отдельные writable scratch/data; очищенная environment, отдельная сеть с loopback. За пределами sandbox нельзя запускать operational-service/tests для доказательства безопасности.

До product fixture проверить: чтение рабочего credential path недоступно; запись в production tree запрещена; writable HOME/dataDir внутри scratch; spawn не наследует секретные environment variables. Использовать synthetic sentinel secrets. Если sandbox недоступен, проверки с auth/operational composition **BLOCKED**, а не fallback на настоящий HOME. Сам sentinel нельзя создавать в production.

Реальные Harness/SQLite/HTTP/SDK/PTY обязательны. Faux model и локальные recording MCP/voice/provider boundaries обозначаются явно; они не доказывают live vendor APIs. Платные модели, внешние credentials и личные banks не нужны.

Точные команды новых suites определяет исполнитель по реальным package scripts; предлагаемые новые тесты ещё не существуют. Имеющиеся anchors: `packages/durable-reload/reload-safety.test.mjs`, `apps/dpi-backend/tests/profile-reload.test.mjs`, `native-memory-reload.test.mjs`, `native-external-dirs-reload.test.ts`, `experiments/restart-repair-20261101/qa/*`. Нельзя запустить весь старый набор на настоящем HOME только потому, что часть тестов создаёт tmpdir.

## 9. Переход и полномочия DeLM

1. Разрешение на реализацию получено; scope зафиксирован в §1/§4. Передача — новое operator input существующим точным roots, а не замена frozen START/WORKER/bootstrap. Авторизация не включает новую команду или production.
2. При передаче перечитать свежую доску, source review Grace и auth incident status. Существующий restart-repair run сохранить; не повторять готовую работу. Не использовать его QA как доказательство активации.
3. Выбрать согласованный candidate baseline с актуальными fixes. Утверждение этого плана не разрешает checkout/reset/stash чужих изменений. Взять узкие leases и согласовать handoff общих Store/profile/UI файлов.
4. Отразить slices/зависимости на выбранной DeLM-доске через её штатный протокол. Реальные task IDs и claims принадлежат доске; этот документ не становится второй доской.
5. Передать короткий worker contract, ссылки на план/ISA, разрешение только на local implementation и isolated checks, запреты production/restart/credentials/commit/push. Модель, количество новых actors и новый run не выбираются молча.
6. После S6 отдельно решать первый production cutover: закрытый auth-инцидент, завершённые независимые checks, backup/rollback и объявленное окно. Этот план не разрешает его выполнить.

## 10. Ревью и открытые границы

Self-review R1/R2, reuse-first R3 и уточнение R4 зафиксированы в [REVIEW.md](REVIEW.md). Вердикт документа: **готов к передаче и началу S1 в утверждённых границах**, а не доказанная реализуемость всех ресурсных адаптеров. Независимое ревью реализации и изолированная QA обязательны на milestone, но не выдаются за уже выполненные.

Доступные методы: Planning inline synthesis после OBSERVE/THINK/arch, обязательный ParallelPlan. `ce-plan` и `ce-doc-review` не найдены в доступном каталоге и проверенных skill roots; они не запускались. Выполнено self-review по критериям Planning/ParallelPlan и arch, не независимое экспертное заключение. Дополнительная команда для планирования не запускается.

Открытого разрешения на реализацию больше не требуется. Необязательные watcher/global fan-out исключены из текущего scope; production cutover остаётся отдельным решением после всех проверок. Открытые технические вопросы имеют владельцев и проверки в S1/S3/S5: фазовая совместимость, provider stream pinning, Component retention и resource cleanup. Если доказательство потребует изменить продуктовый контракт, исполнитель возвращает точный вопрос; он не вправе автоматически заменить горячую загрузку предложением чаще перезапускать Host.

### Зафиксированные источники исследования

- Старый установленный `.pi/extensions/durable-reload/index.ts`: `cc49977f453dba8a0e9d613fbafc561c0f6c30461204f94227cf85d2a97bccc0`.
- Старый установленный `packages/coding-agent/src/experimental/durable/runtime.ts`: `94bd14a66a92e9b77c4f8222a8494fd0817c67f4aa784c37b38917606810b383`.
- Playground `hindsight/index.mjs`: `8680e46fcf7a4bc58f56a294d45c7e53438930174e2fb1f4320e151e953884ec`.
- SHA-256 прочитанного restart REPORT: `e6179fc2e21cfbecfd6820275abc1a66689c62ced4bb246327c747e777c61ffb`.
- `packages/durable-reload/src/index.ts`: `e962820f0e6abd20da3a0d432857ef1087e7964ab459360a98dd3bcf0af028d1`.
- `packages/durable-reload/src/registry.ts`: `9fbf88e22afaba99c19f1954ff92c8266d5af0ed18983e309e0a83b7ec9e32f4`.
- `packages/durable-reload/src/loader.ts`: `1f039aeb954e7b7346a1191ba2e90f9fd2a6f94ac0ba1c87f23cb29314b2bbd2`.
- `native-profile/profile.ts`: `5cbb2b7dfb8166fcb5cef2652b6599b57b51326e519e9a059897ea0b6333de9d`.
- `runtime-profile.ts`: `18174d851104e4abc8373cf41b6f9db03c699a2d7427d45198472b4a3c5cb4a7`.

Эти hashes идентифицируют исследованные источники, но не freeze всего checkout и не запрет другим владельцам продолжать разрешённую работу.
