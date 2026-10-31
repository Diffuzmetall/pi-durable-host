import assert from 'node:assert/strict';
import { join } from 'node:path';

/** Exact authorized release/binding transition, including a same-release reload. */
export function nextUnit(previous, { currentService, base, release, bindings }) {
  const target = join(release, 'operational-service.mjs');
  assert([join(base, 'operational-service.mjs'), target].includes(currentService), 'Unexpected service owner');
  const text = previous.toString();
  assert(text.includes(currentService) && text.includes('[Service]\n'), 'Unexpected service unit');
  const environment = `Environment=DELM_BINDINGS_FILE=${bindings}`;
  const existing = text.split('\n').filter(line => line.includes('DELM_BINDINGS_FILE='));
  assert(existing.length === 0 || (existing.length === 1 && existing[0] === environment), 'Different or ambiguous binding environment');
  return Buffer.from(text.replace(currentService, target)
    .replace('[Service]\n', `[Service]\n${existing.length ? '' : environment + '\n'}`));
}
