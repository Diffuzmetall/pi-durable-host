import assert from 'node:assert/strict';
import { mkdtemp, mkdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { DpiClient, type RequestOptions } from 'dpi-sdk/client';
import { DpiError } from 'dpi-sdk/errors';
import type { ReloadResult } from 'dpi-sdk/api';
import { nativeAttentionFixture } from '../../dpi-backend/tests/fixtures/terminal-native-attention.js';
import { RemoteTerminal } from '../src/remote-controller.js';
import { EditorDrafts } from '../src/draft.js';

test('reload result stays accurate on applied, deferred, rejected, maintenance, ACK loss and menu read failure', { timeout: 30000 }, async () => {
  const host = await nativeAttentionFixture();
  let terminal: RemoteTerminal | undefined;
  class ControlledClient extends DpiClient {
    failure?: DpiError;
    failMenu = false;
    cleanupFailed = false;
    posts = 0;
    override async request<T>(method: string, path: string, body?: unknown, options?: RequestOptions): Promise<T> {
      if (method === 'POST' && path.endsWith('/reload')) {
        this.posts++;
        if (this.failure) throw this.failure;
      }
      if (this.failMenu && method === 'GET' && path.endsWith('/skills')) throw new DpiError('offline', 'Fixture menu offline');
      if (this.cleanupFailed && method === 'POST' && path.endsWith('/reload')) {
        const result = await super.request<ReloadResult>(method, path, body, options);
        return { ...result, cleanup: 'failed' } as T;
      }
      return super.request<T>(method, path, body, options);
    }
  }
  try {
    const client = new ControlledClient(host.base, host.token);
    terminal = await RemoteTerminal.open(client, host.sessionId, join(host.root, 'reload-result'));
    const directory = join(host.root, 'agent/skills/hot-result');
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, 'SKILL.md'), '---\nname: hot-result\ndescription: Hot menu fixture\n---\nBODY\n');
    await terminal.reload();
    assert(terminal.current().skills?.some(skill => skill.name === 'hot-result'));
    assert.match(terminal.current().notices.at(-1)!.message, /^Reload applied: \d+ models, \d+ extensions\./);
    assert.equal(terminal.current().notices.at(-1)!.level, 'info', 'old server without cleanup retains its outcome');
    client.cleanupFailed = true;
    const beforeCleanup = client.posts;
    await terminal.reload();
    assert.equal(client.posts, beforeCleanup + 1, 'cleanup failure never retries the applied mutation');
    const cleanupNotice = terminal.current().notices.at(-1)!;
    assert.equal(cleanupNotice.level, 'warning');
    assert.equal(cleanupNotice.transient, false, 'resource cleanup warning survives later user input');
    assert.match(cleanupNotice.message, /^Reload applied:.*Resource cleanup failed/);
    assert.match(cleanupNotice.message, /No rollback was performed/);
    assert.match(cleanupNotice.message, /no automatic retry/);
    client.cleanupFailed = false;
    for (const [error, label] of [
      [new DpiError('busy', 'Another reload is in progress', 409), 'deferred (not queued)'],
      [new DpiError('unavailable', 'Candidate preparation failed', 503), 'rejected'],
      [new DpiError('unavailable', 'maintenance-required: incompatible schema', 503), 'maintenance-required'],
      [new DpiError('offline', 'Lost reload ACK'), 'unconfirmed'],
    ] as const) {
      client.failure = error;
      const count = client.posts;
      await assert.rejects(terminal.reload(), value => value === error);
      assert.equal(client.posts, count + 1, 'no automatic retry after any failure');
      assert(terminal.current().notices.at(-1)!.message.startsWith(`Reload ${label}:`));
      assert(terminal.current().notices.at(-1)!.message.includes(error.message));
    }
    client.failure = undefined;
    client.failMenu = true;
    const previous = terminal.current().skills;
    await terminal.reload();
    assert.equal(terminal.current().skills, previous);
    assert.match(terminal.current().notices.at(-1)!.message, /^Reload applied, but terminal catalogue refresh failed/);
    client.cleanupFailed = true;
    await terminal.reload();
    assert.match(terminal.current().notices.at(-2)!.message, /Resource cleanup failed/);
    assert.equal(terminal.current().notices.at(-2)!.level, 'warning');
    assert.match(terminal.current().notices.at(-1)!.message, /catalogue refresh failed/);
    assert.equal(host.modelCalls, 0);
    await assert.rejects(terminal.reload('/untrusted'), /cannot admit/);
  } finally { await terminal?.close(); await host.close(); }
});

test('presentation checkpoints restore exact unsent text by conversation and session, never submissions', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'editor-checkpoint-'));
  const drafts = new EditorDrafts(directory);
  const draft = 'Unsent multiline\nЮникод $skill and whitespace  ';
  drafts.write(1, draft);
  drafts.write(2, 'other conversation');
  assert.equal(new EditorDrafts(directory).read(1), draft);
  assert.equal(drafts.read(2), 'other conversation');
  assert.equal(drafts.read(3), '');
  assert.equal(new EditorDrafts(join(directory, 'another-session')).read(1), '');
  assert.equal((await stat(join(directory, 'editor-1.draft'))).mode & 0o777, 0o600);
  drafts.write(1, '');
  assert.equal(new EditorDrafts(directory).read(1), '');
  assert.throws(() => drafts.write(-1, 'invalid'), /Invalid draft conversation/);
});
