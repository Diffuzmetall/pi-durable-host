import express from 'express';
import { createServer } from 'node:http';
import { bearerAuth } from './auth.js';
import { GrantPolicy } from './grants.js';
import { errorMiddleware } from './errors.js';
import { v1 } from './routes.js';
import type { Store } from './store.js';
export { GrantPolicy } from './grants.js';
export type { GrantSpec } from './grants.js';

/** Existing v1 transport and native Store; profile capabilities come from the selected server factory. */
export function createHttpServer(store: Store, grants: string | GrantPolicy) {
  const app = express();
  app.disable('x-powered-by');
  app.get('/healthz', (_req, res) => res.json({ ok: true }));
  app.use('/v1', bearerAuth(grants, store.protocolInfo().capabilities), express.json({ limit: '256kb' }), v1(store));
  app.use((_req, res) => res.status(404).json({ error: { code: 'not_found', message: 'Route not found' } }));
  app.use(errorMiddleware);
  const server = createServer(app);
  server.keepAliveTimeout = 65_000;
  return server;
}
