# Файлы доказательств проверки registry

Этот справочник описывает файлы исходного исследования и записанную команду воспроизведения. Файлы фиксируют только три модульных теста upstream. Проверки не запускают Host, модели или SQLite. Они не подтверждают приёмку нового полного профиля.

- [registry-tests.txt](registry-tests.txt) содержит исходные stdout и stderr успешного запуска. Вызывающий процесс записал exit 0.
- [isolation.mjs](isolation.mjs) проверяет отсутствие доступа к четырём production-путям.
- [source-doc-check.txt](source-doc-check.txt) содержит прежнюю проверку исходников и документации до переноса в общий архитектурный пакет. Число ссылок относится к той версии. Проверку актуального исходного пакета выполняет `../verify.py`.

При редактуре эти файлы и скрипты не копировались и не запускались. Относительные ссылки сохраняют структуру исходного пакета документации.

Ниже записана выполненная команда. Путь пробы указывает на сохранённую идентичную копию.

```sh
bwrap --unshare-all --new-session --die-with-parent --clearenv \
  --ro-bind /usr /usr \
  --symlink usr/lib /lib --symlink usr/lib64 /lib64 --symlink usr/bin /bin \
  --proc /proc --dev /dev --tmpfs /tmp --dir /home/sandbox \
  --setenv HOME /home/sandbox --setenv PATH /usr/bin:/bin \
  --ro-bind /home/ubuntu/.nvm/versions/node/v24.19.0/bin/node /node \
  --ro-bind /var/tmp/durable-zero-research-20261102-v070 /zero \
  --ro-bind "$PWD/docs/architecture/zero/proof/isolation.mjs" /probe.mjs \
  --chdir /zero -- /bin/sh -c \
  '/node /probe.mjs && /node --test packages/core/test/builtin-extension-registry.test.ts'
```

Команда требует уже существующего checkout точного commit из [справочника доказательств](../EVIDENCE.md). Использование изменяемого main не воспроизводит закреплённую проверку. Подключение пользовательского HOME нарушает исходные условия изоляции.
