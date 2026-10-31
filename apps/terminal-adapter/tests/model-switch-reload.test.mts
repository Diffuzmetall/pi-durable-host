import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { DpiClient, type RequestOptions } from 'dpi-sdk/client';
import { nativeAttentionFixture } from '../../dpi-backend/tests/fixtures/terminal-native-attention.js';
import { RemoteTerminal } from '../src/remote-controller.js';
import { createModelSwitch, loadModelSwitch } from '../src/ui/experimental/durable/model-switch.mjs';
import { matchesKey } from '@earendil-works/pi-tui';

test('existing model-switch instance rereads config and keybindings without runtime restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'model-switch-reload-'));
  await mkdir(join(directory, 'configs'));
  const previous = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = directory;
  try {
    const config = join(directory, 'configs/model-switch.json');
    await writeFile(config, JSON.stringify({ sections: { first: ['p/a', 'p/b'] } }));
    let model = { provider: 'p', modelId: 'a' };
    const adapter = createModelSwitch(await loadModelSwitch(), {
      snapshot: () => ({ conversationId: 1, model, models: ['a', 'b', 'c'].map(modelId => ({ provider: 'p', modelId })) }),
      setModel: async (value: { provider: string; modelId: string }) => { model = value; }, matchesKey,
      ui: { notify: (message: string) => assert.fail(message) },
    });
    assert.equal(adapter.shortcut('\x1b[109;6u'), true);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(model.modelId, 'b');
    await writeFile(config, JSON.stringify({ sections: { changed: ['p/b', 'p/c'] } }));
    await writeFile(join(directory, 'keybindings.json'), JSON.stringify({ 'model-switch.cycleForward': 'alt+j' }));
    assert.equal(adapter.shortcut('\x1b[109;6u'), false);
    assert.equal(adapter.shortcut('\x1bj'), true);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(model.modelId, 'c');
  } finally {
    if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previous;
  }
});

test('client reload refreshes real Host skill metadata without reopening owner or sending input', { timeout: 30000 }, async () => {
  const host = await nativeAttentionFixture();
  let terminal: RemoteTerminal | undefined;
  try {
    terminal = await RemoteTerminal.open(new DpiClient(host.base, host.token), host.sessionId, join(host.root, 'reload-client'));
    assert(!terminal.current().skills?.some(skill => skill.name === 'hot-added'));
    const path = join(host.root, 'agent/skills/hot-added');
    await mkdir(path, { recursive: true });
    await writeFile(join(path, 'SKILL.md'), '---\nname: hot-added\ndescription: Hot added fixture\n---\nHOT_BODY\n');
    await terminal.reload();
    assert(terminal.current().skills?.some(skill => skill.name === 'hot-added'));
    await assert.rejects(() => terminal!.reload('/untrusted/adapter'), /cannot admit/);
    assert.equal(host.modelCalls, 0);
  } finally { await terminal?.close(); await host.close(); }
});

test('conversation reselection during skill loading refuses the whole input even when ID returns unchanged', { timeout: 30000 }, async () => {
  const host = await nativeAttentionFixture();
  let terminal: RemoteTerminal | undefined;
  let release!: () => void;
  let started!: () => void;
  const loading = new Promise<void>(resolve => { started = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; });
  class PausedClient extends DpiClient {
    posts = 0;
    override async request<T>(method: string, path: string, body?: unknown, options?: RequestOptions): Promise<T> {
      if (method === 'GET' && path.endsWith('/skills/terminal-fixture')) { started(); await gate; }
      if (method === 'POST' && path.endsWith('/messages')) this.posts++;
      return super.request<T>(method, path, body, options);
    }
  }
  try {
    const client = new PausedClient(host.base, host.token);
    terminal = await RemoteTerminal.open(client, host.sessionId, join(host.root, 'selection-client'));
    const send = terminal.submit('/skill:terminal-fixture stay scoped', 'steer');
    const refused = assert.rejects(send, /Conversation changed/);
    await loading;
    await terminal.switchConversation(1);
    release();
    await refused;
    assert.equal(client.posts, 0);
    assert.equal(host.modelCalls, 0);
  } finally { release?.(); await terminal?.close(); await host.close(); }
});
