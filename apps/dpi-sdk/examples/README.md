# SDK and HTTP client recipes

These runnable examples use only the public host API. They do not open a Harness, registry, SQLite file or session owner. Closing a recipe process does not close the server session.

## Inputs

Set these variables in the client environment:

- `DPI_URL`: an already running, trusted host URL, e.g. `http://127.0.0.1:3141`.
- `DPI_TOKEN`: its server-issued bearer credential. Do not put it in a URL, commit it, print the environment or enable shell tracing.
- `DPI_CWD`: an existing folder **on the host**, not on the client.
- `DPI_MODEL_PROVIDER` / `DPI_MODEL_ID`: an explicit model from that host. Isolated tests use `faux` / `echo`; the recipes do not silently pick a paid provider or replace a model.
- `DPI_REQUEST_KEY`: a persisted client key, at most 110 characters. Save it before the first run. The recipe derives `:session` and `:submit` keys from it.
- `DPI_PROMPT`: optional input text.

Use a fresh key for a new job. For a lost ACK, disconnect or uncertain outcome, rerun the **same recipe with unchanged key and inputs**; this reconciles the same session and native submission. Changed inputs with the same key are conflicts, not new work. Do not blindly retry unsafe external effects or create a new key to hide uncertainty.

## Run from this source checkout

The SDK recipe imports `../src/client.js` (the public SDK client) and uses the candidate's installed `tsx` loader. It does not import the backend. From `apps/dpi-backend`:

```sh
node --import tsx ../dpi-sdk/examples/sdk-client.ts
```

Independent HTTP, with no SDK or other JavaScript package dependencies:

```sh
node ../dpi-sdk/examples/http-client.mjs
```

The literal curl alternative requires `curl`, `sh` and Node for safe JSON encoding/decoding, but no SDK:

```sh
sh ../dpi-sdk/examples/http-client.sh
```

Each example checks protocol discovery before mutation, creates/reconciles a session, sends a stable message key and reads the terminal result. Both HTTP examples explicitly read the native message receipt before the result. They print one JSON object containing `sessionId`, `submissionId`, `status` and `answer`; credentials and raw network errors are not printed. Bounded waits can end without an answer; rerun unchanged inputs rather than inventing another key.

The curl recipe supplies its bearer header over stdin, not in curl's command-line arguments. It does not enable tracing. These examples never archive/delete a session automatically because an idempotent retry still needs that resource; disposable test cleanup is owned by the test harness instead.

## Executable verification

```sh
cd apps/dpi-backend
node --import tsx --test tests/client-recipes.test.ts
```

The fixture boots the real faux host on loopback with temporary HOME/dataDir, runs each recipe twice in a separate client process, checks answer plus identical session/submission identity and scans client/server output for its credential sentinel. It makes no live-model/API call. Source checks exclude Harness/storage imports from all recipes and SDK imports from the HTTP examples.

This is ISC-35/36 **source-client execution evidence**, not a claim that published tarballs, clean-machine package installation (ISC-9/38), full native profile or production credentials are verified. SDK package exports/build and packed-install checks are separate P2 work; this document does not promise an unimplemented installed import path.
