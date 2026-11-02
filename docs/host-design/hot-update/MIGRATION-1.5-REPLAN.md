# Durable 1.5: исследование и дополнение к текущей работе

Дата: 2026-11-02. Автор: BronzeMink. Статус: **историческая исследовательская основа, не приёмка продукта**.

**Последующее поручение пользователя:** локализовать обновления Durable в runtime-модуле и передать реализацию существующей DeLM-команде. Действующий план исполнения — [DURABLE-MODULE-PLAN.md](DURABLE-MODULE-PLAN.md). Он уточняет архитектуру и порядок M0–M5; приведённые ниже наблюдения относятся к моменту исследования.

Источники требований: [ISA](../../../ISA.md), [основной PLAN](../PLAN.md), [hot-update R4](PLAN.md), последние поручения пользователя: изучить текущий Host/изменения/статус, затем OBSERVE → THINK → PLAN → parallel-plan. Объединить оставшуюся работу с переходом 1.4 → 1.5 и сделать будущие обновления повторяемыми. BB остаётся отложенным.

Этот документ дополняет R4, а не заменяет его. Текущие ISA, R4 PLAN/HANDOFF, corpus и frozen inputs не изменены: их хэши нужны продолжающейся QA Heidi. Новые задания команде не отправлялись. Производственный Host не изменялся.

## 1. OBSERVE: где мы действительно находимся

### Три разных состояния

| Объект | Свежие наблюдения | Чего они не доказывают |
|---|---|---|
| Работающий Host | User service active; PID `2310878`, запуск `2026-11-01 18:27:29 MSK`; executable Node `24.19.0`. Метаданные code release `c0019d7-sse1` содержат Durable/Chord/pi-ai `1.4.0`. Launcher target зафиксирован в существующем QA baseline. | Это не активация нового hot-update candidate и не проверка production-сессий. БД, конфигурация и credentials не открывались. |
| Рабочий checkout | На чтении: 50 изменённых tracked paths и 40 untracked entries в `git status`; среди них Store, profile, import, reload, memory, SDK/TUI, wrappers и упаковка. Package manifests backend/reload/terminal ещё закреплены на `1.4.0`. | HEAD не идентифицирует эти изменения. Обычный worktree от HEAD потеряет незакоммиченную основу. |
| Новый предварительный artifact | `/tmp/pi-host-hot-update-preliminary-20261101-alice-v1`; manifest `RESTART-CANDIDATE.json`, SHA256 `18724c7afeffda96d63b10c57ca77e1c280598f6fd0c6f60e778e5402c78e73a`. Хэш manifest сверён в этом исследовании; его Durable/Chord/pi-ai — `1.4.0`. | Это `PRELIMINARY_NOT_ACCEPTED`, не финальный PDH-21 и не 1.5. Полную integrity-проверку 27129 файлов здесь не повторял. |

[Передача preliminary artifact](../../../experiments/hot-update-20261101/packaging/preliminary-v1/HANDOFF.md) сообщает шесть завершённых build steps, 12 packaging PASS и 16 import PASS в физическом sandbox. Это evidence Alice для указанного artifact, не новое независимое выполнение этих проверок автором документа.

> 🧠 **From Hindsight memory (Migration readiness: backend, terminal and iii; BB deferred)** — прежняя приёмка отделяла backend/terminal/iii от BB и оставляла перенос выбранной истории и исходный rollback незавершёнными. Текущие ISA и основной PLAN сохраняют ISC-39/40 открытыми; память не используется как свидетельство нынешнего runtime.

> 🧠 **From Hindsight memory (Shared Durable provider and extension reload integration)** — прежний unified reload имел изолированные результаты, но попытка активации потребовала восстановления старого Host. Поэтому сохранение restart-repair и отдельная production-приёмка остаются существенными; текущий статус взят из service metadata и доски, не из старой страницы.

### Доска и занятость

Read-only projection существующего run `dd2390010531461ba678b74bda02dbeb`, sequence **556**: **47 done / 1 claimed / 8 open**. Единственный текущий claim — Heidi, PDH-22; её действующая lease покрывает QA fixtures и QA REPORT. Остальные семь actor sessions на этом снимке idle. Это моментальный снимок, не разрешение переassignить работу или занимать чужие файлы.

- **Уже завершено в source scope:** S1–S5, busy code replacement, discovery, provider replacement, SDK/TUI reload/draft, memory/MCP/voice integration, DeLM/automation, hot rollback, preparation/packaging outputs. PDH-45 MCP review и PDH-55 previous-contract research теперь DONE.
- **Новый прогресс:** Alice завершила PDH-56 и передала preliminary artifact. Публикация Heidi **555** сообщает 100 code swaps PASS и 20 MCP replacements PASS; FD/children/handles/listeners стабильны, прежние registry WeakRefs — 0. DeLM и supplementary hot rollback завершились с exit 0, подробные wrappers ещё проверяются.
- **Открытая QA:** backend mode остановился на staging/import ошибках; PTY прошёл draft replacement/focus, но не нашёл skills menu. Heidi отнесла PTY-причину к отсутствующей `options.skills` в QA fixture и исправляет только fixtures. Это ещё не итоговый вердикт. Рост RSS/heap не позволяет объявить весь ISC-70 закрытым.
- **Остаток:** PDH-20/33 — release-return/старый contract; PDH-21 — final artifact; PDH-23/24 — независимые source/installed gates; PDH-25 — сводка; PDH-5/8 — старый operational/auth gate.

[QA REPORT](../verification/hot-update-20261101/REPORT.md) пока отстаёт от публикации 555: в нём ещё сказано, что нового preliminary artifact нет. Для текущего прогресса используем доску, для окончательной приёмки ждём коррелированный отчёт владельца. Не исправляем его файл за Heidi.

### Три незакрытых FAIL и отдельный процессный блокер

1. `fd6ac2598301430d98429a8a44dd7873`: прежний тест записал synthetic fixture в реальный auth-файл. Нужна операторская проверка вне чата; тестовые PASS не закрывают инцидент.
2. `477df4a5cc274f7dbc95f34c80e17468`: не доказан возврат прежнего полного release на актуальную совместимую БД.
3. `a82349fb8abd46eea0602c78dd46f244`: нет полного чистого target прежнего profile. Исследование Dave нашло возможный узкий путь, а не доказало готовность adapter.

Публикация Alice **554** сообщает, что Carol не может claim PDH-33 из-за relevant FAIL, хотя зависимости DONE. Требуется поддерживаемый repair-claim путь владельца доски. Нельзя снять FAIL без evidence, писать SQL или создать копию той же задачи ради обхода guard. Новая работа по 1.5 имеет иной контракт, но также не должна маскировать старый FAIL.

## 2. OBSERVE: что именно меняет 1.5

Проверены официальный [Durable changelog v1.5.0](https://github.com/earendil-works/pi/blob/v1.5.0/packages/durable/CHANGELOG.md), [pi-ai changelog](https://github.com/earendil-works/pi/blob/v1.5.0/packages/ai/CHANGELOG.md), [Chord changelog](https://github.com/earendil-works/pi/blob/v1.5.0/packages/chord/CHANGELOG.md), опубликованная [npm metadata Durable 1.5.0](https://registry.npmjs.org/@earendil-works%2Fpi-durable/1.5.0) и перечисленные ниже исходники. Context7 нашёл Pi, но в списке доступных версий нет 1.5; старые примеры оттуда не использованы как контракт новой версии.

Node >=22.19.0 уже обеспечен наблюдаемым executable; менять Node ради этой миграции не требуется. Полный согласованный набор tarballs/lockfiles 1.5 пока не собран и не установлен.

| Граница | Текущий код | Изменение и обязательная проверка |
|---|---|---|
| Agent stream | `apps/dpi-backend/src/streams.ts:244`, `watchEvents`; SDK `api.ts` описывает 1.4 events | `Conversation.watch()` и state/deltas вместо восстановления удалённой event machine. Реальный terminal → SDK → Host → tool → ответ. |
| Два клиента состояния | `apps/dpi-sdk/src/models.ts`, `apps/terminal-adapter/src/projection.ts` | Обновить оба. Terminal сейчас удаляет старые entries при reset/compaction; новая view — окно истории, не active context. Нельзя сохранить этот алгоритм механически. |
| История / model context | `Store.activeEntries()` вызывает удалённый `viewState()`; от него зависят transcript/preview | Разделить transcript/history pagination и `Conversation.context()`. В upstream начальное окно по умолчанию 50, default max — 100 (границы настраиваются); не выдавать последние 50 записей за всю историю. |
| Public projection | `public-projection.ts` понимает старые event types | Проецировать и full state, и deltas. Не передавать raw `docs`, `pi.provider`, provider errors или `runFailure.detail`. Сохранить разрешённый application/tool JSON и conversation-scoped readers. |
| Подписки | В исследованных owning paths восемь `subscribeCommits()`; Store/tracing также используют `taskGraph()` | `observeCommits({advance,end})` + `detach()`, `watchTaskGraph()`. Проверить close/failure/revoke/reconnect и отсутствие удержанных listeners. |
| Watch callbacks | `sessionStream` ждёт прямое значение; `subagents/tasks.ts:strand` ждёт старый LiveDoc | Tagged `call.kind`, `call.value`, `call.retired`; `WatchEnd.kind`, `aborted`. Иначе, например, Reporter может принять wrapper за idle child и вызвать abort. Это статически выявленный риск, не воспроизведённая ошибка 1.5. |
| Reports | `store.ts:778` передаёт весь аргумент `onReport` в `reportError`; `errors.ts:35` различает только классы Error | В 1.5 callback получает Report, не Error: неизменённый код классифицирует его как `non-error`. Разобрать `kind`/`error`, сохранить структурное redaction; не логировать raw detail ради диагностики. |
| Outcomes / hooks | `outcome/resolver.ts` использует SnapshotEvent и неполный набор причин; tracing читает старый taskGraph | `interrupted`, `restart_limit` и прочие новые причины должны завершать отображение/ожидания, а не оставлять вечное generation. `afterTool` больше не доказывает, что execute состоялся; учитывать diagnostics. |
| Схемы | TypeBox usage в tools/subagents/automation/guards/extensions; прямой Check в Codex ask | pi-ai больше не экспортирует TypeBox. Сохранить required/optional/open/closed/coercion/structuredOutput semantics. Проверить MCP и nested CodeMode отдельно. |
| Persisted contracts | `native-import.ts` допускает только source SDK 1.4 и точные versions; reload document check требует equality | Явный проверенный переход встроенных definitions через upstream migrations до resume. Не разрешать все более старые versions и не менять версии вручную. Неизвестные custom definitions по-прежнему отказаны. |
| Storage | Store использует `openNodeSqliteStorage`, а не собственную реализацию Storage | Использовать upstream backend; не писать новый batch-storage слой. Отдельно найти прямые test-storage.commit calls и адаптировать их к публичному testing API. |
| Progress persistence | Сейчас новая настройка не задана | Для первого кандидата рекомендовано явно `progress.persistWithinMs=0`; default 1.5 — 1000 ms, это иное окно потери partial content при crash. Проверка crash обязательна и при 0. |

**Поздние исправления changelog важнее ранних примеров.** В конце breaking changes уже есть tagged watch calls и `observeCommits`; Session close завершает synchronous observers `failed`, тогда как watches остаются `ended`. Не переносить ранние фрагменты с `end.reason`, `cancelled` или старым unsubscribe.

### Две дополнительные зависимости, которых недостаточно отметить как «обновить package.json»

**GipPity/Component SDK.** Установленные 0.10.0 packages требуют Durable/Chord/pi-ai ровно 1.4.0. В `experiments/gippity-voice/node_modules/@howaboua/pi-durable-gippity-voice/dist/index.js:648` есть настоящий named import `watchEvents`, удалённый в 1.5. Поэтому проблема не только в npm peer metadata: этот неизменённый module несовместим с новым export surface.

На прочитанной [странице releases](https://github.com/IgorWarzocha/pi-durable-components/releases) последний release — 0.10.0, все 26 packages target 1.4.0; прочитанный main manifest GipPity тоже 0.10.0/1.4.0. Совместимый готовый release этим поиском не найден. Предпочтение: подтверждённый upstream fix; иначе небольшой воспроизводимый source patch/rebuild закреплённого пакета с provenance и прежними worklet fixes. `--force`, расширение peer range без проверки или скрытая вторая копия Harness проблему не решают. Полный профиль не считается принятым с молча выключенным voice.

**Упаковка.** `prepare-restart-candidate.py:34,79–86` копирует dependencies из sealed base и намеренно отказывает `DEPENDENCY_DELTA_REQUIRES_REBUILD`, если manifests отличаются. Это полезная защита, не дефект, который следует удалить. Для 1.5 нужен новый согласованный dependency closure, а не замена только app dist поверх alice-v2. Проверить физический nested reload, compiled Nico/provenance, DeLM engine, Component SDK и отсутствующие source/home aliases. Старые sealed artifacts не изменять.

### Схемы: не смешивать две разные миграции

Официальный pi-ai changelog допускает сохранить TypeBox, импортируя его напрямую из уже имеющегося `typebox`. Полное удаление TypeBox из всех файлов не является обязательным условием перехода runtime на 1.5.

Рекомендация: выбирать минимальную адаптацию по owning boundary. Сохранение JSON Schema через direct TypeBox import допустимо там, где типы подходят; pi-schema добавить прямой dependency там, где он реально импортируется. Не создавать общий shim для старых экспортов pi-ai. Если конкретный Chord contract теряет типизацию, перевести его на pi-schema с проверкой прежней JSON формы.

Различать валидаторы: **Chord 1.5** считает `format` аннотацией; **pi-ai 1.5** продолжает проверять свой стандартный набор formats, но не пользовательский TypeBox Format registry. `obj()` закрыт по умолчанию; прежний открытый Type.Object нельзя механически заменить на закрытый obj. Coercion и дополнительные свойства проверяются негативными входами, а не совпадением TypeScript типов.

### Дополнение по предоставленному исследованию WB-57, ревизия 3

Источник: текст пользователя «Pi 1.5: изменения и целевая архитектура нашей системы», ревизия 3 от 2026-11-02. Это материал исследования другой установки, а не подтверждение состояния этого Host. Пути `/home/vova`, provider-pi-durable 0.3.29, BB activation hold и tools-update.timer здесь не проверялись и не становятся разрешениями на действия.

**Граница архитектуры:** ordinary Pi как основной исполнитель в BB и ручной Durable как отдельный маршрут совместимы с этой работой. Мы мигрируем собственный backend → dpi-sdk → terminal/iii; BB provider остаётся вне текущего объёма. Правило отчёта «брать совместимый provider Вани» относится к его BB-интеграции, не создаёт зависимости нашего Host от выпуска того provider. Замена MCP/loadout/router ordinary Pi также не добавляется в этот план. Встроенные механизмы, уже существовавшие в 1.4, не называем новинками 1.5.

Сверка с уже полученным официальным Durable changelog v1.5.0 добавила следующие проверки к нашим срезам:

- **M2 — reports и immutable records.** Проверить новый `onReport(report)`/`storage_failed`, ветви `continue` без `entry`, `nothing_to_answer`/`turn_limit` и отсутствие мутаций прочитанных records/entries. Для `onReport` найден конкретный местный потребитель в Store; остальные пункты пока checklist, не найденные runtime-дефекты. Ограничение `maxTurns` не заменяет общий бюджет дерева или расходов.
- **M1/M3 — атомарная подача.** Сопоставить существующий admission с `whenIdle:reject` + `whenBusy:steer` и `submit(tx,draft)`. Где штатный вызов полностью покрывает контракт, предпочесть его check-then-submit. Сохранить grants, request dedupe и receipt journal. `submit(tx,draft)` допускается один раз за commit и до его первой table write: это ограничение проверяется, а не обходится.
- **M3 — память и завершение run.** `HookApi.entries()`/`TaskRuntime.entries()` дают историю, не изменяемую compaction. `afterRun` — кандидат для уже необходимой durable постобработки, но не новая обязательная подсистема: hook вызывается после успешного ответа, не после failure/abort; `Submission.wait()` уже завершён, а conversation ещё busy до окончания дочерних задач. При crash hook может быть вызван повторно до создания задач; создавать внешние эффекты прямо в нём нельзя считать exactly-once. Сохранить idempotency и текущий memory delivery до доказанного эквивалента.
- **M2/M4 — inspect без recovery.** Для реально существующих читателей, которым нужен Harness, оценить штатный `readOnly`. Он не заменяет OS sandbox и не требует переписать уже безопасный raw SQLite inspector. Новый viewer не добавляем без потребителя.
- **M3 — guards и смешанные модели.** `beforeProviderRequest` не fail-closed gate: throw сообщается, цепочка продолжается, compaction через него не идёт. Сохранить существующие fences; проверить actual loaded guards и отдельные root/child compaction settings на разных моделях. Наличие ошибки в чужом provider не доказывает такой же баг здесь. `control.handoff` должен завершать submission только настоящим финальным ответом.

Compat-loader обычных Pi extensions не обеспечивает совместимость наших standalone bundles/typechecks. Обновление общего extensions directory также могло бы повлиять на старый runtime: candidate closure поэтому должен быть физически самостоятельным. Управлять внешним updater или менять его timer в этом проекте не предлагается.

## 3. THINK: какие предположения следует убрать

Применён FirstPrinciples/Challenge: отделить ограничения исполнения и данных от прежних решений. Пользовательские permissions остаются обязательными независимо от аналитического термина «изменяемая политика». Новые агенты, массовые тесты, установка зависимостей и live probes этим исследованием не запускались.

| Предположение / ограничение | Разбор | Следствие |
|---|---|---|
| «Раз много DONE, до 1.5 остался version bump» | DONE относится к прежним outputs/1.4; удалены wire и watch API | Сохраняем код, но перепроверяем затронутые границы на новом artifact. |
| «Надо закончить и активировать 1.4, потом начинать 1.5» | Это порядок работ, а не техническая необходимость; пользователь просит общий результат | Завершить полезную preliminary QA 1.4 как characterization baseline, без обязательной промежуточной production-активации. |
| «Надо остановить текущую QA, иначе нельзя мигрировать» | Heidi проверяет immutable artifact; конфликтуют mutable fixtures/build outputs, а не сама QA | Оставить её claim и frozen inputs; подготовку 1.5 вести на отдельной physical сборочной основе. |
| «Одинаковая SQLite schema означает downgrade safety» | Официальные migrations.ts 1.4 и 1.5 byte-identical, но builtin records меняют версии | SQL integrity не доказывает runtime compatibility. |
| «Можно сохранить старый wire, сымитировав watchEvents» | Это новый собственный event interpreter со второй семантикой | Не делать. Versioned public state/deltas и совместный переход SDK/TUI проще проверять. |
| «Для обновляемости нужно абстрагировать весь Durable» | Durable — основной runtime проекта; такой слой дублировал бы owner, scheduler и recovery | Зафиксировать существующие границы импорта/проекции/упаковки и contract tests, не строить framework. |
| «Восемь агентов должны сразу писать» | Часть готовых работ зависит от одного backend seam; нужны независимые checkers | Обычно полезны до пяти disjoint writers, один fixture owner и независимый reviewer; не заполнять все слоты искусственными задачами. |

Выбранный маршрут: **сохранить текущую source основу и 1.4 evidence, сделать один изолированный 1.5 vertical slice, затем включить полный профиль и миграцию состояния, после чего собрать один финальный candidate**. Это не переписывание проекта и не большой merge непроверенных слоёв в самом конце.

## 4. Данные и возврат: два разных договора

В upstream source проверены `pi.live` v3 с migrate, `pi.generation` v2 с migrate и `pi.tool` v3 с migrate. См. [live.ts](https://github.com/earendil-works/pi/blob/v1.5.0/packages/durable/src/harness/live.ts), [generation.ts](https://github.com/earendil-works/pi/blob/v1.5.0/packages/durable/src/harness/generation.ts), [tool.ts](https://github.com/earendil-works/pi/blob/v1.5.0/packages/durable/src/harness/tool.ts). Само наличие migrate ещё не принимает наши custom documents, queues или profile.

1. **Горячий rollback совместимого кода:** тот же Harness/БД, возврат будущего dispatch, без replay. Сохраняются ISC-71/72/73 и прежние проверки offered schema/phase.
2. **Возврат 1.5 → 1.4:** точный исходный runtime/profile открывает отдельную restore-копию исходного согласованного backup. Он никогда не открывает изменённую 1.5 БД. Состояние 1.5 сохраняется отдельно для расследования/forward recovery.

Snapshot rollback не сохраняет автоматически новые записи после cutover и не отменяет внешние действия. До production-перехода нужно согласовать окно приёмки новых действий и границу возврата; безопасный первый cutover сначала ограничивает новую изменяющую работу. Даже drain не доказывает отсутствие отложенных эффектов: могут работать schedules, memory delivery и recovery controllers.

**Конфликт R4 явно открыт:** ISC-74 и PDH-20 требуют сохранения актуальной совместимой истории при возврате, а не старого snapshot. Предлагаемое уточнение: ISC-74 применяется только к доказанно совместимому release-return; межверсионный backup-return относится к ISC-40 и отдельной проверке запрета downgrade. Ни текст, ни threshold, ни состояние ISC-74 этим документом не изменены. Перед выполнением обновлённой acceptance-ветви эту границу нужно явно внести в канон; нельзя объявить старый PDH-20 выполненным другим тестом.

[Исследование Dave](../../../experiments/hot-update-20261101/previous-contract-review/REPORT.md) сохраняет ценность: 17 task и 43 document definitions — source inventory, не полный runtime registry. Особо важен найденный контрпример: terminal task плюс pending Hindsight intent может вновь создать delivery. Его semantic/effect predicates нужны и для миграции; строить полный обратный конвертер 1.5 → 1.4 ради возврата не предлагается.

Для реальной истории использовать только ранее разрешённую выбранную копию после подтверждения её identity и разрешённых путей владельцем. Новые production snapshots/reads не разрешены. Если копия/доступ отсутствуют, synthetic migration проверяет механизм, но ISC-39 остаётся открытым.

## 5. PLAN + parallel-plan: приращения поверх R4

M0–M5 — **плановые ссылки**, не созданные задачи и не новые ISC. Первый продуктовый срез — M1; M0 поставляет его проверяемые входы. Названия владельцев ниже — предложения по сохранению контекста, не изменения claims.

### M0. Сохранить основу и согласовать входы M1

- Heidi завершает текущие preliminary probes/fixture corrections по PDH-22. Её artifact, corpus и paths не переписываются миграцией.
- Alice фиксирует согласованный source snapshot **включая dirty/untracked работу**, R4 evidence, текущие manifests и происхождение dependencies. Отдельный build root, без обновления общего node_modules под текущими workers.
- Carol и Eve согласуют минимальный public view/delta contract, версию/capability и auth/error/reconnect examples. `contract-check.ts` уже существует: адаптировать его, а не удалять защиту.
- Alice готовит согласованный набор 1.5 dependencies/peers/locks и physical closure для M1. Внешние downloads выполняются только при последующей реализации в разрешённом scope; здесь ничего не устанавливалось.
- Dave рано проверяет реальный compatibility path GipPity/Component SDK и передаёт Bob/Alice точные source/provenance inputs. Этот риск не откладывается на финальную сборку.

**Выход:** source/build inputs идентифицированы; пример публичного состояния и ошибок согласован; несовместимый dependency не скрыт force install. Контракт-ready не означает работающий M1.

### M1. Настоящий терминальный запрос на свежей 1.5 БД

**Действие:** установленный terminal → dpi-sdk → HTTP backend → один настоящий Harness/SQLite → faux provider → реальный безопасный test tool → ответ → disconnect/reconnect.

Carol меняет Store/streams/public projection/reload и необходимые типы backend. Eve меняет SDK api/models/client и terminal projection/controller; UI целиком не переписывается. Общий чистый applicator публичного состояния можно переиспользовать обоими существующими проекторами; не создавать два независимых интерпретатора upstream deltas.

В этом срезе обязательны: version/capability refusal до mutation, разрешённый/запрещённый actor, безопасный snapshot/delta, bounded stream/backpressure, cleanup подписок, сохранение native session/conversation/request IDs. Потеря SSE не отменяет работу. Lost ACK сверяется через прежний requestId, а не новый send. Для diagnostics изменение redacted state должно давать только безопасные операции; нельзя фильтровать full snapshot и пропускать raw native delta.

**Проверка:** настоящий PTY видит tool и ответ, interrupt работает, reconnect получает согласованное состояние без второго эффекта; несовместимый клиент не отправляет mutation. `contract-check` и оба проектора проходят один и тот же state sequence. Только minimal/faux profile, без утверждения о полном native profile или перенесённой истории.

**Почему рано:** этот срез проверяет самый изменившийся seam до сложных memory/voice/DeLM fixtures. Подготовка их disjoint исходников допустима параллельно, интеграция — после этого seam.

### M2. История и конечные исходы вместо вечного ожидания

M1 сохраняется. Добавить историю длиннее настроенного максимального окна, pagination/reconnect gap, reset/compaction, отдельный model-active context. Смена conversation не показывает данные предыдущей. Включить проверки reports, замороженных records и новых submission/outcome branches из дополнения WB-57.

Проверить real disposable crash/reopen, конечные `interrupted`/`restart_limit`, корректные submissions и parent/child outcome. Сохранить no-replay unsafe tool и существующий journal. Применить новое observer/end API также к общему backend коду, используемому subagents/iii: отложенный BB-клиент не означает, что можно оставить некомпилирующийся shared BB/outcome code.

**Выход:** видна полная доступная история, а не только 50 последних записей; failure завершает UI/ожидания, IDs и receipts сохранены. Crash tests не допускают незаявленного изменения retry/потери partial content.

### M3. Полный native profile и прежний hot-update корпус на 1.5

Bob — memory/MCP controllers и scope/lifecycle; Dave — providers/tools schemas и voice dependency adaptation; Frank — DeLM/automation/собственные isolation fixtures; Carol — совместная profile wiring. Каждый файл имеет одного writer; schema edits выполняет владелец конкретного файла, не отдельный массовый заменщик.

Подключать результаты к уже работающему M1/M2 по одному usable handoff: session memory reload → MCP replacement → DeLM/automation/parent control → voice. Учесть дополнение WB-57: native admission без race, границу answer/idle, реальные guards и root/child compaction. Это проверки текущих обязательств, не разрешение добавить все новые upstream возможности. После каждого сохраняется настоящий roundtrip. Тестировать builtin/private diagnostics отдельно от допустимых opaque tool results.

**Проверка:** U01–U18 работают hot; U19/U20 явно требуют maintenance. Busy phase/schema, old/new provider stream, bank/scope, single wait/occurrence, parent-only control, revoke, cleanup failure, draft и client-only replacement сохраняют прежний смысл. Реальный локальный iii работает через SDK и того же owner; повтор использует тот же requestId. Voice fixture без внешнего провайдера не выдаётся за проверку живого audio/provider.

**Выход:** полный candidate profile, не minimal profile с молча отключёнными интеграциями. 100 code swaps/20 resource replacements повторяются на 1.5, потому что библиотека и lifecycle изменились. RSS attribution и освобождение всех заявленных ресурсов остаются обязательными.

### M4. Перенос состояния и проверенный возврат

Зависит от M3 для full-profile acceptance; synthetic copies можно готовить раньше. Carol адаптирует inspector/import/startup compatibility с точными upstream migrations. Frank проводит физически изолированную репетицию на отдельных copies; старый runtime не получает upgraded DB. Dave может дать независимую проверку только для участков, которые не реализовывал.

**Проверки:** IDs/history/model/provider/children/docs сохранены; неизвестные custom definitions отказаны до resume; нет непредусмотренного исполнения dormant queues; оригинальный backup неизменен; исходный runtime/profile открывает restore-copy. Startup/stop failures, owner lock и interrupted publication не теряют неопределённые receipts. Состояние 1.5 после теста остаётся отдельным artifact, не затирается восстановлением.

Положительный disposable переход не заменяет разрешённый real-copy ISC-39. Операторский auth incident и поддерживаемое разрешение tracker blocker остаются отдельными gates.

### M5. Один финальный candidate и повторяемая процедура обновления

Alice собирает полный неизменяемый closure backend + SDK + terminal + iii + profile dependencies. Не добавляет предыдущие пакеты по случайным host/source symlinks. Source files, lockfiles, third-party patches, generated bundles и provenance входят в manifest.

Grace проводит независимое source review; Heidi — installed QA в отдельных scratch/DB/ports по этому же digest. Алиас «все component tests зелёные» не заменяет эти gates. После исправления дефекта evidence относится к новому candidate; неизменённые доказательства переиспользуются только с точной границей валидности. Alice сводит результаты и оставляет artifact **неактивированным**.

**Зависимости:** M0 → M1 → M2; M3 потребляет M1 и сохраняет M2; M4 full-profile gate потребляет M3; M5 принимает M2/M3/M4 и повторяемую upgrade procedure. Не ставить final acceptance prerequisite для собственных checker-задач. Parent/aggregation task не должен удерживать единственный claim исполнителя и мешать дочернему output.

## 6. Параллельность и handoff contracts

| Предлагаемый владелец | Собственные изменения после допуска реализации | Ранний выход и потребитель |
|---|---|---|
| Carol | Store/runtime-profile/native-import, streams/public projection, reload, общая profile wiring | Реальный authenticated view stream/compatibility refusal → Eve; scoped lifecycle seam → Bob/Frank |
| Eve | SDK api/models/client, terminal projection/controller; iii client adaptation при необходимости | Public wire examples + PTY consumer → Carol/Heidi; сохранённый submission journal |
| Bob | Memory и MCP source/controllers в disjoint paths | Проверенный scoped reload/observer cleanup → Carol; metadata/provenance → Alice |
| Dave | Provider/tool schema paths, GipPity/Component source adaptation | 1.5-compatible voice artifact без скрытого runtime → Alice/Carol; schema negatives → Heidi |
| Frank | DeLM/automation-owned paths, sandbox и release/migration rehearsal harness | Безопасные fixtures/backup-return observations → Heidi/Alice; не общий Store/profile writer |
| Alice | Единственный writer dependency manifests/locks, packaging scripts, candidate manifests и сводки | Physical dependency closure → M1; immutable full candidate → Grace/Heidi |
| Grace | Read-only независимое review; не пишет исправления проверяемого продукта | Findings по wire/privacy/import/dependency closure → владельцам; verdict → Alice |
| Heidi | Текущий PDH-22 и QA fixtures/report, затем отдельный установленный candidate | Preliminary 1.4 characterization сейчас; независимый 1.5 corpus после M5 freeze |

Все назначения сначала сверяются с живой доской. Не добавлять workers, модели, обходные lease/claim операции или новую доску. Отдельный authorization/scope handoff через существующий run выполняется после исследования, а не самим этим документом.

Общие manifest/lock и profile files сериализуются. Сборки не пишут одновременно в один dist/node_modules; тесты получают отдельные mutable DB/cache/ports. Новый workspace сам по себе не скрывает production credentials: остаётся существующий physical sandbox с отрицательными проверками доступа parent/child.

Для каждой передачи нужны: точные paths/digest, контракт входа/результата/отказа, сохранённые инварианты, consumer и уровень evidence — **contract-ready**, **component-verified** или **integrated**. Эти слова не вводят новые состояния доски. Ответ «отправлено» не равен ACK/claim/исполнению.

## 7. Покрытие и повторное использование результатов

| Требование | Срез / проверка | Что сохраняется, что повторяется |
|---|---|---|
| Один owner, authority, isolation, request dedupe; исходные ISA границы | M1/M2/M4; auth, revoke, ACK-loss, owner recovery | Реализация guards/journal сохраняется; изменившийся transport/recovery проверяется заново |
| ISC-39/40 | M4; разрешённая copy continuation и original-backup restore | Исторический PARTIAL не превращается в PASS от synthetic fixture |
| ISC-46–57 | M3; busy phases, transitive load, discovery, offered schema | R4 source/fixtures сохраняются; новый runtime требует новых observations |
| ISC-58.1/58.2–67, включая 65.1–65.3 | M3; providers, memory/MCP, DeLM/automation, policy, voice | Не подменять полную композицию minimal/faux-only выводом; real credentials не нужны для synthetic auth-source tests |
| ISC-68/69 | M1/M3; PTY draft/reload/menu, отсутствие model turn | Сохранить последние Eve fixes и preliminary characterization Heidi |
| ISC-70 | M3/M5; post-quiescence resource census и удержание объектов | Прежние стабильные FD и WeakRefs полезны, но не закрывают весь no-leak scope |
| ISC-71/72/73 | M3/M4; совместимый hot rollback и запрет несовместимого downgrade | Старые эффекты не повторяются; schema/version неизвестность даёт refusal |
| ISC-74 | Явное уточнение в каноне перед новой acceptance-ветвью | Не заменять live-compatible history return тестом старого backup молча |
| ISC-75–78 | M0/M3/M4/M5; maintenance refusal, physical sandbox, unchanged production, автономный closure | Готовый sandbox/packaging переиспользуются; новая dependency closure проверяется отдельно |
| Новое требование 1.5 transport/history/watch/outcome | M1/M2; оба проектора, окна/страницы, error/end cases | Новые runtime evidence, не старые typechecks |
| Повторяемость будущих upgrades | M5; clean assembly и negative compatibility checks | Нет обещания zero-work для следующего breaking release |

## 8. Минимальный постоянный процесс обновления

Не framework и не второй источник версий. Package manifests/lockfiles остаются источником истины; manifest кандидата — производный снимок.

1. **Одна карта зависимости от upstream.** Native implementation остаётся в backend/profile/reload; public projection owns безопасный wire; SDK/terminal/iii не создают Harness/storage. Состав включает bundled code, peers и generated dependencies, а не только package.json backend.
2. **Исполняемый compatibility check.** Расширить существующий `contract-check.ts` и packaging checks: согласованность owning dependencies/peers/locks; source/build/runtime closure; отказ mixed 1.4/1.5, отсутствующего export, несовместимого wire и неизвестного persisted definition. Проверять реальные resolution paths, не только строки manifests. Чистые data helpers допустимы в SDK без runtime/storage owner; проверять public imports и install closure.
3. **Один воспроизводимый рецепт.** Из закреплённых source + locks + patches собрать новый physical closure в новом каталоге, выполнить actual M1 probe и собрать manifest. Не использовать mutable global Pi или dist от прошлого запуска. Нужные installs/build scripts выполняются в разрешённой изоляции, без silent upgrades всего окружения.
4. **Upgrade/return runbook.** Record source/target versions и artifacts; changelog/API delta; разрешённый snapshot; pre-resume compatibility; installed checks; границы hot rollback, backup-return и forward recovery; отдельное разрешение на activation.
5. **Проверить сам процесс на 1.5.** Повторная clean assembly из тех же входов не тянет скрытые source/home зависимости. Negative fixtures намеренно подставляют смешанную version/несовместимый client/unknown document и получают отказ до исполнения. Это необходимые проверки нового механизма, не повтор прежних PASS ради уверенности.

Не обновлять исторические frozen experiment lockfiles и отложенный demo 1.0.3 только ради единой цифры по всему репозиторию. Проверка согласованности относится к **активному candidate closure**. При следующем release этот же рецепт выявляет delta; breaking change по-прежнему требует осмысленной адаптации.

## 9. Проверка плана и оставшиеся открытые пункты

Самопроверка, **не независимое review**:

- M1 даёт реальный observable tool/answer, а не health endpoint или matching mocks.
- Старые 47 DONE, source repairs и immutable 1.4 artifact не заменяются новой пустой основой.
- Текущая QA не блокируется изменением R4 hashes; новая acceptance получает собственный согласованный corpus revision.
- Выполнение full-profile не объявляется возможным, пока GipPity/Component dependency не адаптирована; это ранняя работа, не финальный сюрприз.
- API safety входит в первый transport slice; real-copy и cross-version return не откладываются за пределы final acceptance.
- Auth incident, repair-claim и несовместимость возврата не закрываются административной перенумерацией.
- Нет автоматического production rollout, новых model calls, commits/pushes или перезапуска команды.

Открытые технические проверки: совместимый voice build; полный installed 1.5 closure; точные public delta/privacy и pagination tests; real upstream migration на разрешённой копии; no-replay dormant effects; backup-return; итоговая независимая QA. Это задачи реализации/приёмки, а не причины выдавать исследование за готовую миграцию.

Ближайшая граница исполнения после принятия дополнения: сохранить результаты Heidi, согласовать wire/data-return contracts и рабочие области на существующей доске, затем начать M0/M1. Production остаётся **NO-GO** до полного evidence, операторского разрешения auth-инцидента и отдельного разрешения пользователя на переключение.
