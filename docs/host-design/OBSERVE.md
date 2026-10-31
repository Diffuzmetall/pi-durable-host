# OBSERVE: что уже есть и что нужно изменить

Дата исследования: 2026-10-28. Это локальные наблюдения и выполненные проверки, не acceptance будущего host. [ISA](../../ISA.md) задаёт критерии; [THINK](THINK.md) объясняет выбор решения.

## Статусы доказательств

- `SOURCE`: прочитан исходник. Поведение в production этим не доказано.
- `TEST`: сценарий выполнен на указанном кандидате.
- `HISTORY`: историческая запись, требующая актуальной проверки.
- `PROPOSAL`: будущее решение, а не существующая функция.
- `UNKNOWN`: проверка не выполнена.

## Disler уже скопирован

`SOURCE`: upstream [disler/durable-pi](https://github.com/disler/durable-pi/tree/37165c619573dbaf425463038bbffecfe576beec), commit `37165c619573dbaf425463038bbffecfe576beec`.

Рабочий fork находится в `/home/ubuntu/Projects/pi-durable-host`. Remote `upstream` указывает на оригинальный GitHub. Копия не shallow; доступная история HEAD содержит один commit. Собственного опубликованного remote нет. MIT license сохраняет copyright `2026 IndyDevDan`.

Исходники продукта после копирования не менялись. Это существенное ограничение формулировок: API и SDK существуют, наш profile на 1.4 и adapters ещё не реализованы.

| Уже есть | Проверенный источник | Ограничение |
|---|---|---|
| `dpi-backend`, Express `/v1`, каталог sessions, отдельная SQLite/Harness на session | `apps/dpi-backend/src/store.ts:129–227`; `routes.ts:26–105` | Многосессионность baseline не доказывает изоляцию наших интеграций |
| `dpi-sdk`: JSON types, HTTP/SSE client, client-side projections | `apps/dpi-sdk/src/api.ts`, `client.ts` | Пока нет подтверждённого контракта наших native capabilities |
| Настоящий remote TUI | `apps/dpi-tui` | Берём механизм подключения; наш UX не заменяем |
| Device/session/agent streams и slow-viewer handling | `apps/dpi-backend/src/streams.ts` | SSE IDs не являются durable replay cursors |
| Session lock | `apps/dpi-backend/src/store.ts:103–127` | PID lock нужно отдельно проверить на race/stale owner |
| Durable 1.0.3; OpenRouter/faux routing | `apps/dpi-backend/package.json`; `store.ts:301–329,499–559` | Сохранённые model IDs сейчас могут переписываться перед recovery |
| Device bearer | `apps/dpi-backend/src/auth.ts:5–22` | Не разделяет human, observer и delegated machine |
| Response cache для create retries | `apps/dpi-backend/src/idempotency.ts:5–24`; `store.ts:1156–1170` | Запись после операции, без body fingerprint; не доказано concurrent/crash-safe создание |
| Playground, proactive jobs и add-ons | `extensions.ts`, `jobs.ts`, `addons.ts` | Демонстрационные функции не становятся обязательными частями нового host |

`TEST`: в исследовательской копии `/tmp/disler-durable-pi.Y6jDCI` прошли `npm run check` и `npm test`: 10/10 tests. В наборе есть реальный SIGKILL/restart backend с faux provider. Логи: `/tmp/dpi-research-check.log`, `/tmp/dpi-research-tests.log`. Платные LLM и рабочие базы не использовались. Эти результаты относятся к 1.0.3; повторять неизменный baseline ради отчёта не нужно.

## Наш terminal host

Ниже перечислены пути исследованной установки, а не зависимости будущего продукта:

- `R` = `/home/ubuntu/.local/share/pi-durable/tui-releases/20261028-4rmMfRfc`.
- `H` = `R/host-lane/host/packages/coding-agent/src/experimental/durable`.
- `E` = `R/extensions-lane/packages`.
- `B` = `/home/ubuntu/Projects/master/experiments/pi-durable-1.4-upgrade/provider-lane/src`.
- `C` = `/home/ubuntu/Projects/master/experiments/pi-durable-iii-compat/release`.
- `I` = `/home/ubuntu/Projects/iii-test/iii-agent-lab/workers/durable-pi/src`.

`SOURCE`: `/home/ubuntu/.local/bin/pi-durable:3` выбирает release `R`. Его `host-lane/global-runtime.mjs:8–56` закрепляет SDK 1.4.0 и mappings native extensions.

`H/runtime.ts:112–165,201–325,626–656` содержит `openDurable`, controller/view, сборку registry/models/env/MCP, bind, resume и close. `H/main.ts:68–102` связывает жизнь runtime с TUI. В `H/runtime.ts:640–649` `submitTo` создаёт UUID и вызывает human submission. Неизменённый вызов не подходит для стабильного requestId от iii.

### Что сохранить в нашем полном profile

| Возможность | Owning source | Проверка переноса |
|---|---|---|
| Models/provider auth и сохранённый выбор модели | `R/.../src/core/model-runtime.ts:215–257,919–947` | Недоступная модель даёт ошибку, а не замену; credentials не сериализуются |
| DCG shell guard | `H/dcg/index.ts:82–153` | Fail-closed; optional Jev из demo не заменяет его |
| MCP + CodeMode | `R/host-lane/host/.pi/extensions/durable-mcp/index.ts:22–94`; `packages/durable/src/mcp-codemode.ts:34–101` | Nested authorization, unsafe replay и ограничения models сохраняются |
| Hindsight | `E/hindsight/src/adapter.mjs:71–85`; `index.mjs:12–17,119–122` | Отдельный controller, корректные cwd/bank/log paths, bind/close |
| Agent Mail | `H/runtime.ts:283–291`; MCP adapter `:45–53` | Identity и grant принадлежат session, не произвольному HTTP caller |
| Subagents и native parent-control | `E/durable-subagents/src/registry.ts`; `C/extensions-lane/packages/durable-subagents/src/parent-control.ts:178–307` | Существующие task/document IDs, policy revisions, parent authority |
| Goal, schedules, triggers | `E/local-host/src/automation.ts:20–123` | Продолжение принадлежит native tasks; human acceptance не подменяется |
| Web, Context7, Codex, Antigravity, history | `E/local-host/src/adapter.ts:25–90` | Inventory через те же integration factories; фикстуры вместо живых платных API |
| Skills/context и TUI | `H/skills.ts:7–15`; `H/main.ts`; controller/view types | Сохраняется discovery и основной TUI journey |

Inventory ISC-44 ограничен строкой external tools выше и skills discovery. При реализации тест фиксирует точные экспортируемые имена из выбранного profile manifest; отсутствующие credentials должны давать честное unavailable, а не фиктивный успешный вызов. Production provider authentication этим набором не проверяется.

`SOURCE`: `E/local-host/src/global.ts:6–13` содержит terminal argv gate. `automation.ts:20–55` требует Hindsight controller. Для standalone profile нужно отделить lifecycle/authority от memory; не добавлять фиктивную Hindsight-зависимость.

### Конкретные process-global препятствия

1. `E/hindsight/src/adapter.mjs:71–85` задаёт process-global log paths через `??=`. Следующий host наследует первые пути. Коллизия логирования подтверждена исходником; corruption БД/outbox не доказана.
2. `H/runtime.ts:283–291` меняет process env Agent Mail. Уже созданные MCP closures локальны; не утверждаем, что все открытые вызовы сразу сменят identity.
3. `R/host-lane/host/packages/coding-agent/src/core/http-dispatcher.ts:45–49,81–111` меняет global dispatcher/fetch и proxy env.

`openDurable({cwd})` поддерживает явный cwd; `process.chdir` в исследованном пути не найден. Блокер не в самом аргументе cwd. Буквального singleton `globalHost` также не найдено.

## BB и iii требуют сохранения своих договорённостей

`SOURCE`: BB registry использует `B/projection/host/session.ts`, а не одноимённый legacy host. Child input сохраняет `bb-child:<clientRequestId>`; root prompt/steer теряет clientRequestId (`:397–483`). `bootstrap/shared-host-client.ts:58–119` повторно проверяет права при reconnect и не переигрывает неизвестные команды. `history/history-sink.ts:20–62` использует authorized digest/CAS, включая lost-ACK retry без нового rebase.

`SOURCE`: iii привязывает job к namespace/config/native session (`I/session-binding.ts:28–101`). В `I/jobs.ts:23–49,64–101,137–179` есть fingerprint и native submission reconciliation, источник `iii`, полномочия `delegated`. `I/auth.ts:19–49` проверяет signed envelope; caller worker ID не является identity. Child-control сохраняет родителя, execution и policy revision. Immutable answerRef не равен process-local cursor или событию invalidation.

Изучение BB patch `provider-lane/compat/source/bb-0.47.1.patch` доказывает содержание patch, а не факт его текущей активации. Ни BB, ни iii не должны становиться вторым runtime после переноса.

## Pocket рассмотрен и исключён

Исследован upstream `v0.26.0`, commit `5e13a8b161226cbfef3e696c1bd31b8da110e381`, во временной копии `/tmp/pi-pocket-upstream.3OPCU4`. `SOURCE`: `src/server/app.ts:859–883` сам открывает SQLite и Harness; `PocketHost` — внутренний контракт расширений приложения, не remote binding к нашему host.

`TEST`: typecheck и 46 core tests Pocket прошли с faux. Это не подтверждает совместимость наших расширений. Пользователь после сравнения явно выбрал Disler. Pocket не входит в план ни как основа, ни как обязательный клиент.

## Что не доказано

- Disler + наш runtime profile на SDK 1.4.0.
- Изоляция двух полных sessions, crash-safe receipts и отсутствие authority bypass.
- TUI/BB/iii end-to-end на новом host и независимость обновлений пакетов.
- Возобновление выбранных старых task registries; совместимость миграции SQLite.
- Производительность новой интеграции и воспроизводимая установка на чужой машине.

Технический долг существующего host не закрыт этим исследованием. Исторический отчёт о 480 diagnostics — число сообщений проверки, не число доказанных runtime-багов. Рабочие зависимости в `experiments/**`, включая `release/` и `prepared/`, остаются нетронутыми.
