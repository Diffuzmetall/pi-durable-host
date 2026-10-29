# Подключение клиентов

Сначала нужен запущенный host и выданный сервером credential. Адрес и выбранная session — не полномочия. Клиент не может превратить observer или delegated token в human grant.

## Терминал

Из source checkout:

```sh
(cd apps/terminal-adapter && npm ci --ignore-scripts)
(cd apps/terminal-adapter && npm pack --pack-destination ../../artifacts)
```

В отдельном install-каталоге установите **SDK и terminal tarball**, без backend/BB/iii:

```sh
npm install --ignore-scripts /PATH/dpi-sdk-0.1.0.tgz /PATH/dpi-terminal-adapter-0.1.0.tgz
# DPI_TOKEN уже безопасно установлен оператором в этом shell.
./node_modules/.bin/dpi-terminal http://127.0.0.1:4780 SESSION_ID
```

`DPI_URL` и `DPI_SESSION` заменяют позиционные значения. Терминал хранит локальный приватный журнал непонятного исхода отправки; он может содержать пользовательский текст. Не добавляйте его в Git.

Подробности: [terminal README](../apps/terminal-adapter/README.md).

## BB

BB adapter — provider-процесс с JSON-RPC по stdin/stdout. Не запускайте его как замену BB или как второй native runtime. Нужны совместимая версия Core и **доверенная серверная native-композиция**: стандартного минимального CLI для BB capabilities недостаточно.

Оператор выдаёт scope на точные session/conversation и `binding.bb: {providerId, threadId}`. Source grant — `bb`; Core owner proof и native binding проверяются до attachment и выполнения.

Переменные provider launch context:

| Переменная | Смысл |
|---|---|
| `DPI_BASE` | Адрес host |
| `DPI_TOKEN` | Серверный credential; никогда не поле пользовательского prompt |
| `DPI_SESSION` | Настоящий native session ID |
| `DPI_CONVERSATION` | Root conversation, по умолчанию `1` |
| `DPI_BB_THREAD` | Точный выбранный Core thread |
| `DPI_CWD` | Canonical workspace этого native Root |

Соберите BB пакет и установите его вместе с SDK в отдельный каталог. Provider command: `dpi-bb-provider`. Его stdout занят JSON-RPC: не добавляйте туда приветствия, debug logs или shell banner. Подробный контракт и ограничения: [BB README](../apps/bb-adapter/README.md).

**Текущие ограничения:** `/compact` отклоняется до эффекта и ACK; локальная приёмка не заменяет smoke на полной совместимой работающей версии BB. Случайный «похожий» BB thread или native child не должен автоматически создаваться вместо недоступного binding.

## iii

iii подключается как отдельный адаптер с подписанным ingress и server-owned delegated binding. Ключевые проверки: namespace/config identity, устойчивый job request key, настоящий native parent-control и immutable answer reference.

**Смотрите [текущий статус](STATUS.md):** до завершения сквозной приёмки это не готовая инструкция для production engine. Конфигурация клиента или `_caller_worker_id` не заменяет серверную авторизацию. Закрытие iii transport не должно отменять native job.

## Прямой SDK/HTTP

Для собственной UI можно использовать `DpiClient` из `dpi-sdk/client`, либо те же authenticated HTTP/SSE endpoints. Начальный рабочий пример — [quick start](GETTING_STARTED.md).

Снаружи доверенного loopback используйте HTTPS и ограниченную сеть. Не встраивайте operator token в публичный browser bundle. Новый UI должен поддерживать protocol/capability discovery, unknown outcomes и текущие права, а не только отрисовывать happy path.
