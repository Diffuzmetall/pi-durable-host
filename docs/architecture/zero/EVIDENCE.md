# Evidence — durable-zero packages research

Дата исследования: 2026-11-02. Scope: исходники, существующие проектные документы, узкие dependency-free тесты registry, архитектурный анализ. Ни один результат не является production или full-profile acceptance.

## 1. Ревизии

- Zero: `v0.7.0`, `b2e21df882a6a4426d0f469d2305b842522d37bd`.
- Checkout: `/var/tmp/durable-zero-research-20261102-v070`.
- Host HEAD: `bb51571bbc3a545226cf2c1aacaf649ac6456112`; checkout dirty и продолжает использоваться текущей командой.
- Таблица ниже снята в `2026-11-02T19:55:51.690403+00:00`. Она идентифицирует прочитанные входы, не объявляет весь shared tree immutable.

| SHA256 | Host input |
|---|---|
| `80ba661e99c34380074c812b4c5a28e57c78b4d896fd8b2eb4defb3950a4f5fe` | `ISA.md` |
| `795a1689c304377dc14e95219d4677f7dd873dc85c4f95ffeb2c0a1a518a22ac` | `docs/host-design/PLAN.md` |
| `5c6d2cfbb7ee3619e1cf53e9955d9b0291294b140f5a16cc5de26e935dbe31dc` | `docs/host-design/hot-update/DURABLE-MODULE-PLAN.md` |
| `64dd8071b25e4955886d8f28eab58dcf1a2cc9407a0391a5f6bb3dfe445a5bfe` | `docs/host-design/runtime-architecture-20261102/ARCHITECTURE.md` |
| `8e8025115db43278fdc6f6676c15ed97c7cc0e0c1fda78152352898a3c9329b9` | `apps/dpi-backend/src/native-profile/profile.ts` |
| `15519addaa3491a8f1acaf647902f01469bb89ca321637697ff96afd1982ad17` | `apps/dpi-backend/src/durable/native-session.ts` |
| `8b15a0e405ecd27fd4cd1a32249644db7dbc48f4a30c03716345597e7d55b894` | `apps/dpi-backend/src/durable/session.ts` |
| `1f42e1402630ef3c5b3ddf485740754273a59a0cffc289addaff8d12492af3cd` | `packages/durable-reload/src/index.ts` |

## 2. Свежий тест registry

Команда внутри физического sandbox:

```sh
/node /probe.mjs && /node --test packages/core/test/builtin-extension-registry.test.ts
```

Node: `24.19.0`. Launcher использовал `bwrap --unshare-all --new-session --die-with-parent --clearenv`, read-only `/usr`, отдельный Node binary и read-only checkout Zero. `/tmp` — tmpfs; HOME — пустой `/home/sandbox`; network namespace изолирован.

До тестов проверено отсутствие `/home/ubuntu/.pi`, `/home/ubuntu/.config`, `/home/ubuntu/Projects/pi-durable-host`, `/run/user/1000`. Тесты не открывают Harness/SQLite и не вызывают модели.

Результат: **exit 0; 3 PASS, 0 FAIL, 0 skipped**.

1. `registers, gets, and lists built-in extensions`.
2. `throws on duplicate extension id`.
3. `runs teardownAll in reverse order`.

Сохранённые локальные файлы:

- `/var/tmp/durable-zero-package-registry-tests-20261102.log`, SHA256 `53ad48770f2487570d77b34c675ffd89bb6eb0b451cf8d8f988ddc7a8949f8db`.
- `/var/tmp/durable-zero-package-isolation-20261102.mjs`, SHA256 `4df506fe6c3c743e52f3a11b9f5392bfbe2c73ef883d2305d570eea3c46186ec`.

Копии и воспроизводимая команда находятся в [proof](proof/). Это unit evidence механизма Zero, не проверка package install, native registration или совместимости наших extensions.

## 3. Проверка документальных утверждений

[verify.py](verify.py) читает pinned source и текущие owning files, не импортирует продуктовый код. Проверяет:

- commit и чистоту checkout Zero;
- выбранные exports в source и shipped bundle;
- `builtins/plugins` в `OpenDurableOptions`, отсутствие `builtins` у narrow facade;
- отсутствие проверяемых injection options, реальный порядок resume/return;
- собственные before-resume/storage/authorization требования Host;
- наличие шести документов, парность fenced blocks и существование локальных Markdown links.

Запуск:

```sh
python3 docs/architecture/zero/verify.py
```

Проверка не доказывает отсутствие всех возможных неизвестных обходных путей. Она фиксирует конкретный публичный контракт исследованного source. Схемы в документах текстовые; browser/Mermaid rendering не заявляется.

## 4. Предыдущие узкие пробы — не новые результаты

В этой же исследовательской сессии ранее были выполнены:

- `session-socket-daemon.test.ts` + `extension-cli-multi.test.ts`: 3 PASS;
- probe: `parseCliArgs(['serve', '--session', ...]).cwd === 'serve'`;
- probe: второй `SessionDaemon.startMaster()` может заменить pathname живого первого socket.

Логи: `/var/tmp/durable-zero-upstream-unit-tests-20261102.log`, `/var/tmp/durable-zero-boundary-probe-20261102.log`; probe `/var/tmp/durable-zero-research-20261102-probe.mjs`.

Они не перезапускались для нового отчёта. Socket probe не открывал native DB и не доказывал двойное выполнение Harness. Parser probe не равен full CLI end-to-end. Эти результаты не обосновывают готовность daemon из README.

## 5. Использованные прошлые component reports

- [Memory/MCP bindings](../../../experiments/durable-module-20261102/memory-mcp/REPORT.md): реальные native зависимости и lifecycle contract.
- [Automation/DeLM](../../../experiments/durable-module-20261102/delm-automation/REPORT.md): перенесённые bindings и bounded native checks; не полный Host.
- [Native authorization](../../../experiments/durable-module-20261102/runtime/COMMIT-AUTHORIZATION.md): patch identity и component RED/GREEN; не stock equivalence.
- [Third-party](../../../experiments/durable-module-20261102/third-party/REPORT.md): GipPity/native version gap; не готовая Zero integration.

Это прочитанные отчёты, а не заново исполненные результаты. Их PASS не суммируются с тремя текущими registry tests в показатель готовности продукта.

## 6. Ограничения методов

- CodeGraph использован для Host. Его поиск дал часть нерелевантных BB matches; важные выводы подтверждены нужными текущими source snippets.
- Для Zero индекс отсутствовал по предыдущей проверке; повторный вызов и rebuild не выполнялись. Использованы pinned source navigation и bundle export inspection.
- Hindsight использован для исторического component map, с атрибуцией в OBSERVE; live state по памяти не заявляется.
- `observe-pack` и `arch` прочитаны и применены. Для THINK прочитан доступный контракт `packs/Workflows/think-pack.md`; его ссылка на canonical `ThinkPack/Workflows/Root.md` не разрешилась. THINK выполнен как явное сравнение вариантов и ограничений с arch, без заявления о запуске отсутствующего workflow.
- Не создавались subagents; независимого review/QA этого пакета нет.
- Новых web/version claims нет: использована уже закреплённая исследовательская ревизия. Будущее поведение README не считается выполненным.

## 7. Что не выполнялось

Нет нового dependency install, полного package import/build, Host-on-Zero roundtrip, запуска новых native extension packages, UI/PTY acceptance, BB/iii подключения, hot reload, data migration или live provider calls.

Zero source/dist, product code, общий dependency tree, installed Host, ISA/PLAN/DM1 и DeLM board не изменялись этой работой. Создан только новый research-каталог и scratch evidence. Нет commit, push или npm publication.
