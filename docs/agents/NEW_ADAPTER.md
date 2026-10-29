# Задание: реализовать отдельный client adapter

Сделай минимальный работающий адаптер для выбранного интерфейса поверх публичного dpi-sdk или HTTP/SSE. Клиент не должен владеть native runtime или SQLite.

## Входные параметры

- Интерфейс и его точный протокол/версия.
- Поддерживаемые операции и host capabilities.
- Выданные оператором identity/scope и доступный disposable test host.
- Какие существующие адаптеры нельзя менять.

## Готово, когда

- Отдельный tarball устанавливается без backend/native Storage/Harness/других адаптеров.
- Настоящий UI/API input достигает того же native conversation и даёт канонический результат.
- Lost ACK/reconnect сохраняют intent key и тело, не создавая второй ресурс или submission.
- Изменённый payload с тем же key конфликтует; revoke/foreign/stale targets запрещены до эффекта.
- Snapshot/stream dedup, unknown outcome и безопасный unknown-kind fallback проверены.
- Старый неизменённый адаптер продолжает работать на том же host.

## Источники и ограничения

Прочитай docs/BUILDING_ADAPTERS.md, текущие SDK wire types, исходный протокол интерфейса и docs/STATUS.md. Сначала используй существующий public API. Не выдумывай method/capability или native callback. Недостающий keyed primitive — явный unsupported либо отдельная обоснованная серверная доработка, но не volatile cache/fake ACK.

Не принимай actor/human/parent/tool поля пользовательского JSON за authority. Не подменяй immutable answerRef pagination cursor. Не создавай новую session или child вместо недоступного binding. Не отключай guards и не используй live credentials/models/production data для smoke.

## Проверка и отчёт

Проверь упакованный клиент в новом HOME/install directory с реальным native host и faux provider. Укажи hash пакета, команды, positive/negative/recovery результаты и границы fixture. Не выдавай pure helper tests за совместимость полной UI или production.
