# Источники, метод и проверки архитектурного документа

Дата исследования: 2 ноября 2026 года. Область: архитектурная рекомендация и локальные документы. Изменения продукта и production не входят в эту работу.

## Файлы результата

| Файл | Назначение |
| --- | --- |
| [BASELINE.md](BASELINE.md) | Исходная схема до итогового сравнения |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Подробное объяснение, варианты, контракты, диаграммы и критерии проверки |
| [architecture.html](architecture.html) | Автономное визуальное объяснение для передачи другим людям |
| [EVIDENCE.md](EVIDENCE.md) | Источники, ограничения метода и результаты проверки этих файлов |

HTML содержит собственные стили и встроенные SVG. Для чтения достаточно открыть сам файл в браузере; соседние Markdown нужны только для перехода к подробностям. Внешние ссылки открываются по действию читателя. Автоматическая загрузка ресурсов не предусмотрена.

## H. Herdr: закреплённые публичные источники

Исходники найдены через Exa и прочитаны из GitHub/raw. Ревизии получены из GitHub API для default branch `master` в начале исследования. Это срез конкретных commits, не обещание оставаться последними версиями.

| ID | Источник | На чём основан вывод |
| --- | --- | --- |
| H1 | [Core README](https://github.com/herdrdev/herdr-core/blob/b63ecbd1e6b6a7d63fb7bcf40f268930417723ba/README.md) | Терминалы отделены от viewer; CLI и внешние клиенты; kept recovery не повторяет старую команду |
| H2 | [Core API](https://github.com/herdrdev/herdr-core/blob/b63ecbd1e6b6a7d63fb7bcf40f268930417723ba/schema/README.md) | OpenRPC, generation, feature negotiation, snapshot/missed, ограниченные streams и правила reconnect |
| H3 | [holder.rs](https://github.com/herdrdev/herdr-core/blob/b63ecbd1e6b6a7d63fb7bcf40f268930417723ba/crates/herdr-core/src/holder.rs) | Владелец PTY и parent процессов; ограниченный tail; восстановление core |
| H4 | [upgrade.rs](https://github.com/herdrdev/herdr-core/blob/b63ecbd1e6b6a7d63fb7bcf40f268930417723ba/crates/herdr-core/tests/upgrade.rs) | Сценарий смены core при живом терминале; отдельная проверка старого бинарника; skip без `HC_OLD_BIN` |
| H5 | [App README](https://github.com/herdrdev/herdr-app/blob/f6fe216e3078225619621174e62b8b4d8cc56513/README.md) | App управляет окном; layout/mod reload; last-good; separate app update |
| H6 | [App hc.rs](https://github.com/herdrdev/herdr-app/blob/f6fe216e3078225619621174e62b8b4d8cc56513/src/hc.rs) | Framed connection через `hc connect`, protocol generation и required methods |
| H7 | [Mods](https://github.com/herdrdev/herdr-app/blob/f6fe216e3078225619621174e62b8b4d8cc56513/docs/mods.md) и [guide](https://github.com/herdrdev/herdr-app/blob/f6fe216e3078225619621174e62b8b4d8cc56513/defaults/AGENTS.md) | Shipped/personal separation; reload; GPUI вместо DOM; визуальная проверка нужна отдельно |
| H8 | [Security](https://github.com/herdrdev/herdr-app/blob/f6fe216e3078225619621174e62b8b4d8cc56513/docs/security.md) | Mods не sandbox; процессные и сетевые права; отдельный core updater |

Текст README прочитан через web fetch, ключевые исходники через raw URL. Список дерева GitHub использовался только для навигации. Чтение `src/mod_files.rs` показало optimistic file-write guard, но не было использовано как доказательство loader rollback. Чтение `runtime/persistence.rs` показало сохранение registry, но не было выдано за доказательство adoption holder.

**Предел:** Herdr не запускался, не обновлялся, его тесты не выполнялись. Документ различает обещания документации, наблюдаемую структуру кода и собственный архитектурный вывод.

## P. Локальный Pocket

Прочитан существующий checkout `/home/ubuntu/Projects/pi-pocket-v0.26.0-upgrade` с HEAD `5e13a8b161226cbfef3e696c1bd31b8da110e381`.

| Источник | Что проверено |
| --- | --- |
| `AGENTS.md` | Разные правила reload для web, extensions и server core |
| `package.json` | Pocket `0.26.0` |
| `node_modules/@earendil-works/pi-durable/package.json` | Установленная зависимость `1.4.0` |
| `src/server/host.ts` | Ограниченные прикладные interfaces |
| `src/server/reload.ts` | Reload модулей и завершение уже начатого tool call |
| `src/server/extension-web.ts` | Staged registration и disposers |
| `src/server/app.ts` | Прямое подключение Hindsight в локальном PocketApp |

Проверялись исходники и metadata, а не запущенный сервис. Рабочие конфигурации, credentials и содержимое БД не читались. Публичный репозиторий: [TannerMidd/pi-pocket](https://github.com/TannerMidd/pi-pocket).

## D. Наш проект

| ID | Источник | Роль |
| --- | --- | --- |
| D1 | [DM1](../hot-update/DURABLE-MODULE-PLAN.md) | Утверждённая граница, scope и DM-A–G |
| D2 | [D0 contract](../../../apps/dpi-backend/src/durable/CONTRACT.md) | Ownership, authority, receipts, observation, privacy и acceptance limits |
| D3 | [session.ts](../../../apps/dpi-backend/src/durable/session.ts) | Реальные сигнатуры семантических операций |
| D4 | [api.ts](../../../apps/dpi-sdk/src/api.ts) | Публичные DTO, protocol 2, agent-state.v1 |
| D5 | [client.ts](../../../apps/dpi-sdk/src/client.ts) | Клиентские handles, HTTP-вызовы и observation lifecycle |
| D6 | [routes.ts](../../../apps/dpi-backend/src/routes.ts) и [streams.ts](../../../apps/dpi-backend/src/streams.ts) | Native-зависимости ещё видны на исследованном срезе |

CodeGraph использован первым для структурного вопроса. Он вернул и текущие пути, и копии в experiments. Выводы о целевой реализации подтверждены чтением нужных текущих файлов, а не автоматически перенесены с экспериментальной копии. Для Herdr локальный граф не создавался; использованы официальные source files и навигация по GitHub tree.

> 🧠 **From Hindsight memory (Durable-centred upgrade boundary and 1.5 migration)** — страница `kp-0c68d481fd2c4e8dbb0795d510f3d4bb` помогла восстановить прежнее решение о runtime-границе и ограничениях миграции. Эти факты сверены с DM1. Исторические утверждения памяти о PASS, статусе сервисов и старых run не использованы как свежая проверка.

## Метод poteto-mode и явно пропущенные стадии

Throughput checkpoint: n/a, read-only investigation of product code; requested local documentation is the only deliverable mutation.

Исходные шаги Investigation:

1. Route through the **how** skill. For motivation questions, also route through the **why** skill.
2. Throughput checkpoint stays one line: `throughput checkpoint: n/a, read-only investigation`.
3. Produce the `how`-shaped output (Overview / Key Concepts / How It Works / Where Things Live / Gotchas), or a recommendation with a tradeoffs table if the request is a decision between alternatives.
4. Apply the **unslop** skill to the reply.

Прочитаны Investigation, how, why, technical-writing, unslop, architect и его design-red-flags/rationale-template. У how/why обязательные отдельные исполнители не запускались: ранее заданный запрет на новых агентов сохраняется. Полное выполнение этих delegated workflow не заявляется. Их структура grounding применена автором; private chat, чужие трассы и product analytics для этого документа не запрашивались.

| Стадия architect | Состояние |
| --- | --- |
| Ground | Выполнено автором по перечисленным sources; делегированные how/why не выполнены |
| Sketch | Сравнены A: in-process runtime, B: separate daemon, C: embedded clients |
| Agree | Документ представлен как рекомендация; не заменяет пользовательское решение о смене DM1 |
| Implement | Skip: продуктовая реализация не запрошена; созданы только документы и HTML |
| Scrap | Skip: реализации по новому sketch не было |
| Independent arena | Не проведена; запрошено разрешение на двух временных read-only проверяющих |

Применены прочитанные принципы Laziness Protocol, Minimize Reader Load и Boundary Discipline. FirstPrinciples/Challenge отделяет ограничения механизма от проектных решений и недоказанных предположений. AgentEngineering/ApiAndInterfaceDesign использован для контракта, неизвестного исхода и атомарности admission. Fungibility применена к передаваемости задач, не как разрешение менять текущие claims и runtime owners.

Документы написаны в режиме explanation по technical-writing, проверены автором по unslop и ru-text. Английские названия symbols сохранены там, где они нужны для сопоставления с кодом.

Art/Mermaid прочитан, но его image-generation workflow не выполнен: он требует отдельный `/cse` и генератор изображений, а результат здесь представляет собой Markdown-диаграммы и встроенную HTML-разметку. Модельные изображения не заказывались. Никакой image-generation PASS не заявляется.

Голосовые уведомления и глобальные execution logs не создавались: настроенный механизм в этом ходе не подтверждён, а изменение глобального состояния не нужно для результата.

## Проверки файлов

**Статическая проверка: PASS.** Python-проверка прочитала итоговые файлы через `pathlib`, проверила HTML через `HTMLParser`, а каждый встроенный SVG через `xml.etree.ElementTree`. Ошибок не обнаружено; процесс завершился с exit 0.

| Проверка | Результат |
| --- | --- |
| Три Markdown-файла: один H1 и закрытые code fences | PASS |
| 23 относительные ссылки Markdown и HTML | Все цели существуют |
| 25 HTML IDs и ссылки на anchors | Нет дублей и отсутствующих целей |
| Вложенность HTML, `lang=ru`, main и один H1 | PASS |
| Три SVG: корректный XML, title, desc и существующие markers | PASS |
| Две HTML flow-схемы | Присутствуют |
| Scripts, inline handlers, iframe, внешние src и CSS-загрузки | Отсутствуют |
| Темы Herdr, Pocket, DM-A–G, requestId, reconciliation, 1.4/1.5 и ограничения production | Присутствуют |
| Семь Mermaid-блоков в Markdown | Посчитаны; parser/render Mermaid не запускался |

Точное содержимое основных результатов на проверке:

```text
BASELINE.md       7821 bytes  a00f8dae73d44711bd8b496d0137a5dd14a9d020bb7b01729af7a7d7b718abce
ARCHITECTURE.md  54741 bytes  64dd8071b25e4955886d8f28eab58dcf1a2cc9407a0391a5f6bb3dfe445a5bfe
architecture.html 37684 bytes aed3c95b9aeffb4cb6ff616eda7785132f56f3a944d5dc300bbed583512e269f
```

Это hashes документов, не runtime release digest. Проверка структуры не доказывает визуальное качество, корректность CSS во всех браузерах или исполнение показанного TypeScript. Отдельный CSS parser в среде проверки не найден.

Браузерная проверка пока недоступна. В текущих callable tools не найден native browser. В проекте не найден установленный Playwright/Puppeteer для допустимого существующего harness. Новая зависимость не установлена, сторонний GUI не запущен. Чтение HTML не будет выдано за визуальную проверку.

## Что эта работа не подтверждает

- Готовность runtime 1.5, full-profile integration или финального candidate.
- PASS тестов Herdr, Pocket или команды DeLM.
- Завершение DM-A–G, полного hot-update корпуса или независимой приёмки.
- Безопасность downgrade изменённой БД.
- Готовность BB, нового GUI plugin framework или отдельного runtime daemon.
- Право активировать production, перезапускать Host либо менять работающий Pocket.
