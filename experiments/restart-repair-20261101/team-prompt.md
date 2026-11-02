# Задание DeLM: надёжный restart Host, кандидат БЕЗ production activation

Оригинальный запрос пользователя (дословно):
«Так ты можешь деталньо все ищучить написать пробелмы сделать thinknig потом как это все чтео быстро исправить и  запись вот в этот маркдаун план и потом открыть во вкладке delm с sol 6.1 medium 8 aгентов  - и чтобы они поработали - но пока сам хост не перезапускать».

Канонический repair plan: /home/ubuntu/Projects/pi-durable-host/docs/durable-host-restart-repair-plan-2026-11-01.md. Исходный анализ: /home/ubuntu/Projects/master/docs/durable-host-restart-analysis-2026-11-01.md (read-only).

Прочитайте полностью /home/ubuntu/.pi/agent/AGENTS.md, /home/ubuntu/Projects/pi-durable-host/AGENTS.md, применимые ancestor/subdirectory instructions, свой START.md, frozen WORKER.md, план, ISA критерии из матрицы и свежую board. BOOT без чтения не доказательство. Сначала сверяйте состояние, owners, DONE/FAIL; context/delm_wait — единственная task board команды. Не заводите Beads/Mail задачи и не делегируйте новым агентам.

Восемь участников, все openai-codex/gpt-6.1-sol medium. Не менять модель. Alice публикует начальные полезные задачи по §5 плана и сама берёт packaging. Bob — exception cleanup wrappers; Carol — единственный Store writer; Dave — HTTP/SDK readiness; Eve — terminal recovery; Frank — operational startup/shutdown; Grace — read-only review плана, затем milestone diffs; Heidi — isolated integrated QA. Остальные не ждут полной декомпозиции, но claim всегда через fresh board. Несвязанные uncommitted changes сохранить: store/routes/controller и operational-service уже изменены до этого run. Никакого git reset/stash/checkout/commit/push.

Работать в одном checkout. Не менять один файл одновременно; shared file остаётся у назначенного владельца, corrections через board handoff. Один финальный packaging build owner Alice, final QA Heidi. Каждый использует отдельные temp DB/ports/processes, закрывает только свои тестовые процессы. Никаких обращений fixture к production dataDir, auth, личным banks и live models; faux/local fixtures по проектным правилам.

КРИТИЧЕСКИЙ ЗАПРЕТ: не stop/restart/reload/kill работающий Host, не менять установленный release, symlinks, service/drop-ins, live SQLite/locks, чужие bindings/panels, credentials/settings. Нельзя развёртывать результат или ослаблять canonical/admission/security checks. Если без production действия работа блокируется, фиксируйте точный blocker и продолжайте независимую разрешённую часть.

Сначала подтвердить дефекты изолированными regression fixtures, затем исправить owning boundary. Сохранять existing lifecycle order, single-owner, exact saved model/task/document IDs, safe public errors. Startup parallelism не должен отпускать locks при незавершённом initializer; transient UI error не закрывает real attention dialogs и не повторяет старый submit.

Grace сначала проверяет план на cross-cutting lifecycle/compatibility ошибки; это gate для изменения startup contract, не блокировка независимых S1/S3 работ. Каждый writer сам проверяет свой slice; independent review/QA только на milestones. Heidi итогом пишет report с exact candidate hashes, командами/exit/status, PASS/FAIL/NOT RUN. Изолированные тесты не закрывают production restoration всех 67 sessions/24 bindings или live restart. Конечная формулировка: candidate verified, production activation NOT RUN.

Когда срез завершён, найдите реально полезную готовую работу; не создавайте work ради занятости. FREE actor с готовящимся разрешённым backlog использует delm_wait(action=work), не named wait на всё подряд. Завершён весь план — закончите, не запускайте бесконечные проверки.
