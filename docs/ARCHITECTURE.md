# Архитектура: отдельные клиенты, один native owner

## Три слоя

1. **Client adapter** переводит действия интерфейса в публичный wire API. У него нет session SQLite или своего Harness.
2. **Host** проверяет credential, scope и protocol capabilities. Он управляет жизненным циклом sessions и открывает каждую базу одним активным владельцем.
3. **Native Pi Durable profile** определяет модели, registry, инструменты и политики. Состояние задач, документов, admission и recovery остаётся native.

Session — не HTTP-соединение и не BB thread. В session может быть несколько conversations, в том числе дочерние. Один conversation могут наблюдать несколько клиентов.

## Обычный запрос и потерянный ответ

```mermaid
sequenceDiagram
  participant U as Клиент
  participant H as Host API
  participant P as Native admission
  participant D as Durable state
  U->>H: Текст + устойчивый requestId
  H->>H: Текущий grant и capabilities
  H->>P: Разрешённый input
  P->>D: Native receipt и admission
  H-->>U: Receipt или потерянный сетевой ответ
  P->>D: Работа и сохранённый результат
  U->>H: Тот же requestId и то же тело
  H->>D: Сверить canonical receipt и fingerprint
  H-->>U: Та же работа, не новый запуск
  U->>H: Подписка или reconnect
  H-->>U: Snapshot, stream и доступный результат
```

**ACK не равен результату.** `queued`, работающий run, terminal outcome и неизвестный исход — разные состояния. Пустой stream, `busy=false` или исчезнувший task не доказывают успешного ответа.

Если повтор использует тот же key с другим текстом, mode или target, он должен получить conflict. Клиент не генерирует новый key автоматически, чтобы скрыть неоднозначность.

## Кому принадлежат полномочия

```mermaid
flowchart TD
  Q[Запрос клиента] --> A{Credential действителен?}
  A -->|нет| DENY[Отказ без эффекта]
  A -->|да| B{Текущий scope разрешает действие?}
  B -->|нет| DENY
  B -->|да| C{Native identity и revision совпадают?}
  C -->|нет| DENY
  C -->|да| N[Native admission или parent-control]
  N --> R[(Канонический receipt и результат)]
```

Поля `human`, `actor`, `source`, имя worker или инструменты в JSON не меняют серверный grant. Клиентская metadata — данные, не authority. Для child control нужны реальные parent/child/execution/request IDs и актуальная revision; generic abort не подменяет native stop.

## iii: подпись, job и сохранённый результат

```mermaid
sequenceDiagram
  participant E as iii caller
  participant W as Signed worker
  participant H as Host / current grant
  participant N as Native job journal
  E->>W: Signed session + function + payload + expiry
  W->>W: Verify Ed25519 / canonical JSON
  W->>H: SDK operation on trusted native root
  H->>H: Namespace / config / signer / delegated scope
  H->>N: Stable request key + fingerprint
  N-->>E: Canonical admission receipt
  N->>N: Execute and persist native answer
  E->>W: Signed requests::get / result
  W->>H: Reauthorize same binding / answerRef
  H-->>E: Immutable answer and verified pages
```

Disconnect ожидания не отменяет принятый job. `answerRef` адресует сохранённый native ответ в разрешённом binding; временный page cursor может сброситься при owner restart. Тогда чтение начинается заново с тем же reference, а не новым job key. У stop отдельно существуют принятый intent, pending receipt и реально завершённый native effect.

## Profile и изоляция

Каждая session получает собственные model capability, environment, MCP resources и пути логов. Нельзя выдавать успешный single-session тест за доказательство безопасности process-global интеграции в нескольких sessions.

Сохранённый profile ID и registry — часть совместимости. Нет нужной сохранённой модели или definitions — явная ошибка до resume, без тихого remap.

## Что не обещано

- Бесшовный live перенос owner между процессами.
- Подключение произвольной старой SQLite без проверки registry.
- Совместимость всех обычных Pi extensions после одной компиляции.
- Доказательство полного BB UI repaint по измерению API-delta.
- Production readiness по одному локальному faux smoke.

[План](PLAN.md) · [Проверенный scope](STATUS.md) · [Runtime profile](CUSTOM_RUNTIME.md) · [Новый адаптер](BUILDING_ADAPTERS.md). Приватная ISA и raw review-материалы не входят в публичную поставку.
