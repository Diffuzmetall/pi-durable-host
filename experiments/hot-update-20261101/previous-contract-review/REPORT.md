# PDH-33: независимая проверка прежнего контракта

## Вывод для Carol и Alice

Отсутствие чистой фабрики **не доказывает невозможность** отдельного adapter из прежних definitions. Ограниченный adapter остаётся технически возможным направлением, но совместимость ещё не доказана.

Минимальный путь: точная проекция прежних contracts, независимые semantic/effect validators и неизменный saved model из прежнего builtin catalogue. Ни текущий registry, ни пустые factories для этого не нужны. Однако адаптер должен доказывать полный выбранный состав прежнего release, а не разрешать все обнаруженные имена.

В этом output нет реализации adapter, положительной проверки SQLite или разрешения rollback. Carol остаётся единственным core writer. FAIL `a82349fb8abd46eea0602c78dd46f244` и `477df4a5cc274f7dbc95f34c80e17468` остаются открытыми.

## Границы и согласование

Task: `3a71318a9f0342ee8ed445d6e80db33b`, Dave, generation1. Изменены только отдельные исследовательские outputs под `previous-contract-review/`.

Alice подтвердила pinned root и разделение работы публикацией `9b683f7e496244e29cd0cf143588c395`, sequence539. Grace независимо подтвердила ограниченный путь публикацией `3642625759fa43f58caf14636465cfca`, sequence540. Dave передал Carol/Alice ранние результаты публикацией `73d584ca842944b8958bed7376847083`, sequence541. Прямой ответ Carol к snapshot543 не получен; её core ownership не менялось.

Product, sealed artifacts, критерии, live Host, credentials и configuration не изменялись. Артефактные модули не импортировались. Исследование не запускало старый service, factory, Harness, Store или provider. Скрипт читает source как текст и использует установленный TypeScript только как parser.

## Точные входы и воспроизведение

Root: `/tmp/pi-host-restart-candidate-20261101-alice-v2`.

Manifest `RESTART-CANDIDATE.json`: SHA256 `672b7e5e746dcabfbf5ca82a571cd35f328e457f717b64e2b852b3afa3931665`.

Команда:

```sh
node experiments/hot-update-20261101/previous-contract-review/inspect-pinned.cjs > /tmp/dave-pdh33-pinned-census.json
```

Результат: exit0; 166 выбранных файлов совпали со своими hashes в manifest. Parser обнаружил 17 вызовов `defineTask` и 43 вызова `defineDoc`/`defineDocFamily`. SHA256 результата: `03ad59532e56c5e65fc7fa2ee96fe3cdb9a15540f4eba4b0baced9b9681fecc6`.

Это source census, **не полный runtime registry**. Он включает definitions из optional модулей. Он не доказывает reachability, выбранные adapters или состав динамических MCP sources. Dave не повторял полную проверку 27124 файлов Alice.

Скрипт сохраняет точные expressions `initial`, scope, version, family, history и fork без выполнения. Нельзя заменять `initial` с UUID новым значением. Inspector восстанавливает существующие revisions; он не должен создавать отсутствующие документы.

## Реальные task definitions

Префикс `N/` ниже обозначает `node_modules/dpi-backend/dist/dpi-backend/src/native-profile/` внутри pinned root. Префикс `S/` обозначает `node_modules/@earendil-works/pi-durable/dist/`.

| Task | Version | Pinned source |
| --- | --- | --- |
| `pi.generation` | 1 | `S/harness/generation.js` |
| `pi.tool` | 2 | `S/harness/tool.js` |
| `pi.compaction` | 1 | `S/harness/compaction.js` |
| `durable.schedule` | 2 | `N/automation/schedules.js` |
| `durable.triggers.poll` | 2 | `N/automation/triggers.mjs` |
| `native-goal.notify` | 1 | `N/automation/native-goals.js` |
| `native-goal.monitor` | 2 | `N/automation/native-goals.js` |
| `native-goal.coordinate` | 2 | `N/automation/native-goals.js` |
| `local-host.goal-run` | 1 | `N/automation/goal-run.js` |
| `host.goal-operator` | 1 | `N/operator/goal-operator.js` |
| `hindsight.deliver` | 1 | `N/memory/hindsight/delivery.mjs` |
| `bb.subagent-anchor` | 1 | `N/subagents/tasks.js` |
| `bb.subagent-reporter` | 1 | `N/subagents/tasks.js` |
| `bb.subagent-courier` | 2 | `N/subagents/delivery.js` |
| `bb.subagent-attention` | 1 | `N/subagents/supervisor.js` |
| `bb.subagent-foreground` | 1 | `N/subagents/supervisor.js` |
| `delm.wait` | 1 | `delm-engine/index.js` |

Важно различать task `hindsight.deliver` и document `hindsight.delivery`. Schedule v1 имеет migration в прежнем source. Текущий terminal-only inspector требует точную version, поэтому не должен автоматически принимать schedule v1 как v2.

## Реальные document definitions

Все перечисленные documents имеют version1, кроме двух явно указанных исключений. Точные scope/history/fork/family и `initial` находятся в воспроизводимой описи.

| Группа | Kinds | Источник |
| --- | --- | --- |
| SDK agent/live | `pi.agent`, `pi.live`, `pi.inbox`, `pi.provider`, `pi.usage` | `S/harness/{agent,live,inbox,provider,usage}.js` |
| SDK task/codemode | `pi.tool.nested-call`, `pi.codemode.run`, `pi.codemode.journal`, `pi.codemode.store` | `S/harness/tool.js`, `S/codemode/codemode.js` |
| Admission | `durable-pi.existing-inputs` | `N/admission/input-policy.js` |
| Schedules/triggers | `durable.schedules`, `durable.triggers.watches` | `N/automation/{schedules.js,triggers.mjs}` |
| Goals | `durable-goals.native-goals`, `durable-goals.runtime` | `N/automation/{native-contract.js,native-goals.js}` |
| Goal session | `durable-goals.session-requests`, `durable-goals.session-boundaries` | `N/automation/session-goals.js` |
| Goal execution | `local-host.goal-runs`, `local-host.goal-execution`, `local-host.goal-human-input`, `local-host.goal-manual-tasks`, `local-host.goal-tool-model-usage` | `N/automation/goal-run.js` |
| Goal operator | `host.goal-operator.receipt` | `N/operator/goal-operator.js` |
| iii | `durable-pi.scope`, `durable-pi.requests`, `durable-pi.jobs` **v2**, `durable-pi.machine-controls`, `durable-pi.job-controls` | `N/iii/{native,jobs,control-domain,job-control}.js` |
| BB binding | `bb.native-child-binding` **v2**, `bb.native-child-binding-index` | `N/bb-binding/binding-store.js` |
| Subagents | `bb.subagents`, `bb.subagent-requests`, `bb.subagent-multicast`, `bb.subagent-parent-controls` | `N/subagents/{documents,requests,multicast,parent-control}.js` |
| Supervisor | `bb.subagent-team`, `bb.subagent-parent`, `bb.subagent-supervisor` | `N/subagents/supervisor.js` |
| Hindsight | `hindsight.namespace`, `hindsight.delivery`, `hindsight.context`, `hindsight.lifecycle` | `N/memory/hindsight/{delivery,extension,lifecycle}.mjs` |
| Filesystem ownership | `pi.external-directories` | `N/external-dirs/index.js` |
| Codex search | `codex-api.search-session` | `N/tools/codex/search.js` |
| DeLM | `delm.waits` | `delm-engine/index.js` |

Девять definitions не экспортированы отдельными tokens. Это четыре внутренних goal-run documents, runtime, два session-goal documents, binding index и operator receipt. Отсутствующий export усложняет прямой импорт, но не запрещает проверяемую проекцию точных definitions.

## Models: реальный доступный subset

Pinned файл `node_modules/@earendil-works/pi-ai/dist/providers/data/openai-codex.json` содержит ключ `/openai-codex-responses/chat:gpt-6.1-sol`.

Parser проверил metadata: `provider=openai-codex`, `id=gpt-6.1-sol`, `api=openai-codex-responses`, `type=chat`. Это тот же default model, который выбирает прежний operational profile.

Для cache-only подтверждения **этого** saved model не нужны пользовательские `models-store.json`, AuthStorage или `requireModel`. Наличие metadata не доказывает действительность credentials или возможность реального model call. Такие calls не нужны для immutable inspection.

Нельзя сопоставлять только modelId: одноимённые модели других providers не равны. Dynamic Antigravity selection без pinned catalogue следует отклонять. Отказ такой модели не требует отклонять builtin Codex selection.

## Семантические опасности и первый допустимый subset

Ниже приведены необходимые ограничения adapter, а не готовые validators или положительный verdict. Пока shape или эффект не доказаны, adapter должен отклонять состояние.

| Область | Проверенный источник и риск | Минимальный консервативный допуск |
| --- | --- | --- |
| SDK execution | `S/harness/live.js`, `inbox.js`; active generation/tools и queued input могут означать незавершённую работу | Нет generation/running tools; inbox пуст; все tasks terminal; submissions только done/unanswered; точная saved model |
| Hindsight delivery | `N/memory/hindsight/delivery.mjs:109–120`; terminal task может вызвать повторную постановку delivery | Отклонять любой intent, кроме доказанно завершённого acked; uncertain отклонять как неразрешённую неопределённость |
| Hindsight discovery | Тот же файл:80–108 создаёт новые intents из history даже при пустой очереди | Для первого subset отклонять enabled epochs/admissions; расширение требует проверки всех final boundaries и retain plan |
| Hindsight lifecycle | `N/memory/hindsight/index.mjs:70–97,117–142`; bind запускает reconciliation и usage | Отклонять незавершённые lifecycle/usage epochs; пустые либо доказанно инертные metadata проверять отдельно |
| Schedules/triggers | `N/automation/schedules.js:29–101`; active item может отправить новый input; tombstones хранят дедупликацию | Отклонять active/unknown items; completed/cancelled допускать только после проверки структуры и связей с terminal tasks |
| Goals | `N/automation/session-goals.js:510–554`; bind меняет interrupted goals и boundaries | Первый subset: пустые goal/runtime/session-request containers; любые непроверенные goal histories отклонять |
| iii commands | `N/iii/job-control.js:138+`, `jobs.js:39–40`; owner reconciles durable stop intents | Первый subset: нет jobs/requests/commands/bindings; requested или неизвестный phase отклонять |
| Subagents | Tasks courier/reporter/attention/foreground и документы parent control сохраняют доставку/authority | Первый subset: нет agents, pending requests, batches, commands или executions; неизвестные bindings отклонять |
| DeLM | `delm-engine/index.js:92–239,249–307`; wake request, dispatchCommitted и receipt участвуют в дедупликации | Первый subset: пустой waits; не угадывать безопасность sent/failed/cancelled и receipt acknowledgement |
| Filesystem ownership | `N/external-dirs/index.js`; сохранённые owners относятся к внешним ресурсам | Непроверенные owners отклонять; не обходить разрешённый workspace |

Это не предложение удалить документы, отменить задачи, сбросить queues или менять bindings ради PASS. Поддерживаемый disposable case должен естественно удовлетворять predicate после штатного drain/close. Если штатный профиль всегда создаёт исключённое состояние, subset пока непригоден; это требует отдельного точного доказательства.

### Воспроизводимый контрпример terminal-only проверки

Возьмите `hindsight.delivery` с intent.status=`pending`. Пусть intent.taskId указывает на terminal task. Условие `task.state.status === 'terminal'` не запрещает этот документ.

В прежнем `reconcileDelivery`, строки109–120, статус pending проходит фильтр. Terminal task добавляет intent в schedule, затем `tx.createTask(DeliveryTaskToken, ...)` создаёт новую задачу. Это вывод из точного source, не выполненный runtime test.

Даже пустые intents недостаточны: enabled epoch и подходящая assistant boundary создают intent раньше проверки terminal tasks. Следовательно, проверка schema/version или integrity без effect predicate не доказывает совместимость.

## Минимальный путь реализации для Carol

1. Зафиксируйте точную прежнюю composition для disposable case. Используйте pinned operational/native/DeLM definitions и явный список adapters/MCP sources. Не заменяйте старый `compiled/nico.mjs` новым build. Не разрешайте optional definitions только по наличию в source.
2. Выделите **неисполняемую проекцию контракта**, а не фиктивный runnable registry. Нужны task name/version, extension membership, точные document definitions и независимые pure validators. Не создавайте пустые factories. Не объявляйте эту проекцию способной исполнять tasks.
3. Предпочтите существующие exports там, где импорт транзитивно безопасен. Например, `ScheduleDoc` экспортирован; `registerDelivery` создаёт настоящий task definition, но прямой импорт требует проверки всей цепочки imports. Иначе извлеките точные expressions из pinned source с hash guards. Sealed root не меняйте.
4. Устраните лишнее требование runtime registry там, где инспектору достаточно readonly contract view. Текущий `inspectNativeCopy` читает только `registry.task(kind).definition.version` и extension membership. Его `ImportDocumentContract` уже хранит metadata без `initial`. Если тип требует executable RegistrySnapshot, Carol должна согласовать узкий readonly тип, а не использовать unsafe cast или stub phases.
5. Сохраните настоящий прежний profile identity. Сам inspector читает только `target.profile.id`; это не разрешает подставить пустую fake factory. При необходимости отделите trusted identity descriptor от callable factory с явной привязкой к hash прежнего profile.
6. Добавьте перечисленные effect predicates и строгий отказ неизвестных keys/statuses/versions/models. Не читайте current catalogue или auth. Не считайте `initial` schema полной проверкой реальных сохранённых значений.
7. В физическом sandbox проверьте реальный полный old profile после штатного disposable drain. Сохраните model/task/doc/request IDs. Получите согласованную immutable copy. Затем докажите readonly inspection и re-open того же data через точный прежний release. Faux model execution не выдавайте за проверку реального provider.
8. Выполните negative cases: pending memory intent, enabled discovery epoch, active schedule, pending goal/iii/DeLM dispatch, unknown model/extension/version. Изменяйте только disposable copies. Проверьте неизменность hashes и отсутствие resource opening у чистого preflight.

Этот путь не требует второго journal, восстановления backup поверх текущих данных или изменения sealed artifact. Он требует реализации и доказательства полного accepted subset. Проекция metadata без semantic validators недостаточна.

## Отдельный разрыв before-stop

Grace указала разрыв в публикации sequence540. Dave подтвердил source `release-return/return-release.mjs:69,99–112`.

`phase='before-stop'` вызывается без `copyDirectory`. Копия `data-backup` создаётся только после `confirmStopped()`, затем передаётся фазе `stopped-current-data`.

Нельзя направлять `inspectNativeCopy(mode=ro&immutable=1)` на живую SQLite или объявлять отсутствие копии доказательством совместимости. Для первого допуска требуется явный согласованный disposable snapshot **до** destructive boundary. После stop требуется повторная проверка фактически скопированных данных до switch. Если approved before-stop contract не предоставляет такой snapshot, wrapper должен отказать до stop.

## Статус доказательств

- PASS: manifest hash, hashes 166 выбранных source/model файлов, AST parsing и exact builtin model identity.
- PASS: независимый read-only разбор actual task/doc definitions и конкретного memory effect counterexample.
- NOT TESTED: транзитивная безопасность импортов отдельных exports, полнота runtime composition и рабочий adapter.
- NOT TESTED: semantic validators, disposable positive rollback, real provider calls и installed old-release continuation.
- BLOCKED: clean target отсутствует в переданных inputs; compatibility остаётся UNKNOWN.
- NOT RUN: production activation, live reload/restart и любые credential operations.
