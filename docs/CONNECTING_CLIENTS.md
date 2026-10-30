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

**Совместимый Core:** для BB 0.47.1 примените [оба переносимых source patch](../compat/bb-0.47.1-native-child/README.md) к указанному upstream commit в отдельном disposable checkout. Stock `bb-app@0.47.1` не содержит prerequisite native interfaces. Source patches проверены на применение; полный upstream rebuild не выполнялся. Реальные Core/Chrome проверки относятся к точному hash-guarded binary overlay, а не к любой сборке патчей.

**Текущие ограничения:** `/compact` отклоняется до эффекта и ACK. Независимая локальная функциональная приёмка Core/Chrome пройдена с [оговоркой по исходному UI timeout](STATUS.md); это не production activation или latency SLA. Случайный «похожий» BB thread или native child не должен автоматически создаваться вместо недоступного binding.

## iii

iii подключается как отдельный адаптер с подписанным ingress и server-owned delegated binding. Ключевые проверки: namespace/config identity, устойчивый job request key, настоящий native parent-control и immutable answer reference.

Локальная сквозная приёмка пройдена: настоящий engine `iii --version` 0.24.6 и pinned `iii-sdk@0.24.6`, signed worker на loopback, native faux host, retry/conflict/revoke/control/restart и immutable result. Production deployment и живые модели не проверялись. Конфигурация клиента или `_caller_worker_id` не заменяет серверную авторизацию; закрытие transport не отменяет принятый native job.

После сборки SDK по [quick start](GETTING_STARTED.md), из корня checkout:

```sh
(cd apps/iii-adapter && npm ci --ignore-scripts)
(cd apps/iii-adapter && npm pack --pack-destination ../../artifacts)
```

В отдельном install-каталоге:

```sh
npm install --ignore-scripts /PATH/dpi-sdk-0.1.0.tgz /PATH/dpi-iii-adapter-0.1.0.tgz
./node_modules/.bin/dpi-iii-worker --help
```

Для запуска сначала оператор готовит trusted server composition с `native-iii.v2`, точный native root и delegated `binding.iii`. В private config входят opt-in, namespace, полный config hash, public Ed25519 signer и имя token environment variable. Сам token и private signing key в config/Git не помещаются. Полный формат, signed invocation и команда `dpi-iii-worker --config FILE`: [iii README](../apps/iii-adapter/README.md).

`start` возвращает admission, `run` ждёт native результат, `requests::get` сверяет прежний key. Для чтения после restart сохраняйте `answerRef`; при потере временного cursor начните paging заново с тем же reference. Pending stop не означает завершённый stop effect. Возможности и границы: [статус](STATUS.md).

## Прямой SDK/HTTP

Для собственной UI можно использовать `DpiClient` из `dpi-sdk/client`, либо те же authenticated HTTP/SSE endpoints. Начальный рабочий пример — [quick start](GETTING_STARTED.md).

Снаружи доверенного loopback используйте HTTPS и ограниченную сеть. Не встраивайте operator token в публичный browser bundle. Новый UI должен поддерживать protocol/capability discovery, unknown outcomes и текущие права, а не только отрисовывать happy path.
