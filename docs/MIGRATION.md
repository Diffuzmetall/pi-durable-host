# Offline-перенос native-копии без BB

Текущий маршрут — backend + dpi-sdk + терминал + настоящий локальный iii. BB отложен и не входит в его verdict. Миграционный API не переключает установленный runtime, не останавливает owners и не разрешает перенос всех исторических версий.

## Что поддерживает API

Пакет backend экспортирует `adoptNativeCopy` из `dpi-backend/native-import`. Это доверенная серверная offline-операция: она принимает **уже проверенную согласованную копию**, проверяет её контракты и создаёт новый host catalog, не открывая Store/Harness и не запуская recovery.

Поддерживаемый формат — native SQLite SDK 1.4.0 с явно закреплёнными source fingerprints и проверенными definition contracts. Совпадение строки версии само по себе не доказывает совместимость. Исходная standalone-сессия может не иметь host catalog или formal profile ID; значение `null` сохраняется в provenance, а не объявляется задним числом `native@1`.

`source` соответствует экспортированному типу `VerifiedNativeCopy`:

| Поле | Требование |
|---|---|
| `directory`, `database` | Защищённая нормализованная копия; database — basename внутри неё, не оригинальная рабочая БД |
| `files` | Полный относительный file → SHA-256 inventory, включая локальные artifacts; symlinks и special files запрещены |
| `sessionId`, `name`, `createdAt` | Проверенная исходная identity/metadata; session ID сохраняется, а не генерируется заново |
| `sdkVersion` | Явно `1.4.0`; не обещание совместимости всех установок этого SDK |
| `sourceProfileId` | Фактический исходный ID либо `null`; выдумывать его нельзя |
| `bootstrapSha256`, `registrySha256` | Точные fingerprints, закреплённые проверкой source и принятые target policy |

Если source не сохранял full registry/profile envelope, fingerprint derived saved-contract/bootstrap/code attestation фиксируется **как производная проверка**, не как существовавший исходный registry ID. Версия текущего launcher не доказывает creator SDK выбранной сессии.

`target` соответствует `NativeImportTarget`: существующий trusted profile factory, его actual registry snapshot, cache-only `models.getModel`, явный принятый source contract и document contracts. Каждый document contract содержит фактические kind/version/scope/family/history/fork semantics и чистый `assertCompatible` для значения и dormant effects. Асинхронная проверка тоже завершается **до** публикации target catalog. Неизвестный kind или непроверенный version transition отклоняется; общего автоматического migrator здесь нет.

Параметр destination задаёт **ещё не существующий** data directory с canonical parent вне source copy и отдельный разрешённый `cwd`. API не сливает чужой catalog, не очищает failed attempt и не переписывает пути внутри native records/history. При ошибке после создания destination сохранённые там файлы остаются диагностическим partial attempt без successful import verdict; исходная копия не меняется.

## До вызова

1. Выберите и согласуйте конкретный неактивный source, исключив активных owners. Зафиксируйте release/bootstrap/registry/model references, scope backup и способ проверки quiescence **до** копирования.
2. Получите согласованный DB/WAL snapshot разрешённым read-only способом. Обычный `cp` активной SQLite/WAL-пары не годится. API использует `mode=ro&immutable=1`, поэтому **отклоняет непустой WAL**, а не игнорирует неподтверждённые committed данные.
3. Сохраните нетронутый backup и производный нормализованный input отдельно от candidate/restore. Source files защищены; candidate files получают `0600`, новые directories — `0700`. Не подменяйте исходный runtime на месте.
4. Изолируйте candidate: оригинальные пути недоступны, внешней сети и credentials нет, HOME/config свежие, ресурсы ограничены, опасные эффекты не исполняются. Fresh HOME сам по себе не доказывает безопасность lifecycle hooks.
5. Проверьте не только task status, но и документы с отложенными действиями, модель и source profile semantics. Чистый validator не должен подключать банк/API, исполнять tool или изменять проверяемое состояние. Known empty legacy document допускается лишь по явной проверенной inert policy с сохранением raw records; nonempty/unknown state нельзя скрыть за пустым значением.

В уже разрешённой репетиции выбранная защищённая копия переиспользуется: новая сессия не выбирается, история повторно не копируется. Сам API не является snapshot manager и не даёт прав на чтение чужих original directories. Старый `migrate-playground` рассчитан на другой layout с host catalog и выполняет source checkpoint: не используйте его для этой native-copy rehearsal и не запускайте на оригинале.

## Сохранность и отказы

Native SQLite копируется byte-for-byte. Сохраняются conversations, entries, task/submission IDs, документы/revisions, model references и остальное native state; host catalog и отдельный `IMPORT.json` добавляют envelope/provenance. Изменяется явный catalog DB path, не native IDs и не содержимое истории.

Все сохранённые task contracts должны быть известны и совпадать по версии; в этом bounded importer tasks должны быть terminal, submissions — settled. Pending state требует отдельной проверенной recovery policy и сейчас отклоняется.

SDK 1.4 при retirement current-only task document может удалить его revisions, сохранив incarnation record. Такой **известный retired task tombstone** допускается лишь с правильными scope/family и существующим terminal owner. Значение или отсутствующая stored version не выдумываются, value-validator не вызывается. Active document без content, unknown kind или missing owner отклоняются до target publication.

Проверка модели внутри importer — cache-only recognition сохранённого ID. Она **не** выдаёт credentials и не доказывает provider availability. Обычный Store по-прежнему проверяет фактическую model capability до open/resume; known ID без доступных credentials остаётся operational barrier. Подмена на faux или simulated continuation не превращает такой результат в real-provider GO.

## Что проверено локально

```sh
cd apps/dpi-backend
npm run check
node --import tsx --test tests/native-import.test.ts
```

Новая граница прошла 16/16 installed checks и public export/build/type checks. Реальная SDK-fixture покрывает native history/IDs, passive continuation в том же root conversation, async refusal, retired task tombstones, unsupported definitions/models/effects, WAL, paths и inventory. Это generated faux/SQLite evidence, не подмена actual selected-copy acceptance. Неизменённый полный test baseline повторно не запускался.

[Actual selected-copy matrix](verification/REAL_PILOT.md) отдельно фиксирует import PASS и фактически проверенный model-availability refusal до native bind/resume, без faux/remap. Санитизированный public backend переиспользует installed 16/16 и actual canary по byte identity всех 228 runtime/declaration файлов с проверенным архивом; это не повторный private-data прогон. [Четыре package hashes и границы](verification/MAIN_ROUTE.json).

Общий migration verdict **NO-GO**: хотя actual import прошёл и restricted original-profile rollback проверен, фактическое продолжение выбранной candidate session и её integration lifecycle после guard не проверены. Нужна совокупная независимая проверка actual source compatibility → импорта с сохранением state → контролируемого продолжения → terminal/iii reconnect/recovery без BB → исходного runtime/profile restore из нетронутого backup. Возврат выполняется на отдельной копии backup, а не запуском старого runtime поверх upgraded DB.

Публичные результаты содержат только разрешённые metadata, hashes и ограничения. Raw session data, transcripts, model credentials, private bank bindings и машинные пути не публикуются.

[Статус](STATUS.md) · [План](PLAN.md) · [Native composition](../apps/dpi-backend/NATIVE.md)
