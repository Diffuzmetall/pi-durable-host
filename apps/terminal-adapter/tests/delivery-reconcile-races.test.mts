import assert from 'node:assert/strict';
import { join } from 'node:path';
import test from 'node:test';
import { DpiClient, type RequestOptions } from 'dpi-sdk/client';
import { bootServer, faux, newToken, tempStore } from '../../dpi-backend/tests/helpers.js';
import { RemoteTerminal } from '../src/remote-controller.js';
import { SubmissionJournal } from '../src/submission-journal.js';

for (const switching of [false, true]) test(`reconcile wait preserves ${switching ? 'original conversation selection' : 'accepted retry identity'}`, async () => {
  const t = await tempStore();
  const token = newToken();
  const backend = await bootServer({ home: join(t.root, 'host'), startDirs: t.work, token });
  let release!: () => void, entered!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const seen = new Promise<void>(resolve => { entered = resolve; });
  let messagePosts = 0;
  class Client extends DpiClient {
    override async request<T>(method: string, path: string, body?: unknown, options?: RequestOptions): Promise<T> {
      if (method === 'POST' && path.endsWith('/messages')) messagePosts++;
      const result = await super.request<T>(method, path, body, options);
      if (method === 'GET' && path.includes('/receipts/')) { entered(); await gate; }
      return result;
    }
  }
  const client = new Client(backend.base, token);
  let terminal: RemoteTerminal | undefined;
  try {
    const session = await client.createSession({ name: 'race', cwd: t.work, model: faux }, 'race-session');
    const child = await client.session(session.id).createAgent({ name: 'other' }, 'other');
    const dir = join(t.root, 'client');
    const journal = await SubmissionJournal.open(dir);
    const item = await journal.begin(1, 'original input', 'steer');
    await client.agent(session.id, 1).send(item.text, item.whenBusy, item.requestId);
    journal.markUncertain(item.requestId);
    terminal = await RemoteTerminal.open(client, session.id, dir);
    await seen;
    const before = messagePosts;
    const submit = terminal.submit(switching ? 'intended for original conversation' : item.text, 'steer');
    // Attach rejection before releasing the gate to avoid an unhandled rejection in the race test.
    const checked = switching ? assert.rejects(submit, /Conversation changed/) : submit;
    if (switching) await terminal.switchConversation(child.id);
    release();
    await checked;
    assert.equal(messagePosts, before, 'no duplicate input and no send into a different conversation');
  } finally { release(); await terminal?.close(); await backend.stop(); await t.cleanup(); }
});
