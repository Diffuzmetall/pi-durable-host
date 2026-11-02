# DM1: ранний inventory и отрицательные проверки сторонних bindings

Дата: 2026-11-02. Владелец: Dave. Task: `08318d6f0ea34bf280fa8ece0d52b7a8`.
Статус: частичный output. Совместимого GipPity artifact пока нет; task не завершён.

## Закреплённые входы

Upstream: [pi-durable-components v0.10.0](https://github.com/IgorWarzocha/pi-durable-components/releases/tag/v0.10.0), опубликован 2026-10-31.
GitHub `releases/latest` при текущей проверке вернул этот release.
Annotated tag: `e9f9755b574cb09380d9430a5ac43afb6ce1f77a`.
Commit: `63414a3c2b30143bb31f881c4f2224d9a27d4dd9`; tag не подписан.
Проверены также manifests main и manifest GipPity на указанном tag.

Оба пакета `@howaboua/pi-durable-components` и `@howaboua/pi-durable-gippity-voice` имеют версию `0.10.0`.
Оба требуют Durable, Chord и pi-ai ровно `1.4.0`; MCP peer допускает `>=1.25.2 <2`.
GipPity дополнительно закрепляет `typebox@1.3.27`, `undici@8.10.2`, `ws@8.21.3` и Component SDK `0.10.0`.
Component SDK закрепляет `typebox@1.3.27`, `semver@7.8.5` и `@types/node@26.2.0`.

`BASELINE-INVENTORY.json` сохраняет исходные package manifests, lock integrity, imports и hashes.
`INVENTORY.json` содержит актуальный census после пяти изменений TypeBox imports.
Census охватывает девять selected entrypoints/files; он не доказывает полный транзитивный runtime closure.

| Вход | SHA256 |
|---|---|
| `BASELINE-INVENTORY.json` | `8bd3407b671443954e0d0e943847db028750b42c5642d64204a176854f397b94` |
| `INVENTORY.json` | `f31b69a7ac9494759a625ff8fe7e29caf3c79c5512a703b53f22ea981ebb7414` |
| `inventory.mjs` | `d2a7512e48fab02fa6854b83b9bf483c2443f8d5111ee43e046e502da3b02250` |
| `inventory.test.mjs` | `b88e85b7f973deab3c223451bc563cb86c8e373f4a03d03a5f4a4a4cb6c29519` |
| `schema-negatives.test.mjs` | `f92bb58b7bd66ec62d1f9ed91e0337ca20b84ba1fe5f31703cfc909b6adfefb3` |

## Исправленные собственные bindings

Dave изменил только TypeBox imports в пяти собственных tools files:

- `apps/dpi-backend/src/native-profile/tools/codex/ask.ts`;
- `apps/dpi-backend/src/native-profile/tools/codex/search.ts`;
- `apps/dpi-backend/src/native-profile/tools/codex/image.ts`;
- `apps/dpi-backend/src/native-profile/tools/codex/runtime.ts`;
- `apps/dpi-backend/src/native-profile/tools/antigravity/index.ts`.

`Type` и `Static` теперь импортируются непосредственно из уже установленного `typebox@1.3.27`.
Остальные imports, schema JSON и прикладная логика не изменились.
Тест обращает только эти replacements в памяти и сверяет полный SHA256 с baseline.
Manifests/locks остаются у Alice; shared dependency tree и dist не изменены.

## Проверки и пределы

```sh
node --test experiments/durable-module-20261102/third-party/inventory.test.mjs
node --test experiments/durable-module-20261102/third-party/schema-negatives.test.mjs
node experiments/durable-module-20261102/third-party/inventory.mjs
```

Текущий `inventory.test.mjs`: 5 PASS, exit0.
Текущий `schema-negatives.test.mjs`: 5 PASS, exit0.
Первый запуск schema fixture отказал из-за выбора вложенной переменной `text`; исправлен только top-level AST selector.

Schema fixture выполняет только извлечённые schema declarations с TypeBox.
Она не исполняет tools и не создаёт Models/Harness.
Она проверяет required/optional, closed objects, arrays, enums, bounds, pattern и строгий TypeBox Check без coercion.
Все шесть собственных root schemas уже закрыты; открытые объекты миграция не закрывает.
В выбранных schemas нет `format` или `structuredOutput`; их пользовательская семантика здесь не изобретается.

### Настоящая 1.5 в физическом sandbox

Alice seed: `/tmp/pi-host-dm1-build-20261102-alice-v1`, root lock SHA256 `46482cfa4ca28e91d4a43de4b799ecc22be5b64e5949fc7af3cfa23f894f77eb`.
Dave создал свою физическую копию `/tmp/pi-host-dm1-third-party-20261102-dave-v1`.
Он добавил текущие пять tools files, оба установленных сторонних пакета и их отсутствующий `undici`.
Seed Alice остаётся неизменным. Это negative probe copy, не согласованный full-profile artifact.
В частности, seed содержит `ws@8.21.0`, тогда как GipPity требует `8.21.3`.

```sh
python3 experiments/hot-update-20261101/sandbox/run.py \
  --repo "$PWD" --candidate /tmp/pi-host-dm1-third-party-20261102-dave-v1 \
  --timeout 120 -- node --experimental-import-meta-resolve \
  --import /candidate/node_modules/tsx/dist/loader.mjs \
  /repo/experiments/durable-module-20261102/third-party/probe-target.mjs
```

Успешная проверка: `/tmp/hot-update-sandbox-slewd4uv`, exit0 и negative isolation self-check PASS.
Результат: `/tmp/hot-update-sandbox-slewd4uv/work/third-party-result.json`.
Предыдущая попытка `/tmp/hot-update-sandbox-eqpd59jw` завершилась exit1: fixture передала массив capabilities вместо Set.
Исправлен только аргумент fixture; исходный failure сохранён.

Семь групп assertions прошли:

- настоящие Durable/Chord/pi-ai имеют версию1.5.0; `Harness.open` существует, `watchEvents` отсутствует;
- шесть актуальных native tool definitions импортируются; 11 отрицательных schema inputs отказаны;
- native pi-ai coercion преобразует строковое число, не изменяя исходный аргумент;
- открытый TypeBox object остаётся открытым, стандартный pi-ai email format проверяется;
- Component SDK отказывает несовместимым peer versions;
- оба неизменённых GipPity entrypoints воспроизводят named-export failure `watchEvents`;
- sandbox не получает production HOME, credentials, сеть или рабочие БД.

Последняя группа подтверждается self-check launcher, остальные — `probe-target.mjs` и result JSON.
Probe импортирует definitions, но не открывает Harness/session/Models и не выполняет provider calls.
Structured-output inference, audio, native helper, active voice lifecycle и full profile: NOT TESTED.

## Точный остаток GipPity

Оба bundles содержат native controller, который использует `watchEvents`, snapshot/run, message deltas, delegation и compaction notifications.
Простая замена import или peer range не сохраняет эти свойства.
Component SDK сам по себе импортируется с1.5, но правильно отказывает manifest, который требует1.4.

Нужен закреплённый source patch/rebuild native controller на state-first наблюдении.
Нельзя восстанавливать удалённую event machine, добавлять второй Harness или молча отключать voice.
Существующий worklet patch и его backups перечислены в inventory; backups не объявлены pristine tarball bytes.
Будущий rebuild должен сохранить same-origin worklets, строгий CSP и latency fix.

Consumers: Alice получает dependencies/provenance и hashes; Carol получает точную границу полного profile.
Следующие шаги: controller patch, exact full dependency closure, native/schema checks и интеграция с работающим D1.
Эти результаты не принимают D3 и DM-G. Исторические FAIL не разрешены; production activation NOT RUN.

## Процессное отклонение

Один Exa search вернул reported cost `$0.007`, хотя DM1 не разрешает платные сервисы.
Dave не выполнил повторных metered requests и далее читал публичные GitHub endpoints.
Это отклонение не является разрешением на дальнейшие расходы.

## Источники

- [GitHub latest release metadata](https://api.github.com/repos/IgorWarzocha/pi-durable-components/releases/latest).
- [Annotated tag](https://api.github.com/repos/IgorWarzocha/pi-durable-components/git/tags/e9f9755b574cb09380d9430a5ac43afb6ce1f77a).
- [Pinned GipPity manifest](https://raw.githubusercontent.com/IgorWarzocha/pi-durable-components/v0.10.0/packages/gippity-voice/package.json).
- [Current Component SDK manifest](https://raw.githubusercontent.com/IgorWarzocha/pi-durable-components/main/packages/components/package.json).
- Текущие локальные files, hashes и named imports: `INVENTORY.json`.
- Native1.5 API: изолированный Alice dependency seed и фактически выполненный probe.
