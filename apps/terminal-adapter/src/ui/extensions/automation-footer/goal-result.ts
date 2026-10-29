import { stripVTControlCharacters } from 'node:util';

/** Display-only Goal entries belong in the transcript, never in the model's user input. */
export function goalEntryText(entry: { kind: unknown; data?: unknown }): string | undefined {
  if (entry.kind !== 'native-goal.result' && entry.kind !== 'native-goal.notice') return;
  if (!entry.data || typeof entry.data !== 'object' || !('text' in entry.data) || typeof entry.data.text !== 'string') return;
  return stripVTControlCharacters(entry.data.text).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/g, '');
}
