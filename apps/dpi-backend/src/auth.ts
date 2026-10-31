import type { RequestHandler, Response } from "express";
import { GrantDenied, GrantPolicy, type GrantAction, type GrantHandle, type GrantIdentity, type GrantTarget } from "./grants.js";

/** Server-owned context. Never populate this from an HTTP body or client identity header. */
export interface Authorization {
  readonly policy: GrantPolicy;
  readonly handle: GrantHandle;
  readonly identity: GrantIdentity;
  readonly target: GrantTarget;
  readonly action: GrantAction;
  readonly signal: AbortSignal;
  recheck(): GrantIdentity;
}

export function authorizationOf(res: Response): Authorization | undefined {
  return res.locals?.authorization;
}

/** Runs before route parameters resolve, so denied requests cannot probe Store/catalog/history. */
export function bearerAuth(config: string | GrantPolicy, capabilities: readonly string[] = []): RequestHandler {
  const policy = typeof config === "string" ? new GrantPolicy([{
    id: "device-owner", token: config, actor: "device-owner", source: "terminal", authority: "human",
    permissions: ["read", "write", "control", "filesystem", "human-accept"], binding: {},
  }]) : config;
  return (req, res, next) => {
    try {
      const header = req.get("authorization") ?? "";
      const token = header.startsWith("Bearer ") ? header.slice(7).trim() : (req.get("x-dpi-token") ?? "").trim();
      const handle = policy.authenticate(token);
      const segments = req.path.split("/").filter(Boolean).map(decodeURIComponent);
      if ((req.method === "GET" || req.method === "HEAD") && segments.join("/") === "protocol") {
        res.locals.protocolGrant = policy.signal(handle);
        next();
        return;
      }
      const target: GrantTarget = {};
      if (segments[0] === "sessions" && segments[1]) {
        target.sessionId = segments[1];
        if (segments[2] === "agents" && segments[3]) {
          const id = segments[3] === "main" ? 1 : Number(segments[3]);
          if (Number.isSafeInteger(id) && id > 0) target.conversationId = id;
        }
      }
      const skillBody = segments.length === 4 && segments[0] === 'sessions' && segments[2] === 'skills';
      if (skillBody) target.conversationId = 1;
      const goalOperator = segments[0] === "sessions" && segments[2] === "agents" &&
        segments[4] === "goal" && segments[5] === "commands";
      const nativeParentControl = capabilities.includes('native-parent-control.v1') && req.method === 'POST' &&
        segments.length === 6 && segments[0] === 'sessions' && segments[2] === 'agents' &&
        segments[4] === 'parent-control' && ['commands', 'reconcile'].includes(segments[5]!);
      const nativeBbBinding = capabilities.includes('native-bb-binding.v1') && req.method === 'PUT' &&
        segments.length === 6 && segments[0] === 'sessions' && segments[2] === 'agents' && segments[4] === 'bb-bindings';
      const nativeIiiPost = capabilities.includes('native-iii.v2') && req.method === 'POST' && segments.length === 6 &&
        segments[0] === 'sessions' && segments[2] === 'agents' && segments[4] === 'iii' &&
        ['requests', 'run', 'result', 'controls', 'job-stop'].includes(segments[5]!);
      const durableReload = req.method === 'POST' && segments[0] === 'sessions' &&
        ((segments.length === 3 && segments[2] === 'reload') ||
         (segments.length === 4 && segments[2] === 'runtime' && segments[3] === 'refresh'));
      const action: GrantAction = durableReload ? 'control' : nativeIiiPost ? (segments[5] === 'result' ? 'read' : ['controls', 'job-stop'].includes(segments[5]!) ? 'control' : 'write') : nativeParentControl ? 'control' : goalOperator ? "human-accept" : skillBody || segments[0] === "fs" ? "filesystem"
        : req.method === "GET" || req.method === "HEAD" ? "read"
        : segments.at(-1) === "approval" ? "human-accept"
        : segments.at(-1) === "abort" ? "control" : "write";
      const recheck = () => {
        const identity = policy.assert(handle, action, target);
        if (durableReload) {
          policy.assert(handle, 'write', target);
          if (identity.authority !== 'human') throw new GrantDenied(403);
        }
        if (skillBody) {
          policy.assert(handle, 'read', target);
          if (identity.authority !== 'human') throw new GrantDenied(403);
        }
        if (goalOperator) {
          policy.assert(handle, "write", target);
          policy.assert(handle, "control", target);
        }
        return identity;
      };
      const identity = recheck();
      // Exact capability-bound native routes only; never grant generic machine controls.
      const nativeInput = capabilities.includes("delegated-input.v1") && req.method === "POST" &&
        segments.length === 5 && segments[0] === "sessions" && segments[2] === "agents" && segments[4] === "messages";
      if (identity.authority === "delegated" && action !== "read" && !nativeInput && !nativeParentControl && !nativeBbBinding && !nativeIiiPost) {
        res.status(403).json({ error: { code: "unavailable", message: "This profile has no delegated native admission capability" } });
        return;
      }
      res.locals.authorization = { policy, handle, identity, target, action, signal: policy.signal(handle), recheck } satisfies Authorization;
      const json = res.json.bind(res);
      res.json = (body) => {
        try { recheck(); } catch (error) {
          if (!(error instanceof GrantDenied)) throw error;
          res.status(error.status);
          return json({ error: { code: "unauthorized", message: error.message } });
        }
        return json(body);
      };
      next();
    } catch (error) {
      if (error instanceof GrantDenied) {
        if (error.status === 401) res.set("WWW-Authenticate", 'Bearer realm="dpi"');
        res.status(error.status).json({ error: { code: "unauthorized", message: error.message } });
      } else if (error instanceof URIError) {
        res.status(400).json({ error: { code: "invalid", message: "Malformed route encoding" } });
      } else next(error);
    }
  };
}
