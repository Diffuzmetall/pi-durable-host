# Pi Durable: model-switch и `$` — установка terminal release

Дата: 2026-10-30. Локальная интеграция и переключение terminal launcher выполнены. Backend и работающие беседы не перезапускались. Коммит, push, публикация, платные вызовы, изменения auth/MCP и работа с живыми БД не выполнялись.

## Что поставлено

Переиспользован `/home/ubuntu/Projects/master/experiments/pi-model-switch-durable/host-integration.patch`, без переписывания upstream-решения. Исходный документ: `/home/ubuntu/Projects/master/docs/pi-model-switch-durable.md`. `git apply --check` прошёл на текущем checkout; из-за чужой lease сначала применены независимые части. После освобождения `tui.ts` получена своя lease и применён UI-фрагмент. Существующие несвязанные изменения сохранены. Пользователь явно разрешил Agent Mail leases вместо недоступной доски DeLM.

Изменения принадлежат **terminal-клиенту Pi Durable**, не отдельному backend-продукту. Model-switch использует исходный bundled upstream 0.3.0; picker скиллов — исходный 0.1.16. MIT-лицензии сохранены в `apps/terminal-adapter/src/ui/licenses/`; upstream provenance JSON — в `evidence/`.

Изменены `src/remote-controller.ts`, `src/ui/experimental/durable/tui.ts`; добавлены `src/skill-input.mjs`, `model-switch.mjs`, `upstream.mjs`, `skill-picker.mjs`, лицензии и тесты. Готовый патч дополнен минимально:

- Горячие клавиши перечитываются при обработке shortcut через повторную upstream-регистрацию; upstream bundle не менялся.
- `/reload` обновляет только разрешённые каталоги моделей/скиллов terminal-клиента. Не перезагружает backend/profile и не допускает путь стороннего адаптера.
- Проверка epoch обнаруживает даже уход из беседы и возвращение к тому же ID во время загрузки скиллов. Отправка после сохранения journal использует зафиксированный `item.conversationId`, а не изменяемое текущее выделение.

## Использование и горячее обновление

- `/model-switch`, `add`, `add-current`; Ctrl+Shift+M вперёд, Ctrl+Shift+Alt+M назад, Ctrl+Shift+L меню. Существующие overrides из `keybindings.json` сохранены.
- Конфиг остаётся `~/.pi/agent/configs/model-switch.json`; поддерживается `PI_CODING_AGENT_DIR`. Секции/поиск/атомарная запись — upstream. Конфиг перечитывается при каждой операции, клавиши — без перезапуска terminal.
- `$` в начале строки или после пробела открывает один picker. Повторный `$` вставляет следующий `/skill:name`. `/skill-selector [поиск]` — альтернативный вход; Escape отменяет.
- `/reload` получает свежий каталог с сервера для нового `$`-меню в том же terminal. При каждой новой отправке оба текста загружаются разрешённым API; отказ хотя бы одного отменяет весь ввод. Неопределённая доставка повторяет сохранённые тело/ключ, а не изменённые файлы.
- Первоначальное обновление кода **не внедряет новые JS-модули в уже работающий старый TUI**. Новые запуски `pi-durable` получают новый release; старые процессы оставлены работать. Горячее перечитывание настроек/каталога проверено внутри уже нового TUI; это не обещание универсальной загрузки произвольных расширений без переподключения клиента.

## Проверки

Свежие результаты сохранены в `evidence/`:

| Проверка | Команда / доказательство | Результат |
| --- | --- | --- |
| Применимость | `git apply --check …/host-integration.patch` | PASS до записи |
| Исходный кандидат | `node --test …/{adapter,skill-picker}.test.mjs` | 14/14 |
| Текущий terminal | `cd apps/terminal-adapter && npm run check && npm run build && npm test` | PASS, 35/35 |
| Горячее обновление / isolation | `node --import tsx --test tests/model-switch-reload.test.mts tests/multi-skill.test.mts` | 4/4, входит в 35 |
| Полный установленный TUI | команда ниже | PASS: все три model hotkeys, меню/секции/поиск, Escape, add/add-current с фактической записью временного конфига, hot config, отмена скилла, `/skill-selector`, два `$` |
| Установленный HTTP/faux terminal | `python3 apps/terminal-adapter/tests/probe.py --entry RELEASE/node_modules/dpi-terminal-adapter/dist/main.js` | PASS |
| Launcher до активации | `python3 experiments/model-switch-release/launcher-probe.py --candidate` | PASS |
| **Штатный launcher после активации** | `python3 experiments/model-switch-release/launcher-probe.py` | **PASS** |
| Rollback / конкурентная запись | canary в `activate.py` | точные preimage bytes восстановлены на disposable launcher, изменённый preimage отвергнут |

Воспроизведение полного установленного TUI:

```sh
MODEL_SWITCH_TUI_ENTRY=/home/ubuntu/.local/share/pi-durable-host/releases/terminal-model-skills-20261030-v1/node_modules/dpi-terminal-adapter/dist/ui/experimental/durable/tui.js \
  python3 apps/terminal-adapter/tests/model-switch-ui.py apps/terminal-adapter
```

Launcher-проверка запускала именно `/home/ubuntu/.local/bin/pi-durable --session EXACT_FIXTURE_ID` после реального переключения launcher. В `bwrap` mount namespace только private client binding заменён disposable loopback-конфигом, а `systemctl start` — no-op; создаётся новый локальный faux-owner и отдельная временная беседа. Это не прямой запуск одного `dist/main.js` вместо проверки launcher. Проверены реальный установленный TUI, model-switch menu, две вставки `$`, наличие **обоих полных текстов в одном фактическом native input**, добавление третьего скилла и `/reload` в том же процессе, отмена без дополнительного ввода и чистый выход.

Граница доказательства: взаимодействие с общим backend/живыми БД намеренно не проверялось. Новая сессия — disposable faux-сессия через штатный launcher, не production-запись. Tern недоступен; использованы настоящие POSIX PTY. Проверки no-filesystem grant и uncertain retry/reopen — в полной suite (`native-skills-client.test.mts`, `multi-skill.test.mts`); model refusal и запрет переключения в другую беседу — также в upstream adapter tests. Платных/внешних модельных вызовов нет.

Промежуточные неуспехи не скрыты: новый тест сначала имел implicit-any и был исправлен; расширенный PTY сначала ожидал неизменившуюся строку описания, не повторяемую incremental renderer; sandbox preactivation сначала монтировал неисполняемый fixture launcher, затем получил точный исполняемый preimage; HTTP probe сначала читал неверное поле fixture entry. Финальные результаты выше относятся к исправленным harness/test, продуктовые проверки завершились PASS.

## Активный release и rollback

Активный terminal release:

`/home/ubuntu/.local/share/pi-durable-host/releases/terminal-model-skills-20261030-v1`

Штатный launcher SHA256: `92ab518d0499e9f0e1c6b58bd4ccfa5722d8a126290a535835988ab28d86f3ff`, mode `0775`.

Предыдущий terminal launcher указывал на `c0019d7-sse1/host-bindings-v16/terminal-launcher.mjs`; SHA256 preimage: `5f58a3d129baa0cc10fce2c5dddc2d5c03210d0224a66b5c99e64950ef517917`. Старый release сохранён неизменным. Новый release содержит только новую копию terminal-пакета, launcher и rollback; остальные зависимости — read-only ссылки на прежний release. Существующая private client binding используется по прежнему абсолютному пути: credentials не копировались и не менялись. Backend service/config/release selector не переключались.

Manifest с hashes файлов: `evidence/release-manifest.json`; launcher module SHA256: `fe73fce1df5c05b09ad3b11ebed54d3a8007bf163c267060d36acde0f6ef01e8`.

Точный rollback будущих запусков:

```sh
python3 /home/ubuntu/.local/share/pi-durable-host/releases/terminal-model-skills-20261030-v1/rollback.py
```

Rollback CAS-проверяет текущие bytes, восстанавливает сохранённый launcher полностью и сохраняет mode; отказывается перетирать последующее чужое обновление. Не останавливает ни одного владельца, не меняет SQLite и не повторяет ввод. Не удалять новый или старый release, пока их используют terminal-процессы/зависимости. Скрипты staging/activation и launcher faux-harness: `experiments/model-switch-release/`.
