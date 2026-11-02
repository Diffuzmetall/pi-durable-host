# iii worker: запуск и проверка 31 октября 2026

## Результат и границы

**Подписанный read-only маршрут iii engine → штатный worker → Host прошёл проверку в `2026-10-31T21:42:24.210Z` — 1 ноября, 00:42:24 МСК.** Engine показал все 17 функций adapter. Проверка не создала новых jobs и не отправляла запросов модели.

Это датированное доказательство, а не гарантия текущей доступности. После нового restart в 21:50 UTC Host был `failed`, worker — `inactive`. В 21:53 другая сессия восстановила службы; независимая read-only сверка в `2026-10-31T21:56:56.775822Z` подтвердила их `active/running` и `/healthz` 200. Signed `info` после этого восстановления заново не вызывался. Последнее состояние и история разделены в [общем статусе](host-status-2026-10-31.md#что-запущено-сейчас).

## Что было разрешено

Пользователь отдельно разрешил запустить **только** `pi-durable-iii-worker.service` и проверить регистрацию и read-only вызов через существующий engine. Разрешение не включало restart Host/engine, обновление runtime, изменение grants/configuration или модельный запрос.

До запуска были проверены активность и ожидаемые PID Host и engine. Запущена штатная служба, без второго adapter-owner:

```sh
systemctl --user start --job-mode=fail pi-durable-iii-worker.service
```

Команда завершилась с кодом `0`. Во время проверки Host и engine не перезапускались. Повторять команду автоматически по этому документу нельзя: сначала нужны актуальный service state, владелец и разрешённый scope.

## Проверенный runtime

| Компонент | На момент PASS в 21:42 UTC |
|---|---|
| Host | `active/running`, PID `434351`, loopback endpoint `127.0.0.1:41815` |
| iii engine | `active/running`, PID `3779510` |
| iii worker | `active/running`, PID `557496` |
| Worker entrypoint | `releases/c0019d7-sse1/node_modules/dpi-iii-adapter/dist/main.js` под `~/.local/share/pi-durable-host/` |
| Node.js | `v24.19.0` |
| iii-sdk worker/client | `0.24.6` из указанной установленной сборки |
| Native runtime из ответа `info` | `1.4.0` |

Имя старого каталога worker не означает, что он стал отдельным Host: adapter подключался к существующему backend. Код и зависимости установленного worker в этом действии не заменялись.

## Как проверено

1. Штатный `readWorkerConfig()` загрузил существующую private configuration. Через `IiiAdapter.verifyBinding()` проверена привязка к текущему Host.
2. Временный клиент установленного iii SDK подключился к тому же loopback engine и namespace. Он не регистрировал прикладные функции и отключил собственные OpenTelemetry/metrics.
3. Клиент подписал существующим Ed25519-ключом только payload `{}` для `durable-pi::info`. Ключ и токены читались локально; их значения, подпись и содержимое private config не включены в отчёт.
4. `durable-pi::info` вызван **через engine**, а не заменён прямым SDK GET. Ответ сопоставлен с прямой persisted binding.
5. Через `engine::functions::list` проверена регистрация всех ожидаемых функций. Это discovery, не вызов каждой из 17 операций.
6. Повторная `verifyBinding()` подтвердила неизменный `jobCount`; проверены PID и активность служб. Временный клиент закрыт через `shutdown()`. Штатный worker оставался работать на момент завершения проверки.

В ответе совпали `source`, `authority`, `sessionId`, `workspace`, `namespace`, `configHash`, `workerId`, `nativeSessionId`, `ownerConversationId` и `contractVersion`. Значения привязанных идентификаторов здесь не публикуются.

## Зарегистрированные функции

Все строки ниже присутствовали в registry; исполнен только `durable-pi::info`.

```text
durable-pi::info
durable-pi::start
durable-pi::task
durable-pi::run
durable-pi::follow_up
durable-pi::steer
durable-pi::requests::get
durable-pi::requests::result
durable-pi::controls::get
durable-pi::stop
durable-pi::controls::inspect
durable-pi::subagents::spawn
durable-pi::subagents::send
durable-pi::subagents::stop
durable-pi::supervisor::reply
durable-pi::conversations::follow_up
durable-pi::conversations::steer
```

## Evidence

Временные локальные файлы проверки:

- `/var/tmp/iii-readonly-20261031-7SkjoW/probe.mjs` — выполненный probe;
- `/var/tmp/iii-readonly-20261031-7SkjoW/result.json` — sanitized результат.

Они не входят в repository и могут исчезнуть при очистке `/var/tmp`. Ниже сохранён переносимый итог без credentials, подписей, private binding values и тел разговоров:

```json
{
  "checkedAtUTC": "2026-10-31T21:42:24.210Z",
  "pass": true,
  "signedInfoViaEngine": "PASS",
  "registeredFunctions": 17,
  "missingFunctions": [],
  "runtimeVersion": "1.4.0",
  "jobCountBefore": 1,
  "jobCountAfter": 1,
  "hostPid": 434351,
  "enginePid": 3779510,
  "workerPid": 557496,
  "hostAndEngineUnchanged": true,
  "modelSubmissions": 0,
  "probeExit": 0
}
```

`modelSubmissions: 0` относится к этому probe: он не вызывал `run`, `start`, continuation или другие операции создания работы. Это не глобальный счётчик модельных вызовов других сессий.

## Что произошло после PASS

Во время подготовки документации другая сессия сообщила о новом restart Host. Этот исполнитель restart не инициировал. Отдельная read-only сверка в `2026-10-31T21:50:15.752282Z` показала:

| Служба | Результат |
|---|---|
| Host | `failed/failed`, `MainPID=0`, `Result=signal`, `ExecMainStatus=9` |
| iii worker | `inactive/dead`, `MainPID=0`, `Result=success`, `ExecMainStatus=0` |
| iii engine | `active/running`, PID `3779510` |

Связанных `pi-durable` jobs в systemd на момент сверки не было. Дополнительная проверка `ExecStart` показала `~/.local/share/pi-durable-host/extensions/gippity-voice/0.1.0/operational-service.mjs` и drop-in `zz-gippity-voice.conf`. Это уже не тот entrypoint, которому относится прежний sealed-release acceptance; совместимость extension этим probe не проверена.

Остановка worker после потери Host не отменяет PASS предыдущего вызова, но требует новой проверки после восстановления. `ExecMainStatus=9` фиксирует завершение Host сигналом. TopazGlen позднее сообщил, что его `systemctl kill` попал на границу автоматического restart и завершил уже новый startup. Это не доказательство самопроизвольного crash adapter. Причина исходного shutdown hang остаётся открытой.

## Восстановление после следующего restart

TopazGlen сообщил о восстановлении в `2026-10-31T21:53:45Z`: явно запущены Host и iii worker, без изменения файлов, DB или configuration. По его проверке `/healthz`, authenticated `/v1/protocol` и `/v1/sessions` вернули 200, sessions — 61, unauthenticated `/v1/sessions` — 401. Эти auth/count результаты здесь отмечены как переданный отчёт, а не повторённая проверка этого исполнителя.

Независимая read-only сверка этого исполнителя в `2026-10-31T21:56:56.775822Z` подтвердила:

| Проверка | Результат |
|---|---|
| Host | `active/running`, PID `637699`, `Result=success`, `ExecMainStatus=0` |
| iii worker | `active/running`, PID `663985`, `Result=success`, `ExecMainStatus=0` |
| iii engine | `active/running`, прежний PID `3779510` |
| `GET http://127.0.0.1:41815/healthz` | HTTP `200` |

Это подтверждает восстановление служб и health endpoint, **но не повторный signed iii PASS на новых PID**. Причина shutdown hang не исправлена; GipPity Voice entrypoint не прошёл отдельную полную приёмку. Этот исполнитель во время документирования службы не запускал, locks не удалял и runtime/configuration не менял.

## Что осталось проверить

По последнему указанию пользователя работа ограничена обновлением Markdown. Повторный signed `info` после восстановления и диагностика shutdown hang не выполнялись; пункты ниже отложены, а не запущены. Последний срез служб — 21:56 UTC; нового runtime evidence при этом редактировании не получено.

- На восстановленном Host: persisted binding, engine registry и подписанный `info` на новых PID. Повторно запускать уже активный worker не нужно; новый stop/start требует актуального разрешения.
- Отдельно исследовать причину shutdown hang и подтвердить корректный stop/start на проверенном candidate, прежде чем объявлять lifecycle исправным.
- Отдельно, по согласованному scope: native request/receipt/result, retry с **тем же** request ID, ACK-loss, reconnect, interrupt и recovery без повторного native эффекта.
- Продолжение существующего разговора через `conversations::follow_up`: новый job через `run` не заменяет continuation.
- Модельный E2E, если он нужен для приёмки: точные provider/model и разрешение на такой запрос. Эта проверка его не выполняла.
- Общая миграционная приёмка и restore-copy rollback по [плану](host-design/PLAN.md). Ни регистрация 17 функций, ни один успешный `info` не закрывают весь milestone.

## Связанные исходники и документы

- [Общий статус и следующие шаги](host-status-2026-10-31.md).
- [Инструкция iii adapter](../apps/iii-adapter/README.md).
- [Worker и binding checks](../apps/iii-adapter/src/worker.ts), [signed admission](../apps/iii-adapter/src/auth.ts), [config boundary](../apps/iii-adapter/src/config.ts).
- [SDK iii API](../apps/dpi-sdk/src/iii.ts), [native HTTP tests](../apps/dpi-backend/tests/native-iii-http.test.ts), [adapter flow tests](../apps/iii-adapter/tests/native-flow.test.mjs).

Ссылки на tests показывают соответствующие исходники. Их наличие не означает повторный запуск test suites при этом документировании.
