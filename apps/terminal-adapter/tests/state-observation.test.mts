// HTTP recorder conformance only. Native admission and atomic revoke are backend/DM-A checks.
import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DpiClient } from "dpi-sdk";
import { API_VERSION, API_VERSION_HEADER, AGENT_STATE_CAPABILITY, type AgentSummary, type Frame } from "dpi-sdk/api";
import { full, publicState, scope, user } from "../../dpi-sdk/tests/agent-state-sequence.js";
import { RemoteTerminal } from "../src/remote-controller.js";
import { SubmissionJournal } from "../src/submission-journal.js";
import { SubmitDeliveryError } from "../src/types.js";

async function until(check: () => boolean, description: string) {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    if (check()) return;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  assert.fail(description);
}

test("selected terminal clears protected views and stops BOTH observers on end or HTTP revoke, preserving the journal boundary", { timeout: 10000 }, async () => {
  for (const mode of ["end", "http"] as const) {
    const root = await mkdtemp(join(tmpdir(), "dpi-state-recorder-"));
    const responses = new Set<ServerResponse>();
    let agentResponse: ServerResponse | undefined;
    let revoked = false, agentOpens = 0, mutations = 0;
    const agent: AgentSummary = { id: 1, name: "main", named: false, kind: "root", busy: false, background: 0 };
    const frame = (response: ServerResponse, value: Frame) => response.write(`data: ${JSON.stringify(value)}\n\n`);
    const server = createServer((request, response) => {
      assert.equal(request.headers[API_VERSION_HEADER], String(API_VERSION));
      const path = new URL(request.url!, "http://fixture").pathname;
      const json = (value: unknown) => { response.setHeader("content-type", "application/json"); response.end(JSON.stringify(value)); };
      if (request.method !== "GET") { mutations++; response.statusCode = 500; return json({}); }
      if (path === "/v1/protocol") return json({ apiVersion: API_VERSION, capabilities: [AGENT_STATE_CAPABILITY] });
      if (path === "/v1/device") return json({ uid: "fixture", name: "fixture", models: [], capabilities: [AGENT_STATE_CAPABILITY] });
      if (path === "/v1/sessions/fixture") return json({ id: "fixture", name: "fixture", cwd: "/fixture", agents: [agent] });
      if (path.endsWith("/entries")) return json({ items: [] });
      if (path === "/v1/sessions/fixture/agents/1") return json({ ...agent, config: {}, documentKinds: ["host.agent-mail"] });
      if (path.endsWith("/events")) {
        const isAgent = path.includes("/agents/");
        if (isAgent) agentOpens++;
        if (isAgent && revoked) { response.statusCode = 403; return json({ error: { code: "unauthorized", message: "Revoked" } }); }
        response.writeHead(200, { "content-type": "text/event-stream" });
        responses.add(response); response.on("close", () => responses.delete(response));
        frame(response, { type: "hello", apiVersion: API_VERSION, serverTime: 1,
          scope: isAgent ? { kind: "agent", sessionId: "fixture", agentId: 1 } : { kind: "session", sessionId: "fixture" } });
        if (isAgent) {
          agentResponse = response;
          frame(response, full("a:0", publicState([user(1, "protected history")])));
          frame(response, { type: "doc", kind: "host.agent-mail", value: { name: "fixture-only", project: "fixture-only" } });
        } else frame(response, { type: "session", agents: [agent], tasks: [], usage: { models: {}, tools: {} } });
        return;
      }
      response.statusCode = 404; json({ error: { code: "not_found", message: "Fixture route absent" } });
    }).listen(0, "127.0.0.1");
    let terminal: RemoteTerminal | undefined;
    try {
      await once(server, "listening"); const address = server.address(); assert(address && typeof address === "object");
      terminal = await RemoteTerminal.open(new DpiClient(`http://127.0.0.1:${address.port}`, "fixture-only"), "fixture", root);
      await until(() => terminal!.current().connection === "online" && !!terminal!.current().agentMail, "selected state and Mail arrive");
      assert.equal(terminal.current().conversation.entries.length, 1);
      revoked = true;
      if (mode === "end") {
        frame(agentResponse!, { type: "agent.end", ...scope, reason: "revoked" });
        frame(agentResponse!, full("late:0", publicState([user(2, "late protected history")])));
      } else agentResponse!.destroy();
      await until(() => terminal!.current().connection === "offline" && terminal!.current().conversation.entries.length === 0 && responses.size === 0, "revoke clears and closes both observers");
      assert.equal(terminal.current().agentMail, undefined);
      assert.equal(terminal.current().attention, undefined);
      assert.deepEqual(terminal.current().conversations, []);
      assert.deepEqual(terminal.current().delivery?.uncertainRequestIds, []);
      await assert.rejects(terminal.submit("must not be sent", "steer"), /no input was submitted/);
      await new Promise(resolve => setTimeout(resolve, 300));
      assert.equal(agentOpens, mode === "end" ? 1 : 2);
      assert.equal(mutations, 0);
    } finally {
      await terminal?.close(); server.closeAllConnections();
      await new Promise<void>(resolve => server.close(() => resolve()));
      await rm(root, { recursive: true, force: true });
    }
  }
});

for (const receiptMode of ["accepted", "absent", "malformed"] as const) {
  test(`HTTP lost-ACK recorder retains request identity and never replays: ${receiptMode}`, { timeout: 6000 }, async () => {
    const root = await mkdtemp(join(tmpdir(), "dpi-receipt-recorder-"));
    const directory = join(root, "journal");
    const requests: { text: string; requestId: string }[] = [];
    let lookups = 0, fences = 0;
    const agent: AgentSummary = { id: 1, name: "main", named: false, kind: "root", busy: false, background: 0 };
    const server = createServer(async (request, response) => {
      const path = new URL(request.url!, "http://fixture").pathname;
      const json = (value: unknown) => { response.setHeader("content-type", "application/json"); response.end(JSON.stringify(value)); };
      if (request.method === "POST" && path.endsWith("/messages")) {
        let body = ""; for await (const chunk of request) body += chunk;
        requests.push(JSON.parse(body));
        // The fixture deliberately loses the HTTP ACK. It does not simulate native execution.
        response.destroy(); return;
      }
      if (request.method === "POST" && path.endsWith("/reconcile")) {
        fences++;
        const requestId = decodeURIComponent(path.split("/").at(-2)!);
        assert.equal(requestId, requests[0].requestId);
        return json({ accepted: false, conversationId: 1, requestId });
      }
      if (path.includes("/receipts/")) {
        lookups++;
        assert.equal(decodeURIComponent(path.split("/").at(-1)!), requests[0].requestId);
        if (receiptMode === "malformed") return json({});
        if (receiptMode === "absent") { response.statusCode = 404; return json({ error: { code: "not_found", message: "No receipt" } }); }
        // Saved done receipts need no answer; only send/submission results require that answer.
        return json({ submissionId: 1, status: "done" });
      }
      if (path === "/v1/protocol") return json({ apiVersion: API_VERSION, capabilities: [AGENT_STATE_CAPABILITY] });
      if (path === "/v1/device") return json({ uid: "fixture", name: "fixture", models: [], capabilities: [AGENT_STATE_CAPABILITY] });
      if (path === "/v1/sessions/fixture") return json({ id: "fixture", name: "fixture", cwd: "/fixture", agents: [agent] });
      if (path.endsWith("/entries")) return json({ items: [] });
      if (path === "/v1/sessions/fixture/agents/1") return json({ ...agent, config: {} });
      if (path.endsWith("/events")) {
        const isAgent = path.includes("/agents/");
        response.writeHead(200, { "content-type": "text/event-stream" });
        for (const value of [{ type: "hello", apiVersion: API_VERSION, serverTime: 1,
          scope: isAgent ? { kind: "agent", sessionId: "fixture", agentId: 1 } : { kind: "session", sessionId: "fixture" } },
          isAgent ? full("a:0", publicState()) : { type: "session", agents: [agent], tasks: [], usage: { models: {}, tools: {} } }])
          response.write(`data: ${JSON.stringify(value)}\n\n`);
        return;
      }
      response.statusCode = 404; json({ error: { code: "not_found", message: "Fixture route absent" } });
    }).listen(0, "127.0.0.1");
    let terminal: RemoteTerminal | undefined;
    try {
      await once(server, "listening"); const address = server.address(); assert(address && typeof address === "object");
      const client = new DpiClient(`http://127.0.0.1:${address.port}`, "fixture-only");
      terminal = await RemoteTerminal.open(client, "fixture", directory);
      await until(() => terminal!.current().connection === "online", "observers ready");
      await assert.rejects(terminal.submit("preserved input", "steer"), SubmitDeliveryError);
      await until(() => receiptMode === "malformed"
        ? terminal!.current().notices.some(notice => notice.message.includes("uncertain delivery"))
        : lookups > 0 && terminal!.current().delivery?.uncertainRequestIds.length === 0, "receipt reconciliation settles or explicitly remains uncertain");
      assert.equal(requests.length, 1);
      assert.equal(fences, receiptMode === "absent" ? 1 : 0);
      const journal = await SubmissionJournal.open(directory);
      assert.equal(journal.pending.size, receiptMode === "malformed" ? 1 : 0);
      if (receiptMode === "malformed") {
        assert.equal(journal.uncertain[0].requestId, requests[0].requestId);
        assert.equal(journal.uncertain[0].text, "preserved input");
      }
      await terminal.close();
      terminal = await RemoteTerminal.open(client, "fixture", directory);
      await until(() => terminal!.current().connection === "online", "reopen observes safely");
      if (receiptMode === "malformed") await until(() => lookups === 2, "reopen only looks up the original receipt");
      assert.equal(requests.length, 1, "neither reconciliation nor reopen posts the input again");
      assert.equal(terminal.current().delivery?.uncertainRequestIds.length, receiptMode === "malformed" ? 1 : 0);
    } finally {
      await terminal?.close(); server.closeAllConnections();
      await new Promise<void>(resolve => server.close(() => resolve()));
      await rm(root, { recursive: true, force: true });
    }
  });
}
