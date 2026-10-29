# Проверено и остаётся открытым

**Это source checkpoint, не finished release.** Публикация Git-репозитория не равна приёмке всех пакетов, публикации в npm, deployment или переносу рабочих данных.

## Текущий срез

| Часть | Доказано | Ещё не доказано |
|---|---|---|
| Backend source | Typecheck и 114/114 тестов; исправлены HTTP initialization/cached errors, SSE diagnostics и case-sensitive routing | Единая свежая packaged-приёмка финального backend/SDK со всеми адаптерами |
| Security fixes | Независимый HTTP/cache/reopen/SSE/provider/projection прогон 11/11; отдельно auth-case 18/18 и 18 дополнительных отрицательных GET/HEAD сценариев | Это не полный security audit и не свидетельство безопасности любой extension |
| Native profile | Исторические изолированные native models/tools/memory/guards/Goal fixtures | Любые частные плагины и настройки пользователя автоматически совместимыми не становятся |
| Terminal | Историческая независимая TUI/reconnect/tool-stream/standalone проверка | Mixed-version на новом общем финальном tuple ещё требуется |
| BB | Исторический local milestone: Root/child binding, canonical retries, native control, CAS history | Smoke с полной совместимой работающей BB перед production replacement |
| iii | Подписанный ingress, экспериментальные backend/SDK/client interfaces | Реализация приостановлена; полный P5, immutable result/recovery и iii-only clean-install ещё не приняты |
| Исторические данные | Disposable closed-owner same-version backup/restore rehearsal и runbook | Настоящая выбранная историческая session и cross-version restore — отдельно согласуемая работа |
| Production | Не активирован | Этот checkpoint ничего не переключает |

Полный набор из 53 исходных критериев сохраняется во внутреннем каноне проекта. Эта публичная сводка не заменяет его и не переопределяет открытые критерии. Приватные review reports, внутренние probes, пути машины проверки и операторские сообщения не публикуются.

## Проверки этого source checkpoint

На отдельном публикационном checkout прошли typecheck всех пяти пакетов и **193/193 source-теста**, без пропусков: SDK 23, backend 114, terminal 19, BB 25, iii 12. Проверки использовали пустой временный HOME, faux и loopback; переносимые BB fixtures не требуют исходной машины.

Также прошёл `npm run package-smoke`: backend и SDK заново упакованы и установлены в отдельный временный HOME; проверены CLI/HTTP/SDK, native tool result, потерянный ответ и SIGKILL/reopen, явный native profile, scoped models/skills, parent/BB bindings, coherent outcome и native iii job/result/reopen. Все пять локальных tarballs успешно собраны.

Это **не** итоговый P5 verdict: полная signed client/recovery матрица, iii-only install и единый packaged mixed-version gate остаются отдельными требованиями. Source tests и ограниченный package smoke не заменяют их.

## Ограничения

- BB `/compact` **unsupported**: отказ до native effects и accepted ACK. Публичный native compaction API пока не даёт канонического idempotency key. Терминал и native SDK сохраняют свой API.
- Историческое BB-измерение — 50 native read-tool commits → BB API-delta, p95 **38,506202 мс** при бюджете **50,0585288 мс**. Это не latency модели и не полный UI repaint.
- Compile success не доказывает native Durable recovery compatibility.
- Нельзя открывать рабочую SQLite параллельно с её действующим владельцем. Quick start создаёт новую изолированную базу.
- Текущая версия пакета не идентифицирует его содержимое: нужны hashes исходников, lockfiles и реальных tarballs.

## Что требуется перед release-ready

Один неизменяемый source/lockfiles/tarball tuple; typecheck пяти пакетов; полные применимые faux/loopback suites; свежая установка упакованных backend/SDK/BB/iii; mixed-version с неизменённым принятым терминалом; отрицательные security scenarios. Проверяющий не принимает собственный исправленный участок.

Для iii отдельно нужны signed delegated identity, identical retries и changed-payload conflicts, revoke, foreign child/stale revision, owner restart, неизменяемый late answerRef и установка без terminal/BB. Реальные данные, production и платные модели этим планом не разрешаются.

[План](PLAN.md) · [Первый запуск](GETTING_STARTED.md) · [Архитектура](ARCHITECTURE.md)
