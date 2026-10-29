# План и границы поставки

Порядок приёмки выполнен: **terminal → BB → iii**. Backend и SDK Disler сохранены; native Pi Durable **1.4.0** владеет работой и recovery. Отдельной заменяющей очереди, runtime или Pocket здесь нет.

| Этап | Результат | Итог локальной проверки |
|---|---|---|
| P0 | Единственный native owner, explicit profile и saved model IDs | Принят: incompatible profile/model отклоняется до resume без silent remap |
| P1 | Public HTTP/SSE/SDK, grants, canonical receipts и безопасные ошибки | Принят: retry/conflict/cache-expiry/crash/reopen и независимые security regressions |
| P2 | Trusted native composition: models/tools/memory/guards/Goal/schedules | Принят в configured local scope; не универсальная plugin compatibility |
| P3 | Наш TUI поверх remote controller | Принят; неизменённый UI archive и fresh current-host/mixed-version проверки |
| P4 | BB thread/child binding, native controls, history CAS, standalone bridge | Принят на Core API fixture; `/compact` unsupported, running-BB smoke ещё нужен |
| P5 | Signed delegated iii jobs, native retry/control/recovery и immutable answerRef | Принят на installed native faux host + настоящем iii-sdk/loopback transport; iii-only install проверен |
| Offline P6 | Runbook, disposable closed-owner backup/restore и rollback | Только same-version репетиция; реальные historical/cross-version данные не переносились |

Общий итог — **51 PASS / 2 PARTIAL** из 53 неизменённых критериев. [Статус](STATUS.md) объясняет, какие runtime/UI проверки выполнены, какие доказательства переиспользованы на идентичных байтах и где остаются границы. Повторное итоговое ревью не установило новых дефектов.

## Дальнейшие действия оператора

1. Собрать и установить локальные tarballs по [quick start](GETTING_STARTED.md); сохранить hashes и выбранные model/profile IDs.
2. Для BB/iii подготовить явную trusted native composition и ограниченные server grants, а не расширять полномочия из client metadata.
3. Перед production replacement отдельно выполнить совместимый running-BB smoke и проверить реальные нужные интеграции в разрешённой среде.
4. Если нужен перенос истории, сначала согласовать выбранную session, исходный runtime/registry, закрытого владельца, backup и разрешённую копию. Продолжать и проверять rollback на копии, не заменять рабочую базу quick start.

Source publication, npm release, production deployment и миграция данных — разные действия. Публичный репозиторий и этот план не разрешают последние три автоматически. MIT и история upstream сохраняются.
