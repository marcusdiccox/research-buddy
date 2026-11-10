import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BuddyStore } from '../src/core/store';
import { backupNotebook } from '../src/core/backups';

let dir: string, path: string, db: BuddyStore, projectId: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pip-backups-'));
  path = join(dir, 'research.sqlite');
  db = new BuddyStore(path);
  projectId = db.createProject({ name: 'Class notes' }).id;
  db.saveNote({ projectId, title: 'Remember this', body: 'A notebook worth protecting.' });
});
afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});
const date = (day: number) => new Date(`2026-11-${String(day).padStart(2, '0')}T12:00:00Z`);
const managedFiles = () =>
  readdirSync(join(dir, 'backups'), { withFileTypes: true })
    .filter(
      (entry) => entry.isFile() && /^pip-notebook-\d{4}-\d{2}-\d{2}\.sqlite$/.test(entry.name),
    )
    .map((entry) => entry.name);

describe('automatic local notebook backups', () => {
  it('creates a standalone, readable snapshot including live WAL writes and search', () => {
    db.saveReminder({ title: 'Hand in notes', dueAt: '2026-11-20T16:00:00Z', durationMinutes: 30 });
    db.saveSettings({ petAppearance: 'arctic' });
    const result = backupNotebook(path, date(9));
    expect(result.status).toBe('created');
    if (result.status !== 'created') throw new Error('Expected a new backup');
    const snapshot = new DatabaseSync(result.path, { readOnly: true });
    try {
      const note = snapshot.prepare("SELECT value FROM records WHERE kind='note'").get()!;
      expect(JSON.parse(note.value as string).body).toBe('A notebook worth protecting.');
      expect(
        snapshot.prepare("SELECT title FROM note_search WHERE note_search MATCH 'protecting'").get()
          ?.title,
      ).toBe('Remember this');
      expect(
        snapshot.prepare("SELECT count(*) AS n FROM records WHERE kind='reminder'").get()?.n,
      ).toBe(1);
      const settings = snapshot.prepare("SELECT value FROM records WHERE kind='settings'").get()!;
      expect(JSON.parse(settings.value as string).petAppearance).toBe('arctic');
      expect(snapshot.prepare('PRAGMA quick_check').get()?.quick_check).toBe('ok');
    } finally {
      snapshot.close();
    }
    db.saveNote({ projectId, title: 'After backup', body: 'The live notebook is still writable.' });
    expect(db.snapshot().notes).toHaveLength(2);
    expect(managedFiles()).toHaveLength(1);
  });

  it('keeps the first snapshot unchanged during repeated same-day checks', () => {
    const first = backupNotebook(path, date(9));
    if (first.status !== 'created') throw new Error('Expected a new backup');
    const bytes = readFileSync(first.path);
    db.saveNote({ projectId, title: 'Later', body: 'This belongs in the next daily snapshot.' });
    expect(backupNotebook(path, new Date('2026-11-09T23:59:59Z')).status).toBe('skipped');
    expect(readFileSync(first.path)).toEqual(bytes);
    expect(managedFiles()).toHaveLength(1);
    expect(backupNotebook(path, new Date('2026-11-10T00:00:00Z')).status).toBe('created');
    expect(managedFiles()).toHaveLength(2);
  });

  it('retains seven daily snapshots without removing unrelated files or directories', () => {
    mkdirSync(join(dir, 'backups'));
    writeFileSync(join(dir, 'backups', 'personal.sqlite'), 'not owned by Pip');
    mkdirSync(join(dir, 'backups', 'pip-notebook-2026-01-01.sqlite'));
    for (let day = 1; day <= 9; day++)
      expect(backupNotebook(path, date(day)).status).toBe('created');
    expect(managedFiles().sort()).toEqual([
      'pip-notebook-2026-11-03.sqlite',
      'pip-notebook-2026-11-04.sqlite',
      'pip-notebook-2026-11-05.sqlite',
      'pip-notebook-2026-11-06.sqlite',
      'pip-notebook-2026-11-07.sqlite',
      'pip-notebook-2026-11-08.sqlite',
      'pip-notebook-2026-11-09.sqlite',
    ]);
    expect(readdirSync(join(dir, 'backups'))).toContain('pip-notebook-2026-01-01.sqlite');
    expect(readFileSync(join(dir, 'backups', 'personal.sqlite'), 'utf8')).toBe('not owned by Pip');
  });

  it('retains the newly created snapshot even if the clock moves backwards', () => {
    for (let day = 10; day <= 16; day++) backupNotebook(path, date(day));
    expect(backupNotebook(path, date(1)).status).toBe('created');
    expect(managedFiles()).toContain('pip-notebook-2026-11-01.sqlite');
    expect(managedFiles()).toHaveLength(7);
  });

  it('reports unavailable storage without breaking the live notebook', () => {
    writeFileSync(join(dir, 'backups'), 'a file blocks the backup directory');
    expect(backupNotebook(path, date(9)).status).toBe('failed');
    expect(db.snapshot().notes[0].body).toBe('A notebook worth protecting.');
    db.saveNote({
      projectId,
      title: 'Still saving',
      body: 'A failed backup must not prevent saving.',
    });
    expect(db.snapshot().notes).toHaveLength(2);
  });

  it('never rotates existing snapshots when a new snapshot fails', () => {
    for (let day = 1; day <= 7; day++) backupNotebook(path, date(day));
    const before = managedFiles().sort();
    const corrupt = join(dir, 'broken.sqlite');
    writeFileSync(corrupt, 'not a SQLite database');
    expect(backupNotebook(corrupt, date(8)).status).toBe('failed');
    expect(managedFiles().sort()).toEqual(before);
    expect(readdirSync(join(dir, 'backups')).filter((name) => name.endsWith('.tmp'))).toEqual([]);
  });

  it('does not create a blank notebook if the source database is missing', () => {
    expect(backupNotebook(join(dir, 'missing.sqlite'), date(9)).status).toBe('failed');
    expect(readdirSync(dir)).not.toContain('missing.sqlite');
  });
});
