# DM1: соответствие ISA и проверок

Статус: DOCUMENT TRACEABILITY PASS, не приёмка runtime1.5.

Задача: `1fd60ede7e9143fb9c4612095c1d9a8a`. Baseline DONE574 сохранён до изменения ISA. Grace583 и Heidi589 освободили document readers. Frozen inputs, прежние tasks и historical evidence не изменены.

## Стабильные ссылки

| DM1 | ISA | Задача на прежней доске | Владелец |
|---|---|---|---|
| DM-A | ISC-79 | ce49a8f739c2420f9a5934ea8952b018 | Heidi |
| DM-B | ISC-80 | 916c1f6ccdd24fdb8c467c2d75d093ee | Alice |
| DM-C | ISC-81 | 334922041bbe4f65a0f09078b441b4f0 | Frank |
| DM-D | ISC-82 | d9fba5cce0b2450e8b88bd6f5379e32c | Grace |
| DM-E | ISC-83 | 9b00adaf42b84a8dbce312bf5db4c1ee | Frank |
| DM-F | ISC-84 | 4b8ac4c8697b4b1499d6b0cda0b9c1f9 | Alice |
| DM-G | ISC-85 | 05837db401d24691b5b43ca7fd3b86da | Alice |

D5 собирает единый immutable candidate: `ce5c81e608db4877a3ab219ad2a144cd`.
Независимый final review Grace: `773e0e215c624b0bbd0af65fe2c7998c`.
Независимый installed QA Heidi: `8e11fac91a5d4621b60f61ac02203de2`.

## Проверка сохранения канона

Команда: `python3 experiments/durable-module-20261102/traceability/verify.py`.
Результат: `RESULT.json`, PASS_ADDITIVE_DOCUMENT_ONLY.

- ISA до правки: `d7aa17b05f8ae45251b9535c6317cc3080ea517e86d0b0baa4863b0a316bc9a3`.
- ISA после правки: `80ba661e99c34380074c812b4c5a28e57c78b4d896fd8b2eb4defb3950a4f5fe`.
- Все прежние строки сохранены в порядке, кроме явных обновлений progress и updated.
- Прежние Features F0–F9, Test Strategy, Learning и Verification побайтово неизменны.
- Top-level порядок разделов неизменен. Leaf-критериев96, уникальных96; прежних отмеченных51.
- Новые семь критериев не отмечены. Для каждого добавлена отдельная шестиколоночная строка стратегии.

## Непринятые границы

ISC-39/40 требуют реальной выбранной разрешённой копии; synthetic fixtures их не закрывают. Backup-return не заменяет совместимый release-return ISC-74. DM-G сохраняет dependencies на прежние PDH-33/20/21. Release-return/auth/lifecycle/review FAIL остаются до собственных explicit resolutions. Полный U01–U20/36-leaf R4 corpus,100/20 census и оба rollback проверяются на одном финальном manifest.

D0 dependency seed проверяет только imports/closure. Новые ISC-79–85 пока NOT RUN. Рабочий Host, production data/config/credentials/timers и shared dependency tree не изменены. Production activation NOT RUN.

Проверка УТР handoff: неоднозначности0, нарушения0; tool identifiers, hashes и task UUID сохранены буквально.
