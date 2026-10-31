# Проверка пакета проектирования

Дата: 2026-10-28. Объект проверки — ISA, OBSERVE, THINK, ARCHITECTURE, PLAN и изображения, не будущий runtime. Исходники продукта остаются baseline `37165c619573dbaf425463038bbffecfe576beec`.

## Вывод

Пакет определяет выбранную основу Disler, пользовательские сценарии, границы полномочий и последовательность реализации. Независимый review нашёл два пробела в контракте; они исправлены и повторно проверены. Это основание начать локальный P0, **не** основание переключать production или считать поддержку 1.4 реализованной.

В ISA остаются **0/53** выполненных leaf criteria. Исходные 10/10 upstream tests относятся к Disler на 1.0.3; они не перенесены в продуктовую готовность нового host.

## Независимый review

Reviewer: `disler-design-review`, `openai-codex/gpt-6-luna`, read-only. Это независимый агент той же модельной семьи, не cross-family consensus и не runtime QA.

| Найденный пробел | Исправление | Повторная оценка |
|---|---|---|
| Revoke проверялся при reconnect, но открытый SSE мог оставаться авторизованным | Закрытие subscriptions и запрет post-revoke emissions; ISC-5.3 с sentinel после revoke | Resolved на уровне design |
| Не определён срок хранения request mapping; baseline удаляет response cache через 24 часа | Canonical mappings без автоматического TTL; cache отдельно; tombstone/result-gone после удаления; ISC-45 | Resolved на уровне design |

Первый отчёт: native request `subagent:1700`, report locator `durable:1701:1847`. Проверка исправлений: `subagent-send:disler-design-review-contract-fixes`, locator `durable:1701:1891`.

Reviewer подтвердил соответствующие места в исходниках Disler, но не воспроизводил baseline tests и не проверял интервью. После правок материальных противоречий в двух изменённых контрактах не обнаружил. Отсутствие TTL осознанно оставляет рост metadata в первом выпуске; будущий GC требует явного retention-контракта.

## ISA CheckCompleteness

```yaml
status: pass
scope: design-artifact-only
substance: deepest
required_sections:
  Problem: present
  Vision: present
  Out of Scope: present
  Language: present
  Principles: present
  Constraints: present
  Dependencies: absent-not-applicable
  Goal: present
  Not yet specified: absent-named-probes-cover-open-questions
  Bridge Criteria: absent-not-applicable
  Test Strategy: present
  Claim layout: Features
  Decisions: present
  Learning: present
  Verification: empty-no-product-claims-closed
isc_quality:
  leaf_claims: 53
  test_strategy_rows: 53
  test_strategy_orphans: 0
  duplicate_leaf_ids: 0
  closed_product_claims: 0
  anchoring: present-for-every-leaf
  compound_claims_split: [ISC-5, ISC-14, ISC-16, ISC-18, ISC-19, ISC-33]
  antecedent: not-required-for-functional-host-goal
```

Детерминированная проверка: canonical порядок присутствующих секций; отсутствие пустых секций кроме Verification; единственный Features layout; уникальность всех leaf IDs; точное соответствие 53 строкам Test Strategy; шесть непустых колонок с anchors; byte-for-byte совпадение сохранённого Goal с первой цитатой Goal; все criteria открыты. Результат: **PASS**.

Содержательная проверка отделена от подсчёта: F0 покрывает безопасность, F1 — runtime composition, F2 — terminal, F3 — BB, F4 — iii, F5 — стороннего клиента, F6 — выбранную историю и возврат. Родительские IDs сохранены после splitting. Original Goal дополнительно прочитан из conversation 1/97; текущий запрос на дизайн — из 1/240. Интервью уже проведено до scaffold, поэтому повторно не запускалось.

## Схемы

Четыре Mermaid-блока реально отрисованы Mermaid CLI **11.4.2** в SVG и PNG с локальным Chrome. CLI установлен только во временный cache `/tmp/disler-doc-render.oJqGSN`, с отключёнными install scripts и Chromium download; зависимости продукта не менялись.

Preview: `/home/ubuntu/Downloads/disler-design.aTlAZt`. Все четыре PNG просмотрены: подписи читаются, связи различимы, обрезанных узлов нет. `file` определил четыре SVG и четыре PNG. После копирования в `diagrams/` проверено byte-for-byte совпадение восьми файлов и совпадение исходных Mermaid-блоков с входами renderer.

При первом рендере `ownership.svg` один запуск Chrome завершился ошибкой launch; повтор только этого отсутствующего результата прошёл. Остальные уже полученные результаты не перегенерировались. Логи: `/tmp/disler-doc-render.oJqGSN/render.log`, `ownership-retry.log`.

## Границы проведённой проверки

- `git diff --check` для fork прошёл; среди tracked files изменён только README. Исходники backend, SDK, manifests и lockfiles не изменены. Новые файлы — документация, изображения и TSV решений.
- Независимый reviewer не заменяет проверку нового host. Ни один fake/provider test на 1.4, BB/iii integration test или migration test в этой работе не запускался.
- При вызове voice notification для CheckCompleteness локальный endpoint вернул HTTP 404. Это не мешает проверке документа; доставка голосового уведомления не заявляется.
- Commit, push, публикация, production activation и доступ к живой session SQLite не выполнялись.

## Что остаётся доказать при реализации

1. Поддержку SDK 1.4 и сохранённых native definitions на выбранном profile.
2. Единственного владельца session при конкурентном старте и аварии; процессную изоляцию globals.
3. Crash-safe admission/create reconciliation, действующие grants и post-revoke stream closure.
4. Установку без этой VPS, работу нашего TUI, затем BB и iii.
5. Перенос только согласованной session и возврат из исходного backup.

Эти вопросы имеют этапы и falsifiers в [PLAN](PLAN.md) и [ISA](../../ISA.md). Они не скрыты за статусом готовности документации.
