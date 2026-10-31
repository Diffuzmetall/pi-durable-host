import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { nativeAttentionFixture } from '../../apps/dpi-backend/tests/fixtures/terminal-native-attention.ts';
import { DpiClient } from '../../apps/dpi-sdk/src/client.ts';
const root = process.env.LAUNCHER_PROBE_ROOT;
if (!root) throw Error('Disposable probe root required');
const fixture = await nativeAttentionFixture();
try {
  const second = join(fixture.root, 'agent/skills/second');
  await mkdir(second, { recursive: true });
  await writeFile(join(second, 'SKILL.md'), '---\nname: second\ndescription: Second remote skill\n---\nSECOND_LAUNCHER_BODY\n');
  const client = new DpiClient(fixture.base, fixture.token);
  const session = await client.session(fixture.sessionId).get();
  await writeFile(join(root, 'ready.json'), JSON.stringify({ base: fixture.base, token: fixture.token, sessionId: fixture.sessionId, cwd: session.cwd, fixtureRoot: fixture.root }), { mode: 0o600 });
  await new Promise(resolve => { process.once('SIGTERM', resolve); process.once('SIGINT', resolve); });
  await writeFile(join(root, 'host-result.json'), JSON.stringify({ localFauxCalls: fixture.modelCalls, externalCalls: 0 }));
} finally { await fixture.close(); }
