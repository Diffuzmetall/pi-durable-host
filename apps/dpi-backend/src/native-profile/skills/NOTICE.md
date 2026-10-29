# Native skills and context source

This directory localizes the selected `20261028-4rmMfRfc` coding-agent source. The original MIT notice is in `LICENSE`; source/local SHA-256 mappings are in `SOURCE.json`. The parent package retains the fork's license separately.

## Owning implementation

- `experimental/durable/skills.ts`: `DefaultPackageManager.resolve(skip)` followed by `loadSkills(includeDefaults:false)`. This is the pipeline in `index.ts`, not a replacement discovery engine.
- `core/package-manager.ts`, `core/skills.ts`, parser/path/git/text/manifest/source-info helpers: actual source algorithms, including packages, scope precedence, exclusions/globs/ignore files, duplicate/validation diagnostics, symlinks, skill names and model-invocation visibility.
- `core/resource-loader.ts` context helpers and `footer-data-provider.ts` Git metadata helper: extracted into `upstream/core/context.ts`; no watcher/footer runtime is imported.
- `core/system-prompt.ts`, four tool prompt contributions and `experimental/durable/prompt.ts`: actual structured sections and per-request WeakMap sharing. A new request rebuilds resources; seven sections of one request share that build.
- Goal bodies use the already-localized actual `automation/goal-skills.ts` reader, with a trusted catalogue **always** supplied. Its ambient headless fallback is never invoked. File/256-KiB/empty-file checks and `Source: <path>` Goal formatting remain native.

## Deliberate localization deltas

Relative TypeScript imports use `.js`. `CONFIG_DIR_NAME=.pi` is retained without importing CLI/global configuration. The resource resolver receives mandatory `homeDir` and inclusive `projectRoot`; its tilde/home/ancestor resolution never falls back to process HOME or ancestors outside that boundary. Legacy global-npm probing is disabled; an operator may declare an existing package as an explicit local source. Managed installed npm/git packages and local packages still use the actual native resolver. Missing packages are skipped, never installed; the added warning omits raw package URLs, which may contain credentials.

`readOnlyResourceSettings` is a data facade for explicit global/project resource configuration, not a settings persistence service. It exposes no personal settings files, and mutations fail. An untrusted project's resource configuration is empty. Native project context files remain discoverable without project trust, as in the selected implementation. Context read warnings become structured diagnostics instead of process-global CLI output. Documentation paths are optional explicit server data; absent documentation is not advertised with installed/private runtime paths.

The upstream package-manager module retains unused management methods to keep its resolution implementation together. The exported integration exposes only discovery; it never calls installation, update, temporary-package resolution, global npm commands, stdout takeover or cloud-sync mutations. No new dispatcher, global environment, Storage, Harness, background process or lifecycle owner is introduced.

## Callable contract

`createNativeSkills({cwd,projectRoot,homeDir,agentDir,projectTrusted,globalSettings?,projectSettings?,documentation?,onDiagnostics?})` returns:

- `extension`: install in the existing registry before `Harness.open`; name `pi-prompt`, native section keys/order.
- `catalogue(cwd?)`: native metadata/diagnostics, no skill bodies. A supplied cwd must exist beneath the explicit project boundary.
- `context(cwd?,selectedTools?)`: native sections/context files/skills/diagnostics.
- `getSkill(name)`: a current trusted descriptor plus exact file `content`. Expose this only behind the parent's root/filesystem authorization, not generic observer metadata.
- `resolveGoalSkill`: directly assign to native automation's resolver. An optional advertised snapshot can only narrow current trusted discovery; its path never authorizes a read. The resolver already supplies current trusted discovery to the native reader. If the parent additionally sets `setSkillCatalogue((await catalogue()).skills)`, refresh that narrowing snapshot on resource reload; do not accidentally freeze Goal discovery at startup.

One factory is bound to one root session's explicit resource configuration. No bind/close/cleanup operation is needed. The parent owns registry installation, admission and HTTP access. A Goal preserves its admitted body snapshot through the actual native Goal runtime document; file changes do not rewrite it. Declared source symlink semantics remain native: these are operator-trusted resource directories, not an independent filesystem sandbox.

## Dependencies and checks

Direct source closure: `ignore@7.0.8`, `minimatch@10.2.6`, `semver@7.8.5`, `hosted-git-info@9.0.3`, `cross-spawn@7.0.6`, `yaml@2.9.0`, plus `@types/cross-spawn@6.0.6`, `@types/hosted-git-info@3.0.5` and `@types/semver@7.7.1`. Existing pinned public Durable/AI APIs remain the runtime owners. Coupled manifests and package installation belong to the parent integrator, not this source task.

Focused test: `cd apps/dpi-backend && node --import tsx --test tests/native-skills.test.ts`. It uses disposable directories, native Harness/SQLite/Goal documents and faux models only. No live model, personal skill/config/auth tree, network discovery or installed-runtime product import is permitted. Component verification does not accept full configured/packed profile, provider authentication or terminal/BB/iii milestones.

Machine-local verification artifacts are not distributed. See the public status and reproducible package tests.
