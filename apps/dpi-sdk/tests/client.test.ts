import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import test, { type TestContext } from "node:test";
import { DpiClient, follow } from "../src/client.js";
import { API_VERSION, API_VERSION_HEADER, AGENT_STATE_CAPABILITY, type Frame } from "../src/api.js";
import { DpiError } from "../src/errors.js";
import { AgentModel } from "../src/models.js";
import { parseAgentObservationFrame, parseMessageReceipt, parseMessageReconciliation, parseSendResult } from "../src/observation-wire.js";
import { full, publicState, scope, sequence, user } from "./agent-state-sequence.js";

const hello: Frame = { type: "hello", apiVersion: API_VERSION, serverTime: 1, scope: { kind: "agent", sessionId: scope.sessionId, agentId: scope.conversationId } };
const json = (response: ServerResponse, value: unknown) => { response.setHeader("content-type", "application/json"); response.end(JSON.stringify(value)); };
const sse = (response: ServerResponse, frames: readonly unknown[]) => {
  response.writeHead(200, { "content-type": "text/event-stream" });
  response.end(frames.map(frame => `data: ${JSON.stringify(frame)}\n\n`).join(""));
};
async function fixture(t: TestContext, handler: (request: IncomingMessage, response: ServerResponse) => void,
  protocol = { apiVersion: API_VERSION as number, capabilities: [AGENT_STATE_CAPABILITY] as string[] }) {
  const requests: { method: string; path: string; version: string | string[] | undefined }[] = [];
  const server = createServer((request, response) => {
    requests.push({ method: request.method!, path: request.url!, version: request.headers[API_VERSION_HEADER] });
    if (request.url === "/v1/protocol") return json(response, protocol);
    handler(request, response);
  }).listen(0, "127.0.0.1");
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
  await once(server, "listening");
  const address = server.address(); assert(address && typeof address === "object");
  return { client: new DpiClient(`http://127.0.0.1:${address.port}`, "fixture-only"), requests };
}
const collect = async (frames: AsyncIterable<Frame>) => { const result: Frame[] = []; for await (const frame of frames) result.push(frame); return result; };

test("HTTP and SSE carry protocol2; an owned tool/answer sequence is delivered unchanged", async t => {
  const { client, requests } = await fixture(t, (request, response) => {
    if (request.url?.endsWith("/events")) return sse(response, [hello, ...sequence]);
    json(response, { submissionId: 1, status: "queued" });
  });
  const frames = await collect(client.agent("fixture", 1).events(new AbortController().signal));
  assert.deepEqual(frames, [hello, ...sequence]);
  assert.deepEqual(await client.agent("fixture", 1).send("not a real model call", "followUp", "saved-key"), { submissionId: 1, status: "queued" });
  assert(requests.every(request => request.version === String(API_VERSION)));
  assert.equal(requests.filter(request => request.method === "POST").length, 1);
});

test("incompatible version or missing state capability prevents both observe and mutation", async t => {
  for (const protocol of [{ apiVersion: 1, capabilities: [AGENT_STATE_CAPABILITY] }, { apiVersion: API_VERSION, capabilities: [] }]) {
    const { client, requests } = await fixture(t, (_request, response) => { response.statusCode = 500; response.end(); }, protocol);
    await assert.rejects(client.agent("fixture", 1).send("must not be admitted"), error => error instanceof DpiError && error.status === 426);
    await assert.rejects(collect(client.agent("fixture", 1).events(new AbortController().signal)), error => error instanceof DpiError && error.status === 426);
    assert(requests.every(request => request.path === "/v1/protocol"));
  }
});

test("duplicate update is ignored; gap ends observation with resync, without command replay", async t => {
  const gap = { type: "agent.update", ...scope, baseRevision: "missing", revision: "epoch:99", changes: {} };
  const { client, requests } = await fixture(t, (_request, response) => sse(response, [hello, ...sequence.slice(0, 3), sequence[2], gap, sequence[3]]));
  const frames = await collect(client.agent("fixture", 1).events(new AbortController().signal));
  assert.deepEqual(frames, [hello, ...sequence.slice(0, 3), { type: "agent.end", ...scope, reason: "resync" }]);
  assert(requests.every(request => request.method === "GET"));
});

test("wrong scope and malformed or legacy observation never reach a consumer", async t => {
  const malformed = [
    { ...sequence[0], conversationId: 2 },
    { type: "agent.state", ...scope, revision: "bad", state: {} },
    { type: "batch", events: [] },
    { type: "agent.update", ...scope, baseRevision: "epoch:0", revision: "epoch:1", changes: { privateDocument: { delta: "/secret" } } },
  ];
  for (const value of malformed) {
    const { client } = await fixture(t, (_request, response) => sse(response, [hello, value]));
    const iterator = client.agent("fixture", 1).events(new AbortController().signal);
    assert.equal((await iterator.next()).value?.type, "hello");
    await assert.rejects(iterator.next(), DpiError);
  }
});

test("revocation clears once and stops automatic follow; queued late state is never delivered", async t => {
  const end: Frame = { type: "agent.end", ...scope, reason: "revoked" };
  const { client, requests } = await fixture(t, (_request, response) => sse(response, [hello, sequence[0], end, sequence[1]]));
  const frames: Frame[] = [], states: string[] = [];
  await follow(signal => client.agent("fixture", 1).events(signal), frame => frames.push(frame), state => states.push(state), new AbortController().signal);
  assert.deepEqual(frames, [hello, sequence[0], end]);
  assert.equal(states.at(-1), "unauthorized");
  assert.equal(requests.filter(request => request.path.endsWith("/events")).length, 1);
});

test("HTTP revocation on reconnect clears the prior protected model without reconnecting again", async t => {
  let opens = 0;
  const { client } = await fixture(t, (_request, response) => {
    if (++opens === 1) return sse(response, [hello, sequence[0], { type: "doc", kind: "private", value: "fixture" }]);
    response.statusCode = 403;
    json(response, { error: { code: "unauthorized", message: "Permission revoked" } });
  });
  const model = new AgentModel(scope), states: string[] = [];
  await follow(signal => client.agent("fixture", 1).events(signal), frame => { model.apply(frame); }, state => states.push(state), new AbortController().signal);
  assert.equal(opens, 2);
  assert.equal(states.at(-1), "unauthorized");
  assert.deepEqual(model.state.entries, []);
  assert.deepEqual(model.state.docs, {});
  assert.equal(model.state.end, "revoked");
});

test("public JSON guard refuses unbounded history, foreign entries, duplicate IDs and unknown replacement sections", () => {
  assert.deepEqual(parseAgentObservationFrame(sequence[0]), sequence[0]);
  const bad = [
    full("bad", publicState(Array.from({ length: 101 }, (_, n) => user(n + 1, "too long")))),
    full("bad", publicState([{ ...user(1, "foreign"), conversationId: 2 }])),
    full("bad", publicState([user(1, "a"), user(1, "duplicate")])),
    full("bad", publicState([user(2, "b"), user(1, "unordered")])),
    { type: "agent.update", ...scope, baseRevision: "a", revision: "b", changes: { history: undefined } },
    { type: "agent.update", ...scope, baseRevision: "a", revision: "b", changes: { path: ["private"], delta: "secret" } },
  ];
  for (const value of bad) assert.throws(() => parseAgentObservationFrame(value), DpiError);
});

test("all terminal outcomes settle as explicit unanswered; malformed receipts preserve uncertainty", async t => {
  const reasons = ["interrupted", "restart_limit", "turn_limit", "nothing_to_answer", "unavailable"];
  let index = 0;
  const { client } = await fixture(t, (_request, response) => json(response, { submissionId: 3, status: "unanswered", reason: reasons[index++] }));
  for (const reason of reasons) assert.deepEqual(await client.agent("fixture", 1).send("fixture-only"), { submissionId: 3, status: "unanswered", reason });
  for (const value of [{}, { submissionId: 1, status: "unanswered" }, { submissionId: 1, status: "done" }, { submissionId: 1, status: "unknown" }])
    assert.throws(() => parseSendResult(value), DpiError);
  assert.deepEqual(parseMessageReceipt({ submissionId: 1, status: "done" }), { submissionId: 1, status: "done" });
  const absent = { conversationId: 1, requestId: "saved-key", accepted: false };
  assert.deepEqual(parseMessageReconciliation(absent, 1, "saved-key"), absent);
  for (const value of [{ ...absent, requestId: "other" }, { ...absent, conversationId: 2 }, { ...absent, submissionId: 1 }, { ...absent, accepted: true }])
    assert.throws(() => parseMessageReconciliation(value, 1, "saved-key"), DpiError);
});
