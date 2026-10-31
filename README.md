# Pi Durable Host

Наш TUI и интеграции работают с одним долговечным Host через существующий Disler SDK. **Исполнение, checkpoints и session SQLite принадлежат серверу, а не терминальному окну.** Закрытие клиента не должно останавливать принятые задачи.

Fork [disler/durable-pi](https://github.com/disler/durable-pi), исходный baseline `37165c619573dbaf425463038bbffecfe576beec`. Backend/SDK сохранены; основное Durable-семейство зависимостей закреплено на **1.4.0**. Pocket не входит в этот проект.

## Текущее состояние

**Срез: 31 октября 2026, 18:49 UTC. Основной Host/SDK/терминал работает; весь проект не объявлен полностью принятым.**

| Часть | Статус |
|---|---|
| Основной Host | Активен `c0019d7-unified-sse-mcp140-20261031-v1` |
| Наш SDK-терминал | Подключён к Host, без automatic local/legacy fallback |
| Большая SSE-история | Исправлена: реальный snapshot 3,09 МБ + 4 документа на одном соединении |
| pi-mcp / Nico | pi-mcp 1.4.0 активен, принятая Nico integration сохранена |
| Сохранность cutover | 42 прежние sessions, 47 conversations, 4984 записи и task state сохранены |
| Текущие sessions/conversations | 46 / 51; это более поздний live snapshot |
| Каталог моделей | Terra 6.1 и Antigravity Gemini Flash доступны; saved IDs не подменялись |
| MCP | **Частично:** Langfuse/Open Design inventory восстановлен не везде; не все операции проверены |
| iii | Engine работает, **worker остановлен**; полного живого route acceptance нет |
| BB | **Отложен**; adapter/fixtures не означают принятие BB UI |
| Прочие исторические базы и произвольные plugins | Универсальная миграция/совместимость не заявлена |

Начать здесь:

- **[Подробный статус: сделано, работает, не работает, evidence и восстановление](docs/host-status-2026-10-31.md)**.
- **[Текущая архитектура и компоненты](docs/host-architecture.md)**.
- [Compound: почему исправление должно попасть и в package archive](docs/solutions/workflow-issues/sealed-host-release-must-include-package-archives.md).
- [ISA](ISA.md), [план milestones](docs/host-design/PLAN.md), [словарь](CONCEPTS.md).

## Архитектура

```text
наш TUI ─ terminal adapter ─ dpi-sdk ─ HTTP /v1 + SSE ─ dpi-backend
                                  ▲                       │
                       iii / BB adapters                  ├─ auth/grants/admission
                                                          ├─ Store/catalog/lifecycle
                                                          └─ native@1 composition
                                                               ├─ Durable Harness
                                                               │    └─ session SQLite
                                                               ├─ models / tools / skills
                                                               ├─ Nico → MCP
                                                               └─ memory / tracing / guards
```

Клиент хранит draft/cache и отображает projection. Native Durable владеет исполнением и recovery. Один operational Host-процесс может обслуживать несколько session Harness; ни терминал, ни BB/iii не создают второй owner для управления тем же SQLite.

Protocol/capability discovery проверяет совместимость, grant — права. `accepted`, `done`, `uncertain` и `online` — разные факты. Lost ACK не разрешает отправить тот же эффект под новым request ID.

## Структура репозитория

| Путь | Назначение |
|---|---|
| `apps/dpi-backend` | Существующий Disler backend, Store, auth, streams и native profile |
| `apps/dpi-sdk` | Wire contract, DpiClient, reducers, SSE и receipt integration |
| `apps/terminal-adapter` | Наш TUI и remote controller поверх SDK |
| `packages/durable-reload` | Общая native staging/validation/publication для reload |
| `apps/iii-adapter` | Delegated iii integration |
| `apps/bb-adapter` | Отложенная BB integration и её tests |
| `experiments/sdk-host-cutover` | Operational templates, bindings и isolated probes |
| `experiments/host-sse-mcp140-20261031` | Проверенная SSE/MCP140 сборка и guarded activation |
| `docs/host-design` | Проектные решения и датированная история acceptance |
| `docs/solutions` | Compound learnings с YAML metadata |
| `apps/dpi-tui`, `apps/dpi-playground`, demo, `just/` | Upstream reference/development surfaces, не текущий operational installer |

## Использование уже установленного SDK-терминала

На машине, где operator уже подготовил private Host binding:

```sh
pi-durable --help
pi-durable --continue
# Для точного Host session ID:
# pi-durable --session HOST_SESSION_ID
```

Без аргументов launcher создаёт новую Host session с точной default model. `--retry-new` предназначен для явного reconciliation сохранённого creation intent, а не для повторной отправки prompt. `--extension`, `--listen`, `--print` и другие флаги старого Pi CLI не становятся supported автоматически.

**Клонирование репозитория не устанавливает production Host.** Текущие operational scripts используют private grants/bindings и sealed base releases этой установки. Универсального проверенного curl-installer не заявлено. Не переносите чужие tokens, SQLite или `~/.config` из примера; настройки и admission должны создаваться отдельно для целевой машины.

## Разработка и проверки

Проверенный runtime этой установки — Node.js 24. Отдельные packages содержат свои lockfiles, `check`, `build` и `test` scripts. При уже установленных локальных dependencies:

```sh
npm --prefix apps/dpi-sdk run check
npm --prefix apps/dpi-backend run check
npm --prefix apps/terminal-adapter run check
npm --prefix apps/iii-adapter run check
npm --prefix apps/bb-adapter run check
```

Для source regressions используется faux/local окружение и отдельный HOME/dataDir. Не запускайте live-provider, migration, deploy или production-restart probes как обычный unit test. Сценарии сборки и exact-release verification: [SSE/MCP140 experiment](experiments/host-sse-mcp140-20261031/README.md).

Исторические числа PASS в `docs/host-design/verification` относятся к указанным там кандидатам. Они не являются результатом новой проверки любого текущего checkout. Публикация feature-ветки — snapshot исходников и документации, не новый production activation и не новый независимый milestone verdict.

## Ограничения и безопасность

- Private auth/MCP/grants, conversation history, live databases, backups и receipts **не публикуются**. Сборочные копии и временные отчёты не являются source deliverables.
- Нельзя удалять owner locks вслепую, молча заменять saved model IDs или запускать legacy owner как fallback.
- Reload providers/adapters на существующем Harness **не является MCP reconnect API**.
- Наличие tools/capability и HTTP 200 не доказывает полный внешний E2E.
- Native checkpoints и idempotent request admission не гарантируют exactly-once произвольного внешнего эффекта.
- Commit/push не разрешает restart, импорт production DB или изменение глобальных credentials.

При проблемах смотреть [эксплуатационные инструкции и незакрытые пункты](docs/host-status-2026-10-31.md#эксплуатация-и-восстановление), не повторять прежние cutover-команды на занятом Host.

## Документация и происхождение

[Backend API](apps/dpi-backend/API.md) · [Native profile](apps/dpi-backend/NATIVE.md) · [SDK](apps/dpi-sdk/README.md) · [Terminal adapter](apps/terminal-adapter/README.md).

Upstream network/demo instructions и история находятся в [disler/durable-pi](https://github.com/disler/durable-pi). Старый архитектурный [proposal](docs/host-design/ARCHITECTURE.md) оставлен как proposal; нынешняя реализация описана отдельно. Чужие licenses, notices и source provenance в пакетах сохраняются.

## Лицензия

MIT — [LICENSE](LICENSE). Сохранены upstream copyright и attribution. Вендорные компоненты имеют дополнительные license/notice файлы рядом с source.
