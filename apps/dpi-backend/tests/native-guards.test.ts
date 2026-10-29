import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, chmod, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createServer } from "node:http";
import { once } from "node:events";
import { BACKGROUND_CONTEXT as ctx } from "@earendil-works/chord/context";
import type { Context } from "@earendil-works/chord";
import { NodeExecutionEnv } from "@earendil-works/pi-durable/env/node";
import { ok, type ShellExecOptions } from "@earendil-works/pi-durable/env";
import { createDcgEnvironmentFactory } from "../src/native-profile/guards/dcg/index.js";
import { Harness, createRegistry } from "@earendil-works/pi-durable";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
import { createModels } from "@earendil-works/pi-ai/models";
import { fauxProvider, fauxAssistantMessage, fauxText, fauxToolCall } from "@earendil-works/pi-ai/providers/faux";
import { createMcpCodemodeExtension } from "../src/native-profile/guards/mcp-codemode.js";
import { until } from "./helpers.js";

class RecordingNode extends NodeExecutionEnv {
  calls: Array<string | readonly string[]> = [];
  override async exec(command: string | readonly string[], _options: ShellExecOptions | undefined, _context: Context): ReturnType<NodeExecutionEnv["exec"]> {
    this.calls.push(command);
    return ok({ exitCode: 0 });
  }
}

test("ISC-12: copied DCG final-exec guard denies missing, malformed and denied checks before executor", async () => {
  const root = await mkdtemp(join(tmpdir(), "dpi-native-guard-"));
  const binary = join(root, "fake-dcg");
  await writeFile(binary, `#!${process.execPath}\nlet input = ''; process.stdin.setEncoding('utf8'); process.stdin.on('data', x => input += x); process.stdin.on('end', () => { const command = input.slice(0, -2); if (process.env.FIXTURE_DECISION === 'malformed') { process.stdout.write('not-json'); return; } const deny = process.env.FIXTURE_DECISION === 'deny'; process.stdout.write(JSON.stringify({schema_version:1,robot_mode:true,dcg_version:'0.15.3',command,decision:deny?'deny':'allow',mode:deny?'deny':null,reason:'fixture policy denial'})); process.exitCode=deny?1:0; });\n`);
  await chmod(binary, 0o700);
  try {
    for (const mode of ["missing", "malformed", "deny", "allow"] as const) {
      const inner = new RecordingNode({ cwd: root });
      const factory = createDcgEnvironmentFactory({
        defaultCwd: root,
        evaluatorOptions: { binaryPath: mode === "missing" ? join(root, "missing-dcg") : binary, timeoutMs: 1000, envSource: () => ({ FIXTURE_DECISION: mode }) },
        testOnlyCreateNodeEnv: () => inner,
      });
      try {
        const environment = factory.env({ cwd: root }, ctx);
        assert.equal(typeof environment.watch, "function", "SDK1.4 filesystem watch remains available");
        const command = ["fixture-only-inert-executor", "untrusted ' quote\nargument"];
        const result = await environment.exec(command, undefined, ctx);
        assert.equal(result.ok, mode === "allow", mode);
        assert.equal(inner.calls.length, mode === "allow" ? 1 : 0, mode);
        if (!result.ok) assert.match(result.error.message, mode === "deny" ? /DCG_DENIED/ : /DCG_UNAVAILABLE/);
        if (mode === "allow") assert.deepEqual(inner.calls[0], command, "policy quoting must not change native argv execution transport");
        assert.equal((await environment.writeFile("filesystem-sentinel", "usable", ctx)).ok, true, "denied exec must not quarantine filesystem");
      } finally {
        await factory.cleanup(ctx);
        await factory.cleanup(ctx);
      }
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("ISC-13: actual native CodeMode rechecks authorization for every nested MCP call", async () => {
  const root = await mkdtemp(join(tmpdir(), "dpi-native-mcp-"));
  const models = createModels();
  const provider = fauxProvider({ provider: "faux-guard", models: [{ id: "recording", contextWindow: 32000, maxTokens: 2048 }], tokensPerSecond: 100000 });
  const code = 'text(await tools.mcp__recording__read({})); try { await tools.mcp__recording__read({}); text("BAD_SECOND_CALL"); } catch (error) { text("NESTED_DENIED:" + error.message); }';
  provider.setResponses([
    fauxAssistantMessage(fauxToolCall("codemode", { code }), { stopReason: "toolUse" }),
    fauxAssistantMessage(fauxText("complete")),
  ]);
  models.setProvider(provider.provider);
  let authorized = 0;
  let called = 0;
  let revoked = false;
  const endpoint = createServer((_request, response) => {
    called++;
    revoked = true;
    response.end("FIRST_ALLOWED");
  }).listen(0, "127.0.0.1");
  await once(endpoint, "listening");
  const address = endpoint.address();
  assert.ok(address && typeof address === "object");
  const extension = await createMcpCodemodeExtension({
    server: "recording",
    allowedTools: ["read"], directTools: [], timeoutMs: 5000,
    client: {
      listTools: async () => [{ name: "read", inputSchema: { type: "object", properties: {} } }],
      callTool: async () => {
        const response = await fetch(`http://127.0.0.1:${address.port}/recording-tool`);
        assert.equal(await response.text(), "FIRST_ALLOWED");
        return { content: [{ type: "text", text: "FIRST_ALLOWED" }], structuredContent: { value: "FIRST_ALLOWED" } };
      },
    },
    authorize: () => {
      authorized++;
      if (revoked) throw Error("current grant revoked");
    },
  });
  const registry = createRegistry();
  registry.install(extension);
  const harness = await Harness.open(await openNodeSqliteStorage(join(root, "native.sqlite")), { models, registry, env: () => new NodeExecutionEnv({ cwd: root }) }, ctx);
  try {
    const conversation = await harness.root(ctx, { agent: { model: { provider: "faux-guard", modelId: "recording" }, cwd: root } });
    harness.resume();
    const submission = await conversation.submit({ type: "input", content: "run recording nested calls", requestId: "nested-authorization" }, ctx);
    await until(async () => (await submission.status(ctx)).status === "done", 10000, "native CodeMode submission");
    assert.equal(authorized, 2, "nested calls must independently reach current authorization");
    assert.equal(called, 1, "revoked nested call must never reach MCP client");
    const entries = await conversation.entries({}, 100, undefined, ctx);
    const text = JSON.stringify(entries.items);
    assert.match(text, /NESTED_DENIED/);
    assert.ok(!text.includes('"text":"BAD_SECOND_CALL"'));
    assert.ok(extension.tools?.filter((tool) => tool.name.startsWith("mcp__")).every((tool) => tool.replay === "unsafe"));
  } finally {
    await harness.close(ctx);
    endpoint.closeAllConnections();
    await new Promise<void>((resolve) => endpoint.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});
