# Сравнить исходники без запуска Host

Назначение документа: инструкция для сравнения двух commit. Исходные выводы перечислены в [CHANGES](CHANGES.md).

Если оба commit object доступны, выполните команды из checkout этой ветки.

```sh
git diff --stat 37165c619573dbaf425463038bbffecfe576beec 830ad61af22b1585f1358896f286acd40492c7ca -- apps packages
git diff 37165c619573dbaf425463038bbffecfe576beec 830ad61af22b1585f1358896f286acd40492c7ca -- apps/dpi-sdk/src/api.ts apps/dpi-backend/src/http-server.ts
```

Команды читают Git. Они не запускают Host. Для сравнения не используйте private config, production SQLite, activation scripts или перезапуск сервиса.
