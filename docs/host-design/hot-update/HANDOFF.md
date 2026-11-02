# Передача hot-update R4 существующей DeLM-команде

Дата: 2026-11-01. Автор: BronzeMink. Это операторское дополнение к разрешённому scope, **не новый run и не замена frozen START/WORKER**. Задачи, зависимости, владельцы, leases и FAIL/resolutions принадлежат существующей доске. Таблицы ниже задают границы работы, а не её текущий статус.

## Что сделать

Реализовать [PLAN R4](PLAN.md) и проверить [каноническую ISA, ISC-46–78](../../../ISA.md). Переиспользовать старый широкий reload, уже перенесённый loader/controllers и [готовый upstream v1.4.0 example](https://github.com/earendil-works/pi/blob/v1.4.0/packages/durable/test/examples/31-reload-and-restart.ts). Не строить новый hot-update framework и не обновлять зависимости до main. Обязательны U01–U18, maintenance-отказы U19/U20 и простой проверенный rollback двух видов (§5.5 PLAN).

Конечный результат команды: один immutable **неактивированный** candidate, source review Grace, установленная изолированная QA Heidi, реальные команды горячего отката и возврата release, evidence на тот же manifest. Product checks сейчас NOT RUN. Самопроверка автора не заменяет эти два независимых verdict.

## Разрешения и запреты

Разрешены локальные изменения исходников/тестов по плану, неактивированная сборка, работа через существующую доску и физически изолированные тесты. Ручной широкий `/reload` текущей сессии выбран; watcher и global fan-out не требуются.

**Запрещены reload/stop/restart/kill/switch работающего production Host, изменение installed release/config/production DB, реальные credentials, внешние модели/расходы/скачивание, commit/push/publish/deploy, новые агенты и повторный bootstrap.** Не перезагружать собственную live DeLM-сессию для проверки новой функции. Проверять её на отдельном disposable Host. Не менять frozen run inputs, bindings, модели и пути запуска существующей команды.

Текущий Host переключается **только после всех работ, независимых проверок и отдельного разрешения пользователя**. Даже полный local PASS не даёт разрешения на активацию. Реальные credentials не читать, не чинить и не вращать. Одного `HOME=/tmp/...` недостаточно: production пути физически отсутствуют в sandbox; сначала negative self-check, потом выполнение operational fixtures.

Сохранять все чужие dirty changes. Не применять reset/stash/checkout и не переносить весь checkout в конкурирующую рабочую копию. Source writes — только после claim и actor-local DeLM lease. Shared build outputs/ports/data/process groups сериализуются или изолируются. Все тестовые дочерние процессы остаются внутри sandbox; её отсутствие блокирует соответствующие тесты, а не разрешает live fallback.

## Существующая команда и проверенная начальная точка

Run: `/home/ubuntu/Projects/delm-runs/host-restart-repair-20261101-sol8`.
Run ID: `dd2390010531461ba678b74bda02dbeb`.
Workspace: `/home/ubuntu/Projects/pi-durable-host`.

| Actor | Точная Host session | Root |
|---|---|---|
| alice | cca92d78-ab68-4fa1-9b6e-f51c2f3c837c | 1 |
| bob | 3ac14612-4346-4b92-bd7c-29878d72f1b5 | 1 |
| carol | 001778ad-0e9e-43f2-8dc9-27f8a709b5b5 | 1 |
| dave | 8d2ea1ca-8093-46b1-84c4-f1208af0964b | 1 |
| eve | efd8786a-dd3f-4d02-bed8-caec8f0f7307 | 1 |
| frank | 8b397134-f26e-427a-8fc3-a5f960512373 | 1 |
| grace | 3e56214b-5299-457e-be9b-b1ec511a6cbe | 1 |
| heidi | 1d6e145f-3d74-485b-a1ff-2f08b30da2d5 | 1 |

Read-only снимок перед передачей: 0 CLAIMED, 2 OPEN, 7 DONE; все 14 показанных leases released. Восемь roots idle/enabled, но это не означает смерть producers. Перечитать актуальную доску перед claim, не полагаться на этот снимок.

Прочитать [restart-repair REPORT](../verification/restart-repair-20261101/REPORT.md), manifest `672b7e5e746dcabfbf5ca82a571cd35f328e457f717b64e2b852b3afa3931665`, candidate `/tmp/pi-host-restart-candidate-20261101-alice-v2`. Он прошёл изолированную QA, **production activation NOT RUN**. Сохранить background readiness, cleanup, owner exclusion и reconnect/draft fixes. Не считать исходный HEAD идентичным всему dirty дереву.

Открыты PDH-8 (независимый review) и PDH-5 (operations/auth incident). Auth FAIL `fd6ac2598301430d98429a8a44dd7873` не закрывается синтетической проверкой. Grace сначала сверяет прежний immutable candidate и завершает доступный source review; Frank фиксирует отдельно готовность operational fix и остающийся operator-only auth blocker. Не привязывать всю новую безопасную source/sandbox работу к закрытию auth-инцидента; не обходить его для production acceptance.

## Первая передача и работа доски

**Alice — первый publisher.** Прочитать текущие outputs/claims/FAIL и создать только отсутствующие полезные задачи ниже через свой `context domain`, с устойчивыми request_id. В detail каждой задачи указать рекомендованного actor, scope, S/ISC/U-ссылки, цепочку reuse и результат. Dependencies используют реальные UUID доски. Не создавать отдельный tracker, Goal/Loop, Agent Mail или новые workers.

Каждый actor читает актуальную доску, публикует один FACT о прочтении R4/ISA/HANDOFF и подтверждает свой scope с digest документов. Затем атомарно claims подходящую READY задачу. Один незаконченный claim на actor. Если Alice ещё публикует DAG, не создавать дубликаты; доступные независимые чтение/fixture preparation допустимы, запись — только после своего claim/lease.

S1-C — небольшой самостоятельный проверенный output существующего API, не новая архитектурная фаза. Carol публикует его DONE, когда consumer может опереться на точный reload result/scope/authorization и подтверждённый seam. Consumers не ждут завершения S3, но integrated PASS получают только после S1. Произвольный FACT или idle actor не означает DONE.

| Выход / полезный subject | Предпочтительный owner | Зависимость и граница |
|---|---|---|
| Защитить тестовый Host от production credentials и данных | Frank | Сначала; negative mount/env/child-access self-check. ISC-76, test-only sandbox recipe. |
| Проверить существующий контракт reload для параллельных потребителей (S1-C) | Carol | Читать сразу; runtime probe только после sandbox. Проверить существующий interface вместо нового protocol. |
| Обновить обычный инструмент в занятой сессии (S1) | Carol | S1-C + sandbox; ISC-46–51, native hidden-base/transitive/prepare/authority faults. |
| Вернуть discovery настроек, skills и adapters (S2) | Bob | S1-C; integrated после S1. ISC-52–54, безопасный resource discovery, без загрузок. |
| Показать результат reload в SDK и TUI без потери draft | Eve | S1-C; integrated после S1/S2. ISC-68/69, menu/result, прежние lost-ACK/focus регрессии. |
| Сохранить schemas, phases и recovery при обновлении (S3) | Carol | S1; ISC-55–57/73/75 и затронутые 6/7/15/16/23/45, fault points. |
| Обновить providers без обрыва текущего stream (S4) | Dave | S1-C; integrated после S1. ISC-58–60, synthetic credential source, exact choices. |
| Обновить MCP, memory и voice через существующих owners (S5) | Bob | S1/S3; voice после S4. ISC-61–63/67/70; independent integration outputs можно разделить без новых owners. |
| Обновить DeLM и automation без повторной доставки (S5) | Frank | S1/S3; ISC-64–66/70. Не тестировать на собственном live engine. |
| Сохранить и выбирать предыдущий artifact для горячего отката | Alice | S1-C; integrated после S3. ISC-71–73/78. Общий reload/profile код меняет Carol. |
| Подготовить одну команду возврата Host release | Frank | После предыдущей задачи и согласованного closure; ISC-74/78. Только тестовый service/data, production recipe не исполнять. |
| Собрать единый immutable candidate с готовым rollback (S6) | Alice | Все implementation outputs; source/dists/manifest freeze и hashes. Сохранить прежний artifact, не перезаписывать alice-v2. |
| Независимо проверить source и сохранение прежних исправлений | Grace | Named final candidate. Read-only product code; findings возвращать owners. Предыдущий PDH-8 закрывается отдельно. |
| Независимо проверить установленный candidate и оба отката | Heidi | Named final candidate + sandbox; все U01–U20/ISC-46–78 и затронутые регрессии. Review может идти параллельно. |
| Свести evidence и оставить candidate неактивированным | Alice | Grace + Heidi verdict на одном final digest. Только после исправлений и повторной проверки затронутых claims. |

Это предлагаемые полезные outputs, не требование создать большой parent над каждым шагом. Alice может объединить соседние outputs одного owner либо split реально независимый output по native domain protocol, сохранив критерии и зависимости. Если для нового seam нужны согласованные изменения core, consumer передаёт точный patch scope Carol, а не начинает второй write.

## Exclusive write scopes

- **Carol:** `packages/durable-reload/src/{index,registry,loader}.ts`, reload compatibility/core files, `apps/dpi-backend/src/runtime-profile.ts`, `native-profile/profile.ts`, согласованные `store.ts`/`routes.ts` edits и собственные core tests. Никаких параллельных писателей в этих файлах.
- **Dave:** `packages/durable-reload/src/models.ts`, `experiments/sdk-host-cutover/operational-models.mjs` и отдельные provider fixtures. Общие profile/index правит Carol.
- **Eve:** SDK `api.ts`/`client.ts`, terminal controller/types/UI и их tests. Backend routes правит Carol. Renderer может обновляться отдельно от Host.
- **Bob:** discovery/skills implementation, memory controller, `session-mcp.mjs`, GipPity integration/operational-profile и собственные tests. Общий `native-profile/profile.ts` — Carol. Новый файл общего назначения согласовать до записи.
- **Frank:** test-only sandbox/operational fixtures, DeLM adapter, automation integration callbacks/tests, release-return recipe и необходимая узкая command wrapper. `operational-service.mjs`/native automation общие изменения требуют явной DeLM lease и согласования с Carol; timers/admission owner не пересоздавать.
- **Alice:** board initialization в рамках текущей команды; candidate packaging scripts, сохранение/выбор прежнего artifact, согласованные manifests/build outputs. Общие package/lockfiles — только при доказанной необходимости и согласованном handoff; не устанавливать зависимости молча. Финальный evidence index/ISA — после независимой приёмки, не одновременно с текущими документными edits.
- **Grace:** read-only product source/candidate; собственный `docs/host-design/verification/hot-update-20261101/REVIEW.md`. Не чинить код, который затем независимо принимает.
- **Heidi:** отдельные `experiments/hot-update-20261101/qa/*`, sandbox outputs и `docs/host-design/verification/hot-update-20261101/REPORT.md`. Не править продукт и не запускать unsafe legacy tests с настоящим HOME.

Paths являются границами scope, не заранее выданными claims. Проверить существующие writers/leases перед началом. Никакой код вне этой задачи не чистить. Shared docs PLAN/ISA/HANDOFF сейчас опубликованы как контракт: не править критерии для получения PASS; материальную смену scope вернуть оператору.

## Доказательства и завершение

Каждая implementation карточка содержит: **готовая старая функция → существующий перенос → воспроизводимый пробел → минимальная адаптация → regression command/result**. Для результата: exact source/artifact hashes, IDs и отсутствие секретов. Unsupported/deferred различать от applied. Не закрывать U01–U18 бесконечным defer, unchanged PID или только отдельным registry demo.

Heidi проверяет полный реальный Host/SDK/PTY путь и отдельно помечает faux внешние границы. Grace проверяет authority/compatibility/lifecycle и соответствие reuse-first. ≥100 code swaps и ≥20 resource replacements, bounded resource census, rollback v1→v2→v1, release-return с сохранением новых записей, startup-failure/owner-exclusion, прежний restart-report regression set. Старая версия несовместима — честный BLOCKED; не восстанавливать старую БД с потерей новых эффектов.

Новые claims принимаются только на одном final immutable artifact. Изменённый после QA artifact требует повторной проверки затронутых claims. Auth FAIL и реальная выбранная production migration остаются отдельными границами. Финальный вердикт: `candidate accepted / production activation NOT RUN` либо точный список FAIL/BLOCKED — без ложного полного DONE.

Когда доступной READY работы нет: соблюдать существующий WORKER и `delm_wait`, без shell sleep, polling и новых агентов. Не останавливаться после одного output, если авторизованный backlog остаётся. Не завершать весь run, пока необходимые outputs/актуальные blockers не отражены на доске.
