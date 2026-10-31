import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import express from "express";
import { bearerAuth } from "../src/auth.js";
import { GrantPolicy } from "../src/grants.js";
import { errorMiddleware } from "../src/errors.js";
import { v1 } from "../src/routes.js";
import { tempStore, faux, until } from "./helpers.js";

async function fixture() {
  const temporary = await tempStore();
  const store = await temporary.open();
  const session = await store.create({ name: "auth-http", cwd: temporary.work, model: faux });
  const basePath = `/sessions/${session.id}/agents/main`;
  const binding = { sessionId: session.id, conversationId: 1 };
  const policy = new GrantPolicy([
    { id: "owner", token: "owner-test-sentinel", actor: "owner", source: "terminal", authority: "human", permissions: ["read", "write", "control", "filesystem", "human-accept"], binding: {} },
    { id: "observer", token: "observer-test-sentinel", actor: "viewer", source: "bb", authority: "observer", permissions: ["read", "write", "control", "filesystem"], binding },
    { id: "editor", token: "editor-test-sentinel", actor: "editor", source: "terminal", authority: "human", permissions: ["read", "write", "control"], binding },
    { id: "worker", token: "worker-test-sentinel", actor: "job-worker", source: "iii", authority: "delegated", permissions: ["read", "write", "control", "human-accept"], binding },
  ]);
  let resolves = 0;
  const resolveSession = store.resolveSession.bind(store);
  store.resolveSession = (ref) => { resolves++; return resolveSession(ref); };
  const app = express();
  app.use("/v1", bearerAuth(policy), express.json(), v1(store));
  app.use(errorMiddleware);
  const server = createServer(app).listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}/v1`;
  const request = (path: string, token = "observer-test-sentinel", method = "GET", body?: unknown) => fetch(base + path, {
    method, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { store, policy, session, basePath, request, resolves: () => resolves,
    async close() {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await store.close();
      await temporary.cleanup();
    },
  };
}

test("conversation observer is denied before route resolution on every mutation and broad read", async () => {
  const f = await fixture();
  try {
    const a = f.basePath;
    const discovery = await f.request("/protocol");
    assert.equal(discovery.status, 200);
    assert.deepEqual(await discovery.json(), { apiVersion: 1, capabilities: ["events", "docs", "runtime-refresh.v1"] });
    const operations: Array<[string, string]> = [
      ["POST", "/sessions"], ["PATCH", `/sessions/${f.session.id}`], ["DELETE", `/sessions/${f.session.id}`],
      ["PATCH", `/sessions/${f.session.id}/compaction`], ["POST", `/sessions/${f.session.id}/agents`],
      ["POST", `/sessions/${f.session.id}/tasks/1/abort`], ["PATCH", a], ["POST", `${a}/messages`],
      ["DELETE", `${a}/inbox/1`], ["POST", `${a}/abort`], ["POST", `${a}/fork`], ["PATCH", `${a}/config`],
      ["PATCH", `${a}/extensions`], ["POST", `${a}/compact`], ["POST", `${a}/reset`],
      ["POST", `${a}/demo/state`], ["POST", `${a}/demo/jobs`], ["POST", `${a}/demo/jobs/1/approval`],
      ...["/device", "/tree", "/events", "/fs/dirs", "/docs/app.shared-state", "/sessions", `/sessions/${f.session.id}`, `/sessions/${f.session.id}/events`, `/sessions/${f.session.id}/tasks`, `/sessions/${f.session.id}/inspect`, `/sessions/${f.session.id}/submissions/1`, `/sessions/${f.session.id}/agents`, `/sessions/not-ours/agents/main/entries`, `/sessions/${f.session.id}/agents/2/entries`].map((path): [string, string] => ["GET", path]),
    ];
    const before = f.resolves();
    for (const [method, path] of operations) {
      const response = await f.request(path, undefined, method, method === "GET" || method === "DELETE" ? undefined : { content: "must not execute", requestId: "denied", source: "terminal", authority: "human" });
      assert.equal(response.status, 403, `${method} ${path}`);
      const text = await response.text();
      assert.ok(!text.includes("test-sentinel"), "credential leaked in error");
    }
    assert.equal(f.resolves(), before, "Denied requests reached session resolution");
    for (const suffix of ["", "/entries", "/transcript", "/config", "/extensions", "/docs/demo.job-runs"]) {
      const response = await f.request(a + suffix);
      assert.equal(response.status, 200, suffix);
      await response.arrayBuffer();
    }
    assert.equal((await f.request(`${a}/entries`, "missing-token")).status, 401);
  } finally { await f.close(); }
});

test("delegated credentials cannot spoof human or reach generic native controls", async () => {
  const f = await fixture();
  try {
    const before = f.resolves();
    for (const suffix of ["/messages", "/abort", "/demo/jobs/1/approval", "/config"]) {
      const response = await f.request(f.basePath + suffix, "worker-test-sentinel", suffix === "/config" ? "PATCH" : "POST", { content: "spoof", requestId: "spoof", actor: "owner", source: "terminal", authority: "human" });
      assert.equal(response.status, 403);
      await response.arrayBuffer();
    }
    assert.equal(f.resolves(), before);
    const read = await f.request(`${f.basePath}/entries`, "worker-test-sentinel");
    assert.equal(read.status, 200);
    await read.arrayBuffer();
  } finally { await f.close(); }
});

test("revoke during asynchronous parameter resolution blocks the later mutation", async () => {
  const f = await fixture();
  let release!: () => void;
  let entered!: () => void;
  const resolved = new Promise<void>((resolve) => { entered = resolve; });
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const original = f.store.resolveAgent.bind(f.store);
  f.store.resolveAgent = async (session, agent) => {
    const value = await original(session, agent);
    entered();
    await gate;
    return value;
  };
  let mutations = 0;
  const reset = f.store.reset.bind(f.store);
  f.store.reset = (conversation, note) => { mutations++; return reset(conversation, note); };
  try {
    const pending = f.request(`${f.basePath}/reset`, "editor-test-sentinel", "POST", {});
    await resolved;
    f.policy.revoke("editor");
    release();
    const response = await pending;
    assert.equal(response.status, 401);
    assert.equal(mutations, 0);
    await response.arrayBuffer();
  } finally { release(); await f.close(); }
});

test("revoke closes a real active agent SSE and excludes events created after revoke", async () => {
  const f = await fixture();
  try {
    const response = await f.request(`${f.basePath}/events`);
    assert.equal(response.status, 200);
    assert.ok(response.body);
    const reader = response.body.getReader();
    let text = "";
    let ended = false;
    const receiving = (async () => {
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) { ended = true; break; }
        text += new TextDecoder().decode(chunk.value);
      }
    })();
    await until(async () => text.includes("event: snapshot"), 5000, "SSE snapshot before revoke");
    assert.equal(f.policy.revoke("observer"), true);
    const { h, c } = await f.store.resolveAgent(f.session.id, "main");
    const sentinel = "CREATED_STRICTLY_AFTER_REVOKE";
    const submission = await f.store.send(c, { content: sentinel, requestId: "post-revoke", whenBusy: "followUp" });
    const result = await f.store.settled(h, Number(submission.id), 5000);
    assert.equal(result.status, "done", "faux sentinel actually committed");
    await until(async () => ended, 5000, "revoked SSE closed");
    await receiving;
    assert.ok(!text.includes(sentinel));
    assert.ok(!text.includes("test-sentinel"), "credential leaked in SSE");
    assert.equal((await f.request(`${f.basePath}/entries`)).status, 401);
    assert.equal((await f.request("/protocol")).status, 401);
    assert.equal((await f.request(`${f.basePath}/messages`, undefined, "POST", { content: "denied", requestId: "revoked" })).status, 401);
    const owner = await f.request(`${f.basePath}/entries`, "owner-test-sentinel");
    assert.equal(owner.status, 200);
    assert.ok((await owner.text()).includes(sentinel), "independent owner sees post-revoke commit");
  } finally { await f.close(); }
});
