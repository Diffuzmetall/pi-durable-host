import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DpiClient } from "dpi-sdk";
import { THINKING_LEVELS, type Frame, type ThinkingLevel, type WireAgentState } from "dpi-sdk/api";
import { RemoteTerminal } from "../src/remote-controller.js";

// Protocol conformance recorder only. Actual native model clamping is tested by the owning backend.
test("thinking cycles exact advertised order including max; missing/future metadata causes no mutation", { timeout: 10000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), "dpi-thinking-wire-"));
  const streams = new Set<ServerResponse>();
  const configured: ThinkingLevel[] = [];
  let advertised: unknown = ["off", "max", "high"];
  let thinking: ThinkingLevel = "off";
  const agent = { id: 1, name: "main", named: false, kind: "root" as const, busy: false, background: 0 };
  const model = { id: "model", provider: "recording", name: "Recorded model", tier: "T", icon: "", contextWindow: 10000, reasoning: true, cost: { input: 0, output: 0 } };
  const config = (): WireAgentState => ({ model: { provider: "recording", modelId: "model" }, thinkingLevel: thinking });
  const frame = (res: ServerResponse, value: Frame) => res.write(`data: ${JSON.stringify(value)}\n\n`);
  const server = createServer(async (req, res) => {
    assert.equal(req.headers.authorization, "Bearer recording-thinking-only");
    const url = new URL(req.url!, "http://fixture");
    const json = (body: unknown) => { res.setHeader("content-type", "application/json"); res.end(JSON.stringify(body)); };
    if (url.pathname === "/v1/protocol") return json({ apiVersion: 1, capabilities: ["events", "docs"] });
    if (url.pathname.endsWith("/events")) {
      res.writeHead(200, { "content-type": "text/event-stream" });
      if (url.pathname.includes("/agents/")) {
        streams.add(res); res.on("close", () => streams.delete(res));
        frame(res, { type: "snapshot", snapshot: { type: "snapshot", agent: config(), entries: [], inbox: [], tools: [], compactions: [], usage: { models: {}, tools: {} } }, inbox: [] });
      } else frame(res, { type: "session", agents: [agent], tasks: [], usage: { models: {}, tools: {} } });
      return;
    }
    if (url.pathname === "/v1/device") return json({ uid: "recording", name: "recording", hostname: "loopback", platform: "linux", apiVersion: 1, durableVersion: "fixture", startedAt: 0, startDirs: [],
      models: [{ ...model, supportedThinkingLevels: advertised }], defaultModel: "model", storage: { dataDir: "", catalogPath: "", appStatePath: "" }, capabilities: ["events", "docs"] });
    if (url.pathname === "/v1/sessions/fixture") return json({ id: "fixture", name: "fixture", cwd: "/fixture", model: "model", createdAt: 0, dbPath: "", busy: false, agents: [agent] });
    if (url.pathname.endsWith("/entries")) return json({ items: [] });
    if (url.pathname.endsWith("/abort")) {
      res.statusCode = 409;
      return json({ error: { code: "conflict", message: "Native Goal protects this execution; use its operator control" } });
    }
    if (url.pathname === "/v1/sessions/fixture/agents/1" || url.pathname === "/v1/sessions/fixture/agents/1/config") {
      if (req.method === "PATCH") {
        let raw = ""; for await (const chunk of req) raw += chunk;
        const body: unknown = JSON.parse(raw);
        assert(body && typeof body === "object" && "thinkingLevel" in body);
        const level = THINKING_LEVELS.find(value => value === body.thinkingLevel); assert(level);
        thinking = level; configured.push(level);
        for (const stream of streams) frame(stream, { type: "batch", events: [{ type: "agent_changed", agent: config() }] });
        return json(config());
      }
      return json({ ...agent, sessionId: "fixture", config: config(), tools: [], extensions: [] });
    }
    res.writeHead(404); res.end();
  }).listen(0, "127.0.0.1");
  let terminal: RemoteTerminal | undefined;
  try {
    await once(server, "listening"); const address = server.address(); assert(address && typeof address === "object");
    const client = new DpiClient(`http://127.0.0.1:${address.port}`, "recording-thinking-only");
    terminal = await RemoteTerminal.open(client, "fixture", root);
    await terminal.cycleThinking();
    for (let n = 0; n < 100 && terminal.current().conversation.docs["pi.agent"]?.thinkingLevel !== "max"; n++) await new Promise(resolve => setTimeout(resolve, 5));
    assert.deepEqual(configured, ["max"]);
    assert.equal(terminal.current().conversation.docs["pi.agent"]?.thinkingLevel, "max");
    await terminal.cycleThinking();
    assert.deepEqual(configured, ["max", "high"]);
    // Alternative protected-profile wire response; not a claim that session-goals protects ordinary root execution.
    await terminal.abort();
    assert(terminal.current().notices.some(notice => notice.message === "Goal continues; use /goal stop to stop its execution."));
    await terminal.close(); terminal = undefined;
    for (const levels of [["off", "future-level"], undefined]) {
      advertised = levels;
      terminal = await RemoteTerminal.open(client, "fixture", root);
      await terminal.cycleThinking();
      assert.deepEqual(configured, ["max", "high"]);
      assert(terminal.current().notices.some(notice => notice.message.includes("no level was inferred or dropped")));
      await terminal.close(); terminal = undefined;
    }
  } finally {
    await terminal?.close(); server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});
