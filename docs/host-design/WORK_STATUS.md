---
artifact_contract: "ce-handoff/v1"
created_at: "2026-10-30T19:05:35Z"
title: "Pi Durable Host: опубликованный основной маршрут и условия продолжения"
summary: "DeLM завершил ограниченную репетицию и публикацию c0019d7; реальный import прошёл, продолжение выбранной сессии остаётся NO-GO."
keywords: ["pi-durable-host", "DeLM", "migration", "NO-GO", "BB-deferred", "resume"]
cwd: "/home/ubuntu/Projects/pi-durable-host"
resume_focus: "Восстановить контекст, сверить доску и согласовать следующий разрешённый этап без повторения завершённых проверок."
repository: "Diffuzmetall/pi-durable-host"
---

# Статус работы и возобновление

**Итог: исходники опубликованы, миграция — NO-GO.** Завершён разрешённый маршрут **backend + dpi-sdk + наш терминал + настоящий локальный iii, без BB**. Это ограниченная репетиция на одной выбранной неактивной сессии, не production-переход и не поддержка всех исторических данных.

Документ создан по просьбе пользователя сохранить задачи, ссылки и порядок возвращения к работе. Он не переоткрывает задачи, не разрешает новые model/API calls и не заменяет доску DeLM. Здесь есть машинно-локальные ссылки: **не публиковать этот handoff автоматически**.

## 1. Где находится результат

- [Опубликованный commit c0019d7](https://github.com/Diffuzmetall/pi-durable-host/commit/c0019d73152b58783d1b74fabe95f6982206aa55): только 18 файлов из проверенного allowlist; parent `0c49efba7ef53ae20a22395ebdd1a4d9ea04fd44`.
- [Статус поставки](https://github.com/Diffuzmetall/pi-durable-host/blob/c0019d73152b58783d1b74fabe95f6982206aa55/docs/STATUS.md): текущий BB-free scope отдельно от исторических P0–P5 и 214 тестов.
- [Правила offline-переноса](https://github.com/Diffuzmetall/pi-durable-host/blob/c0019d73152b58783d1b74fabe95f6982206aa55/docs/MIGRATION.md): API, обязательная preflight-проверка, отказ на неизвестных contracts, условия rollback.
- [Матрица выбранной копии](https://github.com/Diffuzmetall/pi-durable-host/blob/c0019d73152b58783d1b74fabe95f6982206aa55/docs/verification/REAL_PILOT.md): actual import, credential barrier и restricted restore без раскрытия payload.
- [Четыре пакета и hash correlation](https://github.com/Diffuzmetall/pi-durable-host/blob/c0019d73152b58783d1b74fabe95f6982206aa55/docs/verification/MAIN_ROUTE.json): точные archives, runtime identity и границы выводов.

### Важно: локальный public checkout уже изменился после этой поставки

Проверено при создании handoff:

| Поле | Значение |
|---|---|
| Машинно-локальный public checkout | `/home/ubuntu/Projects/pi-durable-host-public` |
| Текущая ветка | `sdk-host-nico-cutover` |
| Текущий HEAD | `e8ea3b3f3ffdbd09d649a313bb56065942d6240b` |
| Subject HEAD | `fix(integration): publish scoped Nico Host cutover reference` |
| Локальный tracking ref `origin/main` | `c0019d73152b58783d1b74fabe95f6982206aa55` |
| Рабочее дерево | Чистое; tracking — `origin/sdk-host-nico-cutover` |

**Не переключать эту ветку и не синхронизировать старый staging поверх неё.** Содержание и приёмка последующей Nico-работы в этом handoff не проверялись. Публикация `main` c0019d7 подтверждалась настоящим remote readback при поставке; новая сетевая проверка при написании этого документа не запускалась.

Приватный рабочий fork `/home/ubuntu/Projects/pi-durable-host` исторически содержит накопленный незакоммиченный результат. Его HEAD сам по себе не идентифицирует проверенный кандидат. Не применять reset/stash/checkout/cleanup ради «чистого» дерева.

## 2. Что действительно проверено

| Проверка | Итог и граница |
|---|---|
| Единственная согласованная копия | Snapshot и неизменность source/master проверены. Повторного выбора сессии или source snapshot не было. |
| Actual import | PASS: сохранены native IDs и полные records — 1 conversation, 613 entries, 639 tasks, 6 submissions, 114 документов и 42 revisions; десять non-DB artifacts byte-exact. |
| Retired documents | 101 task tombstone без revisions сохранены как валидный native state, без выдуманных значений/версий. Active-empty, unknown kind и missing owner отклоняются. |
| Источники identity | Формальный source host-profile отсутствовал: provenance сохраняет `null`. Target — явно существующий `native@1`. Derived saved-contract/code attestation не выдаётся за исходный persisted full registry; creator SDK не аттестован. |
| Actual continuation | **BLOCKED:** Store один раз проверил ту же сохранённую модель и отказал availability/credentials до native session factory/Harness resume. Session осталась unavailable, не заменена пустой. Network/child/memory attempts — 0. |
| Что после guard | **NOT TESTED:** bind/resume выбранной candidate session, её integration lifecycle и клиентское recovery после реального продолжения. Credentials сами по себе не докажут GO. |
| Исходный runtime/profile rollback | PASS на отдельной restore-копии нетронутого backup: настоящий исходный CLI/profile, PTY, те же records/revisions. Ограниченный deny-only режим без credentials/внешних integrations, не восстановление production authority. |
| Terminal + настоящий локальный iii | PASS на generated imported native canary: shared owner, PTY interrupt/reconnect, owner reopen, actual iii restart, потерянный ACK/retry без replay, durable answerRef. Не реальное provider continuation выбранной сессии. |
| Пакеты | Dave независимо установил четыре пакета offline/fresh HOME без BB: все 447 packaged files совпали. Public backend имеет 228 runtime/declaration/map файлов, byte-exact AA74. |
| Публикация | Commit/push/readback PASS; Carol дополнительно независимо сверила все 18 committed blobs/modes, parent, лицензию и чистоту дерева. Её readback Git был локальным; сетевой readback выполнила Alice. |

Неизменённые Store 18/18, importer installed 16/16, исторические 214 и уже принятые canary/rollback evidence переиспользованы по точной identity. Повторять их «для уверенности» не нужно; новая проверка нужна изменившейся границе или устаревшему evidence.

## 3. Задачи DeLM: завершённый основной маршрут

Источник task truth — существующая [машинно-локальная доска run](file:///home/ubuntu/Projects/delm-runs/pi-durable-host-20261028-4sol). Таблица отражает снимок доски sequence **1279**, а не отдельный tracker. UUID ниже — task IDs DeLM, не IDs пользовательской сессии.

| Task ID | Результат | Владелец | DONE revision |
|---|---|---|---:|
| `1034dbb6abb142cca1a234637646b67f` | Единственный разрешённый snapshot | Bob | 1146 |
| `fea830b22a384d669e8e91677e15302d` | Store copied-catalog confinement | Alice | 1162 |
| `45f096613eab4cd781fe25b0946b8ec9` | Независимая приёмка confinement | Bob | 1161 |
| `8b93ccc3e23f4e80875dc2daa3ffdb30` | Offline native importer, async/tombstone fixes | Alice | 1239 |
| `88051168d9e14073ae8bd5633a1e669b` | Actual selected-copy import PASS + точный continuation blocker | Bob | 1253 |
| `979a24c8095a4177ab0cbeacfe41cbb3` | Независимая изоляция, preservation, четыре пакета, restricted rollback | Dave | 1265 |
| `02afc43cbbc641d0b6a68337af1b0948` | Actual terminal/iii на generated imported canary + реальный barrier | Carol | 1258 |
| `8a62a7ec057f4b84b53a82af28f7599e` | Санитизированный публичный кандидат | Alice | 1261 |
| `85b3cb552cef4be7bca3edb78e0b834d` | Независимый scoped outgoing review | Carol | 1272 |
| `53c99aa28ff3474183488737d4f978ac` | Commit/push/readback c0019d7 | Alice | 1277 |

Задача оформления этого документа — `691d5cd3964d435b98553c5ffe35887e`; её окончательный статус сверяется по доске. Ранее возникшая проблема «Dave не имеет armed wait» снята: он возобновил ту же conversation и завершил приёмку. Просить повторно запускать Dave ради этого этапа не нужно.

## 4. Что осталось открытым, а что просто исторически OPEN

### Реальное ограничение миграции

- [ ] Разрешённое контролируемое продолжение выбранной candidate session на той же сохранённой модели.
- [ ] Проверка actual bind/resume/integration lifecycle и terminal/iii recovery этой сессии после прохождения guard.
- [ ] Новый bounded GO/NO-GO на эти фактически выполненные сценарии; production activation остаётся отдельным решением.

Это **не новые уже созданные executable-задачи**. Пока нет нового разрешения на соответствующие credentials/provider/model calls и effects, этап не начинается. Не исправлять этот barrier отключением guard, silent model mapping или faux-подменой.

### Отложенный BB — не блокер основного маршрута

| Task ID | Состояние на доске | Как трактовать |
|---|---|---|
| `5945c98034cc468ebac8d5ce49be4aa7` | OPEN, DEFERRED, rev1196/gen6 | Source-built Core artifact существует; main-route DONE не разрешает продолжить BB. |
| `4f007ec85fa84083974c0d98501f7a20` | OPEN, DEFERRED, rev1178/gen2 | Причина Core → browser UI timeout не установлена; defect не исправлен. |
| `3d4dc10b18b642618f8f13d8a61bdb41` | OPEN, rev1084/gen0 | Отдельная будущая BB acceptance после разрешения и закрытия необходимых причин. |

Открытый технический FAIL: `f11397b0e8464fd1b91c8b54f459b548`, привязан к BB diagnosis/acceptance. Исправление routing старого FAIL `3422c32a8dc64ca1b8961f57ba8710a2` не было исправлением UI-дефекта. Даже если native wake предлагает `5945…` как claimable, **это не новое разрешение пользователя**.

### Старые BB-gated checkpoints, заменённые main-route outputs

| Историческая OPEN-задача | Текущий принятый результат |
|---|---|
| `8ad3d57be3594c67ac51a949d72d870a` | Bob `88051168d9e14073ae8bd5633a1e669b` DONE |
| `af010781c0ad4ae6822de52337aaeb1d` | Dave `979a24c8095a4177ab0cbeacfe41cbb3` DONE |
| `43707c9d5bd74c48a072ccefe6e61b41` | Snapshot/static/rollback evidence переиспользованы и приняты в Dave `979a…` |

Их OPEN не означает отсутствующий импорт/rollback текущего маршрута. Они сохранены как история; не ставить им фиктивный DONE и не повторять работу ради выравнивания списка.

## 5. Какие дефекты переоткрывались и как закрыты

| FAIL / результат | Что произошло | Текущий статус |
|---|---|---|
| `ddc43f2b661149b79d69c58716e5bff9` | Copied catalog мог обратиться к исходной SQLite через absolute path/symlink | RESOLVED1159, независимый gate1161, owning task1162; оригинальный RED сохранён. |
| `875c4d8426cf4f88b91e6657df9b7f2a` | TS void callback принимал async validator, но importer его не ожидал | RESOLVED1220: `await assertCompatible`, installed regression; старый ba989 не использовать. |
| `5cfec950612744b9985f20f1f4c981ea` | Валидные retired task tombstones без revisions ошибочно отвергались | CORRECTION/RESOLUTION1237: known contract + terminal owner, без fake value/version; actual corpus принят. |
| `f11397b0e8464fd1b91c8b54f459b548` | BB UI timeout | **OPEN / DEFERRED**, не исправлен и не закрыт публикацией. |

`ba989…` и `381a…` — сохранённые промежуточные предложения, не кандидаты для исполнения на реальной копии. Итоговый внутренний backend — AA74; публичная metadata-санитизированная упаковка — dadd, runtime совпадает.

## 6. Пакеты и локальные evidence

Четыре tarball находятся в машинно-локальном каталоге `/var/tmp/alice-main-route-public.BydzLT/artifacts/`. В npm они не публиковались.

| Архив | SHA-256 |
|---|---|
| `dpi-backend-0.1.0.tgz` | `dadd5534e7642a2c14dc6c6fdcbb6eab572c773221473bf3a13bc92326392458` |
| `dpi-sdk-0.1.0.tgz` | `351054859022ae202fbdc429e73da441bc90295e4717342652079c3ea0906abd` |
| `dpi-terminal-adapter-0.1.0.tgz` | `1f1b74fa2b515b55bf280113d91116c267755973b5ed76ce9a6389174c235bde` |
| `dpi-iii-adapter-0.1.0.tgz` | `40b33e8aae70c37222fc212cfb3b83adb48dba25e73163468fefb6dae33eeefe` |

Машинно-локальные pointers; не переносить содержимое private reports в публичный repo:

- [Delivery record](file:///var/tmp/alice-main-route-delivery-c0019d7.json): commit/parent, reviewed manifest, push/readback и границы результата.
- [Frozen source manifest](file:///var/tmp/alice-main-route-public.BydzLT/SOURCE_MANIFEST.json): 726 source files, SHA `4e9fbf36689bf5ce87c4993a71f0664f73f835d2fb924f9714fc2be5867584be`.
- [Delta allowlist](file:///var/tmp/alice-main-route-public.BydzLT/DELTA_ALLOWLIST.json): ровно 18 файлов, SHA `bc8c067a7afac2a089987ef1f1124e76f48506a2a0d2af330ddaaa741f01450b`; excluded node_modules/dist не являются payload.
- [Packaging proof](file:///var/tmp/alice-main-route-public.BydzLT/PORTABLE_PROOF.json): SHA `997ca3692577d71c0ec84486da09dd17344fc6953344d2eb885a3d944d94aff1`.
- [Carol outgoing review](file:///var/tmp/carol-outgoing-review.IuD265/RESULT.md): causal ledger, privacy/licensing и semantic review; SHA `0403d26e34f976e366fb84db56419197c78167ab671566844403bc5609babb6d`.
- [Санитизированный selected-copy результат](offline-transition/REAL-PILOT-RESULT.md): actual import и точный operational barrier, без raw history.
- [Совместимость](verification/migration-compatibility/MATRIX.md): независимые пять исходов, tuple и ограничения. [Inventory](verification/migration-compatibility/INVENTORY.json) отдельно маркирует историческую часть.
- [ISA](../../ISA.md) и [план](PLAN.md): исходные критерии и текущий scope; не считать публикацию автоматическим выполнением исторических migration criteria.

Каталоги `/var/tmp` и run store — локальные, не GitHub backups; их наличие и hash нужно проверять перед переиспользованием. Оригинальный защищённый backup не удалять и не нормализовать на месте. Не выполнять producer `verify.py` ради чтения статуса: он перезаписывает собственные frozen proof-файлы.

## 7. Как вернуться и «переоткрыть» работу безопасно

1. Прочитать этот документ, актуальные AGENTS, frozen START/WORKER существующего run и выбранный пользователем следующий scope. Handoff — контекст, не новое разрешение на исполнение.
2. Сверить живую доску через actor-bound `context`, а не только Markdown. Работать с тем же run и четырьмя исходными участниками; не создавать новый tracker/Goal/команду по этому документу.
3. Для **нового этапа continuation** сначала получить явные границы: та же выбранная копия, сохранённая модель, разрешённые credentials/provider calls, бюджет, sandbox/effects и критерии. Secrets вводятся штатным защищённым способом, не в чат и не в Markdown. Новый snapshot/другая сессия отдельно не разрешены.
4. Завершённые задачи выше сохраняют корректный DONE своего bounded scope. Для нового непроверенного поведения оформить связанную follow-up задачу на **существующей доске**, со ссылками на принятые outputs; не стирать их evidence и не изображать повторную реализацию как продолжение старого DONE.
5. Для **BB** нужно отдельное явное возобновление scope пользователем. Задачи уже OPEN/DEFERRED: после разрешения сверить blockers/owners/revisions/generations и атомарно claim существующую задачу. Сам по себе WORK AVAILABLE ничего не переоткрывает.
6. Если обнаружен новый конкретный дефект в принятом output, сохранить RED и точный candidate, опубликовать связанный FAIL, оформить owning repair и перепроверить изменённую границу. Технический FAIL закрывается явной связанной CORRECTION/RESOLUTION автора/владельца; новый FACT «починили» его не разрешает.
7. Перед записью получить узкую lease, не трогать чужую активную работу и не судить о смерти writer по TTL. При будущем возвращении не предполагать, что старые shell/pane/session IDs или native waits по-прежнему актуальны.

Read-only ориентация в правильно bound actor session:

```sh
context --help
context domain '{"op":"projection"}'
context domain '{"op":"snapshot","request_id":"<НОВЫЙ-УНИКАЛЬНЫЙ-ID>"}'
# Полностью прочитать полученный view; при большом output сохранить и разобрать его без truncation.
context domain '{"op":"ack","request_id":"<УНИКАЛЬНЫЙ-ACK-ID>","receipt_id":"<ID-ПРОЧИТАННОГО-RECEIPT>"}'
```

При потере ответа повторить **тот же** request ID/payload. Для нового чтения нужен новый ID: повтор старого ID возвращает исторический snapshot и не доказывает текущую доску. `context domain --help` не содержит отдельного `reopen`: не придумывать такую команду и не обходить ownership fences через legacy transport.

### Короткий контекст для следующей сессии

> Ограниченный DeLM-маршрут без BB завершён и опубликован в main c0019d7. Actual selected-copy import, restricted original-runtime rollback и generated actual TUI/iii прошли независимую проверку. Миграция NO-GO: сохранённая модель недоступна, actual bind/resume/integrations после guard не проверены. Не запускать новый snapshot, не подменять модель, не повторять принятые тесты, не возобновлять BB без нового разрешения. Public checkout уже на отдельной Nico-ветке e8ea3b3 — сохранить её работу. Сначала сверить живую доску и получить от пользователя scope следующего этапа.
