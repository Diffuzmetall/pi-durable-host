# Задание: подключить клиент к существующему host

Подключи выбранный интерфейс к указанному Pi Durable Host, не создавая копию native session.

## Входные параметры

- Адрес host, точные session/conversation IDs.
- Тип клиента: terminal, BB или custom SDK.
- Имя переменной окружения с выданным credential; само значение не требуется в чате.
- Разрешён ли тестовый input и его безвредный текст. Без разрешения выполняй только чтение.

## Готово, когда

- Проверены текущие protocol/capabilities и scope.
- Открыта именно выбранная session/conversation; недоступный binding не заменён новой session или child.
- Snapshot/reconnect не дублирует историю; закрытие viewer не отменяет native работу.
- Если тестовый input разрешён, использован стабильный ключ и проверен native receipt/итог, а не только ACK.

## Контекст и границы

Прочитай docs/CONNECTING_CLIENTS.md, docs/STATUS.md и README нужного адаптера. Для BB требуется trusted native profile и настоящий Core/native owner proof; минимальный CLI не обещает эти capabilities. BB /compact явно unsupported. Для iii сначала проверь, завершена ли текущая сквозная приёмка.

Не делай observer/delegated credential «человеческим», не передавай authority через body, не меняй server grants самовольно. Не открывай server SQLite локально. Не записывай credential в URL, Git, screenshot или отчёт. Вне доверенного loopback требуй HTTPS/ограниченную сеть.

## Отчёт

Покажи совпадение выбранной identity, доступные capabilities, выполненные read/write checks и результат. При отказе сохрани причину и существующую identity; не скрывай проблему re-provision или новым request key.
