# Local candidate install

## Scope

The candidate uses Pi Durable 1.4.0. The launcher selects `minimal@1` by default. This profile provides the native coding tools without playground jobs.

The full native profile is not ready. Delegated mutations remain unavailable. Do not replace a production runtime or open a production database.

## Check the complete install

Use Node 22.19 or newer. Install the local dependencies in both package directories first.

```sh
(cd apps/dpi-sdk && npm ci --ignore-scripts)
(cd apps/dpi-backend && npm ci --ignore-scripts)
(cd apps/dpi-backend && npm run package-smoke)
```

The check creates two local tarballs and installs them under a temporary HOME. It executes a TypeScript client and a curl client. Both clients use faux tools on loopback. The check also kills the backend and verifies the original submission after restart.

The final JSON gives the artifact paths. The temporary directory retains the artifacts, the isolated data and `backend.log`. The check stops its backend before exit. No publication or deployment occurs.

## Use the artifacts

Create a separate directory. Install both tarballs there.

```sh
mkdir isolated-host
cd isolated-host
npm init -y
npm install --ignore-scripts /PATH/dpi-sdk-0.1.0.tgz /PATH/dpi-backend-0.1.0.tgz
export DPI_HOME="$PWD/data"
export DPI_START_DIRS="$PWD/work"
export DPI_PROVIDER=faux
export DPI_TOKEN="$(node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("hex"))')"
./node_modules/.bin/dpi-backend
```

Keep the bearer token private. The default address is `127.0.0.1:4780`. The client imports `DpiClient` from `dpi-sdk` or `dpi-sdk/client`.

Set `DPI_PROFILE=playground` before startup only when you need the upstream demo. A session retains its profile ID. A different profile ID refuses the session before native construction or resume. Legacy sessions without a profile record require an explicit migration, outside this install check.

Trusted server code can import `dpi-backend/store` and `dpi-backend/profiles`. A custom profile factory needs a stable `id`. HTTP callers cannot choose a module path.

The SDK artifact contains only the HTTP client, wire types and projections. It has no runtime dependencies or session storage. The repository retains the optional device-registry tools under `src/node`. The SDK artifact does not contain them.
