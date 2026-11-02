# Физическая изоляция проверок hot-update

Frank: ISC-76 и test-only граница ISC-77. Это готовый интерфейс для Carol, Bob, Dave, Eve, Alice и Heidi.

## Повторное использование

Прежняя QA использовала bwrap: `experiments/restart-repair-20261101/qa` и restart REPORT.
Она скрывала HOME, но монтировала корень и общий `/tmp`.
Новый launcher сохраняет bwrap и убирает эти широкие mounts.
Загрузчик продукта, таймеры, SQLite owner и работающий Host не меняются.

## Запуск

Из корня checkout:

```sh
python3 experiments/hot-update-20261101/sandbox/run.py \
  --repo "$PWD" \
  --candidate /tmp/pi-host-restart-candidate-20261101-alice-v2 \
  -- node -e 'console.log("SANDBOX_COMMAND_PASS")'
```

Аргументы `--repo`, `--candidate` и `--previous` необязательны.
Launcher монтирует их read-only как `/repo`, `/candidate` и `/previous`.
Artifact должен быть отдельным disposable каталогом внутри `/tmp`, не самим `/tmp`.
`--repo` принимает только текущий checkout.
Launcher не копирует workspace и не создаёт второго владельца исходников.

Каждый запуск создаёт новый каталог `/tmp/hot-update-sandbox-*`.
Только его подкаталог `work` доступен для записи как `/scratch`.
HOME: `/scratch/home`; PI_CODING_AGENT_DIR: `/scratch/home/.pi/agent`.
Данные: `/scratch/data`; временные файлы: `/scratch/tmp` и отдельный namespace `/tmp`.
Указывайте эти пути в тестовом config явно.
Пути production нельзя передавать как config/dataDir.

Команда после `--` выполняется только после PASS negative self-check в том же namespace.
Для source tests используйте пути `/repo/...` и cwd, который задаёт сам fixture.
Для packaged tests используйте `/candidate/...`.
Передавайте второй сохранённый artifact через `--previous /tmp/ИМЯ`.
Не копируйте старую БД поверх актуальных данных.

Launcher использует установленный `node`, без загрузок и установки пакетов.
PATH внутри sandbox: `/node/bin:/usr/bin:/bin`.
Shell можно вызвать явно: `-- sh -c 'cd /repo/PATH && node TEST'`.
Read-only источник не позволяет build внутри checkout; build outputs требуют отдельного согласованного процесса Alice.
Проверки с новым reload нельзя выполнять в собственной DeLM-сессии.

## Обязательная отрицательная проверка

До запуска команды parent и child проверяют:

- production HOME, credentials, data roots, user sockets и host `/var/tmp` недоступны;
- synthetic sentinel вне mount недоступен;
- запись в production paths, корень, source и artifacts запрещена;
- `/proc/1/root` и parent-root aliases не дают доступа к host credentials;
- environment содержит только фиксированный разрешённый набор;
- PID-1 environment не содержит тестовых переменных credentials;
- HOME, data и временные каталоги доступны для записи внутри scratch;
- интерфейсы сети только loopback; реальное loopback-соединение работает.

Launcher очищает environment ещё перед bwrap, затем использует `--clearenv`.
Это защищает также environment PID-1 monitor в `/proc`.
Отдельные PID/network/mount namespaces не показывают процессы и сокеты работающего Host.
Корень namespace read-only. У дочерних процессов нет host descriptors, кроме логового stdout/stderr.
Сам `check.mjs` отказывает при прямом запуске вне `/sandbox` до проверки каких-либо credential paths.

При отсутствии bwrap или неудаче self-check product command не выполняется.
Live fallback запрещён. Исходный checkout и candidate остаются read-only.
Изоляция не доказывает корректность продукта или совместимость rollback.

## Проверенное выполнение

```sh
FRANK_SANDBOX_SENTINEL=SYNTHETIC_PARENT_ONLY \
OPENAI_API_KEY=SYNTHETIC_NOT_A_KEY \
python3 experiments/hot-update-20261101/sandbox/run.py \
  --repo /home/ubuntu/Projects/pi-durable-host \
  --candidate /tmp/pi-host-restart-candidate-20261101-alice-v2 \
  --previous /tmp/pi-host-restart-candidate-20261101-alice-v2 \
  -- node -e 'console.log("SANDBOX_COMMAND_PASS")'
```

Exit 0. Evidence: `/tmp/hot-update-sandbox-h38i88i2`.
Negative parent/child self-check PASS, затем `SANDBOX_COMMAND_PASS`.
`work/sandbox-check.json` содержит результат; `command.json` содержит точные mount/namespace arguments.
`run.log` содержит лог. Synthetic sentinel создан только вне production.

Первый setup остановился до команды из-за дополнительного PWD, который устанавливает bwrap.
Проверка теперь разрешает PWD только со значением `/scratch`.
Другие предварительные прогоны исторические; final evidence указан выше.

Product checks R4: NOT RUN. ISC-77 live PID/start/release comparison остаётся независимой проверкой.
Auth FAIL `fd6ac2598301430d98429a8a44dd7873` остаётся operator-only и не закрывается этим PASS.
Production activation NOT RUN.
