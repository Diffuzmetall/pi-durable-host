# Задание: подключить свой native Durable profile

Добавь доверенный серверный runtime profile для поддерживаемого Pi Durable 1.4.0 без fork публичного wire API и без runtime в клиентах.

## Входные параметры

- Нужные native extensions, модели/providers и инструменты.
- Стабильный profile ID, новый workspace/dataDir.
- Явные способы получения credentials и разрешённые external endpoints.
- Список ресурсов, которые обязаны быть изолированы между sessions.

## Готово, когда

- Profile выбирается серверным кодом и регистрирует настоящие native definitions.
- Сохранённые model IDs не заменяются молча.
- Per-session model/MCP/memory/env/log resources не смешиваются в двух sessions.
- Создание, native input/result, закрытие и reopen проверены на disposable faux fixture.
- Несовместимый profile/registry отказывает до resume; нет второго owner.
- Guards, current grants и human acceptance не ослаблены.

## Источники и ограничения

Прочитай docs/CUSTOM_RUNTIME.md, apps/dpi-backend/NATIVE.md, runtime-profile interfaces и выбранные native APIs текущей версии. Не импортируй модуль из клиентского HTTP body. Не считай обычные Pi extensions совместимыми с Durable по компиляции.

Не трогай production SQLite/личные memory banks/global config. Первые проверки — faux/loopback; реальные ключи, миграции и внешние расходы требуют отдельного согласования. Не делай permissive fallback для недоступного DCG/MCP/auth.

## Отчёт

Опиши минимальную серверную точку подключения, registry/profile compatibility, разрешения и lifecycle. Приведи реальные проверки/версии и явно оставшиеся риски. Не включай секреты или персональные paths в reusable пример.
