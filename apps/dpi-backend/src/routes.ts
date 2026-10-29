// REST v1. Every route requires a server-owned grant (see auth.ts). Session refs are a UUID or a
// unique name; agent refs are a numeric id, `main`, or a unique name.
import { Router, type Request, type Response, type NextFunction } from "express";
import type { Conversation, Harness } from "@earendil-works/pi-durable";
import { DEVICE_DOC_KINDS, type SessionRow, type Store } from "./store.js";
import { agentStream, deviceStream, sessionStream, bbOutcomeStream } from "./streams.js";
import type { ProtocolInfo } from "../../dpi-sdk/src/api.js";
import type { AdmissionIdentity } from "./idempotency.js";
import { invalid } from "./errors.js";
import { authorizationOf } from "./auth.js";
import { GrantDenied } from "./grants.js";

type Async = (req: Request, res: Response) => Promise<unknown>;
const route = (fn: Async) => (req: Request, res: Response, next: NextFunction) => Promise.resolve().then(() => {
  // Parameter resolution can await; reject a revoke before entering the operation too.
  const authorization = authorizationOf(res);
  if (!authorization) throw new GrantDenied(401);
  authorization.recheck();
  return fn(req, res);
}).catch(next);

interface Locals {
  row: SessionRow;
  h: Harness;
  c: Conversation;
}

const param = (req: Request, key: string) => String(req.params[key]);
const int = (value: unknown, name: string) => {
  const n = Number(value);
  if (!Number.isSafeInteger(n)) throw invalid(`${name} must be an integer`);
  return n;
};

export function v1(store: Store) {
  // Literal route names must match the case-sensitive authorization classifier.
  const r = Router({ caseSensitive: true });
  r.get("/protocol", (_req, res, next) => {
    const signal: AbortSignal | undefined = res.locals.protocolGrant;
    if (!signal || signal.aborted) return next(new GrantDenied(401));
    res.json(store.protocolInfo() satisfies ProtocolInfo);
  });
  r.use((_req, res, next) => {
    try {
      const authorization = authorizationOf(res);
      if (!authorization) throw new GrantDenied(401);
      authorization.recheck();
      next();
    } catch (error) { next(error); }
  });

  // Resolve :s and :a once per request.
  r.param("s", (req, res, next, value: string) => {
    try {
      const row = store.resolveSession(value);
      res.locals.row = row;
      next();
    } catch (e) {
      next(e);
    }
  });
  r.param("a", (req, res, next, value: string) => {
    store
      .resolveAgent(param(req, "s"), value)
      .then((resolved) => {
        Object.assign(res.locals, resolved);
        next();
      })
      .catch(next);
  });
  const L = (res: Response) => res.locals as Locals;
  const admission = (res: Response): AdmissionIdentity => {
    const authorization = authorizationOf(res)!;
    return { ...authorization.identity, assertCurrent: () => { authorization.recheck(); }, signal: authorization.signal,
      policyReference: authorization.policy.reference(authorization.handle) };
  };

  // ---------------------------------------------------------- device
  r.get("/device", (_req, res) => res.json(store.deviceInfo()));
  r.get("/tree", route(async (_req, res) => res.json(await store.tree())));
  r.get("/events", (req, res, next) => {
    try {
      deviceStream(store, req, res);
    } catch (e) {
      next(e);
    }
  });
  r.get("/fs/dirs", route(async (req, res) => res.json(await store.browse(String(req.query.path ?? "")))));
  r.get(
    "/docs/:kind",
    route(async (req, res) => {
      const kind = param(req, "kind");
      if (!DEVICE_DOC_KINDS.includes(kind)) throw invalid(`Unknown device document ${kind}`);
      res.json({ kind, ...(await store.deviceDoc(kind)) });
    }),
  );

  // ---------------------------------------------------------- sessions
  r.get("/sessions", route(async (_req, res) => res.json((await store.tree()).sessions)));
  r.post("/sessions", route(async (req, res) => res.status(201).json(await store.createSessionRequest(req.body ?? {}, req.get("idempotency-key") ?? "", admission(res)))));
  r.get("/sessions/:s", route(async (_req, res) => res.json(await store.sessionSummary(L(res).row))));
  r.patch("/sessions/:s", route(async (req, res) => res.json(await store.rename(L(res).row, req.body?.name))));
  r.get("/sessions/:s/models", route(async (_req, res) => res.json(await store.sessionModels(L(res).row))));
  r.get("/sessions/:s/skills", route(async (_req, res) => res.json(await store.skills(L(res).row))));
  r.get("/sessions/:s/skills/:name", route(async (req, res) => res.json(await store.skill(L(res).row, param(req, 'name')))));
  r.get("/sessions/:s/compaction", route(async (_req, res) => res.json(store.compactionOf(L(res).row.id))));
  r.patch("/sessions/:s/compaction", route(async (req, res) => res.json(store.setCompaction(L(res).row, req.body ?? {}))));
  r.delete("/sessions/:s", route(async (_req, res) => res.json(await store.archive(L(res).row))));
  r.get("/sessions/:s/events", route(async (_req, res) => sessionStream(store, L(res).row, res)));
  r.get(
    "/sessions/:s/tasks",
    route(async (req, res) => {
      const status = String(req.query.status ?? "terminal");
      if (!["live", "terminal"].includes(status)) throw invalid("status must be live or terminal");
      const h = store.harness(L(res).row);
      if (status === "live") return res.json(await store.liveTasks(h));
      res.json(await store.tasks(h, status, Number(req.query.limit ?? 20)));
    }),
  );
  r.post(
    "/sessions/:s/tasks/:taskId/abort",
    route(async (req, res) => res.json(await store.abortTask(store.harness(L(res).row), int(req.params.taskId, "taskId")))),
  );
  r.get("/sessions/:s/inspect", route(async (_req, res) => res.json(await store.inspect(store.harness(L(res).row)))));
  r.get(
    "/sessions/:s/submissions/:id",
    route(async (req, res) => {
      const closed = new AbortController();
      res.on("close", () => closed.abort());
      res.json(
        await store.settled(
          store.harness(L(res).row),
          int(req.params.id, "submission id"),
          Math.min(Number(req.query.waitMs ?? 0) || 0, 300_000),
          closed.signal,
        ),
      );
    }),
  );

  // ---------------------------------------------------------- agents
  r.get("/sessions/:s/agents", route(async (_req, res) => res.json(await store.agents(L(res).row))));
  r.post(
    "/sessions/:s/agents",
    route(async (req, res) => res.status(201).json(await store.createAgentRequest(L(res).row, req.body ?? {}, req.get("idempotency-key") ?? "", admission(res)))),
  );
  const a = "/sessions/:s/agents/:a";
  r.get(a, route(async (_req, res) => res.json(await store.agentDetail(L(res).row, L(res).c))));
  r.patch(
    a,
    route(async (req, res) => {
      store.setAgentName(L(res).row, L(res).c.id as number, req.body?.name);
      res.json(await store.agentSummary(L(res).row, L(res).c));
    }),
  );
  r.get(`${a}/events`, route(async (req, res) => agentStream(store, L(res), req, res)));
  r.get(
    `${a}/entries`,
    route(async (req, res) => {
      const scope = String(req.query.scope ?? "all");
      if (scope === "active") return res.json({ items: await store.activeEntries(L(res).c) });
      res.json(await store.entries(L(res).c, req.query.cursor as string | undefined, Number(req.query.limit ?? 500)));
    }),
  );
  r.get(`${a}/transcript`, route(async (req, res) => res.json(await store.transcript(L(res).c, String(req.query.format ?? "json")))));
  r.post(
    `${a}/messages`,
    route(async (req, res) => {
      const { h, c } = L(res);
      const authorization = authorizationOf(res)!;
      authorization.recheck();
      const submission = await store.send(c, req.body ?? {}, admission(res), L(res).row);
      const waitMs = Number(req.body?.waitMs ?? 0) || 0;
      if (!waitMs) return res.status(202).json({ submissionId: submission.id, status: "queued" });
      const closed = new AbortController();
      res.on("close", () => closed.abort());
      const result = await store.settled(h, submission.id as number, waitMs, closed.signal);
      res.status(result.status === "done" || result.status === "unanswered" ? 200 : 202).json(result);
    }),
  );
  r.post(`${a}/goal/commands`, route(async (req, res) => {
    const receipt = await store.goalCommand(L(res).row, L(res).c, req.body ?? {}, admission(res));
    res.status(receipt.status === "queued" || receipt.status === "started" ? 202 : 200).json(receipt);
  }));
  r.get(`${a}/goal/commands/:requestId`, route(async (req, res) =>
    res.json(await store.goalReceipt(L(res).row, L(res).c, param(req, "requestId"), admission(res)))));
  r.get(`${a}/models`, route(async (_req, res) => res.json(await store.sessionModels(L(res).row))));
  r.get(`${a}/bb-bindings/:threadId/outcomes`, route(async (req, res) =>
    bbOutcomeStream(store, L(res).row, L(res).c, param(req, 'threadId'), res)));
  r.get(`${a}/bb-bindings/:threadId/outcome`, route(async (req, res) =>
    res.json(await store.bbOutcome(L(res).row, L(res).c, authorizationOf(res)!, param(req, 'threadId')))));
  r.get(`${a}/iii`, route(async (_req, res) => res.json(await store.iiiOperation(L(res).row, L(res).c, authorizationOf(res)!, 'info'))));
  r.post(`${a}/iii/requests`, route(async (req, res) => res.json(await store.iiiOperation(L(res).row, L(res).c, authorizationOf(res)!, 'submit', req.body))));
  r.post(`${a}/iii/run`, route(async (req, res) => {
    const cancelled = new AbortController();
    const disconnect = () => cancelled.abort();
    req.once('aborted', disconnect);
    res.once('close', disconnect);
    try {
      res.json(await store.iiiOperation(L(res).row, L(res).c, authorizationOf(res)!, 'run', req.body, cancelled.signal));
    } finally {
      req.off('aborted', disconnect);
      res.off('close', disconnect);
    }
  }));
  r.get(`${a}/iii/requests/:requestId`, route(async (req, res) => res.json(await store.iiiOperation(L(res).row, L(res).c, authorizationOf(res)!, 'request', param(req, 'requestId')))));
  r.post(`${a}/iii/result`, route(async (req, res) => res.json(await store.iiiOperation(L(res).row, L(res).c, authorizationOf(res)!, 'result', req.body))));
  r.post(`${a}/iii/controls`, route(async (req, res) => res.json(await store.iiiOperation(L(res).row, L(res).c, authorizationOf(res)!, 'control', req.body))));
  r.get(`${a}/iii/controls/:controlId`, route(async (req, res) => res.json(await store.iiiOperation(L(res).row, L(res).c, authorizationOf(res)!, 'controlReceipt', param(req, 'controlId')))));
  r.post(`${a}/iii/job-stop`, route(async (req, res) => res.json(await store.iiiOperation(L(res).row, L(res).c, authorizationOf(res)!, 'jobStop', req.body))));
  r.get(`${a}/iii/job-stop/:controlId`, route(async (req, res) => res.json(await store.iiiOperation(L(res).row, L(res).c, authorizationOf(res)!, 'jobStopReceipt', param(req, 'controlId')))));
  r.get(`${a}/bb-bindings/:threadId`, route(async (req, res) =>
    res.json(await store.bbBinding(L(res).row, L(res).c, authorizationOf(res)!, param(req, 'threadId')))));
  r.put(`${a}/bb-bindings/:threadId`, route(async (req, res) =>
    res.json(await store.bbBinding(L(res).row, L(res).c, authorizationOf(res)!, param(req, 'threadId'), req.body ?? {}))));
  r.get(`${a}/parent-control`, route(async (req, res) => {
    let target: unknown;
    if (req.query.target !== undefined) {
      if (typeof req.query.target !== 'string') throw invalid('Invalid native child target query');
      try { target = JSON.parse(req.query.target); } catch { throw invalid('Invalid native child target JSON'); }
    }
    res.json(await store.parentOperation(L(res).row, L(res).c, authorizationOf(res)!, { kind: 'inspect', target }));
  }));
  r.post(`${a}/parent-control/commands`, route(async (req, res) =>
    res.json(await store.parentOperation(L(res).row, L(res).c, authorizationOf(res)!, { kind: 'command', value: req.body }))));
  r.get(`${a}/parent-control/commands/:controlId`, route(async (req, res) =>
    res.json(await store.parentOperation(L(res).row, L(res).c, authorizationOf(res)!, { kind: 'receipt', controlId: param(req, 'controlId') }))));
  r.post(`${a}/parent-control/reconcile`, route(async (_req, res) =>
    res.json(await store.parentOperation(L(res).row, L(res).c, authorizationOf(res)!, { kind: 'reconcile' }))));
  r.get(`${a}/receipts/:requestId`, route(async (req, res) => res.json(await store.messageReceipt(L(res).row, L(res).c, param(req, "requestId"), admission(res)))));
  r.delete(
    `${a}/inbox/:submissionId`,
    route(async (req, res) => res.json(await store.withdraw(L(res).h, L(res).c, int(req.params.submissionId, "submissionId")))),
  );
  r.post(`${a}/abort`, route(async (req, res) => res.json(await store.abort(L(res).c, req.body?.background === true, L(res).row))));
  r.post(`${a}/fork`, route(async (req, res) => res.status(201).json(await store.forkRequest(L(res).row, L(res).c, req.body ?? {}, req.get("idempotency-key") ?? "", admission(res)))));
  r.get(`${a}/config`, route(async (_req, res) => res.json((await store.agentDetail(L(res).row, L(res).c)).config)));
  r.patch(`${a}/config`, route(async (req, res) => res.json(await store.configure(L(res).row, L(res).c, req.body ?? {}))));
  r.get(`${a}/extensions`, route(async (_req, res) => res.json(await store.extensionsOf(L(res).row, L(res).c))));
  r.patch(`${a}/extensions`, route(async (req, res) => res.json(await store.setExtension(L(res).row, L(res).c, req.body ?? {}))));
  r.post(`${a}/compact`, route(async (req, res) => res.json(await store.compact(L(res).c, req.body?.instructions))));
  r.post(`${a}/reset`, route(async (req, res) => res.json(await store.reset(L(res).c, req.body?.note))));
  r.get(
    `${a}/docs/:kind`,
    route(async (req, res) => {
      const kind = param(req, "kind");
      res.json({ kind, value: await store.agentDoc(L(res).h, L(res).c, kind) });
    }),
  );

  // ---------------------------------------------------------- demo extension
  r.post(`${a}/demo/state`, route(async (req, res) => res.json(await store.demoState(L(res).c, req.body ?? {}))));
  r.post(
    `${a}/demo/jobs`,
    route(async (req, res) => res.status(201).json(await store.startJob(L(res).row, L(res).h, L(res).c, req.body ?? {}))),
  );
  r.post(
    `${a}/demo/jobs/:taskId/approval`,
    route(async (req, res) => res.json(await store.approveJob(L(res).c, int(req.params.taskId, "taskId"), req.body?.approved))),
  );

  return r;
}
