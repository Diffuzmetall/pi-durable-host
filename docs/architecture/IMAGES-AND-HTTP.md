# Проверка замечаний: изображения, Express и более лёгкий Host

[Оглавление](README.md) · [Карта файлов](MAP.md) · [Изменения относительно Disler](CHANGES.md) · [Вариант Zero](zero/README.md)

Проверяем переданные пользователем замечания автора Zero **по коду нашего fork**, а не автоматически переносим их с исходного dpi-backend. Основа — опубликованный снимок `830ad61a`; исходный Disler для сравнения — `37165c6`. Это source-level проверка, не новый runtime-тест и не benchmark.

## Краткий вердикт

| Тезис | Что установлено |
|---|---|
| «dpi-backend принимает только текст» | **Верно для публичного пути отправки пользовательского сообщения и у baseline, и у нашего снимка.** SDK и Store принимают строку, а не массив text/image blocks |
| «Там нет картинок вообще» | **Слишком широкое утверждение.** Есть WireImage в наблюдаемых сообщениях/tool results и отдельные инструменты работы с изображениями. Это не image input API |
| «У вас остался Express» | **Да.** Express 5 заявлен dependency, а сервер действительно создаётся через `express()` |
| «Именно Express делает Host тяжёлым» | **Не установлено.** Нет сравнительных замеров с тем же runtime, профилем и нагрузкой |
| «Zero сам снимет эти ограничения» | **Не доказано.** Stock Zero bootstrap не закрывает наш полный lifecycle/security/UI/reload-контракт; входные вложения всё равно требуют согласованного клиентского и серверного пути |

## 1. Входные изображения: где именно ограничение

Проверяем не наличие слова `image`, а реальный путь пользовательского запроса:

```text
SubmissionJournal.text / wireText: string
  → dpi-sdk Agent.send(content: string)
  → SendMessageBody.content: string
  → POST .../messages
  → Store.send: typeof body.content === "string"
  → Conversation.submit({ type: "input", content, ... })
```

Источники:

- [`submission-journal.ts`](../../apps/terminal-adapter/src/submission-journal.ts), `PendingSubmission`: сохраняет строковый текст и необязательный строковый `wireText`.
- [`client.ts`](../../apps/dpi-sdk/src/client.ts), `Agent.send`: аргумент `content: string`.
- [`api.ts`](../../apps/dpi-sdk/src/api.ts), `SendMessageBody`: `content: string`.
- [`routes.ts`](../../apps/dpi-backend/src/routes.ts): сообщение передаётся в `store.send`.
- [`store.ts`](../../apps/dpi-backend/src/store.ts), `send`: отбрасывает нестроковое, пустое или более 100 000 символов `body.content`; эта же строка участвует в fingerprint и native submit.

Следовательно, передать массив image/text blocks через этот endpoint нельзя: серверная проверка отклонит его. Передать в тексте путь к файлу — не то же самое, что прикрепить изображение к native user message.

**Мы это ограничение пока не исправили.** Оно присутствовало и в [baseline SDK](https://github.com/disler/durable-pi/blob/37165c619573dbaf425463038bbffecfe576beec/apps/dpi-sdk/src/api.ts), и в [baseline Store](https://github.com/disler/durable-pi/blob/37165c619573dbaf425463038bbffecfe576beec/apps/dpi-backend/src/store.ts).

### Почему при этом в проекте есть изображения

В [`api.ts`](../../apps/dpi-sdk/src/api.ts) тип `WireImage` содержит `type`, `data`, `mimeType`; `WireUserMessage` и `WireToolResultMessage` могут содержать такие блоки. Это формат **наблюдения/истории**, не входной DTO `SendMessageBody`. Присутствие wire-типа само по себе не доказывает визуальный рендер в каждом клиенте.

Кроме того, в [`tools/codex`](../../apps/dpi-backend/src/native-profile/tools/codex) есть `ask.ts` и `image.ts`, а в [`tools/antigravity`](../../apps/dpi-backend/src/native-profile/tools/antigravity) — генерация и сохранение изображений. Это отдельные tool-пути со своей доступностью и авторизацией. Они не делают endpoint отправки сообщений мультимодальным.

### Минимальная область будущего исправления

1. Согласовать typed input content в SDK и native boundary: текст, image blocks либо проверяемые attachment references. Выбор формата ещё не принят.
2. Проверять MIME, размер, число вложений и полномочия на файлы на серверной границе. Не принимать произвольный путь сервера как разрешение читать файл.
3. Включить неизменяемое содержимое/идентичность вложений в request fingerprint и восстановление journal. Тот же requestId не должен начать означать другую картинку.
4. Передавать содержимое в native submit, сохраняя admission, receipt/reconcile и redaction.
5. Добавить клиентское прикрепление и сквозные проверки: успешный ввод, отказ по лимиту/правам, повтор после потери ответа, несовместимый provider и восстановление клиента.

Это карта работ, **не реализованная функция и не разрешение на миграцию**.

## 2. Express: факт, стоимость и граница замены

[`apps/dpi-backend/package.json`](../../apps/dpi-backend/package.json) содержит `express: ^5.1.0`. В [`http-server.ts`](../../apps/dpi-backend/src/http-server.ts) действительно создаётся Express app, монтируются `/v1`, auth, `express.json({ limit: "256kb" })`, маршруты, 404 и error middleware. Это не оставшийся неиспользуемый dependency.

Однако «убрать Express» — не только заменить эти 22 строки. Express-типы и request/response-семантика используются ещё в:

- [`routes.ts`](../../apps/dpi-backend/src/routes.ts): Router и обработчики;
- [`auth.ts`](../../apps/dpi-backend/src/auth.ts): middleware и привязка admission identity;
- [`errors.ts`](../../apps/dpi-backend/src/errors.ts): единый формат ошибок;
- [`streams.ts`](../../apps/dpi-backend/src/streams.ts): SSE, завершение/отключение клиента и управление потоком.

JSON-лимит 256 KiB относится к HTTP body; ограничение Store — 100 000 символов текста. Это разные единицы и разные проверки. Добавление base64-вложений без пересмотра обоих ограничений не создаёт рабочий image API.

### Что даст более тонкая HTTP-оболочка

Можно отдельно сравнить сохранение Express, `node:http` и fetch-style router. Замена может сократить транспортные зависимости, но не уберёт Harness, session SQLite, model clients, MCP, memory, tracing, историю или extensions. Она также не завершит перенос native API в глубокий модуль.

Перед выбором полезно измерить **одну и ту же сборку профиля**: cold start, idle RSS/heap, число открытых сессий, HTTP latency, SSE throughput/backpressure и восстановление после disconnect. Нужны одинаковые данные, native-версия и нагрузка; измерять следует в изолированной среде, не на рабочем Host. В этой работе таких замеров нет.

Независимо от framework сохраняются auth/scope, body limits, wire errors, abort, SSE cleanup, idempotency и reconciliation. Отключение клиента не должно случайно отменять уже принятую native работу.

## 3. Как это связано с Zero

[Вариант C](zero/THINK.md) — использовать публичные компоненты неизменённого Zero во внешней композиции и сохранить единственного native-владельца. Это более реалистичный кандидат для полного профиля, чем объявить `openDurable({ builtins })` готовой drop-in заменой.

У stock `openDurable()` есть полезная native registration, но оно само создаёт model/execution runtime, вызывает `resume()` до возврата и не отдаёт исходный Storage. Нашим lifecycle/security-компонентам нужны иные точки подключения. Подробные ограничения — в [OBSERVE](zero/OBSERVE.md), варианты — в [THINK](zero/THINK.md), предложенные пакеты — в [EXTENSIONS](zero/EXTENSIONS.md).

**Практический вывод:** замечания про текстовый input и оставшийся Express справедливы. Из них не следует, что fork вообще не умеет работать с изображениями, что Express — доказанный источник тяжести или что Zero можно подставить без отдельной интеграционной работы. Решение о реализации варианта C пока не принято.
