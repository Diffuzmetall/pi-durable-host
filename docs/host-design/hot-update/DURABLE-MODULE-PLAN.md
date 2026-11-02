# Durable в центре: модуль обновления и переход на 1.5

Ревизия DM1 · 2026-11-02 · автор BronzeMink.

**Разрешение:** пользователь поручил исследовать границы, составить parallel-plan и передать реализацию существующей команде DeLM.
**Результат:** работающий неактивированный кандидат Durable 1.5 и проверяемая локализация следующих обновлений.
**Production:** запрещены переключение, reload, stop, restart, kill, запись рабочих БД, credentials и installed release.

## 1. Источники и изменение цели

[ISA](../../../ISA.md) сохраняет требования безопасности, владения и поведения. [Hot-update R4](PLAN.md) сохраняет завершённую работу и незакрытые критерии.
[Исследование 1.5](MIGRATION-1.5-REPLAN.md) сохраняет факты миграции, WB-57, ограничения данных и зависимости сторонних пакетов.

Этот план уточняет архитектуру и порядок реализации прежних M0–M5. При расхождении архитектуры приоритет имеет DM1.
Пользователь разрешил не только перенос на 1.5, но и необходимый рефакторинг для упрощения последующих обновлений.
Это разрешение не расширяет доступ к production и не создаёт новую команду.

**Смысл требования:** Durable остаётся единственным движком выполнения. Host предоставляет доступ к нему, а не реализует второй движок.
Следующее совместимое обновление должно менять runtime-модуль, его зависимости и проверенные native bindings, а не клиентские приложения.
Однократные изменения SDK и Host сейчас допустимы: они должны убрать распространение будущих изменений upstream.

Не обещаем неизменность любого стороннего native extension при произвольном breaking release. Такой extension сам зависит от Durable API.
Не обещаем горячую замену ядра Durable в работающем процессе. Горячий reload совместимых extensions остаётся отдельным существующим механизмом.

## 2. OBSERVE: причина нынешней связанности

CodeGraph показал связи Store → streams/public-projection → SDK. Его status сообщил актуальный индекс.
Текущий исходный код подтвердил эти границы:

- `apps/dpi-sdk/src/api.ts` прямо копирует форму `watchEvents()` из Durable 1.4.
- `contract-check.ts` проверяет присваиваемость upstream events нашему wire. Он обнаруживает изменение, но не изолирует его.
- `streams.ts` принимает Harness/Conversation и подписывается на native API непосредственно внутри HTTP-потока.
- `routes.ts` получает Harness через Store. Значит, внешний серверный слой тоже знает устройство runtime.
- `runtime-profile.ts` экспортирует Harness, Tx, Storage и Extension в composition contract.
- SDK и terminal не импортируют Durable напрямую, но оба интерпретируют его старые события.

Ограниченный import scan обнаружил 72 backend-файла с импортами Durable/Chord/pi-ai и пять файлов `durable-reload`.
Scan исключал vendor/compiled/upstream; это показатель распространения знания, не полный inventory установленных зависимостей.
В SDK, terminal и iii тот же scan не нашёл прямых импортов этих трёх библиотек.
Следовательно, проверка только import strings пропустит главную проблему: скопированный upstream protocol.

> 🧠 **From Hindsight memory (Component map)** — SDK задуман клиентской границей, а backend владеет native execution и состоянием. Текущий код подтверждает владение, но показывает утечку upstream representations в публичный контракт.

### Состояние команды на момент планирования

Доска run `dd2390010531461ba678b74bda02dbeb`, sequence 559: 47 DONE, один claim Heidi, восемь OPEN.
Публикация Heidi 558 сообщает PASS шести preliminary режимов на artifact `18724c7afeffda96d63b10c57ca77e1c280598f6fd0c6f60e778e5402c78e73a`.
В числе результатов: 100 code swaps, 20 replacements, backend 71/71 и hot rollback 5/5.
Это её evidence для 1.4, не приёмка 1.5. Старые FAIL, auth incident и release-return остаются открытыми.

Frozen inputs, первоначальные R4 документы и preliminary artifact не переписываются.
Alice должна сохранить эту базу перед согласованием новых tasks. Heidi завершает либо безопасно checkpoint/release свой текущий claim.

## 3. THINK: выбранная граница

Рассмотрены три варианта:

1. **Только поднять версии и заменить вызовы по всему проекту.** Быстрее первоначально, но повторяет проблему следующего release.
2. **Спрятать весь Durable за универсальным framework.** Добавляет второй scheduler, обёртки всех API и собственную модель extensions. Отвергнуто.
3. **Выделить глубокий runtime-модуль и устойчивый клиентский контракт.** Скрывает изменчивые representations, сохраняя native исполнение. Выбран этот вариант.

Применён arch: скрывать изменчивые решения внутри владельца; не создавать pass-through фасад или модуль ради отдельного исполнителя.

### Направление зависимостей

```text
terminal / iii / последующие клиенты
                ↓
     dpi-sdk: наш публичный контракт
                ↓
 Host: HTTP, каталог, grants, маршрутизация
                ↓
 Durable module: session operations, наблюдение,
 admission integration, projection, lifecycle,
 compatibility, native bindings и reload
                ↓
 Pi Durable + Chord + pi-ai → SQLite / providers
```

Это граница кода, не новый процесс, сервис или транспорт.
Начальный owning path: `apps/dpi-backend/src/durable/`. Отдельный npm package пока не требуется.
Нужные native bindings могут остаться в существующих `native-profile/` и `packages/durable-reload/` как явные части runtime-модуля.
Они входят в его compatibility inventory и проверку обновления. Это не разрешение объявить весь backend исключением.

Carol определяет минимальный набор внутренних файлов по реальным потребителям. Не требуется механическое перемещение всех 72 файлов.
Однако маршруты, HTTP streams и публичные SDK types должны перестать знать Harness, Tx, LiveDoc и upstream WatchCall.
Native-only composition contract остаётся внутри runtime-модуля. Его нельзя переэкспортировать под новым именем для прежних потребителей.

### Что модуль скрывает

- Открытие, resume, close и проверку совместимости native session при сохранении одного owner.
- Наблюдение upstream state/deltas, readOnly inspection, watch cleanup и конечные причины завершения.
- Преобразование native history/context/live state в безопасные публичные данные.
- Native admission с проверкой действующих полномочий, журналом receipts и прежними request IDs.
- Регистрацию native definitions, bindings providers/extensions и существующий reload.
- Версии builtin documents, upstream migration и несовместимость сохранённых custom definitions.

Host сохраняет каталог, HTTP authentication и policy decisions. Runtime-модуль сохраняет атомарную проверку перед native mutation.
Нельзя разнести существующую проверку revoke и commit так, чтобы появилось окно неавторизованной записи.
Policy передаёт ограниченные возможности, а не raw Tx наружу. Native state machine, recovery и persistence остаются upstream.

### Что видят потребители

Контракт определяется текущими действиями: send/receipt, interrupt, history/page, observe, configure, reload и авторизованное управление дочерней работой.
Операции сохраняют реальные IDs, native результаты, неопределённые receipts и различие принятия/ответа/idle.
Не вводить универсальный `execute(method,args)` или доступ к произвольному Harness method.

`apps/dpi-sdk/src/api.ts` остаётся источником публичных типов. Carol реализует producer, Eve — consumer.
Для наблюдения нужен собственный публичный state-first контракт: безопасное состояние, revision, bounded updates и восстановление после пропуска.
Его поля определяют потребности клиентов, а не полная форма ConversationView/LiveDoc.

Native deltas применяются внутри границы. Raw delta paths по private documents не уходят клиентам.
Обновления публичного состояния не должны восстанавливать удалённую машину `watchEvents()`.

Eve и Carol сохраняют существующие формы данных там, где они уже устойчивы. Меняют только протекающий контракт наблюдения.
При несовместимом wire change меняется версия протокола; это однократная миграция клиентов в данном выпуске.

Номер публичного API не равен версии Durable. Новая версия Durable сама по себе не меняет публичный API.
Неподдерживаемый клиент получает отказ до mutation. Для пропущенного update используются revision/resync, не повтор команды.

SDK остаётся без runtime dependency на Durable. Terminal не обязан обновлять pi-tui при каждом обновлении Durable.
Зависимость pi-tui обновляется отдельно, когда это необходимо её собственному контракту. Одинаковый номер всех библиотек не является архитектурной целью.

### Расширения: три категории вместо ложной общей совместимости

1. **Наша логика:** memory policy, delivery rules, routing decisions, guards, инструментальная работа. Она не должна читать LiveDoc/WatchCall.
2. **Наши native bindings:** task/document definitions, hooks, registration, storage transactions. Они принадлежат runtime-модулю и могут требовать адаптации.
3. **Сторонние native packages:** отдельная совместимость с Durable. Inventory хранит точную версию, native требования и происхождение адаптации.

Для первой категории выделять стабильный capability interface только там, где есть реальная version-sensitive связь.
Не создавать новый plugin SDK и не переписывать уже независимые функции ради одинаковой структуры.
Для второй категории использовать штатные defineTask/registry/hooks. Не копировать реализации upstream.
Для третьей категории сначала брать совместимый upstream; иначе применять минимальный закреплённый patch с проверкой.
GipPity 0.10.0 требует ранней проверки: его bundle импортирует удалённый `watchEvents`.

## 4. Приёмка локализации обновления

DM-A–DM-G — ссылки этого дополнения. Alice сопоставляет их с ISA без изменения исторических PASS и стабильных IDs.

| Критерий | Проверяемый результат |
|---|---|
| DM-A | Настоящий terminal → SDK → Host → Durable 1.5 → SQLite → tool → answer → reconnect |
| DM-B | Внешние Host layers и публичные declarations не импортируют и не копируют native representations |
| DM-C | Один неизменный клиентский artifact работает с двумя проверочными native bindings вокруг перехода 1.4 → 1.5 |
| DM-D | Наша независимая логика extensions не меняется ради upstream API; нужные изменения локализованы в bindings |
| DM-E | Совместимость dependencies, persisted state и wire проверяется до исполнения; неизвестное даёт явный отказ |
| DM-F | Повторяемая изолированная сборка и qualification используют существующую упаковку, без нового updater |
| DM-G | Полный hot-update корпус и независимые проверки проходят на одном финальном digest; production не активирован |

**DM-C не должен быть фиктивным тестом.** Использовать настоящие 1.4 и 1.5 в отдельных disposable build roots и БД.
Проверочный binding 1.4 ограничен одним общим сценарием: send, tool, answer, history, interrupt/reconnect, scope denial и dedupe.
Он нужен только для evidence изменения реальной upstream границы. Не поставлять вторую runtime-ветку и не поддерживать её постоянно.

Сначала получить работоспособный state-first client на целевой 1.5. Затем зафиксировать его tarball/hash и проверить тот же artifact с baseline binding.
Host transport вне runtime-модуля также должен оставаться неизменным в этом эксперименте.

Меняться могут только проверочные bindings, их dependency closure и metadata сборки. Каждая версия использует только свою отдельную БД.
Сравнение source/artifact hashes и поведения составляет evidence. Одни mocks или typechecks не закрывают DM-C.

Если одинаковый публичный контракт обеспечить нельзя, зафиксировать точную семантическую разницу. Нельзя заменить проверку обещанием будущей совместимости.
Этот эксперимент доказывает локализацию известных изменений 1.4 → 1.5, а не совместимость с любым будущим release.

Для DM-D выбрать реальные потребители memory и DeLM/automation. Сравнить неизменённую прикладную логику и изменённые native bindings.
Не требовать неизменных байтов от уже несовместимого стороннего native package. Его patch и проверки остаются видимыми.

Import/declaration check должен обнаруживать прямые, транзитивные и переименованные утечки. Проверять также compiled bundle и экспортируемые типы.
Нельзя получить PASS через `any`, type cast, wildcard allowlist или перенос всего Host в каталог `durable`.
Отдельная негативная fixture вносит запрещённую зависимость и должна остановить check.

## 5. Parallel-plan: работающие приращения

### D0. Зафиксировать контракт и состав первого среза

Alice сохраняет dirty source snapshot, старые artifacts/evidence и создаёт недостающие задачи на существующей доске.
Carol и Eve определяют публичные state/receipt/error examples и внутренний session interface.
В контракт входят privacy, revoke, revision/resync, lost ACK, answer/idle и различие history/context.
Grace независимо проверяет границу: нет raw native типов, второго runtime или потерянной атомарности.
Alice готовит изолированный dependency closure 1.5. Общие node_modules и dist не меняются под работающими участниками.

**Выход:** конкретные types/examples и список owning files для D1. Не общая диаграмма без потребителя.
Alice не держит grouping claim, который мешает взять рабочую задачу. Зависимости не требуют финальной приёмки для начала проверки.

### D1. Один реальный roundtrip на Durable 1.5

Carol реализует runtime-модуль для одного minimal/faux profile и подключает существующий Host.
Eve переводит SDK и terminal на публичный контракт. Сохраняются TUI, draft, focus и submission journal.
Проверка использует реальный Harness, SQLite, HTTP и PTY в физическом sandbox.
Пользователь отправляет запрос, видит вызов инструмента и ответ, отключается и восстанавливает состояние.

Отдельно проверить denied scope, revoke, lost ACK, несовместимый клиент и безопасные full state/deltas.
Разрыв SSE не останавливает выполнение. Runtime и clients не получают production secrets.

**Выход:** DM-A для минимального профиля и первый consumer-verified boundary. Это ещё не приёмка полного профиля.

### D2. Доказать локализацию на изменении 1.4 → 1.5

Frank строит ограниченную baseline fixture DM-C на сохранённой 1.4 основе. Он не правит product Store или clients.
Eve фиксирует один клиентский artifact после D1. Carol предоставляет runtime binding boundary для fixture.
Alice фиксирует изменяемые и неизменяемые файлы. Grace проверяет отсутствие скрытой смены Host/client и обходов через unsafe casts.

Одновременно Eve/Carol завершают длинную историю, pagination/gaps, immutable records и конечные outcomes.
Проверить `onReport`, `interrupted`, `restart_limit`, `turn_limit`, `nothing_to_answer`, cleanup observer и отсутствие бесконечного ожидания.
Разные БД изолируют версии. Эксперимент не является downgrade изменённой БД.

**Выход:** DM-B/DM-C и сохранённый D1. Результат должен показывать точный объём адаптации, не только число изменённых файлов.

### D3. Подключить полный профиль через native bindings

Bob отделяет реальные version-sensitive связи memory/MCP от независимой логики. Dave выполняет providers/schema/GipPity adaptation.
Frank адаптирует DeLM/automation bindings. Carol один меняет общую profile wiring и native transaction boundary.
Потребители интегрируются после раннего D0-контракта; каждый usable handoff проверяется на работающем D1.
Не ждать полного профиля, чтобы впервые соединить runtime и SDK.

Сохранить task/document IDs, parent-only authority, single wait/wake, occurrence dedupe и model/provider IDs.
Использовать native admission/hooks, когда они полностью покрывают прежний контракт. Не добавлять все новые функции 1.5 автоматически.
`afterRun` не равно завершённому idle. `beforeProviderRequest` не заменяет fail-closed guard.
Проверить root/child settings разных моделей и реально загруженные guards.

**Выход:** DM-D и full profile. Повторить U01–U20, включая busy replacement, reload, rollback и resource census.
Минимальный профиль с отключёнными memory, DeLM или voice не закрывает этот срез.

### D4. Миграция данных и регулярная процедура обновления

Carol адаптирует точный persisted-state preflight и native migrations. Не разрешать неизвестные versions через общую поблажку.
Frank проверяет disposable import/reopen и возврат исходного runtime к отдельной исходной backup-copy.
Alice расширяет существующий packaging recipe и manifest. Не удалять `DEPENDENCY_DELTA_REQUIRES_REBUILD`; реализовать правильную новую сборочную основу.

Runbook: выбрать target → собрать новый closure → проверить imports/contracts → открыть disposable copy → проверить fixed clients → собрать candidate.
Это один существующий процесс с проверяемыми входами, а не новый daemon, updater или timer.
Обычное совместимое обновление меняет runtime pin/lock и при необходимости bindings. Пересборка artifact допустима без изменений исходников Host/SDK.
Breaking semantic change требует явной новой contract revision. Автоматическая деградация возможностей запрещена.

**Выход:** DM-E/DM-F. Synthetic fixtures не закрывают ISC-39 для реальной истории.
Новые production snapshots/reads запрещены. Допустима только ранее разрешённая выбранная копия с подтверждённой identity.

### D5. Один финальный кандидат и независимая приёмка

Alice собирает immutable candidate со всеми dependencies, patches, provenance, bindings и согласованным protocol.
Grace проводит независимое source review. Heidi проводит installed QA на том же digest и отдельных scratch/DB/ports.
Frank может проверять disjoint recovery claims, но собственная fixture не становится независимой QA его реализации.
Все affected FAIL получают воспроизведение и evidence исправления владельца. При изменении candidate пересматривается соответствующее evidence.

**Выход:** DM-G, один воспроизводимый release-кандидат, список открытых операторских gates и production activation NOT RUN.

### Зависимости и полезная параллельность

```text
D0 → D1 → D2 ──────────────┐
       └→ D3 → D4 ────────┼→ candidate → Grace review + Heidi QA → D5
D0 → third-party inventory┘
```

D2 baseline fixtures и D3 capability work выполняются параллельно в непересекающихся путях.
D4 packaging/preflight fixtures готовятся раньше; full-profile verification зависит от D3.
Полезная стартовая ширина: Alice, Carol, Eve, Dave и Grace read-only. Bob/Frank готовят named supporting outputs.
Heidi сохраняет текущий результат и готовит новый QA scope после checkpoint. Восемь участников не означают восемь product writers.

## 6. Владельцы и рабочие области

- **Alice:** manifests/lockfiles, isolated build roots, packaging, task graph и evidence aggregation. Первая публикация связывает D0–D5 с task IDs.
- **Carol:** единственный writer Store/runtime boundary, routes/streams integration, native-import и общей profile wiring.
- **Eve:** SDK public contract/reducer, terminal и iii client adaptations. Не пишет native backend.
- **Bob:** memory/MCP bindings и независимая прикладная логика в своих paths. Общую wiring передаёт Carol.
- **Dave:** providers/tools schemas, third-party compatibility и GipPity adaptation. Не переписывает чужие schema files массово.
- **Frank:** DeLM/automation bindings, physical sandbox, DM-C fixture и migration/recovery rehearsal. Общий core не редактирует.
- **Grace:** независимое read-only архитектурное и source review. Не исправляет проверяемый продукт самостоятельно.
- **Heidi:** QA fixtures/report и installed acceptance. Сохраняет свою независимость от product implementation.

Это предпочтения, не пожизненные роли. Перед claim участник читает свежую доску и проверяет ownership/FAIL/dependencies.
Один coupled file имеет одного writer. Дисковые build outputs, базы и ports разделяются либо сериализуются.
Ранний handoff содержит paths/digest, контракт, отказные случаи, consumer и evidence level.
Уровни contract-ready, component-verified и integrated не заменяют состояния DeLM.

## 7. Сохранённые критерии и блокеры

Все ISC-46–78 сохраняют смысл. D3 проверяет hot-update и интеграции; D5 принимает их на новом candidate.
ISC-39/40 относятся к D4. Успешная synthetic миграция не делает реальные исторические данные проверенными.
ISC-74 и старый PDH-20 сохраняют отдельный совместимый release-return с актуальной историей.
Backup-return 1.5 → исходная 1.4 не закрывает их автоматически и не отменяет внешние эффекты после cutover.

FAIL `477df4a5cc274f7dbc95f34c80e17468` и `a82349fb8abd46eea0602c78dd46f244` остаются видимыми.
Repair-claim PDH-33 требует поддерживаемого пути. Нельзя создавать его дубликат или напрямую менять board DB.
Новые D0–D5 задачи отражают новую архитектурную работу, а не обход guard прежнего rollback.
Auth FAIL `fd6ac2598301430d98429a8a44dd7873` остаётся операторским. Никто из команды не читает и не восстанавливает реальные credentials.

Alice добавляет traceability DM-A–DM-G в канон после сохранения R4 evidence и согласования текущих document readers.
Исторические criteria, hashes и findings не переписываются задним числом. До согласования используется этот явный companion contract.
При невозможности выполнить старую release-return ветвь итог остаётся частичным, даже если новый модуль успешно работает.

## 8. Исполнение и границы разрешения

Работает тот же run, те же восемь точных sessions и прежние модели. Новые workers и повторный bootstrap запрещены.
Для tasks используются actor-local context и delm_wait. Agent Mail и второй tracker не используются.
Alice создаёт отсутствующие tasks; остальные не создают дубликаты и берут готовую работу после её публикации.

При безопасной новой работе не ждать operator-only auth clearance. Не объявлять эту работу общей production-приёмкой.

Разрешены source refactoring, target dependency/lock updates, новые неактивированные artifacts и физически изолированные проверки.
Разрешены необходимые публичные dependency downloads для этой миграции. Платные сервисы, live provider probes и внешние публикации не разрешены.
Общий работающий dependency tree, installed release и frozen artifacts не изменяются.

Нельзя запускать проверяемый reload в собственной live DeLM session. Нельзя читать production data ради fixture.
Commits, push, deploy, изменения timers и обычного Pi/BB stack не входят в поручение.

Свободный участник сверяет готовую работу через поддерживаемый `delm_wait(action=work)`.
Зависимый claim сначала завершается либо безопасно checkpoint/release. Ожидание не должно удерживать единственного владельца нужного output.

## 9. Проверка плана

Автор проверил соответствие ParallelPlan: ранний реальный roundtrip, безопасность в первом срезе, один core writer, отсутствие циклов приёмки.
Независимое review Grace ещё требуется. Product implementation и runtime 1.5 acceptance этим документом не выполнены.

Первое исполнимое действие: Alice фиксирует D0 и идентичность входов; Carol/Eve выпускают проверяемый контракт для D1.
Dave параллельно проверяет совместимость third-party packages. Grace проверяет границу до её широкого распространения.
Команда продолжает реализацию до candidate/evidence либо конкретного внешнего блокера в пределах разрешённого scope.
