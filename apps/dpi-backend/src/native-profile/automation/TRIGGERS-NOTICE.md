# Native bounded GitHub triggers

Derived from pi-durable-extensions `packages/durable-triggers/src/index.mjs` and `packages/local-host/src/github-triggers.mjs`, selected runtime release `20261028-4rmMfRfc`. MIT notices are retained in LICENSE and LICENSE.triggers.

Native document `durable.triggers.watches` v1 and task `durable.triggers.poll` v2 (including its v1 migration), outbox/request IDs, budgets and event screening are unchanged. The host supplies current Root authorization and admission without requiring Hindsight. The GitHub transport uses an explicit environment with HOME and GH_CONFIG_DIR instead of process.env; missing configuration fails closed. No existing watches or installed runtimes are migrated or activated by installing the backend.
