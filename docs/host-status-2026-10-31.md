# Состояние Pi Durable Host — 31 октября 2026

**Назначение:** передача состояния проекта и эксплуатационная справка. Это не объявление общей production-ready приёмки.

**Свежая read-only сверка:** `2026-10-31T18:49:26Z`. Данные после этой отметки могут измениться при обычной работе пользователей. Отдельно приведены результаты более раннего контролируемого переключения.

## Содержание

1. [Краткий итог](#краткий-итог)
2. [Что запущено сейчас](#что-запущено-сейчас)
3. [Что сделано](#что-сделано)
4. [Что работает и чем подтверждено](#что-работает-и-чем-подтверждено)
5. [Что не работает или не принято](#что-не-работает-или-не-принято)
6. [Части системы и владение](#части-системы-и-владение)
7. [Переключение и сохранность](#переключение-и-сохранность)
8. [Проверки и границы доказательств](#проверки-и-границы-доказательств)
9. [Эксплуатация и восстановление](#эксплуатация-и-восстановление)
10. [Что осталось](#что-осталось)
11. [Карта документов](#карта-документов)

## Краткий итог

Основной Host и наш SDK-терминал переключены на новую сборку. В ней есть восстановленный SSE drain-fix и `@earendil-works/pi-mcp 1.4.0`. Существующие сессии, история, модели и состояние задач сохранены при переключении.

**Не всё завершено.** Каталог MCP-инструментов неодинаково восстановлен по разговорам; Langfuse и Open Design не имеют полного паритета. iii engine запущен, но worker остановлен. BB отложен. Наличие исходников, capability или зелёной компиляции не означает, что соответствующая интеграция принята в живом окружении.

Смена владельца Host, перезапуск или новые модельные запросы для подготовки этого документа не выполнялись. Из сервиса прочитаны metadata и каталог; сообщения, credentials и личные базы в публикацию не включаются.

## Что запущено сейчас

| Элемент | Наблюдаемый результат | Основание |
|---|---|---|
| `pi-durable-host.service` | `active/running`, PID `2311445` | Свежий `systemctl --user show` |
| Operational Host release | `c0019d7-unified-sse-mcp140-20261031-v1` | Фактический `ExecStart`, не имя исходной ветки |
| Терминальный release | `terminal-catalog-20261031-v1` | Сохранённый activation receipt; этим SSE-переключением не заменялся |
| Wire API | `apiVersion: 1` | Живой SDK protocol discovery |
| Sessions / conversations | **46 / 51** | Живой SDK обход summaries и agent metadata, 18:49 UTC |
| Busy conversations | **1** в момент сверки | Metadata; это не зависание и не команда на остановку |
| `pi-durable-iii-engine.service` | `active/running` | Свежий systemd status |
| `pi-durable-iii-worker.service` | `inactive/dead`, PID `0` | Свежий systemd status |
| pi-mcp | **1.4.0** в активированном sealed release | Activation receipt, source manifest и lockfile |

**46/51 сейчас и 42/47 при cutover — разные снимки.** При включении проверялась сохранность прежних 42 сессий и 47 разговоров; после него появились дополнительные. Нельзя подменять текущие количества цифрами из старого отчёта или делать из роста вывод о повторной миграции.

Живой каталог подтвердил `available: true` для:

- `openai-codex/gpt-6.1-terra`;
- `antigravity/gemini-3.8-flash`;
- `opencode/gemini-3.8-flash`.

Одинаковый `modelId` у другого provider не означает ту же модельную конфигурацию: Google/Google Vertex/GitHub Copilot варианты Gemini в проверенном каталоге были недоступны. Сохранённые provider/model pairs нельзя переписывать на «похожую доступную модель». Эта сверка доступности не отправляла inference-запросы.

## Что сделано

### 1. Сохранена исходная модель исполнения

Fork расширяет backend и SDK Disler, а не заменяет их новым framework. Native Durable владеет admission, conversations, tasks, documents и recovery. Наш TUI работает как SDK-клиент: отключение окна не передаёт владение сессией клиенту.

Основные зависимости backend закреплены на Durable-семействе `1.4.0`. Терминальный adapter — отдельный пакет поверх существующего TUI; upstream `apps/dpi-tui` остаётся reference-клиентом, а не заменяет наш интерфейс.

### 2. Добавлены policy, identity и безопасный retry

Реализованы scoped grants, protocol/capability gates, fingerprint привязка запроса, native receipts, различение accepted/rejected/uncertain и сохранение идентичности при восстановлении. Browser или adapter не выбирает server-side модуль profile по пути из HTTP body. Неопределённый результат отправки не превращается в разрешение повторить эффект под новым request ID.

Код и проверки находятся в `apps/dpi-backend/src/{grants,auth,idempotency,store,routes}.ts`, native-profile admission и `apps/dpi-sdk`.

### 3. Собран native profile

Profile объединяет native tools/CodeMode, models, skills, external directories, guard integration, automation, subagents/parent control, memory/tracing и порты BB/iii. Эта composition — серверная ответственность. Регистрация модуля в ней не равна полной проверке каждого внешнего сервиса.

Session-local context и ресурсы не должны превращаться в общие globals другой сессии. Фактически используемая операционная схема — один Host-процесс с несколькими session Harness, а не обязательный отдельный процесс на каждую сессию.

### 4. Восстановлен каталог моделей

Более ранний Host использовал built-in provider catalogue и не показывал Terra 6.1 из более нового provider-owned cache обычного Pi. Проверка `/v1/models` с HTTP 404 не доказывала отсутствия модели: это был неправильный путь к каталогу конкретной сессии.

Operational model integration восстанавливает более новый provider-owned cache offline, сохраняет built-ins и не делает alias чужого model ID. Для Antigravity есть отдельная provider registration. Изолированные проверки и прежний real-cache parity probe зафиксированы в experiment-каталоге; текущая metadata-сверка подтверждает доступность нужных точных пар.

### 5. Сохранён Nico и обновлён pi-mcp

Nico остаётся session transport owner для MCP. Не использовалась замена на stock-manager: она не эквивалентна принятой схеме adapter-only servers и bridge/retry semantics. Сохранён native CodeMode boundary; исправлен structured-result bridge для массивов, scalar и `null`.

Обновление pi-mcp перенесено поверх актуального unified-catalog Host. Старый `nico-mcp140-v3` целиком не активировался. Согласованы source dependency pin, installed package, package archive и lock integrity records.

### 6. Исправлен большой initial SSE snapshot

В исходной регрессии snapshot размером больше 2 МБ приходил, но четыре последующих документа терялись. Причина — применение обычного backlog/disconnect поведения к ещё не опустевшему буферу initial snapshot.

Теперь сервер ждёт `drain` либо `close` перед отправкой следующих документов. Ограничение backlog для действительно медленного клиента сохранено. Основной owner продолжает исполняться независимо от клиентского stream.

### 7. Укреплён запуск и выполнено контролируемое переключение

Operational service учитывает сигнал завершения во время `Store.open`: не объявляет readiness преждевременно и освобождает уже полученное владение через shutdown. Терминальный launcher имеет бюджет ожидания запуска 330 секунд; конфигурация service и точное время запуска остаются отдельными настройками deployment.

После отдельного разрешения оператора выполнен один фактический stop/start с private backup, проверкой idle/owner, sealed manifest и post-start сохранности. Для подготовки этой документации нового cutover не было.

## Что работает и чем подтверждено

| Утверждение | Доказательство | Чего оно не доказывает |
|---|---|---|
| Host запущен и SDK читает его состояние | Свежие systemd status и API calls | Успех всех tools и providers |
| SSE доставляет документы после большого snapshot | Живой snapshot **3 089 294 байта**, затем **4/4 docs**, один snapshot на соединение | Непрерывную доставку при любой сетевой аварии |
| Медленный viewer по-прежнему ограничен | Изолированный steady-state backlog regression | Безлимитный stream buffer |
| Точный объединённый release проходит checks | **17/17 PASS, 0 FAIL, 0 SKIP** до активации | Новую полную проверку всех файлов репозитория сегодня |
| Старое состояние сохранено при cutover | 42 sessions, 47 conversations, **4984 entry hashes**, прежние configs/tasks/schedules | Импорт всех когда-либо существовавших исторических баз |
| Сохранено владение | Те же **44 lock paths** у нового PID после cutover | Постоянно неизменное число locks при создании новых sessions |
| Нужные модели присутствуют в каталоге | Живая availability-сверка точных provider/id | Реальный ответ каждого provider |
| Native reload API объявлен | Protocol capabilities и текущий source path | Переподключение MCP или поддержку произвольного Pi extension |
| BB/iii protocol части реализованы | Код, исторические isolated/package tests | Текущий живой BB/iii E2E |

Четыре документа реального SSE probe: `durable-goals.native-goals`, `durable.schedules`, `host.agent-mail`, `durable.triggers.watches`. В публичный документ не включены их тела.

## Что не работает или не принято

### MCP: неполный runtime inventory

При самом cutover по отношению к свежему baseline 18 разговоров потеряли ранее предложенные Langfuse tools и один — Open Design. Другие разговоры восстановили инструменты: это не 18 безвозвратно удалённых сессий. Persistent data/native parity при этом прошёл.

Текущая read-only сверка по 51 разговору:

| MCP namespace | Разговоров, в которых предложены tools |
|---|---:|
| `kanso` | 51 |
| `codegraph` | 50 |
| `mcp_agent_mail` | 51 |
| `railway` | 51 |
| `context_mode` | 51 |
| `langfuse` | 19 |
| `pi_lens` | 51 |
| `open_design` | 50 |
| `radius` | 51 |
| `exa` | 51 |
| `apify_catalog` | 51 |

Это **offered-tool inventory**, не проверка выполнения операций. Отсутствие tools не даёт достаточных данных, чтобы различить policy/profile ограничение и ошибку подключения. Причины каждого пропуска не установлены. Полный MCP parity не заявляется.

Обычный `SessionHandle.reload()` не переподключает эти источники: native profile создаёт MCP connections при composition, а `prepareReload` обновляет trusted adapter/model registry. API capability нельзя считать готовой функцией MCP reconnect. Ни дополнительный слепой restart, ни смена credentials ради скрытия расхождения не выполнялись.

### iii: engine жив, worker остановлен

Наличие engine и readable сохранённого SDK результата `done` не подтверждает работающий worker route. Отдельно предстоит восстановить worker и проверить delegated admission → исполнение/результат → retry/restart, сохраняя native authority и старые request IDs.

### BB: отложен

Код adapter, bindings и результаты fixtures сохраняются. По текущему плану живой BB/Core/Chrome milestone не принят и не входит в основной маршрут. Нельзя превращать прежний build PASS в утверждение о работоспособном UI или миграции BB.

### DeLM: интеграция не равна текущей работе команды

Существуют current-host SDK bindings, launcher/profile integration и runbook для actor-named sessions. Подготовленные панели и наличие `delm_wait` не доказывают доставку bootstrap, получение задания или полезную работу всех участников. В этом документировании действующая команда не запускалась и не переоценивалась. Старые результаты smoke/rehearsal не являются состоянием живого run на момент чтения.

### Memory, tracing и внешние tools

Hindsight/memory hooks, Langfuse tracing и Langfuse MCP — разные поверхности. Успех синтетических lifecycle tests не доказывает запись во все личные banks или полноту live tracing. Эти внешние эффекты не вызывались ради документации. Такой же предел относится к browser/search/image/Codex operations и совместимости произвольных native extensions.

### Не доказана универсальная миграция

Сохранность сессий уже работающего Host не означает перенос всех старых Pi/Durable баз или совместимость всех исторических task definitions. Продолжение выбранной старой сессии, импорт и rollback требуют отдельного, точного candidate/evidence. Предыдущие отчёты NO-GO сохраняются как исторические, а не стираются задним числом.

## Части системы и владение

Полная карта: [текущая архитектура](host-architecture.md).

```text
Наш TUI / SDK terminal ─┐
BB adapter (отложен) ───┼─ dpi-sdk ─ HTTP /v1 + SSE ─ dpi-backend
III delegated worker ──┘                              │
                                                      ├─ policy/grants/admission
                                                      ├─ Store + catalog/shared state
                                                      └─ native@1 session composition
                                                          ├─ Durable Harness → session SQLite
                                                          ├─ providers/model catalogue
                                                          ├─ native tools/CodeMode/guards
                                                          ├─ Nico → external MCP servers
                                                          ├─ skills/external dirs/memory/tracing
                                                          └─ native ports for parent control/BB/iii
```

Клиенты владеют draft/cache/reconnect state, но не native execution. Сервер хранит provider credentials; клиент использует выданный scoped credential. Protocol discovery не является выдачей прав. Отзыв grant и actual admission повторно проверяются на owning boundary.

## Переключение и сохранность

Активный release: `c0019d7-unified-sse-mcp140-20261031-v1`.

Manifest SHA256: `fc568c59e90fc1ec7cc29ef75711267870fe9a4b9394ba71f282eb38b1c62eb2`.

Private operational layout этой установки, не универсальная конфигурация клона:

```text
~/.config/pi-durable-host/             private service config, grants, bindings
~/.local/share/pi-durable-host/
  releases/                          sealed executable releases
  data/main/                         live catalog/session storage
~/.local/state/pi-durable-host/
  cutovers/                          private backup, before/after receipts
```

Cutover directory остаётся локально: `~/.local/state/pi-durable-host/cutovers/20261031-sse-mcp140-s8k0exfe/`. В нём находятся `pre-activation.tar`, `ACTIVATED.json`, `LIVE-SSE.json` и private before/after snapshots. Они не являются файлами для GitHub.

Последовательность: проверить idle/owner и release → остановить прежний Host → убедиться в освобождении locks → сделать и проверить backup → переключить service entrypoint → запустить → сравнить identity/config/history/task state и владельца → проверить API/SSE. Backup при успешном запуске не восстанавливался.

Начальная preflight-проверка отказала **до остановки**: код предполагал один root lock, хотя реально было два root locks и 42 session locks. Исправлена не политика владения, а ошибочный ожидаемый счётчик: сравнивается реальный набор owned lock paths до/после. Disposable regression проверяет чужого владельца и отсутствие модификации его lock.

## Проверки и границы доказательств

### До активации, на точном sealed release

- SSE-only regression: 2/2.
- Окончательный combined release: 17/17, без failures/skips.
- Source SSE и structured-result regressions: 3/3.
- Source backend TypeScript и offline dependency resolution: PASS.
- Проверки запуска/закрытия/reopen, owner-lock refusal, Nico/CodeMode и synthetic memory выполнялись без настоящих credentials, production databases или model calls.

Подробный прежний отчёт: [experiment README](../experiments/host-sse-mcp140-20261031/README.md). Привязка к manifest важнее совпадения названия каталога. Эти результаты не переименовываются в «весь репозиторий проверен заново».

### После активации

Живой large-history SSE probe и retained-state comparison относятся к фактическому Host. При cutover **0 model calls sent**. Свежая metadata-сверка для этого документа также не отправляла модельных запросов и не останавливала busy work.

### Статика и публикация

LSP-проверка четырёх experiment entrypoints в этом документировании не завершилась в выделенный бюджет: это **не clean verdict**. Эвристика unchecked throwing call отдельно разобрана: CLI boundary ловит rejection, санитизирует сообщение и отказывает в запуске; правила исполнения не ослаблялись. Annotated source отличается комментариями от прежнего exact candidate, поэтому старый hash не объявляется новым hash рабочего дерева.

Точные проверки публикуемого snapshot фиксируются в commit/report. Полная новая независимая milestone QA в этом документировании не выполняется; публикация feature-ветки не выдаётся за новый production release или принятие старых открытых критериев.

## Эксплуатация и восстановление

### Безопасно посмотреть статус

```sh
systemctl --user show pi-durable-host.service -p ActiveState -p SubState -p MainPID
systemctl --user status pi-durable-iii-engine.service pi-durable-iii-worker.service
pi-durable --help
```

Команды выше не означают разрешение на restart. Для текущего SDK launcher поддерживаются `--session`, `--continue`/`-c`, `--retry-new`, `--help`. Исторические `--extension`, `--listen`, `--print` и похожие Pi CLI флаги не включают fallback/local owner.

### Если startup refused

Сначала проверить private config permissions, grant, точную поддерживаемую команду и реального владельца. Не печатать token/config в лог или issue. Не удалять locks, не делать blind takeover и не переключаться на legacy runtime автоматически. Смерть PID проверяется вместе с lock identity и отсутствием живого owner; сама по себе старая запись не разрешает захват.

### Если stream подключён, но документов нет

Проверить не только HTTP 200 и snapshot: нужны запрошенные docs на том же соединении. Reconnect и повторный snapshot не являются доказательством исправленного initial drain. Slow-viewer disconnect должен оставаться независимым от исполнения сессии.

### Если нужно следующее переключение

Нужны отдельное разрешение, idle gate и новый backup. Проверять оба verdict: data/native и внешний MCP inventory. Не обещать full parity при отрицательном MCP verdict. Не восстанавливать database backup поверх нормально работающего нового owner для исправления внешнего подключения.

## Что осталось

1. Установить причины отсутствия MCP tools по конкретным session profiles и восстановить необходимый inventory; затем отдельно проверить операции. Не считать registry reload reconnect-механизмом.
2. Восстановить iii worker и принять весь delegated route на согласованном release.
3. Отдельно проверить настоящий provider response там, где требуется живое подтверждение, с разрешением на соответствующие calls.
4. Отдельно принять конкретные memory/tracing effects и поддерживаемые native extensions.
5. При возврате к BB — отдельный milestone с живым UI/E2E, не повторное использование build receipts как acceptance.
6. Миграцию других исторических баз проверять отдельно. Не расширять «сохранились данные Host» до «перенесено всё».

## Карта документов

- [README](../README.md) — текущая точка входа.
- [Архитектура, компоненты и потоки](host-architecture.md) — нынешняя реализация, не proposal.
- [Compound: installed package и package archive](solutions/workflow-issues/sealed-host-release-must-include-package-archives.md) — один подтверждённый lesson.
- [План и границы milestones](host-design/PLAN.md), [ISA](../ISA.md) — критерии и исторические acceptance; не live status.
- [Исходный архитектурный proposal](host-design/ARCHITECTURE.md) — альтернативы и проектный контекст на 28 октября.
- [Backend API](../apps/dpi-backend/API.md), [SDK](../apps/dpi-sdk/README.md), [native profile](../apps/dpi-backend/NATIVE.md).

> История решений сверялась с Hindsight страницами **Component map** и **Conventions and patterns**. Их исторические PASS/NO-GO не использованы как доказательство сегодняшней исправности. Текущее состояние выше основано на указанном live snapshot, source и датированных cutover receipts.
