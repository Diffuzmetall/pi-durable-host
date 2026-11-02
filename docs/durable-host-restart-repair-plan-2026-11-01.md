# Durable Host: исследование, решения и план ремонта без перезапуска production

Дата: 2026-11-01. Статус: план подготовлен; продуктовые проверки ниже ещё не выполнены.

Исходный отчёт: [durable-host-restart-analysis-2026-11-01.md](../../master/docs/durable-host-restart-analysis-2026-11-01.md). Этот файл — дополнение, не замена наблюдений отчёта. Запрошенная запись непосредственно в master заблокирована обязательным Agent Mail lease: текущая identity BronzeMink принадлежит pi-durable-host, запрос к master отклонён `Agent Mail project mismatch`. Обход не выполнялся.

Канон требований: [ISA.md](../ISA.md). Общий план: [host-design/PLAN.md](host-design/PLAN.md). Исторические PASS относятся к своим кандидатам, а не к текущему операционному выпуску.

## 1. Авторизация и конечный результат

Пользователь разрешил исследование, планирование и работу восьми DeLM-агентов на Sol 6.1 medium. Требуется исправленный, проверенный локальный кандидат. **Работающий Host не перезапускать.**

Разрешено: изменения относящихся к ремонту исходников и тестов; локальная сборка; временные отдельные каталоги БД; loopback-серверы и дочерние процессы тестового кандидата; проверка упакованного кандидата без активации; создание новой команды штатным SDK launcher после положительного preflight.

Запрещено: stop/restart/reload/kill действующего Host; замена его установленного кода и ссылок; systemd/drop-in/launcher/auth/MCP policy changes; изменение production SQLite и locks; запуск второго владельца production dataDir; закрытие старых сессий/панелей; отключение canonical/security checks; commit/push/deploy; дополнительные агенты или замена модели. Код, конфигурация и история других инициатив сохраняются.

Итог этой итерации: `candidate verified / production activation NOT RUN`. Даже успешные изолированные тесты не закрывают проверку всех 67 production-сессий и живого restart. Разрешённый запуск DeLM — отдельная штатная операция; он не разрешает ремонт установленного Host ради запуска команды.

## 2. Свежая сверка и границы доказательств

Проверено чтением текущих файлов и read-only метаданных процесса:

| Наблюдение | Источник | Вывод |
|---|---|---|
| Store последовательно await openAgent для всех строк, затем resume и return | apps/dpi-backend/src/store.ts:267–293 | Общий барьер сохранён |
| HTTP listen после await Store.open | experiments/sdk-host-cutover/operational-service.mjs | HTTP недоступен до завершения восстановления |
| closeRuntime пытается shutdown → beforeClose → Harness/storage close → cleanup, агрегирует ошибки | store.ts:1761–1785 | Порядок уже есть; не создавать конкурирующий lifecycle |
| profile присваивается только после await factory; catch закрывает лишь полученный profile | store.ts:643–748 | Store не может очистить композицию, потерянную внутри factory |
| composition создана перед attachDelm; error rollback отсутствует | experiments/sdk-host-cutover/operational-profile.mjs:121–136; установленный base-profile.mjs | Граница утечки остаётся |
| GipPity получает composition и возвращает attachGippity без exception cleanup | experiments/gippity-voice/operational-profile.mjs и установленная обёртка | Аналогичная незащищённая граница; реальную утечку надо воспроизвести отдельно |
| #dialog имеет приоритет над восстановленным view | apps/terminal-adapter/src/ui/experimental/durable/program-status.ts | update(view) не снимает диалог |
| Cannot submit монтируется как selector; return to editor — explicit callback | tui.ts:436–437 | Нужен UI-тест, а не только тест status |
| Активный PID 2310878, запуск 18:27:29 МСК; command использует delivery-recovery/20261101 | systemctl show и /proc/PID/cmdline | В момент исследования всё ещё работает выпуск из отчёта |
| delm-engine/index.js realpath ведёт в c0019d7-unified-sse-mcp140-20261031-v1 | readlink -f установленного модуля | Ошибка размещения сохраняется |
| installed base-profile передаёт свой лексический modulePath; installed attachBinding canonical(modulePath) до import | installed base-profile.mjs:133–135; delm-profile.mjs:114 | Новая привязка также подвержена отказу |
| Late attach идёт через prepareReload и тот же attachBinding | experiments/sdk-host-cutover/delm-profile.mjs:46–98 | Hot refresh сам по себе не обходит дефект пути |

Числа 67/43/24, 268 процессов, 178–188 секунд запуска и 300 секунд остановки — наблюдения исходного отчёта, повторно не измерялись. Причина конкретного shutdown timeout не доказана полностью. Текущая целостность каждой истории не проверялась. Проверка exact Sol модели: доступен `openai-codex/gpt-6.1-sol`; thinking должен быть явно `medium`, не default low.

CodeGraph использован для навигации; важные выводы подтверждены текущим source. Графические сведения о покрытии тестами не принимались за доказательство отсутствия тестов.

## 3. Thinking: почему локальные исправления не дали устойчивого результата

Применён краткий причинный разбор, а не полный независимый RCA-аудит.

1. **Недоступность DeLM:** symlink попал в установленный артефакт → канонический путь изменился → правильная проверка отказала. Системная причина: приёмка не проверяла фактическую файловую структуру и все виды профилей установленного выпуска. Ремонт: artifact-level проверка и физическое размещение engine, не ослабление защиты.
2. **Ресурсы после отказа:** factory успела открыть базовую композицию → adapter attach упал → объект не передан владельцу → cleanup пропущен. Системная причина: ответственность за частичное создание не определена до передачи. Ремонт: rollback на owning factory boundary и тесты fault injection каждой стадии.
3. **Недоступность всех клиентов:** Store.open смешивает открытие общего хранилища с восстановлением всех runtime → listen ждёт весь каталог. Системная причина: готовность процесса и готовность сессии представлены одним барьером. Ремонт: разделение этих состояний без ослабления single-owner/admission.
4. **Редактор после reconnect:** транспорт online, но UI продолжает держать transient failure как пользовательский modal. Системная причина: разные владельцы состояния не имеют явного контракта восстановления. Ремонт: типизированная transient-submit блокировка, сверка доставки, возврат редактора без автосабмита.
5. **Ложноположительная приёмка:** health/catalog/single session/new tab использовались вместо полного пользовательского сценария. Ремонт: одна матрица сценариев на точном installed candidate, включая partial failure и прежнюю открытую вкладку.

Не приписывать timeout только DeLM-утечке: проверить зависающие shutdown hooks, последовательное закрытие, активные tasks/SSE и остановку во время восстановления. Не объединять MCP глобально без доказанной необходимости: session credentials и isolation являются границами безопасности.

### Выбор технического направления

| Вариант | Решение и причина |
|---|---|
| Только увеличить timeout | Отклонить: сохраняет простои и маскирует отказ |
| Только параллельно восстановить каталог перед listen | Недостаточно: общий барьер остаётся, хотя может сократиться |
| Ранний HTTP + bounded background recovery + per-session state | Основное направление: готовые сессии доступны независимо; ресурсы ограничены |
| Lazy runtime/MCP для всех idle-сессий | Отложить: меняет восстановление schedules/tasks; не нужен для первого ремонта |
| Новый общий runtime/lifecycle framework | Не вводить: использовать существующие composition hooks и Store ownership |
| Закрывать любой диалог на reconnect | Отклонить: потеря реальных подтверждений |

## 4. Контракты, которые нельзя потерять

### Store/startup

Открытие catalog/shared storage и владение ими предшествуют HTTP. Восстановление runtime имеет явные состояния `restoring`, `ready`, `failed`; закрывающийся Store не принимает новую работу. Точные публичные поля должны расширять существующий SDK/protocol обратно совместимо; старый клиент не должен интерпретировать неполную готовность как разрешение на mutation.

Bounded recovery начать с небольшого внутреннего лимита (предлагается 4; подтвердить isolated measurements, не вводить новый пользовательский config без нужды). Ошибка одной сессии не прерывает остальные. Ready публикуется только после bind, установки в opened и допустимого resume. Сохранить проверку profile/model до resume, exact task/conversation IDs, существующие owner locks и авторизацию. Не запускать второй open одной сессии из HTTP и recovery worker: одна in-flight операция/явный conflict по существующей семантике.

Close сначала закрывает admission и прекращает выдачу новых recovery jobs, затем дожидается/отменяет начатые операции штатным lifecycle, закрывает owned runtime и только затем shared storage/catalog/locks. Нельзя делать Promise.race timeout с оставшейся живой инициализацией и освобождать её lock. SIGTERM во время startup должен покрываться отдельным тестом.

### Profile composition

Фабрика владеет всеми приобретёнными ресурсами до успешного return. При post-create exception выполняет необходимые shutdown и cleanup в правильном порядке, даже если один hook падает. Исходная ошибка сохраняется вместе с cleanup errors; публичная ошибка редактируется существующей безопасной границей. Успех не вызывает раннего cleanup, normal close не вызывает hooks повторно. Проверить nested wrappers DeLM/GipPity и отказ register/install/bind. Не предполагать, что shutdown и cleanup взаимозаменяемы.

### Client

Различать сетевой submit error и реальные attention/confirm/choice диалоги. Online недостаточно для разрешения повторной отправки: сначала авторитетная reconciliation текущего conversation/request. Черновик сохраняется, старый непринятый текст не отправляется автоматически, late request получает 409. Переключение conversation во время await не изменяет чужой редактор/журнал. Client build identity диагностируется без автоматического обновления чужих процессов.

### Release

Кандидат самодостаточен, engine имеет разрешённый физический путь; нельзя ссылаться из нового immutable candidate на старый release для защищённого модуля. Манифест фиксирует hashes, source+lockfiles, build IDs backend/SDK/terminal. Сборка не активирует release. Проверяются разрешённый путь, symlink отказ, file owner/mode и отсутствие тестового обхода admission. Живые binding JSON/БД не переписываются.

## 5. Вертикальные срезы и восемь участников

Общий checkout `/home/ubuntu/Projects/pi-durable-host`. Единственный task tracker команды — DeLM board. Никаких Beads/Mail task mirrors. Каждый читает полностью глобальные/project AGENTS, frozen WORKER/START, этот план и свежую доску. Claim выдаётся доской, строки ниже — исходное распределение, не замена ownership. Пересекающиеся source paths имеют одного writer; другой оставляет finding/patch request через board.

### S1 — Неуспешный адаптер не ломает последующий запуск (первый работающий срез)

**Alice:** упаковка. Владение `experiments/sdk-host-cutover/prepare-delm-release.py`, `prepare-delm-hot-release.py` и новыми packaging tests. Найти реальный рецепт delivery-recovery, зафиксировать происхождение артефактов. Исправить owning recipe, не historical generated directories. Создать проверяемый неактивированный candidate manifest; если рецепт отсутствует в source, сначала задокументировать точную минимальную воспроизводимую сборку.

**Bob:** exception-safe composition. Владение operational-profile wrappers в sdk-host-cutover и gippity-voice, их тестами; не store.ts. Fault injection после native create, при DeLM/GipPity attach и при failing shutdown. Обеспечить освобождение ресурсов при failure и ровно один normal cleanup при успехе. Handoff Alice: готовый wrapper и regression evidence.

**Выход S1:** упакованный isolated обычный+DeLM профиль открывается; намеренно испорченный адаптер корректно отказывает, не оставляет child resources; последующий корректный экземпляр восстанавливается без ручного удаления locks. Зависит от Alice+Bob, проверка выполнена на артефакте, не только source.

### S2 — Готовая сессия доступна, пока другая ещё восстанавливается

**Carol:** единственный writer `apps/dpi-backend/src/store.ts`, Store recovery tests. Отвечает за recovery state, bounded jobs, single-owner, close-during-open. Сначала публикует минимальный контракт Store API для Dave/Frank. Сохраняет имеющиеся незакоммиченные message reconciliation изменения.

**Dave:** `apps/dpi-backend/src/http-server.ts`, `routes.ts`, `main.ts`, SDK api/client и readiness HTTP tests. Использует контракт Carol; не меняет Store. Подключает readiness и безопасные session errors к реальному HTTP; старые клиенты/правила grants остаются рабочими. Сохраняет существующие uncommitted routes changes. Не объявляет liveness failure только потому, что одна сессия failed.

**Frank:** operational-service wrappers, shutdown/restart-budget tests и локальные этапные measurements. Не пишет Store; необходимые изменения передаёт Carol. Подключает service bootstrap к контракту Carol/Dave; сигнал во время recovery, повторный signal, failing hook, cleanupSessionResources и draining HTTP/SSE. Не редактирует installed service/drop-ins.

**Выход S2:** изолированный HTTP отвечает, fast session работает при заблокированной slow session; broken session безопасно unavailable, остальные прогрессируют; close во время восстановления не оставляет owner/resources. Измеряются catalogue-open, profile-create, MCP, storage, bind, first-session-ready, all-settled, shutdown по безопасным session correlation IDs.

### S3 — Уже открытый терминал возвращается в рабочий режим

**Eve:** terminal `tui.ts`, `program-status.ts`, `remote-controller.ts` и целевые terminal tests. Единственный writer UI/controller; сохраняет существующие reconciliation исправления. Воспроизводит Cannot submit, добавляет явную transient recovery, сохраняет draft и настоящие dialogs. Проверяет accepted/absent/late request, lost ACK, switch conversation during reconciliation, old/new client compatibility. Изолированный PTY сценарий использует действующий editor, а не только status function.

**Выход S3:** заранее открытый тестовый терминал переживает restart изолированного кандидата, получает новый ответ, не исполняет старый текст дважды, не теряет draft/attention.

### S4 — Точный кандидат прошёл независимую проверку, но не активирован

**Grace:** independent code/design review; source read-only. Сначала проверяет этот финальный план и опасные контракты (close/open race, owner locks, staged adapter failure, protocol downgrade). На milestone проверяет реальные S1–S3 diffs, сопоставляет evidence с candidate hashes. Авторские исправления делает соответствующий writer, не reviewer. Вывод в отдельном report; не выдавать self-review за independent.

**Heidi:** isolated integrated QA/PTY runner и final acceptance report; source product read-only, владеет новыми integration fixtures/report. Сначала готовит сценарии на текущем candidate/faux без ожидания всего ремонта, затем запускает на final artifacts после S1–S3. Никаких live production DB/model probes. Следит за namespace temp dirs, ports, процессов; останавливает только собственные fixtures. Runtime fail возвращает owning writer, после изменения повторяется затронутая проверка.

**Выход S4:** source/typecheck/focused tests + installed-candidate E2E + independent review; общий итог содержит PASS/FAIL/NOT RUN и конкретный manifest. Единственный владелец канонического repair report — Heidi; этот план frozen после prepare, не переписывать run inputs.

После своего среза участник ищет действительно готовую разрешённую работу на свежей доске, не создаёт задачи ради загрузки восьми моделей. Совместные build outputs/lockfiles не писать параллельно: сборка итогового candidate принадлежит Alice, final QA Heidi после handoff. Дополнительные deps/lockfile changes не ожидаются; если нужны — одна объявленная ownership.

## 6. Проверки и покрытие требований

| Проверка | Источник требования | Владелец / ожидаемое доказательство |
|---|---|---|
| Physical engine + canonical rejection | Отчёт §4, §14 | Alice: installed candidate positive/negative path tests |
| Partial composition rollback и normal close exactly once | Отчёт §5–6, §14 | Bob/Frank: controlled fault + child exit/hook order |
| Один владелец, profile/model before resume | ISA ISC-1, ISC-6, ISC-7 | Carol: concurrent open, second process denial, incompatible profile |
| Task/document/schedule identities после restart | ISA ISC-15, ISC-16.1/16.2 | Carol/Heidi: same IDs, one accepted schedule occurrence |
| Fast session доступна при slow/failed соседней | Отчёт §7, §14 | Carol/Dave: HTTP barrier fixture + bounded active counts |
| Shutdown during restoration и SSE | Отчёт §6–7 | Frank: isolated signal/process fixture, no orphans |
| Черновик, UI, navigation | ISA ISC-18.1/18.3, ISC-22; отчёт §8 | Eve/Heidi: PTY и actual editor state |
| Reconnect без дублей / lost ACK / late key | ISA ISC-21, ISC-23/24 | Eve/Dave/Heidi: real HTTP fixture и native entries |
| Старый клиент / unsupported capability | ISA ISC-31, ISC-37 | Dave/Eve: explicit compatibility fixture |
| Изоляция MCP, grants, отсутствие секретов | ISA ISC-14.1/14.2, ISC-43 | Bob/Grace: negative scope tests и redacted diagnostics |
| Истории/backup/production rollback | ISA ISC-39/40; отчёт §14 | НЕ ЗАКРЫВАТЬ: production check требует отдельного разрешения |
| Все 24 bindings и все production sessions | Отчёт §14 | NOT RUN: candidate fixtures не доказывают восстановление production |

Новые предлагаемые regression thresholds (не обещание production SLA): isolated 67-session scenario с injected 2s stall не блокирует control API/fast session до снятия stall; concurrent initializers не больше установленного лимита; settled session counts сходятся к total; zero leaked child fixtures; shutdown без SIGKILL в тестовом бюджете 10s при cooperative fixtures. Реальные медленные hooks измеряются отдельно, не скрываются искусственным force-exit. Производственный SLA выбирается после измерений и отдельного согласования activation.

## 7. Самопроверка плана и незакрытые риски

Проведена self-review этого кандидата по покрытию исходного §14, ownership и зависимости. Исправлены опасные упрощения: ранний HTTP не разрешает доступ к неготовому runtime; close обязан учесть in-flight recovery; нельзя просто гонять Promise.race и отпускать lock; acceptance на installed candidate; восемь участников не восемь конкурирующих writers store.ts.

Независимое review пока НЕ ВЫПОЛНЕНО: это первый полезный read-only результат Grace перед cross-cutting startup edits. Если review выявит нарушение ownership/совместимости, соответствующий срез корректируется до реализации; остальные независимые срезы могут идти.

Открытые технические вопросы для исполнителей: lifecycle ресурсов scopedModels при requireModel/factory failure; возможность остановки конкретного MCP initializer существующим abort contract; все owning release recipes; точные старые SDK реакции на restoring. Это обязательные bounded investigations внутри назначенных задач, не разрешение на новый framework или production эксперимент.

## 8. DeLM preflight и блокер запуска

Запрошено 8 участников Alice/Bob/Carol/Dave/Eve/Frank/Grace/Heidi, `openai-codex/gpt-6.1-sol`, thinking `medium`. Проверены SHA256 штатных delm_host/delm_rex launcher — совпадают с private Config.json. Rex доступен, единственная session `session:01a18b87-3cb4-713e-a761-f383f3472c0c` (`shy-river`).

**BLOCKED:** активный Host использует установленный неканонический DeLM modulePath. Late attach проверяет этот же путь. Не создаём восемь заведомо неготовых runtime, не подменяем их обычными subagents и не отключаем защиту.

После отдельного разрешённого исправления установленного DeLM пути без рестарта либо после последующей отдельно разрешённой activation:

1. Использовать уже подготовленный run, не повторять init.
2. Штатный `delm_rex.mjs open`, затем `verify`: 8 board members = 8 exact bindings = 8 actor-named panes; ready true; прежние runs не трогать.
3. Штатный launcher создаёт model reference, но не задаёт medium. ДО start настроить только новые восемь exact agent roots через SDK `agent.configure({thinkingLevel:'medium'})`; прочитать config обратно, проверить модель и medium у каждого. Не помещать лишнее поле в models JSON: launcher принимает только provider/modelId.
4. Выполнить штатный `delm_host.mjs start` один раз; при неопределённом исходе использовать сохранённые request IDs/receipts и reconciliation, не слепой resend.
5. В отчёте отдельно считать prepared, bound, panes, ready tools, accepted inputs, actual outputs. Панели без accepted input не объявлять работающей командой.

До снятия блокера подготовка не является запуском. Рабочий Host в этой итерации не изменяется.
