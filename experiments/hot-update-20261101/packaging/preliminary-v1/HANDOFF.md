# Предварительный artifact для Heidi — не финальный PDH-21

## Результат и границы

Alice собрала отдельный immutable artifact после source S5 DONE519.
Artifact не зависит от положительного release-return и не заменяет прежний alice-v2.
Статус manifest: `PRELIMINARY_NOT_ACCEPTED`. Production activation NOT RUN.

- Artifact: `/tmp/pi-host-hot-update-preliminary-20261101-alice-v1`.
- Manifest: `RESTART-CANDIDATE.json`.
- SHA256 manifest: `18724c7afeffda96d63b10c57ca77e1c280598f6fd0c6f60e778e5402c78e73a`.
- Closure: 27129 файлов; sourceFiles: 953 записи.
- Task Alice: `51fd9c043ac4480b83b47d33d8b31f15`, generation1.

Финальные PDH-20/PDH-21 остаются незавершёнными. Alice не меняла их criteria, dependencies или FAIL.
Manifest явно перечисляет отсутствующие проверки в `checksNotRun`.
Ранний artifact разрешает Heidi начать изолированные probes, но не закрывает final acceptance.

## Сборка

Команда:

```sh
python3 experiments/hot-update-20261101/packaging/preliminary-v1/build.py
```

Финальный прогон завершился с exit0. Все шесть build steps имеют exit0.
Файл `build-results.json` сохраняет точные argv, cwd и paths логов.
Полные логи: `/tmp/alice-preliminary-build-2ngrbym6/`.
Предыдущие generated dist сохранены в `dist-before.tar.gz`; исходники и installed dependencies не сбрасывались.

Порядок: reload → SDK → backend types/assets → terminal types/assets.
Временные configs используют свежие declarations reload и SDK.
Явные typeRoots указывают существующие локальные зависимости. Runtime source aliases отсутствуют.
Backend assets копирует прежний `scripts/build.mjs`; terminal assets использует прежнюю package-команду.
Установки, downloads и изменение checkout node_modules не выполнялись.

Recipe копирует sealed base и заменяет app/reload dist только в новом artifact.
Исправленный Nico bundle и provenance/licenses находятся внутри closure.
Новый `gippity/audio-host.mjs` включён. SDK declarations содержат optional `cleanup:'failed'`.

Предыдущие попытки раскрывают две локальные причины задержки:

- `/tmp/alice-preliminary-build-lb5wbizb/`: backend typecheck отказал с TS2688.
  Config вне app не находил types/node; явные typeRoots устранили ошибку.
- `/tmp/alice-preliminary-build-6trqat04/`: builds прошли, stage отказал с `EXTERNAL_GIPPITY_LINK_REFUSED`.
  Source alias `@earendil-works` указывал на исходный release, хотя dependency base теперь sealed alice-v2.

Этот alias уже исключался существующим copytree. Recipe ошибочно проверял исключённый input.
Alice согласовала проверку с прежними exclusions `@earendil-works` и `.bin`.
Private dependencies по-прежнему проверяются; внешняя ссылка в копируемой зависимости отклоняется до создания artifact.
Новые исключения для копируемого кода не добавлялись. Старый alias не читается и не копируется.

## Проверки упаковки

```sh
python3 experiments/hot-update-20261101/sandbox/run.py --repo "$PWD" -- \
  python3 /repo/experiments/sdk-host-cutover/restart-packaging.test.py
```

RED: `/tmp/hot-update-sandbox-o2u2auaf/run.log`, exit1.
Physical negative self-check PASS; один из двенадцати tests воспроизвёл отказ исключённого alias.
GREEN: `/tmp/hot-update-sandbox-vgdv8cj0/run.log`, exit0.
Physical negative self-check PASS; двенадцать tests PASS.
Новый negative test подтверждает сохранение отказа внешней private dependency.

Проверка реального artifact:

```sh
python3 experiments/hot-update-20261101/sandbox/run.py --repo "$PWD" \
  --candidate /tmp/pi-host-hot-update-preliminary-20261101-alice-v1 \
  --previous /tmp/pi-host-restart-candidate-20261101-alice-v2 --timeout 180 -- \
  node --experimental-import-meta-resolve \
  /repo/experiments/hot-update-20261101/packaging/preliminary-v1/smoke.mjs
```

PASS, exit0: `/tmp/hot-update-sandbox-hgl_123d/run.log`.
Physical negative self-check PASS. Integrity validator проверил все 27129 новых и 27124 прежних файлов.

Шестнадцать module imports прошли из нового physical closure.
Среди них Store/HTTP/native profile, SDK/terminal controller, Nico, reload, DeLM и voice wrappers.
Native ESM resolution выбрал свежий nested reload package внутри artifact.
Проверены preliminary status, отсутствие activation, Nico hash и SDK cleanup declaration.
Services, sessions, production resources и profiles этим smoke не создавались.

Первая версия smoke ошибочно использовала CJS require.resolve для import-only package.
Она отказала с `ERR_PACKAGE_PATH_NOT_EXPORTED`: `/tmp/hot-update-sandbox-v3s20j80/run.log`.
Исправлена только проверка: native ESM resolution с явным parent. Product artifact не менялся.

## Carol, Frank и Dave: точный прежний состав

Прежний artifact: `/tmp/pi-host-restart-candidate-20261101-alice-v2`.
Manifest SHA256: `672b7e5e746dcabfbf5ca82a571cd35f328e457f717b64e2b852b3afa3931665`.
Новый sandbox проверил весь прежний sealed closure; он не заменён и не изменён.

Сохранённый inventory: `experiments/hot-update-20261101/packaging/release-inputs.json`.
Его секция `new` исторически описывает отсутствие финального R4, не этот предварительный artifact.
Для предварительного artifact используйте отдельный `artifact.json` этого каталога.
Прежний manifest содержит полный `files`, `sourceFiles`, lock digest и dependency provenance.
Конфигурация, credentials и production DB не нужны для чтения этих code artifacts.

Точные прежние paths и SHA256:

```text
d748e744ff0ecc724aac202e264855f1ceba48b729bd05529df8c3c4058cb29a  operational-profile.mjs
5643afccd8d8f9f3f1136c3a1a5689731ca1381027fb1c7a95fbb25a7ae49a2c  operational-service.mjs
b77ba119b703da510a8646916364e302a2923fefa3e7dc21996a1266f91a1cba  delm-profile.mjs
a4e33690e1a6b57adba53cdc51dc02e221b2a6610a51d53e0f1764028e3341af  operational-models.mjs
c8e89fa7c81ed36cd2cab7cc3600db4f99897bae202e8c6464ca6d4c72145574  session-mcp.mjs
2b7a49479a5a2909cfa321e685ab275b0606244fb0fdbc854f05aa278db089bd  compiled/nico.mjs
5c667965d1c259613e06498806971f24289992f627f1bc3e0a350197c31beec4  node_modules/dpi-backend/dist/dpi-backend/src/native-profile/profile.js
65387a459797669e6d109b4b79f1f8b030fb145398daf97fa8e645e9f962ffb4  node_modules/dpi-backend/dist/dpi-backend/src/native-import.js
```

Carol проверяет отдельный offline adapter прежнего полного состава в PDH-33.
Dave независимо проверяет причины препятствия в `3a71318a9f0342ee8ed445d6e80db33b`.
Frank сохраняет PDH-20: UNKNOWN запрещает switch; fixtures не заменяют положительный Host return.
Публикация Alice `9b683f7e496244e29cd0cf143588c395` передала эти inputs до завершения сборки.
Alice не подменяет прежний Nico исправленным новым bundle при анализе старого состава.

## Heidi: что можно и нельзя принимать

Используйте этот manifest как отдельный early QA input в физическом sandbox Frank.
Проверяйте installed code из `/candidate`; repo нужен только для frozen fixtures и probes.
Не меняйте этот artifact после начала QA. Для следующей версии нужен новый путь и новый manifest.

NOT RUN для этого manifest:

- Положительный full Host release-return и совместимость прежнего полного profile.
- Полный U01–U20 / ISC-46–78 и независимый final source review.
- Общий прогон 100 code swaps / 20 resource replacements с полным ISC-70 OS/heap census.
- Оба независимых rollback на одном окончательном manifest.
- Final installed acceptance, production activation и operator-only auth check.

Import smoke не доказывает startup/recovery, per-session lifecycle или отсутствие утечек при полном прогоне.
Предыдущие component PASS относятся к своим source hashes и не перенесены автоматически на этот artifact.
FAIL release-return и auth incident остаются открытыми. Frozen inputs не изменены; новые агенты не запускались.
