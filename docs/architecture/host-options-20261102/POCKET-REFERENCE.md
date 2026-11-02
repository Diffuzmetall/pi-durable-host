# Возможности и интерфейсы Pi Pocket

Этот справочник фиксирует результаты исследования от 2026-11-02. Он не подтверждает runtime-приёмку.

[Выбор серверной части](PI-POCKET.md) · [План проверочного эксперимента](POCKET-EXPERIMENT.md)

## Объект и границы проверки

Проверка выполнена 2026-11-02. Официальный upstream определён через `git remote -v` существующего checkout: **https://github.com/TannerMidd/pi-pocket**. GitHub описывает проект как "A durable, multiplayer, mobile-first web app for Pi agents, built on Pi Durable". Лицензия MIT. Copyright Tanner Middleton, 2026.

| Объект | Закреплённая версия |
|---|---|
| Локальный checkout | `/home/ubuntu/Projects/pi-pocket-v0.26.0-upgrade`, HEAD/tag `v0.26.0`, `5e13a8b161226cbfef3e696c1bd31b8da110e381` |
| Дата выпуска 0.26.0 | 2026-10-27, 23:05:45 UTC |
| Актуальный стабильный выпуск | `v0.27.0`, `50194aa38eb368ef2cb8599d44fba81b05ed5263`, 2026-10-30, 22:08:38 UTC |
| Последний commit main по GitHub | `db1e531d492f9ce231ba7a9761c52c0ebc7becc0`, 2026-10-30: исправление npm publish |
| Метаданные GitHub | `updated_at`: 2026-11-02 18:26:25 UTC; `pushed_at`: 18:40:43 UTC |
| Собственная исследовательская копия | `/var/tmp/pi-pocket-research-20261102-stable`, checkout стабильного тега |

`pushed_at` не означает обновление main. Изменения могут относиться к другим веткам. PR #254 "Pi Pocket 0.28.0" остаётся открытым. Это не стабильный выпуск.

Локальный checkout существенно изменён. Проверка `git status` без записи показывает изменения 26 отслеживаемых файлов и дополнительные исходники. Среди них: `local-extensions/`, `src/server/hindsight/`, голосовой ввод и `src/server/http/bb-origins.ts`. Изменены также app, commands, loader, subagents и web. Поэтому локальная версия не совпадает с чистым upstream 0.26.0. Для этих локальных изменений нет публичных commit-ссылок.

Применены `research-software` и `asd-ste100-ru`, включая обязательный справочник. Прочитана указанная карта Host. CodeGraph вызван для существующего checkout, но вернул `MCP_MAY_HAVE_RUN`. Пригодный граф не получен. Индекс не создавался. Анализ продолжен через исходники.

Службы, конфигурация production, credentials и базы не проверялись. Код проектов и тесты не исполнялись. Зависимости не устанавливались.

> 🧠 **From Hindsight memory (Component map)** — память описывает наш SDK и адаптеры как клиентов единого серверного владельца. Для текущего сравнения эта граница сверена с предоставленной картой `MAP.md`; прежние заявления о готовности не использованы как runtime-доказательство.

## Матрица возможностей

Обозначения относятся к стабильному upstream 0.27.0, а не к работающей установке.

| Возможность | Статус | Основание и ограничение |
|---|---|---|
| Готовый сервер и web-приложение | подтверждено исходниками | Node HTTP, PocketApp, собственный web; не библиотека с независимым стабильным SDK |
| Единый владелец исполнения | подтверждено исходниками | Один Harness, один `pocket.sqlite`, все сессии и подагенты; файловая блокировка |
| Подключение клиентов без web-интерфейса | подтверждено исходниками | HTTP JSON, Bearer, SSE и long-poll; браузер для основного исполнения не требуется |
| Полностью отдельный серверный пакет | не найдено | Серверные модули отделены от web, но поставка общая; отдельного backend-only режима не найдено |
| Стабильный публичный SDK или OpenAPI для внешних клиентов | не найдено | `/api` обслуживает собственный web. Отдельная обещанная совместимость сетевого API не установлена |
| Серверная история | подтверждено исходниками | Durable entries, методы history, context, entry и export. Изображения читаются из сохранённой записи |
| Продолжение задач после рестарта | подтверждено исходниками | После `Harness.open` и восстановления вызывается `Harness.resume`. Schedules и watch используют `sleepUntil` |
| Однократность любого внешнего эффекта | не найдено | Зависит от replay-контракта инструмента или задачи и собственного ключа эффекта. История не гарантирует однократность |
| Отмена и очередь | подтверждено исходниками | Методы abort, withdraw, move, edit-queued. Режимы steer, followUp и interrupt |
| Повтор сообщения с прежним ID | подтверждено исходниками | Actor-scoped requestId, Durable submissionByRequest; дополнительные ограничения ниже |
| Отдельные HTTP receipt и reconcile как у Host | не найдено | Повтор submit возвращает submissionId; отдельного эквивалента нашего reconcile не найдено |
| Входные изображения до модели | подтверждено исходниками | Upload создаёт Attachment. После resize ImageContent передаётся в conversation.submit |
| Native Durable extensions | подтверждено исходниками | Registry, drop-in modules, hooks, tasks, docs, tools, reload и cleanup |
| Обычные Pi extensions без переноса | не найдено | README прямо исключает поддержку Pi extensions; loader ожидает другой контракт |
| Встроенное подключение MCP | не найдено | pi-mcp есть в dependencies. Поиск в src не выявил регистрации или MCP transport |
| Модели и credentials | подтверждено исходниками | ModelRuntime, Providers; сервер использует Pi auth.json и модель на сессию |
| Подагенты, память, Goal, schedules | подтверждено исходниками | Собственные Pocket-модули; это не наши одноимённые реализации |
| Авторизация и видимость сессий | подтверждено исходниками | Роли owner, guest, viewer, доступ к указанным сессиям и отдельная проверка driver |
| Изоляция процессов и файлов как sandbox | не найдено | Общий процесс и права ОС; worktree не является sandbox |
| Готовый адаптер BB или iii | не найдено | Требуется внешний адаптер, а не подключение их второго исполнителя |
| Работоспособность всей композиции | не проверено | Только статическое исследование, без запуска |

## HTTP API

| Операция | Интерфейс |
|---|---|
| Узнать пользователя и сервер | `GET /api/me` |
| Список и создание сессий | `GET /api/sessions`, `POST /api/sessions` |
| Подписаться | `GET /api/events?c=<id>&tab=<id>&p=<protocol>`; альтернатива `/api/poll` |
| Отправить сообщение | `POST /api/c/<id>/submit`: `{text, requestId, attachments?, mode?, inlineFiles?}` |
| Остановить исполнение | `POST /api/c/<id>/abort` |
| Загрузить файл | `POST /api/c/<id>/upload?name=<name>`, бинарное тело |
| Получить историю | `GET /api/c/<id>/history?before=<entryId>`, также context, entry и export |

## Входные изображения

Сервер обрабатывает входное изображение в следующем порядке.

1. Клиент отправляет бинарный файл в upload конкретной сессии. API проверяет пользователя, видимость сессии и право steering.
2. Обработчик ограничивает фактический поток 50 MB, создаёт уникальный файл с правами 0600 и не перезаписывает существующий. Прерванную загрузку удаляет.
3. Ответ содержит `Attachment {path,name,mime,size}`. MIME берётся из Content-Type либо расширения. Отдельной строгой проверки формата при upload не найдено.
4. Клиент передаёт Attachment в submit. API оставляет пути внутри upload-каталога этой сессии.
5. Commands создаёт текст с файлами. Для моделей с image input Commands добавляет PNG, JPEG, GIF или WebP не более 5 MiB по `Attachment.size`.
6. `modelImage` читает файл и вызывает Pi `resizeImage`. Результат становится `{type:'image', mimeType, data}` внутри Durable input. Комментарий указывает предел 2000 пикселей по стороне.
7. Durable сохраняет изображение в model content entry. `Transcripts.entryImage` возвращает байты из base64 с проверкой принадлежности записи сессии или допустимому предку fork.

Модель получает мультимодальное сообщение. Наличие image tool само по себе не описывает этот входной путь. Для неподдерживаемой модели или большого файла сохраняется текстовая ссылка. При ошибке обработки изображения сервер создаёт warning. Текстовое сообщение может продолжить путь без картинки.

Submit проверяет путь, но доверяет клиентским полям `mime` и `size` в объекте передачи данных, DTO. Проверка 5 MiB в Commands использует `Attachment.size`, а не новый `stat`. Поэтому лимит загрузки и лимит image input дают разные гарантии. [Отчёт](PI-POCKET.md#существенные-проблемы) объясняет последствия для публичного адаптера.

Источники: [upload](https://github.com/TannerMidd/pi-pocket/blob/50194aa38eb368ef2cb8599d44fba81b05ed5263/src/server/http/conversation-routes.ts#L711-L763), [submit DTO/path](https://github.com/TannerMidd/pi-pocket/blob/50194aa38eb368ef2cb8599d44fba81b05ed5263/src/server/http/conversation-routes.ts#L43-L62), [image transformation](https://github.com/TannerMidd/pi-pocket/blob/50194aa38eb368ef2cb8599d44fba81b05ed5263/src/server/commands.ts#L132-L145), [resize](https://github.com/TannerMidd/pi-pocket/blob/50194aa38eb368ef2cb8599d44fba81b05ed5263/src/server/commands.ts#L196-L206), [model input](https://github.com/TannerMidd/pi-pocket/blob/50194aa38eb368ef2cb8599d44fba81b05ed5263/src/server/commands.ts#L775-L839), [stored image](https://github.com/TannerMidd/pi-pocket/blob/50194aa38eb368ef2cb8599d44fba81b05ed5263/src/server/transcripts.ts#L29-L101).

## Изменения относительно 0.26.0

GitHub compare сообщает о 596 commits между стабильными тегами. Это объём истории, а не показатель качества. В обеих версиях закреплён Durable 1.4.0.

В 0.27.0 добавлены Design systems, ask-карточки, Priority, описание возможностей расширений и отложенная загрузка инструментов через tool_search. Автор заявляет сокращение стартового prompt примерно с 7.9k до 3.9k токенов. Это заявление автора выпуска, а не наше измерение. Изменены Commands и conversation routes. HTTP, auth и events не выделены в новый независимый SDK.

Из локального checkout нельзя автоматически убрать изменения Hindsight, voice, BB-frame и loader. Сначала нужен отдельный реестр локальных патчей. Наличие этих файлов не доказывает их работоспособность или необходимость в новой архитектуре.

Последние изменения main после тега касаются npm publish. Среди недавно принятых PR есть desktop bridge #251, правки webhooks #243 и Figma scan #212. Эти PR относятся к другим веткам или будущему выпуску. Их нельзя автоматически относить к v0.27.0. Открытые PR включают OpenAI-compatible endpoints #255 и перенос больших Pi sessions #261. Эти возможности нельзя приписывать стабильному выпуску.

Источник: [release 0.27.0](https://github.com/TannerMidd/pi-pocket/releases/tag/v0.27.0), [compare](https://github.com/TannerMidd/pi-pocket/compare/v0.26.0...v0.27.0).

## Размещение, команды и настройки

Базовый вариант требует Node >=22.19, один процесс сервера и локальную SQLite. Cloudflare-инфраструктура не обязательна. Cloudflare quick tunnel и Tailscale обеспечивают варианты доступа. Проект описывает размещение через Docker, Podman, systemd и Nix.

Функции Browser и Design требуют Chromium. `gh` и другие программы нужны соответствующим расширениям. Это не edge-worker для Cloudflare Workers.

Ниже команды из интерфейса проекта. **Они не запускались в исследовании.**

| Задача | Команда |
|---|---|
| Запуск без web-клиента | `pi-pocket --access local --port 8787 --cwd /path/work --data /path/data` |
| Повтор прошлого способа доступа | `pi-pocket -y` |
| Явный адрес | `pi-pocket --host 127.0.0.1 --port 8787` |
| Справка | `pi-pocket --help` |
| Ротация owner token | `pi-pocket --rotate-token` отзывает прежний owner-доступ |

Основные переменные: `PI_POCKET_ACCESS`, `PI_POCKET_PORT`, `PI_POCKET_HOST`, `PI_POCKET_DIR`. `PI_POCKET_BROWSER` и `PI_POCKET_BROWSER_ARGS` выбирают Chromium и его аргументы. `PI_POCKET_CACHE_KEEPER=off` отключает подогрев prompt cache. `PI_POCKET_GUARD=off` отключает guard. Это не рекомендуемая настройка безопасности.

Конфигурация Pocket хранит пользователей, роли, настройки и токены. Pi хранит credentials провайдеров отдельно. Для VPS нужны ограниченный системный пользователь, закрытый сетевой доступ либо TLS-proxy и резервная копия всей папки данных. При переносе нельзя копировать owner token в BB или browser frontend.

Источники: [CLI options](https://github.com/TannerMidd/pi-pocket/blob/50194aa38eb368ef2cb8599d44fba81b05ed5263/src/launcher/options.ts#L1-L45), [deployment/limits](https://github.com/TannerMidd/pi-pocket/blob/50194aa38eb368ef2cb8599d44fba81b05ed5263/README.md#L31-L113), [Docker](https://github.com/TannerMidd/pi-pocket/blob/50194aa38eb368ef2cb8599d44fba81b05ed5263/docs/docker.md#L1-L55).
