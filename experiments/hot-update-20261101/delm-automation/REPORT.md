# S5 — DeLM и automation

Task: `59ceaba617324398b8f44ce513a693a2`. Source output; не installed acceptance.
Production activation NOT RUN. Auth FAIL `fd6ac2598301430d98429a8a44dd7873` остаётся operator-only.

## Результат и reuse chain

- DeLM adapter использует существующий `loadFreshModule` и shared `prepareReload(additions,replacements)`. Native `DelmWaitDoc.definition` передаётся в совместимость registry. Existing selection не создаёт `apply` и idle barrier. Late attachment сохраняет прежний selection seam. `validate`, `validateState` и публикация shared candidate сохранены.
- Каждый handler сохраняет существующие lifetime/current-binding/authority guards. Повторная загрузка не создаёт второй native owner. Registry subscription обновляет extension list; adapter больше не добавляет его повторно.
- Automation сохраняет прежние ScheduleOptions closures, Goal service, authority и cancellation. `prepareReload` получает только свежий `createSchedules` и definition через существующий loader. Он работает до bind и отказывает после close. Новых timers, services, subscriptions и повторного bind нет.
- Carol подключила factory внутри existing native-profile reload: DONE255, отчёт `../core-automation-wiring.md`. Shared registry output: DONE243, `../core-trusted.md`. Защищённые Goal accounting/admission/acceptance и subagent authority не заменяются.

## Проверки

Все runtime команды выполнялись только через `../sandbox/run.py`. Каждый запуск сначала выполнял физический negative self-check; production HOME/data/network не доступны.

1. `/tmp/hot-update-sandbox-o89y_0zz`: 15 PASS и один FAIL HTTP fixture. Прошли все 13 прежних DeLM tests, lifecycle test и настоящий engine replacement probe. HTTP fixture ожидал не ту текстовую форму parent report; product assertion тогда не выполнялся. После исправления fixture повторён только этот failing case.
2. `/tmp/hot-update-sandbox-njc5s42z`: HTTP reload test PASS, exit0. Native Store/Harness/SQLite/HTTP/SDK, два session и synthetic scoped credentials. Он сохраняет Harness, Goal service/contract, защищённые guards и соседнюю session. Одна реальная минутная schedule occurrence сохраняет schedule/task/request IDs; повторный reload не повторяет occurrence. Обычный generation hook получает v2. Проверены прежний parent receipt, отказ чужого child, отказ child-as-parent, own stop и live credential revoke. Используется faux model, не настоящий provider.
3. Реальный disposable DeLM engine: pending wait → fresh phase handler → authority revoke → same-ID retry → один wake. Native IDs и единственная generation/admission сохранены; свежий phase выводит `Reason v2:`. Cleanup failure после effect не повторяет доставку. Этот test PASS в запуске п.1 и ранее `/tmp/hot-update-sandbox-twai8hdc`.
4. Backend strict source typecheck PASS, exit0: `/tmp/hot-update-sandbox-q054e5ir`. Временный tsconfig внутри scratch сопоставляет `@local/pi-durable-reload` с текущим package source. Обычный installed-dependency typecheck FAIL, exit2: `/tmp/hot-update-sandbox-ww47kgfz`, потому что локальная физическая npm copy ещё stale. Это известная граница offline packaging Alice; source alias не является installed proof.
5. Scoped `git diff --check`: PASS. До исправления pending-wait reload блокировал unconditional apply: RED `/tmp/hot-update-sandbox-jeju_7bs`. Ранние HTTP fixture ошибки: неподдерживаемые секунды в DSL и ожидание report без корректной обработки его строки. Они исправлены без изменения product policy.

Итого: каждый из 16 source cases прошёл; один общий green запуск всех 16 после исправления fixture не выполнялся. Точные argv, mounts и exit evidence находятся в `command.json`, `run.log`, `work/sandbox-check.json` указанных sandbox roots.

## Повторение

Нужен curated engine source, не live run: `/tmp/frank-delm-source-ao8tjhv2` содержит только Python scripts/board/runtime, extension JS и worker prompt. Никаких bindings или данных команд.

```sh
python3 experiments/hot-update-20261101/sandbox/run.py --repo "$PWD" \
  --candidate /tmp/frank-delm-source-ao8tjhv2 -- sh -c '
  cd /repo/apps/dpi-backend &&
  DELM_TEST_ENGINE=/candidate/extensions/delm/index.js DELM_TEST_BOARD_ROOT=/candidate \
  node --import tsx --import /repo/experiments/hot-update-20261101/delm-automation/source-hook.mjs \
  --test /repo/experiments/sdk-host-cutover/delm-profile.test.mjs \
  /repo/experiments/hot-update-20261101/delm-automation/automation-reload.test.mjs \
  /repo/experiments/hot-update-20261101/delm-automation/delm-reload.test.mjs'
```

HTTP test реально ждёт одну минутную occurrence: native DSL не принимает секунды. Source hook нужен только source probes и не должен попадать в installed acceptance. Alice собирает свежую физическую dependency; Grace/Heidi проверяют один immutable manifest без alias.

## SHA256

```text
bf65c30ce4f226a02d04771d500e52559ed4d9a4863a8059121596cd25e4b83f  experiments/sdk-host-cutover/delm-profile.mjs
ea9adb9e424fccb15148378d7966cc8ec7d63344e76b4d8bdefef4624a6dc7aa  experiments/sdk-host-cutover/delm-profile.test.mjs
86270a6d672f20ab54a7ea6e370bb4c71d2633a154c6b42b4dd5a335f4525ff4  apps/dpi-backend/src/native-profile/automation/automation.ts
36591361ba59373d0390c8f921eaa5cebcf9d079e9faa6d1251a5fff8cf8b385  experiments/hot-update-20261101/delm-automation/automation-reload.test.mjs
c611c08eb6beda4c661827cb902ee5c6a3c5af37efbb2ef49fd0eca866ef8bde  experiments/hot-update-20261101/delm-automation/delm-reload.test.mjs
31546f7b719b663f2aa9422b5f8cbf2e16ea8cfcbf56571821ddc31e51fa889e  experiments/hot-update-20261101/delm-automation/source-hook.mjs
```

Live Host и live DeLM session не перезагружались. Installed candidate QA, release return и окончательное R4 acceptance этим output не закрываются.
