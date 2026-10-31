# Native model ownership

This module uses the public `@earendil-works/pi-ai@1.4.0` API.
The selected host uses the same `createModels` container and `builtinProviders` factories.
The module does not copy the private CLI configuration engine.
The MIT notices for Mario Zechner and IndyDevDan remain in `LICENSE`.
The SDK dependency also declares the MIT license.

## Server configuration

Create one container and one provider set for each native session.
Supply an explicit native `CredentialStore` through trusted server code.
The default `AuthContext` returns no environment values and no file paths.
Supply explicit callbacks for other authorized auth sources.
Supply an explicit `ModelsStore` for a durable cache, if necessary.
The default SDK store uses memory only.

The default provider list comes from the public SDK.
An explicit `providers` list replaces that list without aliases or implicit additions.
Duplicate provider IDs cause an error.
Custom providers must obey the native SDK contracts for auth and cache refresh.
The native SDK owns API-key resolution, OAuth refresh, credential locks, model filters and request dispatch.

## Native lifecycle

1. Call `await createNativeModels({credentials, providers?, authContext?, modelsStore?, defaultModel?})` before `Harness.open`.
2. Call `await runtime.requireModel(savedReference)` before the native resume path.
3. Pass `runtime.models` to the same native `Harness.open` operation.
4. Use `await runtime.catalogue()` for the public chat-model menu.
5. Keep credentials, auth results, provider objects and native model objects on the server.

The cache refresh uses `allowNetwork: false` at startup.
The module never starts login or network catalog refresh.
Availability checks do not refresh OAuth.

An explicit model request can use the normal native OAuth refresh path.
The default reference contains only `provider` and `modelId`.
Missing models or credentials cause an error, not a default substitution.
The menu exposes exact IDs, names, context limits, costs, availability and native levels for thought.
It excludes request headers, endpoint URLs and credential metadata.

## Profile integration

The Store owner must select this container before model validation and `Harness.open`.
The profile can supply a trusted session factory through its server composition.
The Store must validate saved references against that exact container, not the baseline faux/OpenRouter menu.
This module does not change the Store, SDK, profile factory or package manifests.

The CLI `models.json` parser, virtual-model composer and private credential files remain outside this module.
Supply native providers with their original IDs for such configurations.
The module does not claim compatibility with every installed private adapter.

## Evidence

`tests/native-models.test.mjs` uses real native Harness, SQLite, faux providers and a loopback server.
It checks two containers with identical provider/model IDs and separate synthetic auth scopes.
It checks missing auth, missing saved models, closure, cancellation, duplicate IDs and inert client metadata.
It also checks public builtin metadata and the native serialized OAuth refresh path.
No live model, external auth service or personal configuration participates.
Configured profile, package and independent milestone checks remain separate acceptance steps.
