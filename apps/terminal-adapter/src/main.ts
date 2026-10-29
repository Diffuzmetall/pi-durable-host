#!/usr/bin/env node
import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { DpiClient } from "dpi-sdk";
import { DpiError } from "dpi-sdk/errors";
import type { CreateSessionBody } from "dpi-sdk/api";
import { RemoteTerminal } from "./remote-controller.js";
import { agentOf } from "./types.js";
import { runDurableTui } from "./ui/experimental/durable/tui.js";

async function main() {
  if (process.argv.includes("--help")) {
    console.log("dpi-terminal <host-url> <session-id>\nDPI_TOKEN supplies the bearer credential. DPI_URL/DPI_SESSION may supply the positional values. /quit detaches; the host keeps executing.");
    return;
  }
  const url = new URL(process.argv[2] ?? process.env.DPI_URL ?? "");
  let sessionId = process.argv[3] ?? process.env.DPI_SESSION;
  const token = process.env.DPI_TOKEN;
  if (!sessionId || !token?.trim() || !["http:", "https:"].includes(url.protocol) || url.username || url.password) throw Error("Missing host, session or credential");
  const client = new DpiClient(url.href.replace(/\/$/, ""), token);
  // Credential participates only in a one-way cache partition, never a filename or diagnostic.
  const partition = createHash("sha256").update(`${url.href}\0${token}`).digest("hex");
  const directory = join(homedir(), ".local", "state", "dpi-terminal", partition);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const createIntent = join(directory, "new-session.json");
  const settings = {
    getTerminalCapabilityOverrides: () => ({}),
    getEnableSkillCommands: () => true,
    getAutocompleteMaxVisible: () => 10,
    getThemeSetting: () => undefined,
  };
  for (;;) {
    const terminal = await RemoteTerminal.open(client, sessionId, join(directory, createHash("sha256").update(sessionId).digest("hex")));
    let selected: string | null | undefined;
    try { selected = await runDurableTui(terminal, terminal, settings); }
    finally { await terminal.close(); }
    const current = terminal.current();
    if (selected === undefined) return;
    if (selected !== null) { sessionId = selected; continue; }
    const model = agentOf(current.conversation).model;
    if (!model) throw Error("The host has not selected a model; no fallback was made");
    const body: CreateSessionBody = { name: "Untitled session", cwd: current.session.cwd, model };
    let intent: { key: string; body: CreateSessionBody };
    try {
      const value: unknown = JSON.parse(await readFile(createIntent, "utf8"));
      if (!value || typeof value !== "object" || !("key" in value) || typeof value.key !== "string" || !("body" in value) || !value.body || typeof value.body !== "object" ||
          !("name" in value.body) || typeof value.body.name !== "string" || !("cwd" in value.body) || typeof value.body.cwd !== "string" || !("model" in value.body) ||
          !value.body.model || typeof value.body.model !== "object" || !("provider" in value.body.model) || typeof value.body.model.provider !== "string" ||
          !("modelId" in value.body.model) || typeof value.body.model.modelId !== "string") throw Error("Invalid saved new-session intent");
      intent = { key: value.key, body: { name: value.body.name, cwd: value.body.cwd, model: { provider: value.body.model.provider, modelId: value.body.model.modelId } } };
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
      intent = { key: randomUUID(), body };
      const file = await open(createIntent, "wx", 0o600);
      try { await file.writeFile(JSON.stringify(intent)); await file.sync(); }
      finally { await file.close(); }
    }
    if (JSON.stringify(intent.body) !== JSON.stringify(body)) throw Error("Pending session creation has different inputs; no request was changed or replayed");
    // Only an explicit /new reaches this path; startup never replays an uncertain command.
    const created = await client.createSession(intent.body, intent.key);
    await unlink(createIntent);
    sessionId = created.id;
  }
}

main().catch((error: unknown) => {
  if (error instanceof DpiError && error.code === 'unavailable' && error.status === 0)
    console.error('Host protocol or installed SDK capabilities are incompatible; no fallback was made.');
  console.error("Terminal could not connect or complete the operation. Check the host/session/grant; no local execution owner was started. Pending request keys remain in the private client cache.");
  process.exitCode = 1;
});
