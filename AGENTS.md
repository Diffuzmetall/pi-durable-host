# pi-durable-host

## Задание и канон

Это отдельный fork `disler/durable-pi`, baseline `37165c619573dbaf425463038bbffecfe576beec`. Канон требований — `ISA.md`; порядок и границы реализации — `docs/host-design/PLAN.md`; факты и исходные пути — `OBSERVE.md`; выбранная архитектура — `ARCHITECTURE.md` и `THINK.md` в том же каталоге.

Пользователь разрешил локальную реализацию P0–P5 командой DeLM из четырёх агентов GPT-6.1 Sol / medium. Первый actor создаёт полезные параллельные задачи на доске и сам начинает реализацию. P6 с живыми session data, production activation, push, commit, publish и deploy НЕ разрешены. Runbook и disposable migration fixtures допустимы, реальные данные — нет.

## Границы реализации

- Сохраняйте backend и SDK Disler; не стройте заменяющий framework. Сохраняйте наш TUI и native Durable authority/recovery. Pocket исключён.
- Цель — Durable 1.4.0. Не объявляйте native extensions совместимыми только по успешной компиляции. Сохранённые model IDs нельзя молча заменять.
- Порядок пользовательских milestones: terminal → BB → iii. Независимые probes/fixtures можно готовить раньше их acceptance.
- Интеграции под `/home/ubuntu/Projects/master/experiments/**` и установленными runtime releases — только чтение. Не редактировать, переносить или удалять их. Допустимые эксперименты создаются только в ЭТОМ fork или временных каталогах.
- Используйте faux/local providers, временные HOME/dataDir, loopback endpoints. Не тестируйте живые модели, внешние платные API, личные memory banks или production DBs без отдельного разрешения. Авторизация на четыре рабочих агента не разрешает дополнительные модельные вызовы из тестов.
- Не устанавливайте глобальные зависимости, не меняйте auth/MCP/global settings и не ослабляйте guards. Локальные dependencies кандидата и обычные isolated checks разрешены.
- Сохраните MIT license и copyright upstream. Несвязанные изменения не трогайте; не используйте reset/stash/checkout/cleanup для получения «чистого» дерева.

## Запрошенный DeLM run

Следуйте frozen WORKER/START установленного DeLM. Для этой команды task truth, сообщения о результатах и advisory leases принадлежат доске DeLM: `context` и `delm_wait`. Не создавайте параллельный tracker в Mail/Beads, новый Goal/Loop или recursive workers.

Перед общей записью получите узкую board lease и проверьте текущего владельца. Один владелец меняет manifests/lockfiles и coupled Store/profile implementation. Остальные создают независимые fixtures/probes и передают изменения общих файлов через board handoff. Истёкшая lease сама по себе не означает, что прежний писатель остановился.

Полностью прочитайте global AGENTS, этот файл, применимые вложенные инструкции, frozen WORKER/START, original prompt, план и свежую доску. Подтвердите настоящий `codemode` → native `read` результат до первого implementation claim; команда JavaScript через bash не заменяет эту проверку. Если нужного инструмента нет, сообщите blocker, не устанавливайте другой runtime.

Self-verification выполняется в своей задаче; независимый review/QA — другими участниками четвёрки на завершённом milestone. DONE содержит проверенный candidate, команду и результат, а не только мнение. Свободный actor использует `delm_wait(action=work)`, не опрашивает доску моделью в цикле.
