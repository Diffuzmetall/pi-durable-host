import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";
import { DpiClient, type RequestOptions } from "dpi-sdk/client";
import { nativeAttentionFixture } from "../../dpi-backend/tests/fixtures/terminal-native-attention.js";
import { until } from "../../dpi-backend/tests/helpers.js";
import { RemoteTerminal } from "../src/remote-controller.js";

class GoalClient extends DpiClient {
  loseNextAck = false;
  readonly posts: { requestId: string; line: string; taskId: number }[] = [];
  readonly mutations: string[] = [];
  override async request<T>(method: string, path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    if (method === "POST") this.mutations.push(path);
    const result = await super.request<T>(method, path, body, options);
    if (method === "POST" && path.endsWith("/goal/commands")) {
      const value: unknown = result;
      assert(body && typeof body === "object" && "requestId" in body && typeof body.requestId === "string" && "line" in body && typeof body.line === "string");
      assert(value && typeof value === "object" && "taskId" in value && typeof value.taskId === "number");
      this.posts.push({ requestId: body.requestId, line: body.line, taskId: value.taskId });
      if (this.loseNextAck) { this.loseNextAck = false; throw Error("Injected native Goal lost ACK"); }
    }
    return result;
  }
}

test("remote Goal uses actual native operator HTTP, saved retry keys, safe inspection and no uncertain replay after reopen", { timeout: 30000 }, async () => {
  const host = await nativeAttentionFixture();
  let terminal: RemoteTerminal | undefined;
  let reopened: RemoteTerminal | undefined;
  try {
    const client = new GoalClient(host.base, host.token);
    const cache = join(host.root, "goal-client");
    terminal = await RemoteTerminal.open(client, host.sessionId, cache);
    await until(async () => terminal!.current().connection === "online", 10000, "Goal operator client online");
    const status = `/goal status ${host.goalId}`;
    client.loseNextAck = true;
    await assert.rejects(() => terminal!.submit(status, "steer"), /Goal lost ACK/);
    await terminal.submit(status, "steer");
    assert.equal(client.posts.length, 2);
    assert.equal(client.posts[0].requestId, client.posts[1].requestId);
    assert.equal(client.posts[0].taskId, client.posts[1].taskId);
    await until(async () => terminal!.current().notices.some(notice => notice.transient && notice.message.includes("NATIVE_GOAL_VIEW_SENTINEL")), 10000, "actual Goal status result presentation");
    const approve = `/goal approve ${host.goalId} human`;
    await terminal.submit(approve, "steer");
    await until(async () => terminal!.current().notices.some(notice => notice.message.includes("effect is uncertain")), 10000, "actual draft approval rejection is uncertain, never success");
    assert(!terminal.current().notices.some(notice => notice.transient), "The next input clears prior temporary Goal console output, like the original TUI");
    const first = client.posts.find(post => post.line === approve); assert.ok(first);
    await terminal.submit(approve, "followUp");
    const retries = client.posts.filter(post => post.line === approve);
    assert.equal(retries.length, 2);
    assert.equal(retries[1].requestId, first.requestId);
    assert.equal(retries[1].taskId, first.taskId);
    await assert.rejects(() => terminal!.submit(`/goal cancel ${host.goalId} --confirm`, "steer"), /uncertain/);
    await terminal.submit(status, "steer");
    assert.equal((await host.goal())?.evidence.length, 0);
    assert.equal(host.modelCalls, 0, "Operator commands never become model input");
    assert(client.mutations.every(path => path.endsWith("/goal/commands")));
    await terminal.close(); terminal = undefined;
    await host.reopen();
    const next = new GoalClient(host.base, host.token);
    reopened = await RemoteTerminal.open(next, host.sessionId, cache);
    await until(async () => reopened!.current().notices.some(notice => notice.message.includes("effect is uncertain")), 10000, "uncertain native command reconciled by receipt after SQLite reopen");
    assert.equal(next.posts.length, 0, "Reopen performs receipt reads, never automatic command replay");
    await reopened.submit(approve, "steer");
    assert.equal(next.posts[0].requestId, first.requestId);
    assert.equal(next.posts[0].taskId, first.taskId);
    assert.equal(host.modelCalls, 0);
    assert.equal((await host.goal())?.evidence.length, 0);
  } finally {
    await terminal?.close(); await reopened?.close(); await host.close();
  }
});

test("current native session Goal leaves root interrupt semantics intact without inventing Goal-stop or generic task control", { timeout: 15000 }, async () => {
  const host = await nativeAttentionFixture();
  let terminal: RemoteTerminal | undefined;
  try {
    const client = new GoalClient(host.base, host.token);
    terminal = await RemoteTerminal.open(client, host.sessionId, join(host.root, "protected-client"));
    const conversation = await host.startSessionGoal();
    assert.equal(conversation, 1);
    assert.equal(await host.protected(conversation), false, "Actual selected session-goals service deliberately does not own/protect ordinary foreground execution");
    await terminal.abort();
    await until(async () => !(await client.agent(host.sessionId, 1).get()).busy, 10000, "native foreground run interrupted");
    assert(!terminal.current().notices.some(notice => notice.message.startsWith("Goal continues")));
    assert.equal(client.posts.length, 0, "Interrupt never becomes a synthesized /goal stop command");
    assert(!client.mutations.some(path => /\/tasks\/\d+\/abort/.test(path)));
  } finally { await terminal?.close(); await host.close(); }
});

test("an older SDK missing Goal helpers refuses control before any mutation", async () => {
  class OlderClient extends GoalClient {
    override agent(session: string, agent: string | number) {
      return new Proxy(super.agent(session, agent), {
        get(target, key, receiver) { return key === "goalCommand" || key === "goalReceipt" ? undefined : Reflect.get(target, key, receiver); },
      });
    }
  }
  const host = await nativeAttentionFixture();
  let terminal: RemoteTerminal | undefined;
  try {
    const client = new OlderClient(host.base, host.token);
    terminal = await RemoteTerminal.open(client, host.sessionId, join(host.root, "older-sdk-client"));
    await assert.rejects(() => terminal!.submit(`/goal status ${host.goalId}`, "steer"), /Installed SDK lacks native Goal control/);
    assert.equal(client.mutations.length, 0);
    assert.equal(host.modelCalls, 0);
  } finally { await terminal?.close(); await host.close(); }
});
