import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { DurableTui } from '../src/ui/experimental/durable/tui.ts';
import { initTheme } from '../src/ui/modes/interactive/theme/theme.ts';
import { SubmitDeliveryError, type DurableView } from '../src/types.js';

const noop = () => {};
const base = (directory: string): DurableView => ({
  session: { id: 'fixture', directory, cwd: directory, name: 'fixture' },
  conversation: { conversation: { id: 1 }, entries: [], docs: {} }, conversations: [], models: [], notices: [],
  automation: { scheduled: 0, failed: 0 }, connection: 'online', delivery: { uncertainRequestIds: ['request'] },
});

test('only exact reconciled transient submit restores the actual editor; dialogs and older sources stay intact', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'eve-submit-ui-'));
  const previous = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = directory;
  initTheme();
  const tui = new DurableTui(directory, directory, {
    submit: noop, followUp: noop, abort: noop, openAgent: noop, selectModel: noop, cycleThinking: noop,
  });
  try {
    const view = base(directory);
    tui.apply(view);
    const editor = tui.ui.getFocusedComponent();
    tui.showInputError('draft', new SubmitDeliveryError('fixture', 1, 'request'));
    const transient = tui.ui.getFocusedComponent();
    assert.notEqual(transient, editor);
    tui.apply({ ...view, connection: 'reconnecting', delivery: { uncertainRequestIds: [] } });
    assert.equal(tui.ui.getFocusedComponent(), transient, 'offline snapshot is not authoritative readiness');
    tui.apply({ ...view, delivery: undefined });
    assert.equal(tui.ui.getFocusedComponent(), transient, 'older sources do not imply reconciliation');
    tui.apply(view);
    assert.equal(tui.ui.getFocusedComponent(), transient, 'online alone does not release the exact request');
    tui.apply({ ...view, delivery: { uncertainRequestIds: [] } });
    assert.equal(tui.ui.getFocusedComponent(), editor);
    tui.showInputError('draft', new SubmitDeliveryError('fixture', 1, 'request'));
    const dialog = { render: () => ['Confirm real attention'], invalidate: noop };
    tui.mount(dialog, 'Confirm real attention');
    tui.apply({ ...view, delivery: { uncertainRequestIds: [] }, attention: { requests: [{ id: 'attention', child: 2, name: 'Question', reason: 'need_decision', message: 'Confirm?' }] } });
    assert.equal(tui.ui.getFocusedComponent(), dialog, 'reconnect cannot dismiss a real dialog');
    tui.restoreEditor();
    tui.showInputError('draft', Error('unsupported capability'));
    const permanent = tui.ui.getFocusedComponent();
    tui.apply({ ...view, delivery: { uncertainRequestIds: [] } });
    assert.equal(tui.ui.getFocusedComponent(), permanent, 'validation errors remain explicit');
    tui.restoreEditor();
    const other = { ...view, conversation: { ...view.conversation, conversation: { id: 2 } } };
    tui.apply(other);
    tui.showInputError('old draft', new SubmitDeliveryError('fixture', 1, 'request'));
    assert.equal(tui.ui.getFocusedComponent(), editor, 'late old-conversation failure never replaces current editor');
  } finally {
    tui.stop();
    if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = previous;
    await rm(directory, { recursive: true, force: true });
  }
});
