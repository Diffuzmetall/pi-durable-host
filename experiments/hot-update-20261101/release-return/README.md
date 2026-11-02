# Release-return: lifecycle boundary

Основная задача `59c9d5cbbb9248f79810fb17b3b7e4bd` остаётся BLOCKED.
Этот output проверяет только service lifecycle. Он не закрывает ISC-74/78 или неизвестную совместимость прежнего полного release.
Production activation NOT RUN. Прежний auth-инцидент остаётся открытым.

## Что работает

`return-release.mjs` экспортирует `returnRelease(options,{control,preflight})`.
Он переиспользует `validateSealedArtifact` Alice и существующие операции stop, atomic unit replacement и start.
Он не создаёт runtime manager, execution journal или новый storage owner.

`options` содержит явные `service`, `dataDir`, новый `evidence` и два artifact descriptor: `expected`, `target`.
Каждый descriptor содержит абсолютный `root` и закреплённый `manifestSha256`.
Оба artifacts должны содержать `operational-service.mjs`.

Функция проверяет точный service, PID/cmdline, unit, Node binary и private config с тем же canonical dataDir.
Чужой service/data, изменение unit/config, ошибка integrity или занятый operator lock вызывают отказ.
Она не крадёт lock по таймауту.

Порядок операций:

1. Проверить integrity обоих releases и точную identity текущего service.
2. Вызвать доверенный `preflight` с `phase:'before-stop'`.
3. Получить exclusive operator lock и сохранить unit preimage.
4. Остановить только выбранный service с ограниченным ожиданием.
5. Подтвердить PID0, завершение прежнего PID и отсутствие native owner locks.
6. Скопировать актуальные данные в private evidence после остановки.
7. Повторить проверку owner и вызвать `preflight` с `phase:'stopped-current-data'` и `copyDirectory`.
8. Проверить неизменность unit/config, атомарно выбрать target и запустить один service.
9. Проверить новый PID и точный cmdline. Сохранить результат без автоматического восстановления БД.

Default control использует `/usr/bin/systemctl --user` с timeout 15 секунд.
В fixtures другой явный control управляет только disposable child process и ждёт его readiness/exit.
Default systemd transport НЕ проверен этим output; его нельзя запускать на production сейчас.

## Обязательный compatibility input

`preflight` — доверенная read-only функция владельца profile. Каждый вызов должен вернуть строго `true` либо отказать.
Положительный ответ fixture не является сертификатом совместимости настоящих данных.
Последняя проверка должна проверять согласованную актуальную копию после завершения прежнего owner.
Она должна использовать именно прежний полный target, а не текущий registry.

Carol предоставила `inspectNativeCopy(source:VerifiedNativeCopy,target:NativeImportTarget)` в DONE291; дубликат карточки согласован в DONE301 без второй реализации.
Этот inspector не создаёт resources и возвращает `runtimeContinuationChecked:false`. Входом служит согласованная immutable copy, не live DB.

Полный target прежнего sealed release отсутствует: FAIL `a82349fb8abd46eea0602c78dd46f244`, отчёт `../core-previous-target.md`.
Inspector сам не создаёт этот target и не разрешает pending recovery. Положительная integration с wrapper пока отсутствует.
Alice зафиксировала отсутствие нового полного closure в `../packaging/release-inputs.json`.

Operator CLI намеренно не принимает injected callback, fixture compatibility или флаг обхода проверки.
Пока настоящий target не подключён, CLI возвращает exit2 `RELEASE_COMPATIBILITY_UNKNOWN` до обращения к service manager.
Это рабочий отрицательный путь, НЕ готовая команда положительного production возврата.

Точная форма команды после будущей приёмки должна остаться такой:

```text
node /APPROVED/return-release.mjs
  --service EXACT.service --data-dir /EXACT/DATA --evidence /NEW/PRIVATE/EVIDENCE
  --expected /SEALED/CURRENT --expected-sha256 PINNED_CURRENT_MANIFEST
  --target /SEALED/PREVIOUS --target-sha256 PINNED_PREVIOUS_MANIFEST
```

Команда сейчас не может переключить production. Положительная CLI integration ещё NOT IMPLEMENTED.
Нельзя подставлять пустой callback или автоматически принимать integrity за compatibility.

## Отказы и неопределённость

- Отказ до stop не меняет unit, selector или данные.
- Неподтверждённая остановка сохраняет прежний owner и запрещает publication/start.
- Несовместимая актуальная копия или оставшийся native lock запрещают publication/start после остановки.
- Startup failure не запускает компенсирующий второй процесс. Target unit может уже быть опубликован; результат явно отмечает `published:true`.
- Cleanup failure возвращает `refused-or-uncertain`, а не отменяет publication задним числом.
- Повтор со старым `expected` после успешного switch отказывает до stop. Команда не повторяет принятую работу.
- Backup никогда не восстанавливается автоматически поверх новых записей.

После неопределённого исхода требуется сверка точного service/PID/unit/locks.
Не запускайте другой owner и не удаляйте locks по возрасту.

## Проверки

PASS: семь tests, exit0, sandbox `/tmp/hot-update-sandbox-q96mnd3m`.
Перед tests прошёл physical negative self-check. `command.json` и `run.log` сохраняют точные argv и исход.

```sh
python3 experiments/hot-update-20261101/sandbox/run.py --repo "$PWD" -- \
  node --test /repo/experiments/hot-update-20261101/release-return/return-release.test.mjs
```

Fixtures используют настоящие отдельные Node процессы, HTTP, сигналы, exit, sealed manifests, unit files и filesystem locks.
Они проверяют v1→v2→v1, сохранение новых fixture records, backup и отсутствие автоматического replay.
Отдельно проверены неизвестная совместимость, чужие identity/data, stop refusal, native lock после stop, startup failure и concurrent transition.
Настоящий CLI проверен отдельным процессом: он отказывает до service-manager вызовов и не создаёт evidence.

Сервис fixture НЕ является Host; records НЕ являются native receipts, SQLite или model generations.
Compatibility callback fixture намеренно synthetic. Эти tests не заменяют Store/Harness/SQLite/SDK/PTY и проверку двух итоговых Host closures Heidi.
Полный положительный release-return и независимая приёмка остаются NOT RUN.
