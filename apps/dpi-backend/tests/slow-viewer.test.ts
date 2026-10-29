import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer, get, type IncomingMessage } from "node:http";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import express, { type Response } from "express";
import { bearerAuth } from "../src/auth.js";
import { v1 } from "../src/routes.js";
import { errorMiddleware } from "../src/errors.js";
import { DpiClient } from "../../dpi-sdk/src/client.js";
import { AgentModel } from "../../dpi-sdk/src/models.js";
import { faux, tempStore, until } from "./helpers.js";

test("ISC-27: real paused TCP viewer ends while another client receives native completion", { timeout: 35000 }, async (t) => {
  const temporary = await tempStore();
  const originalHome = process.env.HOME;
  process.env.HOME = join(temporary.root, "isolated-home");
  await mkdir(process.env.HOME);
  const store = await temporary.open();
  const token = "slow-viewer-faux-token";
  const marker = "FAST_VIEWER_NATIVE_COMPLETION";
  let slowResponse: Response | undefined;
  const app = express();
  app.use("/v1", bearerAuth(token), express.json(), (request, response, next) => {
    if (request.get("x-test-viewer") === "slow") slowResponse = response;
    next();
  }, v1(store));
  app.use(errorMiddleware);
  const server = createServer(app).listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}`;
  const client = new DpiClient(base, token);
  let slow: IncomingMessage | undefined;
  let fastCounter = -1;
  let fastError: unknown;
  const stop = new AbortController();
  const finishStop = new AbortController();
  let agentReading: Promise<void> | undefined;
  const signal = AbortSignal.any([stop.signal, t.signal]);
  const fastReading = (async () => {
    for await (const frame of client.deviceEvents(signal, ["app.shared-state"])) {
      if (frame.type === "doc" && frame.kind === "app.shared-state") {
        const value = frame.value;
        if (value && typeof value === "object" && "counter" in value && typeof value.counter === "number") fastCounter = value.counter;
      }
    }
  })().catch((error) => { fastError = error; });
  let request: ReturnType<typeof get> | undefined;
  try {
    const session = await client.createSession({ name: "slow viewer", cwd: temporary.work, model: faux });
    slow = await new Promise<IncomingMessage>((resolve, reject) => {
      request = get(`${base}/v1/events?docs=app.shared-state`, { headers: { authorization: `Bearer ${token}`, "x-test-viewer": "slow" } }, (response) => {
        response.pause();
        resolve(response);
      });
      request.on("error", reject);
    });
    assert.equal(slow.statusCode, 200);
    await until(async () => { if (fastError) throw fastError; return fastCounter === 0; }, 5000, "fast viewer initial native snapshot");
    await store.shared.change({ operation: "create", path: "/pressure", value: "x".repeat(90000) });
    let updates = 0;
    let peakQueuedBytes = 0;
    for (; updates < 120 && !slowResponse?.writableEnded; updates++) {
      t.signal.throwIfAborted();
      await store.shared.change({ operation: "increment", path: "/counter", value: 1 });
      const expected = updates + 1;
      await until(async () => { if (fastError) throw fastError; return fastCounter >= expected; }, 2000, "fast viewer receives pressure commit");
      peakQueuedBytes = Math.max(peakQueuedBytes, slowResponse?.writableLength ?? 0);
    }
    assert.equal(slowResponse?.writableEnded, true, "server must end the actual paused connection at its existing buffer bound");
    // Device activity is coalesced status, not a durable result journal. Observe the actual conversation for completion.
    stop.abort();
    await fastReading;
    const model = new AgentModel();
    agentReading = (async () => {
      for await (const frame of client.agent(session.id, "main").events(AbortSignal.any([finishStop.signal, t.signal]))) model.apply(frame);
    })().catch((error) => { fastError = error; });
    await until(async () => { if (fastError) throw fastError; return model.state.ready; }, 5000, "fast viewer conversation snapshot");
    const { h, c } = await store.resolveAgent(session.id, "main");
    const submitted = await store.send(c, { content: `!printf ${marker}`, requestId: "fast-native-completion" });
    const result = await store.settled(h, Number(submitted.id), 5000);
    assert.equal(result.status, "done");
    if (result.status === "done") assert.match(result.answer.text, /FAST_VIEWER_NATIVE_COMPLETION/);
    await until(async () => {
      if (fastError) throw fastError;
      return !model.state.running && model.state.items.some((item) => item.kind === "assistant" && item.blocks.some((block) => block.type === "text" && block.text.includes(marker)));
    }, 5000, "independent fast viewer receives native finish after slow closes");
    assert.equal(store.opened.has(session.id), true, "viewer backpressure must not close native owner");
    t.diagnostic(JSON.stringify({ updates, peakQueuedBytes, nativeSubmissionId: submitted.id, nativeResult: result.status }));
  } finally {
    stop.abort();
    finishStop.abort();
    slow?.destroy();
    request?.destroy();
    await fastReading;
    await agentReading;
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await store.close();
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
    await temporary.cleanup();
  }
});
