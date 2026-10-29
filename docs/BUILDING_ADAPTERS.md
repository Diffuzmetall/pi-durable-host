# Новый адаптер: что нужно реализовать

Новый интерфейс не должен знать, как устроены Harness, native registry или session SQLite. Его граница — публичный SDK либо тот же HTTP/SSE API.

## Минимальный вертикальный сценарий

1. Получить endpoint и credential от оператора, без записи секрета в Git или browser bundle.
2. Прочитать `client.protocol()` и проверить нужные capabilities **до mutation**.
3. Открыть выбранные session/conversation. Смена UI не означает создание новой session.
4. Отправить input с устойчивым ключом. При неизвестном исходе сохранить точное тело и ключ, а не повторять как новую работу.
5. Показать snapshot и stream; reconnect приводит к тому же набору entries без дублей.
6. Получить настоящий native receipt и результат. Закрытие viewer не отменяет работу.

Пример обычной операции:

```js
import { DpiClient } from 'dpi-sdk/client';
const client = new DpiClient(baseUrl, operatorSuppliedToken);
const root = client.agent(sessionId, conversationId);
const receipt = await root.send(text, 'followUp', stableRequestId, 15000);
const entries = await root.entries();
```

`baseUrl`, credential, identity и `stableRequestId` приходят из вашего UI/операторской конфигурации. Не заменяйте их случайными значениями при retry.

## Контракты, которые нельзя пропустить

| Ситуация | Ожидаемое поведение |
|---|---|
| Старый host без capability | Явный unavailable до mutation |
| HTTP ответ потерян | Сверка canonical receipt по прежнему intent |
| Тот же ключ, другое тело | Conflict, а не cached success |
| Snapshot после reconnect | Dedup и совпадение актуального состояния |
| Unknown render kind | Безопасный текст, без исполнения данных |
| Credential отозван | Новые операции и защищённый stream прекращаются |
| Observer/delegated просит human effect | Отказ без эффекта |
| Viewer закрыт | Native job продолжает работать |
| Parent control | Настоящие target IDs/revision, не UI-метаданные |
| Нет keyed native primitive | Явный unsupported, не локальный fake ACK |

Для своего renderer сохраняйте native identities, не выдавайте stream cursor за immutable answer reference. Данные инструмента остаются данными; неизвестный JSON нельзя исполнять как команду.

## Отдельный пакет

Собирайте адаптер отдельно. Runtime dependencies клиента не должны включать `dpi-backend`, `@earendil-works/pi-durable`, SQLite, Harness или другой адаптер. Dev/test fixtures могут запускать настоящий backend снаружи install-каталога клиента; это не разрешает скрыть runtime dependency в bundle.

Проверяйте **упакованный tarball** в новом HOME/install-каталоге, не только workspace с symlink-зависимостями. Отдельно запускайте старый неизменённый адаптер на том же новом host: одинаковый номер `0.1.0` не доказывает одинаковые байты.

## Приёмка

Нужен один настоящий сквозной путь и его отрицательные/recovery случаи, а не scaffold с фиктивными callback. Для native authority используйте реальный server profile, временный workspace и faux provider. Живые модели, сторонний production и пользовательские базы не нужны.

Не расширяйте host API на всякий случай. Сначала проверьте существующие SDK методы; новый endpoint оправдан конкретным недостающим контрактом и проверкой.
