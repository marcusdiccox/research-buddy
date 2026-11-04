import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BuddyStore } from '../src/core/store';

describe('saved research', () => {
  it('keeps projects and notes after reopening the database', () => {
    const dir = mkdtempSync(join(tmpdir(), 'buddy-'));
    try {
      const db = new BuddyStore(join(dir, 'research.sqlite'));
      const project = db.createProject({ name: 'Aster Devices', ticker: 'AST' });
      const note = db.saveNote({
        projectId: project.id,
        title: 'Demand outlook',
        body: 'Demand rose 12%.\n\nSupply remains constrained.',
      });
      db.close();
      const reopened = new BuddyStore(join(dir, 'research.sqlite'));
      expect(reopened.snapshot().projects[0].name).toBe('Aster Devices');
      expect(reopened.snapshot().notes[0].body).toBe(
        'Demand rose 12%.\n\nSupply remains constrained.',
      );
      expect(reopened.snapshot().notes[0].id).toBe(note.id);
      reopened.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it('preserves old evidence when a note changes and keeps search inside its project', () => {
    const db = new BuddyStore(':memory:');
    const a = db.createProject({ name: 'Aster' });
    const b = db.createProject({ name: 'Birch' });
    const note = db.saveNote({ projectId: a.id, title: 'Report', body: 'Revenue grew 12%.' });
    db.saveNote({ projectId: b.id, title: 'Private report', body: 'Revenue fell 8%.' });
    const updated = db.saveNote({
      id: note.id,
      projectId: a.id,
      title: 'Report',
      body: 'Revenue grew 15%.',
    });
    expect(updated.id).toBe(note.id);
    expect(updated.revisionId).not.toBe(note.revisionId);
    expect(db.getRevision(a.id, note.revisionId).body).toBe('Revenue grew 12%.');
    expect(db.search(a.id, 'revenue')).toHaveLength(1);
    expect(db.search(a.id, 'revenue')[0].body).toContain('15%');
    expect(() => db.getRevision(b.id, note.revisionId)).toThrow();
    expect(db.search(a.id, '" OR * --')).toEqual([]);
    db.close();
  });
  it('rejects invalid notes without partial writes and deduplicates imports', () => {
    const db = new BuddyStore(':memory:');
    const p = db.createProject({ name: 'Notes' });
    expect(() => db.saveNote({ projectId: p.id, title: 'Empty', body: ' ' })).toThrow();
    expect(() =>
      db.saveNote({ projectId: p.id, title: 'Huge', body: 'x'.repeat(100001) }),
    ).toThrow();
    expect(() =>
      db.saveNote({ projectId: 'missing', title: 'No project', body: 'Hello' }),
    ).toThrow();
    expect(db.snapshot().notes).toEqual([]);
    const a = db.saveNote({ projectId: p.id, title: 'One', body: 'Same note' });
    const b = db.saveNote({ projectId: p.id, title: 'Two', body: 'Same note' });
    expect(a.id).toBe(b.id);
    expect(db.snapshot().notes).toHaveLength(1);
    db.close();
  });
});

describe('reminders and journal', () => {
  it('notifies once, supports snooze, and keeps a reminder until completion', () => {
    const db = new BuddyStore(':memory:');
    const r = db.saveReminder({
      title: 'Review earnings',
      dueAt: '2026-11-03T14:00:00.000Z',
      durationMinutes: 30,
    });
    expect(db.takeDueReminders('2026-11-03T13:59:59.000Z')).toEqual([]);
    expect(db.takeDueReminders('2026-11-03T14:00:00.000Z').map((x) => x.id)).toEqual([r.id]);
    expect(db.takeDueReminders('2026-11-03T14:01:00.000Z')).toEqual([]);
    expect(db.snapshot().reminders[0].completed).toBe(false);
    db.snoozeReminder(r.id, '2026-11-03T14:15:00.000Z');
    expect(db.takeDueReminders('2026-11-03T14:15:00.000Z')).toHaveLength(1);
    db.completeReminder(r.id, true);
    expect(db.snapshot().reminders[0].completed).toBe(true);
    db.close();
  });
  it('validates dates and restores overdue reminders after restart', () => {
    const db = new BuddyStore(':memory:');
    expect(() =>
      db.saveReminder({ title: 'Bad date', dueAt: 'not-a-date', durationMinutes: 30 }),
    ).toThrow();
    const r = db.saveReminder({
      title: 'Follow up',
      dueAt: '2026-11-02T14:00:00Z',
      durationMinutes: 30,
    });
    expect(db.takeDueReminders('2026-11-03T14:00:00Z')[0].id).toBe(r.id);
    db.close();
  });
  it('keeps thesis revision history and rejects cross-project evidence', () => {
    const db = new BuddyStore(':memory:');
    const a = db.createProject({ name: 'A' }),
      b = db.createProject({ name: 'B' });
    const n = db.saveNote({ projectId: b.id, title: 'B', body: 'Other project' });
    expect(() =>
      db.saveJournal({
        projectId: a.id,
        thesis: 'Test',
        counterarguments: '',
        conditions: '',
        evidence: [{ revisionId: n.revisionId, quote: 'Other' }],
      }),
    ).toThrow();
    const j = db.saveJournal({
      projectId: a.id,
      thesis: 'First thought',
      counterarguments: 'Uncertain',
      conditions: 'Demand drops',
      evidence: [],
    });
    db.saveJournal({ ...j, thesis: 'Second thought' });
    expect(db.snapshot().journal).toHaveLength(2);
    expect(db.snapshot().journal.map((x) => x.thesis)).toContain('First thought');
    db.close();
  });
});
