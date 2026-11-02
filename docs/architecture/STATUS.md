# Состояние снимка: 2 ноября 2026 года

[Архитектура с диаграммами](README.md) · [Состав публикации](PUBLICATION.md)

## Итог

**WIP / NOT RELEASE-READY.** Публикуется код незавершённой миграции, чтобы его можно было изучать и обсуждать. Это не установочный архив, не независимо принятый кандидат и не обновление работающего Host.

Исходники зафиксированы **2026-11-02, 19:24:25 UTC**, поверх `bb51571bbc3a545226cf2c1aacaf649ac6456112`. Дальнейшие изменения общей рабочей копии не входят в этот снимок.

## Что есть в коде

| Область | Факт снимка | Ограничение |
|---|---|---|
| Host | Авторизация, grants, Store, каталог, native profile, HTTP/SSE | Полный backend ещё зависит от native API 1.4 |
| SDK | HTTP/SSE client, wire contract, receipts, observation | Наличие нового observation-контракта не означает его полную серверную интеграцию |
| Терминал | Remote controller, TUI, журнал отправок, reconcile, models/skills/reload | Общий typecheck не проходит с имеющимися зависимостями |
| iii | Отдельный SDK-клиент с подписанными вызовами | Новый end-to-end прогон в этой публикации не выполнялся |
| Runtime-модуль | `DurableSession`, native operations, projection, lifecycle и shared state | Реализована часть контракта; routes/streams ещё используют native handles |
| Hot reload | Prepare/validate/publish/drain, проверка состояния и очистка | Не равно горячей замене ядра Durable |
| Миграция 1.5 | Target manifests, patch, компонентные фикстуры и отчёты | Корневые manifests backend остаются на 1.4.0 |
| BB | Исходники и фикстуры сохранены | Направление отложено, UI не принят |

## Свежие проверки именно этого снимка

Статические проверки выполнены **2 ноября 2026 года, около 19:27 UTC** в отдельной копии. Команда для каждого пакета: `node <typescript>/bin/tsc --noEmit -p .`. Использован TypeScript **5.9.3** и уже установленные деревья зависимостей; backend и reload разрешают Durable **1.4.0**. Чистой установки зависимостей из сети не было.

| Пакет | Результат | Exit code | Диагностики TypeScript |
|---|---|---:|---:|
| `apps/dpi-sdk` | PASS | 0 | 0 |
| `apps/dpi-backend` | FAIL | 2 | 107 |
| `apps/terminal-adapter` | FAIL | 2 | 87 |
| `apps/iii-adapter` | PASS | 0 | 0 |
| `packages/durable-reload` | PASS | 0 | 0 |

**Существенные диагностики:**

- Backend: в разрешённом Durable 1.4 нет `COMMIT_AUTHORIZATION_REVISION`, `ConversationIdle`, `Observation` и нового `beforeCommit`.
- Terminal check захватывает также импортируемые backend-файлы и тесты. Среди ошибок — отсутствующий `observeCommits`, новые usage-поля и несовпадение exports установленной сборки `@local/pi-durable-reload`.
- Это обнаруженные несовпадения снимка и имеющегося dependency tree, а не заявление, что простая замена версии исправит все 194 диагностики.

`git diff --cached --check` сообщил 22 предупреждения о trailing whitespace внутри трёх сохранённых `.patch`-файлов MCP. Их байты оставлены без изменения: это материал исходного эксперимента, не форматирование новой документации.

Проверка типов не запускает Host, модель или production-сессию. **Полная сборка, runtime-тесты, чистая установка, новая независимая приёмка и проверка запущенных служб в рамках публикации не выполнялись.** Не следует переносить старый PASS на этот Git-коммит.

## Компонентные отчёты, которые вошли в снимок

Ниже — результаты, записанные исполнителями для своих изолированных кандидатов. При публикации они не запускались повторно и не считаются проверкой всего текущего дерева.

- [Configure/discovery/shared state](../../experiments/durable-module-20261102/runtime/configure-discovery/REPORT.md): отчёт о 22 PASS и strict compilation; прямо оставляет Host integration открытой.
- [DeLM/automation](../../experiments/durable-module-20261102/delm-automation/REPORT.md): 19 PASS на реальных Harness/SQLite с faux providers; не packaged acceptance.
- [Native commit authorization](../../experiments/durable-module-20261102/runtime/COMMIT-AUTHORIZATION.md): описание локального патча, RED/GREEN и пределов его гарантии.
- [Dependency qualification](../../experiments/durable-module-20261102/packaging/QUALIFICATION.json): `COMPONENT_VERIFIED_DEPENDENCY_CLOSURE_NOT_ACCEPTED`.
- [D0 review](../../experiments/durable-module-20261102/review/D0.md): ревью контракта, не доказательство полного HTTP-пути.

Ссылки внутри исторических отчётов могут вести к операторским `/tmp`-каталогам и raw logs, которых намеренно нет на GitHub. Публикуются исходники и описание доказательств, а не приватные runtime-данные.

## Что мешает считать миграцию законченной

1. **Единый runtime owner в реальном Host.** Нужно закончить перенос routes, streams и Store на семантический контракт, без второго Harness и копирования native state machine.
2. **Одинаковый клиент для 1.4 и 1.5.** Нужны отдельные сборки и отдельные базы, реальные HTTP/SSE roundtrips и проверка результатов, а не только импортов.
3. **Сторонние компоненты и пакеты.** В частности, принятого полного решения для GipPity 0.10.0 и удалённого `watchEvents` ещё нельзя вывести из наличия адаптации в experiments.
4. **Безопасность и восстановление.** Исторические auth/isolation и release-return ограничения не снимаются публикацией кода. Отчёты: [restart repair](../host-design/verification/restart-repair-20261101/REPORT.md), [hot-update](../host-design/verification/hot-update-20261101/REPORT.md).
5. **Повторяемый неактивированный release.** Нужны независимые source/installed проверки одного и того же digest и закрытые критерии DM1.

**Нельзя запускать 1.4 на базе, изменённой 1.5.** Восстановление старого backup и возврат с сохранением новой истории — разные гарантии. Совпадающий SQL schema не доказывает downgrade safety.

## Чего публикация не меняет

Работающий Host, его установленный release, конфигурация, credentials и базы не переключались и не перезапускались. `main` не обновляется. Работа команды в исходной ветке продолжается независимо от этой обзорной копии.
