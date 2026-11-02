# Доказательства исследования пакетов durable-zero

Документ служит справочником результатов исследования от 2026-11-02. Исследование охватывало исходники, проектные документы, отдельные тесты registry без зависимостей и архитектурный анализ. Ни один результат не подтверждает приёмку production или полного профиля.

При редактуре новые проверки не проводились. Результаты ниже относятся к исходному исследованию.

## 1. Ревизии

- Zero: `v0.7.0`, `b2e21df882a6a4426d0f469d2305b842522d37bd`.
- Checkout: `/var/tmp/durable-zero-research-20261102-v070`.
- Host HEAD на момент исследования был `bb51571bbc3a545226cf2c1aacaf649ac6456112`. Checkout содержал незакоммиченные изменения, и команда продолжала его использовать.
- Таблица зафиксирована в `2026-11-02T19:55:51.690403+00:00`. Она идентифицирует прочитанные файлы. Таблица не подтверждает неизменность всего общего дерева.

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

## 2. Результат теста registry от 2026-11-02

Исследователь выполнил следующую команду в изолированной среде.

```sh
/node /probe.mjs && /node --test packages/core/test/builtin-extension-registry.test.ts
```

Версия Node была `24.19.0`. Средство запуска использовало `bwrap --unshare-all --new-session --die-with-parent --clearenv`, отдельный исполняемый файл Node и доступ только для чтения к `/usr`. Checkout Zero также был доступен только для чтения. `/tmp` использовал tmpfs. HOME указывал на пустой `/home/sandbox`. Сетевое пространство имён было изолировано.

До тестов исследователь проверил отсутствие `/home/ubuntu/.pi`, `/home/ubuntu/.config`, `/home/ubuntu/Projects/pi-durable-host`, `/run/user/1000`. Тесты не открывают Harness или SQLite и не вызывают модели.

Результат: **exit 0; 3 PASS, 0 FAIL, 0 skipped**.

1. `registers, gets, and lists built-in extensions`.
2. `throws on duplicate extension id`.
3. `runs teardownAll in reverse order`.

Сохранённые локальные файлы:

- `/var/tmp/durable-zero-package-registry-tests-20261102.log`, SHA256 `53ad48770f2487570d77b34c675ffd89bb6eb0b451cf8d8f988ddc7a8949f8db`.
- `/var/tmp/durable-zero-package-isolation-20261102.mjs`, SHA256 `4df506fe6c3c743e52f3a11b9f5392bfbe2c73ef883d2305d570eea3c46186ec`.

Копии и команда воспроизведения описаны в [справочнике файлов доказательств](proof/README.md). Результат подтверждает только модульную проверку механизма Zero. Он не подтверждает установку пакетов, native registration или совместимость наших расширений.

## 3. Проверка документальных утверждений

[verify.py](verify.py) читает закреплённые исходники и файлы Host, которые отвечают за проверяемое поведение. Скрипт не импортирует продуктовый код. Проверки включают следующие условия.

- commit и чистоту checkout Zero;
- выбранные exports в source и shipped bundle;
- `builtins/plugins` в `OpenDurableOptions`, отсутствие `builtins` у narrow facade;
- отсутствие проверяемых injection options, реальный порядок resume/return;
- собственные before-resume/storage/authorization требования Host;
- наличие шести документов, парность fenced blocks и существование локальных Markdown links.

Команда проверки в исходном пакете документации:

```sh
python3 docs/architecture/zero/verify.py
```

Проверка не доказывает отсутствие всех неизвестных обходных путей. Она фиксирует конкретный публичный контракт исследованного исходника. Схемы в документах текстовые. Проверка отображения в браузере или Mermaid не заявляется.

## 4. Предыдущие узкие пробы — не новые результаты

Ранее в исходной исследовательской сессии исследователь выполнил следующие проверки.

- `session-socket-daemon.test.ts` + `extension-cli-multi.test.ts`: 3 PASS;
- probe: `parseCliArgs(['serve', '--session', ...]).cwd === 'serve'`;
- probe: второй `SessionDaemon.startMaster()` может заменить pathname живого первого socket.

Логи: `/var/tmp/durable-zero-upstream-unit-tests-20261102.log`, `/var/tmp/durable-zero-boundary-probe-20261102.log`; probe `/var/tmp/durable-zero-research-20261102-probe.mjs`.

Эти проверки не перезапускались для нового отчёта. Проба сокета не открывала native DB и не доказывала двойное исполнение Harness. Проба parser не является сквозной проверкой CLI. Эти результаты не подтверждают готовность daemon, которую описывает README.

## 5. Использованные прошлые component reports

- [Memory/MCP bindings](../../../experiments/durable-module-20261102/memory-mcp/REPORT.md): реальные native зависимости и lifecycle contract.
- [Automation/DeLM](../../../experiments/durable-module-20261102/delm-automation/REPORT.md): перенесённые bindings и bounded native checks; не полный Host.
- [Native authorization](../../../experiments/durable-module-20261102/runtime/COMMIT-AUTHORIZATION.md): patch identity и component RED/GREEN; не stock equivalence.
- [Third-party](../../../experiments/durable-module-20261102/third-party/REPORT.md): GipPity/native version gap; не готовая Zero integration.

Исследователь прочитал эти отчёты, но не повторял описанные проверки. Их PASS и три теста registry не образуют общий показатель готовности продукта.

## 6. Ограничения методов

- Исследователь использовал CodeGraph для Host. Поиск вернул часть нерелевантных совпадений BB. Важные выводы подтверждены текущими фрагментами исходников.
- По предыдущей проверке индекс Zero отсутствовал. Повторный вызов и перестроение индекса не выполнялись. Исследователь прочитал закреплённые исходники и проверил exports сборки.
- Исследователь использовал Hindsight для исторической карты компонентов. Атрибуция сохранена в OBSERVE. Память не подтверждает текущее состояние.
- `observe-pack` и `arch` прочитаны и применены. Для THINK прочитан доступный контракт `packs/Workflows/think-pack.md`; его ссылка на canonical `ThinkPack/Workflows/Root.md` не разрешилась. THINK выполнен как явное сравнение вариантов и ограничений с arch, без заявления о запуске отсутствующего workflow.
- Подагенты не создавались. Независимое ревью и QA этого пакета не проводились.
- Новых утверждений о версиях или сведениях из интернета нет. Исследователь использовал уже закреплённую ревизию. Описанное в README будущее поведение не считается реализованным.

## 7. Что не выполнялось

Новые зависимости не устанавливались. Полный импорт и сборка пакетов не проводились. Сквозной обмен Host с Zero и запуск новых native-пакетов расширений не проверялись. Приёмка интерфейса и PTY, подключение BB и iii, горячее обновление и миграция данных не выполнялись. Вызовов реальных провайдеров не было.

Работа не меняла исходники и сборку Zero, продуктовый код, общее дерево зависимостей или установленный Host. ISA, PLAN, DM1 и DeLM board также не менялись. Исследователь создал только отдельный каталог исследования и временные доказательства. Commit, push и публикация npm не выполнялись.
