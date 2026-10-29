# План: один native owner, независимые клиенты

Порядок приёмки: **terminal → BB → iii**. Backend и SDK Disler сохраняются; проект не строит второй runtime, очередь или журнал вместо native Pi Durable. Целевая линия — **1.4.0**, Pocket исключён.

| Этап | Результат | Статус |
|---|---|---|
| P0 — границы | Native session ownership, явные profile/model IDs, recovery без silent remap | Локальные fixtures выполнены; на финальной сборке затронутые границы проверяются заново |
| P1 — API/SDK | Grants, canonical receipts, public HTTP/SSE, безопасные ошибки | Source-проверки выполнены, найденные security defects независимо закрыты в проверенном scope |
| P2 — native composition | Доверенные server profiles, models/tools/memory/guards/Goal | Исторические scoped gates; не универсальная совместимость extensions |
| P3 — terminal | Сохранить TUI, reconnect и native authority | Исторический milestone принят; final mixed-version ещё нужен |
| P4 — BB | Root/child binding, native controls, history CAS, standalone bridge | Исторический local milestone принят; `/compact` unsupported, running-BB smoke открыт |
| P5 — iii | Signed delegated jobs, retries/control/recovery, immutable answerRef, standalone package | Экспериментальная реализация приостановлена до публикационного checkpoint; затем продолжение и независимый gate |
| Offline P6 | Runbook, disposable backup/restore, rollback | Только same-version closed-owner rehearsal; без live data/production |

## Следующие шаги

1. Подготовить переносимый source checkpoint: точный inventory, MIT/provenance, понятные инструкции, безопасная публичная документация без приватных review-материалов.
2. Проверить quick start на чистой локальной установке. Не выдавать source typecheck за packaged acceptance.
3. Продолжить существующий P5: согласовать backend/SDK/iii artifacts и declarations, выполнить native signed/retry/revoke/control/restart/result scenarios, проверить iii-only install.
4. Зафиксировать общий финальный tuple исходников, lockfiles и пяти tarballs; выполнить проверки из [статуса](STATUS.md). Опубликовать точные результаты и ограничения, не переносить PASS старых архивов на новые boundaries.

Это публичный обзор плана, а не замена внутренней ISA или разрешение на production, миграцию реальных сессий, новые модели либо платные вызовы. История и copyright upstream сохраняются.
