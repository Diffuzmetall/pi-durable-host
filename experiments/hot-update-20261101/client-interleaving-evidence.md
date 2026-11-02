# R4 U17: новый draft при задержанном reload

Карточка Eve: `afec5285b6ab457fa8c34637d0637cbd`. Результат: source PTY PASS. Production activation NOT RUN.

## Закрытый пробел

Прежний actual PTY проверял замену client process и отказ команды без сетевой задержки. Он не проверял новый текст между отправкой reload и получением ответа. Этот тест дополняет `client-evidence.md`, а не заменяет его результаты или независимую приёмку Heidi.

Повторное использование: существующий `nativeAttentionFixture` и terminal entry → прежний PTY/HTTP pattern → test-only proxy с управляемой задержкой ответа. Store, Harness, SQLite, HTTP, SDK и editor настоящие. Только model provider и транспортный fault являются внешними тестовыми границами. Product source и прежние тесты не изменены.

## Проверенный сценарий

Один disposable Host и один client выполняют два reload через настоящий SDK/TUI путь.

1. Host публикует reload и возвращает proxy HTTP 200 с прежним session ID. Proxy удерживает ответ. Пользователь печатает новый Unicode draft. Тест проверяет его точный checkpoint до освобождения ответа. Затем proxy передаёт ответ клиенту.
2. Host снова публикует reload и возвращает HTTP 200. Proxy снова удерживает ответ, пока пользователь печатает другой Unicode draft. Затем proxy закрывает соединение без передачи ACK.

В обоих случаях редактор сохраняет новый текст и focus. История до явной отправки остаётся неизменной. TUI показывает соответственно `Reload applied:` и `Reload unconfirmed:`. Панель `Cannot submit` не появляется.

Пользователь добавляет суффикс `-EXPLICIT` и нажимает Enter без Escape. Host получает точный новый текст один раз. Reload не создаёт model turn. Потеря ACK не вызывает повтор reload.

## Команды и доказательства

Runtime-команда выполнена внутри физического sandbox Frank. Negative self-check прошёл до запуска fixture. Workspace смонтирован read-only; production credentials/data/sockets не доступны.

Базовая команда:

```sh
python3 experiments/hot-update-20261101/sandbox/run.py --repo "$PWD" -- sh -c \
  'cd /repo && python3 apps/terminal-adapter/tests/reload-interleaving-ui.py'
```

Для source integration запуск также передаёт прежний Node resolution hook через `NODE_OPTIONS`. Hook выбирает текущий `packages/durable-reload/src/index.ts` и сохраняет backend SDK identities. Exact argv: `/tmp/hot-update-sandbox-kuloge1l/command.json`. Physical installed dependency не изменена; этот hook не является installed-candidate acceptance.

PASS: exit 0, `/tmp/hot-update-sandbox-kuloge1l/run.log`.

Результат: `/tmp/hot-update-sandbox-kuloge1l/work/tmp/eve-reload-interleaving-h0agccvv/result.json`.

- Host PID: 18; client PID: 45. Оба PID относятся только к disposable namespace.
- Session ID: `08f66f9f-0c25-497e-9cdd-526a094d4a59`.
- Reload POST: ровно 2; удержанных ответов после теста: 0.
- Model calls: ровно 3 — seed и две явные отправки нового draft.
- Client и Host штатно завершились с exit 0.

Terminal strict typecheck: PASS, exit 0. Evidence: `/tmp/hot-update-sandbox-j83mdr4x/{run.log,command.json}`. Временный tsconfig направляет package type lookup на свежий `packages/durable-reload/dist/index.d.ts`. Исходный tsconfig и `node_modules` не менялись.

## Source SHA256

- `apps/terminal-adapter/tests/reload-interleaving-ui-probe.mts`: `58b226790cb65b257fc7be0c1a3a08da4123c39d88352096a7e5e7f95f84c20e`.
- `apps/terminal-adapter/tests/reload-interleaving-ui.py`: `11445b4cd9fc12c4e3026d1a5ef6a975bf93df78ab97370669c6d5f3f5aed822`.

## Границы

Это дополнительная source regression от автора клиента. Она не заменяет независимую установленную QA Heidi. Прежний отчёт сохраняет свои hashes и проверенную версию исходных тестов. Ни live Host, ни sealed alice-v2 не изменены. Auth incident и blocker возврата полного release остаются открытыми.
