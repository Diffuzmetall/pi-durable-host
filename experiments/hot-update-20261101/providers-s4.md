# S4: providers без обрыва текущего stream

Dave завершил авторские source проверки S4. Независимая проверка нового установленного candidate ещё NOT RUN.
Production activation NOT RUN. Работающий Host, реальные credentials и live models не использовались.

## Повторное использование

Сохранены существующие Models facade, prepareReload, provider/auth snapshots и HTTP/SDK reload.
Сохранён прежний credential owner из compiled/bindings.mjs.
Новый auth runtime, watcher, manager или протокол не добавлен.

Исходный пробел: catalogue() после asynchronous availability lookup мог читать metadata другой generation.
RED воспроизведён в /tmp/hot-update-sandbox-19q0bl5h/run.log: 1 PASS, 1 FAIL.
Теперь catalogue() использует один snapshot до и после await.

Operational source раньше статически импортировал provider и compiled implementation.
Повторный вызов source не перечитывал код этих модулей.
Теперь operationalModelOptions вызывает существующий loadFreshModule для двух server-owned paths.
Это прежний свежий Jiti evaluator Carol, включая transitive imports.
Статический import bindings.mjs не изменён: credential owner не пересоздаётся.
Старые provider objects сохраняют прежние stream/access closures.

## Проверки

Все runtime команды выполнялись внутри физически изолированного sandbox после SANDBOX_NEGATIVE_SELF_CHECK_PASS.
Точные argv и mount arguments сохранены в command.json каждого sandbox.

- /tmp/hot-update-sandbox-142m2pdk/run.log: 4 PASS, exit0.
- /tmp/hot-update-sandbox-r1j1pg3i/run.log: offline Antigravity bootstrap 1 PASS, package typecheck exit0.
- Scoped git diff --check: exit0.

Первый запуск использовал tests/provider-hot-reload.test.mjs через node --import tsx --test.
Второй запуск использовал experiments/sdk-host-cutover/antigravity-integration.test.mjs и tsc --noEmit для packages/durable-reload.
Source aliases направляли @local/pi-durable-reload и dpi-backend/native-profile на свежие исходники.
Alias @earendil-works сохранял backend SDK identities.
Причина: физическая backend dependency остаётся старой копией, а не symlink.
Final packaging должна заменить физическую dependency; source alias не является установленной приёмкой.

### Проверенные инварианты

- Catalogue read сохраняет одну generation при concurrent publication.
- Stream v1 завершается с прежним provider и synthetic credential.
- Следующий request использует provider v2, metadata v2 и synthetic credential v2.
- Models facade и Harness сохраняют identity при busy Host/HTTP/SDK reload.
- Exact provider/model IDs сохраняются после reload и reopen SQLite.
- Удаление saved model отказывает без fallback и сохраняет прежний published provider.
- Prepare failure не публикует candidate; HTTP error скрывает private failure text.
- Rollback v2→v1 работает через прежний reload без замены Harness.
- Operational wrapper перечитывает provider code и transitive implementation.
- Operational wrapper сохраняет identity статического credential function после изменения bindings fixture.
- Invalid transitive import отказывает; опубликованный v2 остаётся пригодным.
- Offline bootstrap использует настоящий compiled implementation без внешнего API и сохраняет read-only account-store boundary.

Операционный code-refresh test использует synthetic resource-free modules, не настоящий model transport.
Host integration использует настоящие Store/Harness/SQLite/HTTP/SDK и faux provider.
Проверка offline bootstrap не отправляет model request и не обращается к реальным credentials.

## Хэши source candidate

```text
ca251ce3231f81ad93888490493916b82011d38449c2dbfc43e632b3794341d9 packages/durable-reload/src/models.ts
e5c8a0f8869b13d68ceb8348f53ff82e25631ed7219b4b2d5a09dc2d3be8ba05 experiments/sdk-host-cutover/operational-models.mjs
436e246979097f420fb04ceb4f46a1fea0564042447a0af374cb6526f7cd307a apps/dpi-backend/tests/provider-hot-reload.test.mjs
```

Carol RESOLUTION2edb4558ed1e4ce29e196643d920cfc2 уже закрыла исходный busy-barrier FAILa896f3d5b88f4036af4c6974c040e57a.
Новый integrated запуск Dave подтверждает этот source path.
Bob может продолжить voice output после DONE S4; Alice получает operational-models для финальной упаковки.
Grace и Heidi должны проверить один новый immutable manifest независимо.

Общие release-return FAIL и прежний auth incident остаются открытыми.
S4 source PASS не означает полную приёмку R4 или разрешение production activation.
