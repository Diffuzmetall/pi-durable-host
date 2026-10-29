# Проверенный scope и ограничения

**Локальная приёмка P0–P5 завершена; повторное итоговое ревью не установило новых дефектов.** Проверены backend, SDK, terminal, BB и iii на Pi Durable **1.4.0**. Это не production deployment, публикация npm-пакетов или сертификация произвольных native extensions.

Из 53 исходных критериев **51 PASS, 2 PARTIAL, 0 UNKNOWN, 0 FAIL** в описанном ниже scope. Два частично проверенных критерия относятся к выбранной исторической session и возврату её исходного runtime: выполнена лишь disposable closed-owner same-version репетиция. Рабочие данные не переносились.

## Что проверено

| Часть | Подтверждённый сценарий | Граница доказательства |
|---|---|---|
| Backend/SDK | Native ownership, exact saved model/profile IDs, tools, canonical receipts, retry/conflict/cache-expiry, crash/reopen | Изолированные native/faux sessions, не произвольные исторические registry |
| Security | Observer/delegated/human boundaries, revoke reads/mutations/open streams; безопасные HTTP/cache/reopen/SSE/provider diagnostics; healthy opaque JSON | Не полный security audit или сертификат любых plugins |
| Native profile | Явная server composition, models/skills/context, native guards/CodeMode/Goal/schedules, session-local Hindsight/Mail | Локальные recording/loopback transports, без личных banks и живых платных API |
| Terminal | Editor/navigation/tool stream/interrupt/steer/attention/reconnect; standalone install | UI/PTY baseline связан с неизменённым принятым terminal archive; на новом host свежие controller/mixed проверки, не новый полный PTY-прогон |
| BB | Exact thread/root/child binding, native control/outcomes, canonical retry и history CAS/lost ACK | Настоящий native host + Core API fixture; не полный running-BB UI smoke |
| iii | Signed identity, native isolated jobs, same-key retries, conflicts, foreign/stale/revoked controls, late immutable answerRef, restart и pending-stop reconciliation | Настоящий pinned iii-sdk + loopback function transport + native faux host, не production engine |
| Независимая установка | Terminal-only, BB-only, iii-only со своим SDK; каждый без backend/Harness и двух других клиентов | Реальные offline tarball installs с явно подготовленным npm cache, побайтовая archive closure |
| Mixed-version | Неизменённый terminal/старый SDK и новый BB/SDK получают native ответы в той же host/session/conversation | Два одновременных frontend — terminal и BB; iii отдельно на том же backend/SDK tuple |
| История/production | Только disposable offline backup/restore runbook | Реальная historical/cross-version миграция и production не выполнялись |

## Проверки

На одном замороженном source/all-lockfile/five-package tuple прошли пять strict typechecks и **193/193 source-теста без пропусков**: SDK 23, backend 114, terminal 19, BB 25, iii 12. Проверки используют пустой HOME/dataDir, read-only source и OS sandbox с loopback; в публичных BB tests находятся переносимые contract fixtures.

Дополнительно проверены настоящие установленные пакеты: signed iii CLI/native flow; полный native iii HTTP scenario; 15 security regressions; минимальный CLI с буквальным curl-рецептом, повтором и owner reopen; отдельные установки клиентов; mixed-version поток. Контрольный специальный request key отклоняется до создания native ресурсов. Незаинтересованный reviewer отдельно проверил client auth/canonical JSON и actual compiled modules; исправленные security участки приняты не их авторами.

Повторное итоговое ревью заново сверило 407 файлов, все восемь repository lockfiles, hashes пяти архивов, содержимое установок, 53 исходных leaf criteria и их шестиколоночную Test Strategy; повторило пять no-emit typechecks. Уже выполненные runtime tests на неизменившихся байтах не названы вторым запуском. Приватные отчёты, raw logs, security proof material и пути машины проверки не публикуются.

### Производительность

На 50 actual native read-tool commits измерен **тот же commit → BB API-visible delta**: baseline p95 **0,050321 мс**, remote p95 **49,123057 мс**, бюджет `1.2 × baseline + 50 ms` = **50,0603852 мс**. Запас — около **0,94 мс** в этой среде. Это не production SLA, latency модели или полный BB UI repaint.

У неизменённого terminal archive сохранён прежний независимый commit → PTY результат: p95 **4,278373 мс** при бюджете **51,9471548 мс**. Эти две метрики не взаимозаменяемы.

## Проверка публичной сборки

После обновления документации заново собраны и offline установлены все пять публичных tarballs с заранее подготовленным npm cache. Это не uncached bootstrap: local tarballs не включают все сторонние npm dependencies. На них повторно выполнены буквальные JS-примеры из GETTING_STARTED/CUSTOM_RUNTIME/BUILDING_ADAPTERS, curl-рецепт, default minimal CLI/reopen, signed iii CLI/native flow, native iii HTTP scenario, 15 security regressions и mixed terminal + BB. Все проверки прошли; исходные assertions не ослаблялись. Только тестовые endpoints/порты и install roots выбраны disposable.

| Локальный публичный архив | SHA-256 проверенных байтов |
|---|---|
| backend | `a7405fead09463a54c6de91211df27b6c5600ae3f6f585dea01de41c94d5fc88` |
| SDK | `351054859022ae202fbdc429e73da441bc90295e4717342652079c3ea0906abd` |
| terminal | `1f1b74fa2b515b55bf280113d91116c267755973b5ed76ce9a6389174c235bde` |
| BB | `fffc8f239c35862a5e130533da2fb338f315ec57891cac90d431b68009a1e661` |
| iii | `17479a5dd8facb35eecff6311e3f3b718bc9bb607c02f7bcb54f78045fe58761` |

В iii-рецепте отдельно исправлена cold-HOME установка: обычный путь использует npm registry, а offline-вариант требует явно подготовленного полного cache. Буквальные normal install и cache preparation прошли с новыми пустыми HOME; затем тот же исправленный архив установлен без сети в OS sandbox с подготовленным cache. CLI `--help` прошёл, backend/terminal/BB не устанавливались. Изменились только README и его SOURCE hash; runtime JS/declarations совпадают побайтово, поэтому неизменные functional cases не названы новым повторным запуском.

Это hashes локально проверенной source-сборки, не ссылки на опубликованные npm/binary releases. Runtime JavaScript и public declarations сохранены относительно принятого local tuple; отличия provenance/docs/package metadata проверены отдельно. Два неэкспортируемых build-time contract-check файла отсутствуют в чистой публичной backend-сборке; они не импортируются runtime и не входят в его public exports.

## Что не обещается

- BB `/compact` **unsupported**: отказ до native effect и accepted ACK. Публичный native compaction API не даёт canonical idempotency key. Терминал и SDK сохраняют свой API.
- Полный совместимый running-BB smoke нужен перед production replacement.
- Нет автоматической совместимости обычных Pi extensions, частных model IDs, произвольных registry или исторической recovery по одному успешному compile.
- iii transport ACK — не completed job. Pending stop — не подтверждение native stop effect; потеря временного cursor не отменяет persisted `answerRef`.
- Реальные модели/API, личные memory banks, deployment, рабочие DB и historical/cross-version migration требуют отдельного решения оператора.
- `0.1.0` не идентифицирует содержимое архива: для установки фиксируйте source revision, lockfiles и SHA-256 собственных tarballs. Метаданные публичной документации могут отличать архив от внутренней проверочной сборки; не переносите verdict на новые байты автоматически.

[План](PLAN.md) · [Первый запуск](GETTING_STARTED.md) · [Клиенты](CONNECTING_CLIENTS.md) · [Архитектура](ARCHITECTURE.md)
