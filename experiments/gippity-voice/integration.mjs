import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context';
import {
  ComponentCapabilities, parseComponentPackage, prepareComponents,
  audioLeaseCapability, nativeWebRtcAudioCapability, nodeExecutionCapability,
  modelsCapability, networkCapability, stateCapability,
} from '@howaboua/pi-durable-components';
import * as gippity from '@howaboua/pi-durable-gippity-voice';
import { loadFreshModule } from 'dpi-backend/native-profile';
import {
  gippityVoiceOptions, gippityVoiceTarget,
} from '@howaboua/pi-durable-gippity-voice/component';

/** One rejecting owner per Host process; no waiter can release another owner's audio. */
export function createAudioLease() {
  let current;
  const waiters = new Set();
  return {
    get busy() { return current !== undefined; },
    get snapshot() { return current?.snapshot; },
    async whenIdle(context) {
      const signal = context.abortSignal;
      signal?.throwIfAborted();
      if (!current) return;
      await new Promise((resolve, reject) => {
        const done = () => { waiters.delete(done); signal?.removeEventListener('abort', abort); resolve(); };
        const abort = () => { waiters.delete(done); reject(signal.reason); };
        waiters.add(done);
        signal?.addEventListener('abort', abort, { once: true });
      });
    },
    async acquire(request, signal) {
      signal.throwIfAborted();
      if (current) throw Error('Audio is already owned by another voice or dictation operation');
      const owner = { ...request };
      current = owner;
      let released = false;
      return { async release() {
        if (released) return;
        released = true;
        if (current === owner) {
          current = undefined;
          for (const done of [...waiters]) done();
        }
      } };
    },
  };
}
const applicationAudioLease = createAudioLease();

async function installedPackage(name) {
  let directory = dirname(fileURLToPath(import.meta.resolve(name === '@modelcontextprotocol/sdk' ? `${name}/client/index.js` : name)));
  while (directory !== dirname(directory)) {
    const metadata = await readFile(join(directory, 'package.json'), 'utf8').catch(error => {
      if (error.code !== 'ENOENT') throw error;
    });
    if (metadata) {
      const manifest = JSON.parse(metadata);
      if (manifest.name === name) return { directory, manifest };
    }
    directory = dirname(directory);
  }
  throw Error(`Installed package metadata unavailable: ${name}`);
}

/** Called by the existing operational profile, before its one Harness opens. */
export async function attachGippity(composition, runtime, config) {
  if (runtime.sessionId !== config.sessionId || runtime.offline) return composition;
  if (!runtime.models || !composition.env || config.conversationId !== 1 ||
      config.bind !== '127.0.0.1' || !Number.isInteger(config.port) || config.port < 1024 || config.port > 65535)
    throw Error('GipPity requires an explicit root target, Models and loopback listener');
  const origin = new URL(config.origin);
  if (origin.protocol !== 'https:' || origin.origin !== config.origin ||
      !origin.hostname.endsWith('.ts.net') || origin.username || origin.password)
    throw Error('GipPity requires an exact tailnet HTTPS origin');
  const context = BACKGROUND_CONTEXT;
  const env = await composition.env({ cwd: runtime.cwd }, context);
  const namespace = env.id;
  const pkg = await installedPackage('@howaboua/pi-durable-gippity-voice');
  const peers = {};
  for (const name of Object.keys(pkg.manifest.peerDependencies))
    peers[name] = (await installedPackage(name)).manifest.version;
  const helper = join(pkg.directory, 'dist/voice/bin', `${process.platform}-${process.arch}`,
    process.platform === 'win32' ? 'pi-codex-voice.exe' : 'pi-codex-voice');
  const audioEnv = { HOME: config.audioHome, PATH: '/usr/bin:/bin' };
  const audioOptions = { namespace, executable: helper, cwd: runtime.cwd, env: audioEnv };
  // The Component, native service and audio lease remain the same lifetime owners.
  // Only a resource-free launch factory changes; existing helpers retain their own closures.
  const prepareAudio = () => {
    const factory = loadFreshModule(fileURLToPath(new URL('./audio-host.mjs', import.meta.url)));
    const host = factory.createAudioHost(audioOptions, gippity.createNativeGippityAudioHost);
    if (host?.namespace !== namespace || typeof host.launch !== 'function') throw Error('GIPPITY_AUDIO_FACTORY_INVALID');
    return host;
  };
  let currentAudio = prepareAudio();
  let closing = false;
  const lease = {
    acquire: (request, signal) => applicationAudioLease.acquire({ ...request, snapshot: currentAudio }, signal),
    whenIdle: context => applicationAudioLease.whenIdle(context),
  };
  const audio = { namespace, launch: (...args) => (applicationAudioLease.snapshot ?? currentAudio).launch(...args) };
  const prepareReload = composition.prepareReload?.bind(composition);
  composition.prepareReload = async (...args) => {
    if (closing) throw Error('GIPPITY_CLOSED');
    const previousAudio = currentAudio;
    const next = prepareAudio();
    const candidate = await prepareReload?.(...args);
    return { ...candidate, validate() {
      candidate?.validate?.();
      if (closing || currentAudio !== previousAudio) throw Error('GIPPITY_AUDIO_RELOAD_STALE');
    }, publish() {
      candidate?.publish?.();
      currentAudio = next;
    } };
  };
  const voiceConfig = { voice: { model: 'codex-live-1.1', autoResumeRealtime: false, refreshRealtimeAfterCompaction: false } };
  const settingsDirectory = join(runtime.directory, 'components', 'gippity-voice');
  const settingsFile = join(settingsDirectory, 'settings.json');
  const capabilities = new ComponentCapabilities()
    .provide(audioLeaseCapability, lease)
    .provide(nativeWebRtcAudioCapability, { environmentId: namespace, launch: audio.launch })
    .provide(nodeExecutionCapability, { environmentId: namespace, env: audioEnv, defaultShell: '/bin/sh' })
    .provide(modelsCapability, runtime.models.models)
    .provide(networkCapability, { fetch, nativeSockets: { environmentId: namespace } })
    .provide(stateCapability, { directory(name) {
      if (!/^[a-z0-9.-]+$/.test(name)) throw Error('Invalid component state namespace');
      return join(runtime.directory, 'components', name);
    } })
    .provide(gippityVoiceTarget, config.conversationId)
    .provide(gippityVoiceOptions, {
      namespace, audio, lease,
      instructions: 'Use browser dictation to prepare an editable command. Submit to this Durable conversation only after the user presses Send. The user authorizes conversation context summaries for the voice assistant.',
      allowContextSummary: true,
      config: voiceConfig,
      // Advanced component options bypass baselineOptions, including its settings store.
      settings: {
        async read() {
          const text = await readFile(settingsFile, 'utf8').catch(error => {
            if (error.code !== 'ENOENT') throw error;
          });
          return text === undefined ? voiceConfig : JSON.parse(text);
        },
        async write(value) {
          await mkdir(settingsDirectory, { recursive: true, mode: 0o700 });
          await writeFile(`${settingsFile}.tmp`, JSON.stringify(value) + '\n', { mode: 0o600 });
          await rename(`${settingsFile}.tmp`, settingsFile);
        },
      },
      lan: {
        namespace, bind: config.bind, port: config.port, origins: [config.origin],
        key: await readFile(config.keyFile), cert: await readFile(config.certFile),
      },
    });
  const prepared = await prepareComponents([{
    manifest: parseComponentPackage(pkg.manifest),
    load: () => import('@howaboua/pi-durable-gippity-voice/component'),
  }], {
    capabilities, compatibility: { runtime: 'node', peers },
    // Retain this Component/kernel during callback reload; never retire/cancel accepted work.
    whenIdle: context => lease.whenIdle(context),
    existing: { extensions: composition.extensions, providers: [] },
  }, context);
  const bind = composition.bind?.bind(composition);
  const shutdown = composition.shutdown?.bind(composition);
  const cleanup = composition.cleanup?.bind(composition);
  const status = value => writeFile(config.statusFile, JSON.stringify({
    component: pkg.manifest.name, version: pkg.manifest.version,
    sessionId: config.sessionId, conversationId: config.conversationId,
    origin: config.origin, ...value,
  }, null, 2) + '\n', { mode: 0o600 });
  // Publish lifecycle ownership before compatibility/registry operations can fail.
  // The outer factory rolls these hooks back if attach never returns to Store.
  composition.shutdown = async ctx => {
    closing = true;
    const errors = [];
    try { await prepared.closeBeforeHarness(ctx); } catch (error) { errors.push(error); }
    try { await shutdown?.(ctx); } catch (error) { errors.push(error); }
    if (errors.length === 1) throw errors[0];
    if (errors.length) throw new AggregateError(errors, 'GipPity shutdown failed');
  };
  composition.cleanup = async ctx => {
    const errors = [];
    try { await prepared.closeAfterHarness(ctx); } catch (error) { errors.push(error); }
    try { await cleanup?.(ctx); } catch (error) { errors.push(error); }
    try { await status({ phase: 'closed', sdk: prepared.status }); } catch (error) { errors.push(error); }
    if (errors.length === 1) throw errors[0];
    if (errors.length) throw new AggregateError(errors, 'GipPity cleanup failed');
  };
  if (prepared.skipped.length || prepared.instances.length !== 1)
    throw Error(`GipPity compatibility rejected: ${prepared.skipped.flatMap(item => item.reasons).join('; ')}`);
  for (const extension of prepared.extensions) {
    composition.registry.install(extension);
  }
  const api = prepared.instances[0].instance.api;
  composition.bind = async (harness, ctx, storage) => {
    if (!storage) throw Error('GipPity requires the existing Harness storage');
    await bind?.(harness, ctx, storage);
    await prepared.bind({ harness, storage }, ctx);
    const readiness = await gippity.checkGippityDictationReadiness({ models: runtime.models.models, signal: AbortSignal.timeout(15_000) });
    await api.controls.startLan(ctx);
    await status({ phase: 'listening', sdk: prepared.status, readiness, ...api.controls.lanStatus() });
  };
  return composition;
}
