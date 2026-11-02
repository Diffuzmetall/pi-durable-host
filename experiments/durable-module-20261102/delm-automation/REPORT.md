# D3 — DeLM и automation на Durable 1.5

Task: `70d54d64baf44af088901d8357526102`, Frank, generation 1.

Результат: source bindings проверены на настоящем Durable 1.5 в физическом sandbox.
Финальный набор: 19 PASS, 0 FAIL, exit 0.
Это не packaged acceptance и не приёмка полного Host.
Production activation NOT RUN.

## Входы и безопасность

- Неизменённый seed Alice: `/tmp/pi-host-dm1-build-20261102-alice-v1`.
- Собственная изменяемая копия: `/tmp/pi-host-dm1-automation-20261102-frank-v1`.
- Curated DeLM snapshot: `/tmp/frank-delm-source-ao8tjhv2/extensions/delm`.
  Это прежний изолированный snapshot R4, не заявление о pristine upstream.
- Runtime использует настоящие Harness, SQLite, definitions, hooks и native tasks.
- Модели и provider callbacks — faux fixtures. Live providers не вызывались.
- `bwrap --unshare-all` отделяет HOME, сеть, live board и production paths.
  Обязательные отрицательные проверки изоляции прошли во всех указанных sandbox.
- Общие node_modules, dist, manifests, installed release и production DB не менялись.
- `activate-delm.mjs` не импортировался и не исполнялся.

## Изменённые bindings

- `schedules.ts`, `native-goal-control.ts`, `triggers.mjs` импортируют Type из standalone `typebox`.
- Outcome schema использует явные literal types. Значения и JSON schema сохранены.
- `engine/index.js` импортирует standalone Type.
  Явное соответствие ToolTask versions: 1 → content, 2 → output, 3 → output.
  Неизвестная версия по-прежнему вызывает отказ.
- `goal-run.ts` читает WatchCall.value, а не сам WatchCall.
  Failed/retired callbacks прекращают ожидание; закрытие watch не означает готовность результата.
  Эти legacy archive seams прошли strict typecheck; новая legacy execution не запускалась.
- Usage.cost теперь суммирует только пять числовых полей.
  Новый `totalFromProvider` остаётся boolean; смешанное происхождение даёт false.
- Companion compaction использует reserveTokens для точной пары provider/modelId.
  Общий reserve применяется только при отсутствии per-model override.
- Admission helper принимает только используемые taskId/conversationId.
  Это устраняет ложную зависимость tool API от полного HookApi.

## Неизменённая независимая логика

`HASHES.json` содержит точные SHA256 текущих файлов и baseline.

Полностью совпали с seed Alice:
`automation.ts`, `github-triggers.mjs`, `goal-skills.ts`, `native-contract.ts`, `native-goals.ts`, `when.ts`, `delm-profile.mjs`.

Полностью совпали с curated DeLM snapshot:
`control.js`, `protocol.js`, `session-facet.js`.

Schedules и triggers изменили только Type import.
Собственные task/document kinds, versions и алгоритмы dedupe не менялись.
Root/child model IDs задаёт fixture; новые реальные модели или дополнительные execution owners не добавлены.

## Проверки

### Финальные native tests

Sandbox: `/tmp/hot-update-sandbox-095b8209`.
Доказательства: `run.log`, `command.json`, `work/sandbox-check.json` внутри этого sandbox.
Отрицательные проверки изоляции PASS; 19 tests PASS; exit 0.

```sh
python3 experiments/hot-update-20261101/sandbox/run.py --repo "$PWD" \
  --candidate /tmp/pi-host-dm1-automation-20261102-frank-v1 --timeout 100 -- sh -c '
cd /candidate && node --import tsx \
  --import /repo/experiments/durable-module-20261102/delm-automation/source-hook.mjs \
  --test --test-concurrency=1 \
  /repo/experiments/durable-module-20261102/delm-automation/native-bindings.test.mjs \
  /repo/apps/dpi-backend/tests/native-automation.test.mjs \
  /repo/apps/dpi-backend/tests/native-goal-operator.test.mjs \
  /repo/experiments/hot-update-20261101/delm-automation/delm-reload.test.mjs'
```

Набор проверяет Goal persistence, budget, human-only approval, child denial и revoke.
Проверки также покрывают schedule reopen/dedupe, lost ACK, concurrent retries и uncertain interruption.

Новая fixture проверяет настоящие native fork и CompactionTask.
Root: conversation 1, model `dm1-faux/root`, thinking high, maxTokens 800.
Child fork: conversation 26, model `dm1-faux/child`, thinking low, maxTokens 400.
Общий reserve 2000 не заменяет отдельные overrides 1000 и 500.
Fixture явно задаёт активное persisted Goal перед native compaction; это не новая пользовательская admission.
Смешанный cost provenance остался false; числовые cost поля конечны.

Trigger watch сохранил taskId 14 и собственный ID после reopen.
Два чтения одного event дали только одну admission и sent=1.
После revoke provider больше не читался; child не создал watch.
Финальный watch ID: `48e42519cd65130ac90809e0f5cf6dcb`.
Request: `durable-trigger:1:48e42519cd65130ac90809e0f5cf6dcb:0`.

DeLM wrapper сохранил conversation 1, waitTask 8, submission 11 и request `delm-wake:8`.
Wait ID: `9ea8d034dbbcd796e43b6606d5c978e76e296d8a203afec5df3937beb677dd33`.
Получена одна generation, два apply rejection и два discard.
Failed drain остаётся applied; concurrent reload во время drain отклонён.

### Strict typecheck

Sandbox: `/tmp/hot-update-sandbox-rn1oyuux`, exit 0.
Копии текущих automation sources помещены только в собственный closure.

```sh
cd /candidate
node node_modules/typescript/bin/tsc --noEmit --strict --skipLibCheck \
  --target ES2023 --module NodeNext --moduleResolution NodeNext \
  --lib ES2024,DOM,DOM.Iterable --types node \
  apps/dpi-backend/src/native-profile/automation/session-goals.ts \
  apps/dpi-backend/src/native-profile/automation/native-goal-control.ts \
  apps/dpi-backend/src/native-profile/automation/schedules.ts
```

Это scoped check импортируемого графа, не полный backend build.
Первый check через automation.ts выявил отсутствующий alias `@local/pi-durable-reload` в minimal closure.
Он также выявил новые WatchCall, cost boolean и literal inference ошибки; эти ошибки исправлены в собственном scope.
Исходный failed log сохранён: `/tmp/hot-update-sandbox-rhuff7tm/run.log`.

## Сохранённые первоначальные отказы

- `/tmp/hot-update-sandbox-8radxa4h`: unsupported ToolTask protocol 3.
  Исправлен явным version binding; последующий wrapper test прошёл.
- `/tmp/hot-update-sandbox-kiarky0j`: 16 PASS, но общий exit 1.
  Полный Store/profile trigger test падает в чужом `extensions.ts` на старом Type export.
  Frank этот файл не менял. Частичный результат опубликован FACT660.
- `/tmp/hot-update-sandbox-nu9ja4id`: model/compaction PASS, trigger reopen FAIL.
  Fixture не возобновила scheduler после reopen.
  После явного `h.resume()` тот же native task продолжил работу.
- Промежуточные 19 PASS: `/tmp/hot-update-sandbox-i403mic3`.
  Финальный набор повторён после последующих binding изменений; использовать `095b8209`.

## Handoff Carol/Alice/Heidi

Source engine для упаковки: `engine/{index,protocol,control,session-facet}.js` рядом с этим report.
Все четыре файла совпали с tested private `/candidate/extensions/delm` по SHA256.
Подключать только в новый isolated candidate; не заменять установленный engine.
`source-hook.mjs` — test-only resolution bridge, не часть packaged acceptance.
Он не является альтернативным runtime или production fallback.

Carol принимает automation sources в общий runtime/profile.
Alice включает curated engine в собственную новую упаковку и проверяет полный closure.
Heidi проверяет точный общий digest, Host/HTTP/client/PTY и DM-D comparison отдельно.

NOT TESTED: полный Host/profile trigger roundtrip, packaged DeLM launch, installed acceptance и legacy archive continuation.
Исторические auth/ISC-74/78/current-history release-return FAIL не разрешены этим срезом.
Production activation NOT RUN.
