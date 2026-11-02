import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer, request as proxyRequest, type ServerResponse } from "node:http";
import { join } from "node:path";
import test from "node:test";
import { DpiClient, type RequestOptions } from "dpi-sdk/client";
import { DpiError } from "dpi-sdk/errors";
import { bootServer, faux, newToken, tempStore, until } from "../../dpi-backend/tests/helpers.js";
import { RemoteTerminal } from "../src/remote-controller.js";
import { SubmitDeliveryError } from "../src/types.js";

class RecordingClient extends DpiClient {
  readonly calls: { method: string; path: string; body: unknown }[] = [];
  loseNextMessageAck = false;
  dropNextMessage = false;
  droppedMessage?: { path: string; body: unknown };
  override async request<T>(method: string, path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    this.calls.push({ method, path, body });
    if (method === "POST" && path.endsWith("/messages") && this.dropNextMessage) {
      this.dropNextMessage = false;
      this.droppedMessage = { path, body };
      throw new DpiError("offline", "Injected disconnect before Host accepts the message");
    }
    const result = await super.request<T>(method, path, body, options);
    if (method === "POST" && path.endsWith("/messages") && this.loseNextMessageAck) {
      this.loseNextMessageAck = false;
      throw Error("Injected lost ACK after native acceptance");
    }
    return result;
  }
}

test("remote controller survives lost ACK, SSE reconnect and Host restart without replay, and detaches without cancelling execution", async () => {
  const t = await tempStore();
  const token = newToken();
  const backend = await bootServer({ home: join(t.root, "host"), startDirs: t.work, token });
  const streams = new Set<ServerResponse>();
  const proxy = createServer((req, res) => {
    const upstream = proxyRequest(new URL(req.url ?? "/", backend.base), { method: req.method, headers: req.headers }, (reply) => {
      res.writeHead(reply.statusCode ?? 502, reply.headers);
      if (new URL(req.url ?? "/", backend.base).pathname.endsWith("/events")) streams.add(res);
      reply.on("error", () => res.destroy());
      reply.pipe(res);
    });
    upstream.on("error", () => { if (!res.headersSent) res.writeHead(502); res.end(); });
    res.on("close", () => { streams.delete(res); upstream.destroy(); });
    req.pipe(upstream);
  });
  proxy.listen(0, "127.0.0.1");
  await once(proxy, "listening");
  const address = proxy.address();
  assert.ok(address && typeof address === "object");
  const client = new RecordingClient(`http://127.0.0.1:${address.port}`, token);
  let terminal: RemoteTerminal | undefined;
  let reopened: RemoteTerminal | undefined;
  try {
    const session = await client.createSession({ name: "remote-test", cwd: t.work, model: faux }, "remote-controller-session");
    terminal = await RemoteTerminal.open(client, session.id, join(t.root, "client"));
    await until(async () => terminal!.current().connection === "online", 10000, "remote snapshot");
    const postsBeforeControl = client.calls.filter((call) => call.method === "POST").length;
    await assert.rejects(() => terminal!.submit("/goal approve saved-goal human-criterion", "steer"), /No model input/);
    await assert.rejects(() => terminal!.submit("/mcp", "steer"), /No model input/);
    assert.equal(client.calls.filter((call) => call.method === "POST").length, postsBeforeControl);
    client.loseNextMessageAck = true;
    await assert.rejects(() => terminal!.submit("first remote input", "steer"), SubmitDeliveryError);
    await terminal.submit("first remote input", "steer");
    const sent = client.calls.filter((call) => call.method === "POST" && call.path.endsWith("/messages"));
    assert.equal(sent.length, 1, "the receipt settles lost ACK before the explicit retry, without another POST");
    await until(async () => terminal!.current().conversation.entries.some((entry) => entry.kind === "pi.assistant"), 10000, "first answer");
    assert.ok(terminal.current().conversation.entries.some((entry) => entry.kind === "pi.user"));
    let sawReconnect = false;
    const off = terminal.subscribe(() => { if (terminal!.current().connection === "reconnecting") sawReconnect = true; });
    for (const stream of streams) stream.destroy();
    await until(async () => sawReconnect && terminal!.current().connection === "online", 10000, "reconnect snapshot");
    off();
    const postsBeforeRestart = client.calls.filter(call => call.method === "POST" && call.path.endsWith("/messages")).length;
    const idsBeforeRestart = terminal.current().conversation.entries.map(entry => entry.id);
    await backend.stop();
    await until(async () => terminal!.current().connection === "reconnecting", 10000, "Host shutdown noticed");
    await assert.rejects(() => terminal!.submit("typed while Host is down", "steer"));
    await backend.start();
    await until(async () => terminal!.current().connection === "online", 10000, "same session reconnects after Host restart");
    assert.equal(terminal.current().session.id, session.id);
    assert.deepEqual(terminal.current().conversation.entries.map(entry => entry.id), idsBeforeRestart);
    assert.equal(client.calls.filter(call => call.method === "POST" && call.path.endsWith("/messages")).length, postsBeforeRestart + 1, "only the explicit offline attempt, no replay on reconnect");
    await terminal.submit("conversation continues after Host returns", "steer");
    await until(async () => JSON.stringify(terminal!.current().conversation.entries).includes("conversation continues after Host returns"), 10000, "new text after an offline attempt");
    assert.ok(!JSON.stringify(terminal.current().conversation.entries).includes("typed while Host is down"));
    client.dropNextMessage = true;
    await assert.rejects(() => terminal!.submit("input lost during restart", "steer"), SubmitDeliveryError);
    await until(async () => terminal!.current().delivery?.uncertainRequestIds.length === 0, 10000, "POST failure reconciles even while streams stay online");
    await terminal.submit("new message after restart", "steer");
    await until(async () => JSON.stringify(terminal!.current().conversation.entries).includes("new message after restart"), 10000, "new input after uncertain delivery");
    assert.ok(!JSON.stringify(terminal.current().conversation.entries).includes("input lost during restart"), "uncertain old input must never be replayed");
    await assert.rejects(() => client.request("POST", client.droppedMessage!.path, client.droppedMessage!.body), (error: unknown) => error instanceof DpiError && error.status === 409, "a delayed original request must remain retired");
    const entries = await client.agent(session.id, "main").entries({ scope: "active" });
    assert.deepEqual(terminal.current().conversation.entries.map((entry) => entry.id), entries.items.map((entry) => entry.id));
    await terminal.submit("!sleep 0.4; printf terminal-detach-sentinel", "followUp");
    await terminal.close();
    const independent = new DpiClient(backend.base, token);
    await until(async () => {
      const history = await independent.agent(session.id, "main").entries({ scope: "active" });
      return JSON.stringify(history.items).includes("Tool finished: terminal-detach-sentinel");
    }, 15000, "work after terminal detach");
    assert.ok(!client.calls.some((call) => call.method === "DELETE" || /\/abort$/.test(call.path)));
    reopened = await RemoteTerminal.open(client, session.id, join(t.root, "client"));
    await until(async () => reopened!.current().connection === "online", 10000, "reopen snapshot");
    assert.match(JSON.stringify(reopened.current().conversation.entries), /terminal-detach-sentinel/);
    const child = await client.session(session.id).createAgent({ name: "child" }, "remote-child");
    await reopened.switchConversation(child.id);
    assert.equal(reopened.current().conversation.conversation.id, child.id);
    await reopened.abort();
    assert.ok(client.calls.some((call) => call.path.endsWith(`/agents/${child.id}/abort`)));
    assert.ok(!client.calls.some((call) => /\/tasks\/\d+\/abort/.test(call.path)));
  } finally {
    await terminal?.close();
    await reopened?.close();
    for (const stream of streams) stream.destroy();
    proxy.closeAllConnections();
    await new Promise<void>((resolve) => proxy.close(() => resolve()));
    await backend.stop();
    await t.cleanup();
  }
});
