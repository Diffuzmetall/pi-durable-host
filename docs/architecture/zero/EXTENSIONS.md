# Extensions — перенос в отдельные пакеты

Статус: inventory и предлагаемый package layout. Пакеты не созданы и не опубликованы. Пути относятся к исследованному Host; это не разрешение менять файлы других участников.

## 1. Два entrypoint, а не один выдуманный plugin API

**Обычный Pi entrypoint:** `export default function(pi: ExtensionAPI)`. Подходит для реально совместимых tools/hooks. Загружается штатным Pi loader Zero через trusted entrypoint path.

**Native composition entrypoint:** экспортирует factory native definitions и необходимые session-local lifecycle функции. В simple/additive случае factory предоставляет существующий Zero `BuiltinExtension`; в полном профиле composition root связывает lifecycle до resume.

Не надо насильно превращать каждый native task в Pi tool или каждый Pi tool — в новый framework object. Общий внешний SDK расширений не создаётся. Минимальные callable contracts остаются у реальных потребителей.

## 2. Предлагаемый package layout

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

`native-profile/` — сокращение для `apps/dpi-backend/src/native-profile/`. Package grouping уточняется фактическими imports, а не механическим перемещением директорий. Guards env, owner authority, subagent admission и safe projection остаются обязательными частями runtime integration, не произвольно отключаемыми user plugins.

Tools package не должен принудительно устанавливать все провайдеры: optional entrypoints/config позволяют не подключать Codex/Antigravity/Context7 без нужной конфигурации. Credentials не встраиваются в package.

## 3. Самый простой реальный native entrypoint

Ниже иллюстрация формы API, не выполненный native integration test:

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

Публичный SOURCE-путь Zero:

```ts
import { openDurable } from 'durable-zero/core';
import { createToolsBuiltin } from '@dpi/extension-tools';

const opened = await openDurable({
  cwd: trustedWorkspace,
  sessionDir: trustedSessionDirectory,
  builtins: [createToolsBuiltin(sessionDependencies)],
});
```

Это показывает, где подключается отдельный package. Оно **не** решает memory before-resume, security environment, hot reload или UI compatibility. Package resolution/install и реальный Harness smoke ещё не выполнены.

Не использовать `DurableEngine.open({builtins: ...})`: такого option у facade в исследованном source нет. Не передавать одинаковый mutable singleton builtin в разные sessions.

## 4. Матрица совместимости компонентов

Легенда: **A** — public registration seam есть; **B** — нужна адресная адаптация нашего пакета; **C** — stock `openDurable` не даёт обязательный текущий lifecycle/security input; **U** — внешний compatibility gate не закрыт. Ни одна буква не означает runtime PASS.

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

Текущие dependency-specific результаты memory/MCP, automation и third-party находятся в [отчётах DM1](../../../experiments/durable-module-20261102/). Они полезны как inputs, но не квалифицируют Zero-based package tuple.

## 5. Memory — наиболее показательный перенос

Независимые части: config/bank policy, client transport, acceptance bookkeeping, session-local logs, ordering и uncertain-effect rules.

Native части: `hindsight.namespace`, `hindsight.delivery`, `hindsight.context`, `hindsight.lifecycle`, task `hindsight.deliver`, hooks/sections и observer. Их текущие identities/versions сохраняются до явной data migration.

Существующий `createSessionMemory` уже имеет factory и функции bind, prepareReload, drain, close. Не нужен второй memory framework. Пакет получает explicit directory/config/client resolver; никакого поиска пользовательских credentials при import.

Полный перенос требует исходного Storage и правильной привязки **до** исполнения восстановленных задач. Переименование папки, поздний bind или создание отдельной «memory DB» не являются эквивалентом.

Reload обязан сохранить session scope callback-ов и существующий delivery kernel. Проверять реальные bank/session пары и отсутствие повторной доставки после lost ACK/uncertain, а не только наличие зарегистрированного инструмента.

## 6. MCP и инструменты — не потерять policy в адаптере

Zero имеет штатную MCP factory и nested execution. Наш manager дополнительно обеспечивает ограничения конкретных sources, Mail identity, lifecycle reload и одинаковую авторизацию direct/nested.

В полном profile назначается **один** transport owner на source. Нельзя загрузить наш `@dpi/extension-mcp` и оставить альтернативный stock tool path, позволяющий обойти ограничения.

Подмена `@sinclair/typebox` на standalone `typebox` или наоборот не является косметикой. Проверяется фактическая schema/runtime совместимость: required/optional, extra properties, coercion, formats и structured output. Не закрывать typecheck через `any` и не выдавать это за совместимость.

Сетевые clients — session-scoped или явно безопасно разделяемые. Их close/drain выполняет владелец, а не UI disconnect.

## 7. Automation и DeLM — пакет, но не отдельный движок

Goal, schedules и triggers сохраняют native definitions и durable identity. Клиенты не запускают расписания и не переприсваивают authority. Human-only approval не превращается в boolean, который может передать iii или child agent.

DeLM engine уже существует отдельно: сохраняем его package/provenance, адаптируем binding, а не копируем engine в Zero. Board остаётся authority для процесса разработки; это исследование не изменяет текущие actor/task assignments.

Повторная доставка wake или trigger с тем же identity не создаёт новую работу. Отсутствие ACK не доказывает, что работа не принята. Ни package split, ни HTTP transport не должны менять этот контракт.

## 8. UI-пакеты

Для обычных уведомлений и запросов наши server packages получают небольшие injected callbacks. Они не импортируют terminal widgets. UI capabilities и допустимый recipient определяет Host.

Если extension содержит полноценный custom terminal component, выносим только renderer в client-side entrypoint. Native tools/hooks/tasks остаются на сервере. Это адаптация конкретного расширения, не обещание выполнить произвольный Pi UI код в любом frontend.

BB использует собственную projection, iii — headless behavior с явным ожиданием человека или отказом. Нельзя по умолчанию подтверждать опасное действие ради автоматизации.

## 9. Обязательные package checks перед переносом полного профиля

1. Установка в пустой каталог из закреплённых artifacts без HOME aliases и исходного workspace.
2. Только публичные Zero exports; отсутствие postinstall patch/deep imports/второго SDK closure.
3. Package import без запуска controller, network, credentials discovery или открытия session.
4. Две factories с разными session inputs не разделяют mutable state.
5. Native definitions зарегистрированы до open; bindings выполнены до resume.
6. Reopen сохраняет identities, pending work и receipts; worker/client restart не дублирует эффекты.
7. Direct и nested tool calls одинаково соблюдают grants/revoke/guards.
8. Teardown одного instance не закрывает другого; failed initialization очищает созданные ресурсы.
9. Reload сохраняет scope и subscriptions, rejected candidate не публикуется, failed drain не объявляется rollback.
10. LICENSE/NOTICE/provenance входят в archive; credentials и private paths не входят.

Эти проверки ещё не выполнены для новых пакетов. Три теста registry проверяют только сам механизм регистрации Zero.
