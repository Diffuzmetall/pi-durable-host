import { truncateToWidth, visibleWidth } from '@earendil-works/pi-tui';
import type { ExternalDirectory } from '../../../external-directories.js';
import { clean } from '../../extensions/activity-panel/activity.js';

type DirectoryTheme = { fg(color: 'muted' | 'text' | 'dim', text: string): string };

/** One dock row above the editor, matching pi-add-dir's status widget. */
export function renderExternalDirectories(directories: readonly ExternalDirectory[] | undefined, width: number, theme: DirectoryTheme): string[] {
  if (!directories?.length || width < 1) return [];
  const count = `📂 ${directories.length} external dir${directories.length === 1 ? '' : 's'}`;
  const separator = theme.fg('dim', ' │ ');
  const hint = theme.fg('dim', ' (/dirs to manage)');
  const prefix = theme.fg('muted', count);
  if (visibleWidth(prefix + separator + hint) + 1 > width) return [truncateToWidth(prefix, width, '…')];
  const namesWidth = width - visibleWidth(prefix + separator + hint);
  const names = directories.map(directory => clean(directory.label)).join(', ');
  return [prefix + separator + theme.fg('text', truncateToWidth(names, namesWidth, '…')) + hint];
}
