# Горячий откат: выбор проверенного artifact

Владелец: Alice. Scope: ISC-71–73/78. Production activation NOT RUN.

## Переиспользование

Старый путь: operator-owned adapter paths → fresh Jiti loader → native registry.
Текущий перенос: `createOperationalProfile({nativeExtensions})` и SDK `session.reload()`.
Пробел: перенос не сохранял проверенный предыдущий artifact и не предоставлял локальную команду его выбора.
Адаптация: private selector перечисляет разрешённые immutable artifacts с закреплёнными manifest digests.
Команда меняет только selector и вызывает существующий SDK reload.

Это не execution journal, новый registry или общий менеджер поколений.
Совместимость task/schema/state проверяет существующий reload owner Carol, не packaging.
HTTP не принимает module paths. Host проверяет прежние session grants.

## Server bootstrap

Selector принадлежит оператору и одной session. Каталог имеет mode 0700; selector имеет mode 0600.
В конфигурации bootstrap подключите существующий callback:

```js
import { selectedNativeAdapters } from './native-artifact.mjs';
const profile = await createOperationalProfile({
  ...existingOptions,
  nativeExtensions: context => context.sessionId === operatorSelectedSession
    ? selectedNativeAdapters(operatorSelectorFile, context.sessionId)
    : existingNativeExtensions(context),
});
```

Carol передала `context` в S1; source S1/S3 завершены. Итоговая installed приёмка ещё не выполнена.

Bootstrap хранит точный `operatorSelectedSession` и private `operatorSelectorFile` вне HTTP body.
Остальные sessions и новые sessions используют прежний discovery callback `existingNativeExtensions`.
Создайте отдельный selector каждой выбранной session. Не используйте один изменяемый selector для всех sessions.
Существующие discovery adapters Bob должны объединяться у прежнего loadAdapters owner, а не заменяться незаметно.

Пример private selector без credentials:

```json
{
  "sessionId": "EXACT_SESSION_ID",
  "url": "http://127.0.0.1:PORT",
  "current": "v2",
  "previous": "v1",
  "artifacts": {
    "v1": {
      "root": "/immutable/native-v1",
      "manifestSha256": "SHA256_OF_RESTART_CANDIDATE_JSON",
      "adapters": ["adapter.mjs"]
    },
    "v2": {
      "root": "/immutable/native-v2",
      "manifestSha256": "SHA256_OF_RESTART_CANDIDATE_JSON",
      "adapters": ["adapter.mjs"]
    }
  }
}
```

Оба artifacts используют существующий `RESTART-CANDIDATE.json` с `files[name].sha256`.
Packaging сохраняет оба полных closure до изменения selector.
Каждый reload проверяет digest, владельца, отсутствие writable files, symlinks, missing или дополнительных файлов.
Adapter paths находятся внутри проверенного closure; зависимости SDK сохраняют общую identity через прежний loader.
Предыдущий `alice-v2` не изменяется и не используется как writable staging directory.

## Одна команда оператора

После независимой приёмки и отдельного разрешения применяйте команду к точной session:

```sh
node /APPROVED_CANDIDATE/select-native-artifact.mjs \
  --selector /operator-selectors/EXACT_SESSION_ID.json \
  --target v1 --expected v2 --token-file /private/operator-token
```

Токен передаётся файлом, а не аргументом или сообщением чата. Файл должен принадлежать оператору и иметь mode 0600.
Для текущей реализации разрешён только явный loopback HTTP target из private selector.
Команды production здесь не исполнялись. В проверках используются только synthetic tokens и disposable Host.

`--target` называет разрешённый artifact; `--expected` защищает от устаревшего выбора.
Команда проверяет текущий и целевой closure до изменения selector.
Она атомарно заменяет selector под exclusive lock и один раз вызывает SDK reload.
Host остаётся владельцем compatibility, authorization и publication.

## Результаты и отказы

- `reload-returned`: существующий SDK reload вернул результат. Поле `result` сохраняет фактический ответ Host.
- `already-selected`: selector уже указывает target. Команда не пересылает reload и не утверждает, что active runtime проверен.
- `uncertain`, exit 2: SDK не вернул success. Selector остаётся целевым; активная версия требует сверки.
- Неизвестный target, другой expected, неверный manifest или чужая session: отказ до reload.
- Занятый lock: отказ без кражи ownership по таймауту. После crash требуется явная операторская сверка.

Не повторяйте неизвестное внешнее действие после потери ответа.
Повтор той же команды с тем же explicit target не вызывает второй reload.
Ошибка cleanup после публикации не означает, что старая версия осталась активной.
Поэтому команда не отменяет selector автоматически после ошибки SDK.
При отказе подготовки прежний runtime остаётся у Host; выбор для будущего reload может отличаться.
Сначала сверьте фактическую активную версию, затем выберите совместимый target явной командой.

Несовместимая старая версия должна получить отказ у native compatibility owner до публикации/resume.
Packaging не может объявить этот критерий PASS по одним hashes или registry demo.
Не подменяйте актуальную БД старым backup и не удаляйте production locks.
Frank возвращает Host release отдельной командой после preflight, а не этой командой.

## Проверка source после S3

PASS, exit 0: четыре boundary tests и один интегрированный native test.
Evidence: `/tmp/hot-update-sandbox-md3qzzqd/run.log`, `command.json` и `work/sandbox-check.json`.
Точная команда сохранена в `command.json`. Она использует `ARTIFACT_SOURCE=1`, backend source и свежий reload source alias.
Старый `alice-v2` предоставляет только CLI SDK dependency. Этот запуск не принимает новый installed candidate.

Проверка использует настоящие Store/Harness/SQLite/HTTP/SDK и отдельный процесс CLI.
Результат `work/tmp/artifact-selection-*/native-result.json` сохраняет точные receipt/session/task IDs.
Тест подтвердил следующие условия:

- Активный native ToolTask завершает v1 один раз, хотя CLI уже опубликовал v2.
- Следующая отправка выполняет v2; совместимый откат выполняет v1 на прежнем Harness/PID/session.
- Повтор первого native request возвращает прежний receipt без нового effect.
- Ошибка удаления operator lock после публикации возвращает `uncertain`, exit 2, без отмены выбора.
- Потеря настоящего HTTP ACK после публикации возвращает `uncertain`, exit 2.
- Повтор обеих неопределённых команд не вызывает новый HTTP reload и не повторяет effects.
- Активный checkpoint версии 2 не позволяет откатиться к artifact без его task kind.
- Последний отказ возвращает HTTP409 `maintenance-required` до публикации; checkpoint завершает прежний task ID.

Результирующая последовательность effects: `v1,v2,v1,v2,v1,v2`.
Последние три отправки отдельно проверяют cleanup failure, lost ACK и несовместимый откат.
После отказа selector может указывать v1, хотя активный runtime остаётся v2.
Повтор команды не объявляет v1 активной: он возвращает `already-selected`, `activeOutcome:not-rechecked`.
Оператор должен сверить состояние и явно вернуть selector на совместимый v2.

Регрессия cleanup сначала дала RED: `/tmp/hot-update-sandbox-87dlty_s/run.log`.
Прежний finally скрывал результат reload ошибкой удаления lock. Исправление возвращает структурированную неопределённость после cleanup failure.
Staging handle закрывается и при ошибке записи.

Первый busy fixture менял task version вместе с кодом; S3 правильно отказал такому обновлению.
Теперь fixture меняет обычный код, а несовместимый checkpoint проверяет отдельно.
Первый faux provider сбрасывал свой счётчик и вызывал лишний tool после обновления provider.
Теперь faux response проверяет фактический transcript, а не номер ответа. Реальные vendor APIs не вызываются.

Ранние fixture imports не проходили из-за ESM-only exports при использовании require resolution.
Исправление использует native import-condition resolver; продуктовые package exports не менялись.

## Независимая installed проверка

После упаковки Heidi должна выполнить тот же тест без `ARTIFACT_SOURCE` и без source alias:

```sh
python3 experiments/hot-update-20261101/sandbox/run.py \
  --repo "$PWD" --candidate /NEW_FINAL_CANDIDATE -- \
  node --experimental-import-meta-resolve --test \
  /repo/experiments/hot-update-20261101/packaging/artifact-native.test.mjs
```

Режим по умолчанию импортирует Host/SDK только из `/candidate`.
Старый `alice-v2` больше не является подходящим target для расширенного busy/compatibility test.
Frank использует этот private selector и manifest closure как вход release-return preflight.
Hot command не заменяет release-return command и не восстанавливает старую БД.
Независимая приёмка обоих откатов должна закрепить один final manifest. Production activation NOT RUN.
