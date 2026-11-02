# Hot-update R4: независимая установленная QA

Дата: 2026-11-01. Исполнитель: Heidi.

**Статус: шесть preliminary probes PASS; final candidate ещё не передан.** Полная продуктовая приёмка — NOT RUN. Production activation — NOT RUN.

Этот отчёт не принимает новый продукт по прежним PASS. Задачи, owners и blockers принадлежат существующей DeLM-доске.

## Канон и полный корпус

- [ISA](../../../../ISA.md): SHA256 `d7aa17b05f8ae45251b9535c6317cc3080ea517e86d0b0baa4863b0a316bc9a3`.
- [PLAN R4](../../hot-update/PLAN.md): SHA256 `cdd8a4954758fffd7d7fd3f910e696538135d3e92801f289ae7fbda0e14e660e`.
- [HANDOFF](../../hot-update/HANDOFF.md): SHA256 `93b7b657eaa5087548d66698ccbff3bdc7b0545df69fb9c7b84ed975a6f098d3`.
- [Полный корпус QA](../../../../experiments/hot-update-20261101/qa/corpus.json) содержит U01–U20 и шесть дополнительных групп.

Матрица связывает все 36 новых leaves с конкретными наблюдениями. Родительские ISC-58/65 не заменяют leaves 58.1/58.2 и 65.1–65.3. Пока ни один новый leaf не принят.

## Preliminary: шесть режимов PASS, без final acceptance

Alice передала `/tmp/pi-host-hot-update-preliminary-20261101-alice-v1` в DONE553.
Manifest `RESTART-CANDIDATE.json`: SHA256 `18724c7afeffda96d63b10c57ca77e1c280598f6fd0c6f60e778e5402c78e73a`.
Статус artifact: `PRELIMINARY_NOT_ACCEPTED`; activation не выполнялась.

[Индекс preliminary evidence](../../../../experiments/hot-update-20261101/qa/PRELIMINARY-RESULTS.json) содержит точные пути result, hashes fixtures и ограничения.
Все шесть успешных режимов относятся к одному digest.
Каждый sandbox подтвердил parent/child negative checks, loopback-only и недоступность production paths.
Каждая проверка integrity сверила все 27129 files до и после исполнения.

| Режим | Результат | Независимое наблюдение или ограничение |
|---|---|---|
| Core | PASS, exit 0 | 100 code swaps; busy phase/schema fences; hidden hook; settings/context/skills; nested JS/TS; effect/reopen; missing artifact |
| Resources | PASS, exit 0 | 20 MCP replacements после прогрева; стабильные FD/children/handles/listeners; не весь ISC-70 |
| Backend | PASS, exit 0; 71/71, skipped 0 | 13 frozen авторских suites; supplementary, не независимая приёмка |
| PTY | PASS, exit 0 | Client-only replacement, точный Unicode draft, история/focus; обновлённое меню; реальное предупреждение cleanup |
| DeLM | PASS, exit 0 | Настоящий pending native wait пережил publication; один wake; прежние task/wait/request/receipt IDs |
| Hot rollback | PASS, exit 0; 5/5 | Frozen авторские native/boundary fixtures; не полный release-return |

Core сохранил PID/startticks, обе sessions и roots.
DeLM использовал только disposable board, не действующую доску команды.
PTY сохранил Host PID/startticks/session/root/Harness и выполнил ровно три явно отправленных faux model turns.

### Ошибки QA и проверенные исправления

Первый backend запуск `/tmp/hot-update-sandbox-ul4hfdm_` завершился exit 1.
Staging не перенёс `helpers.ts`; generated provider modules не находили installed `dpi-backend`.
Runner теперь переносит frozen helper, меняет только его import suffix и задаёт scratch TMPDIR внутри staged root.
Исходники всех tests/helper сверены с `sourceFiles`; assertions не удалены.
Повторный backend запуск: `/tmp/hot-update-sandbox-ha3vimgt`, PASS 71/71.

Первый PTY запуск `/tmp/hot-update-sandbox-dnbgyg70` сохранил draft/history/focus, но не показал `heidi-menu`.
QA profile не задавал `options.skills`; продукт включает skills только при этой опции.
Fixture теперь задаёт явные sandbox roots и вызывает `readResourceSettings`.
Исходное требование увидеть настоящее меню не изменено.
Повторный запуск `/tmp/hot-update-sandbox-p2tsdkow` завершился PASS.

Дополнительный PTY запуск `/tmp/hot-update-sandbox-ia11fjyh` проверил retirement warning через реальный backend → SDK → renderer.
Fixture внедряет исключение после настоящего drain установленного MCP owner с пустым набором servers.
Renderer показал applied warning без rollback/retry; новая skill осталась в настоящем меню.
Текст частного исключения не появился в renderer.
Этот fault не доказывает отказ настоящего transport retirement или запрет следующего поколения.

QA-tool regression прошёл RED на отсутствии helper, затем GREEN 14/14.
Логи: `/tmp/heidi-prelim-tools-red.log`, `/tmp/heidi-prelim-tools-green.log`.
Продуктовый код не изменялся; все runtime изменения fixture остались в физическом sandbox.

### Ресурсы: ограниченный положительный результат

Baseline после прогрева: FD 29, children 0, handles 2, listeners 1+1.
После каждого из 20 replacements эти значения совпали с baseline.
Последняя выборка не удерживает прежние registry snapshots по WeakRefs.

RSS вырос с 342904832 до 372744192 bytes; heapUsed — с 70817184 до 76554664 bytes.
Стабильные OS counts и нулевые registry WeakRefs не доказывают отсутствие иных удерживаемых объектов.
Для полного ISC-70 нужны attribution и voice/memory cohorts; verdict остаётся OPEN.

### Граница preliminary результата

Полный U01–U20/36-leaf corpus, release-return и restart regressions ещё не приняты на final artifact.
Preliminary hot rollback не заменяет независимый полный rollback corpus.
Grace review и все final observations должны ссылаться на один final manifest.
Release-return и auth FAIL остаются открытыми; production activation — NOT RUN.

## История подготовки

Следующие разделы сохраняют подготовительные проверки и прежние baseline RED до preliminary запуска.
Их формулировки NOT RUN описывают тот момент; текущие preliminary результаты приведены выше.
Они не заменяют final acceptance.

## Проверенная часть подготовки

Файлы находятся в `experiments/hot-update-20261101/qa/`.

| Файл | Назначение | Фактическая проверка |
|---|---|---|
| `corpus.json` | Полный фиксированный корпус и точные assertions | 26 групп, все 36 leaves; digest ISA/PLAN совпал |
| `evidence-gate.py` | Проверка полноты независимых наблюдений и provenance | Отсутствие runtime evidence даёт BLOCKED, а не PASS |
| `candidate-manifest.py` | Повторная проверка всех файлов sealed artifact | На alice-v2 сверены 27124 files до и после baseline probe |
| `installed-core.mjs` | Реальные Store/Harness/SQLite/HTTP/SDK/ToolTask; busy, phase/schema, discovery, recovery и stress | На alice-v2 прежняя версия воспроизвела busy refusal; новые S2/S3 сценарии только syntax checked |
| `run-core.py` | Запуск probe из scratch без записи в artifact | Sandbox execution exit 1; manifest совпал до и после |
| `installed-pty.py`, `installed-pty-host.mjs` | Установленный native owner и настоящий PTY/editor; client-only replacement, меню и focus | На alice-v2 воспроизведено отсутствие checkpoint несохранённого draft; дальнейшие проверки не выполнены |
| `installed-delm.mjs` | Независимый installed Host/SDK/native ToolTask и disposable board | На старом alice-v2 создан настоящий pending wait; SDK reload отказал из-за активной Durable task. Новый R4 ещё NOT RUN |
| `installed-regressions.py` | 13 backend suites и отдельный installed hot rollback с boundary fixtures | На alice-v2 source-freeze mismatch получил отказ до запуска Node; artifact integrity PASS до/после |
| `installed-resources.mjs` | 20 post-warmup MCP replacements через installed owner и SDK; OS census и retention samples | На alice-v2 native MCP call v0 прошёл; reload сохранил старый каталог v0, поэтому census не достигнут |
| `production-baseline.py` | Только read-only identity, launcher targets и unit hashes | Baseline получен; финальное сравнение ещё NOT RUN |
| `test-preparation.py` | Тесты QA-инструментов, не продукта | 13/13 PASS, включая отказ шести probes вне sandbox, AST import validation и сохранность assertions |

Команды подготовки:

```sh
node --check experiments/hot-update-20261101/qa/installed-core.mjs
PYTHONDONTWRITEBYTECODE=1 python3 experiments/hot-update-20261101/qa/evidence-gate.py \
  --isa ISA.md --plan docs/host-design/hot-update/PLAN.md
PYTHONDONTWRITEBYTECODE=1 python3 experiments/hot-update-20261101/qa/test-preparation.py
```

Все три команды завершились с exit 0. Последняя версия QA-инструмента прошла 13/13 тестов. JS syntax checks и Python AST checks прошли.

Transitive JS/TS и hidden-base hook probes ещё не исполнены на продукте. Тесты самого QA-инструмента не доказывают выполнение U01–U20 или новых ISC.

## Baseline RED на прежнем immutable alice-v2

Артефакт: `/tmp/pi-host-restart-candidate-20261101-alice-v2`.
Manifest: `RESTART-CANDIDATE.json`, SHA256 `672b7e5e746dcabfbf5ca82a571cd35f328e457f717b64e2b852b3afa3931665`.

Это прежний restart candidate, не новая сборка R4. Frank sandbox task `f911f78ce78443b4a25b17de6f5367e5` был DONE до запуска.

```sh
TMPDIR=/tmp python3 experiments/hot-update-20261101/sandbox/run.py \
  --repo /home/ubuntu/Projects/pi-durable-host \
  --candidate /tmp/pi-host-restart-candidate-20261101-alice-v2 --timeout 420 -- \
  python3 /repo/experiments/hot-update-20261101/qa/run-core.py \
  --manifest /candidate/RESTART-CANDIDATE.json \
  --digest 672b7e5e746dcabfbf5ca82a571cd35f328e457f717b64e2b852b3afa3931665
```

Exit 1. Evidence: `/tmp/hot-update-sandbox-783037x_/`.

- `work/sandbox-check.json`: parent/child negative checks PASS до product import.
- `work/tmp/heidi-r4-core-a2DlYF/result.json`: настоящий native ToolTask v1 начал работу.
- SDK reload отказал: `Cannot reload while Durable tasks are active`.
- `work/tmp/heidi-r4-stage-f0wybmk0/result.json`: все 27124 artifact files совпали до и после.
- Исполненная версия `installed-core.mjs`: SHA256 `3013370cdf2659668c7e889d427d9a34352e64d19cba0bcd1b49ac1358699812`.

После отказа fixture освободил только собственный tool gate и закрыл собственные ресурсы. Начатый v1 завершился. Stress, hidden-base, dependency и rollback проверки этот запуск не достиг.

Первый запуск создал evidence внутри временного каталога context-mode; инструмент удалил этот каталог после возврата. Его логи не используются как доказательство. Повторный запуск выше сохранил evidence через явный `TMPDIR=/tmp`; внутри sandbox остаётся отдельный scratch TMPDIR.

Внешние границы здесь faux: model, synthetic credentials и пустой MCP transport. Реальные границы: native profile, Store, Harness, SQLite, HTTP, SDK и ToolTask. Нет live providers, личных banks или production DB.

## PTY baseline RED на том же alice-v2

`installed-pty.py` использует упакованные native profile, Store/Harness/SQLite/HTTP и настоящий terminal entry. Это отдельный Heidi probe, не PASS авторского UI test.

```sh
TMPDIR=/tmp python3 experiments/hot-update-20261101/sandbox/run.py \
  --repo /home/ubuntu/Projects/pi-durable-host \
  --candidate /tmp/pi-host-restart-candidate-20261101-alice-v2 --timeout 150 -- \
  python3 /repo/experiments/hot-update-20261101/qa/installed-pty.py \
  --manifest /candidate/RESTART-CANDIDATE.json \
  --digest 672b7e5e746dcabfbf5ca82a571cd35f328e457f717b64e2b852b3afa3931665
```

Evidence: `/tmp/hot-update-sandbox-wpwr7p40/work/tmp/heidi-installed-pty-h80l_yu9/`.

- Sandbox self-check PASS. Настоящий редактор подключился, показал историю и Unicode draft.
- `result.json`: FAIL `exact unsent Unicode checkpoint`; старый terminal не сохранил draft до отправки.
- `info.json.result`: native owner штатно закрылся; один faux model turn, тот же Harness/root.
- `manifest-before.json` и `manifest-after.json`: все 27124 files совпали с прежним digest.
- `screen.bin`, `host.mjs` и raw result сохраняют исполненную версию fixture и её hashes.

MCP вернул `MCP_MAY_HAVE_RUN` до окончания команды. Повторный запуск не выполнялся; сохранённые result и manifest сверены после завершения. Первый запуск в другом sandbox остановился на отсутствующем `--candidate` аргументе QA validator; аргумент исправлен до этого прогона.

Client replacement, новое меню, focus и отсутствие дополнительных model turns ещё не проверены на новом R4 candidate. Этот RED подтверждает различие нового требования и прежнего restart fix; прежний QA PASS не отменяется.

## Подготовка S2/S3 после передачи Carol

S3 output `e2ecd2a81fc043d280fe1ec2c760bc61` получен DONE212; receipt прочитан и подтверждён. Источник интерфейса: `experiments/hot-update-20261101/core-s3.md`. Авторские source PASS не переносятся в независимую installed QA.

`installed-core.mjs` дополнен следующими сценариями:

- Настоящая native phase удерживает v1; следующий checkpoint исполняет v2 с прежним task ID.
- Несовместимая task version получает `maintenance-required` до публикации.
- Открытый model generation сохраняет старую offered schema; required addition отказана, optional addition принимает ранее выданный call.
- Следующий PromptInput получает новые AGENTS/skills; отдельный проект B сохраняет собственный контекст и каталог.
- Settings disable, bad JSON, skill removal и adapter inventory проверяются через SDK; ошибка сохраняет прежний snapshot.
- Принятый unsafe effect прерывается только закрытием disposable owner; publication/reopen не должны повторить действие.
- Missing installed artifact должен оставить сохранённые SQLite task rows неизменными до resume/reconciliation.

Эти новые сценарии пока прошли только syntax/QA-tool checks. Они ещё не исполнены на новом immutable artifact и не принимают ISC. Полный persisted-document, resource, DeLM и rollback corpus остаётся незавершённым.

## Подготовка независимого installed DeLM probe

`run-core.py --probe delm` использует тот же integrity/staging wrapper, что core probe. `installed-delm.mjs` открывает installed Store/Harness/SQLite/HTTP/SDK.
Обычный native ToolTask создаёт pending wait; SDK reload публикует следующую совместимую engine version. Следующая native фаза должна показать новый marker.

Probe сравнивает session/root/Harness, wait/task/request IDs и native receipt. Повторный reload отправленного wait не должен создать второй wake.
Engine меняется только в scratch-копии sealed product. Внешние model/credentials/MCP — faux; Python board и native delivery настоящие.

Frank передал curated Python board root `/tmp/frank-delm-source-ao8tjhv2` в DONE260. Он монтируется sandbox как `/previous`.
Live board и bindings не используются. Probe сохраняет отдельный manifest/digest тестового входа; это не product manifest.

Baseline RED на старом alice-v2: `/tmp/hot-update-sandbox-90mybg6u/`, exit 1.
`sandbox-check.json`: PASS. Настоящий native ToolTask создал один pending wait на disposable board.
SDK отказал при публикации v2: `Cannot reload while Durable tasks are active`.

Evidence: `work/tmp/heidi-r4-stage-ddbtej7p/result.json` и `work/tmp/heidi-installed-delm-xmyb8q/result.json`.
Исполненный fixture SHA256: `5e077701bc52ac68432b631de3b0d5951fa14ca8530629233a1935b298625e04`.
Все 27124 artifact files совпали до и после с прежним manifest. Настоящие новые v2/send/receipt assertions ещё не достигнуты.

Ранние fixture FAIL исправлены, без изменения продукта:

- `/tmp/hot-update-sandbox-3y5_snxb`: старый package не экспортирует `loadFreshModule`; probe теперь читает исходные tokens обычным ESM import.
- `/tmp/hot-update-sandbox-ychdw46d`: wrapper потерял native factory metadata; `Object.assign` сохраняет её.
- `/tmp/hot-update-sandbox-887s9xq5`: scratch-копия сохранила read-only mode; writable стал только её `index.js`, не installed artifact.

После последнего runtime запуска добавлены только provenance полей wait/model count и manifest Python fixture. Эти изменения проверены статически.
Это не продуктовый PASS R4. Full DeLM revoke/authority/fault coverage и ресурсный корпус ещё требуют подготовки.

## Дополнительные installed regressions

`installed-regressions.py` запускает 13 существующих suites против упакованных modules. Источник каждого test должен совпасть с `sourceFiles` final manifest. Literal product imports адаптируются к `/candidate`; assertions сохраняются. Runner отказывает при неизвестном parent import.

Это повтор авторских сценариев, не независимая приёмка и не замена observations Heidi. Проверки самого adapter входят в 11/11 QA-tool tests.

Пробный запуск на старом alice-v2 завершился exit 1 за 18.6 секунды:

```sh
TMPDIR=/tmp python3 experiments/hot-update-20261101/sandbox/run.py \
  --repo /home/ubuntu/Projects/pi-durable-host \
  --candidate /tmp/pi-host-restart-candidate-20261101-alice-v2 --timeout 420 -- \
  python3 /repo/experiments/hot-update-20261101/qa/installed-regressions.py \
  --manifest /candidate/RESTART-CANDIDATE.json \
  --digest 672b7e5e746dcabfbf5ca82a571cd35f328e457f717b64e2b852b3afa3931665
```

Evidence: `/tmp/hot-update-sandbox-411d2ahj/work/tmp/heidi-installed-regressions-k2p2y24g/result.json`.
Sandbox self-check PASS. Runner отказал до Node: `Test source differs from final source freeze: apps/dpi-backend/tests/hot-update-core.test.mjs`.
Все 27124 files совпали до и после с прежним manifest. Это ожидаемый preflight отказ на старом freeze, а не продуктовый дефект R4. На новом final artifact этот набор ещё NOT RUN.

После этого запуска source adapter и core probe используют физическую nested dependency: `node_modules/dpi-backend/node_modules/@local/pi-durable-reload/dist`. Alice подтвердила этот layout в DONE247. Root duplicate не требуется.
Исполненная выше версия regression runner имела SHA256 `904703aa393a5b8bb495d41662c7ca03f9e718b6979412e5cd6c9de819691aa5`.
Последующие изменения проверены статически и QA-tool tests; новый продуктовый запуск ещё NOT RUN. Новый runner сохраняет собственный SHA256 в result.

`installed-regressions.py --suite rollback` повторяет frozen Alice native/boundary fixtures. Оба helper imports и копирование CLI перенаправляются на `/candidate`.
Режим `ARTIFACT_SOURCE=1` запрещён. Assertions сохраняются; собственные QA-tool tests проверяют обе адаптации.
На новом final artifact горячий rollback ещё NOT RUN. Release-return требует отдельного интерфейса Frank и не входит в этот режим.

## Подготовка S5 после source handoff

Доска прочитана и ACK521. S5 source output Bob завершён в DONE519; это не установленная приёмка Heidi.
Grace DONE510 и Frank DONE514 проверили отдельные startup/guard и wrapper lifecycle boundaries.
Текущий wrapper уже передаёт `discard/drain` через spread. Дополнительный продуктовый patch не нужен по этим данным.

К supplementary runner добавлены MCP/profile, memory/profile, resource lifecycle и shared-module suites.
MCP imports направлены на installed `session-mcp.mjs` и `compiled/nico.mjs`, не на checkout build.
Каждый source test по-прежнему требует совпадения с final `sourceFiles`. Assertions и число test cases сохраняются.

AST parser прежнего build compiler проверяет настоящие imports, не исполняя исходники.
Он отличает generated `../version.mjs` module от неизвестного настоящего parent import.
Обычный и dynamic imports, export и defective Nico path проверены отдельными отказными тестами.

Новые подготовительные проверки: 13/13 PASS, syntax PASS, corpus 26 групп/36 leaves PASS.
Логи: `/tmp/heidi-qa-s5-check-0.log`, `/tmp/heidi-qa-s5-check-1.log`, `/tmp/heidi-qa-s5-check-2.log`.
Это проверки QA-инструмента, не продукта R4.

### Независимый resource probe и baseline RED

`run-core.py --probe resources` открывает реальный installed Host/SDK/native ToolTask и session MCP owner.
После прогрева он выполняет 20 MCP replacements с реальными локальными HTTP calls.
После каждого drain probe закрывает собственные idle connections и сравнивает OS resources с именованным baseline.
Он записывает FD targets, children, handles, listeners, RSS/heap и WeakRefs прежних registry snapshots.
RSS и WeakRefs требуют отдельного анализа удержания объектов; этот probe не принимает весь ISC-70 автоматически.
Voice/memory resource boundaries не входят в его заявленное покрытие.

```sh
TMPDIR=/tmp python3 experiments/hot-update-20261101/sandbox/run.py \
  --repo /home/ubuntu/Projects/pi-durable-host \
  --candidate /tmp/pi-host-restart-candidate-20261101-alice-v2 --timeout 90 -- \
  python3 /repo/experiments/hot-update-20261101/qa/run-core.py --probe resources \
  --manifest /candidate/RESTART-CANDIDATE.json \
  --digest 672b7e5e746dcabfbf5ca82a571cd35f328e457f717b64e2b852b3afa3931665
```

Exit 1. Evidence: `/tmp/hot-update-sandbox-xzyy1laj/`; parent/child negative self-check PASS.
`work/tmp/heidi-installed-resources-h0eRmC/result.json` содержит один настоящий MCP effect v0.
SDK reload не обновил каталог: ожидался `RESOURCE_VERSION_1`, получен `RESOURCE_VERSION_0`.

Probe штатно закрыл собственный owner; 20-cycle census до этой ошибки не достигнут.
Это RED прежнего alice-v2. Этот запуск не проверял новый R4 candidate.

`work/tmp/heidi-r4-stage-4jathnxy/result.json` подтверждает прежний digest до и после.
Все 27124 files совпали; исполненный fixture SHA256 `04f9f2a64355fecdff0dc795567f307f2692be9e02414aead2e945adc29f46fb`.
Новый immutable R4 и положительный release-return по-прежнему не переданы. Финальные продуктовые проверки остаются NOT RUN.

## Read-only production baseline

[Baseline JSON](../../../../experiments/hot-update-20261101/qa/production-baseline.json) содержит только identity и hashes.

- PID `2310878`; startticks `157652417`.
- Start: `Sun 2026-11-01 18:27:29 MSK`; service active.
- Точный launcher target: `/home/ubuntu/.local/share/pi-durable-host/extensions/delivery-recovery/20261101/operational-service.mjs`.
- Зафиксированы SHA256 основного user unit и трёх drop-ins.

Baseline script не подключается к Host HTTP и не открывает SQLite/auth/config.json. Он не вызывает service mutations. Для ISC-77 требуется финальное сравнение после всей QA; один baseline не закрывает критерий.

## Release-return: конкретный недостающий input

Carol завершила read-only исследование `c1ea492605ef4d6fa37d26b66910295f` в DONE269. FACT `118df99a6a51480bad90269cf59b6ef0` фиксирует unknown compatibility.
В DONE291 Carol передала общий `inspectNativeCopy(source,target)`, без adoption/resume. Авторская source проверка не принимает полный прежний release.
Точный чистый target прежнего полного profile отсутствует; его нельзя подменить текущим registry. `Store.open`/`Harness.open` не заменяют read-only preflight.

Нужны target прежнего release и два автономных closure. Пока независимый положительный release-return BLOCKED.
Отказ неизвестной совместимости не принимает ISC-74/78 и не разрешает restore старой БД. Frank сохраняет исходные критерии release task.

## Что ещё требуется

- Новый named immutable R4 artifact и digest от Alice; прежний alice-v2 сохранить.
- Установленный полный корпус U01–U18 и maintenance-отказы U19/U20 на одном final manifest.
- Реальные 100 code swaps и 20 resource replacements с post-quiescence census и RSS attribution.
- Hot rollback и release-return на актуальной совместимой disposable DB; записи после switch нельзя терять.
- Faults: lost ACK, cleanup error, incompatible state, missing artifact, startup failure, stop refusal и foreign targets.
- PTY client-only reconnect и затронутые restart/readiness/cleanup/owner/no-replay regressions.
- Независимый source verdict Grace на том же final digest.

Source fixtures старой QA находятся в `experiments/restart-repair-20261101/qa/`. Их прежние PASS не переносятся; необходимые сценарии повторяются на новом артефакте.

Auth FAIL `fd6ac2598301430d98429a8a44dd7873` остаётся отдельным operator-only инцидентом. Синтетические PASS не закрывают его. Production activation запрещена даже после полного candidate acceptance.
