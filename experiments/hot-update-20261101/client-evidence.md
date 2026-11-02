# R4 SDK/TUI: интеграционные проверки Eve

Карточка: `32704b9e97084752867f5c617d804527`. Статус: source integration PASS после S1 DONE194 и S2 DONE205. Независимая приёмка ещё NOT RUN. Production activation NOT RUN.

## Повторное использование

Старый terminal reload → существующий `session.reload()` и editor → минимальная адаптация результата и локального представления.

Прежний controller игнорировал counts из ответа и всегда объявлял общий успех. Ошибка `/reload` открывала `Cannot submit`, заменяла новый текст командой и забирала focus. Теперь controller сообщает applied counts, deferred без очереди, rejected, maintenance-required либо unconfirmed. Он использует существующий ответ и безопасную ошибку SDK. Он не повторяет mutation после потери ответа.

Если reload прошёл, но catalogue read отказал, controller сохраняет прежнее меню и сообщает обе стадии отдельно. Команда не создаёт model turn. TUI не заменяет новый draft текстом неудачной команды.

Старый editor сохранял текст только внутри процесса. Новый client process терял несохранённый draft. Узкий `EditorDrafts` сохраняет presentation checkpoint в существующем private cache. Cache уже разделён по Host URL, grant и session; checkpoint дополнительно разделён по conversation. Файлы имеют mode 0600. Атомарный rename сохраняет полный checkpoint при замене процесса.

Это не submission journal: загрузка draft никогда не отправляет его на Host. История и задачи остаются у прежнего Host owner.

## Команды и результаты

Все runtime-команды прошли negative parent/child self-check в sandbox Frank. Production credentials/data/tree отсутствуют; сеть разрешает только loopback. Faux provider — внешняя граница; Store/Harness/SQLite/HTTP/SDK/PTY настоящие.

```sh
python3 experiments/hot-update-20261101/sandbox/run.py --repo "$PWD" -- sh -c \
  'cd /repo/apps/terminal-adapter && npm test'
```

PASS: 43 tests, 0 fail, exit 0. Evidence: `/tmp/hot-update-sandbox-36m83jqb/run.log`. Набор включает lost ACK, receipt reconciliation, attention dialogs, draft/focus и no-replay regressions.

```sh
python3 experiments/hot-update-20261101/sandbox/run.py --repo "$PWD" -- sh -c \
  'cd /repo && python3 apps/terminal-adapter/tests/hot-reload-ui.py'
```

PASS: exit 0. Evidence: `/tmp/hot-update-sandbox-3e28ifcy/run.log`; результат: `work/tmp/eve-hot-ui-oqao4aoi/result.json` относительно sandboxRoot.

- Host PID 18 не менялся. Client PID изменился с 46 на 70. Это namespace PID из disposable fixture, не production.
- Session ID сохранился: `31e6bdc9-e1f4-4a67-a2e5-ab5e2b8823af`.
- Новый процесс восстановил точный Unicode draft. Суффикс и Enter отправили его без Escape. До явной отправки история не изменилась.
- Реальный `/reload` показал counts и обновил skill autocomplete. Отказ для client path сохранил focus.
- Faux model получил ровно три явных запроса. Reload и client reconnect не добавили ни одного запроса.

Первоначальный SDK `npm run check`: PASS. Первоначальный terminal `npm run check`: BLOCKED на чужом shared profile type, не на клиентском изменении. Evidence: `/tmp/hot-update-sandbox-6qm4ap9h/run.log`; TS2339 в `native-profile/profile.ts:282`: у inferred adapter type отсутствует `validate`. В checkout используется старая физическая dependency `@local/pi-durable-reload`; core owner согласует её с новым source. Shared profile Eve не меняет.

Первые PTY-прогоны выявили два дефекта самой fixture: чтение ещё пустого metadata-файла и слишком ранний ввод при открытом autocomplete. Metadata публикуется атомарно; fixture закрывает autocomplete перед новой командой. Отдельно controller теперь показывает applied notice после обновления каталога, а не до сетевого чтения. После этих исправлений финальный PTY прошёл.

`git diff --check` для четырёх изменённых существующих client source files: exit 0.

## Зафиксированные source SHA256

| Файл | SHA256 |
|---|---|
| `apps/dpi-sdk/src/api.ts` | `682ba1f3aa8951edfb64bbfee54ac7e8f75db6ba1a6d5bdda658e599c031ce2a` |
| `apps/dpi-sdk/src/client.ts` | `37c1274b3988d92d98530b361f885461db212a980dabaf8e73e5b7c4bccb8a26` |
| `apps/terminal-adapter/src/draft.ts` | `beb062d61d96c7dfb5654cf5ae54de6e33c6b8d1f1f82fbb598b6c5cf617ee67` |
| `apps/terminal-adapter/src/remote-controller.ts` | `0f1d7eb65d0887a1020852a45506b370658e34d8faf158320faa3cefb5765592` |
| `apps/terminal-adapter/src/ui/experimental/durable/tui.ts` | `8cfb913fd9040489a25bba5a77a69d1839db24c1acb30088b72162d764790844` |
| `apps/terminal-adapter/tests/hot-reload-client.test.mts` | `2f48765e46f5ff8fa919c86109342d81faf8c8174df7ac09d536eceff45b3462` |
| `apps/terminal-adapter/tests/hot-reload-ui-probe.mts` | `e320cadc6cf2171b5431156bb435b556848cfcfe3ebe0d5cc68d93f3485dde6b` |
| `apps/terminal-adapter/tests/hot-reload-ui.py` | `fa4199321d3f0da19a2b939a213d30ff98c83d1d7d7c10ac9ab34949a157d65b` |

## Итоговая интеграция после S1/S2

Снимок доски прочитан и подтверждён до sequence 315. S1 DONE194 и S2 DONE205 разрешили прежние source FAIL. Клиентские source hashes из таблицы выше повторно совпали перед завершением карточки.

PASS: `/tmp/hot-update-sandbox-b5qz985p/run.log` содержит 43 tests, 43 pass, 0 fail и успешный actual PTY. Sandbox negative self-check прошёл до команды. Точные argv сохранены в `command.json` того же каталога.

Этот запуск использовал текущий source core, включая S3 и trusted replacements. `NODE_OPTIONS` передал source-resolution hook всем disposable Node processes. Hook направляет `@local/pi-durable-reload` в `/repo/packages/durable-reload/src/index.ts` и сохраняет backend SDK identities. Это явный source probe, а не installed-candidate acceptance. Workspace dependency и live Host не менялись.

PTY evidence: `/tmp/hot-update-sandbox-b5qz985p/work/tmp/eve-hot-ui-ky7odzvi/result.json`.

- Host PID 657 сохранился; client PID изменился с 676 на 694.
- Session `1a416ef0-f93b-47f8-905b-1488847a65ed` сохранила history и точный unsent Unicode draft.
- Новый client восстановил focus и отправил draft только после явного Enter.
- Настоящий `/reload` обновил autocomplete и counts; отказ сохранил focus без Escape.
- Ровно три явных faux model turns; reload и reconnect не создали дополнительных turns.

PASS: SDK check и terminal strict typecheck завершились с exit 0. Evidence: `/tmp/hot-update-sandbox-pcr12lc7/{run.log,command.json}`. Временный terminal tsconfig использовал свежий `packages/durable-reload/dist/index.d.ts` вместо stale physical dependency. Исходный tsconfig и `node_modules` не менялись.

Первый интеграционный запуск `/tmp/hot-update-sandbox-lz40fb3x` отказал до tests: parser `NODE_OPTIONS` удалил quotes из inline data URL. Исправление кодирует hook как URL; повторный запуск выше прошёл. Это ошибка test invocation, не отказ продукта.

## Границы результата

Клиентская source integration завершена. Final installed candidate проверяют Grace и Heidi на одном immutable manifest. Alice должна включить свежую physical reload dependency; source hook не заменяет эту упаковку.

Этот отчёт не принимает весь hot-update корпус и не разрешает production activation. Прежний auth incident и отдельный blocker возврата полного release остаются открытыми.
