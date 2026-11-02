# Справочник расширений и предлагаемых пакетов

Документ описывает текущие компоненты и предлагаемое распределение по пакетам. Пакеты не созданы и не опубликованы. Пути относятся к исследованному Host. Документ не разрешает менять файлы других участников.

## 1. Две точки входа

Обычная точка входа Pi имеет вид `export default function(pi: ExtensionAPI)`. Она подходит для совместимых инструментов и hooks. Штатный загрузчик Pi в Zero получает доверенный путь этой точки входа.

Точка входа native-композиции экспортирует фабрику native definitions и функции lifecycle для отдельной сессии. Для простого добавления компонента фабрика возвращает существующий `BuiltinExtension` Zero. В полном профиле код сборки связывает lifecycle до `resume`.

Такое разделение не требует превращать каждый native task в Pi tool или каждый инструмент в новый объект framework. Общий внешний SDK расширений не создаётся. Контракты вызова определяют реальные потребители.

## 2. Предлагаемое распределение по пакетам

| Пакет / владелец | Текущие owning paths | Что переносится | Как подключается |
|---|---|---|---|
| `@dpi/runtime-zero` | `apps/dpi-backend/src/durable/`, нужная часть `runtime-profile.ts`, native composition | Lifecycle, admission/receipts, private projection, compatibility | Backend вызывает существующий semantic session interface |
| `@dpi/extension-tools` | `native-profile/tools/{web,codex,context7,antigravity}`, relevant skills/external-dirs bindings | Наши инструменты, schemas, prompt/context возможности | Native definitions либо обычные Pi entrypoints, где semantics совпадают |
| `@dpi/extension-mcp` | `native-profile/guards/mcp-codemode.ts`, `memory/mail.ts`, session MCP manager | Transport ownership, exact allowlists, direct/nested authorization, structured results, Mail identity | Factory получает policy/config; profile устанавливает одного MCP/CodeMode owner |
| `@dpi/extension-memory` | `native-profile/memory/` без MCP-only owner | Hindsight policy/client plus native delivery/docs/hooks/controller | Register definitions → bind к исходному Harness/Storage → admit/drain/close |
| `@dpi/extension-automation` | `native-profile/automation/`, нужные `native-profile/operator/` части | Goal, schedules, triggers, budgets, human approval | Native definitions плюс lifecycle binding; не отдельный scheduler |
| Существующий DeLM package | Установленный/закреплённый engine и `delm-profile` binding | DeLM protocol, native tasks, wait/wake и связанный профиль | Повторное использование package, узкий binding к нашему runtime |
| `@dpi/profile-personal` | Конкретная сборка `native-profile/profile.ts` | Выбор пакетов, trusted resolvers и policies | Composition root; не второе выполнение |
| `packages/durable-reload` | Существующий пакет | Compatibility и prepare/publish/drain для native registry/models | Внутренний dependency runtime integration; новый reload daemon не нужен |

`native-profile/` обозначает `apps/dpi-backend/src/native-profile/`. Границы пакетов зависят от фактических imports, а не от расположения каталогов. Защита среды исполнения, полномочия владельца, допуск подагентов и безопасная проекция остаются обязательными частями интеграции. Пользователь не может произвольно отключать их как plugins.

Пакет инструментов не требует установки всех провайдеров. Необязательные точки входа и конфигурация позволяют не подключать Codex, Antigravity и Context7 без нужных настроек. Credentials не входят в пакет.

## 3. Пример native-точки входа

Пример ниже показывает форму API. Это не результат интеграционного теста.

```ts
import type { BuiltinExtension } from 'durable-zero/core';

export function createToolsBuiltin(dependencies): BuiltinExtension {
  // dependencies и instances создаются отдельно для каждой session.
  return {
    id: 'dpi-tools',
    name: 'DPI tools',
    version: '1.0.0',
    register({ registry }) {
      if (!registry) throw new Error('Native registry required');
      registry.install(dependencies.nativeExtension);
    },
    teardown() {
      return dependencies.close();
    },
  };
}
```

Следующий пример использует публичный API исходников Zero.

```ts
import { openDurable } from 'durable-zero/core';
import { createToolsBuiltin } from '@dpi/extension-tools';

const opened = await openDurable({
  cwd: trustedWorkspace,
  sessionDir: trustedSessionDirectory,
  builtins: [createToolsBuiltin(sessionDependencies)],
});
```

Пример показывает подключение отдельного пакета. Он не обеспечивает привязку memory до `resume`, защищённую среду, горячее обновление или совместимость интерфейса. Разрешение зависимостей, установка пакета и пробный запуск Harness ещё не проверены.

В исследованном исходнике `DurableEngine.open` не принимает `builtins`. Вызов `DurableEngine.open({builtins: ...})` не поддерживается. Передача общего изменяемого builtin в разные сессии не обеспечивает изоляцию состояния.

## 4. Матрица совместимости компонентов

Обозначения матрицы имеют следующий смысл.

- **A** обозначает наличие публичной точки регистрации.
- **B** обозначает необходимость адаптации нашего пакета.
- **C** обозначает отсутствие обязательного параметра lifecycle или безопасности в штатном `openDurable`.
- **U** обозначает отсутствие подтверждения внешней совместимости.

Ни одно обозначение не подтверждает успешную проверку работающей системы.

| Компонент | Класс | Что сохранять | Точная работа |
|---|---|---|---|
| Web/Codex/Context7/Antigravity tools | A/B | Schema semantics, output, authorization, credentials isolation | Вынести tools factory; подтвердить target SDK/schema и direct/nested behavior |
| Skills/context/external directories | A/B | cwd scope, AGENTS/skills composition, persisted selected dirs | Передавать workspace/session context явно; не дублировать discovery Zero |
| Provider catalog/auth | B/C | Saved provider/model IDs, session-local config, отсутствие silent fallback | Наш resolver/runtime input в композиции C; stock `ModelRuntime.create()` не считать эквивалентом |
| Hindsight memory | A/C | Native docs/tasks, admissions, bank binding, delivery intents, uncertain effects | Register до open; исходный Storage и bind до resume; один observer/controller |
| MCP/Agent Mail | A/B/C | Identity/project scope, allowlists, no replay, structured content, per-call auth | Один manager/CodeMode owner; отключённый конкурирующий stock path; explicit policy dependencies |
| DCG/guards | C | Реальная защищённая execution environment, не только prompt instructions | Сохранить native env boundary при композиции, проверить shell и nested calls |
| Goal/operator | A/B/C | Budget, human-only approval, durable state, root/child authority | Native definitions и lifecycle до resume, SDK/terminal control через сервер |
| Schedules/GitHub triggers | A/B/C | Occurrence identity, dedupe, reopen, bounded polling, revoke | Native tasks; не переносить в клиентский таймер или отдельную очередь |
| Subagents/parent control | B/C | Parent-only access, stable requests, deliveries, root/child settings | Выбрать одного владельца вместо stock+custom дубля; native admission остаётся общей |
| DeLM | A/B/C | Exact task/document IDs, wait/wake, generation, uncertain outcomes | Существующий engine package плюс тонкий native binding; не запускать второй actor runtime |
| GipPity voice | U | Controller semantics, audio/worklet/CSP behavior, lifecycle | Отдельный совместимый native artifact; упаковка не устраняет watch API mismatch |
| Status/widgets/dialogs | B/C | Human input semantics, client disconnect, safe rendering | Наш callback-port/terminal companion; stock headless UI недостаточен |

Результаты отдельных зависимостей memory, MCP, automation и сторонних компонентов приведены в [отчётах DM1](../../../experiments/durable-module-20261102/). Эти отчёты дают исходные сведения, но не подтверждают совместимость набора пакетов на основе Zero.

## 5. Состав пакета memory

Независимые части включают политику конфигурации и банка памяти, клиентский транспорт, учёт приёмки и журналы отдельной сессии. К ним относятся порядок операций и правила для эффектов с неизвестным результатом.

Native-части включают `hindsight.namespace`, `hindsight.delivery`, `hindsight.context`, `hindsight.lifecycle`, task `hindsight.deliver`, hooks, sections и observer. Их текущие идентификаторы и версии сохраняются до явной миграции данных.

`createSessionMemory` уже предоставляет фабрику и функции `bind`, `prepareReload`, `drain`, `close`. Второй framework памяти не нужен. Пакет явно получает каталог, конфигурацию и resolver клиента. Импорт пакета не должен искать пользовательские credentials.

Полный перенос требует исходного Storage и правильной привязки до исполнения восстановленных задач. Переименование папки, поздний `bind` или отдельная база памяти не обеспечивают эквивалентного поведения.

Обновление сохраняет область действия callback-функций сессии и существующий механизм доставки. Подтверждение переноса требует проверки реальных пар банка и сессии. Доставка не должна повторяться после потери подтверждения или неизвестного результата. Наличия инструмента в registry недостаточно.

## 6. Ограничения MCP и инструментов

Zero предоставляет штатную фабрику MCP и вложенное исполнение инструментов. Наш manager дополнительно ограничивает отдельные sources, определяет Mail identity и управляет обновлением. Прямые и вложенные вызовы проходят одинаковую авторизацию.

В полном профиле каждый source имеет одного владельца транспорта. Загрузка `@dpi/extension-mcp` не должна оставлять альтернативный штатный путь вызова инструмента в обход ограничений.

Замена `@sinclair/typebox` на отдельный `typebox` или обратная замена требует проверки совместимости схем и среды исполнения. Проверка охватывает обязательность полей, лишние свойства, преобразование типов, форматы и структурированный вывод. Замена типов на `any` не подтверждает совместимость.

Сетевые клиенты принадлежат отдельной сессии либо допускают безопасное совместное использование, которое подтверждено отдельно. Владелец выполняет их `close` и `drain`. Отключение интерфейса не закрывает эти ресурсы.

## 7. Automation и DeLM без отдельного движка

Goal, schedules и triggers сохраняют native definitions и устойчивые идентификаторы. Клиенты не запускают расписания и не назначают полномочия заново. Решение, которое может принять только человек, нельзя заменить логическим значением от iii или дочернего агента.

Движок DeLM уже существует отдельно. Предложение сохраняет пакет и сведения о его происхождении. Адаптации требует привязка, а не копия движка внутри Zero. Board определяет процесс разработки. Это исследование не меняет текущие назначения исполнителей и задач.

Повторная доставка wake или trigger с прежним идентификатором не создаёт новую работу. Отсутствие подтверждения не доказывает отказ в приёме работы. Разделение пакетов и HTTP-транспорт сохраняют этот контракт.

## 8. UI-пакеты

Для обычных уведомлений и запросов серверные пакеты получают небольшие callback-функции через параметры. Они не импортируют элементы интерфейса терминала. Host определяет возможности интерфейса и допустимого получателя.

Если расширение содержит собственный компонент терминала, только renderer переносится в клиентскую точку входа. Native tools, hooks и tasks остаются на сервере. Это адаптация конкретного расширения. Произвольный Pi UI код не получает обещания исполнения в любом клиенте.

BB использует собственную проекцию. iii работает без интерфейса и явно сообщает об ожидании человека или отказе. Автоматизация не разрешает подтверждать опасные действия по умолчанию.

## 9. Состояние проверок

Обязательные действия вынесены в [инструкцию проверки пакетов](CHECKS.md). Для новых пакетов эти проверки ещё не выполнены. Три теста registry проверяют только механизм регистрации Zero.
