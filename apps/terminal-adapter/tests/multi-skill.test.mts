import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { DpiClient, type RequestOptions } from 'dpi-sdk/client';
import { nativeAttentionFixture } from '../../dpi-backend/tests/fixtures/terminal-native-attention.js';
import { RemoteTerminal } from '../src/remote-controller.js';

test('multiple actual Host skill bodies freeze before POST and survive uncertain-delivery retry', { timeout: 30000 }, async () => {
  const host = await nativeAttentionFixture();
  let terminal: RemoteTerminal | undefined;
  class RecordingClient extends DpiClient {
    fail = false;
    reads = 0;
    posts: { requestId: string; content: string }[] = [];
    override async request<T>(method: string, path: string, body?: unknown, options?: RequestOptions): Promise<T> {
      if (method === 'GET' && /\/skills\/[^/]+$/.test(path)) this.reads++;
      if (method === 'POST' && path.endsWith('/messages')) {
        const value = body as { requestId: string; content: string };
        this.posts.push({ requestId: value.requestId, content: value.content });
        if (this.fail) { this.fail = false; throw Error('uncertain multi-skill transport'); }
      }
      return super.request<T>(method, path, body, options);
    }
  }
  try {
    const second = join(host.root, 'agent/skills/second');
    await mkdir(second, { recursive: true });
    await writeFile(join(second, 'SKILL.md'), '---\nname: second\ndescription: Second disposable skill\n---\nSECOND_REMOTE_BODY\n');
    await host.reopen();
    const client = new RecordingClient(host.base, host.token);
    const cache = join(host.root, 'multi-skills-client');
    terminal = await RemoteTerminal.open(client, host.sessionId, cache);
    client.fail = true;
    const text = 'Use /skill:terminal-fixture and /skill:second /skill:terminal-fixture together';
    await assert.rejects(() => terminal!.submit(text, 'steer'), /uncertain multi-skill/);
    assert.equal(client.reads, 2);
    assert.match(client.posts[0].content, /ORIGINAL_REMOTE_SKILL_BODY[\s\S]*SECOND_REMOTE_BODY/);
    assert.equal((client.posts[0].content.match(/<skill name=/g) ?? []).length, 2);
    await terminal.close(); terminal = undefined;
    await host.setSkill('CHANGED_BODY_MUST_NOT_REPLACE_RETRY');
    await host.reopen();
    const next = new RecordingClient(host.base, host.token);
    terminal = await RemoteTerminal.open(next, host.sessionId, cache);
    await terminal.submit(text, 'steer');
    assert.deepEqual(next.posts[0], client.posts[0]);
    assert.equal(next.reads, 0);
    await assert.rejects(() => terminal!.submit('/skill:terminal-fixture /skill:unknown do not send', 'followUp'));
    assert.equal(next.posts.length, 1, 'Missing second body prevents partial dispatch');
  } finally { await terminal?.close(); await host.close(); }
});
