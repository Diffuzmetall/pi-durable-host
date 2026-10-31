import assert from 'node:assert/strict';
import test from 'node:test';
import { stripVTControlCharacters } from 'node:util';
import { visibleWidth } from '@earendil-works/pi-tui';
import { externalDirectoriesView } from '../src/external-directories.js';
import { TerminalProjection } from '../src/projection.js';
import { renderExternalDirectories } from '../src/ui/experimental/durable/external-directories.js';

const directories = ['pi-durable-host', 'pi-durable-delm', 'delm-runs'].map(label => ({ label, absolutePath: `/fixture/${label}` }));
const theme = { fg: (_color: string, text: string) => text };

test('directory row matches the screenshot and stays directly one line', () => {
  assert.deepEqual(renderExternalDirectories(directories, 140, theme), [
    '📂 3 external dirs │ pi-durable-host, pi-durable-delm, delm-runs (/dirs to manage)',
  ]);
  assert.match(renderExternalDirectories(directories.slice(0, 1), 140, theme)[0], /1 external dir │/);
  assert.deepEqual(renderExternalDirectories([], 140, theme), []);
  assert.deepEqual(renderExternalDirectories(undefined, 140, theme), []);
  assert.deepEqual(renderExternalDirectories(directories, 0, theme), []);
});

test('row fits narrow terminals, Unicode names and malicious terminal control sequences', () => {
  const data = [{ label: '\x1b[31mкомпонент\x1b[0m\n\t🔧', absolutePath: '/fixture/unicode' }, ...directories];
  for (let width = 1; width <= 140; width++) {
    const [line] = renderExternalDirectories(data, width, theme);
    assert(visibleWidth(line) <= width, `row exceeded ${width} cells`);
    assert(!/[\x00-\x1f\x7f]/.test(stripVTControlCharacters(line)));
    assert(!line.includes('\x1b[31m'), 'untrusted names cannot inject colors');
  }
  assert.match(renderExternalDirectories(directories, 55, theme)[0], /….*\(\/dirs to manage\)$/);
});

test('wire projection validates the scoped document and clears stale state on removal/malformed updates', () => {
  const view = new TerminalProjection();
  view.apply({ type: 'doc', kind: 'pi.external-directories', value: { directories } });
  assert.deepEqual(view.externalDirectories, directories);
  view.apply({ type: 'doc', kind: 'pi.external-directories', value: { directories: [] } });
  assert.deepEqual(view.externalDirectories, []);
  view.apply({ type: 'doc', kind: 'pi.external-directories', value: { owners: { '1': directories } } });
  assert.equal(view.externalDirectories, undefined, 'raw session owners map must not be accepted');
  for (const value of [null, {}, { directories: [1] }, { directories: [{ label: 'bad', absolutePath: 'relative' }] }, { directories: Array(17).fill(directories[0]) }])
    assert.equal(externalDirectoriesView(value), undefined);
  assert.equal(new TerminalProjection().externalDirectories, undefined, 'a newly selected conversation never inherits the old list');
});
