# Наш terminal: baseline и remote-controller seam

Дата: 2026-10-28. Это ранний вход для P3, **не acceptance terminal milestone**.
Реальный renderer/editor выбранного installed release запущен в PTY с синтетическими
view/controller. Harness, session SQLite, provider, MCP и личная memory не открывались.
Установленный release и production integrations не изменялись.

## Проверка

```sh
python3 docs/host-design/terminal-baseline/probe.py \
  --release /home/ubuntu/.local/share/pi-durable/tui-releases/20261028-4rmMfRfc
```

Python standard library управляет настоящим PTY; `fixture.mjs` импортирует настоящий
`runDurableTui`, а не его копию. `--release` обязателен: probe не выбирает текущий
production launcher и не запускает `main.ts`. HOME/cwd/session-dir временные;
окружение очищено от credentials и настроек внешних сервисов. Dependencies читаются
из выбранного release только для baseline; это **не standalone package** кандидата.
`global-runtime.mjs` требует явных roots `extensions-lane`; fixture не вызывает их
runtime factories. Никакие глобальные настройки не меняются.

PASS: `/tmp/dpi-terminal-baseline-mhw9omm5/result.json`; events и raw PTY transcript
сохранены в том же временном каталоге. Размер transcript: 20 889 bytes, model calls: 0.
Исходники baseline:

| Файл относительно release | SHA-256 |
|---|---|
| `host-lane/host/packages/coding-agent/src/experimental/durable/tui.ts` | `38f8cfc566c27d548aae2e396d9306b8b0cc609c4fcd2a1d102a69e2ccfd69e2` |
| `host-lane/host/packages/coding-agent/src/experimental/durable/runtime.ts` | `94bd14a66a92e9b77c4f8222a8494fd0817c67f4aa784c37b38917606810b383` |
| `host-lane/host/packages/coding-agent/src/experimental/durable/main.ts` | `b5dcb4446384f88b38804fa0fc050dc8a2f2ecc7de9f8c1efe764a3e229aecf4` |

CodeGraph в этом run не exposed; выводы сверены напрямую с текущими исходниками.
context-mode execution недоступен: host отверг tool как не read-only. Probe выполнен
обычным разрешённым native Bash с ограниченным выводом; это не live model test.

## Зафиксированные операции

| Операция | Фактический контракт | Свежая проверка |
|---|---|---|
| Multiline editor | Bracketed paste сохраняет `baseline\neditor`; Enter отправляет `whenBusy:steer` | Controller event содержит точный текст; экран показывает assistant partial |
| Tool streaming | `pi.live.generation.message` создаёт tool card, `pi.live.tools` обновляет его; committed entry принимает card | Generic synthetic `baseline_tool`: partial one → partial two → final видны в PTY; Ctrl+O раскрывает body |
| Steer | Обычный Enter передаёт `steer`, даже при running view | Второй submit event: `steer marker`, `steer` |
| Follow-up | Alt+Enter передаёт `followUp` | Event: `queued marker`, `followUp` |
| Navigation | `/agents` выбирает conversation, transcript меняется | Выбран child 2; `CHILD_TRANSCRIPT` виден |
| Escape в child | Возврат к предыдущему/root conversation, **не abort child** | Switch к root 1; до этого нет abort events |
| Escape в root | Вызывает controller.abort, не generic task-abort | Abort event для root; synthetic committed tool result виден |
| `/tasks` | Toggle деталей; execution не меняется | Controller toggle event |
| `/quit` | UI unsubscribe и terminal cleanup | 0 listeners, exit 0, alt-screen/bracketed-paste/cursor restored |

`read` tool-card выбранного profile в этой fixture не показал synthetic body даже при
раскрытии; probe использует generic card и **не утверждает** полноту проверки всех
specialized renderers. Первая попытка с `read` не прошла именно marker body, а не
startup. Предыдущая startup-попытка выявила обязательные extension roots loader;
финальный probe задаёт их явно, не разрешает live fallback.

## Synthetic commit→render baseline (ISC-26)

Расширенный probe прошёл на тех же исходниках TUI:
`/tmp/dpi-terminal-baseline-f136jmjb/result.json` (exit 0, 50 samples,
136 739 bytes PTY transcript, model calls 0). p50 = **1.051038 ms**,
p95 nearest-rank = **1.622629 ms**, max = **2.012433 ms**.

После существующих UX проверок controller принимает `latency N`, заменяет synthetic
view уникальным assistant marker и пишет `process.hrtime.bigint()` непосредственно
перед `emit()`. Python фиксирует `time.monotonic_ns()` при первом наблюдении marker
в PTY output. Команда editor не содержит renderer marker: echo ввода не может
закрыть проверку. Все 50 sample values лежат в `result.json`; отрицательные значения
или timeout отвергаются. Оба clock используют monotonic clock того же Linux host.

Это commit synthetic view → bytes настоящего TUI renderer в PTY, **не физический
paint экрана**, не latency native SQLite commit и не network/model latency.
Для будущего transport comparison необходимо повторить тот же injection/PTY
measurement с remote controller. При этой baseline формула ISA даёт ориентир
`1.2 × 1.622629 + 50 = 51.9471548 ms` для p95; remote PASS ещё не заявлен.

## Реальная граница

Пути ниже относительно
`host-lane/host/packages/coding-agent/src/experimental/durable/` выбранного release.

- `runtime.ts:112–165`: `DurableView`, `DurableViewSource.current()/subscribe()` и
  `DurableController` передают plain projections, не Harness. Однако TypeScript types
  импортированы из Durable; будущий **клиентский package** не должен приносить runtime.
- `tui.ts:742–933`: `runDurableTui(source, controller, settings, warning?)`.
  Возвращает undefined для quit, null для new, database path для local resume.
- `tui.ts:442–488, 603–710`: entries, `pi.live`, `pi.inbox`, agent document и tool
  receipts; смена conversation и замена transcript head вызывают rebuild.
- `tui.ts:858–918`: команды и navigation; именно этот код — канон Escape поведения.
  README installed release говорит об abort shown child и здесь устарел.
- `runtime.ts:582–594`: owning abort проверяет native Goal protection перед
  `Conversation.abort`. Успешный HTTP task-abort не эквивалентен этому действию.
- `main.ts:76–102`: UI запускается после `openDurable`, finally закрывает runtime.
  Remote entrypoint должен убрать owning lifecycle из terminal, не менять renderer.

## Mapping к существующему SDK и недостающие гарантии

Источник: `apps/dpi-sdk/src/client.ts:155–281` текущего fork.

| Controller/view | Уже существующий SDK seam | Что нельзя потерять |
|---|---|---|
| submit | `AgentHandle.send(content, whenBusy, requestId)` | Сохранить requestId **до** отправки и на retry, actor/source задаёт сервер; native receipt и fingerprint требуют P1 |
| abort | `AgentHandle.abort()` | Native Goal/parent authority до effect; не заменять на `SessionHandle.abortTask` |
| compact | `AgentHandle.compact(instructions)` | Итог/queued/unanswered и notices из native outcome |
| model/thinking | `config()/configure()` | Provider/modelId и clamp supported thinking; отсутствие модели без fallback |
| switchConversation | `session.agents()` + `agent(...).events()/entries()/doc()` | Номер native conversation, scoped access, rebuild без дубликатов |
| tasks, automation, notices | session/agent streams и native docs | Полная projection, включая subagents/requests/Goal/schedules; не только текст entries |
| reload | Не эквивалентен `setExtension` | Доверенная server-side операция; client path из `/reload PATH` нельзя исполнять на сервере как произвольный import |
| new/resume/name | Session catalog API, не local SQLite paths | Local picker/lockfile/title helpers заменить remote catalog binding при прежнем UX |

Существующий renderer в `tui.ts` runtime-импортирует `agentOf` из owning runtime,
а также helpers по absolute paths `pi-durable-extensions`. Для поставки P3 нужны
локализация чистого view helper и явных UI dependencies/licenses, не копирование
всего installed release. `SettingsManager` остаётся UI theme/keybindings частью;
model credentials и registry принадлежат host. Local cwd используется autocomplete
и git footer; remote cwd нельзя бесконтрольно читать как локальный путь клиента.

Нужны P1 snapshot/delta ordering/reconnect, revoked streams, stable receipt lookup,
capability discovery, attention projection и offline/stale indication. SSE ID не
является durable cursor. Pending attention не получает автоматического ответа.
Этот baseline не закрывает ISC-20/21/22/23/26/27: detach/reconnect/recovery и
remote commit→render latency надо сравнить с измеренной выше baseline после P0–P2.
Синтетический controller здесь проверяет **dispatch и rendering**, не native эффект
steer/abort/Goal. Ни новый Stop, ни новый editor/theme engine не добавлены.
