# Лицензии и происхождение

Fork сохраняет Git-историю Disler от baseline `37165c619573dbaf425463038bbffecfe576beec`, исходный MIT `LICENSE` и copyright IndyDevDan. Локализованные интеграции сохраняют отдельные `NOTICE.md`, лицензии и source hashes.

## Символические источники

Поля provenance используют **идентификаторы**, а не адреса для загрузки или пути, которые нужно создать у себя:

- `donor-bb://` — выбранная MIT BB/provider/Core integration, Copyright (c) 2026 Diffuzmetall.
- `donor-iii://` — выбранный iii worker. Владелец отдельно подтвердил ownership и права публикации под MIT, Copyright (c) 2026 Diffuzmetall; прежний `private` flag пакета не заменяет это подтверждение.
- `donor-host://`, `donor-host-package://` — выбранные host/native components.
- `donor-package://`, `donor-source://` — выбранные package/module source trees; точное содержимое определяется именем компонента и записанным hash.

`sourceSha256`/`upstreamSha256` относятся к оригиналу. `localSha256` и локальные `files` относятся к адаптированным файлам этого checkout. Машинные пути и приватные журналы не публикуются; исходные hashes не подменяются локальными.

## Переносимые fixtures

BB tests используют сохранённые **verbatim** Core history schema, восемь строк admission-provenance predicate и два provider-health schema declarations из `@get-bb/plugin-sdk@0.6.79` в `apps/bb-adapter/tests/fixtures`. Их отдельный `SOURCE.json` содержит hashes оригинала и извлечённого фрагмента. Они не требуют частного checkout, не вычисляют альтернативный Core digest и не дают полномочий. Zod закреплён как test-only dev dependency; runtime адаптера остаётся клиентом публичного SDK.

## Переносимый BB Core compatibility source

`compat/bb-0.47.1-native-child` содержит оба полных source patch для pinned upstream get-bb/bb commit, отдельный upstream MIT notice (Michael Yong), локальные helper implementations/declarations, focused tests и exact-hash binary builder. Source application и binary runtime acceptance — разные доказательства; полный upstream rebuild не выполнялся. Ни private checkout, ни private imports для source route не нужны. Подробности и hashes — в README/PROVENANCE.json этой директории.

## Что не включено

Внутренние audit/review reports, операторские сообщения, временные логи, отвергнутые архивы, частные базы и credentials не входят в публичный inventory. Публичные [план](PLAN.md) и [статус](STATUS.md) не заменяют сохранённую внутреннюю ISA и не объявляют полный продукт принятым.
