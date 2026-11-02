// Source verification only; never an installed-candidate qualification alias.
import { registerHooks } from 'node:module';
const repo = new URL('../../../', import.meta.url);
const candidate = new URL('file:///candidate/');
registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'dpi-backend/native-profile' || specifier === '@local/pi-durable-reload')
    return next(new URL('packages/durable-reload/src/index.ts', repo).href, context);
  if (specifier.startsWith('@earendil-works/') || specifier === 'typebox' || specifier === 'esbuild')
    return next(specifier, { ...context, parentURL: new URL('package.json', candidate).href });
  const marker = '/apps/dpi-backend/node_modules/@earendil-works/';
  if (specifier.includes(marker))
    return next(new URL('node_modules/@earendil-works/' + specifier.split(marker)[1], candidate).href, context);
  return next(specifier, context);
} });
