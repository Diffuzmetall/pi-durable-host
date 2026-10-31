import { mkdir, open } from 'node:fs/promises';

// Only dependency boundaries are replaced. The copied adapter's bind wrapper executes unchanged.
export function createRegistry() {
  const extensions = new Map();
  return {
    install(extension) { extensions.set(extension.name, extension); },
    snapshot() { return { installed: () => extensions.values(), extension: (name) => extensions.get(name) }; },
  };
}
export function createHindsightController(registry) {
  registry.install({ name: 'hindsight' });
  return {
    async bind(host) { this.host = host; this.closed = false; },
    close() { this.closed = true; },
    context() { if (this.closed) throw Error('closed'); return { cwd: this.host.cwd, session: this.host.session }; },
  };
}
export const resolvePiConfig = () => { throw Error('External config forbidden in probe'); };
export const resolveHostMemory = () => { throw Error('External memory forbidden in probe'); };
export const ensurePrivateDirectory = (path) => mkdir(path, { recursive: true, mode: 0o700 });
export async function ensurePrivateFile(path) { const file = await open(path, 'a', 0o600); await file.close(); }
