# Pi Durable Host

Один сервер для долговечной работы агентов и отдельные клиенты для терминала, iii и своих интерфейсов. BB — необязательная отложенная интеграция; для основного маршрута его установка и запуск не нужны. Начните разговор в терминале, закройте окно и подключитесь снова: сервер продолжает работу, а клиент восстанавливает её состояние и результат.

Это fork [disler/durable-pi](https://github.com/disler/durable-pi), а не новый agent framework. Он сохраняет backend, SDK, Git-историю и MIT notices upstream; native **Pi Durable 1.4.0** владеет sessions, tasks, документами и восстановлением. Pocket не используется.

> **Обновление 31 октября:** локальный Host с Nico и pi-mcp 1.4.0 активен; большой SSE и сохранность выбранной истории проверены. iii worker на последней проверке остановлен, поэтому весь маршрут ещё не объявлен исправным. [Свежий статус и MCP inventory](integrations/nico-host/UPGRADE-140.md).
>
> **Исторический pre-cutover checkpoint: backend + dpi-sdk + терминал + iii, без BB.** Подготовлен offline-импорт согласованной native SQLite-копии с проверкой сохранённых определений до исполнения; Store отклоняет ссылки copied catalog на исходную БД. Новая граница импорта прошла **16/16** проверок установленного пакета. На одной выбранной копии actual import сохранил native state; фактический Store отказал недоступной сохранённой модели до native bind/resume. Общий переход **NO-GO**: продолжение этой сессии и её интеграции после guard не проверены, production не переключается. Generated canary и настоящий локальный iii не подменяют этот результат. [Миграция и условия отказа](docs/MIGRATION.md) · [Точный scope](docs/STATUS.md).
>
> Прежние P0–P5 и 214/214 тестов сохраняются как исторические evidence, а не повторная приёмка текущего перехода. BB Core build, UI timeout и Chrome-проверки отложены; открытый дефект не объявлен исправленным и не входит в этот verdict.

## Что можно делать

- **Продолжать ту же работу из разных клиентов.** Наш TUI сохраняет editor, navigation, tool streaming, interrupt/steer и durable attention. BB привязывает thread к существующей native conversation, а не создаёт второй runtime.
- **Безопасно повторять команды после обрыва.** Тот же request key с тем же телом возвращает canonical native receipt. Изменённое тело отклоняется; потерянный ACK не означает, что нужно запускать работу заново.
- **Запускать delegated jobs из iii.** Подписанный ingress проверяет session/function/payload; сервер проверяет доверенные namespace/config/worker binding и grant. Завершённый ответ читается по неизменяемому native `answerRef`, в том числе после owner/client restart.
- **Подключать свой runtime.** Модели, native extensions, MCP, memory, guards, Goal и schedules задаёт доверенная серверная композиция. Клиент не выбирает модуль из HTTP body и не получает human authority из полей JSON.
- **Писать свой frontend без Harness и SQLite.** Публичный SDK и HTTP/SSE дают protocol/capability discovery, sessions, native receipts, entries и stream. Адаптеры устанавливаются и обновляются отдельно.

## Архитектура

```mermaid
flowchart LR
  T[Наш TUI] --> TA[Terminal adapter]
  B[BB Core — отложено] -. optional .-> BA[BB stdio adapter]
  I[iii functions] --> IA[Signed iii adapter]
  X[Ваш frontend] --> SDK[Public SDK / HTTP]
  TA --> API
  BA --> API
  IA --> API
  SDK --> API
  subgraph Host[Сервер — единственный native owner]
    API[Authenticated HTTP + SSE] --> G[Current grants и trusted profile]
    G --> R[Pi Durable 1.4.0]
    R --> DB[(Native sessions / tasks / docs / receipts)]
  end
```

**Клиент показывает работу, сервер владеет ею.** Закрытие последнего клиента не останавливает задачу. Disconnect ожидающего `run` не отменяет принятый iii job; pending stop receipt ещё не означает, что native stop уже выполнен.

## Первый запуск

Нужны Git, npm и Node.js **22.19+**; локальные проверки выполнялись на Node 24. Начните с нового каталога данных и faux provider: без платных моделей и частных интеграций.

1. [Собрать backend/SDK, запустить минимальный host и получить ответ](docs/GETTING_STARTED.md).
2. [Подключить terminal и iii без BB](docs/CONNECTING_CLIENTS.md).
3. [Подключить свой native profile и модели](docs/CUSTOM_RUNTIME.md).
4. [Написать новый адаптер](docs/BUILDING_ADAPTERS.md).

Пакеты `0.1.0` **не опубликованы в npm registry**. Инструкции используют локальные tarballs из этого checkout. [Quick start](docs/GETTING_STARTED.md) содержит буквальные SDK и curl примеры со стабильными ключами; для повторного запуска сохраняйте те же ключи, тело и data directory.

### Выберите нужный клиент

| Клиент | Как подключается | Что подготовить |
|---|---|---|
| Terminal | `dpi-terminal URL SESSION_ID` | SDK + terminal tarball, URL и server credential |
| BB — отложен | `dpi-bb-provider`, JSON-RPC по stdin/stdout | Совместимый Core, trusted native profile, точные thread/root/child bindings |
| iii | `dpi-iii-worker --config FILE` | Trusted native profile с `native-iii.v2`, delegated grant, config binding и public signing key |
| Свой frontend | `DpiClient` или authenticated HTTP/SSE | Protocol/capability discovery, stable request keys и безопасное хранение credential |

Минимальный CLI использует `minimal@1`: он не включает все native-интеграции автоматически. Для BB, iii и расширенного inventory нужна [явная серверная композиция](docs/CUSTOM_RUNTIME.md). Установка одного клиента не требует backend/Harness или двух других адаптеров в его install-каталоге.

## Полномочия и восстановление

Observer читает разрешённое состояние; delegated worker выполняет только выделенные операции; human admission остаётся за человеком. Parent-control сверяет настоящие child/execution IDs и текущую revision. Revoke действует на последующие чтения/команды и открытые защищённые streams.

Неизвестный исход отправки сверяется по прежнему request key. Публичные ошибки не раскрывают внутренние причины и credentials. Отсутствующая сохранённая модель или несовместимый profile дают явный отказ до resume, а не тихую замену.

[Архитектура и recovery](docs/ARCHITECTURE.md) · [Контракт SDK](apps/dpi-sdk/README.md) · [Native composition](apps/dpi-backend/NATIVE.md)

## Границы проверки

- **BB `/compact` unsupported:** отказ до эффекта и accepted ACK. Native compaction API не даёт canonical idempotency key; SDK и терминал сохраняют свой compaction API.
- **BB отложен и не входит в текущую приёмку.** Исторически BB проверялся с настоящими BB Core 0.47.1, Chrome и native faux host: Root/child stop, follow-up, restart/reload без повторного initial task. Нужны [переносимые Core patches](compat/bb-0.47.1-native-child/README.md), stock BB недостаточно. Один исходный 25-секундный UI timeout остаётся необъяснённым; два контрольных запуска прошли, latency SLA не заявляется.
- iii проверен через настоящий локальный engine/SDK 0.24.6, подписанный worker и native faux host: retry, restart, revoke и immutable result. Это не production iii deployment или тест живых моделей.
- Mixed-version проверка соединяет terminal + BB с одним host/session/conversation. iii проверяется отдельным потоком на том же backend/SDK tuple; одновременная работа всех трёх не заявляется.
- Репетиция переноса ограничена одной уже выбранной неактивной сессией текущей установки на защищённой копии. Это не поддержка всех исторических/cross-version данных, production, личных memory banks или произвольных plugins. Compile success не доказывает native recovery compatibility.

## Если устанавливает агент

Переносимые задания находятся в [docs/agents](docs/agents/README.md): [установка](docs/agents/INSTALL.md), [подключение](docs/agents/CONNECT.md), [свой profile](docs/agents/CUSTOM_PROFILE.md), [новый адаптер](docs/agents/NEW_ADAPTER.md). Они не требуют наших домашних каталогов, личных MCP, подписок или конкретной модели агента. Не вставляйте secrets в prompt, URL, Git или отчёт.

## Для разработчиков

| Каталог | Назначение |
|---|---|
| `apps/dpi-backend` | Native owner, authenticated API, grants и runtime profiles |
| `apps/dpi-sdk` | Публичные HTTP/SSE types и клиент, без session storage |
| `apps/terminal-adapter` | Наш TUI поверх remote controller/view |
| `apps/bb-adapter` | Thread binding, native children, history CAS и stdio bridge |
| `apps/iii-adapter` | Signed function ingress, SDK jobs/control/result |
| `docs` | Установка, интеграции, архитектура, статус и agent prompts |

Начните с [CONTRIBUTING.md](CONTRIBUTING.md). [План](docs/PLAN.md) отделяет выполненную локальную реализацию от миграции и production. Приватные журналы, audit-материалы, session data и ключи в публичный репозиторий не входят.

## Лицензия

[MIT](LICENSE); исходные copyright upstream сохранены. Baseline Disler: `37165c619573dbaf425463038bbffecfe576beec`. Заимствованные алгоритмы отмечены в `NOTICE.md` и `SOURCE.json` пакетов; оригинальные и локальные hashes различаются. [Происхождение и символические source IDs](docs/PROVENANCE.md).
