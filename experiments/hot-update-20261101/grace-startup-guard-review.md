# Grace: startup и guard после staged MCP integration

Задача: `a5aa5d6dc2994316bb0e698edf210d64`.
Вход: Carol DONE483, `experiments/hot-update-20261101/core-mcp-profile.md`.
Вердикт: scoped source PASS. Подтверждённых новых findings в указанной границе нет.
Grace не меняла product source и не запускала product tests, Host или models.
Production activation NOT RUN.

## Точная граница

Проверены пять product files из отчёта Carol, новый MCP integration test и hash исправленного bundle.
Все семь hashes совпали с отчётом. Дополнительно прочитан owning lifecycle в `packages/durable-reload/src/index.ts`.
Навигация выполнена по текущему source и точным строкам, без вывода заключений из call graph.
Прежний observer review не повторялся; его resolution445 и corrected-review DONE450 остаются отдельными доказательствами.

## Причинные проверки

### Preparation и authority

`apps/dpi-backend/src/native-profile/profile.ts:107–126,173–179,293–328`:

- Existing requireOwner проверяет текущую policy и принадлежность conversation.
- Новый MCP bridge повторно использует requireOwner и source.authorize.
- Явная замена mcp-codemode отклоняется до подготовки MCP ticket.
- Profile готовит MCP на прежнем manager и не публикует ticket до общей проверки.
- Native validation и MCP validation выполняются до публикации.
- Ошибка последующей preparation вызывает discard MCP candidate.
- Ошибка discard сохраняет исходную ошибку через AggregateError.

Profile сохраняет nonthrowing publish как доверенный договор всех callbacks.
Source PASS не расширяет этот договор на произвольные callbacks третьих сторон.

### Отказ, публикация и drain

`packages/durable-reload/src/index.ts:64–128` и `apps/dpi-backend/src/store.ts:841–867`:

- Общий reload сохраняет fence до завершения drain.
- Read-only state checks и authority checks предшествуют синхронной публикации в native commit.
- Допубликационный отказ вызывает discard.
- После публикации drain выполняется вне commit.
- Отказ drain возвращает cleanupError, а не запускает discard или rollback.
- Store выдаёт только optional cleanup:failed, без private error payload.

Store не заявляет сохранение прежнего runtime при штатном cleanupError outcome.
Защита от следующего поколения после ошибки cleanup принадлежит прежнему MCP manager.
Произвольный бросок trusted publish после частичной мутации не покрыт обещанием rollback.
Это существующее ограничение интерфейса, а не новый подтверждённый finding.

### Initial-open и прежние startup gates

`apps/dpi-backend/src/store.ts:280–315,742–818,1872–1906`:

- Initial preparation проверяется и публикуется до открытия Harness.
- Ошибка до публикации вызывает discard.
- Ошибка после публикации не вызывает discard опубликованного ticket.
- Внешний catch выполняет closeRuntime и освобождает lock.
- closeRuntime пытается выполнить все owning cleanup stages и сохраняет ошибки.
- SharedState открывается до запуска session recovery.
- Recovery сохраняет четыре workers и отдельный результат каждой session.
- assertCompatibleState остаётся перед Harness.open.
- Saved model choices проверяются до resume.
- Closing Store не запускает resume и ждёт opening/recovery/reloads до закрытия ресурсов.

Весь initial-open не является read-only: preparation и каталог могут изменяться до persisted-state preflight.
Гарантия относится к положению assertCompatibleState перед Harness.open/recovery, а не к отсутствию любых startup effects.
При initial drain failure Store закрывает весь runtime и отклоняет открытие session; HTTP reload outcome здесь неприменим.

### Owning shell environment и DCG

`apps/dpi-backend/src/native-profile/profile.ts:229–234,307–317`, `apps/dpi-backend/src/session-env.ts:16–27`:

- Profile владеет одним session-local shellEnv object.
- Publication заменяет его значения и удаляет значения прежнего MCP environment.
- Memory log paths имеют последний приоритет.
- Cached guard сохраняет прежнюю identity.
- SessionExecutionEnv копирует environment для каждого invocation и запрещает ambient inheritance.

`apps/dpi-backend/src/native-profile/guards/dcg/environment.ts:195–207,242–270`:

- DCG вызывает captureEnvironment до первого ожидания evaluator.
- Nested env/spill records также копируются до ожидания.
- После allow guard передаёт тот же capture в inner executor без дополнительного ожидания.
- Повторный capture в SessionExecutionEnv.exec сохраняет inheritEnv:false и прежнюю копию.
- Уже принятая команда видит прежние values; новая команда видит новые values.

Это не замена DCG evaluator и не доказательство поведения установленного DCG binary.

## Grace проверила evidence Carol

Прочитаны полный `/tmp/hot-update-sandbox-4zu6fdqo/run.log` и полный `command.json`.
Лог содержит negative self-check PASS, 25 tests PASS и ноль FAIL.
Команда использует физический bwrap sandbox, source aliases и исправленный build-observer.
Grace прочитала focused rejection, failed-retirement, initial-open и environment-capture assertions.
Она не выполняла повторный runtime запуск.

Witnesses Carol: один owner, двадцать MCP replacements; memory сохраняет по одной subscription двух sessions.
Локальные endpoints, faux model и synthetic DCG fixture не доказывают external services или installed acceptance.
Operational DeLM wrapper проверяет Frank отдельно.
SDK/UI cleanup warning Eve также имеет отдельный output.
Ошибочное прежнее утверждение о потере callbacks wrapper не использовано: Carol и Bob явно исправили его.

## Hashes exact source gate

```text
8e8025115db43278fdc6f6676c15ed97c7cc0e0c1fda78152352898a3c9329b9 apps/dpi-backend/src/native-profile/profile.ts
7dea01e7bf3ccb2eeb929aa2f3f5b858369d9a2f0298a243d14798de99b49e94 apps/dpi-backend/src/runtime-profile.ts
8c4be0e0fcf6eb3190e489cb454f153c19c97abfe26950483b6e6e476f6fa2a8 apps/dpi-backend/src/store.ts
91ceb42d79ea4ae171928ac32852295102b75108edb6ebec0eddc30dc013e164 apps/dpi-backend/src/session-env.ts
04494aa2eeba53f1896b0dc6f9752ec888812285c3bf5eaca2530faf7710590f apps/dpi-backend/src/native-profile/guards/dcg/environment.ts
bdb9b4bbd6dd9e10533320e6defd0ce795c4f10ccc4b99ea363cc5ab499c481c apps/dpi-backend/tests/hot-update-mcp-profile.test.mjs
4ac012202ca81685dd1e21fb1a7aa665cfe30a2b42cc08c37214118a89caca52 experiments/hot-update-20261101/mcp-source/build-observer/nico.mjs
```

## Ограничения результата

Это source gate, не final immutable review и не приёмка S5 целиком.
Installed dependencies, release-return compatibility, полный OS census и auth incident здесь не проверялись.
Source aliases не заменяют same-manifest installed QA.
Прежние release/auth blockers остаются открытыми. Production activation NOT RUN.
