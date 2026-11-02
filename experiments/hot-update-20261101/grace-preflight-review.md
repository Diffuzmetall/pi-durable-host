# Grace: предварительная проверка startup preflight и inspector

Задача: `fb60f69f6a3741a3ab690ee61c310f6a`.
Потребители: Carol, Frank и итоговый review Grace.

## Вердикт и границы

SCOPED SOURCE PASS: подтверждённых новых дефектов в проверенных изменениях не найдено.
Это предварительная проверка завершённых S3 и extraction inspector, а не приёмка финального кандидата.
Grace не запускала product tests, Host, SQLite, providers или profile factories.

Проверены текущие исходники, а не прежний sealed artifact.
Итоговая упаковка требует повторного сопоставления этих файлов с одним immutable manifest.
Существующие FAIL по прежнему target и auth остаются открытыми.
Production activation NOT RUN.

## Проверенный scope

- `apps/dpi-backend/src/store.ts`: строки 705–808 и 1856–1892; initialization, preflight, cleanup и locks.
- `apps/dpi-backend/src/native-profile/profile.ts`: строки 215–304; registry facade, initial preparation и stateStorage.
- `packages/durable-reload/src/registry.ts`: строки 54–57 и prepare/validateState/publication.
- `packages/durable-reload/src/compatibility.ts`: строки 44–116; task/document readers и консервативные отказы.
- `apps/dpi-backend/src/native-import.ts`: строки 44–220; inspector и граница adoption.
- `apps/dpi-backend/tests/native-import.test.ts`: inspection assertions, pending refusals и hashes.
- `apps/dpi-backend/tests/hot-update-compatibility.test.mjs`: строки 260–293; failed reopen и сохранение task rows.

Структуру вызовов проверила через CodeGraph и текущие исходники.
Diff `native-import.ts` проверен относительно HEAD: extraction сохранил прежнюю проверку, а adoption использует её результат.
Результаты тестов Carol из `core-s3.md` и `core-offline-inspection.md` не считаются независимым runtime evidence Grace.

## Причинная проверка

### 1. Startup preflight предшествует native recovery

Доказательство: deterministic, `store.ts:740–748,776–792`.
Store создаёт профиль и публикует начальный registry до проверки сохранённого состояния.
После открытия storage Store вызывает `profile.assertCompatibleState` до `Harness.open`, bind и resume.
Следовательно, отказ проверки не достигает native reconciliation и resume этого Harness.

`profile.ts:282` передаёт проверку текущему ReloadableRegistry.
Registry проверяет native tasks и document contracts из adapters и trusted replacements.
`compatibility.ts:44–76` сохраняет pagination и проверки task version/checkpoint phase.
Поддерживаемая native migration проверяется без записи результата в storage.
Это trusted pure callback, а не изолированный запуск произвольного migration code.

Ограничение: initialization целиком не является read-only.
Profile/model initialization предшествует проверке; `openNodeSqliteStorage` также выполняется раньше.
Этот порядок доказывает запрет reconciliation/resume при отказе, но не неизменность всех файлов базы.
Models и native base documents сохраняют собственные проверки и владельцев.
Preflight не доказывает совместимость прежнего полного release.

### 2. Ошибка preflight сохраняет границу ownership

Доказательство: deterministic, `store.ts:799–808,1856–1864`.
При отказе Store вызывает shutdown, закрывает storage без Harness, затем выполняет cleanup.
Unlock выполняется после завершения этой последовательности, включая обработку ошибок cleanup.
Операции cleanup продолжаются после отдельного отказа; ошибки агрегируются.
Инициализация не публикует session runtime в opened до успешного bind.

Ограничение: бесконечный trusted initializer остаётся отдельной проблемой lifecycle.
Этот review не заявляет новый timeout или безопасную отмену произвольного controller.

### 3. Inspector не выполняет adoption

Доказательство: deterministic, `native-import.ts:61–174,178–220`.
Inspector проверяет provenance, полный inventory, digests и отсутствие symlinks.
Непустой WAL отклоняется до immutable SQLite inspection.
SQLite открывается с `readOnly:true` и URI `mode=ro&immutable=1`.
Основная проверка закрывает connection через finally.

Вызовы mkdir, copyFile, chmod, writeFile и initializeCatalog остаются внутри adoptNativeCopy после inspector.
Inspector не вызывает target.profile, Harness, requireModel или Store.
Возвращаемое значение содержит `runtimeContinuationChecked:false`.

Обязательные входы: coherent immutable copy и trusted pure target callbacks.
Inspector сам не превращает live database в coherent snapshot.
Он также не гарантирует чистоту внешнего callback `assertCompatible` или `models.getModel`.

### 4. Положительный inspector result не является разрешением release switch

Доказательство: deterministic, `native-import.ts:108–171`.
Inspector требует terminal tasks и submissions со статусом done либо unanswered.
Документы проходят target semantic validators, а saved models проверяются через cache-only target lookup.
Неизвестные contracts отклоняются; старые task tombstones проверяются отдельно.

Набор target callbacks должен принадлежать именно прежнему полному release.
Текущий registry, пустые factories и synthetic fixture не заменяют этот target.
После новых записей предварительная проверка копии перестаёт описывать актуальное состояние.
Frank должен исключить владельца и повторно проверить coherent current copy перед switch.
Review не разрешает восстановление старой базы вместо сохранения новых records и receipts.

## Findings

Подтверждённых introduced findings в указанном scope нет.
Доказательства выше ограничены source control flow и прочитанными assertions тестов.
Runtime проверки, final manifest, полный compatibility target и release-return остаются вне этого вердикта.

## Hashes проверенных исходников

```text
18bfd93576144e0192643850bd7445f385ca29f58c23a50d10c15e9d89ea376e  apps/dpi-backend/src/store.ts
f140783fbe739eb064f1ad905d90eb7667a3c8173b536286f370b34fee0f5b0b  apps/dpi-backend/src/native-import.ts
914d308738250e80aa9ed55f368623c0511af910f0665cda8e35acb00bb76260  apps/dpi-backend/src/native-profile/profile.ts
78674429c65bcafd459ca73e2dc18f84c86a1db1ada3d8220d24b694184d6c33  packages/durable-reload/src/registry.ts
9ef2af877c85de92d0bcb4a2bc3f1921f06ee878d5ca895fdd3acba836808103  packages/durable-reload/src/compatibility.ts
8ec33c4569d5fef0a860bcde286f393ad439661e1406d2cfaaeb90bf22e2d4bd  apps/dpi-backend/tests/native-import.test.ts
1fa4d08f637f6c26eb626472ff955220d0309b0e7963facb99502b6f2f3caf66  apps/dpi-backend/tests/hot-update-compatibility.test.mjs
```
