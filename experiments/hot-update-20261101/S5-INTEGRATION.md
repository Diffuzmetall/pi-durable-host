# S5: интеграция MCP, memory и voice — source output

Задача Bob: `0b4a7c033d0e437898c930f60b93de41`, generation3.
Результат: четыре критерия implementation-карточки проверены в указанной ниже границе.
Это передача source output для упаковки и независимой QA, не приёмка установленного R4.
Production activation NOT RUN.

## Проверенные входы

Projection515: все десять dependencies имеют DONE, relevant blockers отсутствуют.
Frank wrapper DONE514 и Grace startup/guard review DONE510 закрывают последние зависимости.
Receipt `delm-wake:2131`, range505→514, прочитан и подтверждён.
Bob сверил весь delta и изменения остальных полей с предыдущим receipt.

Bob прочитал итоговые отчёты и полный sandboxx5g7s2y7 run.log.
Лог содержит physical negative self-check PASS и один integration test PASS.
Bob также сверил 21 текущий source/test hash с отчётами Grace, Frank, Dave и Eve.
Все 21 hash совпали. Повторные runtime tests Bob не запускал.
Ранее проверенные producer logs сохраняют собственную атрибуцию и команды.

## 1. MCP configuration и adapter

Прежняя цепочка: session MCP owner → существующий Nico manager/adapter → native CodeMode bridge.
Пробел: manager публиковал изменения до общей native validation и скрывал ошибки retirement.
Исправление: тот же manager готовит candidate, проверяет его, публикует синхронно и освобождает прежние ресурсы после commit.
Второго manager или transport owner нет.

Source parent DONE460 и common profile/Store DONE483 проверяют следующие свойства:

- Новый catalogue отражает разрешённую конфигурацию; неподтверждённые capabilities и несовместимая native schema отклоняются.
- Принятый старый HTTP tool call завершается прежним результатом. Следующий call использует новый transport.
- Native task/root/guard identities сохраняются. Старый descriptor не начинает новый call после передачи admission.
- Mail identity/project scope сохраняются. Synthetic token проверяется только локальной fixture; registration и impersonation запрещены.
- Current revoke действует на сохранённых поколениях. Две sessions сохраняют изоляцию.
- Failed preparation или validation вызывает discard только неопубликованного candidate.

Исправленный observer bundle: `mcp-source/build-observer/nico.mjs`.
SHA256: `4ac012202ca81685dd1e21fb1a7aa665cfe30a2b42cc08c37214118a89caca52`.
Provenance SHA256: `e4f780e57e6f4a62d7860a26f21be89a7cab1a3336f3d4e137c6dcfc2255e10d`.
Старый `mcp-source/build/` сохранён как дефектный baseline; его нельзя упаковывать.

Observer repair DONE434: sandboxr_sfrnks, strict types и 18 tests PASS.
Grace явно разрешила observer FAIL публикацией `5fb3cb5858474ceb97ee88b710260881` только для исправленных hashes.
Асинхронные rejection произвольных subscribers не входят в проверенный синхронный контракт.

Common profile/Store: sandbox4zu6fdqo, isolation PASS, strict types PASS, 25 tests PASS, exit0.
Witness: один owner, 21 open, два явных call, 20 replacements.
Команды и exact source hashes находятся в `core-mcp-profile.md` и sandbox `command.json`.

## 2. Memory reload и fork

Прежняя цепочка: session-memory → прежний scoped controller → общий fresh loader → trusted replacement `hindsight`.
Пробел: обычный fresh import создавал другую identity logging scope и закреплённого SDK.
Исправление: прежний loader сохраняет shared module identities; controller готовит только reloadable callback.
Защищённый `hindsight.delivery`, controller, bank и session log paths сохраняются.
Второго logger или commit subscription нет.

Memory source DONE386 и common profile DONE471 проверяют default/explicit reload, fork и две sessions.
Sandbox0aq8k0j1: 10 tests PASS. Sandboxgcam7oix: isolation, strict types и восемь tests PASS, exit0.
Двадцать automatic replacements и один explicit replacement проходят через общий native profile.
Explicit replacement имеет приоритет; подмена delivery отклоняется без изменения registry.
У каждой живой session остаётся одна subscription; после закрытия A session B продолжает recall.

Последующий sandbox4zu6fdqo повторно проверил memory на текущем MCP/profile source.
Прежний profile hash из `core-memory-profile.md` описывает checkpoint до MCP wiring, а не итоговый profile.
Текущий profile hash подтверждён Grace и `core-mcp-profile.md`.
Это code replacements вокруг стабильного memory owner, не замены внешнего memory resource.

## 3. Voice operation и callback

Прежняя цепочка: GipPity Component/queue/audio lease → существующий fresh loader → resource-free audio callback.
Пробел: retained Component не должен заменяться ради обновления совместимого callback.
Исправление: callback меняется при общей publication; lease запоминает host принятой операции.
Component, Harness, controls, native service и HTTPS listener сохраняются.

Voice DONE396: sandboxxk9yf_t8, isolation PASS, два tests PASS, exit0.
Принятый controls.listDevices завершил synthetic helper v1 после publication v2.
Следующая операция использует v2. Некорректный callback сохраняет действующее поколение.
Двадцать reload сохраняют service identities; после каждого запроса fixture children равны нулю.

WhenIdle ждёт реальный lease; отмена наблюдателя не отменяет принятую операцию.
Callback reload не вызывает Component retirement, stopLan или close.

Sandboxep9xqqxi: isolation PASS, четыре tests PASS, включая прежний browser/HTTPS/shutdown путь.
Voice report сохраняет различие версий test и финальные integration/audio-host hashes.
Микрофон, PCM, WebRTC, внешний provider и сохранение pending browser stream не доказаны.
Synthetic audio helper проверяет локальный lifecycle, а не реальные устройства.

## 4. Cleanup, поколения и подготовленный census

Прежний reload lifecycle теперь различает discard до publication и drain после commit.
Failed drain означает applied с cleanupError, не rollback.
Manager сохраняет failed cleanup и запрещает следующее resource generation.
Store выдаёт HTTP200 с optional cleanup:failed без private error payload.
Cached shell guard сохраняется; invocation получает environment до async DCG evaluation.

Grace DONE510 проверила initial-open cleanup, обе причины failed discard и прежние startup gates.
Shared-before-recovery, assertCompatibleState перед Harness.open и saved models перед resume сохранены.
Grace не запускала runtime tests; 25 PASS принадлежат Carol.
Весь startup не является read-only. Trusted publication обязана оставаться nonthrowing.

Frank DONE514: sandboxx5g7s2y7, isolation PASS, один настоящий DeLM/Harness/SQLite test PASS.
Wrapper уже передавал discard/drain через spread candidate; product patch не понадобился.
Отказ wrapper вызывает discard; AggregateError сохраняет обе причины.
Drain выполняется вне native commit; nested commit проходит, конкурентный reload получает busy.
Failed drain оставляет v3 активным.

WaitTask8, request delm-wake:8 и submission11 сохраняются; generation одна.
Synthetic callbacks Frank не являются проверкой настоящего MCP retirement.

Eve DONE503: SDK/UI принимает applied cleanup failure и показывает постоянное предупреждение.
Терминал не заявляет rollback и не повторяет mutation. Старый ответ без поля остаётся совместимым.
Sandboxiid7h4qz: 43 tests PASS, actual PTY PASS и SDK check PASS.

Terminal typecheck в этом запуске отказал из-за stale physical SDK dist.
Финальный source typecheck sandboxq8q4vlof прошёл с полными SDK/core aliases.
PTY проверяет client wire contract через proxy, а не реальный отказ backend cleanup.

Подготовленные witnesses для независимой QA:

| Ресурс | Измеренное состояние | Граница доказательства |
| --- | --- | --- |
| MCP transports | 20 замен: 21 open, 20 close, один active; final close оставляет ноль active | Instrumented transports, не полный OS census |
| MCP failed cleanup | Два поколения, одна ошибка close, третье поколение запрещено | Логически unclosed fixture transports сохранены намеренно |
| MCP local HTTP/SSE | 23 initialization, 21 явный call; один stream после retirement, ноль после final close | Actual fixture SSE; remote DELETE не доказан |
| Common MCP/profile | Один owner, 20 replacements, сохранены task/root/guard IDs | Реальные Harness/Store/HTTP с локальным endpoint |
| Memory | 21 code replacement; одна subscription каждой session; B работает после A close | Стабильный controller, не внешний resource swap |
| Voice | 20 callback replacements; fixture children ноль, service/listener identities прежние | Synthetic helper, не microphone/provider |
| DeLM wrapper | Один native submission generation; IDs прежние после rejection и drain | Реальный disposable engine, synthetic resource callbacks |

Это подготовленный source census для четвёртого критерия карточки.
Полный ISC-70 остаётся обязательным для final same-manifest QA.
FD, все child/listener/producer counts, retained objects и warmed quiescent RSS/heap ещё не измерены вместе на установленном candidate.
Строки таблицы нельзя суммировать как один общий прогон или доказательство полного отсутствия утечек.

## Стабильные ссылки и hashes отчётов

Все пути ниже относительны `experiments/hot-update-20261101/`.
Exact argv, версии fixtures и source hashes находятся внутри соответствующих отчётов.

```text
fcae4427de921509369a5e97d2f37ec36a5161b4c3e0d32e192bb9db39bb6637  core-memory-profile.md
2022e5d2f7c44c13ee0f466c538cf45b96b55d918716375dbdaac0b088982388  core-mcp-profile.md
54390764f350eb4f4c6f449533a11dd0d6d19ba33446b511b558db90dccd64d2  voice-s5.md
fbfc1299da7f7c0922787d004b35f0a4c1f5c7126d7de57bccf1170a329a4790  grace-startup-guard-review.md
0ea7d80800b50fc931a75591b556a22c2165221afb58c659682043d196983b6e  client-cleanup-evidence.md
b307b1f1aa6e651a7153640f1838b57b23d94ec81c01ba9c91b5d0fb657133ac  delm-automation/WRAPPER-LIFECYCLE.md
```

`memory-mcp-s5.md` остаётся историей source parent DONE460.
Его старые BLOCKED/pending statements не отменяют последующие integrated outputs в этом отчёте.
Ошибочное утверждение о потере wrapper callbacks заменяют CORRECTION Carol488 и Bob496.

## Передача и открытые ограничения

Alice получает source output для S6, включая исправленный bundle, provenance/licenses и новый audio-host.mjs.
Рецепт packaging DONE500 уже проверяет эти inputs, но не заменяет финальную сборку.
SDK declarations и физическую dependency reload package необходимо пересобрать в новом immutable candidate.
Source aliases не доказывают установленную dependency и не разрешают изменение текущего node_modules.

Grace должна проверить final immutable candidate. Heidi должна проверить тот же manifest, U01–U20 и оба отката.
Включите полный ISC-70 census и затронутые restart-repair regressions.
Полный R4, installed acceptance, hot rollback и release return этим source output не принимаются.
Прежний полный NativeImportTarget остаётся UNKNOWN; switch запрещён.

Release FAIL477df4a5cc274f7dbc95f34c80e17468 и FAILa82349fb8abd46eea0602c78dd46f244 не разрешены.
Auth incident остаётся operator-only; credentials не читались и не исправлялись.
Production Host, live DeLM, installed release/config и production DB не изменялись.
