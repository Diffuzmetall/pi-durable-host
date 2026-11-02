// Source-only verification: final packaged QA must not use these aliases.
import { registerHooks } from 'node:module';
const repo = new URL('../../../', import.meta.url);
const files = {
  '@local/pi-durable-reload': 'packages/durable-reload/src/index.ts',
  'dpi-backend/native-profile': 'apps/dpi-backend/src/native-profile/profile.ts',
  'dpi-backend/store': 'apps/dpi-backend/src/store.ts',
  'dpi-backend/server': 'apps/dpi-backend/src/http-server.ts',
  'dpi-sdk': 'apps/dpi-sdk/src/client.ts',
};
registerHooks({ resolve(specifier, context, next) {
  if (files[specifier]) return next(new URL(files[specifier], repo).href, context);
  if (specifier.startsWith('@earendil-works/'))
    return next(specifier, { ...context, parentURL: new URL('apps/dpi-backend/src/store.ts', repo).href });
  return next(specifier, context);
} });
