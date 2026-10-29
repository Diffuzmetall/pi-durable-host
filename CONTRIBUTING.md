# Разработка и проверка

Сохраняйте backend/SDK Disler и native Durable authority/recovery. Нужна новая capability — сначала найдите конкретный отсутствующий контракт; не стройте параллельный engine, журнал или queue.

## Работа с изменениями

- Читайте README, docs/STATUS.md, ISA.md и инструкции затрагиваемого пакета.
- Делайте связные коммиты: coupled backend+SDK вместе, независимые адаптеры отдельно, документацию отдельно, когда это не ломает воспроизводимость.
- Не добавляйте node_modules, dist, SQLite, tarball, transcripts, private config или credentials.
- Не публикуйте непроверенную незавершённую работу как принятый milestone.
- При параллельной работе договоритесь о владельце общих manifests/lockfiles и Git index; чужие изменения не сбрасывайте.

## Проверки

В каталоге изменяемого пакета выполняйте его scripts из package.json: check, test и build/pack. У клиента также нужен fresh tarball install вне checkout, чтобы symlink/workspace dependency не скрыла server runtime в bundle.

Native integration tests используют реальный Harness/SQLite, временные HOME/dataDir и faux provider. Никаких живых моделей, personal memory banks или production DB без отдельного разрешения.

Не переписывайте acceptance thresholds ради зелёного теста. Пишите, что именно проверено: source или installed archive, API fixture или полноценная UI, local faux или реальный provider.

## Безопасность

Bearer/provider secrets остаются на сервере/в приватном окружении. Не размещайте их в issue или PR. Не ослабляйте guards, текущую авторизацию, native parent-control или human-acceptance ради удобства теста.

Runtime profile совместим не только по compile result, но и по сохранённым definitions/IDs и reopen evidence. Номер версии пакета не заменяет его SHA-256.
