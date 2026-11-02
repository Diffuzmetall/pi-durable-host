# S5: voice callback reload — source output

## Область результата

Dave изменил только `experiments/gippity-voice/integration.mjs` и добавил `audio-host.mjs`, `voice-reload.test.mjs` в той же папке.
MCP, memory, общий profile и установленный Host не изменены этим output.
Исходная S5 и окончательная приёмка R4 остаются незавершёнными.

`audio-host.mjs` экспортирует `createAudioHost(options, createNativeGippityAudioHost)`.
Integration передаёт существующую vendor factory аргументом, без повторного импорта vendor в свежем графе.
Существующий `loadFreshModule` загружает только resource-free callback.
Component, lease, native service и HTTPS listener сохраняют прежних владельцев.

Audio lease запоминает текущий host при успешном `acquire`.
Старый helper завершает принятую операцию с прежним host.
Следующая операция использует новый callback после общей publication.
`whenIdle` ожидает освобождения реального lease; отмена наблюдателя не освобождает чужой lease.
Callback reload не вызывает `stopLan`, `close` или Component retirement.

`composition.prepareReload` сохраняет существующие методы candidate.
Подготовка callback не публикует host.
`validate` сначала проверяет native candidate, затем текущий voice snapshot и закрытие владельца.
`publish` сначала публикует native candidate, затем синхронно меняет voice callback.
Некорректный callback оставляет прежнее поколение действующим.

## Проверки

Физическая sandbox изолировала HOME, данные, сеть и зависимости.
Production activation NOT RUN.

- `/tmp/hot-update-sandbox-xk9yf_t8/run.log`: negative self-check PASS; два теста PASS; ноль FAIL; exit0.
  Финальный `voice-reload.test.mjs` проверил реальный Host/SDK reload и GipPity Component/Harness/SQLite.
  Принятый запрос `controls.listDevices` завершил synthetic helper v1 после publication v2.
  Следующий запрос вернул v2.
  Некорректный JavaScript и неправильный namespace сохранили v2.
  Два подготовленных candidate воспроизвели гонку; проигравший получил `NATIVE_REGISTRY_CHANGED_DURING_PREPARATION`.
  Двадцать последовательных reload выполнили новый helper после каждой publication.
  После каждого запроса активных fixture children было ноль, а native service IDs совпадали с исходными.
  Component подготовлен один раз; Harness, controls и listener сохранились.
  Возврат callback к v1 завершился успешно.

- `/tmp/hot-update-sandbox-ep9xqqxi/run.log`: negative self-check PASS; четыре теста PASS; ноль FAIL; exit0.
  Этот запуск дополнительно проверил неизменённый `integration.test.mjs`.
  Browser send дошёл до faux; HTTPS проверил Host/Origin; настройки сохранились; shutdown освободил listener.
  После этого запуска менялся только новый voice test: добавлена явная проверка гонки candidate.
  Integration и audio-host совпадают с финальными hashes ниже.

- `node --check` прошёл для integration, audio-host и нового voice test.
  `git diff --check -- experiments/gippity-voice` прошёл.

Ожидаемые `operation_failed` в логах относятся к двум отрицательным проверкам некорректного candidate.
Они не означают успешную publication.

## Команда

Полные argv каждого запуска сохранены в `command.json` соответствующей sandbox.
Финальный запуск:

```sh
python3 experiments/hot-update-20261101/sandbox/run.py --repo "$PWD" --candidate /tmp/pi-host-restart-candidate-20261101-alice-v2 -- sh -c 'cd /repo/apps/dpi-backend && node --import tsx --import '\''data:text/javascript,import{registerHooks}from"node:module";registerHooks({resolve(s,c,n){if(s==="@local/pi-durable-reload")return n("file:///repo/packages/durable-reload/src/index.ts",c);if(s==="dpi-backend/native-profile")return n("file:///repo/apps/dpi-backend/src/native-profile/profile.ts",c);if(s==="jiti")return n(s,{...c,parentURL:"file:///candidate/node_modules/dpi-backend/index.js"});if((s.startsWith("@earendil-works/")||s.startsWith("@howaboua/"))&&(c.parentURL?.includes("/repo/")||c.parentURL?.includes("/scratch/")))return n(s,{...c,parentURL:"file:///candidate/gippity/integration.mjs"});return n(s,c)}})'\'' --test ../../experiments/gippity-voice/voice-reload.test.mjs'
```

Source aliases заменяют устаревшую физическую копию reload package и недоступные sandbox symlinks production dependencies.
Vendor зависимости взяты только из sealed alice-v2.
Для локального теста fixture явно включает voice поверх faux; внешних provider вызовов нет.
Fixture использует Jiti virtual modules, чтобы наблюдать настоящий Component без отдельного vendor owner.

## SHA256

```text
22cf008ec4d2acd0e3bbe8cb5d5ecefac6f3fe29564cb0fee0b0aa0c2409d89d  experiments/gippity-voice/integration.mjs
b402e5fe97cd494889a34f7877d98e55a1de0272d260b132c67e6180cb8a670f  experiments/gippity-voice/audio-host.mjs
eeca09ce87539bdc98ce6b5ed34aab6b9201bd9ed2d7fd98a02a0280c23a3eda  experiments/gippity-voice/voice-reload.test.mjs
a124ef50eca9d1eab6f8e307faaa49a90abde375b00999529a90a6836cae03f3  packages/durable-reload/src/loader.ts
```

Loader принадлежит Carol; Dave его не изменял.

## Ограничения и передача

Это source acceptance локального callback, не installed-artifact acceptance.
`listDevices` использует настоящий GipPity queue/lease/helper protocol, но дочерний audio helper синтетический.
Реальные микрофон, динамики, PCM, WebRTC, OAuth и внешний voice provider НЕ ПРОВЕРЕНЫ.
Сохранение pending browser audio stream этим тестом не доказано.
Предыдущий RPC probe отдельно доказал сохранение принятого callback без замены kernel.

Двадцать замен callback не доказывают общий census MCP/memory или возврат полного release.
Проверка дочерних процессов охватывает fixture helpers, не все системные ресурсы Host.
Общие MCP/release/auth FAIL этим результатом не разрешены.

Alice: включите новый `audio-host.mjs` вместе с integration в следующий immutable candidate.
Grace: проверьте границу callback и сохранение exception-cleanup hooks.
Heidi: выполните независимую QA того же manifest с явными ограничениями synthetic audio.
Production activation требует отдельного разрешения пользователя.
