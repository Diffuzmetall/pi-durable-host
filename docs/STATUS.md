# Проверенный scope и ограничения

**Локальная функциональная приёмка terminal → BB → iii завершена в описанном scope.** Native Pi Durable **1.4.0** остаётся единственным владельцем исполнения и recovery. Это не production deployment, npm release, совместимость любых plugins или разрешение мигрировать рабочие данные.

Из 53 исходных критериев — **51 PASS / 2 PARTIAL**. Историческая/cross-version миграция и возврат исходного runtime проверены только на disposable closed-owner same-version копиях; реальные session data не переносились.

## Выполненные проверки

| Часть | Подтверждённый сценарий | Граница доказательства |
|---|---|---|
| Backend/SDK | Native ownership, exact saved model/profile IDs, canonical receipts/retry/conflict, crash/reopen, typed private-diagnostic projection | Изолированные SQLite/faux sessions; не произвольные исторические registry |
| Security | Observer/delegated/human boundaries, revoke reads/mutations/streams, безопасные ошибки и healthy application JSON | Не полный security audit любых plugins |
| Native profile | Реальная композиция 19 extensions, две Store/Harness sessions, session-local MCP/Mail/Hindsight, вложенный revoke и раздельный shutdown | Локальные recording/loopback transports; не личные banks или платные API |
| Triggers/tracing | GitHub transport с явным environment и повторной проверкой revoke после awaited GET; metadata-only injected Langfuse SDK | Никакого GitHub write, живого Langfuse export, ambient credentials или model payload capture |
| Terminal | Настоящий installed TUI/PTY: восемь групп editor/navigation/tools/interrupt/rename/detach/reconnect/new-session | Faux only; runtime archive неизменён, не повторный PTY после GitHub-only delta |
| BB | Реальные изолированные Core 0.47.1/Chrome: Root answer/steer/stop, FIRST child stop до follow-up, тот же child, provider SIGKILL/reopen/reload/reconnect без повторного initial task | Exact compatibility overlay; функциональный PASS с timing-оговоркой ниже, не stock BB или любая source-сборка |
| iii | Настоящие локальные engine и SDK 0.24.6, установленный signed worker/native faux host: retries/one execution, changed payload/signature refusal, worker/owner restart, immutable Unicode answer paging и revoke | Не production deployment, живые модели или автоматический Console/chat wake |
| Standalone installs | SDK + terminal-only, BB-only или iii-only; clean HOME, offline tarballs, точные archive/installed members | Заранее подготовленный полный npm cache; не uncached bootstrap |
| Mixed-version | Terminal и BB на одном host/session/conversation; iii отдельно на том же backend/SDK runtime | Не одновременная нагрузочная приёмка трёх frontend |

### Явная оговорка по BB timing

Первый полный Core/Chrome запуск завершился таймаутом ожидания нового child answer в UI через 25 секунд. Два последующих bounded контроля, включая **точную исходную Root steer/stop prehistory**, показали answer live и после reload, тот же native child, четыре уникальных input и единственный новый answer в Core timeline. Исходный RED сохранён и остаётся **необъяснённым**, не назван исправленным или никогда не происходившим.

В исходном wire log нет времени native terminal publication, поэтому поздний successful history ACK не доказывает, что UI отставал от native completion на 25 секунд. Дополнительная реальная Native/SSE проверка дала 16/16 terminal frames; инструментированные восемь случаев после Root steer/stop дали 19–31 мс и все run/turn-end события, без наблюдаемого empty-input run. Гипотеза потерянного terminal-wake не подтвердилась; speculative patch/polling не добавлялись. Независимые проверяющие приняли **функциональный scope**, но не end-to-end latency SLO, отсутствие flaky timing или успешность всех запусков.

## Регрессии и переносимость

Приняты **214/214 source-тестов без пропусков**: SDK 23, backend 133, terminal 19, BB 27, iii 12; пять strict typechecks. Неизменённые четыре пакета — 187 тестов и четыре проверки — переиспользованы по byte identity; после последнего BB fix повторён только BB. Отдельные 16 Core compatibility unit checks не прибавлены к 214 и не подменяют real Core/Chrome evidence.

Публичные BB regression tests используют локальные verbatim contract fixtures с лицензией и provenance, без private donor imports. Для новой public-сборки проверяются затронутая переносимая часть и совпадение runtime JavaScript/declarations с принятыми архивами. Private raw logs, machine paths, session data, auth/config и внутренние audit-материалы не публикуются. [Runtime correlation](verification/RUNTIME_CORRELATION.json) фиксирует отдельные public archive hashes; изменение README/provenance не превращается в новый runtime-прогон.

### Принятые installed runtime inputs

| Архив | SHA-256 |
|---|---|
| Backend | `36b4f6e989eb6dcc8bd14dd450fd55eeb0a4a39d360936c4b0e9dc32a046c6bd` |
| SDK | `351054859022ae202fbdc429e73da441bc90295e4717342652079c3ea0906abd` |
| Terminal | `1f1b74fa2b515b55bf280113d91116c267755973b5ed76ce9a6389174c235bde` |
| BB | `b82eb8d3ca9dbac0e0d85b8d07919d26c74171943be17a2a1f79732a554349df` |
| iii | `75da7623ae10c1a79fe2415d36ddcd22be4a779a4d1160cd94371301dc5eff33` |

Terminal/реальный iii run использовали предыдущий backend; сравнение полных архивов доказывает единственный последующий runtime delta — optional `github-triggers.mjs`, не включённый в эти сценарии. Изменённый GitHub revoke boundary независимо проверен на source и новом compiled archive. Это переиспользование неизменённого execution path, не новый engine/PTY запуск на последних байтах.

## Совместимый BB Core

[Переносимая поставка](../compat/bb-0.47.1-native-child/README.md) содержит prerequisite и lifecycle source patches для pinned upstream get-bb/bb, MIT license, provenance, guarded binary builder и focused tests. Stock `bb-app@0.47.1` **не** содержит нужные prerequisite interfaces.

Оба source patches применены к чистому pinned upstream snapshot; шесть итоговых файлов совпали с подготовленным source. **Полный upstream dependency bootstrap/typecheck/rebuild не выполнялся.** Actual Core/Chrome verdict относится к отдельно проверенному exact binary overlay, а не переносится автоматически на произвольную source-сборку. Builder отвергает неизвестные baseline hashes и не активирует результат.

## Производительность — разные метрики

На 50 actual native read-tool commits прежний **commit → BB API-visible delta** дал baseline p95 0,050321 мс, remote p95 49,123057 мс при бюджете 50,0603852 мс; запас около 0,94 мс в той среде. У неизменённого terminal archive прежний commit → PTY p95 4,278373 мс при бюджете 51,9471548 мс. Ни одна метрика не является model latency, admission → answer, полным BB UI repaint или production SLA.

## Что не обещается

- BB `/compact` unsupported: отказ до эффекта и accepted ACK; native API не даёт canonical idempotency key. SDK/terminal сохраняют свой compaction API.
- Pending iii stop — не подтверждённый stop effect; transport ACK — не completed job. После потери cursor используйте прежний immutable `answerRef`, не повторный input.
- Нет автоматической совместимости обычных Pi extensions, частных model IDs, arbitrary registries или historical recovery по успешному compile.
- Live providers/API, личные memory banks, production, installed activation, реальные DB и cross-version migration требуют отдельного решения оператора.
- `0.1.0` не идентифицирует байты. Сохраняйте source revision, lockfiles и SHA-256 tarballs; source publication, package release и deployment — разные действия.

[План](PLAN.md) · [Первый запуск](GETTING_STARTED.md) · [Клиенты](CONNECTING_CLIENTS.md) · [Происхождение](PROVENANCE.md)
