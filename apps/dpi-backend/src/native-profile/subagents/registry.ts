import { createRegistry, type RegistryReader } from '@earendil-works/pi-durable';
import { createSubagent, type SubagentOptions, type SubagentAdmission } from './index.js';

/** Host composition only: replace the owner, retain every other extension object (and its guards). */
export default function installSubagents(base: RegistryReader, admit: SubagentAdmission, options: Pick<SubagentOptions, 'resolveModel' | 'origin'> = {}): RegistryReader {
  if (typeof admit !== 'function') throw new Error('Background subagents require a trusted host admission callback');
  const snapshot = base.snapshot();
  const registry = createRegistry();
  for (const extension of snapshot.installed()) {
    if (extension.name !== 'subagent') registry.install(extension);
  }
  const available = new Set(snapshot.tools().map(({ tool }) => tool.name));
  const present = (names: string[]) => names.filter(name => available.has(name));
  registry.install(createSubagent(admit, {
    ...options, maxActive: 20,
    roles: { worker: 'inherit', reviewer: present(['read']) },
  }));
  return registry;
}
