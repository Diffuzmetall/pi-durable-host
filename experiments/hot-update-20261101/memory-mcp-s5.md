# S5 Bob: memory/MCP checkpoint

Статус: memory и исправленный MCP source прошли проверку; Grace завершила независимый review, Eve завершила follow-up.
Общая S5 integration НЕ DONE. Production activation NOT RUN.

Memory output: `946fd8f696cf462eb8370b2af01b2b2a`.
MCP/resource source output DONE405: `3101d74151814d14871189b969a5a78a`.
Задача: `d0064aa2b112427aa729a8779ee3c70b`.
Parent: `0b4a7c033d0e437898c930f60b93de41`.
Shared input Carol: `096fddafcb6a4aa39b8f7df01fab8908`.

## Исправление MCP observer после независимого review

Grace обнаружила исключение observer после публикации поколения: FAIL `b4d6a08923a3499e9c0dc1c7ac37d6dc`.
Прежние source tests не проверяли этот путь.
Dave завершил единственное исправление: задача `b8586d3ed7e4464497a543b2367d43a3`, DONE434.
Existing `changed()` изолирует каждое синхронное исключение observer и продолжает уведомлять остальных subscribers.
Rejected promises асинхронных subscribers не входят в проверенный контракт `() => void`.

Bob прочитал полный отчёт `mcp-source/OBSERVER-REPAIR.md`, три sandbox logs и GREEN `command.json`.
RED sandbox `/tmp/hot-update-sandbox-2oh5f_fw` воспроизвёл два отказа на прежнем bundle.
Staged publish выбросил `FIXTURE_OBSERVER_FAILURE`; legacy reload скрыл его ошибкой `MCP_NOT_SENT`.
GREEN sandbox `/tmp/hot-update-sandbox-r_sfrnks` прошёл negative self-check, strict types и сборку.

Manager suite: десять PASS; обычная HTTP/session suite: четыре PASS; observer-injected session suite: четыре PASS.
Injection witness подтвердил пять managers и 26 уведомлений второго subscriber.
Обе HTTP suites оставили ноль SSE streams после final close.
Sandbox `/tmp/hot-update-sandbox-plw02vkw` подтвердил точное восстановление manager из полной patch.
Bob сверил hashes отчёта, manager, patch, нового bundle и provenance; повторные runtime tests не запускал.

Новый bundle: `mcp-source/build-observer/nico.mjs`.
SHA256: `4ac012202ca81685dd1e21fb1a7aa665cfe30a2b42cc08c37214118a89caca52`.
Provenance SHA256: `e4f780e57e6f4a62d7860a26f21be89a7cab1a3336f3d4e137c6dcfc2255e10d`.
Manager SHA256: `299f9f785a40c295c20c1bae8858c3bf2725e63aec3ec160e5a70793cdc2df39`.
Report SHA256: `6603207ae6f84a72ce4d36e297a7ba92164ee517b57ab6a53de6e87644962230`.

Alice должна упаковать исправленный `build-observer/`, а не прежний `build/`.
Прежний bundle сохранён только как baseline для RED regression.

На sequence435 новый FAIL Grace ещё оставался открытым.
Grace разрешила его публикацией `5fb3cb5858474ceb97ee88b710260881`, sequence445, только для исправленных hashes.
Независимый corrected-source review `954d799b7bb945b3b136e3f663e11d33` завершён DONE450.
Eve завершила follow-up `c86f7fc30e834857bb567ac93d80ca22`, DONE452.
Bob прочитал полные результаты review и follow-up; projection453 показывает ноль blockers source parent.
Source outputs готовы для завершения parent; общая S5 и installed acceptance этим не принимаются.

Eve обновила packaging pointer и сохранила staged interface без изменений.
Актуальный README SHA256: `bcf30ebfae43c84d5d21bb7fd1f705cd4d45d27622bcd476c0c34196742b323b`.
Актуальный fault report SHA256: `9d546dcf632cad01d892bd9137b23c4c3252c6d0e226064d4a4ee7319946afb7`.
Bob сверил оба hashes и прочитал актуальный packaging pointer.
Исходный API RESOLUTION Bob и независимый observer RESOLUTION Grace имеют разные границы.

## Предыдущий MCP source output и граница parent

Eve завершила standalone MCP dependency/session output DONE405.
Bob прочитал полный `README.md`, sandbox823mg6ri `run.log` и `command.json`.
Bob проверил соответствующие sections manager, adapter и session wrapper.
Current hashes sources, tests, bundle и provenance совпали с переданным evidence.
Повторная сборка и повторный запуск неизменённых tests не выполнялись.

Sandbox `/tmp/hot-update-sandbox-823mg6ri`: negative self-check и strict TypeScript PASS.
Manager suite дала восемь PASS; session/real HTTP suite дала четыре PASS.
Ноль FAIL; combined command завершился с exit0.
Existing owner поддерживает prepare/validate/publish/discard/drain без второго manager.

Двадцать healthy replacements сохранили один active transport; final close оставил ноль active transports.
Injected cleanup rejection остановил число generations на двух, сохранил видимую ошибку и запретил третью generation.
Unsettled factory сохранила ownership до закрытия позднего transport.
Принятый старый call завершился со старым result после публикации.
Mail identity/project/scope/revoke и отказ неподдерживаемых capabilities проверены.

Real fixture HTTP/SSE test выполнил 23 initializations и 21 explicit tool call.
После каждой успешной retirement оставался один SSE stream; final close оставил ноль streams.
Это transport/SSE census, не exhaustive OS census и не доказательство remote session DELETE.
Memory evidence по-прежнему описывает двадцать code replacements, а не двадцать новых external resources.

Полный staged contract и общая resource evidence matrix: `experiments/hot-update-20261101/mcp-source/README.md`.
README SHA256: `bf6cb3a2e4de788a22486495872253b6960b3d4976093785c7ba08e984ac0d2d`.
Новый bundle `mcp-source/build/nico.mjs` SHA256: `43a0cd83e7d92e35d7cbb10626c7cc7372fdb89c062627b86f389996422ee368`.
Provenance SHA256: `ae384bd347fb88e0a13a018aa414e38af1b5ca7bc5b32ee949d0f3984c5fedfc`.

RESOLUTION `d75a7c72efa1435db2081c98755f36fd` закрывает исходный source API FAIL `1dd7d48ae4964c0dbc9b8a1f04d82e38`.
Эта resolution относится только к новому проверенному dependency output.
Старый `compiled/nico.mjs` и accepted source не изменены и не объявлены исправленными.
Прежние RED probes ниже сохранены как история первоначального candidate.

Предыдущие source outputs передали evidence по всем четырём parent criteria для независимой QA.
Observer FAIL разрешён для исправленного bundle после отдельной проверки Grace и follow-up Eve.
Memory child DONE386 покрывает controller/banks/logs/subscription и reload/fork двух sessions.
MCP child DONE405 покрывает staged config/adapter, retained call, cleanup fencing и подготовку общего resource evidence.
Оба child DONE не закрывают общую S5, installed Host или integration profile/Store.

Carol wiring task `4af372ad856e49ac80eed2d72f18cc69` сохраняет прежнюю dependency на этот parent.
Native OPEN-task dependency update отказал; обход не применялся.
Завершение source parent снимает эту dependency без изменения criteria или ложного закрытия S5.
Carol должна подключить memory factory и MCP lifecycle с requireOwner и прежними native task identities.

MCP validation и publication выполняются в одном synchronous native commit без await.
До publication при отказе нужен discard; после publication нужен drain вне native transaction.
Cleanup failure не откатывает publication и запрещает следующую resource replacement.
Store initial-open, protected delivery kernel, native schema rejection и полный OS census остаются обязательными integration/QA границами.

Alice должна упаковать новый verified bundle с provenance/licenses и актуальными dependency metadata.
Grace и Heidi проверяют один immutable candidate; auth и release-return blockers остаются открытыми.
Production activation NOT RUN.

## Текущий memory output

Carol завершила shared loader task DONE372.
Итоговый loader обрабатывает относительные imports shared modules через existing per-file Jiti Babel transform.
Прочие behavior modules остаются fresh; fixed SDK identities сохраняют приоритет.

Carol выполнила actual Harness/SQLite probe в физическом sandbox `/tmp/hot-update-sandbox-0aq8k0j1`.
Negative self-check PASS; suites shared-modules, trusted-replacements и memory дали десять PASS, ноль FAIL.
Bob прочитал полный `run.log`, полный `command.json` и unchanged test source.
Bob проверил текущие hashes loader, memory modules и test: они совпадают с проверенным candidate.
Повторный запуск тех же tests не выполнялся.

Memory test проверил двадцать prepared replacements, default/explicit/fresh-target reload, forks и две sessions.
Он подтвердил прежние bank/log/controller/subscription identities и завершение pending delivery.
После закрытия session A продолжила работать session B без потери subscription.
Factory не публикует replacement до явной installation; `hindsight.delivery` остаётся прежним.
Это source-level factory acceptance, не integrated HTTP или installed package acceptance.

Evidence Carol: `experiments/hot-update-20261101/core-shared-modules.md`.
Report SHA256: `d0cfa3ff87ba741b3e0a1dd71f096dd8a4b8c1eb274c966896e8bc3d784d38e0`.
Loader SHA256: `a124ef50eca9d1eab6f8e307faaa49a90abde375b00999529a90a6836cae03f3`.
RESOLUTION `f60ecddf0b7b42ff855e01ac8537f030` закрывает только consumer FAIL `4e88928302fc450e8d075689ea90acbf`.

Fenced split сохранил все четыре parent criteria и существующие dependencies.
Memory child покрывает только memory criterion и передаёт готовую factory Carol.
MCP child сохраняет конфигурацию, drain/failure, resource census и полный критерий передачи результатов.
Оба source child теперь DONE; завершение их parent не означает завершение S5.

Прежняя попытка заменить wiring dependency отказала в native protocol.
Независимая проверка исправленного MCP observer завершена Grace; последующая проверка Eve также DONE.
Обход native dependency guard или дубликат wiring task не нужны.
Voice scope передан Dave FACT `3da5e529a13b481dbdbcb1098cf01850`; implementation task `a80ed0dc103644b497d43c697770d428` завершён DONE396.
MCP source FAIL разрешён для нового output; auth и release-return blockers остаются открытыми.

## Согласование доски

Alice разрешила независимый memory/MCP output в FACT `e453bfa7516c49f1a8db4769b803c216`.
Fenced split исходной S5 отказал: `only claimed task owner may mutate`.
Bob не изменял эту карточку через другой протокол.
Bob создал самостоятельный разрешённый output и занял его.

После S4 DONE320 Alice связала этот output с исходной S5 прямой dependency.
Все исходные criteria сохранены. Voice и общий census остаются в parent.
Bob не заявляет финальную приёмку или готовность всей S5.

## Memory: reuse и минимальная адаптация

Старый controller `createHindsightController.reload(target)` уже сохраняет host, bank binding, lifecycle и subscription.
`createSessionMemory` уже декорирует callbacks отдельными log paths.
Shared trusted replacement Carol DONE243 уже принимает `{extension,documents}` и защищает delivery kernel.

Пробел: обычный profile reload не вызывает memory reload.
Кроме того, `?reload=` обновляет entry module, но не весь dependency graph.
Fresh Jiti graph без стабильного log module создаёт другую AsyncLocalStorage identity.

Черновик добавляет `memory.prepareReload():Promise<NativeExtensionReplacement[]>`.
Метод вызывает прежний scoped controller со staging registry, не публикует definitions и не создаёт subscription.
Он возвращает только `hindsight` и существующий `ContextState.definition`.
`hindsight.delivery` остаётся у прежнего controller.

Controller использует существующий `loadFreshModule`, а не второй loader.
Он передаёт два стабильных namespace через предложенный sharedModules argument:

- `memory/logging-scope.mjs`: существующий AsyncLocalStorage owner.
- `memory/hindsight/vendor/pi.mjs`: закреплённый SDK с существующими config/client identities.

Собственные `extension.mjs`, `bridge.mjs` и их обычные зависимости должны загружаться свежими.
Shared loader и profile wiring принадлежат Carol.
На первоначальном checkpoint optional sharedModules argument ещё отсутствовал.
DONE372 и текущий GREEN выше заменяют этот прежний отказ.
Packaging и общий profile wiring ещё не приняты.

## Memory: проверки

Каждый runtime запуск сначала прошёл физический negative self-check.
Все исходники доступны sandbox только для чтения; HOME, данные и сеть изолированы.

- RED: `/tmp/hot-update-sandbox-zun1_rk3/run.log`, exit1.
  Actual Harness/SQLite fixture воспроизвёл отсутствие `memory.prepareReload`.

- Промежуточный probe: `/tmp/hot-update-sandbox-5c5wdtm3/run.log`, exit1.
  Двадцать fresh imports закреплённого vendor без shared modules превысили прежний test timeout.
  Это не результат census и не доказательство memory leak.

- Исторический RED: `/tmp/hot-update-sandbox-y3a1qn7f/run.log`, exit1.
  Первая prepared publication теряет recall для `PREPARED_A`.
  Assertion: `actual:false, expected:true`; native submission завершился, но recording endpoint не получил ожидаемый recall.
  Проверка теперь останавливается на первом функциональном отказе, а не после двадцати импортов.

Тот же fixture содержит проверки default/explicit/fresh-target reload, fork и двух sessions.
Он проверяет двадцать prepared replacements, тот же controller/paths и одну commit subscription.
После закрытия session A ожидается ноль её subscriptions.
Session B должна сохранить одну subscription.
На первоначальном checkpoint эти assertions не прошли весь путь.
После loader correction весь test прошёл в sandbox0aq8k0j1.

Это повторные code replacements вокруг стабильного memory owner.
Проверка не заменяет двадцать замен внешнего ресурса.

## MCP: baseline defect исправлен отдельно

Текущий wrapper ожидает возвращаемый canonical argument object от `authorizeAgentMail`.
Но закреплённый `compiled/nico.mjs` содержит исходный validation-only API и возвращает `undefined`.
Его guard по-прежнему проверяет точный project/actor и запрещённые administrative calls.

Изолированный baseline `/tmp/hot-update-sandbox-_nyb70m2/run.log` дал 2 PASS / 1 FAIL.
Existing-identity send отказал с `MCP_NOT_SENT` до transport dispatch.
Причина: wrapper обращается к `args.project_key` после void-returning validator.

Минимальная адаптация сохраняет возвращённые canonical args либо копирует уже проверенные исходные args при void-return.
Она не меняет policy, identity, registration token scope или bundle.

В `/tmp/hot-update-sandbox-y3a1qn7f/run.log` все три MCP baseline tests прошли.
Проверены session isolation, hidden tools, config-change denial, отсутствие автоматической регистрации и current grant revoke.
Recording transport получил synthetic token только для admitted home-project sender.
Ни credentials, ни настоящий Agent Mail не использовались.

## MCP: исторический контрактный blocker прежнего bundle

Probe `/tmp/hot-update-sandbox-j4ooy7ya/run.log` завершился с exit0 после negative self-check.
Он создал disposable empty-config owner и проверил реальные callable methods.

- Session owner экспортирует `sources`, `shellEnv`, `close`, `status`, но не reload/prepareReload.
- Existing Nico manager экспортирует `reload`, `reconnect`, `catalog`, `call`, `close`.
- Staged `prepareReload` отсутствует: `stagedReloadAvailable:false`.

Source evidence: `compiled/nico.mjs:229391–229457`.
Manager.reload изменяет slots, удаляет старые slots и запускает retirement в той же операции.
Его partial connection failure не означает общий rollback конфигурации.
Source evidence: `compiled/nico.mjs:229514–229532`.
Manager.close использует Promise.allSettled, затем очищает resource collections без передачи cleanup failure вызывающему owner.
Это статическое наблюдение; fault-injected cleanup runtime ещё НЕ проверен.

Source evidence: `session-mcp.mjs:33–114` и `native-profile/profile.ts:165`.
Snapshot и sources каталога захвачены при создании owner; native CodeMode bridge установлен один раз.
Простой вызов manager.reload внутри prepare нарушит прежнюю версию при последующем отказе registry compatibility.
Второй manager, замена Harness или обращение к private slots не реализованы.

Минимальный следующий контракт: существующий manager готовит candidate transport/catalogue без смены активных slots.
После проверки native bridge он публикует candidate и сохраняет ошибки retirement для повторного cleanup.
Следующая resource replacement должна отказать, пока прежний cleanup не завершён.
Нужен согласованный patch scope existing Nico manager и shared native bridge, а не новый manager или скрытая установка dependency.
U11/U12 и resource census пока BLOCKED; baseline PASS их не закрывает.

## Воспроизведение и provenance

Точные argv и mounts каждого запуска записаны в соответствующем `command.json`.
Общий launcher: `python3 experiments/hot-update-20261101/sandbox/run.py --repo "$PWD" -- ...`.
Memory source probe использует `--import tsx` и source alias для свежего `packages/durable-reload/src/index.ts`.
Это не acceptance физически установленной dependency; текущий checkout node_modules не менялся.
MCP suite: `cd /repo/experiments/sdk-host-cutover && node --test session-mcp.test.mjs`.

`node --check` прошёл для трёх изменённых runtime modules.
Scoped `git diff --check` прошёл.
Backend strict typecheck прошёл у Carol вместе с loader build.
Integrated HTTP/SDK memory reload и independent installed QA ещё НЕ проверены.
Полный runtime candidate и production Host не запускались и не переключались.
Открытые release-return FAIL и auth incident не разрешены.

## Первоначальные source SHA256

Memory hashes остаются актуальными.
Новые MCP hashes находятся в `mcp-source/README.md`; строки старого MCP bundle ниже описывают только первоначальный checkpoint.

```text
29ab5eddc28ac93c64774ae140130d441d75906635a7155a3f95ed830d623823 apps/dpi-backend/src/native-profile/memory/session-memory.mjs
e380519485ab5ee0f893c849eeebc1ed8728538afd6d42efa2a6965981b8e8f3 apps/dpi-backend/src/native-profile/memory/session-memory.d.mts
ae4f12a68e9bb89544bc21e8c0b2ca02711a5d26ca12f235c79c06168821deef apps/dpi-backend/src/native-profile/memory/hindsight/index.mjs
e93d5019ebce83749719aeca420907195ac38df112233ecc05eec3f5c5c0a473 apps/dpi-backend/tests/native-memory-reload.test.mjs
9e318d3e4130c7b3dc613b6b565c877efc7845577651cf1e8a50a3d4739a3a3b experiments/sdk-host-cutover/session-mcp.mjs
60ff998a5cc3f083df1a6a3f96733c438f771802a2fe2cbc42e31e3044c3742b experiments/sdk-host-cutover/session-mcp.test.mjs
2b7a49479a5a2909cfa321e685ab275b0606244fb0fdbc854f05aa278db089bd experiments/sdk-host-cutover/compiled/nico.mjs
```
