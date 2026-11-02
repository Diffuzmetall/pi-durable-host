# Registry probe reproduction

Эти файлы фиксируют только три upstream unit tests. Они не запускают Host/модели/SQLite и не принимают новый full profile.

- [registry-tests.txt](registry-tests.txt): исходный stdout/stderr успешного запуска; exit 0 записан вызывающим процессом.
- [isolation.mjs](isolation.mjs): отрицательная проверка видимости четырёх production paths.
- [source-doc-check.txt](source-doc-check.txt): прежняя source/doc-проверка до переноса в общий архитектурный пакет. Число ссылок относится к той версии; свежую проверку выполняет `../verify.py`.

Выполненная команда (путь probe теперь указывает на сохранённую идентичную копию):

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

Нужен уже существующий checkout точного commit из [EVIDENCE](../EVIDENCE.md). Не заменять его изменяющимся main и не расширять mounts до пользовательского HOME ради удобства.
