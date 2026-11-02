# BB через адаптер текущего Host

[Общая схема](README.md) · [Карта исходников](MAP.md) · [Технический контракт адаптера](../../apps/bb-adapter/README.md) · [Порядок подключения](BB-CONNECT.md)

Этот справочник описывает код и контракты адаптера. **Код существует, но полная интеграция с BB не принята.** Поэтому общая схема показывает BB пунктиром. Порядок будущего подключения вынесен в отдельную инструкцию. Документы не подтверждают активацию.

## Путь запросов и владельцы состояния

```text
BB UI
  ↕
BB Core
  ↕ JSON-RPC, JSON Lines через stdin/stdout
наш процесс dpi-bb-provider
  ↕ public dpi-sdk: HTTP /v1 + SSE
существующий Host: grants, admission, BB binding, native parent control
  ↕
тот же Durable Harness и session SQLite
```

BB Core запускает адаптер как процесс провайдера. В этом процессе [`main.ts`](../../apps/bb-adapter/src/main.ts) создаёт `DpiClient` и [`BbProviderBridge`](../../apps/bb-adapter/src/provider-bridge.ts). Адаптер преобразует запросы и события. Он не исполняет инструменты и не запускает второй backend.

Host хранит историю и задачи. BB показывает клиентскую проекцию истории, но не хранит её независимую исходную версию. Остановка процесса провайдера отключает наблюдение. Она не должна автоматически останавливать работу, которую native runtime уже принял.

BB владеет интерфейсом и транспортом провайдера. Адаптер переводит протокол. Host определяет полномочия, исполняет задачи и хранит долговечное состояние.

## Доверенная конфигурация запуска

Исполняемый файл `dpi-bb-provider` входит в пакет `apps/bb-adapter`. Рядом требуется совместимая версия `dpi-sdk`. Поля регистрации провайдера зависят от выбранной версии BB Core. Универсальная настройка BB здесь не определена.

Среда запуска содержит следующие значения.

| Переменная | Значение |
|---|---|
| `DPI_BASE` | URL существующего Host |
| `DPI_TOKEN` | BB credential, который выдал сервер. Допустим только в среде запуска, не в аргументе команды или теле JSON-RPC |
| `DPI_SESSION` | Точный существующий native session ID |
| `DPI_BB_THREAD` | Точный Root thread ID в BB |
| `DPI_CWD` | Канонический рабочий каталог на стороне Host |
| `DPI_CONVERSATION` | Native Root conversation ID. По умолчанию `1` |
| `DPI_BB_ENROLLMENT_FINGERPRINT` и `DPI_BB_ROOT_PROFILE_FINGERPRINT` | Оба значения вместе, если выбранный BB Core использует подготовленную регистрацию Root |

Общий операторский токен не заменяет BB credential. Серверная привязка должна содержать доверенный `source: 'bb'`, session/conversation и `bb: { providerId: 'pi-durable', threadId }`. Host определяет полномочия. Модель и BB-запрос не могут назначить их своими значениями.

## Контракты backend

Одного метода отправки текста недостаточно. Адаптеру нужны следующие контракты.

- BB binding проверяет владельца точной native цели.
- Native parent control и exact-target inspection обеспечивают управление и проверку точной цели.
- Outcome и history используют согласованный контракт, включая `native-bb-input.v1`.
- Core сохраняет request IDs. Native receipts и проверка повторного намерения исключают незаметную подмену запроса.
- Каталог и настройки моделей обеспечивают только явно разрешённую смену модели.
- Наблюдение и клиентская проекция не раскрывают закрытые данные.

Core `creq_…` сохраняются как идентификаторы намерений Root и child. После таймаута клиент не должен создавать новый ID. При регистрации native child адаптер сначала проверяет существующую цель, затем получает реальное подтверждение Core, ACK. Регистрация не создаёт второго native child.

При замене Host на Pocket, Zero или другой кандидат эти контракты потребуется сохранить либо заменить вместе с адаптером. Наличие HTTP и SSE само по себе не обеспечивает совместимость нового backend с нашим адаптером BB.

## Текущие ограничения

- Адаптер поддерживает входной текст и явно отклоняет вложения.
- Root и child отклоняют `/compact` до native-эффектов. Текущий путь не обеспечивает требуемую идемпотентность.
- Протокол не поддерживает controlled fork и установку провайдера.
- Клиент не может повышать полномочия, менять серверную binding или подменять native execution environment.
- [README адаптера](../../apps/bb-adapter/README.md) фиксирует историческую проблему child follow-up на выбранном Core: `has no live provider session`. Компонентные тесты не закрывают эту проблему. Текущее состояние BB в этой работе не проверялось.

## Исходники по областям

| Область | Исходник |
|---|---|
| Запуск, среда, JSON Lines | [`src/main.ts`](../../apps/bb-adapter/src/main.ts) |
| Методы провайдера и обратные вызовы Core | [`provider-bridge.ts`](../../apps/bb-adapter/src/provider-bridge.ts) |
| Root binding, отправка, наблюдение | [`session.ts`](../../apps/bb-adapter/src/session.ts) |
| Children и native-привязка | [`child-session.ts`](../../apps/bb-adapter/src/child-session.ts), [`native-child-binding.ts`](../../apps/bb-adapter/src/native-child-binding.ts) |
| Проекция и подтверждение истории | [`history-projector.ts`](../../apps/bb-adapter/src/history-projector.ts), [`history-sink.ts`](../../apps/bb-adapter/src/history-sink.ts) |
| Серверная привязка и права | [`native-profile/bb-binding`](../../apps/dpi-backend/src/native-profile/bb-binding), [`grants.ts`](../../apps/dpi-backend/src/grants.ts), [`routes.ts`](../../apps/dpi-backend/src/routes.ts) |
