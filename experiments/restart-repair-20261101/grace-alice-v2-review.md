# Независимый source review alice-v2

Дата: 2026-11-01. Проверяющий: Grace. Задача: `bb233ac41c134b5b8e7ec944ee9da73a`.

**PASS в указанном source scope. Подтверждённых блокирующих дефектов не найдено.** Это отдельный результат для R4 owners. Прежний PDH-8 и auth FAIL остаются открытыми. Production activation NOT RUN.

## Проверенный кандидат

Кандидат: `/tmp/pi-host-restart-candidate-20261101-alice-v2`.

SHA256 `RESTART-CANDIDATE.json`: `672b7e5e746dcabfbf5ca82a571cd35f328e457f717b64e2b852b3afa3931665`.

Grace независимо сверила 27124 manifest records: hashes, uid, mode и отсутствие symlinks совпали. Все 740 source/build records совпали с checkout при проверке. Эти проверки читают файлы и не запускают product code.

Контрольные source hashes:

| Файл | SHA256 |
| --- | --- |
| `apps/dpi-backend/src/store.ts` | `b676194a6bf32cda198131f54562db1a2ca58d19c705689c045aeac8d7b08065` |
| `experiments/sdk-host-cutover/operational-service.mjs` | `5643afccd8d8f9f3f1136c3a1a5689731ca1381027fb1c7a95fbb25a7ae49a2c` |
| `experiments/sdk-host-cutover/operational-profile.mjs` | `d748e744ff0ecc724aac202e264855f1ceba48b729bd05529df8c3c4058cb29a` |
| `apps/terminal-adapter/src/remote-controller.ts` | `abd7e45abc8dc8335ad0f63a158870aeec482dfd4ed3cf20a18ea50c4165034a` |

## Причинная проверка изменений

| Изменение и точный source | Инвариант и вывод |
| --- | --- |
| `store.ts:273–315` | `Store.open` сохраняет ожидание восстановления. `openCatalog` завершает shared initialization и model catalogue до запуска recovery. Workers ограничены четырьмя; ошибка соседа не отменяет остальные jobs. |
| `store.ts:541–545,590–620,694–702` | Admission закрывается для create, canonical create и openAgent. Начатые create/open operations учитываются отдельно. Один session ID получает один in-flight initializer. |
| `store.ts:722–796` | Profile/model validation предшествует resume. Bind и запись владельца предшествуют ready. После начала close новый resume не вызывается. |
| `store.ts:1845–1879` | Повторный close возвращает тот же Promise. Close ждёт recovery и начатые initializers/creates; затем закрывает runtime, shared state и каталог. Ошибки hooks агрегируются. Timeout не освобождает lock живого initializer. |
| `routes.ts:50–65` и `store.ts:644–650,1699–1715` | Неготовая session не принимает metadata mutations. Серверный отказ не зависит от чтения optional readiness старым клиентом. |
| `store.ts:1155–1235`, `routes.ts:244` | Send и retirement сериализованы по session/conversation/actor/request. Сервер подтверждает отсутствие receipt отдельной mutation; поздняя отправка retired key получает conflict. Автоматического resend нет. |
| `auth.ts:35–84`, `routes.ts:14–19` | Новый reconcile route требует действующий scoped write grant. Сервер повторно проверяет grant внутри commit. Observer не получает mutation через GET; delegated grant не получает общий reconcile route. |
| `operational-service.mjs:37–76` | Signal handlers установлены до profile initializer. Shutdown ждёт opening, закрывает HTTP/SSE, затем Store. Process-wide cleanup выполняется после этой последовательности, включая startup failure. |
| `operational-profile.mjs:121–148`, `gippity-voice/operational-profile.mjs:12–25` | Пока Store не получил composition, wrapper владеет rollback. Shutdown failure не пропускает cleanup; исходная ошибка сохраняется. |
| `gippity-voice/integration.mjs:130–162` | Lifecycle hooks опубликованы до compatibility/registry operations. Prepared и base hooks вызываются независимо при отказах. Новый resource owner не добавлен. |
| `remote-controller.ts:162–193,241–275` | GET 404 сам не подтверждает отсутствие admission. Reconcile проверяет точные conversation/request IDs. Выбор разговора проверяется после ожидания; lost ACK не превращается в повторную отправку. |
| `types.ts:63–70`, `tui.ts:437–460` | Transient error связан с session/conversation/request. Online без delivery evidence не снимает ошибку. Поздняя ошибка другого разговора не меняет текущий редактор. Настоящий dialog очищает transient marker. |
| `prepare-restart-candidate.py:22–164` | Новый canonical destination не перезаписывает installed release. Dependency delta требует rebuild. Engine копируется физически; итоговый manifest запрещает symlinks и фиксирует source/build/files. |

Доказательства таблицы — deterministic source inspection, кроме runtime outcomes. CodeGraph использован для навигации; вывод о тестовом покрытии из графа не делался.

## Runtime evidence и ограничения

Grace прочитала `docs/host-design/verification/restart-repair-20261101/REPORT.md` полностью. Его SHA256: `e6179fc2e21cfbecfd6820275abc1a66689c62ced4bb246327c747e777c61ffb`.

Heidi независимо проверила этот же manifest: preopened PTY, 67-session recovery и 13 native/controller/UI tests. Это атрибутированные результаты Heidi, не новые запуски Grace. Wrapper tests Bob и operational smoke Frank также не выдаются за проверки Grace.

Grace не запускала product fixtures. Полный аудит всех dependencies, живые models/MCP, production histories и 24 bindings не входят в этот source verdict. Старый несовместимый p0 competing-catalog fixture не объявляется прошедшим.

Предыдущее освобождение locks после ошибки завершённого close не изменено этим repair. Этот review не доказывает безопасность произвольного provider, который нарушает lifecycle contract. Новые R4 resource-retirement требования требуют собственных fault probes.

## Передача R4 owners

Сохраните bounded recovery, shared-before-resume, per-session ownership, idempotent close и ожидание initializers. Сохраните wrapper rollback, exact receipt retirement и transient selector recovery. Не переносите этот PASS на изменённый R4 code.

R4 source acceptance требует нового immutable manifest и отдельного review. Все новые ISC-46–78 остаются NOT RUN данным документом. Hot rollback и release-return этим кандидатом не проверены.

Auth FAIL `fd6ac2598301430d98429a8a44dd7873` требует operator-only проверки вне чата. Ни source review, ни synthetic tests не подтверждают восстановление credentials. PDH-8 `2d59ed5810454249a46d7d713771b013` не закрывается этим самостоятельным output.
