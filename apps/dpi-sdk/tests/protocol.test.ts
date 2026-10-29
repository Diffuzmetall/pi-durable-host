import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { DpiClient } from "../src/client.js";
import { DpiError } from "../src/errors.js";

async function recordingHost(initial: unknown) {
  let metadata = initial;
  const requests: string[] = [];
  const server = createServer((request, response) => {
    requests.push(`${request.method} ${request.url}`);
    response.setHeader("content-type", "application/json");
    if (request.url === "/v1/protocol" && metadata === undefined) {
      response.statusCode = 404;
      response.end(JSON.stringify({ error: { code: "not_found", message: "No route" } }));
    } else response.end(JSON.stringify(request.url === "/v1/protocol" ? metadata : { id: "result" }));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return {
    base: `http://127.0.0.1:${address.port}`,
    requests,
    set: (value: unknown) => { metadata = value; },
    close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

test("ISC-37: incompatible protocol blocks mutation before HTTP admission", async (t) => {
  const host = await recordingHost({ apiVersion: 2, capabilities: ["admission.v1"] });
  t.after(host.close);
  const client = new DpiClient(host.base, "fixture-token", { requiredCapabilities: ["admission.v1"] });
  await assert.rejects(() => client.createSession({ name: "No side effect", cwd: "/fixture", model: { provider: "faux", modelId: "echo" } }), (error: unknown) =>
    error instanceof DpiError && error.code === "unavailable" && /Unsupported host protocol 2/.test(error.message));
  assert.deepEqual(host.requests, ["GET /v1/protocol"]);
});

test("ISC-37: missing capability and malformed legacy metadata block all mutation verbs", async (t) => {
  const host = await recordingHost({ apiVersion: 1, capabilities: ["events"] });
  t.after(host.close);
  const client = new DpiClient(host.base, undefined, { requiredCapabilities: ["admission.v1"] });
  await assert.rejects(() => client.request("POST", "/v1/anything", {}), /missing required capabilities: admission.v1/);
  for (const value of [{}, { apiVersion: "1", capabilities: [] }, { apiVersion: 1, capabilities: [42] }]) {
    host.set(value);
    await assert.rejects(() => client.request("patch", "/v1/anything", {}), /invalid protocol discovery/);
    await assert.rejects(() => client.request("DELETE", "/v1/anything"), /invalid protocol discovery/);
  }
  assert.ok(host.requests.every((request) => request === "GET /v1/protocol"));
});

test("ISC-37: compatible host permits mutation; next mutation rechecks after reconnect/version change", async (t) => {
  const host = await recordingHost({ apiVersion: 1, capabilities: ["admission.v1", "future-render-kind"] });
  t.after(host.close);
  const client = new DpiClient(host.base, undefined, { requiredCapabilities: ["admission.v1"] });
  assert.deepEqual(await client.request("POST", "/v1/anything", {}), { id: "result" });
  host.set({ apiVersion: 0, capabilities: [] });
  await assert.rejects(() => client.request("DELETE", "/v1/anything"), /Unsupported host protocol 0/);
  assert.deepEqual(host.requests, ["GET /v1/protocol", "POST /v1/anything", "GET /v1/protocol"]);
});

test("ISC-37: legacy server without discovery gives a clear unsupported error, with no mutation", async (t) => {
  const host = await recordingHost(undefined);
  t.after(host.close);
  await assert.rejects(() => new DpiClient(host.base).request("POST", "/v1/anything", {}), /does not support protocol discovery; mutation was not sent/);
  assert.deepEqual(host.requests, ["GET /v1/protocol"]);
});

test('BB input provenance requires its distinct capability before any parent mutation', async (t) => {
  const host = await recordingHost({ apiVersion: 1, capabilities: ['native-parent-control.v1', 'native-bb-outcome.v1'] });
  t.after(host.close);
  const parent = new DpiClient(host.base).agent('fixture-session', 'main');
  const command = { action: 'send' as const, controlId: 'bb-child:creq_23456789ab', expectedRevision: 'a'.repeat(64),
    target: { key: 'native-child', conversationId: 2, executionId: 'native-execution', requestId: 'native-request' }, task: 'Exact Core intent' };
  await assert.rejects(parent.parentCommand(command), /missing required capabilities: native-bb-input.v1/);
  assert.deepEqual(host.requests, ['GET /v1/protocol']);
  host.set({ apiVersion: 1, capabilities: ['native-parent-control.v1', 'native-bb-input.v1'] });
  await parent.parentCommand(command);
  assert.deepEqual(host.requests, ['GET /v1/protocol', 'GET /v1/protocol', 'POST /v1/sessions/fixture-session/agents/main/parent-control/commands']);
});

test('iii v2 journal/control/result APIs require exact host capability before any scoped request', async (t) => {
  const host = await recordingHost({ apiVersion: 1, capabilities: ['native-parent-control.v1'] });
  t.after(host.close);
  const agent = new DpiClient(host.base).agent('fixture-session', 'main');
  for (const call of [
    () => agent.iiiInfo(), () => agent.iiiSubmit({ requestId: 'one', content: 'no effect' }),
    () => agent.iiiRequest('one'), () => agent.iiiResult({ requestId: 'one', answerRef: 'durable:2:3' }),
    () => agent.iiiControl('controls::inspect', {}), () => agent.iiiControlReceipt('control'),
    () => agent.iiiJobStop({ jobId: 'one', controlId: 'stop', expectedGeneration: 0 }), () => agent.iiiJobStopReceipt('stop'),
  ]) await assert.rejects(call(), /missing required capabilities: native-iii.v2/);
  assert.ok(host.requests.every(request => request === 'GET /v1/protocol'));
  host.set({ apiVersion: 1, capabilities: ['native-iii.v2'] });
  await agent.iiiSubmit({ requestId: 'one', content: 'canonical input' });
  assert.equal(host.requests.at(-1), 'POST /v1/sessions/fixture-session/agents/main/iii/requests');
});

test("read-only calls stay usable without negotiation; mutation needs protocol even without extra capabilities", async (t) => {
  const host = await recordingHost({ apiVersion: 1, capabilities: [] });
  t.after(host.close);
  const client = new DpiClient(host.base);
  await client.device();
  await client.request("POST", "/v1/anything", {});
  assert.deepEqual(host.requests, ["GET /v1/device", "GET /v1/protocol", "POST /v1/anything"]);
});
