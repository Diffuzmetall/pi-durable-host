# Heidi: установленная QA hot-update R4

Это инструменты независимой QA, не второй runtime. Они не активируют production и не принимают продукт по одному exit code.

## Входы

- Alice передаёт named immutable candidate, manifest digest и прежний совместимый closure.
- Frank sandbox task должен быть DONE; negative self-check выполняется перед каждой operational командой.
- `corpus.json` фиксирует все U01–U20 и 36 новых ISA leaves.
- Heidi проверяет raw observations на том же final digest, который проверяет Grace.

## Исполняемый core probe

`installed-core.mjs` создаёт настоящий native profile через упакованный backend. Только model, synthetic credentials и MCP boundary здесь faux. ToolTask, Harness, SQLite, Store, HTTP и SDK настоящие.

Probe проверяет:

- Busy v1 заканчивается ровно один раз; SDK reload публикует v2 до его завершения.
- PID/startticks/Harness/session/root и pending schedule остаются прежними; B сохраняет v1.
- Прямой hidden-base install hook после publication виден следующему native dispatch.
- Prepare failure оставляет рабочую версию и не раскрывает private error.
- После прогрева выполняются 100 code swaps с проверкой каждого следующего вызова.
- Отдельно меняются вложенные JS/TS dependencies при неизменном entry module.
- Ошибка вложенного import сохраняет последний рабочий native dispatch.
- Длительная native phase заканчивается v1; следующий checkpoint выполняется v2 с прежним task ID.
- Несовместимая task version и required schema получают отказ до публикации; optional schema принимает ранее выданный call.
- AGENTS, skills, settings и adapter inventory проверяются через настоящий следующий PromptInput и SDK двух разных проектов.
- Interrupted unsafe effect не повторяется после publication и reopen актуальной disposable DB.
- Missing installed artifact блокирует reopen до reconciliation/resume и изменения сохранённых task rows.

`run-core.py` копирует только probe в scratch. Он проверяет весь manifest до и после, а не только digest самого JSON. Code/candidate mounts остаются read-only.

Пример использует переданные Alice параметры, не постоянный release path:

```sh
TMPDIR=/tmp python3 experiments/hot-update-20261101/sandbox/run.py \
  --repo /home/ubuntu/Projects/pi-durable-host \
  --candidate "$CANDIDATE" --previous "$PREVIOUS" --timeout 420 -- \
  python3 /repo/experiments/hot-update-20261101/qa/run-core.py \
  --manifest "/candidate/$MANIFEST_NAME" --digest "$DIGEST"
```

`TMPDIR=/tmp` относится только к внешнему launcher: evidence переживает удаление временного каталога context-mode. Внутренние HOME/data/TMPDIR задаёт sandbox. Прямой запуск на настоящем HOME запрещён и получает отказ.

Новые S2/S3 проверки подготовлены по переданным owning API; на final R4 artifact они ещё NOT RUN.

Raw RSS/FD/handle samples не означают автоматический PASS ISC-70. Полная проверка требует 20 resource replacements и post-quiescence attribution. Probe не заменяет resource/PTY/DeLM/rollback/recovery cases.

## Независимый установленный PTY

`installed-pty.py` запускает отдельный disposable native owner из `installed-pty-host.mjs` и установленный terminal entry. Продуктовый код загружается только из `/candidate`.

```sh
TMPDIR=/tmp python3 experiments/hot-update-20261101/sandbox/run.py \
  --repo /home/ubuntu/Projects/pi-durable-host \
  --candidate "$CANDIDATE" --previous "$PREVIOUS" --timeout 180 -- \
  python3 /repo/experiments/hot-update-20261101/qa/installed-pty.py \
  --manifest "/candidate/$MANIFEST_NAME" --digest "$DIGEST"
```

Probe проверяет Unicode draft до отправки, замену только клиентского PID, прежние историю/Harness/session и focus. Затем настоящий `/reload` должен обновить меню; отказ module-path admission не должен нарушить focus. Разрешены ровно три явно отправленных faux запроса; reload/reconnect не добавляют model turns.

Manifest сверяется до и после; raw PTY и shutdown result сохраняются в scratch. На прежнем alice-v2 probe получил RED: несохранённый draft не записывается. Новый R4 candidate ещё не проверен.

## Независимый installed DeLM probe

`run-core.py --probe delm` запускает `installed-delm.mjs` через тот же staging/integrity wrapper.
Probe использует installed Store/Harness/SQLite/HTTP/SDK, native ToolTask и копию installed engine в scratch.
Он сохраняет pending wait/task/request/receipt IDs, проверяет v2 на следующей native фазе и ровно один wake.

Отдельный Python board — disposable fixture, не новая команда агентов. Для него нужен явно переданный curated source Frank: sandbox `--previous <fixture-root>`, внутри `/previous/scripts/delm_local.py`.
Live board и исходники существующего run не используются. Frank передал root `/tmp/frank-delm-source-ao8tjhv2` в DONE260. Probe сохраняет отдельный manifest и digest этого тестового входа.

Inner command:

```sh
python3 /repo/experiments/hot-update-20261101/qa/run-core.py --probe delm \
  --manifest "/candidate/$MANIFEST_NAME" --digest "$DIGEST"
```

Изменяется только scratch-копия engine, не sealed artifact. Внешние model/credentials/MCP boundaries — faux; настоящая native delivery проходит через disposable board.
На старом alice-v2 probe создал настоящий pending wait и воспроизвёл busy reload refusal. На новом R4 artifact installed PASS ещё нет. Full DeLM authority/revoke/fault cases остаются в полном корпусе.

## Независимый resource census

`run-core.py --probe resources` запускает `installed-resources.mjs` через прежний sandbox и integrity wrapper.
Probe использует настоящий installed session MCP owner, Nico, Store/Harness/SQLite, HTTP, SDK и native ToolTask.
Внешние границы — faux model, synthetic credentials и локальный recording MCP endpoint.

После прогрева probe выполняет 20 замен конфигурации MCP. Каждая новая версия должна выполнить один native call.
Каждая замена сохраняет session/root/Harness и единственный session owner.

После drain probe закрывает собственные idle connections, ожидает quiescence и вызывает GC.
Он сравнивает FD, children, handles и listeners с именованным прогретым baseline.
Raw descriptor targets, RSS/heap и WeakRefs прежних registry snapshots сохраняются для анализа удержания объектов.
Один PASS этого probe не принимает весь ISC-70: нужны code cohort, анализ RSS/retention и остальные resource boundaries.

```sh
python3 /repo/experiments/hot-update-20261101/qa/run-core.py --probe resources \
  --manifest "/candidate/$MANIFEST_NAME" --digest "$DIGEST"
```

На прежнем alice-v2 probe выполнил настоящий native MCP call v0.
После SDK reload каталог остался v0 вместо v1. Новый R4 artifact ещё NOT RUN; 20 замен и census пока не достигнуты.
Все 27124 файла прежнего artifact совпали до и после. Evidence: `/tmp/hot-update-sandbox-xzyy1laj/`.

## Дополнительные installed regressions

`installed-regressions.py` повторяет 13 существующих suites против упакованных backend/SDK/terminal/reload/memory modules. Это проверки авторских сценариев, не замена независимым U/ISC observations.

Для запуска внутри той же sandbox используйте команду:

```sh
python3 /repo/experiments/hot-update-20261101/qa/installed-regressions.py \
  --manifest "/candidate/$MANIFEST_NAME" --digest "$DIGEST"
```

Каждый исходный test должен совпасть с `sourceFiles` final manifest. Runner меняет только literal product paths на `/candidate`; assertions сохраняются. Неподдержанный parent import получает отказ; moving checkout или source alias не используются как fallback.

AST parser установленного build compiler отличает реальные imports от строк, которые создают disposable modules. Он не выполняет test source.
Новые MCP/memory profile, resource lifecycle и shared-module suites входят в тот же source freeze.

MCP suite использует `/candidate/session-mcp.mjs` и `/candidate/compiled/nico.mjs`, а не source build.
Defective `mcp-source/build/` не получает разрешённого mapping.

Raw TAP, исходные/адаптированные hashes и команды сохраняются в scratch. Artifact сверяется до и после. Старый alice-v2 намеренно получил отказ до запуска Node: новых test hashes нет в прежнем freeze.

### Installed горячий rollback

Тот же runner с `--suite rollback` запускает frozen `artifact-native.test.mjs` и его boundary fixtures.
Runner перенаправляет оба helper imports и копирование CLI с checkout на `/candidate`. `ARTIFACT_SOURCE=1` запрещён.

```sh
python3 /repo/experiments/hot-update-20261101/qa/installed-regressions.py --suite rollback \
  --manifest "/candidate/$MANIFEST_NAME" --digest "$DIGEST"
```

Это дополнительная проверка горячего rollback с реальными Store/Harness/HTTP/SDK/CLI и faults.
Release-return этим режимом не проверяется; его интерфейс передаёт Frank отдельно. На новом final artifact оба отката ещё NOT RUN.

## Artifact integrity

`candidate-manifest.py` использует существующую схему Alice: `activated:false`, `files`, необязательный `sourceFiles`. Каждая запись `files` содержит `sha256`, `mode` и `uid`. Неизвестная схема получает отказ, а не пропуск проверки.

Проверяются hashes, права, владелец, полный состав файлов и отсутствие внешних symlinks. Для source/build freeze дополнительно передаётся `--repo /repo`. До и после проверки используется один exact digest.

## Полнота evidence

```sh
PYTHONDONTWRITEBYTECODE=1 python3 experiments/hot-update-20261101/qa/evidence-gate.py \
  --isa ISA.md --plan docs/host-design/hot-update/PLAN.md
PYTHONDONTWRITEBYTECODE=1 python3 experiments/hot-update-20261101/qa/test-preparation.py
```

Это preparation checks, не product tests. Полный evidence bundle содержит `cases`; их состав соответствует `corpus.json`.

Каждый независимый PASS содержит exact command, exit code, final digest и reviewer `heidi`. Каждое исходное assertion сохраняется; observation содержит outcome, proof, evidence-relative path и SHA256 raw file.

Дополнительно bundle содержит `candidateDigestBefore`, `candidateDigestAfter`, `productionBaseline`, `productionFinal` и `productionActivation:"NOT RUN"`. Неполный bundle получает BLOCKED. Gate не определяет истинность наблюдений вместо Heidi.

## Production boundary

`production-baseline.py` выполняется вне sandbox только для разрешённого read-only наблюдения. Он выбирает пять свойств systemd, PID identity, launcher paths, unit hashes и известные selector symlinks. Он не открывает Host HTTP, SQLite, auth или config.json.

Начальный snapshot сохранён как `production-baseline.json`. Финальный snapshot сравнивается через `--compare`; production mutations отсутствуют в script.

Auth incident остаётся operator-only. Green synthetic tests не являются его resolution.

## Повторное использование

- `apps/dpi-backend/tests/profile-reload.test.mjs` задаёт прежний native profile/SDK путь; QA использует тот же owning API.
- Native Durable ToolTask и существующий registry обеспечивают выполнение; новый scheduler отсутствует.
- `experiments/restart-repair-20261101/qa/` содержит прежние PTY, 67-session и installed regression probes.
- `candidate-manifest.py` обобщает прежний manifest check без hardcoded alice-v2 digest.
- Sandbox принадлежит Frank; QA не создаёт второй launcher или fallback с настоящим HOME.

До получения final artifact и остальных integration interfaces подготовка остаётся частичной. Полный verdict находится в `docs/host-design/verification/hot-update-20261101/REPORT.md`.
