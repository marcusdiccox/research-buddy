import { summarize } from '../src/core/research.js';
import { ReminderChannel } from '../src/core/reminder-channel.js';
import { afterEach, expect, it } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BuddyStore } from '../src/core/store.js';
import { exportDossier } from '../src/core/export.js';
const stores: BuddyStore[] = [],
  folders: string[] = [];
const open = (path = ':memory:') => {
  const db = new BuddyStore(path);
  stores.push(db);
  return db;
};
afterEach(() => {
  for (const db of stores.splice(0)) db.close();
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});
function fixture(db: BuddyStore) {
  const project = db.createProject({ name: 'Test notebook' });
  const note = db.saveNote({
    projectId: project.id,
    title: 'Fox research',
    body: 'Cranberries make a useful fictional search word.',
  });
  const reminder = db.saveReminder({
    projectId: project.id,
    title: 'Read chapter',
    dueAt: '2030-12-01T15:00:00Z',
    durationMinutes: 30,
  });
  return {
    project,
    note,
    reminder,
    refs: [
      { kind: 'note' as const, id: note.id },
      { kind: 'reminder' as const, id: reminder.id },
    ],
  };
}
it('groups mixed items without changing research identities, and removing the group ungroups them', () => {
  const db = open(),
    { note, reminder, refs } = fixture(db);
  const group = db.createLibraryGroup('School');
  db.groupItems(refs, group.id);
  expect(db.snapshot().library.items.map((x) => x.groupId)).toEqual([group.id, group.id]);
  expect(db.getNote(note.projectId, note.id).revisionId).toBe(note.revisionId);
  expect(db.getReminder(reminder.id).projectId).toBe(reminder.projectId);
  db.renameLibraryGroup(group.id, 'Reading');
  expect(db.snapshot().library.groups[0].name).toBe('Reading');
  db.removeLibraryGroup(group.id);
  expect(db.snapshot().library.groups).toEqual([]);
  expect(db.snapshot().library.items.every((x) => !x.groupId)).toBe(true);
  expect(db.snapshot().notes).toHaveLength(1);
  expect(db.snapshot().reminders).toHaveLength(1);
});
it('validates a bulk change atomically and rejects invalid groups', () => {
  const db = open(),
    { refs } = fixture(db),
    group = db.createLibraryGroup('Work');
  expect(() => db.groupItems([...refs, { kind: 'note', id: 'missing' }], group.id)).toThrow();
  expect(db.snapshot().library.items).toEqual([]);
  expect(() => db.groupItems(refs, 'missing')).toThrow();
  expect(() => db.trashItems([{ kind: 'project' as any, id: 'bad' }])).toThrow();
  expect(db.snapshot().notes).toHaveLength(1);
  expect(() => db.createLibraryGroup('work')).toThrow(/already/i);
});
it('Trash hides note search and current exports while keeping revision evidence recoverable', () => {
  const db = open(),
    { note, project, refs } = fixture(db);
  db.trashItems([refs[0]]);
  expect(db.snapshot().notes).toEqual([]);
  expect(db.search(project.id, 'Cranberries')).toEqual([]);
  expect(() => db.getNote(project.id, note.id)).toThrow(/Trash/);
  expect(db.getRevision(project.id, note.revisionId).body).toBe(note.body);
  const folder = mkdtempSync(join(tmpdir(), 'pip-library-export-'));
  folders.push(folder);
  const out = exportDossier(db, project.id, folder);
  expect(readdirSync(join(out, 'sources'))).toEqual([]);
  expect(readFileSync(join(out, 'README.md'), 'utf8')).not.toContain(note.title);
  expect(db.snapshot().library.trash.notes[0].id).toBe(note.id);
  db.restoreItems([refs[0]]);
  expect(db.search(project.id, 'Cranberries')[0].id).toBe(note.id);
  expect(db.getNote(project.id, note.id).revisionId).toBe(note.revisionId);
});
it('trashed reminders stop scheduling and stale delivery acknowledgements are harmless', () => {
  const db = open(),
    { reminder, refs } = fixture(db);
  const [alert] = db.takeReminderAlerts('2030-11-30T15:00:00Z');
  db.trashItems([refs[1]]);
  expect(db.snapshot().reminders).toEqual([]);
  expect(db.takeReminderAlerts('2030-12-01T14:00:00Z')).toEqual([]);
  expect(() => db.finishReminderAlert(alert, true)).not.toThrow();
  db.restoreItems([refs[1]]);
  expect(db.getReminder(reminder.id).remindEnabled).toBe(true);
  expect(db.takeReminderAlerts('2030-12-01T14:00:00Z')).toHaveLength(1);
});
it('grouping, Trash and restore persist across restart without duplicating full-text rows', () => {
  const folder = mkdtempSync(join(tmpdir(), 'pip-library-'));
  folders.push(folder);
  const path = join(folder, 'notes.sqlite');
  let db = open(path);
  const { note, refs } = fixture(db),
    group = db.createLibraryGroup('Personal');
  db.groupItems(refs, group.id);
  db.trashItems(refs);
  db.close();
  stores.splice(stores.indexOf(db), 1);
  db = open(path);
  expect(db.snapshot().library.trash.notes).toHaveLength(1);
  expect(db.snapshot().library.trash.reminders).toHaveLength(1);
  db.restoreItems(refs);
  db.restoreItems(refs);
  expect(db.search(note.projectId, 'Cranberries')).toHaveLength(1);
  expect(db.snapshot().library.items.every((x) => x.groupId === group.id && !x.deletedAt)).toBe(
    true,
  );
});

it('keeps saved citation evidence exportable after its current note is trashed', () => {
  const db = open(),
    { note, project, refs } = fixture(db);
  db.saveResult(summarize(note));
  db.saveJournal({
    projectId: project.id,
    thesis: 'Original research',
    counterarguments: 'Open question',
    conditions: 'New evidence',
    evidence: [{ revisionId: note.revisionId, quote: note.body }],
  });
  db.trashItems([refs[0]]);
  const folder = mkdtempSync(join(tmpdir(), 'pip-cited-trash-'));
  folders.push(folder);
  const out = exportDossier(db, project.id, folder);
  const md = readFileSync(join(out, 'README.md'), 'utf8');
  expect(md.split('## Research summaries')[0]).not.toContain(note.title);
  expect(md).toContain(note.body);
  const files = readdirSync(join(out, 'sources'));
  expect(files).toHaveLength(1);
  expect(readFileSync(join(out, 'sources', files[0]), 'utf8')).toContain(note.body);
});
it('discards already queued alerts for Trash and keeps settled checkpoints on restore', () => {
  const db = open(),
    { reminder, refs } = fixture(db),
    channel = new ReminderChannel();
  let shown = 0,
    failed = 0;
  const [alert] = db.takeReminderAlerts('2030-11-30T15:00:00Z');
  channel.enqueue(
    reminder.id,
    () => db.findReminder(reminder.id)?.title ?? null,
    () => {
      shown++;
      db.finishReminderAlert(alert, true);
    },
    () => {
      failed++;
      db.finishReminderAlert(alert, false);
    },
  );
  db.trashItems([refs[1]]);
  channel.tick(0, true, () => {});
  expect(shown).toBe(0);
  expect(failed).toBe(1);
  db.restoreItems([refs[1]]);
  const [fresh] = db.takeReminderAlerts('2030-11-30T15:00:00Z');
  db.finishReminderAlert(fresh, true);
  db.trashItems([refs[1]]);
  db.restoreItems([refs[1]]);
  expect(db.takeReminderAlerts('2030-11-30T15:01:00Z')).toEqual([]);
  db.saveReminder({ ...db.getReminder(reminder.id), remindEnabled: false });
  db.trashItems([refs[1]]);
  db.restoreItems([refs[1]]);
  expect(db.getReminder(reminder.id).remindEnabled).toBe(false);
});
