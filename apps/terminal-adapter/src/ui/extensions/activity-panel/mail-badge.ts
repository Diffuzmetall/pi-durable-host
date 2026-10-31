import { clean } from './activity.ts';
type Theme = { fg(color: 'accent' | 'dim', text: string): string };

/** Session-scoped Mail identity, also in child views; not a child registration receipt. */
export function renderMailLabel(
  name: string | undefined, width: number, theme: Theme,
  truncate: (text: string, width: number) => string,
): string {
  if (!name || width < 12) return '';
  const label = clean(name);
  if (!label) return '';
  const budget = Math.min(24, Math.floor(width / 3));
  return theme.fg('dim', ' ') + theme.fg('accent', truncate(label, budget)) + theme.fg('dim', ' ─');
}
