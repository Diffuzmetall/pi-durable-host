# Ревью плана горячего обновления Durable

Дата: 2026-11-01. Автор: BronzeMink. Кандидат: [PLAN.md, R4](PLAN.md).

**Тип: self-review, не независимое ревью.** Проверены исходники, требования, последовательность срезов и границы полномочий. Продуктовые тесты, runtime probes и production activation **NOT RUN**. Новые агенты и задачи DeLM для ревью не создавались.

## Вердикт

**Готов к передаче существующей команде и началу S1 в утверждённых границах.** Пользователь разрешил реализацию reuse-first плана, потребовав продуктовые критерии, простой rollback и отдельное переключение Host только после всех работ. Это не проект нового hot-update framework. D01/D02 выбраны без watcher/global fan-out. Реализуемость всех ресурсных адаптеров проверяется в S5; отсутствие такого доказательства не скрыто словом «готово».

## Что изменилось после замечания пользователя

R1/R2 слишком рано предписывали общие revisions, metadata bindings, watchers и управление поколениями. Пользователь потребовал сначала брать старую реализацию. Прочитаны непосредственно старые `DurableExtensions`, обработчик `/reload` в Durable runtime, Hindsight controller, а также `ResourceLoader.reload` и `AgentSession.reload` обычного Pi.

R3 содержит карту «старый источник → готовая функция → текущий перенос → минимальная адаптация». Обязательные новые managers, manifests, storage schema и status protocol сняты. Автоматический trigger и массовая рассылка отделены от широкого ручного `/reload` и требуют отдельного продуктового выбора. Цель без рестарта и корпус U01–U18 сохранены; это изменение способа реализации, а не исключение неудобных интеграций.

R4 добавляет stable upstream v1.4.0 example, новые ISC-46–78 в канонической ISA с six-column Test Strategy, два разных уровня rollback и отдельные fault/rehearsal probes. Прежние 53 leaf IDs/тексты/evidence сохранены. Простота rollback теперь проверяется реальной операторской командой на packaged artifacts, а не наличием backup в плане.

## Findings и решения

| ID | Важность | Замечание | Решение в R3 / остаток |
|---|---|---|---|
| R-01 | Высокая | Проектирование нового механизма до проверки готовой старой реализации | Исправлено: таблица переиспользования в §2 и правило минимального diff в §5.1. S1 начинается с существующего `packages/durable-reload`. |
| R-02 | Высокая | Барьер idle можно ошибочно приписать только нынешнему Host | Исправлено по исходнику: старый `DurableExtensions.reloadWhenIdle` тоже проверяет tasks. Busy replacement берётся из native registry и старого Hindsight controller, не из необработанного старого общего reload. |
| R-03 | Высокая | Копирование старого Pi reload целиком вернёт global providers, standalone Session ownership и неправильный lifecycle | Исправлено: готовые discovery/settings функции отделены от `AgentSession`, `resetApiProviders` и terminal-owned Harness. Старый drain/close/bind требует busy-проверки. |
| R-04 | Высокая | «Атомарный reload» скрывал разные границы registry, native selection и ресурсов | Исправлено: D05 и §5.2 не обещают общую транзакцию. S3 проверяет selection/publication fault points; внешние действия не переигрываются. |
| R-05 | Высокая | Прямой install после publication может менять невидимый base | По текущему исходнику зафиксирован regression case S1. Это ещё не runtime-confirmed defect и не разрешение написать новый registry. |
| R-06 | Высокая | Закрытие controller ради обновления может оборвать pending work; `retention:harness` не означает hot disposal | Сохранён existing owner, приоритет замены callbacks. Quiescence и Component lifecycle — конкретные probes S5. Недоказанный handoff остаётся блокером соответствующей интеграции. |
| R-07 | Высокая | Подготовка недоверенного JS уже может исполнять код; поздней проверки прав недостаточно | Исправлено: авторизация/canonical source до исполнения и повторный revoke-check перед publication. In-process JS явно не sandbox. |
| R-08 | Высокая | Тестовый HOME сам по себе не защищает рабочие credentials | Учтён предыдущий REPORT: физически недоступные production credentials, отдельные writable scratch/data, очищенная environment. Без этого auth/operational fixtures блокируются. |
| R-09 | Средняя | Автоматический watcher и глобальный fan-out выдавались за обязательную часть восстановления старого поведения | Исправлено: D01/D02 и S2 делают их отдельными опциями. Текущий `/reload` и динамическое чтение текста не зависят от них. |
| R-10 | Средняя | «90%» могли выглядеть измеренной production-частотой | Исправлено: D08 — предложенные 18/20 классов, все U01–U18 обязательны; частотная статистика отсутствует. |
| R-11 | Высокая | Candidate QA предыдущей команды можно ошибочно принять за активированный production | Исправлено: сохранены candidate digest и ссылка на REPORT; production NOT RUN, auth-инцидент/source review отдельно. Перед передачей нужен свежий статус владельцев. |

## Проверка Planning / ParallelPlan / arch

- **Первый полезный результат:** S1 — реальный `/reload` через HTTP/SDK/full-profile Host: v1 заканчивается, v2 обслуживает новый вызов, сохраняются PID/Harness/IDs. Не scaffold и не демонстрация отдельного registry.
- **Декомпозиция:** S1…S6 имеют наблюдаемый результат, границы, зависимости и проверки. S1-C — существующий интерфейс, уточнённый для потребителей, а не обязательный новый API.
- **Параллелизм:** один writer для coupled core/profile/Store; после S1-C независимы клиент и providers; после S3 — адаптеры интеграций. Contract-ready не равен integrated PASS.
- **Архитектура:** native registry владеет фазовыми snapshots, существующие controllers — ресурсами, Host — storage/security. Ни второй runtime, ни процесс на каждое расширение не требуются.
- **Покрытие:** HU-1…HU-10 сопоставлены с S1…S6; U01…U20 фиксируют обычные изменения и maintenance negatives. Опциональные D01/D02 отражены в S2 и HU-8.
- **Проверка результата:** серия reload, two-session isolation, отказ кандидата, revoked grants, unchanged IDs, отсутствие duplicate producers и unsafe replay включены в будущие проверки.
- **Разрешения:** scoped implementation/isolated checks и handoff существующей DeLM-восьмёрке уже разрешены. Production activation, новые actors, commit/push и внешние расходы не разрешены.
- **Rollback:** будущий dispatch отдельно от возврата release; несовместимое состояние запрещает rollback. Репетиция не восстанавливает старую БД поверх результатов после cutover. Старый closure сохраняется, одна документированная команда проверяется независимо.
- **Текущая доска:** read-only снимок перед handoff: 0 CLAIMED / 2 OPEN / 7 DONE, 14 released advisory leases, 1 открытый auth FAIL. Это не разрешает закрыть PDH-5 или считать независимый PDH-8 завершённым.

## Открытые пункты

1. Дополнительного утверждения текущего local scope не требуется. Production activation будет отдельным решением после acceptance; открытый auth-инцидент требует оператора, но не блокирует безопасную source/sandbox работу.
2. S1 подтверждает busy replacement на настоящем интегрированном пути. Старый исходник — основание переиспользования, но не новый runtime PASS.
3. S3/S4/S5 подтверждают schema window, provider stream pinning и безопасный lifecycle каждого адаптера. При конкретном пробеле сначала расширяется существующий владелец, а не вводится универсальный manager.
4. Доска и restart-repair REPORT прочитаны перед handoff; новые задачи не должны подменять незакрытые PDH-5/PDH-8. Реальные receipts и task IDs проверяются после передачи. Перед активацией отдельно закрываются auth incident и независимые проверки.
5. В Fresh остаётся несохранённый пользовательский буфер старого PLAN.md; он не изменялся и не сохранялся агентом. Диск содержит R4, прежние документные файлы сохранены в `/var/tmp/bronzemink-hot-update-r4-before.ig0FDE/`. Старый буфер нельзя автоматически сохранить поверх новой редакции.

Независимого reviewer для этого плана не было. `ce-plan` и `ce-doc-review` не запускались; использован self-review по ранее прочитанным Planning/ParallelPlan/arch, для R3 дополнительно применён `Planning/Workflows/Replan.md`. Независимые code review и QA реализации остаются обязательными на milestone.
