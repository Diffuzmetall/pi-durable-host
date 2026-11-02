# Restart repair: независимая QA

Дата: 2026-11-01. Владелец: Heidi. Итог независимой изолированной QA: **candidate verified / production activation NOT RUN**.

Это вердикт для конкретного неактивированного артефакта и перечисленных ниже faux сценариев. Вся командная приёмка не закрыта: открыты auth-инцидент и milestone source review Grace.

## Граница проверки

Production activation **NOT RUN**. QA не обращалась к production SQLite, bindings, credentials, личным banks или live models. Все процессы, HOME, БД и loopback-порты принадлежат disposable fixtures.

Работающий Host не останавливался и не перезапускался. Изолированный restart ниже относится только к дочернему faux backend. Проверка production 67 sessions/24 bindings, историй, backup и rollback требует отдельного разрешения.

## Проверенный финальный кандидат

Путь: `/tmp/pi-host-restart-candidate-20261101-alice-v2`. Первый артефакт без `-v2` не принят Alice из-за отсутствующего `provider.mjs`; он не использовался в этих результатах.

SHA-256 `RESTART-CANDIDATE.json`: `672b7e5e746dcabfbf5ca82a571cd35f328e457f717b64e2b852b3afa3931665`.

Все 27 124 файла кандидата сверены с manifest по SHA-256, uid и mode. Все 740 source/build записей совпали с checkout. Проверки до и после QA прошли, exit 0; итог: `/tmp/heidi-candidate-manifest-after.json`. Кандидат не собирался и не изменялся Heidi.

| Независимая проверка compiled candidate | Результат | Доказательство |
|---|---|---|
| Тот же заранее открытый PTY переживает restart собственного backend, сохраняет draft и принимает ввод без Escape | PASS, exit 0 | `/tmp/heidi-restart-pty-gq8itif4/result.json`; `/tmp/heidi-candidate-pty.log` |
| Клиент сам сверяет absent request, не переотправляет draft; retired key получает 409 | PASS, exit 0 | Тот же PTY result; native entries и новый faux answer |
| Реальные Store/HTTP, 67 sessions, 2s slow initializer и failed initializer | PASS, exit 0 | `/tmp/heidi-catalog67-mYGoRU/result.json`; `/tmp/heidi-candidate-catalog.log` |
| Точные 67 session/root IDs, provider/model rows и profile IDs сохранены при reopen | PASS, exit 0 | Тот же 67-session result; проверки полных rows и `session_profiles` |
| Lost ACK, SSE reconnect, backend restart, поздний retired request и detach без отмены работы | PASS, exit 0 | `/tmp/heidi-candidate-regressions-ozth0ssf/result.json`, test 12 |
| Точный transient selector снят; реальные attention dialogs и старый view защищены | PASS, exit 0 | Тот же result, test 13 |
| Native Goal/schedule, точные task/doc/request IDs, одна occurrence после reopen | PASS, exit 0 | Тот же result, tests 1–11; всего 13 PASS/0 FAIL |
| Packaging canonical accept/refusal physical engine | PASS по результатам Alice, не повторялось Heidi | Board `2e213db8bf0d4f45870a22f43bdac2ef`: packaging 6/6, реальные imports |
| Operational service с настоящими compiled Store/SDK | PASS по результатам Frank, не повторялось Heidi | Board `1d3720bc815345f2ac754cbbf4887bf3`: два запуска, SIGTERM code 0, exact service hash |

### Измерения финального 67-session прогона

- catalog open: 4.887 ms;
- первый пригодный session HTTP: 161.725 ms до завершения injected stall;
- all settled: 2025.761 ms;
- cooperative Store shutdown: 21.968 ms;
- peak profile factories: 2 при допустимом лимите 4;
- 66 ready/1 failed; cleanup 66 успешных profiles ровно по одному разу.

Измерения относятся к minimal/faux profile. Они не доказывают сроки восстановления production MCP или всех 24 bindings.

### Команды финальной QA

Рабочий каталог: `/home/ubuntu/Projects/pi-durable-host`. Следующая функция скрывает настоящий HOME, монтирует checkout read-only и создаёт отдельную сеть с loopback. Node 24 подставлен только внутри mount namespace; установленный Node и Host не меняются.

```sh
C=/tmp/pi-host-restart-candidate-20261101-alice-v2
Q=/mnt/experiments/restart-repair-20261101/qa
qa() {
  bwrap --ro-bind / / \
    --ro-bind /home/ubuntu/Projects/pi-durable-host /mnt \
    --ro-bind /home/ubuntu/.nvm/versions/node/v24.19.0/bin/node /usr/bin/node \
    --dev /dev --bind /tmp /tmp --tmpfs /home/ubuntu \
    --unshare-net --die-with-parent --chdir /mnt \
    env -i PATH=/usr/local/bin:/usr/bin:/bin LANG=C.UTF-8 "$@"
}
qa python3 "$Q/restart-pty.py" \
  --backend-entry "$C/node_modules/dpi-backend/dist/dpi-backend/src/main.js" \
  --terminal-entry "$C/node_modules/dpi-terminal-adapter/dist/main.js" \
  --backend-cwd "$C" --terminal-cwd "$C"
qa env HOME=/tmp/heidi-catalog-candidate-home node "$Q/catalog-67.mjs" \
  "$C/node_modules/dpi-backend/dist/dpi-backend/src"
qa python3 "$Q/candidate-regressions.py" --candidate "$C" --repo /mnt
python3 experiments/restart-repair-20261101/qa/manifest-check.py \
  --candidate "$C" --repo "$PWD"
```

Все четыре итоговые команды: exit 0. Regression adapter меняет только module specifiers и child backend entry/cwd в прочитанных существующих тестах; assertions остаются прежними. Original/adapted fixture hashes и полный Node command сохранены в его `result.json`.

Подготовка sandbox сначала завершалась до тестов из-за `/workspace` symlink, отсутствующего mountpoint и read-only `/dev/null`. После исправления namespace-команды эти setup ошибки устранены. Первая подготовка regression adapter также остановилась на собственной проверке преобразования import; она исправлена до запуска тестов. Это не отказы product candidate.

### Ключевые SHA-256 compiled candidate

| Файл относительно кандидата | SHA-256 |
|---|---|
| `node_modules/dpi-backend/dist/dpi-backend/src/main.js` | `6dd554fb7507916c3c7b407f35b8b446a1b13361badeb280489a21315adcc3fa` |
| `node_modules/dpi-backend/dist/dpi-backend/src/store.js` | `4d85a397faa407367e739f4befee07d1b50faf273f268f6dd9f72049ce7b4847` |
| `node_modules/dpi-backend/dist/dpi-backend/src/http-server.js` | `fd7cd03d209eaceea42c19c90b9b2d38ae61d9ea0b1d1a93b0ca99e6a5a4bdd1` |
| `node_modules/dpi-backend/dist/dpi-backend/src/routes.js` | `f5ba244629a36e6c187d20a69e4d53cd5f2690a4ab5125e589f79eedaea43a76` |
| `node_modules/dpi-terminal-adapter/dist/main.js` | `7bafbf72c7f53bc6f0ef3be9c33bcffd3aaeda1790ea99bb59d9c4b2518c6e46` |
| `operational-service.mjs` | `5643afccd8d8f9f3f1136c3a1a5689731ca1381027fb1c7a95fbb25a7ae49a2c` |

PTY before/after code tree digest совпал: `0d01033a1ad8d5accc6d5fda86f82c49ef90da4c9fed611396b456eb681c55ac`. Остальные файлы, включая физический engine и dependencies, покрывает полный manifest check.

## История предварительных source проверок

| Проверка | Результат | Команда и доказательство |
|---|---|---|
| Заранее открытый настоящий PTY, offline submit, восстановление черновика и новый ответ без Escape | PASS, exit 0 | `python3 experiments/restart-repair-20261101/qa/restart-pty.py --backend-entry apps/dpi-backend/src/main.ts --terminal-entry apps/terminal-adapter/src/main.ts --backend-cwd apps/dpi-backend --terminal-cwd apps/terminal-adapter`; `/tmp/heidi-restart-pty-zavdhv3n/result.json` |
| Клиент сам сверяет absent request; нет автоматической отправки старого текста; late key получает 409 | PASS, exit 0 | Тот же PTY runner; private journal и реальные HTTP/native entries |
| 67 sessions; injected 2s initializer; HTTP/fast session доступны до снятия задержки | PASS, exit 0 | `env -i PATH="$PATH" HOME="$(mktemp -d /tmp/heidi-home67-XXXXXX)" LANG=C.UTF-8 node --import ./apps/dpi-backend/node_modules/tsx/dist/loader.mjs experiments/restart-repair-20261101/qa/catalog-67.mjs "$PWD/apps/dpi-backend/src"`; `/tmp/heidi-catalog67-3b4hT8/result.json` |
| Restoring mutation и failed read отклонены; raw sentinel не попал в ответы; второй Store owner отклонён | PASS, exit 0 | Тот же 67-session runner |
| Все записи сходятся к 66 ready/1 failed; точные 67 session/root conversation IDs сохранены после reopen | PASS, exit 0 | Тот же runner; все IDs записаны в `result.json` |
| Ресурсы 66 успешных profiles закрыты ровно один раз | PASS, exit 0 | Тот же runner; cleanup counter |
| Final physical-engine package, lifecycle wrappers, lost ACK, attention dialogs, native task/document/schedule IDs | На момент source smoke NOT RUN; актуальный результат выше | Final candidate `alice-v2` проверен отдельно |
| Полное независимое review final diffs | NOT RUN | Владелец Grace |

### Измерения source 67-session fixture

- catalog open: 5.359 ms;
- first-session HTTP: 161.495 ms при незавершённом injected stall;
- all settled: 2039.467 ms;
- cooperative Store shutdown: 44.542 ms;
- peak profile factories: 2, не больше лимита 4.

Это измерения faux fixture, не production SLA. Counter измеряет profile factories; Store/HTTP assertions проверяют доступность и конечное состояние.

### Exact source hashes первого 67-session прогона

Перед и после прогона совпали:

| Файл | SHA-256 |
|---|---|
| `apps/dpi-backend/src/store.ts` | `12d5d87d3914215c15f2e06d778c9abcb566dbd743425433780af26e3a9e8344` |
| `apps/dpi-backend/src/http-server.ts` | `73c897812eabb0a73f42d8ff1ba0ba048a4a88c679e166b9a0c55912c3442f76` |
| `apps/dpi-backend/src/routes.ts` | `40215873d92e40eed37005833cf6fd4904144ab913666647dbe570306149f90d` |
| `apps/dpi-backend/src/runtime-profile.ts` | `18174d851104e4abc8373cf41b6f9db03c699a2d7427d45198472b4a3c5cb4a7` |

Первый PTY smoke фиксировал только entry hashes, а не весь dependency tree. Он не заменяет проверку точного финального артефакта. Runner дополнен before/after tree digest для следующего прогона.

## Открытый инцидент безопасности

Frank сообщил о запуске прежнего `operational-service.test.mjs` с настоящим HOME. По его публикации `fd6ac2598301430d98429a8a44dd7873` тест записал synthetic auth fixture в `/home/ubuntu/.pi/agent/auth.json`.

Heidi не читает и не восстанавливает credentials. Проверка оператором вне чата остаётся внешним блокером команды. Исправление теста не доказывает восстановление auth; инцидент нельзя закрыть зелёными product tests.

## Оставшаяся приёмка

Неактивированный `alice-v2` прошёл изолированную candidate QA. Source review Grace и решение по auth-инциденту остаются открытыми; QA не заменяет их и не закрывает весь run.

Production restoration 67 sessions/24 bindings, реальные MCP credentials/models, backup, rollback и live restart — **NOT RUN**. Их выполнение требует отдельного разрешения пользователя. Готовность production не заявлена.
