import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import express from "express";
import { bearerAuth } from "../src/auth.js";
import { v1 } from "../src/routes.js";
import { errorMiddleware } from "../src/errors.js";
import type { Store } from "../src/store.js";
import { DpiClient } from "../../dpi-sdk/src/client.js";
import { toTranscript } from "../../dpi-sdk/src/transcript.js";
import { faux, tempStore } from "./helpers.js";

test("ISC-23/24/45: HTTP lost ACK reconciles same native result across 25-hour restart and concurrent retry", async (t) => {
  const temporary = await tempStore();
  const token = "independent-http-credential-sentinel";
  const responses: string[] = [];
  const serve = async (store: Store, loseMessageAck: boolean) => {
    const app = express();
    app.use("/v1", bearerAuth(token), express.json(), (request, response, next) => {
      const json = response.json.bind(response);
      response.json = (value) => {
        responses.push(JSON.stringify(value));
        if (loseMessageAck && request.method === "POST" && request.path.endsWith("/messages")) {
          loseMessageAck = false;
          // The route calls json only after native admission/settlement. Drop the actual transport ACK.
          response.destroy();
          return response;
        }
        return json(value);
      };
      next();
    }, v1(store));
    app.use(errorMiddleware);
    const server = createServer(app).listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address === "object");
    return {
      client: new DpiClient(`http://127.0.0.1:${address.port}`, token),
      close: async () => {
        server.closeAllConnections();
        await new Promise<void>((resolve) => server.close(() => resolve()));
      },
    };
  };
  let store = await temporary.open();
  let server = await serve(store, true);
  try {
    const session = await server.client.createSession({ name: "lost ack", cwd: temporary.work, model: faux }, "independent-create");
    const key = "independent-message";
    const content = "!printf independent-result-sentinel";
    const agent = server.client.agent(session.id, "main");
    await assert.rejects(() => agent.send(content, "followUp", key, 15000), /Cannot reach/);
    const receiptPath = `/v1/sessions/${session.id}/agents/main/receipts/${key}`;
    const accepted = await server.client.request<{ submissionId: number }>("GET", receiptPath);
    assert.ok(accepted.submissionId > 0, "the lost ACK followed a real native commit");
    await server.close();
    await store.close();
    const later = Date.now() + 25 * 3600_000;
    t.mock.method(Date, "now", () => later);
    store = await temporary.open();
    server = await serve(store, false);
    const replayedSession = await server.client.createSession({ name: "lost ack", cwd: temporary.work, model: faux }, "independent-create");
    assert.equal(replayedSession.id, session.id, "create mapping survives the former 24-hour response cache horizon");
    const recovered = server.client.agent(session.id, "main");
    const replies = await Promise.all([
      recovered.send(content, "followUp", key, 15000),
      recovered.send(content, "followUp", key, 15000),
    ]);
    for (const reply of replies) {
      assert.equal(reply.submissionId, accepted.submissionId);
      assert.equal(reply.status, "done");
      if (reply.status === "done") assert.match(reply.answer.text, /independent-result-sentinel/);
    }
    await assert.rejects(() => recovered.send("different body", "followUp", key), /different payload/);
    const entries = await recovered.entries({ scope: "all" });
    assert.equal(entries.items.filter((entry) => entry.kind === "pi.tool-result").length, 1);
    const transcript = toTranscript(entries.items);
    assert.ok(transcript.some((item) => item.kind === "user" && item.text === content), "authenticated input must retain existing client user rendering");
    assert.ok(responses.every((response) => !response.includes(token)), "credential must not enter HTTP response/error JSON");
  } finally {
    await server.close();
    await store.close();
    t.mock.restoreAll();
    await temporary.cleanup();
  }
});
