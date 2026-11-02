# Возврат Host release: BLOCKED

Task: `59c9d5cbbb9248f79810fb17b3b7e4bd`. Критерии: ISC-74/78, PLAN §5.5.
Production activation NOT RUN. Положительная команда возврата пока не доставлена.
Исторический checkpoint ниже предшествует source inspector и lifecycle fixtures. Текущее состояние приведено в следующем разделе.

## Обновление после DONE291/301

Carol выделила `inspectNativeCopy(source:VerifiedNativeCopy,target:NativeImportTarget)` без adoption и resume.
Отчёт `../core-offline-inspection.md` описывает callable и консервативные terminal-only отказы.
Дубликат карточки `2e3da2e9cd2b47d3b92012b79ccfc124` согласован без второй реализации.

Главный пробел остался: нет чистого target именно прежнего полного alice-v2.
Carol зафиксировала FAIL `a82349fb8abd46eea0602c78dd46f244` и технические причины в `../core-previous-target.md`.
Task target `bc37319f275e408d95acda39a600f631` остаётся OPEN, generation4, revision299.
Требуется полный pinned resource-free contract либо явное решение оператора о границе/baseline. Fixtures не могут заменить этот input.

Frank проверил узкую service lifecycle boundary в `return-release.mjs` и `return-release.test.mjs`.
Семь tests PASS, exit0: `/tmp/hot-update-sandbox-q96mnd3m`, после physical negative self-check.
Это настоящие disposable Node процессы и filesystem, но не Host/SQLite/native receipts или реальные модели.
Default CLI отказывает с `RELEASE_COMPATIBILITY_UNKNOWN` до обращения к service manager.
Никакого production switch, config/unit/credentials/DB изменения не было.

`README.md` задаёт точный API, порядок stop→актуальная копия→повторный preflight→switch/start и ограничения.
Оба положительных Host return, точный прежний target и final immutable acceptance остаются NOT RUN/BLOCKED.
FAIL `477df4a5cc274f7dbc95f34c80e17468` остаётся открытым; source extraction закрыла только одну его предпосылку.

## Исходный checkpoint (исторический)

## Причина

Carol завершила исследование `c1ea492605ef4d6fa37d26b66910295f`, DONE269.
Факт `118df99a6a51480bad90269cf59b6ef0` подтверждает отсутствие безопасного read-only preflight для прежнего полного release.
Совместимость актуальных данных с возвратной версией неизвестна. PLAN §5.5 запрещает switch при таком результате.
DONE исследования не означает готовность возврата.

## Что проверено

Frank прочитал `native-import.ts`, `registry.ts`, `operational-service.mjs`, `activate-delm.mjs`, `delm-cutover-unit.mjs` и `packaging/ROLLBACK.md`.
CodeGraph показал существующие ownership и reload interfaces. Поиск старых scripts выявил жёсткие production paths.
Frank не запускал эти scripts, не читал credentials и не обращался к live Host.

- `ReloadableRegistry.assertCompatibleState(storage,context)` проверяет задачи и документы своего registry. Он не проверяет models или прежний полный release.
- `NativeImportTarget` уже задаёт явный registry, чистые document validators и cache-only `models.getModel`. Но `adoptNativeCopy` после проверки копирует данные и создаёт каталог.
- Проверка `adoptNativeCopy` принимает только terminal tasks и done/unanswered submissions. Pending work требует отдельного доказательства. Dormant документы требуют semantic validators, а не проверки одних schema versions.
- `operational-service.mjs` открывает Store и продолжает recovery. Его запуск не является read-only preflight.
- `activate-delm.mjs` связывает production unit, config, bindings и credentials. Его нельзя импортировать или исполнять для этой репетиции.
- Горячий adapter selector Alice меняет будущий dispatch одной session. Он не возвращает весь Host release и не доказывает совместимость прежнего полного profile.

Это source evidence, не runtime verdict. Смена release, startup failure и stop refusal пока NOT TESTED.
Ни один owner, selector, unit или файл БД не изменён.

## Минимальный следующий шаг

Alice должна передать два автономных immutable Host closure, точные manifest digests и статус чистого target прежнего release.
Их entry points и profile должны соответствовать реальному service, а не fixture, которая использует текущий registry.
Нужно отдельно выделить read-only проверку из `adoptNativeCopy`, сохранив прежние консервативные отказы.
Target прежнего sealed release должен предоставить полный registry, semantic validators и cache-only model catalogue без запуска controllers.
Если target отсутствует, неизвестная совместимость остаётся блокером. Придумывать положительный сертификат или подменять старый target текущим запрещено.

Только после этого узкая команда может связать existing service stop, проверку owner/locks, atomic selector/unit replacement и start.
Перед окончательным preflight необходимо исключить текущего owner и проверить актуальную согласованную копию данных.
Предварительная копия не разрешает switch после новых записей. Старую БД поверх новых результатов восстанавливать нельзя.
Отказ остановки и неизвестный исход cleanup не разрешают второй start или удаление lock по таймауту.

Heidi должна проверить одну команду на тех же итоговых artifacts и актуальной disposable БД.
До этого нельзя заявлять ISC-74/78 PASS или полное R4 acceptance.
Прежний auth FAIL остаётся operator-only и не закрывается этим исследованием.

## Корреляция source

```text
24eda1095406124b72c00b59868399bdc7a4e212fe6c5cd6653a4134c18f89b3  apps/dpi-backend/src/native-import.ts
914d308738250e80aa9ed55f368623c0511af910f0665cda8e35acb00bb76260  apps/dpi-backend/src/native-profile/profile.ts
```

Хэши передала Carol; Frank сверил их с текущими файлами перед публикацией этого checkpoint.
Положительный runtime preflight, два release roundtrip и production activation NOT RUN.
