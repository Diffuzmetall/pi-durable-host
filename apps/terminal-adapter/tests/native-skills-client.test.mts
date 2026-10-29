import assert from 'node:assert/strict';
import { join } from 'node:path';
import test from 'node:test';
import { DpiClient, type RequestOptions } from 'dpi-sdk/client';
import { nativeAttentionFixture } from '../../dpi-backend/tests/fixtures/terminal-native-attention.js';
import { until } from '../../dpi-backend/tests/helpers.js';
import { RemoteTerminal } from '../src/remote-controller.js';

class SkillClient extends DpiClient {
  failBeforeSend = false;
  bodies = 0;
  posts: { requestId: string; content: string }[] = [];
  override async request<T>(method: string, path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    if (path.endsWith('/skills/terminal-fixture')) this.bodies++;
    if (method === 'POST' && path.endsWith('/messages')) {
      assert(body && typeof body === 'object' && 'requestId' in body && typeof body.requestId === 'string' && 'content' in body && typeof body.content === 'string');
      this.posts.push({ requestId: body.requestId, content: body.content });
      if (this.failBeforeSend) { this.failBeforeSend = false; throw Error('Uncertain skill transport'); }
    }
    return super.request<T>(method, path, body, options);
  }
}

test('real server skill body freezes before POST; explicit retry after viewer/owner reopen retains body/key despite renamed contents', { timeout: 30000 }, async () => {
  const host = await nativeAttentionFixture();
  let terminal: RemoteTerminal | undefined;
  try {
    const denied = new SkillClient(host.base, host.noFsToken);
    const viewer = await RemoteTerminal.open(denied, host.sessionId, join(host.root, 'no-fs-client'));
    try {
      await assert.rejects(() => viewer.submit('/skill:terminal-fixture forbidden', 'steer'));
      assert.equal(denied.posts.length, 0, 'Actual no-filesystem grant cannot turn a denied body lookup into model input');
    } finally { await viewer.close(); }
    const cache = join(host.root, 'skills-client');
    const first = new SkillClient(host.base, host.token);
    terminal = await RemoteTerminal.open(first, host.sessionId, cache);
    assert(terminal.current().skills?.some(skill => skill.name === 'terminal-fixture'));
    assert(terminal.current().skills?.every(skill => !('content' in skill)), 'Catalogue never downloads private bodies');
    first.failBeforeSend = true;
    await assert.rejects(() => terminal!.submit('/skill:terminal-fixture carry on', 'steer'), /Uncertain skill transport/);
    assert.equal(first.bodies, 1);
    assert.match(first.posts[0].content, /ORIGINAL_REMOTE_SKILL_BODY/);
    assert.match(first.posts[0].content, /<\/skill>\n\ncarry on$/);
    await terminal.close(); terminal = undefined;
    await host.setSkill('CHANGED_REMOTE_SKILL_BODY');
    await host.reopen();
    const next = new SkillClient(host.base, host.token);
    terminal = await RemoteTerminal.open(next, host.sessionId, cache);
    assert.equal(next.posts.length, 0, 'Reopen only reads receipts/metadata');
    await terminal.submit('/skill:terminal-fixture carry on', 'steer');
    assert.deepEqual(next.posts[0], first.posts[0]);
    assert.equal(next.bodies, 0, 'Explicit retry uses already authorized frozen body, not changed source');
    await terminal.submit('/skill:terminal-fixture new intent', 'followUp');
    assert.equal(next.bodies, 1);
    assert.match(next.posts[1].content, /CHANGED_REMOTE_SKILL_BODY/);
    assert.notEqual(next.posts[1].requestId, next.posts[0].requestId);
    await until(async () => (await next.agent(host.sessionId, 1).entries({ scope: 'all' })).items.filter(entry => entry.kind === 'host.input').length === 2, 10000, 'Exactly two actual native inputs');
    await assert.rejects(() => terminal!.submit('/skill:not-configured ignored', 'steer'));
    assert.equal(next.posts.length, 2, 'Missing skill never becomes model input');
  } finally { await terminal?.close(); await host.close(); }
});

test('scoped model wire is selected instead of global metadata; a scoped lookup failure never falls back (recording metadata only)', async () => {
  const host = await nativeAttentionFixture();
  let terminal: RemoteTerminal | undefined;
  class ScopedClient extends DpiClient {
    fail = false;
    override async protocol() {
      const value = await super.protocol();
      return { ...value, capabilities: [...value.capabilities, 'scoped-models.v1'] };
    }
    override async device() {
      const value = await super.device();
      return { ...value, capabilities: [...value.capabilities, 'scoped-models.v1'], models: value.models.map(model => ({ ...model, id: 'wrong-global' })) };
    }
    override async request<T>(method: string, path: string, body?: unknown, options?: RequestOptions): Promise<T> {
      if (path.endsWith('/models') && this.fail) throw Error('Scoped catalogue unavailable');
      const value = await super.request<T>(method, path, body, options);
      if (path.endsWith('/models')) {
        assert(Array.isArray(value));
        return [...value, { ...value[0], id: 'unavailable-model', available: false }] as T;
      }
      return value;
    }
  }
  try {
    const client = new ScopedClient(host.base, host.token);
    terminal = await RemoteTerminal.open(client, host.sessionId, join(host.root, 'scoped-client'));
    assert(terminal.current().models.some(model => model.modelId === 'echo'));
    assert(!terminal.current().models.some(model => model.modelId === 'wrong-global'));
    assert(!terminal.current().models.some(model => model.modelId === 'unavailable-model'));
    await terminal.close(); terminal = undefined;
    client.fail = true;
    await assert.rejects(() => RemoteTerminal.open(client, host.sessionId, join(host.root, 'failed-scoped')), /Scoped catalogue unavailable/);
    class OlderSdk extends DpiClient {
      override session(id: string) {
        return new Proxy(super.session(id), { get(target, key, receiver) { return key === 'skills' ? undefined : Reflect.get(target, key, receiver); } });
      }
    }
    await assert.rejects(() => RemoteTerminal.open(new OlderSdk(host.base, host.token), host.sessionId, join(host.root, 'old-skills-sdk')), /Installed SDK lacks native skills/);
    assert.equal(host.modelCalls, 0);
  } finally { await terminal?.close(); await host.close(); }
});
