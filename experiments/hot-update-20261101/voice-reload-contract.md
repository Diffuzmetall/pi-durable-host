# Проверенный контракт voice reload для S5

Dave проверил installed Component SDK и GipPity Voice 0.10.0.
Работающий Host и реальные credentials не использовались. Production activation NOT RUN.
Это отдельный исследовательский output для Bob, не приёмка ISC-67 или всей S5.

## Старый lifecycle и опасный путь

`experiments/gippity-voice/integration.mjs:118` передаёт rejecting whenIdle.
`pi-durable-components/dist/index.js:221` реализует retire: stopProducerAdmission → observeRetirementIdle → beforeClose.
SDK сохраняет поколения с retention:harness или afterClose; простой счётчик tools не заменяет этот контракт.

Однако actual GipPity createComponent сейчас возвращает retention:idle, bind и beforeClose.
Он не возвращает stopAdmission или afterClose.
Источник: `pi-durable-gippity-voice/dist/activation.js:9442–9461`.
Здесь нельзя автоматически предполагать retention:harness из общего PLAN.

`controls.active` проверяет session/dictation/transferred, но не все ожидающие start/queue operations.
Источник: `activation.js:8845–8852`.
Поэтому один getter не доказывает локальный whenIdle.

`controls.stopLan()` вызывает текущий listener.close.
Источник: `activation.js:9008–9011`.
Listener.close прекращает browser voice и закрывает dictation/transcriber.
Источник: `activation.js:7645–7661`.
Следовательно, stopLan нельзя выдавать за stopAdmission без cancellation принятой audio operation.

`controls.close(context)` также отменяет task через harness.abortTask.
Источник: `activation.js:9055–9067`.
Это shutdown, не горячая замена вокруг активной операции.
Простая замена rejecting whenIdle на stopLan/close нарушит требование сохранения принятой работы.

## Найденный существующий безопасный callback seam

Advanced `gippityVoiceOptions` передаёт исходный options object в createGippityVoice.
Код не копирует rpc callback при construction.
`controls.rpc` вызывает актуальный `options.rpc` при каждом отдельном запросе.
Источник: `activation.js:8916–8922` и `9442–9451`.
`projectContext`, `present` и instructions также читаются из options; их отдельная runtime проверка ещё NOT RUN.

Это позволяет оставить прежний Component instance, native service task и resource owner.
Каждый начавшийся async callback продолжает старый function object после publication нового callback.
Для callback-only обновления не нужны второй component, retire или новый listener.
Это проверенный узкий seam, а не разрешение менять весь retained kernel.

## Воспроизводимый runtime probe

Файл: `experiments/hot-update-20261101/voice-callback-contract.test.mjs`.
Probe использует настоящие installed Component SDK, GipPity createComponent, Harness и SQLite из sealed alice-v2.
Native service запускается через controls.sendText с faux provider.

Локальный RPC v1 удерживается promise; options.rpc заменяется на v2.
Новый RPC возвращает v2, прежний заканчивает v1 без abort.
Component/controls identity и native service task IDs сохраняются; retirement не вызывается.
Audio launch и microphone lease запрещены assertions.

Sandbox: `/tmp/hot-update-sandbox-tsg26ybl`.
Negative isolation self-check PASS, 1 test PASS, exit0.
Точные argv и mount arguments: command.json этого sandbox.

Предыдущие попытки выявили только ошибки самого probe:
- `/tmp/hot-update-sandbox-5jhi48gc`: source symlink dependency отсутствует внутри sandbox.
- `/tmp/hot-update-sandbox-igkiy044`: неверное предположение harness.tasks; заменено существующим taskGraph.

Final probe использует /candidate только для неизменённых dependencies alice-v2.
Новый R4 candidate и Host/HTTP reload этим запуском не принимаются.
RPC callback является local boundary, не настоящей принятой audio operation.

## Минимальный следующий implementation scope

Dave получил передачу voice scope от Bob: FACT348.
Общий profile остаётся у Carol; MCP/memory остаются у Bob.

Следует сохранить прежний SDK component/kernel и listener.
Свежие resource-free callbacks нужно подключать через existing server-owned loadFreshModule и прежний prepareReload.
Для actual audio callback необходим отдельный доказанный idle/pinning boundary существующей audio lease.
Нужно дождаться принятой операции без stopLan/close и проверить generation непосредственно перед publication.
При появлении новой операции между idle и publication candidate обязан отказать без mutation.
Нельзя повторно bind компонент, отменять native service task или запускать второй listener.

Следующий обязательный probe: actual Host/SDK reload, локальная audio operation v1, затем handler v2.
Он должен отдельно доказать whenIdle, отсутствие cancellation и bounded resources.
RPC PASS сам по себе не закрывает этот criterion.

## SHA256

```text
7369d3773c4780c8e5bd39e86c599083cb3e351a84c65829b458612225f13789 experiments/gippity-voice/integration.mjs
346d2ffd66a844b39177c93b8501748e5671ba628f6a7e0ef56bf768d414fdff pi-durable-components/dist/index.js
c4b41315a52bad8e9a7b320964f366d9ca6a9283ac02b1c6adadcd4c2f2e5c3e pi-durable-components/dist/contracts.d.ts
da236ce9b8b7793a06775990b19d5e94e8c5a76c3ffb419af0c75aa968d16602 pi-durable-gippity-voice/dist/activation.js
3ae718544710b4094ba7d8fccf3049ef6c29276994d087eeb72ecc29d5f80bf4 experiments/hot-update-20261101/voice-callback-contract.test.mjs
```

Activation hash совпадает у source dependency и sealed alice-v2.
Dependency файлы и sealed artifact не изменены.
Общие release-return FAIL и auth incident остаются открытыми.
