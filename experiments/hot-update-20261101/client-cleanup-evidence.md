# R4 SDK/TUI: applied reload с ошибкой cleanup

Карточка: `24e3680f1e4e40a4bc8e24e7d04fb769`. Клиентский source outcome: PASS. Installed acceptance и production activation: NOT RUN.

## Контракт и поведение

Существующий `ReloadResult` получил необязательное поле `cleanup?: 'failed'`. Поле означает: публикация завершена, но освобождение прежних ресурсов отказало. SDK не добавляет private error payload.

Существующий `RemoteTerminal.reload()` сохраняет counts и обновляет меню. При `cleanup: 'failed'` он показывает постоянное предупреждение:

> Reload applied: … Host was not restarted. Resource cleanup failed. No rollback was performed; no automatic retry.

При отказе чтения каталога клиент сохраняет оба предупреждения отдельно. Ошибка cleanup не становится отказом публикации или утверждением об откате. Старый ответ без поля сохраняет прежнее информационное сообщение. Команда не повторяет mutation и не создаёт model turn.

Использованы прежние HTTP SDK, controller, notices и PTY. Второй ресурсный owner или механизм повторной отправки не добавлен.

## RED

`/tmp/hot-update-sandbox-jwsxnkp4/run.log`: negative self-check PASS, два теста, один PASS и один FAIL, exit 1.

Новый regression воспроизвёл прежнее поведение: applied cleanup failure имел уровень `info`, а не `warning`. Проверка отказала до изменения controller.

## GREEN: реальные HTTP/SDK/TUI и прежние regressions

`/tmp/hot-update-sandbox-iid7h4qz/run.log` содержит следующие результаты:

- Negative parent/child isolation self-check: PASS.
- `cd /repo/apps/terminal-adapter && npm test`: 43 PASS, 0 FAIL.
- `python3 apps/terminal-adapter/tests/hot-reload-ui.py`: actual PTY PASS.
- `cd /repo/apps/dpi-sdk && npm run check`: PASS.

Точные argv и source-resolution hook сохранены в `/tmp/hot-update-sandbox-iid7h4qz/command.json`. Hook использует source core вместо прежней физической dependency. Он сохраняет backend SDK identities. Установленные dependencies, `node_modules` и live Host не изменены.

PTY результат: `/tmp/hot-update-sandbox-iid7h4qz/work/tmp/eve-hot-ui-e_7vf8tr/result.json`.

- Host PID 666 сохранился. Client PID изменился с 685 на 704. Это PID внутри disposable namespace.
- Session `20b62be5-03c8-43dc-b84d-8e5ab824eee2` сохранила историю и точный Unicode draft.
- Первый HTTP reload вернул прежний ответ без поля. Второй ответ содержал `cleanup: 'failed'`.
- Реальный SDK передал поле в controller. Реальный TUI показал ошибку cleanup и отсутствие rollback.
- Счётчик зафиксировал ровно два POST: по одному на каждую явную команду. Автоматического retry не было.
- Faux model получил ровно три явных запроса. Reload и reconnect не добавили запросов.
- Обновлённый skill появился в autocomplete. Отказ client path сохранил focus без Escape.

Ограничение: test-only HTTP proxy добавляет поле во второй успешный ответ настоящего disposable Host. Этот probe проверяет клиентский wire/presentation contract. Он не изображает реальный отказ backend cleanup. Backend lifecycle проверяет отдельный output Carol.

## Strict types и stale dependency

Общий запуск `iid7h4qz` завершился exit 2 только на последнем terminal typecheck. Физический `dpi-sdk/dist` ещё не содержит нового SDK контракта. Предыдущие 43 tests, PTY и SDK check прошли.

Первое частичное перенаправление типов в `/tmp/hot-update-sandbox-8ec39z70` также отказало: корневой `dpi-sdk` остался старым. Оно создало две nominal identities `DpiClient` и не является принятым решением.

Финальный source strict typecheck: `/tmp/hot-update-sandbox-q8q4vlof/{run.log,command.json}`, negative self-check PASS, exit 0. Временный `/scratch/terminal-tsconfig.json` направляет обе формы `dpi-sdk` и `dpi-sdk/*` в текущий source. Он также использует свежие declarations core. Исходные tsconfig и dependencies не менялись.

Alice: новый immutable candidate должен пересобрать SDK declarations вместе с terminal. Старый `dpi-sdk/dist` не является готовой упаковкой. Этот source alias check не заменяет installed acceptance Heidi.

## Source SHA256

```text
e38c09ca91b702292f14ea94c56be67aea2c8f060f563f89e82085faaea45d7d  apps/dpi-sdk/src/api.ts
dd3a93397031538a53442f9405e41ade3c791bf056ae26a7625bd8bf4df1fb6d  apps/terminal-adapter/src/remote-controller.ts
555ad46c990139cbaea23a7ad28ab2394a70e03b756f832cad194c0053af0430  apps/terminal-adapter/tests/hot-reload-client.test.mts
0967aea4dd20c9aca88ae4f67faaca35edbc932e6bf275a788d6f8a1d4480868  apps/terminal-adapter/tests/hot-reload-ui-probe.mts
5d5e3b6538d4fcb413dec44457223f734e3746cd90efa8291632da44cd3d2758  apps/terminal-adapter/tests/hot-reload-ui.py
```

Scoped `git diff --check`: PASS. Изменённые source/test фрагменты прочитаны после записи.

## Границы передачи

Bob может использовать этот output для отдельного клиентского критерия S5. Он не принимает весь S5 или R4. Grace сохраняет независимый source review; Heidi сохраняет installed acceptance одного immutable manifest.

Shared Store/profile, sealed alice-v2, installed release/config, production DB и credentials не изменены. Auth incident и previous-release compatibility blockers не закрыты. Production activation NOT RUN.
