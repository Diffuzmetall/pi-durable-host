import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Private presentation checkpoint, never a submission or an execution queue.
 * The caller supplies the existing host/grant/session-partitioned client cache.
 */
export class EditorDrafts {
  constructor(private readonly directory: string) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
  }

  private path(conversationId: number): string {
    if (!Number.isSafeInteger(conversationId) || conversationId <= 0) throw Error('Invalid draft conversation');
    return join(this.directory, `editor-${conversationId}.draft`);
  }

  read(conversationId: number): string {
    try { return readFileSync(this.path(conversationId), 'utf8'); }
    catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return '';
      throw error; // Do not overwrite an unreadable draft with an empty one.
    }
  }

  write(conversationId: number, text: string): void {
    const path = this.path(conversationId);
    const temporary = `${path}.${process.pid}.tmp`;
    // Atomic replace preserves the last complete checkpoint if the renderer is interrupted.
    writeFileSync(temporary, text, { mode: 0o600 });
    renameSync(temporary, path);
  }
}
