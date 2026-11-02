# D0: isolated dependency closure для Durable 1.5

Статус: component-verified dependency imports; не product acceptance.

## Inputs и identity

- DM1 SHA256: `5c6d2cfbb7ee3619e1cf53e9955d9b0291294b140f5a16cc5de26e935dbe31dc`.
- Baseline: `/tmp/pi-host-dm1-source-20261102-alice-v1`.
- Build seed: `/tmp/pi-host-dm1-build-20261102-alice-v1`.
- Root lock SHA256: `46482cfa4ca28e91d4a43de4b799ecc22be5b64e5949fc7af3cfa23f894f77eb`.
- `QUALIFICATION.json` SHA256: `90702306bbfd32a4d8bcc476a3a6437a15daf8bd26a1baec20a5c75191f92a58`.

Alice подготовила отдельный npm workspace из сохранённых исходников. Target manifests находятся в `target-manifests/`; общий checkout сохранил прежние manifests/dependencies.

Closure содержит backend, SDK, terminal, iii и reload workspace links. Durable, Chord, pi-ai, pi-codemode и pi-mcp закреплены на `1.5.0`.
Terminal pi-tui остаётся на `1.4.0`: его версия не определяет версию runtime. Никакой runtime-пакет из проверенного списка не остался на `1.4.0`.

## Проверки

Установка завершилась с exit0 и отключёнными lifecycle scripts. Npm использовал отдельные HOME/cache и пустые user/global configs.
Окружение установки не наследовало provider credentials. Lock фиксирует 258 записей packages; integrity и provenance указаны в qualification.

Физический sandbox `/tmp/hot-update-sandbox-525_6qjw` подтвердил negative isolation checks и 15 ESM imports/resolutions.
Пять runtime packages проверены из root, backend и reload contexts. Все actual paths находятся внутри `/candidate/node_modules/`.
Проверка подтвердила `Harness.open` и отсутствие удалённого `watchEvents`. Harness и sessions не запускались.

Первый npm запуск отказал из-за одинакового `/dev/null` для двух configs. Alice исправила рецепт на два отдельных пустых файла.
Первый probe ошибочно ожидал функцию `Harness`; upstream предоставляет объект с `Harness.open`. Исправлена только fixture; оба первоначальных результата сохранены.

## Consumer interface: Carol, Eve, Dave, Bob, Frank

Build seed предназначен только для чтения. Не записывайте в его `node_modules`, workspace files или `dist`.
Создайте собственную физическую копию под `/tmp` для сборки. Сохраните относительные workspace links и target manifests.
Добавьте текущие исходники из принадлежащих вам путей. Не заменяйте target manifests прежними `1.4.0` manifests из checkout.

Build seed содержит исходный baseline, а не будущую реализацию D1. Перед сборкой требуются текущие согласованные D0/D1 source inputs.
Для typechecks используйте локальный `node_modules/.bin/tsc`. Для runtime tests используйте существующий launcher `experiments/hot-update-20261101/sandbox/run.py`.

```sh
python3 experiments/hot-update-20261101/sandbox/run.py \
  --repo "$PWD" \
  --candidate /tmp/pi-host-dm1-build-20261102-alice-v1 \
  --timeout 180 -- node --experimental-import-meta-resolve \
  /repo/experiments/durable-module-20261102/packaging/probe-closure.mjs
```

Команда проверяет только imports. Она не запускает проверяемый reload или session.
Для собственных runtime fixtures передайте свою disposable build copy в `--candidate`; БД и mutable outputs создавайте в `/scratch`.

## Ограничения

Backend/reload ещё не адаптированы и не собраны для `1.5.0`. Текущий closure не заявляет совместимость полного native profile.
GipPity/Component SDK и Nico/DeLM bundles должны пройти отдельную адаптацию/provenance. Их отсутствие в раннем closure не считается принятым отключением voice/MCP.

`DEPENDENCY_DELTA_REQUIRES_REBUILD` сохраняется. Старый copy-base recipe не должен принимать эти manifests без новой сборочной основы.
DM-F добавит repeatable clean qualification и полный closure после интеграции bindings.

D1, DM-A–DM-G, migrations, полный resource census и оба final rollback пока NOT RUN.
Исторические PDH-33/20 FAIL и operator-only auth остаются открытыми. Production activation NOT RUN.
