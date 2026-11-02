# Справочник сравнения кандидатов

[Оглавление](README.md) · [Рекомендации](SUMMARY.md) · [Метод проверки](EVIDENCE.md)

Дата исследования: 2 ноября 2026 года. Возможности ниже подтверждены чтением исходников, если строка не указывает иной статус.

Отсутствие найденного API не доказывает невозможность его реализации. Ни один кандидат не прошёл здесь сквозную проверку с нашим профилем.

## Версии и назначение

| Кандидат | Исследованная версия | Pi Durable | Назначение | Лицензия |
|---|---|---|---|---|
| [Pi Pocket](PI-POCKET.md) | `v0.27.0`, `50194aa` | `1.4.0` | Готовое серверное приложение с web-интерфейсом | MIT |
| [Ultimate](ULTIMATE-RECURSE.md) | Стабильного выпуска нет, `9300a24` | `1.5.0` | Локальное серверное приложение для проекта | MIT |
| [Recurse](ULTIMATE-RECURSE.md) | `v0.1.0`, `6e4d231` | `1.3.0` | Приложение для разговоров, агентов и рабочих каталогов | MIT |
| [SRE Agent](SRE-COMPONENTS.md) | Стабильного выпуска нет, `d6218a8` | `1.3.0` | Одноинцидентное SRE-приложение | Не установлена |
| [Components](SRE-COMPONENTS.md) | `v0.10.0`, `63414a3` | Точные peer dependencies `1.4.0` | Библиотеки для существующего Host | MIT |
| [Cloudflare](CLOUDFLARE-AGENTRUN.md) | Стабильного выпуска нет, `fc596b2` | `1.4.0` | Пример приложения на Workers и Durable Objects | MIT |
| [AgentRun](CLOUDFLARE-AGENTRUN.md) | Стабильного выпуска нет, `e29803d` | Serve требует `>=1.1.0 <1.4.0` | Сервер запусков, библиотеки и workflow | Apache-2.0 |
| [Zero](../zero/README.md) | Ранее исследованный `v0.7.0`, `b2e21df` | `1.5.0` | Библиотечная основа и runner | MIT |
| [Наш Host](../MAP.md) | Опубликованный снимок `830ad61` | Основные manifests `1.4.0`, кандидат `1.5.0` | Наш серверный профиль и клиентский контракт | См. лицензии компонентов |

Полные commit IDs находятся в индивидуальных отчётах. AgentRun исследован на закреплённом commit, а не на последнем beta-теге. Версии Zero и нашего Host служат базой сравнения, а не новой проверкой последних выпусков.

## Входные изображения

| Кандидат | Публичный путь | Ограничение |
|---|---|---|
| Pocket | Upload, проверка пути сессии, resize, native image blocks | Submit доверяет переданным `mime` и `size`. Ошибка может оставить только текст |
| Ultimate | Base64 DTO, MIME и лимиты, native image blocks | Нет проверки raster signature в обработчике. Доставка конкретному провайдеру не запускалась |
| Recurse | Upload, owner-scoped attachment IDs, подготовка raster, native image blocks | Только нужный operator API. Service API принимает текст. Ошибка обработки может исключить изображение |
| Cloudflare | Chat DTO принимает `content: string` | Binary frames отклоняются. Пути вложения до модели не найдено |
| AgentRun | Chat принимает текст, непустые `file_ids` отклоняются | Встроенное преобразование PDF для workflow не заменяет chat attachment API |
| SRE Agent | DTO инцидента содержит строки и число | Общего пути пользовательских изображений не найдено |
| Components | Context передаёт native draft | Загрузку, проверку и хранение вложений обеспечивает приложение |
| Наш Host | `SendMessageBody.content: string` | Image tools и типы истории не дают входного attachment API |

## Повтор после потери ответа

| Кандидат | Что есть | Что мешает нашему контракту |
|---|---|---|
| Pocket | Actor-scoped `requestId`, поиск прежнего submission | Преобразование ID может дать коллизию. Отдельный reconcile не найден. Создание сессии не принимает requestId |
| Ultimate | Native submission ID возвращается после приёма | HTTP не передаёт клиентский `requestId` в `conversation.submit` |
| Recurse | Operator `client_message_id` становится native `requestId` | Ограниченный service API не принимает этот ID. Повтор interrupt требует проверки |
| Cloudflare | Командные request IDs, серверные receipts, повтор команды после reconnect | Клиентский outbox хранится в памяти. Полного долговечного журнала намерений нет |
| AgentRun | `Idempotency-Key`, fingerprint и сохранённый ответ | Ключ записывается после операции. Сбой до записи оставляет возможность повторного исполнения |
| Components | Context receipts по conversation и requestId | Это не actor-bound и payload-bound admission нашего Host |
| SRE Agent | Incident IDs и approval gate IDs | Нет универсального контракта пользовательских сообщений |
| Наш Host | Receipt, reconcile, actor-scoped ключи и fingerprint | Полная миграционная сборка ещё не принята |

Это сравнение механизмов в исходниках. Аварийные тесты кандидатов не запускались.

## Расширения и подключение клиентов

| Кандидат | Расширения | Клиенты без браузера | Наш BB-адаптер без изменения |
|---|---|---|---|
| Pocket | Native drop-ins, watcher, cleanup и reload | HTTP, SSE и long-poll | Нет, нужны другой протокол и серверные привязки |
| Ultimate | Native factories и lifecycle, загрузка через Vite | HTTP и SSE | Нет, нужны повторные запросы и отображение полномочий |
| Recurse | Native registry в исходниках, MCP | HTTP, SSE, отдельный service API | Нет, ограниченный API не даёт полный контракт |
| Cloudflare | Native registry примера | WebSocket-команды | Нет, нужны другой транспорт и авторизация |
| AgentRun | ToolHost и заданная сервером композиция | HTTP, SSE, timeline и MCP endpoint | Нет, нужны привязки, права и безопасный приём запроса |
| Components | Native extensions и lifecycle для чужого Harness | Приложение задаёт транспорт | Не заменяет backend, может работать внутри прежнего Host |
| SRE Agent | CodingTools и workflow инцидента | HTTP JSON и polling | Нет общего session contract |

Обычный Pi `ExtensionAPI`, native Durable extension и расширение Pocket имеют разные контракты. Наличие registry не доказывает совместимость любого Pi-пакета.

MCP endpoint AgentRun предоставляет внешнему клиенту управление сервером. Он не заменяет исходящие MCP-подключения инструментов нашего агента.

## Размещение и владельцы состояния

| Кандидат | Размещение | Владелец состояния |
|---|---|---|
| Pocket | Node на VPS, один серверный процесс | Один Harness и `pocket.sqlite` для нескольких сессий |
| Ultimate | Node >=26 на VPS, проектная среда и порт | Harness и SQLite в project home |
| Recurse | Bun >=1.4.0 на VPS, supervisor, SQL worker и tool processes | Harness на разговор, отдельный SQLite. Side forks используют родительский Harness |
| Cloudflare | Workers, Durable Objects, SQLite и alarms | Durable Object и native Harness |
| AgentRun | Node или контейнер на VPS, постоянный каталог | Server catalog и отдельный native процесс на run |
| Components | Внутри выбранного Host | Harness и Storage, переданные приложением |
| SRE Agent | Локальный Node и Bash | Один Harness, JSONL и состояние инцидента |
| Наш Host | Общий сервер для SDK-клиентов | Store, каталог и отдельные session Harness |

Поддержка VPS не означает изоляцию недоверенных пользователей средствами ОС. Сохранение transcript не означает восстановление процесса инструмента. Восстановление native-задачи не гарантирует однократный внешний эффект.

## Принятые и непринятые выводы

Статическое исследование подтверждает различия API, зависимостей и lifecycle. Оно не подтверждает преимущество памяти, скорости или полной стоимости поддержки.

Готовой замены нынешнего Host с сохранением всех функций не найдено. Полная совместимость истории, работающих задач, credentials и BB-привязок не проверена.
