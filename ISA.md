---
task: "Самостоятельный Durable host на основе Disler с отдельными клиентами"
slug: pi-durable-host
project: pi-durable-host
phase: climbing
progress: 51/53
started: 2026-10-28
updated: 2026-10-29
principal_stated_goal: "Я хотел бы наш хост как раз сделать таким - чтобы был единый вход к дюрабл и мы через него подключали терминал, bb, iii и все остаьное."
principal_stated_goal_source: conversation
principal_stated_goal_signal: 2
principal_stated_goal_locked: 2026-10-28
context_sufficient: true
interview_invoked: true
---

# Pi Durable host

Локальная приёмка P0–P5 и повторное итоговое ревью завершены: 51 PASS / 2 PARTIAL / 0 UNKNOWN / 0 FAIL. Единый source/all-lockfiles/five-tarball tuple проверен native/faux/loopback сценариями и независимыми gates с раскрытием авторства. ISC-39/40 остаются частичными: disposable same-version rehearsal не заменяет реальный выбранный historical/cross-version переход. Running-BB production smoke, живые providers, личные banks и production не проверены/не активированы; BB `/compact` unsupported. Это не human project acceptance или универсальная plugin/recovery compatibility. [Финальная приёмка](docs/host-design/verification/final-p5/REPORT.md), [повторное ревью](docs/host-design/verification/post-final-review/REPORT.md), [план](docs/host-design/PLAN.md).

## Problem

Терминал сейчас создаёт и закрывает runtime вместе со своим интерфейсом. BB и iii используют отдельные сборки и договорённости о полномочиях, истории и восстановлении. Подключение ещё одного клиента требует знания этих внутренних деталей.

У Disler уже есть независимо работающий backend, HTTP-контракт и SDK. Однако его baseline использует Durable 1.0.3, ограниченный выбор провайдеров и общие полномочия device-token. Замена нашего host без адаптации потеряет нужные интеграции и гарантии.

## Vision

Пользователь начинает работу в привычном терминале, закрывает его и позже видит тот же разговор в BB, с результатом и понятным состоянием. Задание от iii попадает в тот же runtime, но не получает прав человека. Другой разработчик устанавливает только нужный клиент и подключает свой набор моделей и native Durable extensions без копирования нашей VPS.

Приоритеты: простое подключение, понятное состояние работы, быстрые и надёжные terminal/BB adapters. Новый интерфейс, магазин расширений и ещё один агентский движок не нужны.

## Out of Scope

Не входят: Pocket и его обновление; multi-tenant SaaS, аккаунты команд и биллинг; другие агентские движки; автоматическая совместимость обычных Pi extensions; исполнение произвольного кода расширений в браузере; multi-host aggregation и синхронизация файлов между машинами.

Не входят в текущую работу по проектированию: изменения production, миграция рабочих SQLite, переключение launchers, публикация пакетов. Подготовленный план этих действий не даёт разрешения их выполнить. Бесшовный перенос владельца без остановки и массовое продолжение всех старых сессий не требуются. Новая кнопка Stop не является требованием.

## Language

**Host** — сервер, владеющий жизненным циклом Durable sessions и предоставляющий клиентский API.
_Avoid_: TUI, обязательно один процесс, обязательно одна SQLite.
Связан с несколькими sessions; не переносит агентскую логику в клиент.

**Session** — сохраняемая среда выполнения, у которой один активный владелец и выбранный runtime profile.
_Avoid_: подключение клиента, BB thread, отдельное сообщение.
Содержит conversations. В baseline Disler ей соответствует собственная `agent.sqlite`.

**Conversation** — разговор внутри session, включая разговор дочернего агента.
_Avoid_: session, HTTP-соединение.
Несколько клиентов могут обращаться к одному conversation.

**Runtime profile** — доверенная владельцем сборка моделей, native extensions, инструментов и политик для поддерживаемого Pi Durable.
_Avoid_: произвольный движок, автоматически импортируемый код из HTTP-запроса.
Выбирается на сервере; не определяет wire-контракт клиента.

**Client adapter** — отдельно выпускаемый пакет, переводящий протокол своего интерфейса в публичный API host.
_Avoid_: копия runtime, владелец session SQLite, native extension.
Terminal, BB и iii adapters зависят от версии API, а не от внутреннего устройства друг друга.

**Native Durable extension** — серверное расширение, совместимое с выбранным SDK и сохранёнными task/document definitions.
_Avoid_: любой пакет из обычного каталога Pi extensions.
Регистрация расширения не доказывает совместимость его сохранённых задач.

## Principles

- Сначала повторно использовать работающую часть Disler. Новая граница нужна только там, где существующий код не выдерживает конкретный сценарий.
- Права и приём команд принадлежат серверу. Клиент показывает состояние, но не объявляет себя человеком или родителем агента.
- Подтверждённая команда и потерянный сетевой ответ — разные события. Неопределённость показывается явно, а не устраняется повторным запуском.
- Развитие продукта измеряется пользовательскими сценариями, а не числом пакетов и абстракций.

## Constraints

- Основа — этот fork `disler/durable-pi`, baseline `37165c619573dbaf425463038bbffecfe576beec`. Сохраняются Git-история и MIT notices IndyDevDan.
- Исходная поддерживаемая линия runtime — Pi Durable 1.4.0 с согласованными версиями `chord`, `pi-ai`, `pi-coding-agent` и используемых SDK-пакетов.
- Один активный владелец выполнения на session. Клиенты не открывают её SQLite.
- Сохраняются наш TUI, model/provider IDs, server-side auth, native task/document identities, admission и parent-control semantics.
- Минимальная установка не зависит от BB, iii, Hindsight, `master/experiments`, домашнего каталога автора или его секретов. Наш полный profile подключается отдельно.
- Порядок пользовательских выпусков: terminal → BB → iii. Reference web/curl допустим как проверка протокола, но не как обязательный отдельный продукт перед BB.
- Сеть по умолчанию локальная или закрытая. Существующие способы прерывания сохраняются; разрыв соединения не означает прерывание.
- Технические подробности процесса выбираются по проверкам. Нельзя переносить process-global интеграции в многосессионный процесс на основании одного успешного single-session теста.

## Goal

> Я хотел бы наш хост как раз сделать таким - чтобы был единый вход к дюрабл и мы через него подключали терминал, bb, iii и все остаьное.

Доработать Disler до самостоятельно устанавливаемого host для Pi Durable 1.4.0: наш терминал, BB и iii подключаются через общий API отдельными пакетами, сохраняя полномочия и восстановление. Готовность означает прохождение приведённых ниже проверок на конкретных версиях пакетов; завершённый документ или upstream-тесты на 1.0.3 готовностью продукта не считаются.

## Test Strategy

Таблица задаёт acceptance cases; реализованные проверки и named candidates указаны в Verification. Остальные строки остаются планом, не утверждением о существовании тестовых файлов. Их размещение и порядок заданы в [PLAN](docs/host-design/PLAN.md). Новые тесты запускаются с временными HOME/dataDir и faux provider; production и платные модели не используются без отдельного разрешения.

| isc | type | check | threshold | tool | anchors_to |
|---|---|---|---|---|---|
| ISC-1 | integration | owner-exclusion: два процесса открывают одну session | ровно один владелец; второй не вызывает resume | node:test + процессы | derived: единый вход |
| ISC-2 | security | credential-sentinel: HTTP, SSE, ошибки и логи | 0 вхождений тестового секрета | node:test | derived: серверный auth |
| ISC-3 | security | observer-write-denied | 0 принятых mutations | HTTP harness | derived: несколько клиентов |
| ISC-4 | security | delegated-human-spoof | 0 human-admissions по машинному grant | HTTP + native receipt | derived: iii |
| ISC-5.1 | security | revoked-grant-read | чтение после reconnect запрещено | HTTP harness | derived: права |
| ISC-5.2 | security | revoked-grant-write | новая команда после revoke не принята | HTTP + native receipt | derived: права |
| ISC-5.3 | security | revoked-grant-active-stream | event, созданный после revoke, не доставлен | open SSE + revoke + sentinel | derived: права |
| ISC-6 | regression | stored-model-unavailable | модель не меняется; явная ошибка | Harness + faux fixtures | derived: сохранить runtime |
| ISC-7 | recovery | incompatible-profile-before-resume | 0 возобновлённых tasks | Harness fixtures | derived: свой Durable |
| ISC-8 | package | client-storage-boundary | клиентские пакеты не импортируют session storage/Harness | package/import check | derived: frontend |
| ISC-9 | install | clean-home-install | faux-сеанс работает без частных путей и профиля | packed packages + isolated HOME | derived: самостоятельность |
| ISC-10 | integration | sdk-1.4-tool-roundtrip | HTTP submit → tool → результат на 1.4.0 | node:test + real Harness | literal |
| ISC-11 | integration | second-profile | иной профиль подключается без правки backend/SDK | fixture integration | derived: свой Durable |
| ISC-12 | security | dcg-unavailable | опасный тестовый shell-вызов не исполняется | recording execution env | derived: сохранить guard |
| ISC-13 | security | codemode-nested-denial | вложенный запрещённый вызов не проходит | local MCP fixture | derived: инструменты |
| ISC-14.1 | isolation | memory-context-two-sessions | контекст session A не попадает в B | isolated Hindsight fixture | derived: runtime isolation |
| ISC-14.2 | isolation | memory-logs-two-sessions | session-specific логи A не пишутся в путь B | isolated Hindsight fixture | derived: runtime isolation |
| ISC-15 | recovery | schedule-restart | одно принятое scheduled submission | faux + restart | derived: native automation |
| ISC-16.1 | recovery | native-task-reopen | task fixture возобновляется с прежним ID | pinned registry fixture | derived: tasks |
| ISC-16.2 | recovery | native-document-reopen | document fixture читается под прежним ID | pinned registry fixture | derived: documents |
| ISC-17 | contract | unknown-render-kind | доступен безопасный текст, код не исполняется | SDK/client fixture | derived: любой frontend |
| ISC-18.1 | UI | terminal-editor-submit | прежний editor отправляет ожидаемый текст | terminal harness | derived: наш TUI |
| ISC-18.2 | UI | terminal-tool-stream | tool fixture отображает согласованную последовательность | terminal harness | derived: наш TUI |
| ISC-18.3 | UI | terminal-navigation | прежняя navigation открывает выбранный transcript | terminal harness | derived: наш TUI |
| ISC-19.1 | UI | terminal-existing-interrupt | эффект interrupt совпадает с baseline | terminal + task observations | derived: наш TUI |
| ISC-19.2 | UI | terminal-existing-steer | эффект steer совпадает с baseline | terminal + task observations | derived: наш TUI |
| ISC-20 | integration | detach-keeps-running | результат появляется после закрытия клиентов | faux + disconnect | literal |
| ISC-21 | contract | reconnect-converges | список entries равен snapshot, без дублей | SDK reconnect test | derived: надёжность |
| ISC-22 | recovery | attention-reconnect | неотвеченный запрос снова виден; ответа по умолчанию нет | native attention fixture | derived: состояние работы |
| ISC-23 | fault | submit-lost-ack | прежний requestId даёт прежний submission | crash points + HTTP | derived: надёжность |
| ISC-45 | recovery | retry-after-cache-expiry | прежний key не создаёт второй ресурс/submission | clock advance + native reconcile | derived: надёжность |
| ISC-24 | security | request-body-conflict | тот же key с другим телом отклонён | HTTP concurrency test | derived: надёжность |
| ISC-25 | fault | create-concurrent-crash | один ресурс на key после reconcile | catalog/Harness crash test | derived: простой API |
| ISC-26 | performance | transport-local-latency | p95 ≤ 1,2 × baseline + 50 мс | deterministic stream fixture | derived: быстрый terminal/BB |
| ISC-27 | load | stalled-viewer-isolation | slow viewer отсоединён; второй получает итог | bounded stream test | derived: надёжность |
| ISC-28 | integration | bb-thread-session-binding | thread открывает только привязанный conversation | BB adapter fixture | literal |
| ISC-29 | fault | bb-history-lost-ack | повтор того же digest не создаёт новых entries | CAS/history fixture | derived: BB history |
| ISC-30 | integration | bb-native-child-control | сохранён parent/child scope и terminal outcome | isolated BB + native fixture | derived: BB subagents |
| ISC-31 | package | bb-only-update | terminal-пакет и его артефакт не изменены | mixed-version package test | derived: отдельные адаптеры |
| ISC-32 | integration | iii-job-retry | один native submission на job binding key | iii adapter fixture | literal |
| ISC-33.1 | security | iii-parent-scope | control чужого child отклонён | native parent-control fixture | derived: iii authority |
| ISC-33.2 | security | iii-stale-revision | control со stale revision отклонён | native parent-control fixture | derived: iii authority |
| ISC-34 | recovery | iii-late-result | answerRef читается после reconnect/restart | receipt/result fixture | derived: iii recovery |
| ISC-35 | developer | sdk-client-recipe | пример читает результат без импорта Durable | clean Node client | derived: простой frontend |
| ISC-36 | developer | http-without-sdk-recipe | curl submit/receipt/result проходит | shell + faux host | derived: любой frontend |
| ISC-37 | compatibility | unsupported-protocol-capability | mutation не отправляется; причина видна | old/new client fixtures | derived: отдельные пакеты |
| ISC-38 | package | independent-install | каждый из terminal/BB/iii ставится без двух других | tarball dependency test | derived: отдельные пакеты |
| ISC-39 | migration | selected-session-copy | разрешённая fixture продолжает сохранённую работу | offline copy + candidate | derived: существующая история |
| ISC-40 | recovery | restore-backup | исходная версия открывает сохранённую исходную копию | disposable restore rehearsal | derived: безопасный переход |
| ISC-41 | legal | upstream-license | исходные copyright и MIT текст сохранены | license/package check | derived: переиспользование |
| ISC-42 | integration | goal-human-acceptance | pending human criterion не закрывается машинным клиентом | native Goal fixture | derived: native automation |
| ISC-43 | isolation | mail-two-sessions | session A не использует identity/grant session B | local MCP recording fixture | derived: runtime isolation |
| ISC-44 | integration | profile-tool-inventory | согласованный inventory доступен через host | configured local tool fixtures | derived: сохранить инструменты |

Бюджет ISC-26 — начальный инженерный критерий, не измеренный результат и не цитата пользователя. Baseline фиксируется на том же TUI/BB fixture без реального LLM; измеряется commit→видимое обновление. При непригодности метрики сначала уточняется критерий с обоснованием, а не объявляется успех по иной метрике.

## Features

### F0 · Безопасно подключить несколько клиентов

Why: новый вход не превращает наблюдателя или machine worker в владельца машины.

- [x] ISC-1: Anti: второй процесс не становится владельцем уже открытой session.
- [x] ISC-2: Anti: секрет провайдера не попадает в клиентские ответы, события или диагностические логи.
- [x] ISC-3: Anti: observer grant не разрешает mutations.
- [x] ISC-4: Anti: delegated grant не может вызвать human admission поддельным полем запроса.
- ISC-5: Отзыв grant действует на последующие операции.
  - [x] ISC-5.1: Отозванный grant не разрешает чтение после reconnect.
  - [x] ISC-5.2: Отозванный grant не разрешает принятие новой команды.
  - [x] ISC-5.3: Открытый stream отозванного grant не доставляет защищённое событие, созданное после revoke.
- [x] ISC-6: Anti: отсутствие сохранённой модели не вызывает её автоматической замены.
- [x] ISC-7: Несовместимый runtime profile отклоняется до возобновления сохранённых задач.
- [x] ISC-8: Anti: клиентский пакет не становится владельцем Durable storage.

### F1 · Установить свой host и подключить свой runtime profile

Why: разработчик получает рабочую установку без чужой VPS и добавляет свои расширения без fork backend.

- [x] ISC-9: Минимальная установка запускает faux-сеанс в чистом HOME без частных интеграций.
- [x] ISC-10: HTTP-клиент получает результат tool roundtrip на Pi Durable 1.4.0.
- [x] ISC-11: Второй доверенный profile подключается без изменения backend или SDK.
- [x] ISC-12: Наш profile сохраняет fail-closed DCG при недоступности guard.
- [x] ISC-13: CodeMode сохраняет проверку полномочий вложенного MCP-вызова.
- ISC-14: Hindsight сохраняет изоляцию sessions.
  - [x] ISC-14.1: Контекст session A не попадает в session B.
  - [x] ISC-14.2: Session-specific логи A не записываются в путь B.
- [x] ISC-15: Принятое расписание переживает restart без повторного submission.
- ISC-16: Совместимый registry сохраняет native identities при reopen.
  - [x] ISC-16.1: Task fixture возобновляется с прежним ID.
  - [x] ISC-16.2: Document fixture читается под прежним ID.
- [x] ISC-17: Неизвестный клиенту render kind отображается безопасным текстом.
- [x] ISC-42: Goal сохраняет необходимость человеческого принятия human criteria.
- [x] ISC-43: Две session сохраняют отдельные Agent Mail identities и grants.
- [x] ISC-44: Наш profile предоставляет согласованный inventory tools из OBSERVE.

### F2 · Продолжить работу из привычного терминала

Why: переход на удалённое выполнение не требует заново учиться пользоваться TUI.

- ISC-18: Наш TUI сохраняет привычные операции.
  - [x] ISC-18.1: Прежний editor отправляет ожидаемый текст через remote controller.
  - [x] ISC-18.2: Tool streaming отображается как в согласованной baseline fixture.
  - [x] ISC-18.3: Прежняя navigation открывает выбранный transcript.
- ISC-19: Существующее управление работой не заменяется новым UX.
  - [x] ISC-19.1: Interrupt сохраняет эффект из baseline fixture.
  - [x] ISC-19.2: Steer сохраняет эффект из baseline fixture.
- [x] ISC-20: Работа завершается после закрытия последнего клиента.
- [x] ISC-21: Reconnect восстанавливает актуальную проекцию разговора без дублирования entries.
- [x] ISC-22: Неотвеченный durable attention request остаётся доступен после reconnect.
- [x] ISC-23: Повтор принятого запроса после потери ACK возвращает прежний submission.
- [x] ISC-45: Истечение response-cache не позволяет повторно исполнить прежний request key.
- [x] ISC-24: Повтор request key с изменённым содержимым отклоняется.
- [x] ISC-25: Конкурентное создание с одним key после сбоя даёт один ресурс.
- [x] ISC-26: Задержка отображения укладывается в бюджет локального transport fixture.
- [x] ISC-27: Зависший viewer не мешает другому клиенту получить итог.

### F3 · Открыть ту же работу в BB

Why: BB остаётся интерфейсом к существующей работе, а не запускает её копию.

- [x] ISC-28: BB thread разрешается в точно привязанные session и conversation.
- [x] ISC-29: Повтор доставки истории после потерянного ACK сохраняет CAS/digest semantics.
- [x] ISC-30: BB использует native parent-control для существующих дочерних агентов.
- [x] ISC-31: Совместимое обновление BB adapter не требует обновления terminal adapter.

### F4 · Выполнить задание iii с ограниченными правами

Why: automation получает надёжный результат, не обходя человеческие ограничения.

- [x] ISC-32: Повтор iii job binding key соответствует одному native submission.
- ISC-33: iii control соблюдает native parent authority.
  - [x] ISC-33.1: Control чужого child отклоняется.
  - [x] ISC-33.2: Control со stale policy revision отклоняется.
- [x] ISC-34: Завершённый результат iii доступен по durable reference после reconnect.

### F5 · Подключить ещё один frontend

Why: сторонний автор пишет клиентский сценарий, а не изучает Harness и SQLite.

- [x] ISC-35: Рабочий пример TS SDK получает ответ без импорта Pi Durable.
- [x] ISC-36: Рабочий пример HTTP без SDK получает receipt и итог.
- [x] ISC-37: Клиент отклоняет несовместимый protocol или отсутствующую обязательную capability до mutation.
- [x] ISC-38: Terminal, BB и iii adapters устанавливаются независимо друг от друга.

### F6 · Перенести выбранную сессию с возможностью возврата

Why: владелец проверяет переход на копии и сохраняет исходные данные до смены runtime.

- [ ] ISC-39: Совместимая выбранная session из разрешённой копии продолжает сохранённую работу.
- [ ] ISC-40: Репетиция возврата восстанавливает исходную версию из согласованного backup.
- [x] ISC-41: Производные исходники и пакеты сохраняют MIT notices upstream.

## Decisions

| Дата | Решение | Основание |
|---|---|---|
| 2026-10-28 | Сохранён буквальный Goal, с исходной орфографией | Conversation 1, entry 97 |
| 2026-10-28 | Результат текущей работы — OBSERVE → THINK → ISA, схемы и план | Conversation 1, entry 240 |
| 2026-10-28 | Интервью проведено одним списком по просьбе пользователя; ответы перенесены, повторных вопросов нет | Conversation 1, entries 980, 982 |
| 2026-10-28 | Персональный standalone host, Durable 1.4, наш TUI, отдельные adapters, terminal → BB → iii | Ответы 1–7 в entry 982 |
| 2026-10-28 | Кнопка Stop исключена из новых требований; существующее прерывание сохраняется | Ответ 9 в entry 982 |
| 2026-10-28 | Disler скопирован как настоящая кодовая основа с историей, не набор идей для нового host | Запрос reuse-first; baseline 37165c6, remote upstream |
| 2026-10-28 | Pocket не используется и не обновляется | Пользователь: «ок не берем покет, работаем с дислер, продолжай» |
| 2026-10-28 | Process placement закрывается экспериментом P0; неподтверждённый multi-session embed не выпускается | OBSERVE: Hindsight env, Agent Mail env, global HTTP dispatcher |
| 2026-10-28 | Dependencies/Bridge Criteria не добавлены: это самостоятельная ISA, не дочерняя к master/ISA.md | master/ISA.md относится к другой задаче |
| 2026-10-28 | Вопросы о 1.4, receipts и process isolation записаны как проверяемые критерии, а не туман | У каждого есть определённый falsifier и P0/P1 probe |
| 2026-10-28 | refined: составные ISC-5/14/16/18/19/33 разделены на leaf criteria; родительские IDs сохранены | CheckCompleteness: независимые сбои должны проверяться отдельно |
| 2026-10-28 | Revoke распространяется на открытые streams; canonical request mappings не имеют автоматического TTL в первом выпуске | Независимый review: одного reconnect check и 24-часового response-cache недостаточно; ISC-5.3/45 |
| 2026-10-28 | Пользователь разрешил после повторного doc review локальную реализацию P0–P5 четырьмя DeLM-агентами GPT-6.1 Sol / medium; первый создаёт параллельные задачи и тоже реализует | Новое прямое задание; production, живые DB, commit/push/publish/deploy не включены |
| 2026-10-28 | Стартовые outputs разделены по границам файлов; один владелец coupled runtime и dependency edits | Повторный ce-doc-review: feasibility finding о пересечении четырёх исполнителей в Store/openAgent; конкретное распределение принадлежит доске |

## Learning

- **conjectured:** достаточно отделить наш `controller/view` от TUI и разместить несколько runtimes в одном процессе.
  **refuted by:** source-находки process-global Hindsight log paths, Agent Mail env и HTTP dispatcher; работающий single-session controller не доказывает их изоляцию.
  **learned:** единый API не требует общего процесса выполнения; нужно проверять двух владельцев с разными cwd и полномочиями.
  **criterion now:** ISC-1, ISC-14, ISC-43.

- **conjectured:** REST и `Idempotency-Key` у Disler уже дают достаточное основание безопасно повторять потерянные команды.
  **refuted by:** `idempotency.ts` сохраняет create response после операции и не сравнивает fingerprint тела.
  **learned:** receipt должен связываться с native admission; сетевой retry не доказывает отсутствие повторного действия.
  **criterion now:** ISC-23, ISC-24, ISC-25, ISC-32.

- 2026-10-29 | conjectured: рекурсивное совпадение `role=assistant, stopReason=error` достаточно, чтобы распознать native failure.
  refuted by: independent native gate `445` воспроизвёл порчу здорового `toolCall.arguments.document` на архиве `379cf10a…`.
  learned: privacy projection должна различать native entry/event envelopes и непрозрачные пользовательские arguments/results.
  criterion now: ISC-2, ISC-18.2 и ISC-44 сохранены без ослабления; исправление проверено на successor `4d3cf2d8…`.

- 2026-10-29 | conjectured: декорации первоначального registry достаточно для session-scoped Hindsight callbacks после reload.
  refuted by: independent memory gate `451` — explicit-target reload и neutral native section caller теряли recall после нового fork.
  learned: captured session scope нужен при каждом default/explicit/fresh-target install, включая delivery definitions.
  criterion now: ISC-14.1, ISC-14.2 и ISC-43 проверены на corrected immutable successor; старый архив не переобъявлен успешным.

## Verification

### Current assembled candidate status

**LOCAL P0–P5 ACCEPTED; NOT PRODUCTION-READY.** Independent final gate `2d92aad6…` DONE816 and post-final detailed review `99fa4c40…` DONE823 accept the frozen backend1df78d0f/SDK35105485/terminal1f1b74fa/BB01210a7d/iii75da7623 tuple: five strict checks, 193/193 source tests, installed native signed/HTTP/security15/default-CLI/curl/mixed-version/independent-client cases. Client auth/domain is independently covered by nonauthor Dave807/812, not Alice self-approval; server is independently exercised by Alice. The 53-leaf evidence table, commands, hashes, authorship and prior unchanged-UI limits are in [final report](docs/host-design/verification/final-p5/REPORT.md); [post-final review](docs/host-design/verification/post-final-review/REPORT.md) rechecks all source/locks/archive/installed/evidence identities and five types. Real ISC-39/40 remain PARTIAL; running-BB, live providers and production remain untested/unauthorized. Public docs/source delivery follows separate authorized tasks and never publishes these private reports.
- Authorization correction: independent nonauthor gate `ef1c638e…`: 18/18 plus 18 separate HTTP negative checks PASS on the corrected source; resolution `7cc55cfa…`; no additional leaf or assertion of unproven exploits.

### Historical security status before independent correction (superseded)

**NOT RELEASE-READY.** ISC-2 is a confirmed current FAIL; security correction and independent review are pending. Earlier scoped artifact checks below remain historical evidence, not a blanket PASS for the assembled checkout. No publication or production authorization follows from this correction; security review material requires a separate disclosure check.

A second confirmed P1 authorization defect is also an open release blocker (internal DeLM `f88bac4e…`, correction `4955af8f…`). It requires its own fix and independent route-family regressions; exploitation of the other special routes is not asserted. This does not invent a new leaf or treat a demonstrated read-permission bypass as proof of a different mutation claim failing.

- ISC-2: security — FAIL, operator-provided isolated HTTP regression; internal DeLM `703d7fdf2a044d8d9f5c22414c113f7c`, correction `7bb2116740ba4512938f3ff2a2a8007c`; no corrected candidate independently accepted yet.

The reported iii source/declaration typecheck failure remains unresolved active work, not an accepted package. Its final gate must check the actual SDK declarations and a clean installed immutable SDK+iii tuple without `any`/`@ts-ignore` masking. The existing final gate must freeze one source/lockfile/tarball hash tuple under narrow leases, typecheck all five packages, run relevant full suites and both new security regressions, clean-install the packages and exercise unchanged-terminal mixed versions on that same final tuple; each corrected slice needs a nonauthor reviewer. This canonical update records the operator's runtime evidence and direct source inspection; it does not claim a new runtime reproduction by the documentation writer.

### Independently accepted local native/memory candidate

Named candidate: `/tmp/dpi-packed-y88Lnt/artifacts/dpi-backend-0.1.0.tgz`, SHA-256 `4d3cf2d8fcae7cebaa35c3bd6b177a343a38d2641ee5d216db7106702708d38e`; unchanged SDK `dpi-sdk-0.1.0.tgz`, SHA-256 `d98831740905de74cffc64243d1b2c54cd83e8e76a34c927fa2b5f139e1cdd43`. Independent native gate `5bfaf889e3fd4beca9a7ffb5f494ba3a` DONE (`483/484`) and memory gate `d7edb43fab3a42ca8d7b0ea0af965cfd` DONE (`476/478`) disclose authorship exclusions and cover this same successor. Only four backend runtime files changed from the rejected archive; unchanged automation/subagent probes carry on byte-identical modules.

- ISC-2: security — independent successor `7/7`, provider sentinel on HTTP entries/transcripts/live SSE/reconnect/errors/logs plus opaque-argument preservation; `/tmp/alice-native-successor-final.log`, gate `5bfaf889…`.
- ISC-4: security — installed composed HTTP spoofed actor/authority/tools/policy fields retain native delegated receipt and read-only policy; `/tmp/alice-native-successor-final.log`, `native-profile-composition.test.ts`.
- ISC-12: security — actual composed native DCG missing/deny does not execute fixture shell; `/tmp/alice-native-successor-final.log`, gate `5bfaf889…`.
- ISC-13: security — actual nested CodeMode current authorization/revoke denies the second effect; `/tmp/alice-native-successor-final.log`, gate `5bfaf889…`.
- ISC-14.1: isolation — independent installed A/B context/bank/fork/reload probes `6/6`, composed `1/1`, fresh/default `3/3`; `docs/host-design/verification/memory-gate/SUCCESSOR.md`.
- ISC-14.2: isolation — installed log/diagnostic/usage paths and content remain session-owned through reload and close; `/tmp/dave-memory-successor-native.log`, gate `d7edb43…`.
- ISC-15: recovery — one schedule occurrence reopens with identical native task/doc/request IDs; `/tmp/alice-native-gate-controls.log` (`18/18`, unchanged successor automation bytes).
- ISC-16.1: recovery — native child/task/canonical receipt IDs and registered definitions survive reopen; `/tmp/alice-native-gate-controls.log`, gate `5bfaf889…`.
- ISC-16.2: recovery — schedule, delegated-input and parent-control documents retain their registered identities/state after reopen; `/tmp/alice-native-gate-controls.log`, `/tmp/alice-native-successor-final.log`.
- ISC-42: integration — model evidence cannot supply human approval; root-only current native admission/budget/revoke remain enforced; `/tmp/alice-native-gate-controls.log` (`18/18`).
- ISC-43: isolation — actual local MCP Mail identity/project/registration/revoke and close-A/leaves-B probes; `/tmp/dave-memory-successor-native.log`, `/tmp/dave-memory-successor-composed.log`.
- ISC-44: integration — configured installed single registry exposes the agreed external names and skills discovery, executes original tool families via scoped Models/loopback; `/tmp/alice-native-successor-final.log`, OBSERVE inventory boundary.

Current accounting after independent local R1/R2 correction gate `cc1a0f69…` DONE916: **51 PASS / 2 PARTIAL / 0 UNKNOWN / 0 FAIL** in the recorded scope. The temporary conservative **49 PASS / 2 PARTIAL / 2 FAIL** recorded the compaction/inspect leak and broader same-process one-owner defect; explicit resolutions911/912 follow independent corrected-source and compiled-package proof, not a retroactive PASS for the original candidate. See [R1/R2 evidence](docs/host-design/verification/r1-r2/REPORT.md). All 53 leaves retain their frozen IDs/text/order and six-column strategy/thresholds; each is mapped once in the final report and current PLAN. Only real selected-history/cross-version copy/restore ISC-39/40 remain partial. Native full-profile fixtures are explicit scoped compositions, not arbitrary installed plugins; no production or human approval is inferred.

### Independently accepted terminal milestone

Independent terminal gate `da60cf682614455ea91de3b5a8f03ca5` DONE503/504 follows native/memory acceptance and producer DONE492. Named immutable client `/tmp/dpi-terminal-packed-7bo6KL/artifacts/dpi-terminal-adapter-0.1.0.tgz`, SHA-256 `1f1b74fa2b515b55bf280113d91116c267755973b5ed76ce9a6389174c235bde`, was checked with the exact backend `4d3cf2d8…` and SDK `d9883174…` above. Alice authored no terminal controller/projection/editor/TUI/journal code; the gate is independent of Carol's implementation and Dave's producer check. Original PTY `8/8`, stronger busy-steer `9/9`, actual installed native interview/Goal/skill/guarded stream `1/1`, projection `2/2`, and fresh offline install all PASS; no source patch or runtime substitution was needed.

- ISC-17: contract — actual installed unknown-kind safe text fallback; `/tmp/alice-terminal-latency.json`, `unknownKindSafeFallback=true`, gate `da60cf…`.
- ISC-18.1: UI — original multiline editor submits exact text through HTTP/native steer; `/tmp/alice-terminal-pty.json` (`8/8`).
- ISC-18.2: UI — real tool partial precedes final in original cards and installed native/DCG flow before/after owner reopen; `/tmp/alice-terminal-native.log`, `/tmp/alice-terminal-pty.json`.
- ISC-18.3: UI — exact chosen conversation, child/main and session selection/new/reconnect; `/tmp/alice-terminal-pty.json` (`8/8`).
- ISC-19.1: UI — child Escape returns without abort; root Escape reaches actual native interrupt, not generic task control; `/tmp/alice-terminal-pty.json`.
- ISC-19.2: UI — normal Enter while a real native tool runs produces matching SSE inbox `mode=steer`, then result; `/tmp/alice-terminal-busy-steer.json` (`9/9`).
- ISC-20: integration — closing the last TUI leaves work running and an independent HTTP reader obtains its result; `/tmp/alice-terminal-pty.json`.
- ISC-21: contract — installed snapshot/delta/reconnect dedup and passive document/input reset `2/2`; `/tmp/alice-terminal-projection.log`.
- ISC-22: recovery — same pending native interview and Goal IDs survive viewer/owner reopen, no default answer; `/tmp/alice-terminal-native.log` (`1/1`).
- ISC-26: performance — same synthetic commit→PTY metric, 50 samples p95 `4.278373ms` ≤ `51.9471548ms`; `/tmp/alice-terminal-latency.json`, not LLM/native throughput.

ISC-38 remains PARTIAL: fresh offline terminal+SDK-only install (`/tmp/alice-terminal-install.a6q5p2`, `/tmp/alice-terminal-install.log`) has all 109 files equal to the archive, 49 runtime JS modules, no backend/BB/iii/Harness/Storage/tsx dependency or private runtime import, and original vendor/SDK notices. The separately accepted BB subset/mixed-version check is below; whole ISC-38 still requires iii-only installation, not inferred from either earlier milestone.

### Independently accepted local BB milestone

Independent gate `a5a4f2fecb284a1b8e24c50a9aa939c0` DONE616, resolution614: [full report, commands, hashes and author exclusions](docs/host-design/verification/bb-milestone/REPORT.md). Exact corrected BB `01210a7df934bcb15649f47439286f8558968bddec4096c656a579d47a6d6896`, backend `51fc6f65d6f582573911d3445f5872f26d0916577f967d372a8753fc854060f2`, SDK `6c9abd1af37630a63a1102469896679bd8ae7ef0d51c8cb2ecd62a2b55e68aac`; original terminal `1f1b74fa…` and its SDK `d9883174…` unchanged.

- ISC-28: integration — exact Core/native root/thread/CWD binding and denied/revoked reconnect without replacement/promotion; independent installed `25/25`, `bb-milestone/evidence/full-suite.log`.
- ISC-29: fault — canonical Root/child CREQ, native retryContext/current-fingerprint retry after reopen, immutable authorized history CAS/socket ACK loss; same independent installed `25/25`, gate `a5a4f2…`.
- ISC-30: integration — exact native parent key/execution/request/revision, pending stop/same barrier/reopen/late outcome; independent installed `25/25` plus final native transport `4/4`, `bb-milestone/evidence/native-transport.log`.
- ISC-31: package — new BB/SDK and unchanged accepted terminal/old SDK produce real faux answers in the SAME final host/session/conversation; all five installed package file sets archive-exact, `bb-milestone/evidence/mixed-version.json`.
- ISC-26: performance — BB subset: 50 actual native read-tool commits→BB API-visible delta, baseline p95 `0.048774ms`, remote `38.506202ms` ≤ `50.0585288ms`; `bb-milestone/evidence/latency.json`, not terminal metric/UI repaint/LLM throughput.
- ISC-38: package — BB subset: independent offline BB+SDK-only install, 55 BB/23 SDK archive-exact files, 16 Node/public-SDK runtime JS modules and 14 donor hashes/MIT exact; whole leaf remains PARTIAL pending iii.

Rejected BB `516f6d71…` duplicated native compaction for the same Core CREQ (FAIL604); original archive/RED probe remain historical. Corrected BB refuses `/compact` with `BB_COMPACTION_UNSUPPORTED_IDEMPOTENCY` before view/selection/effect/accepted ACK; independent `1/1` and owner 32-attempt restart negative support this explicit limitation, not fake keyed compaction. Other clients' native SDK/terminal compaction stays unchanged. This is local P4 API-fixture acceptance under PLAN only: a real compatible running-BB smoke is NOT_TESTED and required before any production replacement, which remains unauthorized. iii and real-data migration are not accepted by this milestone.

### Historical assembled native candidate — self-verification, subsequently rejected

- Native producer `81295c2563dd4eac80e0e89961a1f813`: backend strict + **95/95** (`/tmp/bob-native-parent-final-{types,tests}.log`), SDK **21/21** (`/tmp/bob-native-parent-sdk-tests.log`). Current configured inventory **2/2** (`/tmp/bob-native-full-inventory.log`) uses real Store/Harness/SQLite/HTTP/SDK, distinct synthetic session credentials, original native tool factories and loopback transports only. No live model/provider, personal bank, production data or activation.
- ISC-2/4/44 partial evidence: provider-error sentinel corrected on all/active entries, JSON/Markdown transcripts, live SSE and reconnect snapshot; private native records/IDs remain unchanged. Skills metadata and Goal runtime projection contain no private bodies; body lookup requires current human root/read/filesystem, observer/no-FS/delegated-with-FS denied. Native Goal still stores its exact admitted body. Source configured Models preserve exact provider/ID/max and refuse missing saved refs before resume, with separate A/B native capabilities.
- Clean-HOME installed package self-check PASS (`/tmp/bob-native-final-package.log`): minimal SDK/curl/SIGKILL receipt and public native guard/memory binding/reopen; actual packaged scoped Models auth and skills SDK body. Immutable backend `/tmp/dpi-packed-dUBp45/artifacts/dpi-backend-0.1.0.tgz` SHA-256 `379cf10a81e9ec340b7401c62046e3cd7284586d06fc951e7593700c9e839d84`; SDK `dpi-sdk-0.1.0.tgz` SHA-256 `d98831740905de74cffc64243d1b2c54cd83e8e76a34c927fa2b5f139e1cdd43`. Direct dependency pins and native SOURCE/NOTICE/LICENSE closure inspected in exact archive.
- Historical status at this self-check was **20 PASS / 24 PARTIAL / 9 UNKNOWN**. Independent gates later rejected this exact `379cf10a…` archive for opaque business-data projection and explicit-registry memory reload defects (`445/451`); only the corrected successor above is accepted for those bounded native/memory checks. Terminal/BB/iii and real-data migration are not accepted by either producer count.

### Earlier independently checked candidates

- ISC-1: integration — `apps/dpi-backend/tests/p0-regression.test.ts`, 3/3 PASS; Store SHA-256 `6e8c1423eaec62568413e7b1def6701a35a57589669eaf3bdbac37b77e8f1953`; board DONE `2fbd8d3ee3154e878523833edf80f5a0`.
- ISC-6: regression — `P0: unavailable persisted model`, PASS before resume on the same Store candidate; independent P0 review `2693132b96e04319b0b92fc687812a5c`.
- ISC-10: integration — `P0: native submission identity and tool result survive SIGKILL`, PASS on Durable 1.4.0; `/tmp/bob-p0-final.log`; independent raw-HTTP recovery verdict `b3f45410f36a440a957fdcf00d9f5711`.
- ISC-11: integration — `apps/dpi-backend/tests/runtime-profile.test.ts`, minimal + alternate native extension PASS; runtime-profile SHA-256 `1e6c39220cd6e6018e14e19b25dda7f9da17efe934f4484565f83acdc878054f`; independent P0 review `2693132b96e04319b0b92fc687812a5c`.
- ISC-3: security — `auth-http.test.ts`, all mutation/broad-read observer routes denied before resolution; independent 14/14 `/tmp/bob-p1-stable-final.log`, Store `a9ae90b5a1397c7f2e6f4c62824b88d63ce6bd39484bac25c085f484417a1448`.
- ISC-5.1: security — `revoke closes a real active agent SSE`, revoked reconnect/read returns 401; independent gate `84e47f7db50d448ab6da748e06e66069`.
- ISC-5.2: security — `auth-http.test.ts` + `queued native admission observes revoke signal`, no post-revoke mutation/native entry; `/tmp/bob-p1-stable-final.log`.
- ISC-5.3: security — actual open SSE → revoke → committed sentinel not delivered, independent owner reads sentinel; `/tmp/bob-p1-stable-final.log`.
- ISC-7: recovery — `incompatible persisted profile refuses before construction or resume`, zero factory calls/opened sessions; `/tmp/bob-profile-refusal.log`, current minimal@1 profile pin.
- ISC-8: package — independently installed immutable SDK tgz has zero runtime dependencies/storage/Harness imports; QA `e4aa78a8303c479ba6459d995c70fa9a`, SDK artifact SHA-256 `4b0542067fdfe3506972bf3a2dddda7a950135c8ecdd0a7de58508687411196f`.
- ISC-9: install — immutable minimal backend tgz starts in fresh HOME without private runtime, faux native tools/restart PASS; `/tmp/bob-packed-review.log`, backend artifact SHA-256 `fa8ff3ed5b0a8e0735641299495103a90fbff5f6b43f43f63bc43378015c7cb5`.
- ISC-23: fault — `p1-independent-http.test.ts`, actual post-native-commit socket ACK dropped then receipt/restart/concurrent retry preserves native submission/tool-entry IDs; `/tmp/bob-p1-stable-final.log`.
- ISC-24: security — actual HTTP same request key/different body rejected; native content/whenBusy conflict tests PASS; `/tmp/bob-p1-stable-final.log`.
- ISC-25: fault — `receipts.test.ts` + real SIGKILL `fixtures/receipt-crash.ts`, preallocated session UUID/concurrent retry and fork-parent identities preserved; `/tmp/bob-p1-stable-final.log`.
- ISC-35: developer — installed TypeScript `import {DpiClient} from "dpi-sdk"` creates session, runs faux tool and reads terminal answer; `/tmp/bob-packed-review.log`.
- ISC-36: developer — installed `examples/http-client.sh` uses literal curl create/message/receipt/result without SDK; `/tmp/bob-packed-review.log`.
- ISC-37: compatibility — `dpi-sdk/tests/protocol.test.ts` 5/5 zero-mutation incompatible/missing-capability/legacy cases; compatible actual installed client+server QA `e4aa78a8303c479ba6459d995c70fa9a` (full-profile inventory not implied).
- ISC-41: legal — both installed tgz packages retain MIT text and Copyright (c) 2026 IndyDevDan; `/tmp/bob-packed-review.log`, artifact hashes in ISC-8/9.
- ISC-45: recovery — actual HTTP create+message retry after 25-hour clock advance and reopen returns original native IDs/resources; `p1-independent-http.test.ts`, `/tmp/bob-p1-stable-final.log`.
- ISC-27: load — `slow-viewer.test.ts`, actual paused TCP SSE ended after 72×90KB native updates; independent client receives native completion and owner remains open; `/tmp/bob-slow-viewer.log`, streams SHA-256 `b38bcf8af99d8a5003ecc77f54c3926abee0d623b4f8c6b6cdeaf4ea5ca06192`.

- ISC-2: security — independent corrected-source HTTP/cache/reopen/SSE/log gate `69fb2cc1…`: 11/11 PASS, backend strict check exit 0; exact hashes/private proof in DeLM, resolution `d85c35bd…`.

### 2026-10-29 — historical R1/R2 defects reopened the affected scoped PASS

Operator-authorized independent actual installed-native probe `independent-boundaries.test.mjs` returned **2/2 FAIL** on backend `1df78d0f7ae265adf2a46b966cf8f12842fd2748900f48724dcf4bc887426410`, candidate manifest SHA-256 `966a7e50dabeac2988d5582c71f6441c4db5588cc3e7dc2c1d0de47fdbec92f1`. R1 exposes a synthetic private provider cause through real compaction live SSE, reconnect and terminal task state. R2 opens duplicate native session Harness owners through two Store instances in one process; the previous cross-process test did not cover this path. The 53 frozen leaf texts/order and six-column Test Strategy remain unchanged; the one-owner extension is additional evidence, not a renamed allowed ownership mode.

Confirmed sticky FAILs: `01221dbd50c04760a90a7df3be80ceab` (R1) and `33de90a242e44a458828b3f9354d2444` (R2). Repair outputs `96f21af75127443fb3de6f47767d8c9c`, `e5f6b0d596764d42b3d12e4dd8b2a857`, `6d82424a1fb6433086777a9122245837`; independent combined acceptance `cc1a0f69a58346f8ba70320454d27ee8`. Neither criterion was restored to PASS before independent corrected-source and immutable rebuilt-installed proof. This batch is LOCAL ONLY: no commit/push/publication, runtime activation, production or real migration; external probe/input and historical evidence stay unchanged.

- ISC-1: integration — broader same-process/cross-catalog/concurrent/alias/cleanup ownership and cross-process SIGKILL recovery independently accepted by gate `cc1a0f69…` DONE916; [report](docs/host-design/verification/r1-r2/REPORT.md), backend `fe333c18…`, explicit R2 resolution912; original cross-process criterion text unchanged.
- ISC-2: security — unchanged real-native compaction/second-Store probe `2/2` and pending-overflow `/inspect` probe `1/1`, source `127/127` plus new retained fixture separately `1/1`, compiled preservation `16/16`; gate `cc1a0f69…` DONE916/[report](docs/host-design/verification/r1-r2/REPORT.md), R1 resolution911; no universal secrecy/plugin claim.
