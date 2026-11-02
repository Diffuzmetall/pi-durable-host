# DeLM wrapper: lifecycle verification

Task: `a1c7c4c153b547e88bc5dd081a8f467a`.

Frank проверил текущий `attachDelm` на новом core lifecycle. Продуктовый код не изменён: spread candidate уже передаёт `discard` и `drain`.
Тест добавляет callbacks к существующему registry preparation. Он не создаёт второго владельца ресурсов.

## PASS

Финальный запуск: `/tmp/hot-update-sandbox-x5g7s2y7/run.log`, exit0, один интеграционный тест PASS.
Физический negative self-check прошёл до теста. Sandbox исключает доступ к production HOME, данным и сети.

Тест использует настоящий disposable DeLM engine, локальную доску, Harness и SQLite. Модель faux; callbacks ресурсов синтетические.

- Pending wait сохраняет native IDs после публикации свежего обработчика. Старый и новый обработчики учитывают отзыв полномочий.
- Wrapper apply отказывает после подготовки candidate. Core вызывает `discard` ровно один раз и сохраняет активный обработчик.
- Если `discard` тоже отказывает, AggregateError сохраняет обе исходные ошибки в прежнем порядке.
- После публикации core вызывает `drain`, но не `discard`. Вложенный native commit проходит внутри `drain`: retirement выполняется вне публикационного commit.
- Ошибка `drain` возвращается как `cleanupError`. Обработчик v3 остаётся активным; публикация не отменяется.
- Пока `drain` ожидает завершения, второй reload получает `reason: busy`.
- После всех проверок сохраняются Harness, wait, request и полный native submission record. Повторной доставки нет: одна generation.

Native evidence финального запуска:

```json
{"conversationId":1,"waitId":"9ea8d034dbbcd796e43b6606d5c978e76e296d8a203afec5df3937beb677dd33","waitTaskId":8,"requestId":"delm-wake:8","submissionId":11,"generations":1}
```

## Команда

Curated engine input: `/tmp/frank-delm-source-ao8tjhv2`. Это отдельная копия исходников, не live run.

```sh
python3 experiments/hot-update-20261101/sandbox/run.py --repo "$PWD" \
  --candidate /tmp/frank-delm-source-ao8tjhv2 -- sh -c '
  cd /repo/apps/dpi-backend &&
  DELM_TEST_ENGINE=/candidate/extensions/delm/index.js DELM_TEST_BOARD_ROOT=/candidate \
  node --import tsx --import /repo/experiments/hot-update-20261101/delm-automation/source-hook.mjs \
  --test /repo/experiments/hot-update-20261101/delm-automation/delm-reload.test.mjs'
```

Exact argv и mounts сохранены в `command.json` финального sandbox.
Scoped `git diff --check` прошёл для теста.

## История проверок

Первый запуск `/tmp/hot-update-sandbox-h5ieq8ru` выявил ошибку новой fixture: registry preparation теперь асинхронный.
Fixture исправлена: она ожидает preparation до добавления callbacks.
Второй запуск `/tmp/hot-update-sandbox-3_tahagc` выявил неверную проверку поля ошибки: API использует `reason`, не `code`.
После исправления `/tmp/hot-update-sandbox-mm3t2ny4` прошёл.
Затем тест усилил проверку submission: полный record и числовой `id` вместо отсутствующего `taskId`.
Финальный запуск `/tmp/hot-update-sandbox-x5g7s2y7` проверил эту окончательную версию.

## SHA256 финальных исходников

```text
a1ea8dda5a0e97691fe95169c91d16155b8689a453ae634b9dd983dd570c62a5  experiments/hot-update-20261101/delm-automation/delm-reload.test.mjs
bf65c30ce4f226a02d04771d500e52559ed4d9a4863a8059121596cd25e4b83f  experiments/sdk-host-cutover/delm-profile.mjs
1f42e1402630ef3c5b3ddf485740754273a59a0cffc289addaff8d12492af3cd  packages/durable-reload/src/index.ts
78674429c65bcafd459ca73e2dc18f84c86a1db1ada3d8220d24b694184d6c33  packages/durable-reload/src/registry.ts
31546f7b719b663f2aa9422b5f8cbf2e16ea8cfcbf56571821ddc31e51fa889e  experiments/hot-update-20261101/delm-automation/source-hook.mjs
```

## Ограничения и получатели

Bob, Alice и Heidi получают этот output для интеграции и независимой проверки общего candidate.
Source hook сопоставляет текущие исходники; этот запуск не доказывает installed acceptance.
Тест не проверяет настоящие MCP connections или фактическое освобождение их ресурсов.
Общий S5, полный R4, совместимость прежнего release и auth blocker этим output не принимаются.
Production activation NOT RUN. Live Host и live DeLM не изменялись.
