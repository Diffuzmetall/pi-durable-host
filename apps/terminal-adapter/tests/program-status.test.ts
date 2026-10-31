import assert from "node:assert/strict";
import test from "node:test";
import { formatProgramStatus, type ProgramStatus } from "@earendil-works/pi-tui";
import type { AssistantMessage, DurableView, EntryRecord, LiveState } from "../src/types.js";
import { durableProgramStatus, DurableProgramStatus } from "../src/ui/experimental/durable/program-status.ts";

const base = (): DurableView => ({
  session: { id: "fixture", directory: "/unused", cwd: "/unused", name: "Fixture session" },
  conversation: { conversation: { id: 1 }, entries: [], docs: {} }, conversations: [], models: [], notices: [],
  automation: { scheduled: 0, failed: 0 }, connection: "online",
});
const answer = (stopReason: string, errorMessage?: string): EntryRecord => ({
  id: 2, conversationId: 1, kind: "pi.assistant", model: [{ role: "assistant", provider: "faux", model: "fixture",
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
    content: [{ type: "text", text: "PRIVATE_ASSISTANT_TEXT" }], stopReason, errorMessage } satisfies AssistantMessage],
});

test("empty startup is idle; successful final answers are done", () => {
  const view = base();
  assert.equal(durableProgramStatus(view).state, "idle");
  for (const reason of ["stop", "length"]) {
    view.conversation.entries = [answer(reason)];
    assert.deepEqual(durableProgramStatus(view), { state: "done", app: "pi", message: "Fixture session" });
  }
});

test("all active native work, retries and deferred waits stay working", () => {
  const cases: LiveState[] = [
    { run: { inputs: [1] } }, { generation: { attempt: 0 } },
    { generation: { attempt: 1, retry: { at: 1, error: "PRIVATE_RETRY" } } },
    { generation: { attempt: 0, deferred: { pollAt: 1 } } },
    { tools: [{ name: "bash", callId: "x", status: "running", output: "PRIVATE_TOOL_OUTPUT" }] },
    { tools: [{ name: "bash", callId: "x", status: "pending" }] },
  ];
  for (const live of cases) {
    const view = base(); view.conversation.entries = [answer("stop")]; view.conversation.docs["pi.live"] = live;
    assert.deepEqual(durableProgramStatus(view), { state: "working", app: "pi", message: view.session.name });
  }
});

test("compaction gets only its fixed label", () => {
  const view = base();
  view.conversation.docs["pi.live"] = { compactions: [{ taskId: 1, reason: "PRIVATE_REASON", blocking: true, attempt: 0 }] };
  assert.deepEqual(durableProgramStatus(view), { state: "working", app: "pi", message: "Compacting" });
});

test("aborted, pending, tool-only and unknown stops do not imply done", () => {
  for (const stop of ["aborted", "pending", "toolUse", "future-stop"]) {
    const view = base(); view.conversation.entries = [answer("stop"), answer(stop)];
    assert.equal(durableProgramStatus(view).state, "idle");
  }
});

test("new input/reset supersedes historical success or failure", () => {
  for (const kind of ["pi.user", "host.input", "pi.reset"]) for (const old of ["stop", "error"]) {
    const view = base(); view.conversation.entries = [answer(old), { id: 3, conversationId: 1, kind }];
    assert.equal(durableProgramStatus(view).state, "idle");
  }
});

test("final error reports only its first error line, never answer text", () => {
  const view = base(); view.conversation.entries = [answer("error", "Provider unavailable\nPRIVATE_SECOND_LINE")];
  assert.deepEqual(durableProgramStatus(view), { state: "error", app: "pi", message: "Provider unavailable" });
  view.conversation.entries = [answer("error")];
  assert.equal(durableProgramStatus(view).message, "Run failed");
});

test("disconnected snapshots never advertise historical work or completion", () => {
  for (const connection of ["connecting", "reconnecting", "offline"] as const) {
    const view = base(); view.connection = connection;
    view.conversation.entries = [answer("stop")]; view.conversation.docs["pi.live"] = { run: { inputs: [] } };
    view.attention = { requests: [{ id: "x", child: 2, name: "secret", reason: "need_decision", message: "PRIVATE_QUESTION" }] };
    assert.deepEqual(durableProgramStatus(view), { state: "idle", app: "pi", message: `Host ${connection}` });
  }
});

test("pending child questions report blocked without transporting question content", () => {
  const view = base();
  view.attention = { requests: [{ id: "x", child: 2, name: "secret", reason: "interview_request", message: "PRIVATE_QUESTION" }] };
  assert.deepEqual(durableProgramStatus(view), { state: "blocked", app: "pi", kind: "question", message: "Agent decision required" });
  view.attention = { requests: [], unavailable: true };
  assert.equal(durableProgramStatus(view).state, "idle");
});

test("local dialogs override work; cancel restores the NEWEST underlying state; duplicate renders are silent", () => {
  const reports: ProgramStatus[] = [];
  const reporter = new DurableProgramStatus({ setProgramStatus: value => reports.push(value) });
  const view = base(); view.conversation.docs["pi.live"] = { run: { inputs: [] } };
  reporter.update(view); reporter.update(view);
  reporter.dialog("Select model"); reporter.dialog("Select model");
  view.conversation.docs["pi.live"] = {}; view.conversation.entries = [answer("stop")];
  reporter.update(view);
  reporter.dialog();
  assert.deepEqual(reports.map(value => value.state), ["working", "blocked", "done"]);
  assert.equal(reports[1].kind, "question");
});

test("permission/auth kinds use native schema; generic panels clear the dialog", () => {
  const reports: ProgramStatus[] = [];
  const reporter = new DurableProgramStatus({ setProgramStatus: value => reports.push(value) });
  reporter.update(base());
  reporter.dialog("Confirm", "permission"); reporter.dialog("Login", "auth"); reporter.dialog();
  assert.deepEqual(reports.map(value => value.kind), [undefined, "permission", "auth", undefined]);
});

test("native formatter emits OSC 7501 with app=pi, sanitizes controls and bounds Unicode", () => {
  const sequence = formatProgramStatus({ state: "working", app: "pi", message: "\x1b]52;evil\x07\n" + "я".repeat(2000) });
  assert.ok(sequence.startsWith("\x1b]7501;")); assert.ok(sequence.endsWith("\x1b\\"));
  assert.ok(sequence.includes("app=pi"));
  const encoded = /(?:;|:)msg=([^:\x1b]*)/.exec(sequence)?.[1];
  assert.ok(encoded);
  const decoded = Buffer.from(encoded, "base64").toString("utf8");
  assert.ok(!/[\x00-\x1f\x7f-\x9f]/.test(decoded)); assert.ok(decoded.length < 2000);
});
