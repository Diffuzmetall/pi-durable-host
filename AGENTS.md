# Instructions for coding agents

Read README.md and docs/STATUS.md first. This is a fork of disler/durable-pi targeting native Pi Durable 1.4.0. Preserve upstream Git history, MIT notices, the public host/SDK boundary and native authority/recovery.

Use docs/agents/ for portable installation/integration prompts. Read relevant package manifests and current sources before choosing commands or APIs.

- Clients use public SDK/HTTP/SSE, never session SQLite/Harness or another adapter's runtime.
- Profiles are trusted server code with stable IDs and registered native definitions; HTTP bodies cannot choose modules or grant authority.
- Preserve saved model IDs, canonical receipts, stable retry bodies/keys, native parent target/revision and human acceptance.
- Use temporary HOME/dataDir/workspace, faux providers and loopback for checks. Do not read private banks/config/credentials or call paid/live models by implication.
- Do not modify production, migrate live databases, publish packages or deploy without explicit authorization. Never disable guards or silently replace a missing model/profile/capability.
- Preserve unrelated work. Stage explicit paths and review the staged diff before an authorized commit; coordinate shared files/index.
- Report fresh checks on exact source/artifact and disclose limits. ACK, idle state, compilation or a fixture transport alone is not proof of successful native execution or full UI compatibility.

No machine-specific paths, global agent installation or named model is required by these instructions.
