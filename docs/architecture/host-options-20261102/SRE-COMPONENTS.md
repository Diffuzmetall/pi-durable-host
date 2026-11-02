# Выбор SRE Agent и Components для нашей архитектуры

Документ объясняет выбор двух кандидатов для серверной части Host. Таблицы связывают выводы с доказательствами и ограничениями.

Pi-Durable-SRE-Agent следует исключить как основу общего Host. Это локальное приложение для одного инцидента, а не библиотека универсального Host. Полезны примеры checkpoints, approval gates и восстановления. Неустановленная лицензия блокирует перенос исходников.

Отдельные pi-durable-components подходят после проверки совместимости. Это библиотечный набор, а не готовый Host. Он сохраняет нашего владельца Harness и допускает собственные клиентские адаптеры. Композиция последнего стабильного выпуска с неизменённым Zero пока не подтверждена. Версии среды исполнения различаются.

Дата проверки: 2026-11-02 UTC. Исследование ограничено статическим анализом. Зависимости не устанавливались, код кандидатов не запускался.

Проверены исходники, GitHub API, страницы GitHub и опубликованная карта нашего Host. В новых checkout нет индекса CodeGraph. Исследователь использовал `read` и `rg`. Другие агенты не запускались.

При исследовании прочитаны research-software, asd-ste100-ru и обязательный справочник ГОСТ. Для редактуры дополнительно прочитаны PI-COMPAT, technical-writing и unslop. Общие checkout, службы и конфигурация не менялись. Поиск в интернете не дал полезных результатов; актуальные сведения получены из первоисточников GitHub.

Обозначения таблиц: **П** — подтверждено исходниками; **А** — заявлено автором; **Н** — не найдено; **НП** — не проверено.

## 1. GIFO14/Pi-Durable-SRE-Agent

Стабильных тегов и GitHub releases нет. Исследован единственный commit `d6218a8d8ac509bd1c2f65de090055450cbc9a1b` от 2026-10-21. Значение `updated_at` указывает 2026-10-27, а `pushed_at` указывает 2026-10-21. GitHub API не определяет лицензию. Корневой LICENSE отсутствует. Лицензии шрифтов и иконок не лицензируют приложение.

| Возможность | Статус и результат |
|---|---|
| Категория | П: одноинцидентное SRE-приложение с локальной web-страницей и HTTP API |
| Движок и хранение | П: Durable/pi-ai/Chord строго 1.3.0; JSONL с fsync, отдельные JSON-файлы конфигурации и симулятора |
| Владелец | П: один Node-процесс, один Harness/root conversation; owner.lock для dataDir |
| Восстановление задач | П: определения до resume, task checkpoints в хранилище, стабильный workflowTaskId, фазовые requestId |
| Внешние эффекты | П: receipts симулятора проверяют подпись аргументов; это не exactly-once для shell или реального deployment |
| Несколько клиентов | П: HTTP JSON и polling; Н: общий session API, SSE, WebSocket, RPC |
| История | П: серверное состояние инцидента и отчёт; Н: универсальный каталог/история пользовательских сессий |
| Авторизация | П: loopback и проверка Origin у POST; Н: клиентские identities, bearer/grants, разграничение сессий |
| Повторы | П: дедупликация по incidentId и approval gateId; Н: общий actor/payload-bound submission receipt |
| Отмена | Н: отдельный универсальный cancel API; reset останавливает runtime и удаляет состояние, это не обычная отмена |
| Входные изображения | Н: IncidentInput содержит строки/число; нет DTO, upload/storage/model pipeline для пользовательского изображения |
| Расширения | П: registry.install(CodingTools/workflow.extension); Н: Pi ExtensionRunner, общий MCP loader, reload/update lifecycle |
| Модели и credentials | П: серверные ChatGPT OAuth или чтение Codex access token; environment API-key fallback выключен |
| Подагенты и память | Н: наши сервисы; prompt прямо запрещает подагентов; JSONL history не равен нашей memory integration |
| Размещение | П: локальный Node >=24 и Bash; Н: готовая Cloudflare/container/multi-tenant конфигурация |
| Работоспособность | А: автор сообщает 27 тестов и real-model pass на Windows; НП: независимый запуск |

### Основные доказательства

- [Manifest: runtime и команды](https://github.com/GIFO14/Pi-Durable-SRE-Agent/blob/d6218a8d8ac509bd1c2f65de090055450cbc9a1b/package.json#L1-L29).
- [Открытие, lock и resume](https://github.com/GIFO14/Pi-Durable-SRE-Agent/blob/d6218a8d8ac509bd1c2f65de090055450cbc9a1b/src/pi-runtime.ts#L18-L100).
- [HTTP handlers и loopback](https://github.com/GIFO14/Pi-Durable-SRE-Agent/blob/d6218a8d8ac509bd1c2f65de090055450cbc9a1b/src/server.ts#L12-L115).
- [DTO и одноинцидентный admission](https://github.com/GIFO14/Pi-Durable-SRE-Agent/blob/d6218a8d8ac509bd1c2f65de090055450cbc9a1b/src/incident-trigger.ts#L3-L41).
- [Approval gate validation](https://github.com/GIFO14/Pi-Durable-SRE-Agent/blob/d6218a8d8ac509bd1c2f65de090055450cbc9a1b/src/approval-api.ts#L1-L21).
- [Фазовые submission identities](https://github.com/GIFO14/Pi-Durable-SRE-Agent/blob/d6218a8d8ac509bd1c2f65de090055450cbc9a1b/src/sre-workflow.ts#L119-L145).
- [Симулятор: signature receipt и atomic rename](https://github.com/GIFO14/Pi-Durable-SRE-Agent/blob/d6218a8d8ac509bd1c2f65de090055450cbc9a1b/src/deployment-simulator.ts#L24-L38).
- [Credentials: отдельное владение OAuth/Codex](https://github.com/GIFO14/Pi-Durable-SRE-Agent/blob/d6218a8d8ac509bd1c2f65de090055450cbc9a1b/src/chatgpt-auth.ts#L17-L86).

### Команды и настройки

Автор предоставляет команды `npm run auth:login`, `npm run dev`, `npm run incident`, `npm run typecheck`, `npm test`. Деструктивная команда `npm run demo:reset` здесь не выполнялась.

Исходники задают `SRE_MODEL=gpt-6.1-sol`, `SRE_SCENARIO=healthy`, `SRE_PORT=3000`, `SRE_OBSERVE_MS=8000`. Переменные `SRE_BASH` и `CODEX_HOME` необязательны. Значение `SRE_MODEL` не подтверждает доступность указанной модели.

API содержит GET `/api/state`, GET `/api/report`, POST `/api/incident`, POST `/api/approval`, POST `/api/reset`.

### Композиция и перенос

Адаптер терминала, BB или iii технически может вызывать этот HTTP API. Он получит только инцидентную модель, а не наш контракт операций сессии. Общий Host потребует собственного каталога, авторизации, допуска запросов, истории, отмены и полного пути обработки изображений. Это фактически создание нового Host.

Приложение само открывает Harness 1.3.0. Запуск рядом с Zero создаст второго владельца, а не композицию. Перенос workflow в существующий registry потребует выделения компонентов и проверки API. Готового пакета нет.

Замена приведёт к потере наших grants, MCP, memory, automation, подагентов, обновления расширений и совместимого SDK. Терминал потребует переделки. Наличие HTTP не означает готовность BB и iii. Наши SQLite и определения задач нельзя автоматически преобразовать в JSONL инцидента. Credentials OAuth также нельзя смешивать с историей.

## 2. IgorWarzocha/pi-durable-components

Стабильный выпуск `v0.10.0` опубликован 2026-10-31 11:42:49 UTC. Исследован commit тега `63414a3c2b30143bb31f881c4f2224d9a27d4dd9`. Лицензия MIT. Репозиторий обновлён 2026-10-31 12:02:45 UTC. Более поздний main `9d58c275e6a4e41cd15ca7756cfd2a9624e9214f` добавляет запись о выпуске/приёмке; он не подменяет исследованный тег.

Последние изменения добавляют переносимую активацию marketplace, описание границ Host и подтверждение доступности npm-пакетов. Открытых GitHub issues на момент запроса не найдено в обоих репозиториях. Это не подтверждает отсутствие дефектов.

| Возможность | Статус и результат |
|---|---|
| Категория | П: компоненты, Component SDK и UI SDK; Н: готовый server Host |
| Runtime | П: точные peers Durable/pi-ai/Chord 1.4.0; MCP SDK >=1.25.2 <2 |
| Хранение и владелец | П: Harness/Storage передаёт приложение; SDK не открывает второго scheduler и не закрывает Harness |
| Регистрация | П: extensions → Registry; providers → Models; capabilities и selections задаёт Host |
| Lifecycle | П: prepare, bind, retire, maintain, closeBeforeHarness, closeAfterHarness; Host владеет publication/rollback |
| Восстановление | П: Agents/Context используют native task state; Code отмечает replay unsafe; живые PTY/kernel не равны восстановленным задачам |
| Клиентские адаптеры | П: UI transport contracts со snapshots/call/stream и AbortSignal; Н: готовый HTTP/SSE/WS server с auth |
| Identity и история | П: разговоры/история остаются в Harness; Н: самостоятельный клиентский auth/session catalog |
| Admission и ACK | П: Context task receipts/rejoin, отдельное ожидание placement; отсутствует проверка actor/payload fingerprint в Context.submit |
| Изображения | П: Context передаёт native draft в conv.submit; Н: полный клиентский upload/validation/storage pipeline |
| Pi extensions | П: native Durable extensions; Н: универсальный loader обычных Pi ExtensionAPI/UI extensions |
| MCP | П: peer dependency и отдельные integrations; Н: готовый общий Host MCP registry/credential owner |
| Credentials | П: Host предоставляет Models и capabilities; компоненты не заменяют наш credential policy |
| Возможности профиля | П: Agents, Board, Pulses, Context, tools, execution modes и provider; не эквивалент нашим policies/Goal/memory |
| Размещение | П: Node >=22.19 для native; Worker Code/provider имеют отдельные Workers-варианты; не весь набор переносим в Workers |
| Проверки | А: 26 packages, 23 activation entries, offline/native acceptance; НП: наш E2E и live-provider совместимость |

### Основные доказательства

- [Версия, лицензия и точные peers](https://github.com/IgorWarzocha/pi-durable-components/blob/63414a3c2b30143bb31f881c4f2224d9a27d4dd9/packages/components/package.json#L1-L60).
- [Публичный prepare и compatibility до import](https://github.com/IgorWarzocha/pi-durable-components/blob/63414a3c2b30143bb31f881c4f2224d9a27d4dd9/packages/components/src/runtime.ts#L72-L161).
- [Bind/retire/закрытие и сохранение ownership](https://github.com/IgorWarzocha/pi-durable-components/blob/63414a3c2b30143bb31f881c4f2224d9a27d4dd9/packages/components/src/lifecycle.ts#L75-L178).
- [Selection collisions, admission и read-only rejoin](https://github.com/IgorWarzocha/pi-durable-components/blob/63414a3c2b30143bb31f881c4f2224d9a27d4dd9/packages/components/src/lifecycle.ts#L197-L280).
- [Context: receipt по conversation/requestId, без fingerprint](https://github.com/IgorWarzocha/pi-durable-components/blob/63414a3c2b30143bb31f881c4f2224d9a27d4dd9/packages/context/src/index.ts#L199-L241).
- [Draft сохраняется, native identity выводится из taskId](https://github.com/IgorWarzocha/pi-durable-components/blob/63414a3c2b30143bb31f881c4f2224d9a27d4dd9/packages/context/src/admission.ts#L129-L151).
- [UI: транспорт предоставляет Host, действия не повторяются](https://github.com/IgorWarzocha/pi-durable-components/blob/63414a3c2b30143bb31f881c4f2224d9a27d4dd9/packages/ui/src/remote.ts#L1-L30).
- [Пример независимого Host и bind до работы](https://github.com/IgorWarzocha/pi-durable-components/blob/63414a3c2b30143bb31f881c4f2224d9a27d4dd9/examples/marketplace/main.mjs#L67-L132).
- [Проверка archive integrity](https://github.com/IgorWarzocha/pi-durable-components/blob/63414a3c2b30143bb31f881c4f2224d9a27d4dd9/packages/components/src/registry.ts#L38-L58).
- [Границы установки и lifecycle](https://github.com/IgorWarzocha/pi-durable-components/blob/63414a3c2b30143bb31f881c4f2224d9a27d4dd9/docs/marketplace.md).

### Команды и настройки

Автор публикует команду `npm install @howaboua/pi-durable-components@0.10.0 @earendil-works/pi-durable@1.4.0 @earendil-works/pi-ai@1.4.0 @earendil-works/chord@1.4.0`. Для разработки предусмотрены `bun run check`, `bun run build`, `bun run pack`. Эти команды здесь не выполнялись. Компоненты устанавливаются как npm-пакеты, а не через `pi install`.

SDK принимает `selections[].manifest`, `selections[].load`, `selections[].configuration`, `capabilities`, `compatibility.runtime`, `compatibility.peers`, `whenIdle`, `existing`, `replace`. Общих переменных среды для порта или токена Host нет. Приложение предоставляет модели, каталоги состояния, исполнение, сеть, браузер, планирование и другие необходимые возможности.

Native Code и Notebook добавляют PTY и отдельные вспомогательные программы среды исполнения. README предупреждает о необходимости компилятора, Python и Make. V8 и Deno загружаются при первом использовании соответствующих компонентов. Chrome, аудиоустройства и Codex-совместимые credentials нужны только соответствующим компонентам. Они не являются обязательными зависимостями Apply Patch или UI SDK.

## 3. Неизменённый Zero: граница допустимой композиции

В прочитанной карте Zero — предложение, не работающий runtime нашего Host. Проверены также исходники существующего checkout Zero v0.7.0, commit `b2e21df882a6a4426d0f469d2305b842522d37bd`.

Готовые выпуски требуют дополнительной работы для совместного использования. [Zero package.json](https://github.com/VanDalkvist/durable-zero/blob/b2e21df882a6a4426d0f469d2305b842522d37bd/package.json#L40-L47) требует runtime 1.5.0. Components v0.10.0 требует 1.4.0. Второй экземпляр среды исполнения или игнорирование peers не подтверждают совместимость.

Кроме версий различается порядок lifecycle. [Zero openDurable](https://github.com/VanDalkvist/durable-zero/blob/b2e21df882a6a4426d0f469d2305b842522d37bd/packages/core/src/runtime.ts#L162-L180) вызывает resume до возврата Harness. Компоненты с состоянием требуют `bind` с Harness и Storage до `resume`. Возврат Harness после `resume` не обеспечивает этот порядок.

После проверки совместимости подходит следующая архитектура. Наш Host открывает один native Harness. Профиль устанавливает компоненты и выполняет `bind` до `resume`. Композиция выборочно использует неизменённые публичные библиотеки Zero. Components не должен сам открывать Zero или создавать второй Harness. Простые инструменты без состояния требуют меньше интеграции, чем Context, Agents и Pulses.

Терминал, BB и iii используют адаптеры нашего SDK/API. UI SDK подходит для сериализуемых элементов управления компонентами. Наш Host сохраняет транспорт, авторизацию и receipts. Полный входной путь изображения требует доработки наших DTO, журнала отправок, валидации, хранилища и fingerprint. View Image и Image Generation этот пробел не закрывают.

Обычные Pi extensions требуют существующего bridge или Runner. Совместимость интерфейса и lifecycle требует отдельной проверки. Ни один кандидат не обеспечивает прозрачную совместимость произвольного Pi extension с терминалом, BB и iii.

## 4. Существенные проблемы и минимальные эксперименты

Три главных риска:

1. Наборы зависимостей несовместимы. Zero использует 1.5.0, Components требует 1.4.0, а SRE использует 1.3.0. Нужен совместимый релиз или отдельная адаптация компонентов.
2. Общего слоя допуска запросов и безопасности нет. SRE имеет только локальную защиту. Context receipt не связывает actor и payload. Наши grants, fingerprint и reconcile необходимо сохранить.
3. Активное состояние нельзя переносить автоматически. JSONL инцидента, native tasks, extension definitions и живые kernels не взаимозаменяемы. Неустановленная лицензия дополнительно блокирует перенос SRE-кода.

Минимальный эксперимент для Components предполагает новый изолированный Host на заявленном наборе зависимостей 1.4.0 с faux provider. Он использует новую SQLite и компоненты Apply Patch и Context. Проверка охватывает `bind` до `resume`, сохранение `requestId`, потерю подтверждения, `rejoin` после перезапуска и отказ при другом payload. После этого нужна отдельная проверка совместимости набора зависимостей Zero. Существующие базы сессий для эксперимента не подходят.

Минимальный эксперимент SRE использует отдельный временный рабочий каталог. Он проверяет остановку на approval gate и повтор прежних `incidentId` и `gateId` после открытия. Ожидается один прежний `taskId`. Результат проверит пример восстановления, но не пригодность общего Host. До переноса исходников нужно уточнить лицензию.

Ни один эксперимент не запускался. README сообщает, что Durable 1.4 переводит SQLite на schema v2, которую старые версии не откроют. Это заявление автора требует отдельной проверки миграции на копии.

## 5. Цена интеграции и поддерживаемость

Выборочное внедрение Components требует меньше работы благодаря публичным exports, MIT, контрактам возможностей, lifecycle и явным peers. Marketplace не заменяет установщик. Host отвечает за проверенные байты пакетов, доверие к imports, публикацию регистраций и безопасный rollback. Для первого среза достаточно прямого подключения нужного инструмента. Весь marketplace не обязателен.

Превращение SRE в общий Host потребует почти всего необходимого серверного контракта. Без fork можно использовать существующее приложение и изучать подход. Лицензия не установлена, поэтому разрешение на заимствование кода не подтверждено.

Предпочтительный вариант сохраняет наш Host и клиентские адаптеры. Отдельные Components проходят проверку совместимости. Zero остаётся неизменённой библиотечной основой предлагаемой композиции.

Перенос клиента не означает перенос истории или задач. Потеря подтверждения требует receipt, rejoin или reconcile с прежним идентификатором запроса, а не новой отправки. Преимущества скорости и памяти не измерялись.
