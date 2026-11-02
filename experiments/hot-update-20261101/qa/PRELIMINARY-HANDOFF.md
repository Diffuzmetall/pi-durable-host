# Предварительный artifact: интерфейс Heidi QA для Alice

Это самостоятельный интерфейс уже подготовленных probes, не завершение PDH-22 и не продуктовая приёмка.
Producer: Heidi, задача `845d395b3f6f46a481bfae8b44a672dc`.
Consumer: Alice, preliminary artifact `51fd9c043ac4480b83b47d33d8b31f15`; затем Heidi выполняет probes.
Результаты preliminary прогона не принимают финальный artifact с другим digest.

## Обязательный handoff

Alice передаёт абсолютный root отдельного immutable artifact, имя root manifest и его SHA256.
Предложенный root: `/tmp/pi-host-hot-update-preliminary-20261101-alice-v1`. Он ещё не считается переданным.
Нужно явно назвать artifact preliminary/not accepted, перечислить build commands, exits и отсутствующие проверки.
Прежний alice-v2 сохраняется без изменений. Production activation остаётся NOT RUN.

Manifest использует существующую схему, без нового протокола:

- `activated: false`.
- `files[relative] = {sha256, mode, uid}`: полный состав artifact, кроме самого manifest.
- `mode`: существующая строка `oct`, например `0o400`; `uid`: числовой владелец файла.
- `sourceFiles[relative] = sha256`: согласованные source/build/lock/test identities относительно repository root.

Manifest должен лежать непосредственно в artifact root. Обычно это `RESTART-CANDIDATE.json`.
Проверки запрещают внешние symlinks и сверяют каждый файл, права, владельца и полный состав до/после выполнения.
SDK/backend/terminal/reload builds должны происходить из того же source freeze.
Свежие SDK declarations обязательны: старый build не доказывает `cleanup: failed` и lifecycle outcome.

Сохраните существующие provenance поля recipe: `builds`, `baseLockSha256`, `dependencyProvenance`, `compiledBindingsProvenance` и `nicoBuild`.
`nicoBuild.sha256` должен соответствовать установленному `compiled/nico.mjs` и исправленному build-observer.
Проверенный bundle SHA256: `4ac012202ca81685dd1e21fb1a7aa665cfe30a2b42cc08c37214118a89caca52`.
Проверенный provenance SHA256: `e4f780e57e6f4a62d7860a26f21be89a7cab1a3336f3d4e137c6dcfc2255e10d`.
Нужны `compiled/NICO-PROVENANCE.json`, licenses и sidecars, которые уже включает recipe Alice.
Дефектный `mcp-source/build/` не является допустимой заменой.

## Физические entry points внутри artifact

Пути ниже задаются относительно `/candidate`, а не checkout:

| Consumer | Entry points |
|---|---|
| Все native probes | `node_modules/dpi-backend/dist/dpi-backend/src/{store,grants,http-server}.js` |
| Native profile | `node_modules/dpi-backend/dist/dpi-backend/src/native-profile/profile.js` и его полная dependency closure |
| SDK | `node_modules/dpi-sdk/dist/client.js`, JS/declarations одного source freeze |
| PTY | `node_modules/dpi-terminal-adapter/dist/main.js` и runtime closure |
| Reload | `node_modules/dpi-backend/node_modules/@local/pi-durable-reload/dist/index.js` и loader/registry/models closure |
| MCP | `session-mcp.mjs`, `compiled/nico.mjs`, provenance/licenses/sidecars |
| DeLM | `delm-profile.mjs`, полный `delm-engine/`, включая `index.js` |
| Hot rollback suite | `native-artifact.mjs`, `select-native-artifact.mjs` и их существующие зависимости |

Root dependencies Durable, pi-ai и chord должны разрешаться внутри artifact.
Внешние installed/home/checkout imports запрещены. `ARTIFACT_SOURCE=1` не допускается.
Operational wrappers и voice `audio-host.mjs` сохраняются по recipe, но сами по себе не доказывают voice acceptance.

## Frozen supplementary tests

`installed-regressions.py` задаёт точный список 13 backend suites в `FIXTURES`.
Для каждого файла `apps/dpi-backend/tests/<FIXTURES entry>` нужен совпадающий `sourceFiles` hash.
Нужны также два `ROLLBACK_FIXTURES`:

- `experiments/hot-update-20261101/packaging/artifact-selection.test.mjs`.
- `experiments/hot-update-20261101/packaging/artifact-native.test.mjs`.

Текущий recipe Alice уже включает backend tests и оба packaging tests в `sourceFiles`.
Дополнительного изменения recipe только ради этих 13 suites не требуется.
Runner сохраняет original/adapted hashes и не сокращает assertions.
AST parser использует уже установленный build compiler из read-only `/repo`; он не выполняет test source.
Это QA tooling, не источник продуктового implementation.

## Готовые команды потребителя

Команды выполняет Heidi после точного artifact handoff. Ни одна команда не использует live Host.
Каждый запуск сначала проходит физический parent/child negative self-check Frank.
`CANDIDATE`, `MANIFEST_NAME` и `DIGEST` берутся только из handoff Alice.
`TMPDIR=/tmp` сохраняет внешние evidence; sandbox сама задаёт отдельные HOME/data/TMPDIR.

### Core, schemas, discovery, recovery и 100 code swaps

```sh
TMPDIR=/tmp python3 experiments/hot-update-20261101/sandbox/run.py \
  --repo /home/ubuntu/Projects/pi-durable-host \
  --candidate "$CANDIDATE" --timeout 420 -- \
  python3 /repo/experiments/hot-update-20261101/qa/run-core.py \
  --probe core --manifest "/candidate/$MANIFEST_NAME" --digest "$DIGEST"
```

### 20 MCP resource replacements и OS census

Тот же launcher и параметры; inner command:

```sh
python3 /repo/experiments/hot-update-20261101/qa/run-core.py \
  --probe resources --manifest "/candidate/$MANIFEST_NAME" --digest "$DIGEST"
```

Probe измеряет post-quiescence FD/children/handles/listeners и сохраняет RSS/heap/WeakRefs для анализа.
PASS этих checks не заменяет весь ISC-70 или отдельный анализ удержания объектов.

### Настоящий PTY и client-only reconnect

Тот же launcher; inner command:

```sh
python3 /repo/experiments/hot-update-20261101/qa/installed-pty.py \
  --manifest "/candidate/$MANIFEST_NAME" --digest "$DIGEST"
```

### Installed DeLM и disposable Python board

Для этого запуска добавьте launcher argument `--previous /tmp/frank-delm-source-ao8tjhv2`.
Это curated fixture Frank, не live run. Probe сверяет отдельный manifest этого входа.
Inner command:

```sh
python3 /repo/experiments/hot-update-20261101/qa/run-core.py \
  --probe delm --manifest "/candidate/$MANIFEST_NAME" --digest "$DIGEST"
```

### Supplementary backend и hot rollback suites

Каждый режим выполняется в отдельной sandbox. Inner commands:

```sh
python3 /repo/experiments/hot-update-20261101/qa/installed-regressions.py \
  --suite backend --manifest "/candidate/$MANIFEST_NAME" --digest "$DIGEST"
python3 /repo/experiments/hot-update-20261101/qa/installed-regressions.py \
  --suite rollback --manifest "/candidate/$MANIFEST_NAME" --digest "$DIGEST"
```

Это повтор frozen авторских сценариев на installed modules, не независимое принятие всех U/ISC.
Runtime wrappers сохраняют command, exit, fixture hashes и artifact integrity до/после.

## Проверенная пригодность и оставшиеся gaps

QA tooling прошёл 13/13 tests; syntax, Python AST, полный corpus и diff checks прошли.
Логи: `/tmp/heidi-qa-s5-check-{0,1,2}.log`. Report фиксирует exact hashes и старые baseline observations.
Старые RED повторять не требуется. На preliminary R4 все перечисленные runtime команды пока NOT RUN.

Полный корпус остаётся U01–U20 и 36 leaves ISC-46–78. Следующие границы не закрыты:

- Core/PTY/DeLM и 100 code swaps подготовлены, но ещё не прошли на новом installed artifact.
- MCP census подготовлен; 20 replacements, RSS/retention и полный ISC-70 ещё NOT RUN.
- Смена MCP URL/configuration не доказывает независимое обновление transport code U12.
- Memory fork/log/subscription, provider stream и voice/audio пока не имеют полного independent installed verdict.
- Goal/subagent authority, revoke для retained generations и часть publication/recovery faults требуют оставшихся независимых наблюдений.
- SDK/TUI cleanup warning должен совпасть с реальным backend cleanup failure; proxy tests этого не доказывают.
- Полный maintenance boundary U19/U20 и затронутые restart/readiness/cleanup/no-replay regressions ещё не приняты.
- Независимый hot v1→v2→v1 на актуальных данных не заменяется supplementary rollback suite.
- Release-return BLOCKED: нужны точный прежний target, два совместимых sealed releases и callable команды Frank.
- Startup failure, stop refusal, foreign service/data и сохранность новых records требуют этого release interface.

Финальный gate требует обоих rollback, независимых Grace/Heidi verdict и одного final manifest digest.
Preliminary artifact не закрывает PDH-22, PDH-21, PDH-23 или финальную QA.
Auth FAIL остаётся operator-only. Production activation NOT RUN.
