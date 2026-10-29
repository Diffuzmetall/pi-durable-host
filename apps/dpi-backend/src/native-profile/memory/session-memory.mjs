import { appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHindsightController } from './hindsight/index.mjs';
import { withRetainAcceptance } from './hindsight/bridge.mjs';
import { ensurePrivateDirectory, ensurePrivateFile } from './hindsight/private-fs.mjs';
import { withSessionLogs } from './logging-scope.mjs';
export { HindsightClient, resolveConfig } from './hindsight/vendor/pi.mjs';

/** Trusted explicit resolvers only. This factory never reads the user's config or resolves a live memory bank. */
export async function createSessionMemory(registry, { directory, resolveBinding, resolveClient, lifecycleEffects = {}, diagnostic = () => {} }) {
  if (typeof resolveBinding !== 'function' || typeof resolveClient !== 'function') throw Error('EXPLICIT_MEMORY_BINDING_AND_CLIENT_REQUIRED');
  const root = resolve(directory);
  await ensurePrivateDirectory(root);
  const paths = {
    log: await ensurePrivateFile(resolve(root, 'memory.log')),
    diag: await ensurePrivateFile(resolve(root, 'diagnostics.jsonl')),
    usage: await ensurePrivateFile(resolve(root, 'usage.jsonl')),
    level: 'info',
  };
  const scope = run => withSessionLogs(paths, run);
  const wrap = fn => function (...args) { return scope(() => fn.apply(this, args)); };
  const decorate = extension => ({
    ...extension,
    ...(extension.tools ? { tools: extension.tools.map(tool => ({ ...tool, execute: wrap(tool.execute) })) } : {}),
    ...(extension.sections ? { sections: extension.sections.map(section => ({ ...section, render: wrap(section.render) })) } : {}),
    ...(extension.hooks ? { hooks: extension.hooks.map(hook => ({ ...hook, handlers: Object.fromEntries(Object.entries(hook.handlers).map(([name, fn]) => [name, wrap(fn)])) })) } : {}),
    ...(extension.tasks ? { tasks: extension.tasks.map(task => ({ ...task, definition: {
      ...task.definition,
      phases: Object.fromEntries(Object.entries(task.definition.phases).map(([name, fn]) => [name, wrap(fn)])),
      abort: wrap(task.definition.abort),
    } })) } : {}),
  });
  const clients = new WeakMap();
  const scopedClient = async (binding, cfg) => {
    const client = await resolveClient(binding, cfg);
    if (!client || client.bank !== binding.bankId || typeof client.fetchWithAuth !== 'function') throw Error('MEMORY_CLIENT_BINDING_MISMATCH');
    if (!clients.has(client)) {
      withRetainAcceptance(client);
      clients.set(client, new Proxy(client, { get(target, key) {
        const value = Reflect.get(target, key, target);
        return typeof value === 'function' ? (...args) => scope(() => value.apply(target, args)) : value;
      } }));
    }
    return clients.get(client);
  };
  const scopedRegistryFor = target => ({
    install: extension => target.install(decorate(extension)),
    snapshot: () => target.snapshot(),
  });
  const scopedRegistry = scopedRegistryFor(registry);
  const raw = scope(() => createHindsightController(scopedRegistry, {
    resolveBinding, resolveClient: scopedClient, scope,
    lifecycleEffects: { ...lifecycleEffects, env: lifecycleEffects.env ?? {}, usagePath: paths.usage },
    diagnostic: (...args) => {
      appendFileSync(paths.log, `${JSON.stringify({ diagnostic: args })}\n`, { mode: 0o600 });
      diagnostic(...args);
    },
  }));
  const controller = Object.fromEntries(Object.entries(raw).map(([name, fn]) => [name, wrap(fn.bind(raw))]));
  controller.reload = wrap((target = registry) => raw.reload(scopedRegistryFor(target)));
  return {
    controller,
    paths: Object.freeze({ log: paths.log, diag: paths.diag, usage: paths.usage }),
    async bind({ session, storage, context }) {
      await controller.bind({ session, storage, directory: root, context });
    },
    drain: (...args) => controller.drain(...args),
    close: (...args) => controller.close(...args),
  };
}
