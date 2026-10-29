# Первый запуск без платных моделей

Эта инструкция запускает **новый изолированный host** с профилем `minimal@1` и faux provider. Она не подключает рабочую SQLite, не меняет глобальные настройки Pi и не включает личные интеграции.

## 1. Собрать локальные пакеты

```sh
git clone https://github.com/Diffuzmetall/pi-durable-host.git
cd pi-durable-host
node --version                 # требуется 22.19 или новее
(cd apps/dpi-sdk && npm ci --ignore-scripts)
(cd apps/dpi-backend && npm ci --ignore-scripts)
mkdir -p artifacts
(cd apps/dpi-sdk && npm pack --pack-destination ../../artifacts)
(cd apps/dpi-backend && npm pack --pack-destination ../../artifacts)
```

`npm pack` выполняет проверяемый локальный build, но ничего не публикует. `--ignore-scripts` при установке зависимостей не отменяет явно запущенную сборку. Не ставьте пакеты глобально и не заменяйте зависимости на произвольный `latest`.

## 2. Установить host отдельно от checkout

Из корня репозитория:

```sh
REPO="$PWD"
DEMO="$(mktemp -d)"
mkdir -p "$DEMO/install" "$DEMO/work" "$DEMO/home"
cd "$DEMO/install"
npm init -y
npm install --ignore-scripts --no-audit --no-fund \
  "$REPO/artifacts/dpi-sdk-0.1.0.tgz" \
  "$REPO/artifacts/dpi-backend-0.1.0.tgz"
```

Оставьте этот каталог для проверки и диагностики. В нём нет исходной рабочей базы. Номер `0.1.0` здесь соответствует текущим manifests; при изменении версии используйте имена реально собранных файлов.

## 3. Запустить сервер

В том же shell:

```sh
export HOME="$DEMO/home"
export DPI_HOME="$DEMO/data"
export DPI_START_DIRS="$DEMO/work"
export DPI_PROVIDER=faux
export DPI_PROFILE=minimal
export DPI_TOKEN="$(node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("hex"))')"
export DPI_BASE=http://127.0.0.1:4780
(umask 077; printf '%s' "$DPI_TOKEN" > "$DEMO/token")
printf 'REPO=%s\nDEMO=%s\n' "$REPO" "$DEMO"  # только несекретные пути
./node_modules/.bin/dpi-backend --host 127.0.0.1 --port 4780
```

Сервер работает в foreground. Если порт занят, выберите другой порт и тот же адрес у клиента. Не выводите `DPI_TOKEN` в логи, сообщения или shell history. Не слушайте `0.0.0.0` и не открывайте порт в интернете ради этой проверки.

Окружение второго shell **не наследует** переменные первого. Подставьте два несекретных пути, напечатанных перед запуском сервера; приватный токен прочитайте из созданного файла с правами `0600`, не выводя его:

```sh
export REPO=/absolute/path/to/checkout
export DEMO=/absolute/path/to/disposable-demo
cd "$DEMO/install"
export DPI_BASE=http://127.0.0.1:4780
export DPI_START_DIRS="$DEMO/work"
export DPI_TOKEN="$(node -e "process.stdout.write(require('node:fs').readFileSync(process.argv[1], 'utf8'))" "$DEMO/token")"
```

Не пересылайте файл или токен через issue, чат с агентом или README. Если меняли порт сервера, измените `DPI_BASE` здесь тоже. После остановки disposable host этот токен больше не нужен; не используйте его для рабочего сервера.

## 4. Отправить сообщение через публичный SDK

Сохраните рядом с установленными пакетами файл `client.mjs`:

```js
import { DpiClient } from 'dpi-sdk/client';

const { DPI_BASE, DPI_TOKEN, DPI_START_DIRS } = process.env;
if (!DPI_BASE || !DPI_TOKEN || !DPI_START_DIRS) {
  throw Error('Задайте адрес, приватный token и один абсолютный workspace');
}
const client = new DpiClient(DPI_BASE, DPI_TOKEN);
console.log(await client.protocol());
const session = await client.createSession({
  name: 'first-local-session',
  cwd: DPI_START_DIRS,
  model: { provider: 'faux', modelId: 'echo' },
  thinkingLevel: 'off',
}, 'first-local-session-v1');
const root = client.agent(session.id, 1);
const receipt = await root.send('Hello from the public SDK', 'followUp', 'first-input-v1', 15000);
console.log({ sessionId: session.id, receipt });
console.log((await root.entries()).items);
```

```sh
node client.mjs
```

Ожидается канонический receipt и native assistant result. В faux-режиме нет вызова живой модели. Сохраните `sessionId`: именно к этой session можно подключить другой клиент.

Ключи примера намеренно стабильны. Повтор в **той же** data directory с теми же ключами и телом должен сверить существующую работу. Для другого эксперимента используйте новые ключи или новую disposable directory. Не меняйте тело принятого запроса, сохраняя прежний ключ.

## Что считать успешной установкой

- Host слушает только ожидаемый loopback-адрес.
- `client.protocol()` возвращает версию и capabilities; авторизация работает.
- SDK получает настоящий итог, а не только HTTP ACK или `busy=false`.
- Повтор ключа не создаёт вторую работу; конфликтующий payload отклоняется.
- После закрытия клиента host остаётся владельцем работы.

Более полный воспроизводимый тест установки:

```sh
cd "$REPO/apps/dpi-backend"
npm run package-smoke
```

Тест создаёт временные HOME/dataDir, упаковывает и устанавливает backend/SDK, проверяет HTTP/SDK и восстановление после остановки процесса. Он не является миграцией ваших данных. Смотрите итоговый JSON и сохранённые диагностические файлы.

## Дальше

[Клиенты](CONNECTING_CLIENTS.md) · [Свой profile](CUSTOM_RUNTIME.md) · [Новый адаптер](BUILDING_ADAPTERS.md)
