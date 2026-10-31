// Disposable real host for the PTY probe. No live providers or external integrations.
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DpiClient } from '../../dpi-sdk/src/client.ts';
import { bootServer, faux } from '../../dpi-backend/tests/helpers.ts';

const root = process.env.TERMINAL_PROBE_ROOT;
const token = process.env.DPI_TOKEN;
if (!root || !token) throw Error('Use the isolated terminal probe');
let stop;
const stopped = new Promise((resolve) => { stop = resolve; });
process.once('SIGTERM', stop);
process.once('SIGINT', stop);
let host;
try {
  const work = join(root, 'work');
  await mkdir(work, { recursive: true });
  host = await bootServer({ home: join(root, 'host'), startDirs: work, token });
  const client = new DpiClient(host.base, token);
  const session = await client.createSession({ name: 'remote-tui-test', cwd: work, model: faux }, 'pty-main-session');
  await client.agent(session.id, 'main').send('REMOTE_ROOT_TRANSCRIPT', 'followUp', 'pty-root-seed', 15000);
  const child = await client.session(session.id).createAgent({ name: 'remote child' }, 'pty-child');
  await client.agent(session.id, child.id).send('REMOTE_CHILD_TRANSCRIPT', 'followUp', 'pty-child-seed', 15000);
  const other = await client.createSession({ name: 'resume-target', cwd: work, model: faux }, 'pty-other-session');
  await client.agent(other.id, 'main').send('REMOTE_RESUMED_TRANSCRIPT', 'followUp', 'pty-other-seed', 15000);
  await writeFile(join(root, 'ready.json'), JSON.stringify({ base: host.base, sessionId: session.id, childId: child.id, otherId: other.id }), { flag: 'wx', mode: 0o600 });
  console.log('HOST_READY');
  await stopped;
} finally {
  await host?.stop();
  if (host?.output().includes(token)) throw Error('Credential sentinel found in host output');
}
