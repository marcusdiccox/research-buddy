import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { lstatSync, mkdirSync, readdirSync, renameSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';

export type BackupResult =
  { status: 'created' | 'skipped'; path: string } | { status: 'failed'; message: string };

export function backupNotebook(databasePath: string, now = new Date()): BackupResult {
  let temporary: string | undefined;
  try {
    const day = now.toISOString().slice(0, 10);
    if (!lstatSync(databasePath).isFile()) throw new Error('Notebook database is unavailable.');
    const directory = join(dirname(databasePath), 'backups');
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const name = `pip-notebook-${day}.sqlite`;
    const destination = join(directory, name);
    const existing = lstatSync(destination, { throwIfNoEntry: false });
    if (existing) {
      if (!existing.isFile()) throw new Error('The daily backup location is already occupied.');
      return { status: 'skipped', path: destination };
    }

    temporary = join(directory, `.${name}-${randomUUID()}.tmp`);
    const source = new DatabaseSync(databasePath, { readOnly: true });
    try {
      // SQLite includes committed WAL content; copying the live .sqlite file does not.
      source.prepare('VACUUM INTO ?').run(temporary);
    } finally {
      source.close();
    }
    const snapshot = new DatabaseSync(temporary, { readOnly: true });
    try {
      if (snapshot.prepare('PRAGMA quick_check').get()?.quick_check !== 'ok')
        throw new Error('The notebook backup did not pass its integrity check.');
    } finally {
      snapshot.close();
    }
    renameSync(temporary, destination);
    temporary = undefined;

    // Rotate only after a complete, verified snapshot is safely published.
    // Always retain this snapshot, including when the computer's clock moves back.
    const older = readdirSync(directory, { withFileTypes: true })
      .filter(
        (entry) =>
          entry.isFile() &&
          /^pip-notebook-\d{4}-\d{2}-\d{2}\.sqlite$/.test(entry.name) &&
          entry.name !== name,
      )
      .map((entry) => entry.name)
      .sort()
      .reverse();
    for (const expired of older.slice(6)) unlinkSync(join(directory, expired));
    return { status: 'created', path: destination };
  } catch (error) {
    return { status: 'failed', message: error instanceof Error ? error.message : String(error) };
  } finally {
    if (temporary) {
      try {
        unlinkSync(temporary);
      } catch {
        /* Failed snapshots never enter retention. */
      }
    }
  }
}
