# Состояние Pi Durable Host — 31 октября 2026

**Назначение:** передача состояния проекта и эксплуатационная справка. Это не объявление общей production-ready приёмки.

**Последние срезы:** metadata/SSE — `2026-10-31T20:08:59.968Z`; iii PASS — `2026-10-31T21:42:24.210Z`; отказ после другого restart — `2026-10-31T21:50:15.752282Z`; восстановленные службы и health — `2026-10-31T21:56:56.775822Z`. Это датированные наблюдения, не постоянно обновляемый dashboard. Срезы после 21:00 UTC соответствуют 1 ноября по МСК.

**Последнее подтверждённое состояние:** Host и iii worker восстановлены другой сессией и работают; engine не менялся, `/healthz` отвечает 200. Signed iii PASS относится к 21:42, до последующего restart. Причина shutdown hang и полный acceptance нового GipPity Voice entrypoint не закрыты. Хронология, методика и sanitized evidence — в [отчёте iii](iii-worker-verification-2026-10-31.md).

**Границы этой работы:** пользователь отдельно разрешил запуск только iii worker и read-only проверку; они выполнены в 21:42. Нынешнее обновление меняет только документацию и не разрешает restart Host/engine, обновление runtime/grants, модельные запросы или миграцию других баз.

## Содержание

1. [Краткий итог](#краткий-итог)
2. [Что запущено сейчас](#что-запущено-сейчас)
3. [Что сделано](#что-сделано)
4. [Что работает и чем подтверждено](#что-работает-и-чем-подтверждено)
5. [Что не завершено, неизвестно или не принято](#что-не-завершено-неизвестно-или-не-принято)
6. [Части системы и владение](#части-системы-и-владение)
7. [Переключение и сохранность](#переключение-и-сохранность)
8. [Проверки и границы доказательств](#проверки-и-границы-доказательств)
9. [Эксплуатация и восстановление](#эксплуатация-и-восстановление)
10. [Что осталось](#что-осталось)
11. [Публикация и передача работы](#публикация-и-передача-работы)
12. [Карта документов](#карта-документов)

## Краткий итог

Основной Host и наш SDK-терминал переключены на новую сборку. В ней есть восстановленный SSE drain-fix и `@earendil-works/pi-mcp 1.4.0`. Существующие сессии, история, модели и состояние задач сохранены при переключении.

**Не всё завершено, но не всё незавершённое сломано.** Причины различий MCP-регистрации ещё не установлены. После отдельного разрешения iii worker запущен: подписанный `info` через engine прошёл, зарегистрированы 17/17 функций, jobs остались 1 → 1. Последующий restart привёл к отказу в 21:50; затем Host и worker восстановлены, что подтверждено в 21:56. Signed iii вызов на новых PID ещё не повторялся. BB отложен. Полная task/retry/recovery приёмка iii, внешние операции и универсальная миграция не заявлены.

**Поправка к прежней диагностике:** `offered: false` у MCP через CodeMode не означает отсутствие инструмента. Нужно различать регистрацию, прямое предложение модели и успешное выполнение операции. Первый инспектор смешивал эти признаки; его нулевой результат нельзя использовать как основание для починки или перезапуска.

После просьбы остановиться сначала выполнялись только metadata/SSE-проверки. Позднее пользователь отдельно разрешил запуск iii worker; Host и engine этот исполнитель не перезапускал. Новый restart во время документирования наблюдался отдельно, его инициатор не установлен. Тела сообщений, документов, credentials и личные базы в документ не включены.

## Что запущено сейчас

| Элемент | Наблюдаемый результат | Основание |
|---|---|---|
| `pi-durable-host.service` | `active/running`, PID `637699`, `Result=success`, `ExecMainStatus=0` | Read-only systemd snapshot, 21:56:56 UTC; восстановлен после отказа 21:50 |
| Health endpoint | `GET /healthz` — HTTP `200` | Прямой loopback HTTP probe, 21:56 UTC |
| Настроенный Host entrypoint | `extensions/gippity-voice/0.1.0/operational-service.mjs` | Проверенный `ExecStart`, drop-in `zz-gippity-voice.conf`; работа этого entrypoint не принята |
| Прежний проверенный sealed release | `c0019d7-unified-sse-mcp140-20261031-v1` | Историческая активация и SSE evidence; не доказательство текущего entrypoint |
| Терминальный release | `terminal-catalog-20261031-v1` | Сохранённый activation receipt; этим SSE-переключением не заменялся |
| Wire API | `apiVersion: 1` в прежних успешных проверках; authenticated protocol/sessions — 200 после восстановления | Protocol/sessions и unauthenticated sessions 401 переданы TopazGlen за 21:53 UTC, здесь не повторялись |
| Sessions / conversations | **54 / 70** | Обход summaries и agent metadata, 20:08:59 UTC |
| Busy conversations | **6** в момент сверки | Обычная активность; не доказательство зависания и не разрешение на остановку |
| `pi-durable-iii-engine.service` | `active/running`, прежний PID `3779510` | Systemd snapshot, 21:56 UTC |
| `pi-durable-iii-worker.service` | `active/running`, PID `663985`, `Result=success`, `ExecMainStatus=0` | Systemd snapshot, 21:56 UTC; signed `info` проверен до следующего restart на PID `557496` |
| pi-mcp | **1.4.0** в прежнем активированном sealed release | Activation receipt, source manifest и lockfile; новый entrypoint отдельно не принят |

**42/47 при cutover, 46/51 в 18:49 и 54/70 в 20:08 — разные снимки.** При включении проверялась сохранность прежних 42 сессий и 47 разговоров; после него система продолжала работать. Рост количества сам по себе не доказывает ни повторную миграцию, ни потерю данных; для этого нужны сравнения точных IDs и истории.

Последняя отдельная проверка каталога моделей в 18:49 UTC подтвердила `available: true` для следующих пар; в повторной проверке 20:08 она заново не выполнялась:

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

После отдельного разрешения оператора выполнен один фактический stop/start с private backup, проверкой idle/owner, sealed manifest и post-start сохранности. При подготовке документации этот исполнитель нового cutover не выполнял; последующий restart наблюдался отдельно.

### 8. Запущен и проверен iii worker

По отдельному разрешению запущена только штатная `pi-durable-iii-worker.service`. В 21:42 UTC подписанный `durable-pi::info` через настоящий engine прошёл, registry содержал 17/17 функций, persisted binding совпала. `jobCount` остался 1 → 1, модельных submissions не отправлялось, PID Host/engine не изменились. Временный verifier client закрыт.

Это закрывает проверку read-only маршрута на тот момент, но не task/retry/recovery acceptance и не восстановление после последующего отказа Host. Методика, полный список функций и переносимый sanitized итог — в [отчёте проверки iii](iii-worker-verification-2026-10-31.md).

## Что работает и чем подтверждено

| Утверждение | Доказательство | Чего оно не доказывает |
|---|---|---|
| Host восстановлен и health endpoint отвечает | Свежие systemd state и `/healthz` 200, 21:56 UTC | Исправление shutdown hang, все MCP/tools или signed iii вызов после восстановления |
| SSE доставляет документы после большого snapshot | Живой snapshot **3 089 294 байта**, затем **4/4 docs**, один snapshot на соединение | Непрерывную доставку при любой сетевой аварии |
| Медленный viewer по-прежнему ограничен | Изолированный steady-state backlog regression | Безлимитный stream buffer |
| Точный объединённый release проходит checks | **17/17 PASS, 0 FAIL, 0 SKIP** до активации | Новую полную проверку всех файлов репозитория сегодня |
| Старое состояние сохранено при cutover | 42 sessions, 47 conversations, **4984 entry hashes**, прежние configs/tasks/schedules | Импорт всех когда-либо существовавших исторических баз |
| Сохранено владение | Те же **44 lock paths** у нового PID после cutover | Постоянно неизменное число locks при создании новых sessions |
| Нужные модели присутствуют в каталоге | Живая availability-сверка точных provider/id | Реальный ответ каждого provider |
| Native reload API объявлен | Protocol capabilities и текущий source path | Переподключение MCP или поддержку произвольного Pi extension |
| iii read-only путь работал через engine | В 21:42 signed `info` PASS, 17/17 функций, binding match, jobs 1 → 1 | Модельный E2E, retry/recovery или работу после последующего restart |
| BB protocol часть реализована | Код, исторические isolated/package tests | Текущий живой BB E2E |

Четыре документа реального SSE probe: `durable-goals.native-goals`, `durable.schedules`, `host.agent-mail`, `durable.triggers.watches`. В публичный документ не включены их тела.

## Что не завершено, неизвестно или не принято

### MCP: различия регистрации, причина пока неизвестна

При cutover по сравнению с его baseline в 18 разговорах отсутствовали ранее зарегистрированные Langfuse tools, в одном — Open Design. Проверка сохранности данных и native state при этом прошла. Это исторический результат сравнения конкретных разговоров, а не число сегодняшних неисправных серверов.

Повторная проверка в 20:08:59 UTC просмотрела 70 разговоров. Считалось наличие хотя бы одного зарегистрированного имени с соответствующим префиксом, **без фильтра по `offered`**:

| Namespace | Зарегистрирован хотя бы один инструмент | Прямо предложены модели через `offered: true` |
|---|---:|---:|
| `langfuse` | 38 из 70 | 0 из 70 |
| `open_design` | 69 из 70 | 0 из 70 |
| `codegraph` | 69 из 70 | 0 из 70 |

Нулевой последний столбец сам по себе нормален для доступа через CodeMode. Он не означает, что 70 разговоров лишились MCP. Остальные namespaces в этой повторной проверке заново не пересчитывались. Старые 19/51 для Langfuse и 50/51 для Open Design относятся к другому набору разговоров; их нельзя непосредственно сравнивать как процент исправления.

Нужно различать три независимых признака:

1. **Регистрация:** имя инструмента есть в `agent.get().tools`. Этот признак проверен таблицей выше.
2. **Прямое предложение:** инструмент передан модели непосредственно, а не доступен через CodeMode. `offered: false` не равен запрету всех способов вызова.
3. **Исполнение:** конкретный разрешённый вызов действительно завершился. Такие вызовы внешних MCP в повторной проверке не выполнялись.

Ошибочный инспектор проверял только второй признак и получил нули. Это ошибка интерпретации диагностики, а не установленная новая поломка Host. При этом различия **первого** признака остаются реальными наблюдениями: почему namespace отсутствует в конкретном разговоре, ещё нужно установить по его конфигурации, profile, policy и состоянию подключения. Нельзя считать причиной timeout, rate limit или credentials без отдельного доказательства.

[Session MCP composition](../experiments/sdk-host-cutover/session-mcp.mjs) после `manager.ready()` создаёт sources из каталога; `directTools` выбираются отдельно по `exposure === 'direct'`. [Native profile](../apps/dpi-backend/src/native-profile/profile.ts) устанавливает эти sources и имеет отдельный путь `prepareReload`. Обычный `SessionHandle.reload()` не следует считать готовым MCP reconnect: он не пересоздаёт эту session MCP composition. Слепой restart, ротация credentials и изменение глобальной конфигурации не выполнялись.

### iii: read-only PASS до следующего restart, полная приёмка открыта

До разрешённого запуска worker был `inactive/dead` с успешным завершением; прежняя причина остановки не установлена, crash не доказан. После restart Host с PID `434351` штатная проверка persisted binding прошла без изменения идентификаторов или конфигурации.

Пользователь разрешил запуск **только worker** и read-only вызов. `systemctl --user start --job-mode=fail pi-durable-iii-worker.service` завершился с кодом `0`. В `2026-10-31T21:42:24.210Z` worker PID `557496` был `active/running`, signed `durable-pi::info` прошёл через engine; все 17 функций зарегистрированы, поля binding совпали, runtime — `1.4.0`, jobs — 1 → 1. Host PID `434351` и engine PID `3779510` оставались прежними; запросов модели не было.

**После этого произошёл другой restart.** В срезе 21:50 UTC Host был `failed`, worker — `inactive/dead`. TopazGlen сообщил о запуске обеих служб в 21:53. Прямая read-only сверка в 21:56 подтвердила Host PID `637699`, worker PID `663985`, прежний engine PID `3779510` и `/healthz` 200. Восстановление служб выполнено; причина shutdown hang и новый signed `info` на восстановленном Host остаются открытыми. Повторно запускать уже активный worker не нужно.

[Worker adapter](../apps/iii-adapter/src/worker.ts) проверяет source/authority, session, workspace, namespace, config hash, worker identity, native session и owner conversation. Несовпадение отклоняется как `PERSISTED_BINDING_CONFLICT`; нельзя обходить его заменой идентичностей. `run` создаёт новый job; `conversations::follow_up` продолжает существующий разговор — одно не подменяет другое.

**Не проверялись в этом probe:** создание native request и получение receipt/result, retry с прежним request ID, ACK-loss, reconnect, interrupt, recovery, continuation и модельный E2E. Регистрация остальных 16 функций не означает, что они исполнены.

[Полный отчёт и sanitized evidence](iii-worker-verification-2026-10-31.md). Исходники: [adapter README](../apps/iii-adapter/README.md), [CLI](../apps/iii-adapter/src/main.ts), [SDK iii](../apps/dpi-sdk/src/iii.ts), [native iii](../apps/dpi-backend/src/native-profile/iii/index.ts), [HTTP tests](../apps/dpi-backend/tests/native-iii-http.test.ts), [adapter flow tests](../apps/iii-adapter/tests/native-flow.test.mjs). Эти test suites заново не запускались.

### BB: отложен

Код adapter, bindings и результаты fixtures сохраняются. По текущему плану живой BB/Core/Chrome milestone не принят и не входит в основной маршрут. Нельзя превращать прежний build PASS в утверждение о работоспособном UI или миграции BB.

### DeLM: интеграция не равна текущей работе команды

Существуют current-host SDK bindings, launcher/profile integration и runbook для actor-named sessions. Подготовленные панели и наличие `delm_wait` не доказывают доставку bootstrap, получение задания или полезную работу всех участников. В этом документировании действующая команда не запускалась и не переоценивалась. Старые результаты smoke/rehearsal не являются состоянием живого run на момент чтения.

### Memory, tracing и внешние tools

Hindsight/memory hooks, Langfuse tracing и Langfuse MCP — разные поверхности. Успех синтетических lifecycle tests не доказывает запись во все личные banks или полноту live tracing. Эти внешние эффекты не вызывались ради документации. Такой же предел относится к browser/search/image/Codex operations и совместимости произвольных native extensions.

### Не доказана универсальная миграция

Сохранность сессий уже работающего Host не означает перенос всех старых Pi/Durable баз или совместимость всех исторических task definitions. Продолжение выбранной старой сессии, импорт и rollback требуют отдельного, точного candidate/evidence.

В [текущем milestone плана](host-design/PLAN.md#текущий-milestone-переход-без-bb) остаётся **NO-GO для полного рабочего перехода**, пока не закрыты проверки сохранённых definitions, импорта, контролируемого продолжения, terminal/iii recovery и исходного restore-copy rollback. Это не противоречит факту уже работающего и отдельно активированного Host. Приёмку миграции нельзя закрыть одним зелёным service status.

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

Проверенный и ранее активированный sealed release: `c0019d7-unified-sse-mcp140-20261031-v1`. Этот раздел сохраняет историю его cutover; после изменения entrypoint на GipPity Voice нельзя считать тот же manifest доказательством текущего deployment.

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

### После активации и повторная проверка

Живой large-history SSE probe и retained-state comparison относятся к фактическому Host. При cutover **0 model calls sent**. Повторная metadata/SSE-проверка также не отправляла модельных запросов и не останавливала busy work.

После просьбы пользователя остановить починку выполнен повторный контроль через **Node `v24.19.0`**, с установленным SDK и тем же большим разговором из прежнего SSE receipt:

```text
frames: hello → snapshot → doc → doc → doc → doc
snapshotBytes: 3089294
documents: 4
snapshots: 1
connectionCount: 1
error: null
pass: true
modelCalls: 0
```

Это свежий контроль уже исправленного SSE, **не новая починка**. Промежуточный запуск в другом runner не показал кадров; этот результат не воспроизвёлся на целевом Node и не принят как доказательство поломки Host. Для повторения важны runtime, установленный SDK и те же четыре вида документов, а не только HTTP 200.

Методика находится в [live SSE probe](../experiments/host-sse-mcp140-20261031/verify-live-sse.mjs). Исторический `LIVE-SSE.json` остался прежним: повторный результат получен в проверке этой сессии, новый файл receipt не записывался. Скрипт с записью evidence нельзя запускать поверх уже существующего receipt без проверки его контракта.

### После restart Host: iii и последующее изменение состояния

В 21:42 UTC проверен настоящий read-only путь engine → worker → Host: signed `info` PASS, registry 17/17, binding match, jobs 1 → 1, probe exit `0`, без модельных запросов. Детали сохранены в [отдельном отчёте](iii-worker-verification-2026-10-31.md#evidence); локальный original result — `/var/tmp/iii-readonly-20261031-7SkjoW/result.json`.

Последующая systemd-сверка в 21:50 UTC зафиксировала Host `failed/failed`, PID `0`, `Result=signal`, `ExecMainStatus=9`; worker `inactive/dead` с успешным exit; engine `active/running`, PID `3779510`. TopazGlen сообщил, что его `systemctl kill` пришёлся уже на новый startup во время restart; причиной сигнала нельзя бездоказательно считать crash adapter.

По отчёту TopazGlen от 21:53:45 UTC Host и worker затем запущены без изменения файлов/DB/configuration; authenticated protocol/sessions вернули 200, sessions — 61, unauthenticated sessions — 401. Независимая read-only сверка этого исполнителя в 21:56:56 UTC подтвердила active Host PID `637699`, worker PID `663985`, прежний engine PID `3779510` и `/healthz` 200. Auth/count результаты не дублировались и отмечены как переданный отчёт. Причина shutdown hang не исправлена; signed iii на новых PID не проверялся. В рамках документирования этот исполнитель runtime не менял.

### Статика и публикация

При первой подготовке документов LSP-проверка четырёх experiment entrypoints не завершилась в выделенный бюджет: это **не clean verdict**. Эвристика unchecked throwing call была отдельно разобрана: CLI boundary ловит rejection, санитизирует сообщение и отказывает в запуске; guards не ослаблялись. Старый exact-candidate hash не объявляется hash любого последующего рабочего дерева.

Перед первой публикацией были зафиксированы 5/5 package typechecks, source regressions, проверка ссылок и исключение private/generated artifacts. Это исторические результаты той поставки, а не повторный запуск всех tests при каждой правке Markdown.

Текущее обновление меняет документацию, не продуктовый код. Для него проверяются локальные ссылки, anchors и состав diff; полная новая независимая milestone QA, внешние tool calls и модельный E2E не выполняются. Публикация feature-ветки не означает новый production release или закрытие старых открытых критериев.

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

Это порядок будущей работы, **не команда немедленно продолжать**. Починка приостановлена; ниже сформулированы действия, необходимые доказательства и границы разрешений. Закрытые проверки не следует повторять без изменения candidate, устаревания evidence или нового утверждения.

| Направление | Что уже есть | Что ещё не закрыто |
|---|---|---|
| Host / SDK / SSE | Службы восстановлены, `/healthz` 200 в 21:56; исторический большой SSE PASS | Причина shutdown hang, приёмка GipPity Voice entrypoint и reconnect/SSE после последнего restart |
| MCP | Зарегистрированные инструменты, Nico/CodeMode integration | Объяснение различий по конкретным разговорам и проверка нужных операций |
| iii | Signed read-only PASS и 17/17 функций в 21:42; worker снова active в 21:56 | Новый signed `info` на восстановленном Host; task/receipt/retry/ACK-loss/recovery acceptance |
| Терминал | SDK-клиент и исторические reconnect/PTY checks | Точные terminal/recovery критерии миграционного milestone |
| Модели | Каталог и точные provider/model IDs | Разрешённый реальный ответ нужного provider, если нужен для acceptance |
| DeLM | Launcher/bindings/runbook, подготовленные run artifacts | Текущий lifecycle и полезная работа команды не перепроверялись |
| Миграция | Fixtures, import/guard groundwork, прежние evidence | Все обязательные критерии плана, включая исходный restore-copy rollback |
| BB | Adapter и сохранённые результаты | Отдельный отложенный milestone; не выполнять сейчас |

### 1. Сначала установить, есть ли дефект MCP

**Действия:** выбрать конкретные разговоры с namespace и без него; проверить, должен ли этот сервер быть доступен каждому из них. Сопоставить profile, effective configuration, disposition, policy и безопасный connection status. Отделить ожидаемое отсутствие от неуспешного подключения. Сравнивать одинаковые session/conversation IDs, а не только общие количества.

**Что считать результатом:** для каждого исследованного пропуска есть объяснение и его источник. Для подтверждённого дефекта — воспроизведение на isolated fixture, исправление owning boundary и регрессия; для ожидаемого ограничения — явная запись, почему исправление не нужно. Затем отдельно проверить только необходимые разрешённые read-only операции. Регистрация инструмента не заменяет такой проверки.

**Не делать:** автоматически повторять потенциально уже выполненный `tools/call`, менять credentials, расширять grants, запускать новый Host или маскировать расхождение перезапуском. Внешние вызовы с расходами, закрытыми данными или изменением состояния требуют своего разрешённого scope.

**Где смотреть:** [session MCP](../experiments/sdk-host-cutover/session-mcp.mjs), [native composition](../apps/dpi-backend/src/native-profile/profile.ts), [раздел MCP выше](#mcp-различия-регистрации-причина-пока-неизвестна), [structured-result regression](../apps/dpi-backend/tests/native-mcp-structured-results.test.mjs).

### 2. Разобрать shutdown hang и продолжить iii acceptance без повторных эффектов

**Уже выполнено:** по отдельному разрешению worker запущен, engine registry и signed read-only `info` проверены в 21:42 UTC. Не повторять этот запуск как ещё не выполненную задачу и не переписывать adapter без воспроизводимого дефекта.

**После последующего restart:** Host отказал в 21:50, но TopazGlen восстановил службы в 21:53; read-only проверка в 21:56 подтвердила health. Восстановление не оставлять в списке как невыполненное и не запускать уже активные службы повторно. Открыты причина shutdown hang, lifecycle нового GipPity Voice entrypoint и повторная проверка persisted binding/engine registry/signed `info` на новых PID. Не удалять locks, не расширять grants и не смешивать прежний sealed-release acceptance с новым entrypoint.

**Отдельная оставшаяся приёмка:** согласовать native request → receipt → result → retry с тем же request ID, ACK-loss/reconnect и recovery/stop. Продолжение через `conversations::follow_up` проверять отдельно: новый `run` не подменяет continuation. Потеря transport connection не должна создавать повторный native эффект. Реальные модельные вызовы требуют своего разрешённого scope.

**Что считать результатом:** новый датированный signed read-only PASS на восстановленном Host и проверенная причина/регрессия shutdown hang, а затем отдельные доказательства task/retry/recovery. Старый receipt `done`, service active или один успешный `info` не закрывают все эти критерии.

**Где смотреть:** [проверка iii и границы PASS](iii-worker-verification-2026-10-31.md), [adapter README](../apps/iii-adapter/README.md), [worker](../apps/iii-adapter/src/worker.ts), [SDK](../apps/dpi-sdk/src/iii.ts), [native HTTP tests](../apps/dpi-backend/tests/native-iii-http.test.ts), [flow tests](../apps/iii-adapter/tests/native-flow.test.mjs).

### 3. Закрыть основной миграционный маршрут без BB

[PLAN.md](host-design/PLAN.md#готово-для-этого-ограниченного-маршрута-когда) определяет обязательные критерии. Их нельзя заменить статусом текущего Host:

- Проверить фактически сохранённые task/doc/model/source-profile definitions **до auto-resume**; неизвестные definitions должны приводить к отказу, а не угадыванию совместимости.
- На согласованной защищённой копии проверить импорт с сохранением native IDs, истории, задач, документов, children и pending state.
- Доказать контролируемое продолжение без повтора старых действий и без скрытого model remap. Если credentials не позволяют продолжить, записать barrier, не подменять модель.
- Проверить терминал и настоящий локальный iii через один backend без BB: reconnect, interrupt, recovery, authenticated retry/ACK-loss и no-replay.
- На отдельной restore-копии проверить возврат из нетронутого исходного backup с точным исходным runtime/profile. Старый runtime не должен открывать уже upgraded candidate DB.
- Связать source, target, candidate, команды и результаты в sanitized evidence и получить предусмотренную независимую проверку перед GO.

**Где смотреть:** [migration-readiness tests](../apps/dpi-backend/tests/migration-readiness.test.ts), [native import tests](../apps/dpi-backend/tests/native-import.test.ts), [offline-transition tests](../apps/dpi-backend/tests/offline-transition.test.ts), [runbook защищённого перехода](host-design/offline-transition/RUNBOOK.md). Эти ссылки указывают на groundwork; сами по себе они не закрывают acceptance.

### 4. Разделить оставшиеся интеграционные приёмки

- **Модели:** если acceptance требует реального ответа, согласовать точный provider/model, лимит и разрешение на запрос. Не считать `available: true` доказательством inference.
- **Memory/tracing:** отдельно проверить нужный эффект и изоляцию. Langfuse MCP, tracing и Hindsight memory — разные компоненты; успешный synthetic test не подтверждает все три.
- **DeLM:** если возвращаемся к команде, сначала сверить тот же run/board, actor bindings, точные модели, request IDs и saved receipts. Проверить bootstrap delivery, ACK и lifecycle до заявления «команда работает». Не создавать новую команду вместо разбора существующей.
- **BB:** оставить отложенным. Возвращать builds/bootstrap/Chrome/UI diagnosis только отдельным решением о scope; основной milestone от этого не зависит.

### 5. Если доказанно нужен новый production cutover

Текущее документирование не даёт такого разрешения. Перед новым переключением нужны отдельное согласование конкретного candidate и риск/rollback, проверка idle/owner, private backup, проверенный sealed manifest и проверка сохранности после старта. Шесть busy conversations относятся к срезу 20:08 UTC; это не актуальный idle verdict после последующего restart. Новый cutover нельзя начинать по старому счётчику.

Сравнить отдельно data/native parity и MCP registration/операции. Не восстанавливать DB backup поверх живого owner ради внешнего MCP подключения. Не удалять locks и не переписывать saved model IDs. Если новый cutover не нужен, не выполнять его «для уверенности».

### 6. Обновить evidence и статус, а не только список DONE

После фактически выполненного шага записывать: точный candidate/commit/manifest, команду, runtime, время, результат, private evidence locator и ограничения. Отдельно отмечать `PASS`, `FAIL`, `NOT_RUN`, ожидаемое ограничение и неизвестную причину. Продолжение работы и будущая публикация должны начинаться с актуального diff и live state, а не с предположения, что этот снимок всё ещё текущий.

## Публикация и передача работы

На момент повторной проверки локальная и удалённая `host/local-acceptance` указывали на `bb51571bbc3a545226cf2c1aacaf649ac6456112`; tracked/untracked рабочее дерево было чистым. Это проверка Git-состояния, не доказательство отсутствия любых других процессов или unpublished work вне этого checkout. Других видимых Intercom-сессий в каталогах этого fork и `master` тогда не было.

Ранее опубликованы:

- [`2aa8de9`](https://github.com/Diffuzmetall/pi-durable-host/commit/2aa8de9) — source snapshot Host/SDK/adapters.
- [`bb51571`](https://github.com/Diffuzmetall/pi-durable-host/commit/bb51571) — первая версия README, статуса, архитектуры и compound.
- [Ветка `host/local-acceptance`](https://github.com/Diffuzmetall/pi-durable-host/tree/host/local-acceptance). Ветка `main` не перезаписывалась; в проверке она указывала на `c0019d73152b58783d1b74fabe95f6982206aa55`.

**Это обновление Markdown — локальная правка поверх указанного опубликованного baseline. Новый commit/push в рамках этого запроса не выполняется.** Наличие новой формулировки в локальном файле не означает, что она уже появилась на GitHub.

**Последнее указание пользователя: обновить только Markdown и остановиться.** Повторный signed `info` на новых PID и расследование shutdown hang не выполнялись. Последний эксплуатационный срез остаётся 21:56 UTC; редактирование документов не обновляет его время и не подтверждает новое состояние служб. Перечень дальнейших действий выше — передача работы, не разрешение на автоматическое продолжение.

Передача следующему исполнителю: сначала прочитать этот статус, [отчёт iii](iii-worker-verification-2026-10-31.md), [архитектуру](host-architecture.md), [план](host-design/PLAN.md) и нужный owning source. TopazGlen восстановил службы; свежий health подтверждён в 21:56 UTC. Дальше нужны причина shutdown hang и signed iii проверка на новых PID, а не повторный запуск уже работающего service. Не повторять починку SSE или уже выполненный запуск iii без актуальных оснований. Различия MCP и полная iii/migration acceptance остаются отдельными задачами; старые PASS/task labels не заменяют новый результат.

## Карта документов

- [README](../README.md) — текущая точка входа.
- [iii worker: запуск, подписанный read-only PASS и последующий restart](iii-worker-verification-2026-10-31.md) — методика, 17 функций, evidence, границы и оставшиеся проверки.
- [Архитектура, компоненты и потоки](host-architecture.md) — нынешняя реализация, не proposal.
- [Compound: installed package и package archive](solutions/workflow-issues/sealed-host-release-must-include-package-archives.md) — один подтверждённый lesson.
- [План и границы milestones](host-design/PLAN.md), [ISA](../ISA.md) — критерии и исторические acceptance; не live status.
- [Исходный архитектурный proposal](host-design/ARCHITECTURE.md) — альтернативы и проектный контекст на 28 октября.
- [Backend API](../apps/dpi-backend/API.md), [SDK](../apps/dpi-sdk/README.md), [native profile](../apps/dpi-backend/NATIVE.md).

> 🧠 **From Hindsight memory (Migration readiness: backend, terminal and iii; BB deferred)** — основной milestone объединяет backend, SDK, терминал и локальный iii без BB; закрытые component tests не заменяют миграционную приёмку. Это сверено с текущим `PLAN.md`. Историческая память не используется как доказательство сегодняшнего состояния сервисов; runtime-утверждения выше привязаны к датированным проверкам.
