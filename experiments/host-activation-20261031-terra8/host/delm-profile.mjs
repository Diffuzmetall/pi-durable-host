import { constants, openSync, closeSync, fstatSync, readFileSync, lstatSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const exact = (value, keys) => object(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const deny = () => { throw Error('DELM_BINDING_DENIED'); };

function canonical(path, directory) {
  if (typeof path !== 'string' || !isAbsolute(path) || resolve(path) !== path || realpathSync(path) !== path) deny();
  const stat = lstatSync(path);
  if (directory ? !stat.isDirectory() : !stat.isFile()) deny();
  return path;
}

function readBindings(path) {
  canonical(path, false);
  const parent = lstatSync(dirname(path));
  if (parent.uid !== process.getuid() || (parent.mode & 0o077)) deny();
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.uid !== process.getuid() || (stat.mode & 0o077) || stat.size > 1024 * 1024) deny();
    const value = JSON.parse(readFileSync(fd, 'utf8'));
    if (!exact(value, ['version', 'sessions']) || value.version !== 1 || !object(value.sessions)) deny();
    const actors = new Set();
    for (const [id, binding] of Object.entries(value.sessions)) {
      if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,255}$/.test(id) ||
          !exact(binding, ['run', 'actor', 'workspace', 'enabled']) || typeof binding.enabled !== 'boolean' ||
          !['alice', 'bob', 'carol', 'dave', 'eve', 'frank', 'grace', 'heidi'].includes(binding.actor) ||
          typeof binding.run !== 'string' || !isAbsolute(binding.run) ||
          typeof binding.workspace !== 'string' || !isAbsolute(binding.workspace)) deny();
      const key = JSON.stringify([binding.run, binding.actor]);
      if (actors.has(key)) deny();
      actors.add(key);
    }
    return value.sessions;
  } finally { closeSync(fd); }
}

/** Trusted backend composition only. modulePath is an operator-pinned package entry,
 * resolved/bundled with the Host's matching Durable SDK; never supplied by a model or binding JSON.
 * Call before constructing Harness. Late bindings are staged for the shared Durable reload;
 * only its authorized publication installs into the SAME live registry/Harness.
 */
export async function attachDelm(composition, context, options) {
  if (!composition.registry || !Array.isArray(composition.extensions) ||
      typeof composition.admitInput !== 'function' || typeof composition.shutdown !== 'function') deny();
  const lifetime = { closed: false, harness: undefined, context: undefined };
  let select = await attachBinding(composition, context, options, lifetime);
  const bind = composition.bind, prepare = composition.prepareReload, shutdown = composition.shutdown;
  composition.bind = async function (host, ctx, storage) {
    if (lifetime.closed || (lifetime.harness && lifetime.harness !== host)) deny();
    await bind?.call(this, host, ctx, storage);
    if (lifetime.closed) deny();
    lifetime.harness = host;
    lifetime.context = ctx;
    await select?.(host, ctx);
  };
  composition.prepareReload = async function (additions = []) {
    if (lifetime.closed) deny();
    let staged, nextSelect = select;
    const protectedAdditions = [...additions];
    if (!nextSelect) {
      staged = { ...composition, extensions: [...composition.extensions],
        registry: { install: extension => protectedAdditions.push(extension) } };
      nextSelect = await attachBinding(staged, context, options, lifetime);
    }
    if (lifetime.closed) deny();
    const candidate = prepare ? await prepare.call(this, protectedAdditions) : {
      publish() {
        for (const extension of protectedAdditions) {
          composition.registry.install(extension);
          composition.extensions.push(extension);
        }
      },
    };
    return {
      async apply() {
        if (lifetime.closed) deny();
        await candidate.apply?.();
        if (lifetime.harness) await nextSelect?.(lifetime.harness, lifetime.context);
        if (lifetime.closed) deny();
      },
      publish() {
        candidate.publish();
        if (nextSelect && staged) composition.documentReaders = staged.documentReaders;
        select = nextSelect;
      },
    };
  };
  composition.shutdown = async function (...args) {
    lifetime.closed = true;
    return shutdown.apply(this, args);
  };
  return composition;
}

async function attachBinding(composition, context, { bindingFile, modulePath }, lifetime) {
  const sessions = readBindings(bindingFile);
  const sessionId = context.sessionId;
  const binding = Object.hasOwn(sessions, sessionId) ? sessions[sessionId] : undefined;
  if (!binding) return undefined;
  const { run, actor, workspace } = binding;
  const cwd = canonical(context.cwd, true);
  canonical(run, true);
  canonical(join(run, actor), true);
  if (canonical(workspace, true) !== cwd) deny();
  const config = JSON.parse(readFileSync(join(run, 'config.json'), 'utf8'));
  if (!object(config) || !object(config.actors) || !Object.hasOwn(config.actors, actor) ||
      canonical(config.workspace ?? join(run, actor, 'workspace'), true) !== cwd) deny();
  if (typeof composition.admitInput !== 'function' || typeof composition.shutdown !== 'function' ||
      !composition.registry || !Array.isArray(composition.extensions)) deny();
  canonical(modulePath, false);
  const moduleStat = lstatSync(modulePath);
  if (moduleStat.uid !== process.getuid() || (moduleStat.mode & 0o022)) deny();
  const { createDelmWait, DelmWaitDoc } = await import(pathToFileURL(modulePath).href);
  if (typeof createDelmWait !== 'function' || !DelmWaitDoc) deny();
  const readers = new Map(composition.documentReaders ?? []);
  if (readers.has('delm.waits') || composition.extensions.some(extension => extension.name === 'delm')) deny();
  const current = (allowDisabled = false) => {
    if (lifetime.closed || context.sessionId !== sessionId || canonical(context.cwd, true) !== cwd) deny();
    const all = readBindings(bindingFile);
    const now = Object.hasOwn(all, sessionId) ? all[sessionId] : undefined;
    if (!now || (!allowDisabled && !now.enabled) || now.run !== run || now.actor !== actor || now.workspace !== workspace) deny();
    canonical(run, true);
    canonical(join(run, actor), true);
    if (canonical(workspace, true) !== cwd) deny();
  };
  const checkConversation = async (conversation, ctx, allowDisabled = false) => {
    current(allowDisabled);
    if (!conversation || conversation.id !== 1) deny();
    const agent = await conversation.agent(ctx);
    if (canonical(agent.cwd, true) !== cwd) deny();
    current(allowDisabled);
  };
  const admit = async (conversation, request, ctx, runtime) => {
    current();
    const harness = lifetime.harness;
    if (!harness || conversation?.id !== 1 || (runtime && runtime.conversationId !== 1)) deny();
    // TaskRuntime passes a ConversationHandle without agent(). Read the actual
    // current owner root, not a cached runtime agent or a client-provided handle.
    const root = await harness.conversation(1, ctx);
    await checkConversation(root, ctx);
    await composition.admitInput(root, request, ctx);
    await checkConversation(await harness.conversation(1, ctx), ctx);
  };
  const extension = createDelmWait({ run, actor, admitInput: admit });
  const guarded = { ...extension, tools: extension.tools.map(tool => ({
    ...tool,
    execute: async (args, api, ctx) => {
      const harness = lifetime.harness;
      if (!harness || api.conversationId !== 1) deny();
      await checkConversation(await harness.conversation(1, ctx), ctx);
      const result = await tool.execute(args, { ...api, commit: (fn, txContext) => api.commit(async tx => {
        current();
        const result = await fn(tx);
        current();
        return result;
      }, txContext) }, ctx);
      current();
      return result;
    },
  })) };
  current(true);
  composition.registry.install(guarded);
  composition.extensions.push(guarded);
  const select = async (host, ctx) => {
    // Selection restoration is not execution: disabled roots must remain loadable
    // and retain their tool/reader definitions for a later operator resume.
    current(true);
    if (lifetime.harness !== host) deny();
    const root = await host.conversation(1, ctx);
    await checkConversation(root, ctx, true);
    const agent = await root.agent(ctx);
    if (!agent.extensions.some(extension => extension.name === guarded.name)) {
      current(true);
      await root.configure({ extensions: [...agent.extensions, guarded] }, ctx);
      current(true);
    }
  };
  readers.set('delm.waits', async (host, conversation, ctx) => {
    if (host !== lifetime.harness) deny();
    await checkConversation(conversation, ctx, true);
    const result = await host.snapshot(DelmWaitDoc, 1, ctx);
    current(true);
    return result;
  });
  composition.documentReaders = readers;
  return select;
}
