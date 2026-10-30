# План и границы поставки

## Текущий приоритет: переход без BB

Основной маршрут — **backend + dpi-sdk + наш терминал + настоящий локальный iii**. Он не зависит от BB/Core/Chrome. BB — отдельная необязательная интеграция, отложенная до собственной приёмки; её результаты, незавершённые задачи и открытый UI-дефект сохраняются, а не объявляются исправленными. Новых BB-прогонов в этом milestone нет.

Работа ведётся с одной уже выбранной защищённой копией неактивной сессии текущей установки. Snapshot и неизменность оригинала проверены; перенос не подменяется новой пустой session. [Offline API](MIGRATION.md) проверяет source fingerprints, exact contracts и state до исполнения; native ownership остаётся у одного backend.

Готовность этого маршрута требует:

1. Проверенной совместимости фактически сохранённых task/doc/model/profile definitions; неизвестное отклоняется до auto-resume.
2. Импорта с сохранением native IDs, history/tasks/docs/children/pending-state и без silent model remap.
3. Действительно проверенного контролируемого продолжения без повторения старых действий; static/simulated результаты помечаются отдельно.
4. Терминала и настоящего локального iii через общий backend без BB, включая reconnect/interrupt/recovery и canonical retry.
5. Возврата на отдельной restore-копии из нетронутого оригинального backup с точным исходным runtime/profile.
6. Независимых evidence, точного candidate/source→target verdict и scoped outgoing review до public commit/push.

Пока все условия не закрыты, verdict — **NO-GO** для рабочего перехода. Изоляция исключает оригинальные пути, credentials и внешнюю сеть; live модели/API, личные memory banks, owner shutdown и installed/production activation не разрешены. Один pilot не доказывает совместимость всего архива.

## Историческая последовательность P0–P5

Прежний порядок: **terminal → BB → iii**. Следующая таблица сохраняет исторические evidence; это не новый BB prerequisite и не текущая migration acceptance. Backend и SDK Disler сохранены; native Pi Durable **1.4.0** владеет работой и recovery. Отдельной заменяющей очереди, runtime или Pocket здесь нет.

| Этап | Результат | Итог локальной проверки |
|---|---|---|
| P0 | Единственный native owner, explicit profile и saved model IDs | Принят: incompatible profile/model отклоняется до resume без silent remap |
| P1 | Public HTTP/SSE/SDK, grants, canonical receipts и безопасные ошибки | Принят: retry/conflict/cache-expiry/crash/reopen и независимые security regressions |
| P2 | Trusted native composition: models/tools/memory/guards/Goal/schedules | Принят в configured local scope; не универсальная plugin compatibility |
| P3 | Наш TUI поверх remote controller | Принят: actual installed PTY, восемь групп сценариев; runtime bytes сохранены |
| P4 | BB thread/child binding, native controls, history CAS, standalone bridge | Принят на реальных изолированных Core 0.47.1/Chrome с переносимым compatibility patch; исходный UI timeout раскрыт в STATUS; `/compact` unsupported |
| P5 | Signed delegated iii jobs, native retry/control/recovery и immutable answerRef | Принят на installed native faux host + настоящих локальных engine/SDK 0.24.6; iii-only install проверен |
| Offline P6 | Runbook, disposable closed-owner backup/restore и rollback | Только same-version репетиция; реальные historical/cross-version данные не переносились |

Общий итог — **51 PASS / 2 PARTIAL** из 53 неизменённых критериев. [Статус](STATUS.md) объясняет, какие runtime/UI проверки выполнены, какие доказательства переиспользованы на идентичных байтах и где остаются границы. Функциональная приёмка BB квалифицирована необъяснённым исходным UI timeout; два последующих контрольных сценария прошли. Это не обещание отсутствия flaky timing или production SLA.

## Исторические дальнейшие действия оператора

Для текущей репетиции действуют верхний scope и [MIGRATION.md](MIGRATION.md): BB/Core smoke не нужен основному маршруту. Следующий список сохраняет прежние общие рекомендации, но не разрешает production или новые BB-прогоны.

1. Собрать и установить локальные tarballs по [quick start](GETTING_STARTED.md); сохранить hashes и выбранные model/profile IDs.
2. Для BB/iii подготовить явную trusted native composition и ограниченные server grants, а не расширять полномочия из client metadata.
3. Перед production replacement проверить собственную Core-сборку, нужные реальные интеграции и latency в разрешённой среде; локальный verdict не активирует установку.
4. Если нужен перенос истории, сначала согласовать выбранную session, исходный runtime/registry, закрытого владельца, backup и разрешённую копию. Продолжать и проверять rollback на копии, не заменять рабочую базу quick start.

Source publication, npm release, production deployment и миграция данных — разные действия. Публичный репозиторий и этот план не разрешают последние три автоматически. MIT и история upstream сохраняются.
