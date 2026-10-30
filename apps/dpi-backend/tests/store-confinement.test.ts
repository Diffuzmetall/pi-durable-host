import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, stat, symlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join, dirname } from 'node:path';
import { Store } from '../src/store.js';
import { tempStore, faux } from './helpers.js';

for (const kind of ['missing external parent', 'symlink ancestor', 'dangling file symlink']) {
  test(`session create/archive refuse ${kind} before filesystem effects`, async () => {
    const f = await tempStore();
    const store = await f.open();
    try {
      const session = await store.create({ name: 'confined-owner', cwd: f.work, model: faux });
      const original = await store.resolveAgent(session.id, 'main');
      const external = join(f.root, 'outside', 'must-not-exist', 'agent.sqlite');
      let path = external;
      if (kind === 'symlink ancestor') {
        await mkdir(join(f.root, 'outside'));
        const alias = join(store.sessionsDir, 'alias');
        await symlink(join(f.root, 'outside'), alias);
        path = join(alias, 'must-not-exist', 'agent.sqlite');
      } else if (kind === 'dangling file symlink') {
        const alias = join(store.sessionsDir, 'alias', 'agent.sqlite');
        await mkdir(dirname(alias));
        await symlink(external, alias);
        path = alias;
      }
      const foreign = { ...store.resolveSession(session.id), id: randomUUID(), dbPath: path };
      const refused = kind === 'dangling file symlink' ? /ENOENT/ : /ownership directory/;
      await assert.rejects(store.openAgent(foreign, true), refused);
      await assert.rejects(store.archive(foreign), refused);
      await assert.rejects(stat(dirname(external)), { code: 'ENOENT' });
      assert.equal((await store.resolveAgent(session.id, 'main')).h, original.h);
      assert.equal(store.opened.has(foreign.id), false);
      assert.equal(store.catalog.prepare('SELECT profileId FROM session_profiles WHERE sessionId=?').get(foreign.id), undefined);
    } finally {
      await store.close();
      await f.cleanup();
    }
  });
}

test('physical catalog alias keeps the same owned directory for reopen and new sessions', async () => {
  const f = await tempStore();
  let store: Store | undefined;
  try {
    store = await f.open();
    const session = await store.create({ name: 'original-owner', cwd: f.work, model: faux });
    const conversation = (await store.resolveAgent(session.id, 'main')).c.id;
    await store.close(); store = undefined;
    const alias = join(f.root, 'catalog-alias');
    await mkdir(alias);
    await symlink(join(f.options.dataDir, 'catalog.sqlite'), join(alias, 'catalog.sqlite'));
    store = await Store.open({ ...f.options, dataDir: alias });
    assert.equal(store.errors.size, 0);
    assert.equal(store.sessionsDir, join(f.options.dataDir, 'sessions'));
    assert.equal((await store.resolveAgent(session.id, 'main')).c.id, conversation);
    const created = await store.create({ name: 'same-physical-owner', cwd: f.work, model: faux });
    assert.equal(created.dbPath, join(f.options.dataDir, 'sessions', created.id, 'agent.sqlite'));
    assert.equal(store.archiveDir, join(f.options.dataDir, 'archive'));
  } finally {
    await store?.close();
    await f.cleanup();
  }
});
