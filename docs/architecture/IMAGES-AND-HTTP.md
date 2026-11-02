# Изображения и Express: выводы по исходникам

[Оглавление](README.md) · [Карта файлов](MAP.md) · [Изменения относительно Disler](CHANGES.md) · [Вариант Zero](zero/README.md)

Этот документ объясняет замечания автора Zero, которые передал пользователь. Проверка относится к коду нашего fork, а не автоматически повторяет выводы об исходном dpi-backend.

Основа проверки: опубликованный снимок `830ad61a`. Baseline Disler для сравнения: `37165c6`. Это проверка исходников, а не новый runtime-тест или замер производительности.

## Вывод

Замечания о текстовом вводе и сохранённом Express верны. Публичный путь отправки пользовательского сообщения принимает строку как в baseline, так и в нашем снимке. SDK и Store не принимают массив text/image blocks.

Утверждение об отсутствии изображений во всём проекте слишком широко. История и tool results поддерживают `WireImage`. Отдельные инструменты работают с изображениями. Эти возможности не создают API для входного изображения пользователя.

Express 5 указан в зависимостях и используется через `express()`. Однако его влияние на ресурсы всего Host не установлено. Сравнительных замеров с одинаковыми runtime, профилем и нагрузкой нет.

Zero не является доказанным способом устранить эти ограничения без интеграции. Stock bootstrap не закрывает наш полный lifecycle/security/UI/reload-контракт. Входным вложениям по-прежнему нужен согласованный клиентский и серверный путь.

## 1. Где ограничен ввод изображений

Проверка прослеживает пользовательский запрос, а не наличие слова `image` в коде.

```text
SubmissionJournal.text / wireText: string
  → dpi-sdk Agent.send(content: string)
  → SendMessageBody.content: string
  → POST .../messages
  → Store.send: typeof body.content === "string"
  → Conversation.submit({ type: "input", content, ... })
```

Путь подтверждают следующие исходники.

- [`submission-journal.ts`](../../apps/terminal-adapter/src/submission-journal.ts) определяет `PendingSubmission`. Он сохраняет строковый текст и необязательный строковый `wireText`.
- [`client.ts`](../../apps/dpi-sdk/src/client.ts) определяет `Agent.send` с аргументом `content: string`.
- [`api.ts`](../../apps/dpi-sdk/src/api.ts) определяет `SendMessageBody.content: string`.
- [`routes.ts`](../../apps/dpi-backend/src/routes.ts) передаёт сообщение в `store.send`.
- [`store.ts`](../../apps/dpi-backend/src/store.ts), метод `send`, отклоняет нестроковый, пустой или превышающий 100 000 символов `body.content`. Эта строка участвует в fingerprint и native submit.

Массив image/text blocks не пройдёт серверную проверку endpoint. Путь к файлу внутри текста не равен изображению в native user message.

Наш fork пока не исправляет это ограничение. Оно присутствовало в [baseline SDK](https://github.com/disler/durable-pi/blob/37165c619573dbaf425463038bbffecfe576beec/apps/dpi-sdk/src/api.ts) и [baseline Store](https://github.com/disler/durable-pi/blob/37165c619573dbaf425463038bbffecfe576beec/apps/dpi-backend/src/store.ts).

### Изображения в истории и инструментах

В [`api.ts`](../../apps/dpi-sdk/src/api.ts) тип `WireImage` содержит `type`, `data` и `mimeType`. `WireUserMessage` и `WireToolResultMessage` могут содержать эти блоки.

Эти типы описывают наблюдение и историю, а не входной DTO `SendMessageBody`. Наличие wire-типа также не доказывает визуальный рендер в каждом клиенте.

В [`tools/codex`](../../apps/dpi-backend/src/native-profile/tools/codex) находятся `ask.ts` и `image.ts`. [`tools/antigravity`](../../apps/dpi-backend/src/native-profile/tools/antigravity) генерирует и сохраняет изображения. Это отдельные tool-пути со своей доступностью и авторизацией. Они не добавляют мультимодальный ввод endpoint сообщений.

### Область будущего исправления

Согласованный путь должен охватывать SDK, native boundary, серверную проверку, fingerprint, journal, native submit и клиентское прикрепление. Формат typed input ещё не выбран. Возможны image blocks или проверяемые attachment references.

Будущие действия и проверки описаны в [плане проверки ввода и HTTP](INPUT-AND-HTTP-CHECKS.md). Это карта работ, а не реализованная функция или разрешение на миграцию.

## 2. Express и граница его замены

[`apps/dpi-backend/package.json`](../../apps/dpi-backend/package.json) содержит `express: ^5.1.0`. [`http-server.ts`](../../apps/dpi-backend/src/http-server.ts) создаёт Express app. Он монтирует `/v1`, auth, `express.json({ limit: "256kb" })`, маршруты, 404 и error middleware.

Express остаётся используемой зависимостью. Его замена затрагивает больше, чем эти 22 строки. Express-типы и request/response-семантика участвуют в следующих компонентах:

- [`routes.ts`](../../apps/dpi-backend/src/routes.ts) задаёт Router и обработчики;
- [`auth.ts`](../../apps/dpi-backend/src/auth.ts) задаёт middleware и admission identity;
- [`errors.ts`](../../apps/dpi-backend/src/errors.ts) задаёт единый формат ошибок;
- [`streams.ts`](../../apps/dpi-backend/src/streams.ts) задаёт SSE, завершение, отключение клиента и управление потоком.

JSON-лимит 256 KiB относится к HTTP body. Store ограничивает текст 100 000 символами. Единицы и проверки различаются. Добавление base64-вложений без пересмотра обоих ограничений не создаёт рабочий image API.

### Возможный эффект более тонкого HTTP-слоя

Можно отдельно сравнить Express, `node:http` и fetch-style router. Замена может сократить транспортные зависимости. Она не уберёт Harness, session SQLite, model clients, MCP, memory, tracing, историю или extensions. Она также не завершит перенос native API в отдельный модуль.

Для выбора нужны cold start, idle RSS/heap, число открытых сессий, HTTP latency, SSE throughput/backpressure и восстановление после disconnect. Сравнение должно использовать одинаковые профиль, данные, native-версию и нагрузку. Измерения нужны в изолированной среде, а не на рабочем Host. В этой работе таких замеров нет.

Независимо от framework требуется сохранить auth/scope, body limits, wire errors, abort, SSE cleanup, idempotency и reconciliation. Отключение клиента не должно отменять native работу, которую сервер уже принял.

## 3. Почему Zero не является готовой заменой

[Вариант C](zero/THINK.md) предлагает использовать публичные компоненты неизменённого Zero во внешней композиции. Единственный native-владелец сохраняется. Для полного профиля этот кандидат реалистичнее, чем предположение о готовой замене через `openDurable({ builtins })`.

Stock `openDurable()` предоставляет native registration. Но он сам создаёт model/execution runtime, вызывает `resume()` до возврата и не отдаёт исходный Storage. Нашим lifecycle/security-компонентам нужны другие точки подключения.

Ограничения описаны в [OBSERVE](zero/OBSERVE.md), варианты в [THINK](zero/THINK.md), предложенные пакеты в [EXTENSIONS](zero/EXTENSIONS.md).

Текстовый input и сохранённый Express не означают полного отсутствия работы с изображениями. Они также не доказывают, что Express вызывает высокое потребление ресурсов или что Zero подключается без отдельной интеграции. Решение о реализации варианта C пока не принято.
