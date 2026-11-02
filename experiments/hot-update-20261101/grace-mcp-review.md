# Grace: MCP source milestone review

Задача: `49085548173747298b0dc13a60578412`.
Вход: Eve DONE405, публикация `95542d4d656c455e87169d46acd2e069`.

## Текущий вердикт PDH-45

SOURCE PASS для исправленного build-observer, не для baseline build/.
PDH-49 DONE450 независимо разрешила observer finding; PDH-53 DONE510 проверила startup/guard integration.
Author RESOLUTION `5fb3cb5858474ceb97ee88b710260881` явно разрешает FAIL `b4d6a08923a3499e9c0dc1c7ac37d6dc`.
Auth incident не закрыт. Финальное artifact review остаётся отдельной PDH-23.

Недостающая проверка PDH-45 завершена после повторного claim generation3:

- Все восемь fingerprints OBSERVER-REPAIR.md совпали с текущими файлами.
- Полная новая manager.patch независимо применена в памяти к pinned original; результат точно совпал с manager.ts.
- Adapter source, adapter patch и session wrapper сохранили прежние проверенные hashes.
- Corrected provenance содержит 2524 inputs, правильные manager/adapter result hashes и overlay manifest hash.
- Bundle hash и размер совпали с provenance: 10048895 bytes.

Исправление ограничено changed(): каждый синхронный observer изолирован, следующий subscriber продолжает работу.
Остальные generation/admission/cleanup boundaries прежнего review сохраняются.
PDH-49 уже проверила causal path, focused tests, RED/GREEN logs и wrapper injection.
PDH-53 проверила native rejection discard, initial-open cleanup, applied cleanup outcome и environment capture до async DCG evaluation.
Её отчёт: `experiments/hot-update-20261101/grace-startup-guard-review.md`.
Source/tests повторно не исполнялись: доказательства этих завершённых проверок остаются действительными.

Exact corrected fingerprints:

```text
299f9f785a40c295c20c1bae8858c3bf2725e63aec3ec160e5a70793cdc2df39 manager.ts
bb4998d2b709eaff13a034a3707a4aec35b683288d27a64500d647c64e1bd963 manager.patch
4ac012202ca81685dd1e21fb1a7aa665cfe30a2b42cc08c37214118a89caca52 build-observer/nico.mjs
e4f780e57e6f4a62d7860a26f21be89a7cab1a3336f3d4e137c6dcfc2255e10d build-observer/PROVENANCE.json
```

Paths относятся к `experiments/hot-update-20261101/mcp-source`.
RED2 FAIL и GREEN18 PASS принадлежат Dave; Grace проверяла source и evidence, не запускала product tests.

Async subscriber rejection вне проверенного синхронного договора.
Baseline build/ остаётся дефектным. Source closure не означает installed acceptance, полный OS census или release compatibility.
Прежние release/auth blockers сохраняются. Production activation NOT RUN.

## Исторический вердикт baseline до исправления

Ниже сохранены исходный finding, locations и fingerprints прежнего baseline.
Они не описывают текущий corrected build-observer.
CHANGES REQUESTED: один условный source finding P2 по новой staged publication.
Grace не запускала product tests, сборку, Host, transports или models.
Runtime-инцидент не заявлен; доказательство основано на текущем source control flow.
Production activation NOT RUN.

## Scope и целостность

Проверены `mcp-source/manager.patch`, `host-managed.patch`, полные исходники этих patches и `session-mcp.mjs`.
Прочитаны README, overlay metadata и существенные поля build provenance.
Длинный список build inputs обработан локальным JSON-парсером, без вывода полного списка.

Одиннадцать file hashes из README совпали с текущими файлами.
Provenance содержит 2524 source inputs и правильные overlay/result hashes.
Hash bundle совпал с provenance: `43a0cd83e7d92e35d7cbb10626c7cc7372fdb89c062627b86f389996422ee368`.
Обе patches применены проверкой строк в памяти к pinned preimages; результаты точно совпали с исходниками Eve.
Эта проверка не исполняет TypeScript, сборку или транспорт.

Первое сравнение с автоматически сформированным unified diff не совпало по представлению patch.
Последующая проверка применения каждого hunk подтвердила точный результат обеих patches.
Противоречия исходников или provenance не обнаружено.
Сборка заново не выполнялась; все 2524 исходных input bytes независимо не проверялись.

## F1 — P2: observer exception после публикации поколения

Классификация: behavior-activated новым staged path; прежний `changed()` уже допускал исключения подписчиков.
Доказательство: deterministic conditional source trace.
Публикация FAIL: `b4d6a08923a3499e9c0dc1c7ac37d6dc`.

Точные locations:

- `mcp-source/manager.ts:143–144`: публичная подписка onChange и вызов listeners без перехвата исключений.
- `mcp-source/manager.ts:334–344`: publish меняет slots, state, revision и retirement до вызова changed.
- `mcp-source/manager.ts:366–370`: legacy reload пытается discard после исключения publish.
- `experiments/sdk-host-cutover/session-mcp.mjs:155–159`: active обновляется только после возврата prepared.publish.

Условие: вызывающий код зарегистрировал throwing subscriber через публичный onChange.
Например, после ready зарегистрирован `() => { throw Error('observer'); }`.
Затем вызывающий код готовит, проверяет и публикует новый ticket.

Причинная последовательность:

1. validate успешно проверяет ticket.
2. publish заменяет активные slots и переводит ticket в published.
3. publish начинает retirement прежних slots.
4. changed вызывает subscriber; исключение выходит из publish после мутации.
5. Вызывающий bridge не достигает своей последующей publication, если она следует за manager publish.
6. discard уже не может вернуть прежнее поколение, поскольку ticket опубликован.

Это нарушает переданный договор синхронного nonthrowing publish.
В legacy reload вторичный отказ discard также маскирует первоначальное исключение subscriber.

В текущем session wrapper нет подписки onChange.
Поэтому рассогласование именно действующего Host или текущего wrapper не доказано.
Уязвим новый публичный staged API при указанном допустимом вызове onChange.
Необходимо отделить observer failure от результата commit либо доказать иной поддерживаемый контракт.
Eve должна проверить этот сценарий regression-тестом и передать новый hash; Grace tests не запускала.

## Остальные проверенные границы

- Preparation использует прежний manager, локальный next map и отдельные created slots.
- Unpublished descriptors не проходят сравнение с active slot при call.
- Discard закрывает created slots, а не retained active slots.
- После публикации retired slots запрещают новые вызовы; принятые вызовы учитываются через inFlight.
- Retirement ждёт inFlight и сохраняет cleanup failure; следующая preparation отклоняется.
- Adapter различает успешный cleanup, rejected close и deadline.
- Незавершённая transport factory сохраняется в transportFactories; поздний результат закрывается после abort.
- Session credentials привязаны к snapshot; Mail identity/revoke и void-returning authorization сохранены.
- Session validate повторно проверяет config и manager fence; publish требует предварительного validate.

Эти утверждения относятся к прочитанным source paths, а не к независимому runtime PASS.
Результаты двенадцати tests в sandbox823mg6ri принадлежат Eve.
Review не переносит их на final installed Host.

## Интеграционные ограничения

Carol ещё должна подключить lifecycle к native profile и Store initial-open.
Нужно вызвать discard при допубликационном отказе и drain после публикации вне native transaction.
Ошибка drain не означает отмену уже опубликованного поколения и не разрешает retry.
CodeMode replacement должен сохранить authority, requireOwner и native task identities.

Alice должна упаковать новый bundle, provenance и licenses, а не прежний compiled bundle.
Heidi должна независимо проверить native rejection, двадцать замен и OS resource census.
Общая S5, прежний MCP FAIL Bob, release rollback и auth incident этим review не закрываются.

## Проверенные fingerprints

```text
9708dee80bc46e0c15db7eb8b69d122d7311902645870d1316ebf5df8557b1bc manager.ts
24d206334961af0e751e4b0578536ac45bf88d598c2a66bef6310fe1c5ef7578 host-managed.ts
bccc1ce359064910b35309fb8cc9b8a54dd4b9a7813aaf96637591d592f6f88a manager.patch
f175cda9a255dbcdbc7e89348ba273702e6786d39d90c659eb8fb1e967e1bcdf host-managed.patch
773dfa8c44790794c12c122dabe39c79918d9900c09d5994475523a50fcdb8f8 ../../sdk-host-cutover/session-mcp.mjs
43a0cd83e7d92e35d7cbb10626c7cc7372fdb89c062627b86f389996422ee368 build/nico.mjs
```

Пути в последнем блоке относительны `experiments/hot-update-20261101/mcp-source`.
