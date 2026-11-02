# Native commit patch: независимая квалификация упаковки

Статус: PASS_PINNED_COMPONENT_CLOSURE. Это ранний компонент для DM-F, не Host D1 или final acceptance.

Producer Carol: `acfe12b567d8495281b2226fa8565a97`, DONE700.
Consumer Alice: `1d5a0e0a8700498a9af3b255185354dd`.

## Входы и выход

- Read-only seed: `/tmp/pi-host-dm1-build-20261102-alice-v1`; не изменён.
- Новый read-only closure: `/tmp/pi-host-dm1-commit-20261102-alice-v2`.
- Root lock остался `46482cfa4ca28e91d4a43de4b799ecc22be5b64e5949fc7af3cfa23f894f77eb`.
- Runtime packages: Durable/Chord/pi-ai/pi-codemode/pi-mcp1.5.0. Это minimal closure, не GipPity/full profile.
- Native patch revision: `host-commit-authorization-v1`.
- `RESULT.json`: SHA256 `2303a409f58af827837bbab3c4e9c318b9cbc6c2533ca6005df3e38a559aab8e`.
- Проверенный рецепт `qualify.py`: SHA256 `fdfb5c1525bc27faca172cd05eb12e863854bbdf10bf81ed2203b973e962c1c2`.

Команда текущей квалификации: `python3 experiments/durable-module-20261102/packaging/native-commit/qualify.py`. Скрипт отказывает при существующем output root. Для новой сборки нужен новый отдельный согласованный root; существующий closure не перезаписывать.

Замороженные producer files находятся в `inputs/`: script, metadata с шестью original/patched hashes, direct native fixture и отчёт Carol. Их hashes сверены с DONE700 до копирования. Шесть native files в новой copy не разделяют inode с seed. Все symlink targets остаются внутри copy.

## Свежие результаты Alice

- Patch application и strict fixture compilation: exit0.
- Stock1.5: неизменный real-Harness/SQLite fixture дал ожидаемые 0 PASS / 2 FAIL, exit1; sandbox `/tmp/hot-update-sandbox-4wt4huyu`.
- Patched1.5: тот же compiled fixture дал 2 PASS / 0 FAIL, exit0; sandbox `/tmp/hot-update-sandbox-arc0zj1r`.
- Проверены rollback unauthorized document/abort marks и последующая разрешённая работа. Compiled fixture SHA256 `201fc8f00482815268d2653a84ee1a7d5a91c555fe92fb58005ac9e7f059c7b9` совпал между RED и GREEN.
- Существующий imports probe:15 actual imports/resolutions PASS из root/backend/reload, sandbox `/tmp/hot-update-sandbox-47sagtj9`.
- Actual package import экспортирует exact patch marker; sandbox `/tmp/hot-update-sandbox-10oxvqa1`.
- Unknown version, unknown preimage, partial patch и reapplication отказаны до изменения шести native files. Lock/package version восстановлены; финальные шесть hashes совпали с producer metadata.
- Все четыре финальных sandbox negative isolation checks PASS. Launcher scratch находится вне смонтированного candidate. Runtime не получает `/repo`, production HOME/data/credentials или внешнюю сеть.

Полные runtime logs, isolation JSON и exact bwrap argv сохранены рядом с этим документом. `RESULT.json` связывает12 шагов и hashes. Source faux SHA256 `28011e3ff29d5795108d81bd69aa67e66eee4f5ec020c24bfb3b95dc0e4483b2`; реальные provider calls не выполнялись.

## Первый запуск и ограничения

Первая copy `alice-v1` сохранена. Qualifier ошибочно ожидал TAP, хотя Node выбрал spec reporter. Дополнительно candidate-local TMPDIR поместил scratch launcher внутри candidate; этот запуск не используется как итоговое isolation evidence. Исправлены только qualification recipe: явный TAP и внешний TMPDIR. Native patch и fixture не менялись. Подробности: `INITIAL-ATTEMPT.json` и `/tmp/alice-dm1-native-commit-qualification.log`.

Carol ранее проверила14 component tests. Alice независимо исполнила только2 direct native regression tests; её результат не назван повторным14-test PASS. Общий Host, client coupling, voice/full profile, DM-B, migrations, оба финальных rollback и Grace/Heidi gates ещё не приняты.

Для следующей сборки перенесите проверенные patch inputs и примените существующий script к новой pinned disposable copy. Сохраните runtime marker, все шесть native hashes и dependency provenance в финальном manifest. Stock1.5 нельзя считать эквивалентным patched revision. Финальный независимый review Grace должен проверить адаптацию на том же digest, что installed QA Heidi.

Общие node_modules/dist, рабочий Host, production data/config/credentials/timers и прежние immutable1.4 artifacts не изменены. Исторические release-return/auth/real-copy gates сохраняются. Production activation NOT RUN.

Проверка УТР: неоднозначности0, нарушения0. Hashes, команды, paths и task UUID сохранены буквально.
