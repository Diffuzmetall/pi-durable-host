# S1: совместимое обновление обычных определений

Carol проверила исходники S1. Проверка установленного нового candidate ещё NOT RUN.
Production activation NOT RUN. Работающий Host и credentials не изменены.

## Повторное использование

Сохранены `reloadDurable`, Jiti, native Registry и Durable 1.4.0.
Сохранены HTTP/SDK transport, session scope и human write/control.
Новый manager, scheduler, journal или протокол не добавлен.

Исходный пробел воспроизведён в `/tmp/hot-update-sandbox-sozdltz0/run.log`.
Три проверки завершились FAIL: busy reload, скрытый base install и close во время preparation.

## Изменения

- Pure registry/provider publication больше не требует общей idle-сессии.
- Существующий `apply` сохраняет idle barrier для отдельной передачи ресурсов.
- Facade следует за base install/uninstall и сохраняет immutable native snapshots.
- `composition.extensions` следует за facade через один subscriber.
- Final `validate` отказывает при конкурентном изменении base или facade.
- Store ждёт preparer перед close и запрещает publication после начала close.
- Skills settings проходят preparation и синхронную publication через существующий reload.
- Selector получает `nativeExtensions(context)`, включая sessionId.
- `loadFreshModule(path)` использует прежний evaluator для server-owned resource-free modules.

Callers native composition должны вызывать `registry.install`, без последующего `extensions.push`.
Generic minimal composition не изменена.
Bad import, duplicate tools и удаление guards сохраняют предыдущий registry.
Saved model choices проверяются без fallback.

## Доказательства

Runtime команды выполнялись только после `SANDBOX_NEGATIVE_SELF_CHECK_PASS`.

- `/tmp/hot-update-sandbox-8knx5v90/run.log`: core/profile 11 PASS; package safety 5 PASS; exit0.
- `/tmp/hot-update-sandbox-mmng9nev/run.log`: текущие core/profile/provider проверки PASS; общий результат 19 PASS/1 FAIL.
- Последний FAIL относился к assertion всего исторического transcript, а не текущего PromptInput.
- `/tmp/hot-update-sandbox-_oy69id7/run.log`: исправленный skills fixture 6 PASS; package safety 5 PASS; exit0.
- Точные shell commands и mount arguments сохранены в `command.json` каждого sandbox.
- `npm --prefix packages/durable-reload run build`: exit0, `/tmp/carol-hu-reload-build2.log`.
- Backend typecheck: exit0, `/tmp/carol-hu-backend-typecheck2.log`.

Backend source probes использовали Node `registerHooks` только внутри sandbox.
Alias направляет `@local/pi-durable-reload` на source и сохраняет backend SDK identities.
Причина: backend node_modules содержит отдельную прежнюю физическую копию package.
Final packaging должна заменить её свежим dist; source alias не является installed acceptance.
Typecheck использовал `/tmp/carol-hot-update-backend-tsconfig.json` с paths на свежий dist declaration.

Skills fixture получил только две связанные правки после освобождения Bob lease.
Synthetic contextWindow увеличен до128000, чтобы native compaction не подменяла последний capture.
Assertion выбирает последний system message; прежние immutable prompt entries остаются в истории.

## Проверенные инварианты

Busy native ToolTask v1 завершился один раз; следующий dispatch использовал v2.
PID, Harness, session/conversation IDs и ожидающий schedule сохранились.
Другая session продолжила использовать v1.
Прямой hidden-base hook install/uninstall достиг native ToolTask.
Concurrent reload, revocation, failed preparation и close не опубликовали неисправный candidate.
Transitive mjs import перечитан; malformed import и duplicate tools отвергнуты.

## Хэши S1 checkpoint

```text
6920d3ff9d6cb846e585a403ad6f6e2e0f33e08b58289fe569c1103359ebdb23 packages/durable-reload/src/index.ts
7e60db0ebf3ca88c8544703b4a86c2dec6d1e69a519062685f772f0f5c4dafc9 packages/durable-reload/src/registry.ts
120b1e5f89cb28153003bffaf54c5e6fe98ed0b2b4bec8e268d177d038c8f841 packages/durable-reload/src/loader.ts
68cd34e9706e1b1ac7a233165991bc6064b17e9f7d66b1aaae4da356733736f4 apps/dpi-backend/src/store.ts
f269dc7ea6bd47df8235d6dc36539e22a7ba41bd65485c46348bdd116ec0be1b apps/dpi-backend/src/native-profile/profile.ts
7fa59796502b223c7257efd80c6637094ffa30f8e2bfe8b589de9881a3ea8a1e apps/dpi-backend/tests/hot-update-core.test.mjs
565c6c0567a556d4f9ae15b610a6ea42b192a716db9eb4a87f3388ca6da205eb apps/dpi-backend/tests/profile-reload.test.mjs
2824b69024eeb7ec62d5070416e8cccd127e2ab96ec743caf5ed02951f93ba99 apps/dpi-backend/tests/native-skills-reload.test.ts
4b61f480df8eb6a326d7a12da60c8fa441fff008b53d376c45b5cf553c821cc2 packages/durable-reload/reload-safety.test.mjs
4bd266d8fa418e08517d827af9066db46bc0fe719d0bb3dd736351b61afbeb1e experiments/sdk-host-cutover/operational-profile.mjs
```

S3 schema/phase/recovery compatibility остаётся следующей работой Carol.
Resource controllers Bob/Frank должны передавать только проверенные prepared updates.
Независимые source review Grace и installed QA Heidi ещё требуются для нового candidate.
Прежний auth incident остаётся operator-only; S1 его не закрывает.
